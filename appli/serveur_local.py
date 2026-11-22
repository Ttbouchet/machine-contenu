#!/usr/bin/env python3
"""Serveur de test local de Studio : sert l'appli et imite le script Google avec le faux Drive de simulation.

  python appli/serveur_local.py            -> http://localhost:8765/appli/
Aucun compte, aucun credit : tout se passe dans le dossier de simulation de la machine.
"""
import json
import os
import sys
import uuid
from datetime import datetime
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

ICI = os.path.dirname(os.path.abspath(__file__))
RACINE = os.path.dirname(ICI)
os.environ.setdefault("SIMULATION", "1")
sys.path.insert(0, os.path.join(RACINE, "machine-contenu"))
from machine import drive  # noqa: E402
from machine.base import TRAVAIL  # noqa: E402

PORT = int(os.environ.get("PORT", 8765))


def lire_json(nom, defaut):
    p = os.path.join(drive._racine(), nom)
    try:
        return json.load(open(p, encoding="utf-8"))
    except Exception:
        return defaut


def ecrire_json(nom, valeur):
    json.dump(valeur, open(os.path.join(drive._racine(), nom), "w", encoding="utf-8"), ensure_ascii=False, indent=1)


def action(d):
    a = d.get("action")
    if a == "app_charger":
        return {"config": drive.config(), "etat": drive.etat_lire(), "decisions": lire_json("decisions.json", []),
                "resultats": lire_json("resultats.json", {}), "tiktok": lire_json("tiktok_simu.json", {
                    "appli_prete": True, "connecte": False, "url_autorisation": "http://localhost:%d/appli/tiktok/?auth_code=simu" % PORT})}
    if a == "app_tiktok_code":
        statut = {"appli_prete": True, "connecte": True, "url_autorisation": "", "connecte_le": datetime.now().isoformat(timespec="seconds") + " par test local"}
        ecrire_json("tiktok_simu.json", statut)
        return {"tiktok": statut}
    if a == "app_config_ecrire":
        actuel = drive.config() or {}
        if int(d["config"].get("version") or 0) != int(actuel.get("version") or 0):
            raise RuntimeError("les réglages ont été modifiés ailleurs entre-temps : rechargez la page")
        nouveau = {**d["config"], "version": int(actuel.get("version") or 0) + 1,
                   "maj": datetime.now().isoformat(timespec="seconds"), "maj_par": "test local"}
        dossier = os.path.join(drive._racine(), "reglages")
        os.makedirs(dossier, exist_ok=True)
        json.dump(nouveau, open(os.path.join(dossier, f"config-{nouveau['version']:05d}.json"), "w", encoding="utf-8"),
                  ensure_ascii=False, indent=1)
        return {"config": nouveau}
    if a == "app_decider":
        liste = lire_json("decisions.json", [])
        dec = {**d["decision"], "id": str(uuid.uuid4()), "qui": "test local", "quand": datetime.now().isoformat(timespec="seconds")}
        liste.append(dec)
        ecrire_json("decisions.json", liste)
        return {"decision": dec}
    if a == "app_lister":
        return {"fichiers": drive.lister(d.get("chemin") or [])}
    raise RuntimeError("action inconnue : " + str(a))


class Gestion(SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=RACINE, **k)

    def log_message(self, fmt, *args):
        if "/api" in (args[0] if args else ""):
            sys.stderr.write("[api] " + (fmt % args) + "\n")

    def do_GET(self):
        u = urlparse(self.path)
        if u.path == "/":
            self.send_response(302)
            self.send_header("Location", "/appli/")
            return self.end_headers()
        if u.path == "/simu":
            f = os.path.realpath(parse_qs(u.query).get("f", [""])[0])
            permis = [os.path.realpath(TRAVAIL), os.path.realpath(RACINE)]
            if not any(f.startswith(p + os.sep) for p in permis) or not os.path.isfile(f):
                return self.send_error(404)
            self.send_response(200)
            self.send_header("Content-Type", self.guess_type(f))
            self.end_headers()
            with open(f, "rb") as fh:
                self.wfile.write(fh.read())
            return
        return super().do_GET()

    def do_POST(self):
        if urlparse(self.path).path != "/api":
            return self.send_error(404)
        try:
            d = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
            rep = {"ok": True, "qui": "test local", **action(d)}
        except Exception as e:
            rep = {"ok": False, "erreur": str(e)}
        corps = json.dumps(rep, ensure_ascii=False).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(corps)))
        self.end_headers()
        self.wfile.write(corps)


if __name__ == "__main__":
    print(f"Studio (test local) : http://localhost:{PORT}/appli/   — faux Drive : {drive._racine()}")
    ThreadingHTTPServer(("127.0.0.1", PORT), Gestion).serve_forever()
