"""Controles automatiques : ressemblance du visage (OpenCV, gratuit) + relecture par une IA de vision (Gemini via KIE)."""
import re
import os
import subprocess

from .base import RACINE, log

ZOO = "https://media.githubusercontent.com/media/opencv/opencv_zoo/main/models/"
MODELES = {"face_detection_yunet_2023mar.onnx": "face_detection_yunet/",
           "face_recognition_sface_2021dec.onnx": "face_recognition_sface/"}


def modeles_presents(dossier):
    """Telecharge les modeles de reconnaissance faciale s'ils manquent (gratuits, OpenCV)."""
    import requests
    os.makedirs(dossier, exist_ok=True)
    for nom, sous in MODELES.items():
        c = os.path.join(dossier, nom)
        if not os.path.exists(c) or os.path.getsize(c) < 100000:
            log(f"telechargement du modele {nom}")
            r = requests.get(ZOO + sous + nom, timeout=300)
            r.raise_for_status()
            open(c, "wb").write(r.content)

REGLES_IMAGE = [
    "It looks like a genuine front-camera selfie taken by the person themself (or while walking), not a photo taken by someone else.",
    "The person is NOT holding a phone or any object with both hands. At most one arm extends toward the camera.",
    "Hands and fingers, if visible, are anatomically correct (five fingers, no fused, extra or missing fingers).",
    "There is no floating or physically impossible object (for example a cable or earbud hanging in the air).",
    "There is no readable text, logo, caption or watermark anywhere in the image.",
    "It looks like an ordinary unedited phone photo, not a professional, staged or glossy shoot.",
    "There is only one person clearly in focus, and their face is fully visible.",
]

REGLES_VIDEO = [
    "It is the same person in every frame (same face, hair, outfit and place); their face does not morph.",
    "In every frame the person holds the phone with at most ONE hand; she never holds it with both hands.",
    "Hands and fingers look anatomically correct in every frame.",
    "There is no subtitle, caption, text, logo or watermark in any frame.",
    "There is no second phone or impossible object appearing in their hands.",
]


def _consigne(regles, plusieurs=False):
    lignes = "\n".join(f"{i}. {r}" for i, r in enumerate(regles, 1))
    sujet = "These images are frames taken from the same short video, in order." if plusieurs else "Look at this image."
    return (f"{sujet} Check each rule strictly. Be severe: if a rule is doubtful, mark it false.\n{lignes}\n"
            'Answer ONLY with JSON: {"controles":[{"id":1,"ok":true,"note":"short"}...],'
            '"ok":true_if_all_rules_ok,"probleme":"if not ok, one short English sentence describing what is wrong"}')


class Visage:
    def __init__(self, dossier_refs):
        import cv2
        self.cv2 = cv2
        m = os.path.join(RACINE, "modeles")
        modeles_presents(m)
        self.det = cv2.FaceDetectorYN.create(os.path.join(m, "face_detection_yunet_2023mar.onnx"), "", (320, 320), 0.8)
        self.rec = cv2.FaceRecognizerSF.create(os.path.join(m, "face_recognition_sface_2021dec.onnx"), "")
        d = dossier_refs
        self.refs = [e for e in (self.empreinte(cv2.imread(os.path.join(d, n))) for n in sorted(os.listdir(d))) if e is not None]
        if not self.refs:
            raise RuntimeError(f"aucun visage trouvé dans les photos de référence ({d})")

    def empreinte(self, img):
        if img is None:
            return None
        # Plusieurs tailles : le detecteur rate les visages tres proches (selfie serre) en grande resolution.
        for taille in (1600, 900, 600, 400):
            h, w = img.shape[:2]
            k = min(1.0, taille / max(h, w))
            im = self.cv2.resize(img, (int(w * k), int(h * k))) if k < 1 else img
            self.det.setInputSize((im.shape[1], im.shape[0]))
            _, faces = self.det.detect(im)
            if faces is not None:
                f = max(faces, key=lambda r: r[2] * r[3])
                return self.rec.feature(self.rec.alignCrop(im, f))
        return None

    def score_image(self, img):
        e = self.empreinte(img)
        if e is None:
            return 0.0
        s = [self.rec.match(r, e, self.cv2.FaceRecognizerSF_FR_COSINE) for r in self.refs]
        return float(sum(s) / len(s))

    def score(self, chemin):
        return self.score_image(self.cv2.imread(chemin))


