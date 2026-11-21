"""Choix des combinaisons du jour et ecriture des prompts, pour n'importe quel projet et personnage.
Regle de coherence n°1 : selfie = UNE main tient le telephone, l'autre est libre."""
import datetime as dt
import random
import re

from .base import TECH, donnee

REALISME = ("Raw unedited phone photo, ordinary real life, slight blur, digital noise, imperfect lighting, "
            "low contrast, no HDR, visible skin texture, natural everyday look with light or no makeup, healthy skin, not posed, not a model shoot, "
            "no retouching, no beauty filter, no text, no logo, no watermark.")

MAIN_IMAGE = ("The photo is taken with the front camera of her own phone, which she holds in ONE hand only "
              "(the phone itself is not visible because it is the camera). Her other hand is free: resting naturally "
              "or out of frame. She is never holding anything with both hands. No floating objects, no cables in the air. "
              "The phone is held close to her face, like a real handheld selfie: the arm holding the phone is almost "
              "entirely out of frame (at most a bit of that upper arm at the very edge), her other arm is not visible. "
              "Nothing in the foreground between her and the lens: no arm, no hand crossing her body. "
              "Never a straight-on tripod-like framing with both arms visible, never looking like someone else is filming her.")

MAIN_VIDEO = ("She films herself with the phone held in ONE hand only for the whole video; her other hand stays free "
              "and is the only hand that moves for the gesture. She never holds the phone with both hands. ")


def pronoms(texte, genre):
    """Les textes sont ecrits au feminin ; passage au masculin si besoin."""
    if genre != "homme":
        return texte
    for a, b in ((r"\bShe\b", "He"), (r"\bshe\b", "he"), (r"\bherself\b", "himself"), (r"\bHer\b", "His"),
                 (r"\b(Keep|keep|filming|film|films|behind|around|above|beside|toward|towards) her\b", r"\1 him"),
                 (r"\bher\b(?=\s*([,.;:!?)]|$))", "him"),
                 (r"\bher\b", "his"), (r"\bwoman\b", "man"), (r"\bfemale\b", "male"), (r"\bgirl\b", "guy")):
        texte = re.sub(a, b, texte)
    return texte


def _par_id(liste):
    return {x["id"]: x for x in liste}


def repartir(nb, poids):
    """Repartit nb videos entre personnages selon leurs parts (ex. {'brune': 60, 'max': 40})."""
    total = sum(p for p in poids.values() if p > 0)
    if not total:
        return []
    base = {k: int(nb * p / total) for k, p in poids.items() if p > 0}
    reste = nb - sum(base.values())
    for k in sorted(poids, key=lambda k: (nb * poids[k] / total) % 1, reverse=True)[:reste]:
        base[k] += 1
    return [k for k, n in base.items() for _ in range(n)]


def choisir(projet, personnages_du_jour, historique, graine=None):
    """Une combinaison par video : texte du projet, lieu compatible, tenue, coiffure, cadrage, reaction au bon ton."""
    cat = donnee("catalogue.json")
    rnd = random.Random(graine)
    hooks = [h for h in projet.get("hooks", []) if h.get("texte", "").strip()]
    if not hooks:
        raise RuntimeError(f"le projet {projet['nom']} n'a aucun texte de hook")
    limite = (dt.date.today() - dt.timedelta(days=TECH["jours_sans_repetition"])).isoformat()
    recents = [h for h in historique if h.get("jour", "") >= limite and h.get("projet") == projet["id"]]
    deja = {h["hook"] for h in recents}
    tenues_recentes = [h.get("tenue") for h in historique[-15:]]
    candidats = [h for h in hooks if h["id"] not in deja]
    if len(candidats) < len(personnages_du_jour):
        ordre = {h["hook"]: h["jour"] for h in recents}
        candidats = sorted(hooks, key=lambda h: ordre.get(h["id"], ""))
    rnd.shuffle(candidats)

    choisis, decors_pris, reactions_prises = [], set(), set()
    for perso in personnages_du_jour:
        interdits = set(perso.get("lieux_interdits") or [])
        for h in list(candidats):
            lieux = h.get("lieux")
            decors = [d for d in cat["decors"] if (not lieux or d["id"] in lieux) and d["id"] not in interdits
                      and d["id"] not in decors_pris] or \
                     [d for d in cat["decors"] if (not lieux or d["id"] in lieux) and d["id"] not in interdits]
            if decors:
                candidats.remove(h)
                break
        else:
            raise RuntimeError(f"aucun texte compatible avec les lieux autorisés pour {perso['nom']}")
        decor = rnd.choice(decors)
        decors_pris.add(decor["id"])
        cadrages = [c for c in cat["cadrages"]
                    if c["id"] not in cat["regles_cadrage"] or decor["id"] in cat["regles_cadrage"][c["id"]]]
        if decor["id"] in cat["regles_cadrage"].get("marche_face", []):
            cadrages = [c for c in cadrages if c["id"] in ("marche_face", "face", "decentre")]
        tenues = [t for t in cat["tenues"] if t["id"] not in tenues_recentes] or cat["tenues"]
        tenue = rnd.choice(tenues)
        tenues_recentes.append(tenue["id"])
        coiffures = cat["coiffures_homme"] if perso.get("genre") == "homme" else cat["coiffures"]
        meme_ton = [r for r in cat["reactions"] if r["ton"] == h.get("ton")]
        reactions = ([r for r in meme_ton if r["id"] not in reactions_prises] or
                     [r for r in cat["reactions"] if r["id"] not in reactions_prises] or cat["reactions"])
        reaction = rnd.choice(reactions)
        reactions_prises.add(reaction["id"])
        choisis.append({"projet": projet["id"], "personnage": perso["id"], "hook": h["id"], "texte": h["texte"],
                        "decor": decor["id"], "tenue": tenue["id"], "coiffure": rnd.choice(coiffures)["id"],
                        "cadrage": rnd.choice(cadrages)["id"], "reaction": reaction["id"]})
    return choisis


