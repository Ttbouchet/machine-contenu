#!/usr/bin/env python3
"""Prepare un faux Drive pour tester Studio + la machine sans compte ni credit.

  python appli/preparer_simulation.py        (efface le faux Drive precedent)
Puis :
  SIMULATION=1 SIMU_MEDIAS=<dossier> python -m machine matin    (lance depuis machine-contenu/)
  python appli/serveur_local.py                                 -> http://localhost:8765/appli/
"""
import glob
import os
import shutil
import sys

ICI = os.path.dirname(os.path.abspath(__file__))
RACINE = os.path.dirname(ICI)
os.environ["SIMULATION"] = "1"
sys.path.insert(0, os.path.join(RACINE, "machine-contenu"))
from machine import drive  # noqa: E402
from machine.base import TRAVAIL  # noqa: E402

MEDIAS = os.path.join(TRAVAIL, "simu_medias")

HOOKS = [
    ("turnitin said 82% AI on my essay i wrote myself 😭", "choc"),
    ("umm chat my prof just said 'if I think it's ChatGPT, it's a zero' 🤨", "blase"),
    ("essay due at 11:59. it's 11:42. watch 👇", "complice"),
    ("my professor runs every essay through an AI detector. so here's what I do", "complice"),
    ("POV: it's 2am and your essay is 82% AI", "choc"),
]

CONFIG = {
    "version": 1,
    "general": {"pause": False, "budget_credits_jour": 1600, "heure_limite_validation": 8, "alerte_si_credits_sous": 3000},
    "projets": [{
        "id": "rewordyai", "nom": "RewordyAI", "actif": True, "videos_par_jour": 3, "jours": [1, 2, 3, 4, 5, 6, 7],
        "modele_video": "kling", "demo": "defaut", "formats": ["resultat_dabord", "ecran_partage", "score_descend"],
        "personnages": {"brune": 100}, "contraintes": "Jamais le mot beautiful.",
        "hooks": [{"id": f"h{i}", "texte": t, "ton": ton, "lieux": []} for i, (t, ton) in enumerate(HOOKS, 1)],
    }],
    "personnages": [{
        "id": "brune", "nom": "La brune", "genre": "femme", "statut": "actif",
        "description": "Femme ~28 ans, cheveux bruns mi-longs, sourcils épais, yeux bleu-gris, grain de beauté sous l'œil gauche.",
        "identite": "the same woman as in the reference photos", "notes": "",
    }],
}

if __name__ == "__main__":
    shutil.rmtree(os.path.join(TRAVAIL, "drive_simu"), ignore_errors=True)
    shutil.rmtree(MEDIAS, ignore_errors=True)
    os.makedirs(MEDIAS)
    banc = os.path.join(RACINE, "banc-essai", "resultats")
    for i, f in enumerate(sorted(glob.glob(os.path.join(banc, "*", "image_depart*.png")))):
        shutil.copy(f, os.path.join(MEDIAS, f"image{i}.png"))
    for i, f in enumerate(sorted(glob.glob(os.path.join(banc, "*", "*", "hook.mp4")))):
        shutil.copy(f, os.path.join(MEDIAS, f"hook{i}.mp4"))
    refs = sorted(glob.glob(os.path.join(RACINE, "personnages", "brune", "refs", "*")))
    drive.simu_preparer(CONFIG, {"brune": refs})
    print(f"Faux Drive prêt : {drive._racine()}\nMédias de simulation : {MEDIAS}")
