"""Calendrier de tests : chaque jour teste UNE variable (variante A ou B) sur les videos du projet.

Reglage dans Studio (projet["calendrier"]) :
  {"actif": true, "debut": "2026-11-24", "tests": [{"id", "nom", "jours": 2, "A": {...}, "B": {...} | null}],
   "gagnants": {"langue": "B", ...}}
Les parametres possibles d'une variante : langue (en/fr), ennemi (turnitin, prof, chatgpt, deadline...),
heure (heure de publication conseillee, Paris), demo (« actuelle »), format (classique, ecran_partage...).
Melange dans la journee : A-B-A le 1er jour du test, B-A-B le 2e (meme nombre de A et de B sur le test).
Le gagnant confirme d'un test devient la base des tests suivants."""
import datetime as dt
import re
import unicodedata

BASE = {"langue": "en", "heure": "19:00", "demo": "actuelle", "format": "classique"}

CALENDRIER_DEFAUT = {
    "actif": True, "debut": "2026-11-24", "gagnants": {},
    "tests": [
        {"id": "reference", "nom": "Référence", "jours": 2, "A": {}, "B": None},
        {"id": "langue", "nom": "Langue", "jours": 2, "A": {"langue": "en"}, "B": {"langue": "fr"}},
        {"id": "ennemi", "nom": "Ennemi du hook", "jours": 2, "A": {"ennemi": "turnitin"}, "B": {"ennemi": "prof"}},
        {"id": "heure", "nom": "Heure de publication", "jours": 2, "A": {"heure": "19:00"}, "B": {"heure": "22:00"}},
        {"id": "demo", "nom": "Démo", "jours": 2, "A": {"demo": "actuelle"}, "B": {"format": "ecran_partage"}},
    ],
}

ENNEMIS = {  # mots qui reperent l'ennemi d'un hook quand Studio ne l'a pas precise
    "turnitin": ("turnitin", "compilatio"),  # Compilatio = le Turnitin des facs francaises
    "prof": ("prof", "professor", "teacher", "ta ", "lecturer", "enseignant", "maitresse", "maitre de conf"),
    "chatgpt": ("chatgpt", "chat gpt", "gpt"),
    "detecteur": ("detector", "gptzero", "zerogpt", "detecteur", "flagged", "flag"),
    "deadline": ("deadline", "due ", "due at", "2am", "3am", "a rendre", "rendu"),
}


def _plat(t):
    return unicodedata.normalize("NFKD", str(t or "")).encode("ascii", "ignore").decode().lower()


def ennemi_du_hook(h):
    if h.get("ennemi"):
        return h["ennemi"]
    t = " " + _plat(h.get("texte")) + " "
    for e, mots in ENNEMIS.items():
        if any(re.search(r"(?<![a-z])" + re.escape(m.strip()) + r"(?![a-z])", t) for m in mots):
            return e
    return ""


def langue_du_hook(h):
    return h.get("langue") or "en"


def position(cal, jour):
    """(index du test, numero du jour dans le test, numero J global) pour la date `jour` (AAAA-MM-JJ), sinon None."""
    if not cal or not cal.get("actif") or not cal.get("debut"):
        return None
    try:
        ecart = (dt.date.fromisoformat(jour) - dt.date.fromisoformat(cal["debut"])).days
    except ValueError:
        return None
    if ecart < 0:
        return None
    cumul = 0
    for i, t in enumerate(cal.get("tests") or []):
        n = max(1, int(t.get("jours") or 2))
        if ecart < cumul + n:
            return i, ecart - cumul + 1, ecart + 1
        cumul += n
    return None


def base_du_test(cal, i):
    """Base = reglages de depart + gagnants confirmes des tests precedents."""
    b = dict(BASE)
    for t in (cal.get("tests") or [])[:i]:
        g = (cal.get("gagnants") or {}).get(t["id"])
        if g in ("A", "B") and t.get(g):
            b.update(t[g])
    return b


def plan_du_jour(cal, jour, nb):
    """Une consigne par video du jour : {test, test_nom, j, variante, langue, ennemi, heure, demo, format}.
    Liste vide si aucun test ce jour-la (la machine travaille alors comme avant)."""
    pos = position(cal, jour)
    if not pos or nb <= 0:
        return []
    i, n, j = pos
    t = cal["tests"][i]
    base = base_du_test(cal, i)
    ordre = "AB" if n % 2 == 1 else "BA"
    plan = []
    for k in range(nb):
        v = ordre[k % 2] if t.get("B") else None
        p = {**base, **(t.get(v or "A") or {})}
        plan.append({"test": t["id"], "test_nom": t.get("nom") or t["id"], "j": j, "variante": v,
                     "langue": p.get("langue", "en"), "ennemi": p.get("ennemi", ""), "heure": p.get("heure", "19:00"),
                     "demo": p.get("demo", "actuelle"), "format": p.get("format", "classique")})
    return plan


def prefixe(s):
    """Debut du nom de fichier dans le Drive : J3-B-FR-pub19h_"""
    if not s.get("test"):
        return ""
    h = str(s.get("heure_pub") or "19:00").replace(":00", "h").replace(":", "h")
    return f"J{s['test_j']}-{s.get('variante') or 'REF'}-{(s.get('langue') or 'en').upper()}-pub{h}_"
