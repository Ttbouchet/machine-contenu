"""Socle commun : chemins, heure de Dubai, journal, secrets."""
import datetime as dt
import json
import os
import tempfile

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DONNEES = os.path.join(RACINE, "donnees")
TRAVAIL = os.environ.get("DOSSIER_TRAVAIL") or os.path.join(tempfile.gettempdir(), "machine-travail")
SIMULATION = os.environ.get("SIMULATION") == "1"
DUBAI = dt.timezone(dt.timedelta(hours=4))

# Reglages techniques (ce que vous reglez vous-meme est dans le panneau de pilotage)
TECH = {
    "modele_image": "nano-banana-2-1",
    "resolution_image": "2K",
    "seuil_visage": 0.38,
    "essais_auto_image": 2,
    "refus_max_par_video": 3,
    "essais_video": 2,
    "jours_sans_repetition": 14,
    "minutes_max_par_passage": 14,
    "derniere_heure_de_validation": 11,
    "prix_credit_usd": 0.005,
}


def maintenant():
    """Heure de Dubai. HEURE_FORCEE=AAAA-MM-JJTHH:MM simule une heure (tests)."""
    f = os.environ.get("HEURE_FORCEE")
    if f:
        return dt.datetime.fromisoformat(f).replace(tzinfo=DUBAI)
    return dt.datetime.now(DUBAI)


def jour():
    return maintenant().date().isoformat()


def heure():
    n = maintenant()
    return n.hour + n.minute / 60


def horodatage():
    return maintenant().isoformat(timespec="minutes")


def log(msg):
    print(f"[{maintenant():%H:%M:%S}] {msg}", flush=True)


def donnee(nom):
    with open(os.path.join(DONNEES, nom), encoding="utf-8") as f:
        return json.load(f)


def dossier_travail(*parts):
    p = os.path.join(TRAVAIL, *parts)
    os.makedirs(p, exist_ok=True)
    return p


def lien_studio():
    """Lien vers l'appli Studio, ajoute en bas des e-mails (variable STUDIO_URL)."""
    u = os.environ.get("STUDIO_URL", "").strip()
    return f"\n\nOuvrir Studio : {u}" if u else ""


def secret(nom, obligatoire=True):
    v = os.environ.get(nom, "").strip()
    if not v and obligatoire and not SIMULATION:
        raise RuntimeError(f"Secret manquant : {nom} (à ajouter dans GitHub > Settings > Secrets)")
    return v