def prompt_image(c, perso, regles=(), contraintes="", correction=""):
    cat = donnee("catalogue.json")
    coiffures = cat["coiffures_homme"] if perso.get("genre") == "homme" else cat["coiffures"]
    d = _par_id(cat["decors"])[c["decor"]]
    t = _par_id(cat["tenues"])[c["tenue"]]
    co = _par_id(coiffures)[c["coiffure"]]
    ca = _par_id(cat["cadrages"])[c["cadrage"]]
    marche = ca["format"] == "marche"
    p = (f"Use the reference photos only for the person's identity. Generate {perso['identite']}. "
         "Only the outfit, hairstyle, place and framing change, it is a different day: "
         f"today she is wearing {t['texte']}, with {co['texte']}. She is {d['texte']}. "
         f"{'Amateur iPhone front camera selfie taken while walking' if marche else 'Amateur iPhone front camera selfie'}: "
         f"{ca['texte']}. {MAIN_IMAGE} "
         "Neutral relaxed expression, mouth closed, eyes on her phone screen. " + REALISME)
    extra = " ".join(r["consigne_prompt"] for r in regles if r.get("consigne_prompt"))
    if contraintes:
        extra += " " + contraintes
    if extra.strip():
        p += " Also: " + extra.strip()
    if correction:
        p += f" Important correction compared to the previous attempt: {correction}"
    return pronoms(p, perso.get("genre"))


def prompt_video(c, perso):
    cat = donnee("catalogue.json")
    r = _par_id(cat["reactions"])[c["reaction"]]
    ca = _par_id(cat["cadrages"])[c["cadrage"]]
    mouvement = "while walking, natural walking bounce" if ca["format"] == "marche" else "in selfie mode"
    p = ("The woman in the image is filming herself " + mouvement + ". "
         "Keep her exactly the same as in the image: same face, same eyebrows, same eyes, same distinctive marks, "
         "same hair, same outfit, same place, same lighting. " + MAIN_VIDEO +
         "Whenever she reads her screen, it is the screen of the very phone she is filming with: her eyes look just "
         "below the lens. No other phone, tablet or device ever appears in the frame, and nothing is held up in front "
         "of the camera. " + r["texte"] +
         " She does not say a single word: only natural breathing and quiet ambient sound of the place. "
         "Real, human, spontaneous micro-expressions, not exaggerated, not theatrical, natural blinking. "
         "Handheld phone footage with slight natural shake, realistic skin and hair movement. "
         "No music, no subtitles, no text on screen, no camera cuts.")
    return pronoms(p, perso.get("genre"))


def resume_fr(c):
    return f"{c['decor']} · {c['tenue']} · {c['coiffure']} · {c['cadrage']} · réaction {c['reaction']}"


# ============================== CASTING ==============================
def prompt_candidat(description_en, genre, i):
    angles = ["phone held at eye level at arm's length", "phone held slightly below the chin, low angle",
              "phone slightly to the side, off-center framing", "phone held slightly above, high angle",
              "phone at arm's length, face and shoulders", "close framing, face filling most of the frame"]
    lieux = ["plain light grey wall behind", "plain beige wall behind", "plain white wall behind",
             "plain pale blue wall behind", "plain warm off-white wall behind", "plain soft green wall behind"]
    p = (f"Amateur iPhone front camera selfie of {description_en}. {angles[i % 6]}, {lieux[i % 6]}. "
         "An ordinary real person, not a model, natural asymmetric face, natural skin with pores and small imperfections. "
         "Neutral relaxed expression, mouth closed. " + MAIN_IMAGE + " " + REALISME)
    return pronoms(p, genre)


def prompt_ref(genre, i):
    variantes = [("a plain grey t-shirt", "plain light grey wall", "phone at eye level, straight-on"),
                 ("a navy knit sweater", "plain beige wall", "phone slightly to the left, three-quarter view"),
                 ("a white button-up shirt", "plain white wall", "phone slightly below the chin, low angle"),
                 ("a black hoodie", "plain pale blue wall", "phone slightly to the right, three-quarter view")]
    t, mur, angle = variantes[i % 4]
    p = ("Use the reference photo only for the person's identity: generate the exact same person, instantly recognizable, "
         "identical face, eyes, eyebrows, nose, lips, skin marks, hair color, haircut and hair length. "
         f"Amateur iPhone front camera selfie, wearing {t}, {mur} behind, {angle}. Neutral expression, mouth closed. "
         + MAIN_IMAGE + " " + REALISME)
    return pronoms(p, genre)
