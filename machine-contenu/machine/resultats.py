"""Resultats : la fiche d'ingredients de chaque video + ses chiffres TikTok, dans resultats.json (Drive).

- A chaque livraison, la machine ecrit la FICHE de la video (hook, ton, decor, reaction, modele, duree...).
- Une fois par jour (ou sur demande dans Studio), elle releve les chiffres TikTok de toutes les publications et
  RELIE chaque publication a sa fiche, sans saisie : par le texte du hook lu sur la miniature (Gemini), sinon par
  la duree exacte. En cas de doute, Studio propose les fiches possibles et on choisit en un clic.
- Studio calcule les classements (quel hook, quelle reaction, quel modele... marche le mieux)."""
import datetime as dt
import difflib
import re
import unicodedata

from . import drive, tiktok
from .base import DUBAI, horodatage, log

VIDE = {"fiches": {}, "videos": {}, "tiktok": {}}
INGREDIENTS = ("projet", "personnage", "hook", "texte", "ton", "decor", "tenue", "coiffure", "cadrage", "reaction", "demo")
GARDER = ("create_time", "caption", "thumbnail_url", "share_url", "video_duration", "video_views", "reach", "likes",
          "comments", "shares", "favorites", "full_video_watched_rate", "average_time_watched", "total_time_watched",
          "new_followers", "profile_views", "audience_countries", "impression_sources", "audience_types",
          "video_view_retention", "is_ai_generated")
LIRE_TEXTE = ("This is the cover of a TikTok video. Copy EXACTLY the caption text written on top of the image "
              "(white text boxes), without emojis. If there is no text, return an empty string. "
              'Answer ONLY with JSON: {"texte": "..."}')


def normaliser(t):
    t = unicodedata.normalize("NFKD", str(t or "")).encode("ascii", "ignore").decode().lower()
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9%' ]+", " ", t)).strip()


def ressemblance(a, b):
    a, b = normaliser(a), normaliser(b)
    if not a or not b:
        return 0.0
    if a in b or b in a:
        return min(1.0, 0.75 + 0.25 * min(len(a), len(b)) / max(len(a), len(b)))
    return difflib.SequenceMatcher(None, a, b).ratio()


def fiche_depuis_slot(jour, s, projet, duree=None):
    hook = next((h for h in (projet or {}).get("hooks", []) if h.get("id") == s.get("hook")), {})
    f = {k: s.get(k) for k in INGREDIENTS}
    f.update(id=f"{jour}_{s['id']}", jour=jour, slot=s["id"], ton=hook.get("ton") or s.get("ton"),
             modele_video=(projet or {}).get("modele_video", "kling"), format=s.get("format") or "classique",
             livre_a=s.get("livre_a"), credits=round(s.get("credits", 0), 1), drive_url=s.get("drive_url"),
             valide_par=s.get("valide_par"), duree=round(duree, 3) if duree else None)
    return f


def _quand(v):
    try:
        return dt.datetime.fromtimestamp(int(v.get("create_time")), DUBAI)
    except Exception:
        return None


def relier(res, kie, hooks_projets):
    """Relie chaque publication TikTok a une fiche. Ne touche jamais une liaison faite a la main."""
    prises = {v.get("fiche"): iid for iid, v in res["videos"].items() if v.get("fiche") and v.get("liaison") == "manuel"}
    for iid, v in sorted(res["videos"].items(), key=lambda x: str(x[1].get("create_time"))):
        if v.get("liaison") == "manuel":
            continue
        if "texte_lu" not in v and v.get("thumbnail_url"):
            try:
                v["texte_lu"] = (kie.vision(LIRE_TEXTE, [v["thumbnail_url"]]) or {}).get("texte", "")
            except Exception as e:
                log(f"lecture de la miniature {iid} impossible : {e}")
        texte = " ".join(x for x in (v.get("texte_lu"), v.get("caption")) if x)
        publie = _quand(v)
        candidats = []
        for f in res["fiches"].values():
            if prises.get(f["id"]) not in (None, iid):
                continue
            if publie and f.get("livre_a"):
                livre = dt.datetime.fromisoformat(f["livre_a"])
                if livre.tzinfo is None:
                    livre = livre.replace(tzinfo=DUBAI)
                if not (livre - dt.timedelta(hours=1) <= publie <= livre + dt.timedelta(days=21)):
                    continue
            sim = ressemblance(texte, f.get("texte"))
            duree_ok = bool(f.get("duree") and v.get("video_duration")
                            and abs(float(f["duree"]) - float(v["video_duration"])) <= 0.35)
            candidats.append((sim + (0.2 if duree_ok else 0), sim, duree_ok, f["id"]))
        candidats.sort(reverse=True)
        bons = [c for c in candidats if c[1] >= 0.6]
        choix, mode = None, "aucune"
        if bons and (len(bons) == 1 or bons[0][0] - bons[1][0] >= 0.15):
            choix, mode = bons[0][3], "auto_texte"
        elif not bons and sum(c[2] for c in candidats) == 1:
            choix, mode = next(c[3] for c in candidats if c[2]), "auto_duree"
        elif bons or sum(c[2] for c in candidats) > 1:
            mode = "doute"
        possibles = [c[3] for c in (bons or [c for c in candidats if c[2]])[:4]]
        v.update(fiche=choix, liaison=mode, possibles=possibles if mode == "doute" else [])
        if choix:
            prises[choix] = iid
        # Videos d'avant la machine : on retrouve au moins le hook dans la liste des textes du projet
        if not choix:
            meilleur = max(((ressemblance(texte, h["texte"]), h, p) for p, hs in hooks_projets.items() for h in hs),
                           default=(0, None, None), key=lambda x: x[0])
            v["hook_reconnu"] = ({"projet": meilleur[2], "hook": meilleur[1]["id"], "texte": meilleur[1]["texte"],
                                  "ton": meilleur[1].get("ton")} if meilleur[0] >= 0.6 else None)
    return res


def releve(res, kie, cfg):
    """Met a jour les chiffres TikTok puis les liaisons. Renvoie un court resume pour le journal."""
    try:
        liste = tiktok.videos()
    except tiktok.PasConnecte as e:
        res["tiktok"] = {"etat": "non_connecte", "message": str(e), "essai": horodatage()}
        return "TikTok non connecté : rien à relever"
    except Exception as e:
        res["tiktok"] = {**res.get("tiktok", {}), "etat": "erreur", "message": str(e)[:300], "essai": horodatage()}
        raise
    for x in liste:
        iid = str(x.get("item_id"))
        if not iid or (x.get("media_type") and x["media_type"] != "VIDEO"):
            continue
        v = res["videos"].setdefault(iid, {"item_id": iid})
        v.update({k: x[k] for k in GARDER if k in x})
        v["releve"] = horodatage()
    hooks = {p["id"]: [h for h in p.get("hooks", []) if h.get("texte")] for p in cfg.get("projets", [])}
    relier(res, kie, hooks)
    lies = sum(1 for v in res["videos"].values() if v.get("fiche"))
    doute = sum(1 for v in res["videos"].values() if v.get("liaison") == "doute")
    res["tiktok"] = {"etat": "connecte", "releve": horodatage(), "nb": len(liste), "message": ""}
    return f"TikTok : {len(liste)} vidéos relevées, {lies} reliées à leur fiche" + (f", {doute} à confirmer" if doute else "")


def lire():
    return {**{k: dict(v) for k, v in VIDE.items()}, **drive.resultats_lire()}


def ecrire(res):
    res["maj"] = horodatage()
    drive.resultats_ecrire(res)
