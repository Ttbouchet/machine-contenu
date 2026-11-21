"""Banc d'essai des modeles video KIE : meme image de depart, plusieurs modeles, fiche comparative.

  python banc-essai/banc.py image     -> genere l'image de depart (≈ 6 credits), controle du visage, puis STOP
                                         (Medhi regarde l'image avant de payer les videos)
  python banc-essai/banc.py videos    -> lance les modeles video sur l'image validee, suit, telecharge,
                                         controle le visage, monte chaque video, ecrit la fiche
Etat et resultats : banc-essai/resultats/<date>/
"""
import datetime as dt
import json
import os
import sys
import time

ICI = os.path.dirname(os.path.abspath(__file__))
RACINE = os.path.dirname(ICI)
sys.path.insert(0, os.path.join(RACINE, "machine-contenu"))
os.environ["PATH"] = os.path.join(RACINE, ".venv", "bin") + os.pathsep + os.environ["PATH"]
for ligne in open(os.path.join(RACINE, ".env")):
    if "=" in ligne and not ligne.startswith("#"):
        k, v = ligne.strip().split("=", 1)
        os.environ.setdefault(k, v)

import requests  # noqa: E402
from machine import scenarios  # noqa: E402
from machine.controles import Visage, extraire_images  # noqa: E402
from machine.kie import API, Kie, telecharger  # noqa: E402
from machine.montage import monter  # noqa: E402

REFS = os.path.join(RACINE, "personnages", "brune", "refs")
DOSSIER = os.path.join(ICI, "resultats", dt.date.today().isoformat())
ETAT = os.path.join(DOSSIER, "etat.json")

IDENTITE = ("the same woman as in the reference photos: about 28 years old, medium-length brown hair (same cut), "
            "thick dark eyebrows, blue-grey eyes, a small mole under her left eye, light freckles, small gold stud earrings")
COMBO = {"decor": "cuisine_soir", "tenue": "hoodie_gris", "coiffure": "arriere", "cadrage": "contre_plongee", "reaction": "relit"}
TEXTE_HOOK = "turnitin said 82% AI on my essay i wrote myself 😭"

# Parametres confirmes dans docs.kie.ai le 2026-11-20. Video 9:16, 720p, sans son quand c'est possible.
MODELES = {
    "kling3_std": lambda p, u: {"model": "kling-3.0/video", "input": {
        "prompt": p, "image_urls": [u], "sound": False, "duration": "5", "mode": "std", "multi_shots": False,
        "aspect_ratio": "9:16"}},
    "veo31_fast": lambda p, u: {"model": "veo-3-1", "input": {
        "prompt": p, "model": "veo3_fast", "image_urls": [u], "generation_type": "FIRST_AND_LAST_FRAMES_2_VIDEO",
        "aspect_ratio": "9:16", "resolution": "720p", "duration": 6}},
    "seedance2": lambda p, u: {"model": "bytedance/seedance-2", "input": {
        "prompt": p, "first_frame_url": u, "resolution": "720p", "duration": 5, "aspect_ratio": "9:16",
        "generate_audio": False}},
    "grok15": lambda p, u: {"model": "grok-imagine-video-1-5-preview", "input": {
        "prompt": "@image1 " + p, "image_urls": [u], "duration": 5, "resolution": "720p", "aspect_ratio": "9:16",
        "enable_audio": False}},
}


def lire_etat():
    return json.load(open(ETAT)) if os.path.exists(ETAT) else {}


def ecrire_etat(e):
    os.makedirs(DOSSIER, exist_ok=True)
    json.dump(e, open(ETAT, "w"), indent=2, ensure_ascii=False)


def suivre(kie, tid, max_min=20):
    """Attend la fin d'une tache. Renvoie (ok, urls, credits, infos)."""
    fin = time.time() + max_min * 60
    while time.time() < fin:
        d = kie._data(requests.get(API + "/api/v1/jobs/recordInfo", headers=kie.h, params={"taskId": tid}, timeout=60))
        if d.get("state") in ("success", "fail"):
            urls = (json.loads(d.get("resultJson") or "{}") or {}).get("resultUrls") or []
            return d["state"] == "success", urls, d.get("creditsConsumed"), {
                "duree_s": round((d.get("costTime") or 0) / 1000, 1), "erreur": d.get("failMsg")}
        time.sleep(15)
    return False, [], None, {"erreur": "trop long"}


def image():
    kie, e = Kie(), lire_etat()
    avant = kie.credits()
    perso = {"identite": IDENTITE, "genre": "femme"}
    prompt = scenarios.prompt_image(COMBO, perso)
    refs = [kie.envoyer(os.path.join(REFS, n)) for n in sorted(os.listdir(REFS))
            if n.lower().endswith((".png", ".jpg", ".jpeg", ".webp"))]
    tid = kie.lancer_image("nano-banana-2-1", prompt, refs, "2K")
    print("image lancée, attente…")
    ok, urls, credits, infos = suivre(kie, tid)
    if not ok:
        sys.exit(f"échec image : {infos}")
    chemin = telecharger(urls[0], os.path.join(DOSSIER, "image_depart.png"))
    score = Visage(REFS).score(chemin)
    e["image"] = {"url": urls[0], "fichier": chemin, "prompt": prompt, "credits": credits, "visage": round(score, 3),
                  "solde_avant": avant}
    ecrire_etat(e)
    print(f"image : {chemin}\nressemblance : {score:.2f} (seuil 0,38)  crédits : {credits}")


def videos(seulement=None):
    kie, e = Kie(), lire_etat()
    if "image" not in e:
        sys.exit("lancez d'abord : banc.py image")
    url = e["image"]["url"]
    prompt = scenarios.prompt_video(COMBO, {"genre": "femme"})
    e.setdefault("videos", {})
    for nom, corps in MODELES.items():
        if (seulement and nom not in seulement) or e["videos"].get(nom, {}).get("tache"):
            continue
        try:
            tid = kie._data(requests.post(API + "/api/v1/jobs/createTask", headers=kie.h, timeout=60,
                                          json=corps(prompt, url)))["taskId"]
            e["videos"][nom] = {"tache": tid, "lance": time.time()}
            print(f"{nom} : lancé")
        except Exception as ex:
            e["videos"][nom] = {"erreur_lancement": str(ex)}
            print(f"{nom} : refusé ({ex})")
        ecrire_etat(e)
    visage = Visage(REFS)
    for nom, v in e["videos"].items():
        if not v.get("tache") or "credits" in v:
            continue
        ok, urls, credits, infos = suivre(kie, v["tache"])
        v.update(credits=credits, **infos)
        if ok and urls:
            d = os.path.join(DOSSIER, nom)
            os.makedirs(d, exist_ok=True)
            brute = telecharger(urls[0], os.path.join(d, "hook.mp4"))
            scores = [visage.score(i) for i in extraire_images(brute, d)]
            v.update(fichier=brute, visage_min=round(min(scores), 3), visage_moy=round(sum(scores) / len(scores), 3))
            v["montee"] = monter(brute, TEXTE_HOOK, os.path.join(DOSSIER, f"final_{nom}.mp4"),
                                 os.path.join(RACINE, "machine-contenu", "medias", "corps_demo.mp4"))
        print(f"{nom} : {'ok' if ok else 'échec'} · {credits} crédits · {infos}")
        ecrire_etat(e)
    e["solde_apres"] = kie.credits()
    ecrire_etat(e)


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "image":
        image()
    elif cmd == "videos":
        videos(sys.argv[2:] or None)
    else:
        sys.exit(__doc__)
