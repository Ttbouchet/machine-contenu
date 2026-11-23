#!/usr/bin/env python3
"""Fabrique les « corps de démo » (12-22 s) depuis les vidéos écran brutes du dossier Drive « Video Démo App ».

Chaque corps = suite d'étapes [source, debut, fin, vitesse, legende]. Vidéo muette (le son du hook suffit),
légendes d'étape en bulles blanches en bas. Usage :
  python montage/corps_demos.py [--fr] [nom_du_corps ...]   (sans argument : tous ; --fr = légendes en français)
Les sources brutes sont sur le Mac (~/Desktop/RewordyDemo) ; les corps finis vont dans montage/medias/demos/.
"""
import os, sys, tempfile

ICI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(ICI, "..", "machine-contenu"))
from machine.montage import legende, norm, duree, sh, H  # noqa: E402

SRC = os.path.expanduser("~/Desktop/RewordyDemo")
SORTIE = os.path.join(ICI, "medias", "demos")

CORPS = {
    # Ordinateur filmé au téléphone (démo d'origine, déjà utilisée : corps_demo.mp4)
    "ordi_a": [
        ("IMG_4983.MOV", 0.3, 4.2, 2, "pasted my ChatGPT essay in here"),
        ("IMG_4983.MOV", 4.5, 11, 3, ""),
        ("IMG_4983.MOV", 11, 38.8, 9, ""),
        ("IMG_4983.MOV", 39.2, 43.8, 1, "82% AI 💀"),
        ("IMG_4983.MOV", 43.8, 49, 3, "so I hit humanize"),
        ("IMG_4983.MOV", 49, 99, 12, ""),
        ("IMG_4983.MOV", 99.5, 108.2, 1.4, "rewritten to sound human ✅"),
    ],
    # Ordinateur filmé, autre texte (Darwin)
    "ordi_b": [
        ("IMG_9383.MOV", 0, 8, 3, "ran my essay through an AI detector"),
        ("IMG_9383.MOV", 8, 34, 9, ""),
        ("IMG_9383.MOV", 35.5, 38.5, 1, "82% AI. my prof would've caught it 💀"),
        ("IMG_9383.MOV", 39, 46, 3, "one click on humanize"),
        ("IMG_9383.MOV", 46, 91, 12, ""),
        ("IMG_9383.MOV", 93, 97.5, 1.3, "now it reads like I wrote it ✅"),
    ],
    # Téléphone tenu en main (le plus « vrai », style UGC)
    "main_tel": [
        ("IMG_9385.MOV", 0, 3, 1.5, "checking my essay before I submit"),
        ("IMG_9385.MOV", 3, 9, 3, ""),
        ("IMG_9385.MOV", 9, 31, 8, ""),
        ("IMG_9385.MOV", 32.5, 35.5, 1, "82% AI 😭"),
        ("IMG_9385.MOV", 38, 46, 3, "so I tried the humanizer"),
        ("IMG_9385.MOV", 46, 94, 12, ""),
        ("IMG_9385.MOV", 95, 98.5, 1.2, "rewritten to sound human ✅"),
    ],
    # Capture d'écran iPhone (net, lisible)
    "ecran_tel": [
        ("ScreenRecording_10-12-2026 11-26-57_1.MP4", 0, 2.5, 1.5, "testing my essay on my phone"),
        ("ScreenRecording_10-12-2026 11-26-57_1.MP4", 3, 8, 3, ""),
        ("ScreenRecording_10-12-2026 11-26-57_1.MP4", 8, 31, 8, ""),
        ("ScreenRecording_10-12-2026 11-26-57_1.MP4", 32, 34.5, 1, "82% AI 💀"),
        ("ScreenRecording_10-12-2026 11-26-57_1.MP4", 36, 44, 3, "hit humanize"),
        ("ScreenRecording_10-12-2026 11-26-57_1.MP4", 45, 89, 11, ""),
        ("ScreenRecording_10-12-2026 11-26-57_1.MP4", 90, 93, 1.2, "rewritten to sound human ✅"),
    ],
    # Montage rapide avec les plans courts (≈ 10 s, rythme TikTok)
    "rapide": [
        ("IMG_5002.MOV", 0, 5.4, 2.5, "copied my whole essay"),
        ("IMG_5059.MOV", 0, 2.4, 1, ""),
        ("IMG_5006.MOV", 0, 6.1, 2, "82% AI 💀"),
        ("IMG_5061.MOV", 0, 3.7, 1.5, "humanize →"),
        ("IMG_5062.MOV", 0, 3.1, 1, "sounds human now ✅"),
    ],
    # Détecteur seul, finit sur le 82 % (suspense ; à associer à une question finale)
    "detecteur": [
        ("IMG_4976.MOV", 0, 4, 2, "pasted my essay into an AI detector"),
        ("IMG_4976.MOV", 4, 27, 8, ""),
        ("IMG_4976.MOV", 27, 30, 3, ""),
        ("IMG_4976.MOV", 30.5, 34, 1, "82% AI. would you still submit it? 😬"),
    ],
}


