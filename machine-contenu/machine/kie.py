"""Client KIE.ai : envoi de fichiers, images, videos, vision (Gemini), credits.
En SIMULATION, aucune requete n'est envoyee : des fichiers locaux jouent le role des resultats."""
import base64
import glob
import json
import os
import shutil
import time

import requests

from .base import SIMULATION, log, secret

API = os.environ.get("KIE_API_BASE", "https://api.kie.ai")
UPLOAD = "https://kieai.redpandaai.co/api/file-base64-upload"
VISION = API + "/api/v1/gemini-2.5-flash/v1/chat/completions"

# Parametres confirmes dans docs.kie.ai et testes le 2026-11-20 (banc d'essai). Video 9:16, 720p, muette si possible.
MODELES_VIDEO = {
    "kling": lambda p, u: ("kling-3.0/video", {"prompt": p, "image_urls": [u], "sound": False, "duration": "5",
                                              "mode": "std", "multi_shots": False, "aspect_ratio": "9:16"}),
    "veo_fast": lambda p, u: ("veo-3-1", {"prompt": p, "model": "veo3_fast", "image_urls": [u],
                                         "generation_type": "FIRST_AND_LAST_FRAMES_2_VIDEO", "aspect_ratio": "9:16",
                                         "resolution": "720p", "duration": 6}),
    "seedance": lambda p, u: ("bytedance/seedance-2", {"prompt": p, "first_frame_url": u, "resolution": "720p",
                                                       "duration": 5, "aspect_ratio": "9:16", "generate_audio": False}),
    "grok": lambda p, u: ("grok-imagine-video-1-5-preview", {"prompt": "@image1 " + p, "image_urls": [u], "duration": 5,
                                                             "resolution": "720p", "aspect_ratio": "9:16",
                                                             "enable_audio": False}),
}

class Kie:
    def __init__(self):
        self.h = {"Authorization": f"Bearer {secret('KIE_API_KEY')}"}

    # ---------- bas niveau ----------
    def _data(self, r):
        try:
            b = r.json()
        except Exception:
            raise RuntimeError(f"KIE reponse illisible ({r.status_code}) : {r.text[:200]}")
        if b.get("code") != 200:
            raise RuntimeError(f"KIE {b.get('code')} : {b.get('msg')}")
        return b.get("data")

    def credits(self):
        if SIMULATION:
            return 50000.0
        try:
            return float(self._data(requests.get(API + "/api/v1/chat/credit", headers=self.h, timeout=30)))
        except Exception as e:
            log(f"credits illisibles : {e}")
            return None

    def envoyer(self, chemin):
        """Met un fichier en ligne chez KIE et renvoie son URL publique."""
        if SIMULATION:
            return "simu://" + os.path.abspath(chemin)
        ext = os.path.splitext(chemin)[1].lower().strip(".")
        mime = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "webp": "image/webp"}.get(ext, "image/png")
        b64 = base64.b64encode(open(chemin, "rb").read()).decode()
        d = self._data(requests.post(UPLOAD, headers=self.h, timeout=180, json={
            "base64Data": f"data:{mime};base64,{b64}", "uploadPath": "rewordy",
            "fileName": f"{int(time.time() * 1000)}_{os.path.basename(chemin)}"}))
        return d.get("downloadUrl") or d.get("fileUrl")

    # ---------- taches ----------
    def lancer_image(self, modele, prompt, refs, resolution):
        if SIMULATION:
            return "img-" + str(time.time_ns())
        return self._data(requests.post(API + "/api/v1/jobs/createTask", headers=self.h, timeout=60, json={
            "model": modele, "input": {"prompt": prompt, "image_input": refs, "aspect_ratio": "9:16",
                                       "resolution": resolution, "output_format": "png"}}))["taskId"]

    def lancer_video(self, nom, prompt, url_image):
        if SIMULATION:
            return "vid-" + str(time.time_ns())
        m, e = MODELES_VIDEO.get(nom, MODELES_VIDEO["kling"])(prompt, url_image)
        return self._data(requests.post(API + "/api/v1/jobs/createTask", headers=self.h, timeout=60,
                                        json={"model": m, "input": e}))["taskId"]

    def etat(self, tid):
        """('attente'|'ok'|'echec', urls_ou_message, credits_consommes)"""
        if SIMULATION:
            return simu_etat(tid)
        d = self._data(requests.get(API + "/api/v1/jobs/recordInfo", headers=self.h,
                                    params={"taskId": tid}, timeout=60))
        if d.get("state") == "success":
            return "ok", json.loads(d.get("resultJson") or "{}").get("resultUrls", []), d.get("creditsConsumed")
        if d.get("state") == "fail":
            return "echec", d.get("failMsg") or d.get("failCode") or "echec", None
        return "attente", None, None

    # ---------- vision ----------
    def vision(self, consigne, urls_images):
        """Pose une question a Gemini 2.5 Flash sur une ou plusieurs images. Renvoie le JSON de la reponse."""
        if SIMULATION:
            return simu_vision(consigne)
        contenu = [{"type": "text", "text": consigne}]
        contenu += [{"type": "image_url", "image_url": {"url": u}} for u in urls_images]
        r = requests.post(VISION, headers={**self.h, "Content-Type": "application/json"}, timeout=120, json={
            "messages": [{"role": "user", "content": contenu}], "stream": False, "include_thoughts": False})
        try:
            b = r.json()
            texte = b["choices"][0]["message"]["content"]
        except Exception:
            raise RuntimeError(f"vision illisible ({r.status_code}) : {r.text[:300]}")
        if isinstance(texte, list):
            texte = "".join(x.get("text", "") for x in texte if isinstance(x, dict))
        return extraire_json(texte)


