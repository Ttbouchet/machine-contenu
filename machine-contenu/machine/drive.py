"""Lien avec Google Drive, via le script Google (drive_script.gs) qui tourne sur VOTRE compte.
Le Drive est la memoire partagee : l'appli Studio y ecrit vos reglages et vos decisions, la machine y ecrit son etat,
les photos des personnages et les videos finies.
En SIMULATION, un dossier local joue le role du Drive."""
import base64
import glob
import json
import os
import shutil
import time

import requests

from .base import SIMULATION, TRAVAIL, secret


def _appel(action, **kw):
    if SIMULATION:
        return _simu(action, **kw)
    url, cle = secret("DRIVE_SCRIPT_URL"), secret("DRIVE_SCRIPT_SECRET")
    derniere = None
    for essai in range(3):
        try:
            r = requests.post(url, timeout=300, json={"secret": cle, "action": action, **kw})
            b = r.json()
            if b.get("ok"):
                return b
            raise RuntimeError(b.get("erreur") or "refus du script Drive")
        except Exception as e:
            derniere = e
            time.sleep(3 * (essai + 1))
    raise RuntimeError(f"Drive ({action}) : {derniere}")


def config():
    """Les reglages enregistres dans Studio (dict), ou None s'il n'y en a pas encore."""
    c = _appel("config").get("contenu")
    return json.loads(c) if c else None


def etat_lire():
    return json.loads(_appel("etat_lire").get("contenu") or "{}")


def etat_ecrire(etat):
    _appel("etat_ecrire", contenu=json.dumps(etat, ensure_ascii=False))


def resultats_lire():
    """Fiches des videos + chiffres TikTok (resultats.json)."""
    return json.loads(_appel("resultats_lire").get("contenu") or "{}")


def resultats_ecrire(res):
    _appel("resultats_ecrire", contenu=json.dumps(res, ensure_ascii=False))


def decisions_lire():
    """Decisions prises dans Studio (validations, refus + motif, regles a oublier), pas encore traitees."""
    return _appel("decisions_lire").get("decisions") or []


def decisions_purger(ids):
    _appel("decisions_purger", ids=list(ids))


def notifier(sujet, texte):
    """E-mail aux personnes autorisees dans le script Google."""
    _appel("notifier", sujet=sujet, texte=texte)


def deposer(chemin_local, zone, sous_dossiers, nom=None, mime="video/mp4"):
    data = base64.b64encode(open(chemin_local, "rb").read()).decode()
    return _appel("deposer", zone=zone, chemin=sous_dossiers, nom=nom or os.path.basename(chemin_local),
                  mime=mime, data=data)["url"]


def lister(sous_dossiers):
    return _appel("lister", chemin=sous_dossiers)["fichiers"]


def lire(fid, destination):
    b = _appel("lire", id=fid)
    os.makedirs(os.path.dirname(destination), exist_ok=True)
    with open(destination, "wb") as f:
        f.write(base64.b64decode(b["data"]))
    return destination


# ============================== SIMULATION ==============================
def _racine(zone="machine"):
    d = os.path.join(TRAVAIL, "drive_simu", zone)
    os.makedirs(d, exist_ok=True)
    return d


def _simu(action, **kw):
    m = _racine()
    if action == "config":
        fs = sorted(glob.glob(os.path.join(m, "reglages", "*.json")), key=os.path.getmtime)  # le plus recent, comme le Drive
        return {"contenu": open(fs[-1], encoding="utf-8").read() if fs else None}
    if action == "etat_lire":
        p = os.path.join(m, "etat.json")
        return {"contenu": open(p, encoding="utf-8").read() if os.path.exists(p) else "{}"}
    if action == "etat_ecrire":
        open(os.path.join(m, "etat.json"), "w", encoding="utf-8").write(kw["contenu"])
        return {}
    if action in ("resultats_lire", "resultats_ecrire"):
        p = os.path.join(m, "resultats.json")
        if action == "resultats_ecrire":
            open(p, "w", encoding="utf-8").write(kw["contenu"])
            return {}
        return {"contenu": open(p, encoding="utf-8").read() if os.path.exists(p) else "{}"}
    if action == "deposer":
        d = os.path.join(_racine(kw["zone"]), *kw["chemin"])
        os.makedirs(d, exist_ok=True)
        p = os.path.join(d, kw["nom"])
        open(p, "wb").write(base64.b64decode(kw["data"]))
        return {"url": "simu-drive://" + p}
    if action == "lister":
        d = os.path.join(m, *kw["chemin"])
        return {"fichiers": [{"id": os.path.join(d, n), "nom": n} for n in sorted(os.listdir(d))] if os.path.isdir(d) else []}
    if action == "lire":
        return {"data": base64.b64encode(open(kw["id"], "rb").read()).decode()}
    if action == "decisions_lire":
        p = os.path.join(m, "decisions.json")
        return {"decisions": json.load(open(p, encoding="utf-8")) if os.path.exists(p) else []}
    if action == "decisions_purger":
        p = os.path.join(m, "decisions.json")
        reste = [d for d in (json.load(open(p, encoding="utf-8")) if os.path.exists(p) else []) if d["id"] not in kw["ids"]]
        json.dump(reste, open(p, "w", encoding="utf-8"), ensure_ascii=False)
        return {"reste": len(reste)}
    if action == "notifier":
        with open(os.path.join(TRAVAIL, "emails_simu.log"), "a", encoding="utf-8") as f:
            f.write(f"--- {kw['sujet']}\n{kw['texte']}\n")
        return {}
    raise RuntimeError(action)


def simu_preparer(config_dict, refs_par_personnage):
    """Tests : met une configuration et des photos de reference dans le faux Drive."""
    m = _racine()
    os.makedirs(os.path.join(m, "reglages"), exist_ok=True)
    json.dump(config_dict, open(os.path.join(m, "reglages", "config-00001.json"), "w"), ensure_ascii=False)
    for pid, fichiers in refs_par_personnage.items():
        d = os.path.join(m, "personnages", pid)
        os.makedirs(d, exist_ok=True)
        for f in fichiers:
            shutil.copy(f, d)