def extraire_images(video, dossier, positions=(0.15, 0.45, 0.75, 0.95)):
    d = duree(video)
    sorties = []
    for i, p in enumerate(positions):
        s = os.path.join(dossier, f"frame{i}.jpg")
        subprocess.run(["ffmpeg", "-y", "-ss", f"{d * p:.2f}", "-i", video, "-frames:v", "1", "-q:v", "3", s],
                       check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        sorties.append(s)
    return sorties


def _infos(f):
    """Lit duree et pistes avec ffmpeg seul (ffprobe n'est pas toujours installe)."""
    return subprocess.run(["ffmpeg", "-hide_banner", "-i", f], capture_output=True, text=True).stderr


def duree(f):
    m = re.search(r"Duration: (\d+):(\d+):([\d.]+)", _infos(f))
    return int(m[1]) * 3600 + int(m[2]) * 60 + float(m[3]) if m else 0.0


def a_du_son(f):
    return bool(re.search(r"Stream #.*: Audio:", _infos(f)))


def questions_apprises(regles):
    return [r["question_controle"] for r in regles if r.get("question_controle")]


def controler_image(kie, visage, R, chemin, url, regles):
    """Renvoie (ok, rapport). rapport = {visage, vision, probleme}."""
    s = round(visage.score(chemin), 3)
    rapport = {"visage": s, "probleme": ""}
    if s < R["seuil_visage"]:
        rapport["probleme"] = f"face does not match the reference person (score {s})"
        rapport["probleme_fr"] = f"visage différent du personnage (score {s})"
        return False, rapport
    try:
        v = kie.vision(_consigne(REGLES_IMAGE + questions_apprises(regles)), [url])
    except Exception as e:  # la vision est un plus : si elle tombe en panne, la validation humaine reste
        log(f"vision indisponible : {e}")
        rapport["vision"] = "indisponible"
        rapport["probleme_fr"] = "relecture IA indisponible : vérifiez bien les mains"
        return True, rapport
    rapport["vision"] = v
    if not v.get("ok"):
        rapport["probleme"] = v.get("probleme") or "vision check failed"
        return False, rapport
    return True, rapport


def controler_video(kie, visage, R, chemin, dossier, regles):
    rapport = {"duree": round(duree(chemin), 2), "son": a_du_son(chemin), "probleme": ""}
    if rapport["duree"] < 3:
        rapport["probleme"] = "video trop courte"
        return False, rapport
    images = extraire_images(chemin, dossier)
    scores = [round(visage.score(i), 3) for i in images]
    rapport["visage"] = scores
    if sum(1 for s in scores if s >= R["seuil_visage"] - 0.05) < 2:
        rapport["probleme"] = f"visage qui change pendant la vidéo (scores {scores})"
        return False, rapport
    try:
        urls = [kie.envoyer(i) for i in images]
        v = kie.vision(_consigne(REGLES_VIDEO + questions_apprises(regles), plusieurs=True), urls)
    except Exception as e:
        log(f"vision video indisponible : {e}")
        rapport["vision"] = "indisponible"
        return True, rapport
    rapport["vision"] = v
    if not v.get("ok"):
        rapport["probleme"] = v.get("probleme") or "vision check failed"
        return False, rapport
    return True, rapport


def traduire_motif(kie, motif):
    """Transforme un motif de refus (en francais) en consigne de prompt + question de controle (en anglais)."""
    consigne = ("TRADUIS. A human rejected an AI-generated selfie image of a person for this reason (in French): "
                f"\"{motif}\". Write (1) a short English instruction to add to the image generation prompt so the problem "
                "does not happen again, and (2) a short English yes/no rule for an image checker, phrased so that "
                "'true' means the problem is absent. Answer ONLY with JSON: "
                '{"consigne_prompt":"...","question_controle":"..."}')
    try:
        return kie.vision(consigne, [])
    except Exception as e:
        log(f"traduction du motif impossible : {e}")
        return {"consigne_prompt": f"Avoid this problem: {motif}", "question_controle": ""}


def traduire(kie, texte, cache):
    """Traduit en anglais (pour les prompts) les consignes ecrites en francais dans le panneau. Memorise le resultat."""
    texte = (texte or "").strip()
    if not texte:
        return ""
    if texte in cache:
        return cache[texte]
    try:
        r = kie.vision("TRADUIS. Translate these instructions for an image/video generator into concise English. "
                       f"Instructions: \"{texte}\". Answer ONLY with JSON: " + '{"anglais":"..."}', [])
        cache[texte] = r.get("anglais") or texte
    except Exception as e:
        log(f"traduction impossible : {e}")
        return texte
    return cache[texte]


def description_casting(kie, perso):
    """Description francaise du panneau -> description anglaise precise pour generer des candidats."""
    genre = "man" if perso.get("genre") == "homme" else "woman"
    try:
        r = kie.vision("TRADUIS. Turn this French description of a fictional person into one precise English phrase "
                       "for an image generator, describing only physical traits (age, face, hair, eyes, skin marks, build, "
                       f"style). Avoid words like beautiful or perfect. The person is a {genre} of about {perso.get('age', 28)}. "
                       f"Description: \"{perso.get('description', '')}\". Answer ONLY with JSON: " + '{"anglais":"..."}', [])
        return r.get("anglais") or f"a {genre} of about {perso.get('age', 28)}"
    except Exception as e:
        log(f"description casting impossible : {e}")
        return f"a {genre} of about {perso.get('age', 28)}, {perso.get('description', '')}"


def identite_depuis_photo(kie, url, genre):
    """Ecrit le texte d'identite (anglais) d'un nouveau personnage a partir de sa photo choisie."""
    qui = "man" if genre == "homme" else "woman"
    try:
        r = kie.vision(f"Describe this {qui}'s permanent physical identity for an image generator, so the same person can be "
                       "regenerated identically: face shape, eyebrows, eye color, nose, lips, distinctive marks (moles, freckles), "
                       "skin, hair color, haircut and hair length, accessories always worn. One paragraph starting with "
                       "'the exact same person as in the reference photos, instantly recognizable:' and ending with "
                       "'same haircut and same hair length as in the references, no new haircut, no color change'. "
                       'Answer ONLY with JSON: {"identite":"..."}', [url])
        return r.get("identite")
    except Exception as e:
        log(f"identite impossible : {e}")
        return None
