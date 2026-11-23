"""Veille hebdomadaire (partie 1) : recolte + tri + lecture des videos qui marchent EN CE MOMENT sur TikTok.

Cadre : docs/CADRE_veille.md. Chaque dimanche a partir de 4 h (Dubai), ou sur demande dans Studio :
  1. RECOLTE (Apify, offre gratuite) : recherche par mots-cles etudiants + comptes a surveiller.
     Lancee en arriere-plan : un passage la demarre, un passage suivant (<= 1 h) recupere les videos.
  2. TRI (gratuit) : videos recentes qui font beaucoup plus de vues que la taille du compte -> ~30 meilleures.
  3. LECTURE (KIE / Gemini, ~0,2 credit par video) : texte du hook a l'ecran, format, ennemi, emotion, structure.
  4. RAPPORT dans resultats.json (cle "veille") -> page Veille de Studio. Partie 2 (ecriture + juge) plus tard.

Garde-fous : plafond de depense Apify par recolte (maxTotalChargeUsd) + verification du solde gratuit du mois
avant de lancer ; alerte e-mail si l'offre gratuite est presque consommee.
En SIMULATION, SIMU_APIFY = fichier JSON (liste de videos au format Apify) joue le role d'Apify."""
import datetime as dt
import json
import os

import requests

from .base import SIMULATION, donnee, dossier_travail, horodatage, log, maintenant, secret
from .kie import telecharger

APIFY = "https://api.apify.com/v2"
ACTEUR = "clockworks~tiktok-scraper"
PLAFOND_RECOLTE_USD = 1.2       # une recolte ne peut jamais couter plus (Apify coupe)
OFFRE_GRATUITE_USD = 5.0        # credit offert chaque mois par Apify
JOURS_MAX = 14                  # on ne garde que les videos de moins de 14 jours
VUES_MIN = 30000
NB_GARDEES = 30
SEMAINES_GARDEES = 8

LIRE = """You analyse a viral TikTok video (its cover image is attached) to learn what makes it work.
Caption: {caption}
Stats: {vues} views, {likes} likes, {partages} shares, author has {abonnes} followers, duration {duree} s.

Answer ONLY with JSON:
{{"hook_texte": "the hook text written ON the cover image, copied exactly (empty string if none)",
  "langue": "en | fr | other",
  "format": "one of: reaction muette, face camera parle, ecran partage, demo ecran, slideshow, sketch, voix off, autre",
  "ennemi": "who or what is the enemy in the hook (teacher, Turnitin, deadline, ChatGPT, parents...) or empty",
  "emotion": "one or two words in French (peur, soulagement, colere, curiosite, humour...)",
  "structure": "in French, max 15 words: how the video is built (ex: probleme -> astuce -> preuve)",
  "pourquoi": "in French, max 20 words: why it gets so many views",
  "idee_rewordy": "in French, max 25 words: how a student AI-influencer could reuse this for an AI humanizer / AI detector app"}}"""


def reglages(cfg):
    """Mots-cles et comptes a surveiller : ceux de Studio (cfg["veille"]) sinon ceux par defaut."""
    defaut = donnee("veille.json")
    v = {**defaut, **((cfg or {}).get("veille") or {})}
    return v


def semaine(quand=None):
    a, s, _ = (quand or maintenant()).isocalendar()
    return f"{a}-S{s:02d}"


def due(etat, res):
    """Vrai si la veille de la semaine doit partir : dimanche >= 4 h, ou rattrapage plus tard dans la semaine."""
    if os.environ.get("VEILLE_FORCEE") == "1":
        return True
    n = maintenant()
    s = semaine(n)
    if s in ((res.get("veille") or {}).get("semaines") or {}):
        return False
    en_cours = (etat.get("veille") or {}).get("en_cours")
    if en_cours and en_cours.get("semaine") == s:
        return False
    # dimanche = 7 en ISO ; la semaine ISO va du lundi au dimanche -> on fait la veille le dimanche de la semaine.
    return n.isoweekday() == 7 and n.hour >= 4


# ------------------------------------------------------------------ Apify
def _h():
    return {"Authorization": f"Bearer {secret('APIFY_TOKEN')}"}


def solde_du_mois():
    """(depense du mois en $, plafond du mois en $) chez Apify."""
    if SIMULATION:
        return 0.0, OFFRE_GRATUITE_USD
    d = requests.get(f"{APIFY}/users/me/limits", headers=_h(), timeout=30).json().get("data") or {}
    cur = (d.get("current") or {}).get("monthlyUsageUsd") or 0.0
    lim = (d.get("limits") or {}).get("maxMonthlyUsageUsd") or OFFRE_GRATUITE_USD
    return float(cur), float(lim)