# Version française (test de langue) : même vidéo d'appli, légendes traduites. Corps rangés sous « fr_<nom>.mp4 ».
FR = {
    "pasted my ChatGPT essay in here": "j'ai collé ma dissert ChatGPT ici",
    "82% AI 💀": "82 % IA 💀",
    "so I hit humanize": "du coup j'appuie sur humanize",
    "rewritten to sound human ✅": "réécrite, on dirait un humain ✅",
    "ran my essay through an AI detector": "j'ai passé ma dissert au détecteur d'IA",
    "82% AI. my prof would've caught it 💀": "82 % IA. ma prof m'aurait grillée direct 💀",
    "one click on humanize": "un clic sur humanize",
    "now it reads like I wrote it ✅": "là on dirait vraiment que c'est moi ✅",
    "checking my essay before I submit": "je vérifie ma dissert avant de la rendre",
    "82% AI 😭": "82 % IA 😭",
    "so I tried the humanizer": "alors j'ai testé le humanizer",
    "testing my essay on my phone": "je teste ma dissert sur mon tel",
    "hit humanize": "j'appuie sur humanize",
    "copied my whole essay": "j'ai copié toute ma dissert",
    "humanize →": "humanize →",
    "sounds human now ✅": "là ça fait humain ✅",
    "pasted my essay into an AI detector": "j'ai collé ma dissert dans un détecteur d'IA",
    "82% AI. would you still submit it? 😬": "82 % IA. tu la rendrais quand même ? 😬",
}


def en_francais(etapes):
    manque = [e[4] for e in etapes if e[4] and e[4] not in FR]
    if manque:
        raise SystemExit(f"légendes sans traduction : {manque}")
    return [(src, d0, d1, v, FR.get(txt, txt)) for src, d0, d1, v, txt in etapes]


def fabriquer(nom, etapes, sortie):
    tmp = tempfile.mkdtemp()
    parts, t, overlays = [], 0.0, []
    for i, (src, d0, d1, v, txt) in enumerate(etapes):
        p = os.path.join(tmp, f"s{i}.mp4")
        norm(os.path.join(SRC, src), p, tmp, d0, d1, v, garder_son=False)
        dur = duree(p)
        if txt:
            png = os.path.join(tmp, f"l{i}.png")
            legende(txt, png, "blanc", 54)
            overlays.append((png, t, t + dur))
        parts.append(p)
        t += dur
    liste = os.path.join(tmp, "l.txt")
    open(liste, "w").write("".join(f"file '{p}'\n" for p in parts))
    brut = os.path.join(tmp, "brut.mp4")
    sh(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", liste, "-c", "copy", brut])
    cmd = ["ffmpeg", "-y", "-i", brut]
    for png, _, _ in overlays:
        cmd += ["-i", png]
    chaine, prev = [], "[0:v]"
    for k, (_, a, b) in enumerate(overlays, 1):
        out = f"[v{k}]"
        chaine.append(f"{prev}[{k}:v]overlay=0:{int(H*0.70)}:enable='between(t,{a:.2f},{b:.2f})'{out}")
        prev = out
    chaine.append(f"{prev}format=yuv420p[v]")
    cmd += ["-filter_complex", ";".join(chaine), "-map", "[v]", "-map", "0:a",
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-c:a", "aac", "-b:a", "160k",
            "-movflags", "+faststart", sortie]
    sh(cmd)
    return sortie


if __name__ == "__main__":
    os.makedirs(SORTIE, exist_ok=True)
    args = sys.argv[1:]
    fr = "--fr" in args
    for nom in ([a for a in args if a != "--fr"] or CORPS):
        out = os.path.join(SORTIE, f"{'fr_' if fr else ''}{nom}.mp4")
        fabriquer(nom, en_francais(CORPS[nom]) if fr else CORPS[nom], out)
        print(f"{nom} : {duree(out):.1f} s, {os.path.getsize(out)//1_000_000} Mo", flush=True)