def extraire_json(texte):
    t = texte.strip()
    if "```" in t:
        t = t.split("```")[1]
        t = t[4:] if t.startswith("json") else t
    debut, fin = t.find("{"), t.rfind("}")
    return json.loads(t[debut:fin + 1])


def telecharger(url, chemin):
    os.makedirs(os.path.dirname(chemin), exist_ok=True)
    if url.startswith("simu://"):
        shutil.copy(url[7:], chemin)
        return chemin
    for essai in range(3):
        try:
            r = requests.get(url, timeout=300)
            r.raise_for_status()
            with open(chemin, "wb") as f:
                f.write(r.content)
            return chemin
        except Exception:
            if essai == 2:
                raise
            time.sleep(5)


# ============================== SIMULATION ==============================
# SIMU_MEDIAS : dossier avec des images (*.png/*.jpg) et des videos (*.mp4) qui jouent les resultats.
# SIMU_SCENARIO : liste de mots separes par des virgules pour provoquer des echecs (ex. "vision_ko_1").

_simu_compteur = {"img": 0, "vid": 0, "vision": 0}


def simu_etat(tid):
    d = os.environ.get("SIMU_MEDIAS", "")
    if tid.startswith("img"):
        imgs = sorted(glob.glob(os.path.join(d, "*.png")) + glob.glob(os.path.join(d, "*.jpg")))
        _simu_compteur["img"] += 1
        return "ok", ["simu://" + imgs[_simu_compteur["img"] % len(imgs)]], 6
    vids = sorted(glob.glob(os.path.join(d, "*.mp4")))
    _simu_compteur["vid"] += 1
    return "ok", ["simu://" + vids[_simu_compteur["vid"] % len(vids)]], 80


def simu_vision(consigne):
    _simu_compteur["vision"] += 1
    scen = os.environ.get("SIMU_SCENARIO", "")
    if "TRADUIS" in consigne:
        return {"consigne_prompt": "Do not do this: simulated rule.", "question_controle": "Is the simulated rule respected?",
                "anglais": "simulated English text"}
    if "permanent physical identity" in consigne:
        return {"identite": "the exact same person as in the reference photos, instantly recognizable: simulated identity"}
    ko = f"vision_ko_{_simu_compteur['vision']}" in scen
    return {"ok": not ko, "controles": [{"id": 1, "ok": not ko, "note": "simulation"}],
            "probleme": "she holds the phone with both hands (simulated)" if ko else ""}