def entree_apify(v):
    return {
        "searchQueries": v["mots_cles"],
        "profiles": [p.lstrip("@") for p in v.get("comptes", [])],
        "resultsPerPage": int(v.get("videos_par_recherche", 20)),
        "profileSorting": "latest",
        "excludePinnedPosts": True,
        "proxyCountryCode": v.get("pays_proxy", "US"),
        "shouldDownloadVideos": False,
        "shouldDownloadCovers": False,
        "shouldDownloadSlideshowImages": False,
        "shouldDownloadAvatars": False,
        "shouldDownloadMusicCovers": False,
        "downloadSubtitlesOptions": "NEVER_DOWNLOAD_SUBTITLES",
    }


def demarrer(v):
    """Lance la recolte chez Apify (en arriere-plan). Renvoie l'identifiant de la recolte."""
    if SIMULATION:
        return {"run": "simu", "dataset": "simu"}
    r = requests.post(f"{APIFY}/acts/{ACTEUR}/runs", headers=_h(), timeout=60, json=entree_apify(v),
                      params={"maxTotalChargeUsd": PLAFOND_RECOLTE_USD})
    d = r.json().get("data")
    if not d:
        raise RuntimeError(f"Apify : {r.text[:300]}")
    return {"run": d["id"], "dataset": d["defaultDatasetId"]}


def avancement(run):
    """(statut, cout $) : statut = RUNNING / SUCCEEDED / FAILED / ABORTED / TIMED-OUT."""
    if SIMULATION:
        return "SUCCEEDED", 0.0
    d = requests.get(f"{APIFY}/actor-runs/{run}", headers=_h(), timeout=30).json().get("data") or {}
    return d.get("status", "?"), float(d.get("usageTotalUsd") or 0)


def videos_recoltees(dataset):
    if SIMULATION:
        return json.load(open(os.environ["SIMU_APIFY"], encoding="utf-8"))
    r = requests.get(f"{APIFY}/datasets/{dataset}/items", headers=_h(), timeout=120,
                     params={"clean": "true", "format": "json"})
    return r.json()


# ------------------------------------------------------------------ tri
def simplifier(it):
    auteur = it.get("authorMeta") or {}
    meta = it.get("videoMeta") or {}
    return {
        "id": str(it.get("id") or ""),
        "url": it.get("webVideoUrl") or "",
        "compte": auteur.get("name") or it.get("authorMeta.name") or "",
        "abonnes": int(auteur.get("fans") or 0),
        "caption": (it.get("text") or "")[:400],
        "vues": int(it.get("playCount") or 0),
        "likes": int(it.get("diggCount") or 0),
        "partages": int(it.get("shareCount") or 0),
        "commentaires": int(it.get("commentCount") or 0),
        "favoris": int(it.get("collectCount") or 0),
        "duree": meta.get("duration") or it.get("videoMeta.duration"),
        "couverture": meta.get("coverUrl") or meta.get("originalCoverUrl") or "",
        "publie": it.get("createTimeISO") or "",
        "langue": it.get("textLanguage") or "",
        "recherche": it.get("searchQuery") or "",
        "pub": bool(it.get("isAd") or it.get("isSponsored")),
    }


def score(v):
    """Vues rapportees a la taille du compte : le FORMAT a marche, pas la celebrite."""
    return v["vues"] / max(v["abonnes"], 2000)


def trier(items, deja_vues=()):
    limite = maintenant() - dt.timedelta(days=JOURS_MAX)
    vus, gardees = set(deja_vues), []
    for it in items:
        if not isinstance(it, dict) or it.get("error"):
            continue
        v = simplifier(it)
        if not v["id"] or v["id"] in vus or v["pub"] or v["vues"] < VUES_MIN:
            continue
        try:
            if dt.datetime.fromisoformat(v["publie"].replace("Z", "+00:00")) < limite:
                continue
        except Exception:
            continue
        vus.add(v["id"])
        v["score"] = round(score(v), 1)
        gardees.append(v)
    gardees.sort(key=lambda v: (v["score"], v["vues"]), reverse=True)
    return gardees[:NB_GARDEES]


# ------------------------------------------------------------------ lecture
def lire(kie, v):
    if not v.get("couverture"):
        return {}
    chemin = os.path.join(dossier_travail("veille"), f"{v['id']}.jpg")
    if SIMULATION:
        return {"hook_texte": "(simulation)", "format": "reaction muette", "ennemi": "prof", "emotion": "peur",
                "structure": "probleme -> astuce", "pourquoi": "simulation", "idee_rewordy": "simulation", "langue": "en"}
    telecharger(v["couverture"], chemin)
    url = kie.envoyer(chemin)
    return kie.vision(LIRE.format(caption=v["caption"] or "(none)", vues=v["vues"], likes=v["likes"],
                                  partages=v["partages"], abonnes=v["abonnes"], duree=v["duree"]), [url])


# ------------------------------------------------------------------ le passage
def avancer(m):
    """Appele a chaque passage « suivi » (m = la Machine). Ne bloque jamais la production."""
    if not secret("APIFY_TOKEN", obligatoire=False) and not SIMULATION:
        return
    ev = m.etat.setdefault("veille", {})
    res = m.res
    if m._res_ko:
        return
    rv = res.setdefault("veille", {"semaines": {}})
    rv.setdefault("semaines", {})
    demandee = getattr(m, "_veille_demandee", False)
    en_cours = ev.get("en_cours")

    if not en_cours and (demandee or due(m.etat, res)):
        v = reglages(m.cfg)
        try:
            depense, plafond = solde_du_mois()
        except Exception as e:
            m.noter(f"veille : solde Apify illisible ({e})")
            return
        if depense + PLAFOND_RECOLTE_USD > plafond:
            m.alerte(f"Veille de la semaine non lancée : l'offre gratuite Apify est presque épuisée "
                     f"({depense:.2f} $ / {plafond:.2f} $ ce mois-ci). Elle repartira le mois prochain.",
                     "Studio : veille en pause")
            ev["en_cours"] = None
            rv["semaines"][semaine()] = {"date": horodatage(), "erreur": "offre gratuite Apify épuisée", "videos": []}
            return
        try:
            ev["en_cours"] = {**demarrer(v), "semaine": semaine(), "depart": horodatage(), "manuel": demandee}
            m._veille_demandee = False
            m.noter(f"veille : récolte lancée ({len(v['mots_cles'])} recherches, {len(v.get('comptes', []))} comptes)",
                    "veille : récolte lancée")
        except Exception as e:
            m.noter(f"veille : impossible de lancer la récolte ({e})", "veille : récolte impossible")
        return

    if not en_cours:
        return
    statut, cout = avancement(en_cours["run"])
    if statut in ("RUNNING", "READY"):
        depuis = dt.datetime.fromisoformat(en_cours["depart"])
        if maintenant() - depuis > dt.timedelta(hours=6):
            m.noter("veille : la récolte Apify dure depuis plus de 6 h, abandonnée", "veille : abandon")
            ev["en_cours"] = None
        return
    ev["en_cours"] = None
    s = en_cours["semaine"]
    if statut != "SUCCEEDED" and statut != "ABORTED":
        rv["semaines"][s] = {"date": horodatage(), "erreur": f"récolte Apify : {statut}", "videos": [], "cout_usd": cout}
        m.alerte(f"Veille {s} : la récolte Apify a échoué ({statut}).", "Studio : veille en échec")
        return
    # ABORTED = plafond de depense atteint : on garde ce qui a ete recolte.
    items = videos_recoltees(en_cours["dataset"])
    deja = {x["id"] for w in rv["semaines"].values() for x in w.get("videos", [])}
    top = trier(items, deja)
    lues = 0
    for v in top:
        try:
            v["lecture"] = lire(m.kie, v)
            lues += 1
        except Exception as e:
            v["lecture"] = {"erreur": str(e)[:120]}
    for v in top:
        v.pop("couverture", None)  # lien TikTok temporaire : inutile de le garder
    rv["semaines"][s] = {"date": horodatage(), "recoltees": len(items), "videos": top, "cout_usd": round(cout, 3),
                         "lues": lues, "manuel": en_cours.get("manuel", False)}
    for vieille in sorted(rv["semaines"])[:-SEMAINES_GARDEES]:
        del rv["semaines"][vieille]
    try:
        depense, plafond = solde_du_mois()
        rv["apify"] = {"depense_mois": round(depense, 2), "plafond": plafond, "releve": horodatage()}
        alerte = depense > 0.8 * plafond
    except Exception:
        alerte = False
    m.noter(f"veille {s} : {len(items)} vidéos récoltées, {len(top)} gardées, {lues} lues ({cout:.2f} $ Apify)",
            f"veille {s} : terminée")
    texte = (f"Veille {s} prête dans Studio (page Veille) : {len(top)} vidéos qui marchent en ce moment, "
             f"sur {len(items)} récoltées. Coût Apify : {cout:.2f} $.")
    if alerte:
        texte += f"\n⚠️ Offre gratuite Apify presque consommée : {depense:.2f} $ / {plafond:.2f} $ ce mois-ci."
    m.alerte(texte, "Studio : veille de la semaine")
