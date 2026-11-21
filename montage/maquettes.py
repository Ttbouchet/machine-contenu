#!/usr/bin/env python3
"""Maquettes de formats de retention (aucun credit) : hooks du banc du 2026-11-20 + demo d'origine.

  python montage/maquettes.py   -> montage/maquettes/m1_resultat_dabord.mp4, m2_ecran_partage.mp4, m3_score_qui_descend.mp4

ATTENTION : le score final « 2% » est FICTIF (la demo actuelle ne montre pas de score apres humanisation).
Chaque maquette porte la mention « MAQUETTE » : ne pas publier telles quelles.
"""
import os
import subprocess
import sys
import tempfile

ICI = os.path.dirname(os.path.abspath(__file__))
RACINE = os.path.dirname(ICI)
sys.path.insert(0, os.path.join(RACINE, "machine-contenu"))
os.environ["PATH"] = os.path.join(RACINE, ".venv", "bin") + os.pathsep + os.environ["PATH"]
from machine.montage import legende  # noqa: E402

W, H = 1080, 1920
DEMO = os.path.join(ICI, "medias", "demo_complete.mp4")
BANC = os.path.join(RACINE, "banc-essai", "resultats", "2026-11-20")
HOOK = {m: os.path.join(BANC, m, "hook.mp4") for m in ("kling3_std", "veo31_fast", "seedance2", "grok15")}
FONT = os.path.join(RACINE, "machine-contenu", "polices", "Inter-Bold.otf")
SORTIE = os.path.join(ICI, "maquettes")
TMP = tempfile.mkdtemp()
ZOOM_SCORE = "crop=540:960:230:470"  # zone du « 82% » + bouton Remove AI dans la demo (vers 44-49 s)


def sh(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode:
        sys.exit(r.stderr[-1500:])


def clip(nom, src, debut, fin, vitesse=1.0, filtre="", taille=(W, H)):
    """Morceau muet 30 i/s, recadre a la taille voulue."""
    out = os.path.join(TMP, nom + ".mp4")
    w, h = taille
    f = (f"{filtre + ',' if filtre else ''}setpts=PTS/{vitesse},scale={w}:{h}:force_original_aspect_ratio=increase,"
         f"crop={w}:{h},fps=30,format=yuv420p")
    sh(["ffmpeg", "-y", "-ss", str(debut), "-to", str(fin), "-i", src, "-vf", f, "-an",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "19", out])
    return out


def carte_score(nom, duree_s, de=82, a=2, descente=1.4):
    """Fond = resultat de la demo floute ; gros pourcentage qui descend de 82 a 2 (FICTIF)."""
    from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageEnhance
    out = os.path.join(TMP, nom + ".mp4")
    d = os.path.join(TMP, nom)
    os.makedirs(d, exist_ok=True)
    fond = os.path.join(d, "fond.png")
    sh(["ffmpeg", "-y", "-ss", "104", "-i", DEMO, "-frames:v", "1", "-vf", f"scale={W}:{H}", fond])
    base = ImageEnhance.Brightness(Image.open(fond).convert("RGB").filter(ImageFilter.GaussianBlur(28))).enhance(0.7)
    gros, petit = ImageFont.truetype(FONT, 300), ImageFont.truetype(FONT, 70)
    for i in range(int(duree_s * 30)):
        t = i / 30
        v = max(a, round(de - (de - a) * min(1, t / descente)))
        img = base.copy()
        dr = ImageDraw.Draw(img)
        dr.rounded_rectangle([90, 580, 990, 1300], radius=60, fill=(255, 255, 255))
        couleur = (31, 157, 85) if t >= descente else (229, 72, 77)
        txt = f"{v}%"
        dr.text(((W - dr.textlength(txt, font=gros)) / 2, 700), txt, font=gros, fill=couleur)
        dr.text(((W - dr.textlength("AI detected", font=petit)) / 2, 1110), "AI detected", font=petit, fill=(60, 60, 60))
        img.save(os.path.join(d, f"f{i:04d}.png"))
    sh(["ffmpeg", "-y", "-framerate", "30", "-i", os.path.join(d, "f%04d.png"), "-pix_fmt", "yuv420p",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "19", out])
    return out


def assembler(nom, morceaux, textes, haut_texte=0.17):
    """Concatene, ajoute les bulles de texte (texte, debut, fin, y), la mention MAQUETTE et une piste muette."""
    entrees, filt = [], ""
    for i, m in enumerate(morceaux):
        entrees += ["-i", m]
    filt += "".join(f"[{i}:v]" for i in range(len(morceaux))) + f"concat=n={len(morceaux)}:v=1:a=0[v0];"
    cur = "v0"
    for j, (t, d, f, y) in enumerate(textes):
        png = os.path.join(TMP, f"{nom}_t{j}.png")
        legende(t, png, "blanc", 60)
        entrees += ["-i", png]
        k = len(morceaux) + j
        filt += f"[{cur}][{k}:v]overlay=0:{int(H * y)}:enable='between(t,{d},{f})'[v{j + 1}];"
        cur = f"v{j + 1}"
    filt += (f"[{cur}]drawtext=fontfile='{FONT}':text='MAQUETTE':fontsize=34:fontcolor=white@0.8:"
             f"box=1:boxcolor=black@0.5:boxborderw=10:x=30:y=60,noise=alls=4:allf=t,format=yuv420p[v]")
    os.makedirs(SORTIE, exist_ok=True)
    out = os.path.join(SORTIE, nom + ".mp4")
    sh(["ffmpeg", "-y", *entrees, "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo", "-filter_complex", filt,
        "-map", "[v]", "-map", f"{len(entrees) // 2}:a", "-shortest", "-c:v", "libx264", "-preset", "veryfast",
        "-crf", "21", "-c:a", "aac", "-movflags", "+faststart", out])
    print(out)


def m1_resultat_dabord():
    """Le score bas tout de suite, ensuite le comment ; finit sur l'image du debut (boucle)."""
    a = clip("m1a", DEMO, 44.0, 45.4, 1, ZOOM_SCORE)              # 1,4 s  zoom 82%
    b = carte_score("m1b", 2.2)                                    # 2,2 s  82 -> 2 (fictif)
    c = clip("m1c", HOOK["veo31_fast"], 0.5, 3.5)                  # 3,0 s  sa reaction
    d = clip("m1d", DEMO, 46.5, 49.0, 2, ZOOM_SCORE)               # 1,25 s clic Remove AI
    e = clip("m1e", DEMO, 49.0, 99.0, 16)                          # 3,1 s  traitement
    f = clip("m1f", DEMO, 99.5, 108.2, 3)                          # 2,9 s  resultat
    g = clip("m1g", DEMO, 44.0, 44.8, 1, ZOOM_SCORE)               # 0,8 s  retour au debut = boucle
    assembler("m1_resultat_dabord", [a, b, c, d, e, f, g], [
        ("82% AI on an essay I wrote myself 💀", 0, 1.4, 0.12),
        ("→ 2% after one click", 1.4, 3.6, 0.12),
        ("my prof is gonna be so confused 😭", 3.6, 6.6, 0.17),
        ("here's how 👇", 6.6, 8.0, 0.12),
        ("it rewrites it to sound like you ✅", 10.9, 13.0, 0.12),
    ])


def m2_ecran_partage():
    """Elle en haut (reactions enchainees), la demo en bas, du debut a la fin."""
    demi = (W, H // 2)
    haut = [clip("m2h1", HOOK["kling3_std"], 0, 5, taille=demi),
            clip("m2h2", HOOK["veo31_fast"], 0, 6, taille=demi),
            clip("m2h3", HOOK["seedance2"], 0, 5, taille=demi)]
    bas = [clip("m2b1", DEMO, 0.3, 4.2, 2, taille=demi),                       # 1,95 s colle l'essai
           clip("m2b2", DEMO, 44.0, 47.5, 1, ZOOM_SCORE, taille=demi),         # 3,5 s  82%
           clip("m2b3", DEMO, 47.5, 49.0, 1.5, ZOOM_SCORE, taille=demi),       # 1,0 s  clic
           clip("m2b4", DEMO, 49.0, 99.0, 12, taille=demi),                    # 4,2 s  traitement
           clip("m2b5", DEMO, 99.5, 108.2, 2.2, taille=demi)]                  # 4,0 s  resultat
    def concat(nom, ms):
        out = os.path.join(TMP, nom + ".mp4")
        sh(["ffmpeg", "-y", *sum((["-i", m] for m in ms), []), "-filter_complex",
            "".join(f"[{i}:v]" for i in range(len(ms))) + f"concat=n={len(ms)}:v=1:a=0[v]", "-map", "[v]",
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "19", out])
        return out
    h, b = concat("m2haut", haut), concat("m2bas", bas)
    pile = os.path.join(TMP, "m2pile.mp4")
    sh(["ffmpeg", "-y", "-i", h, "-i", b, "-filter_complex",
        "[0:v][1:v]vstack=shortest=1,drawbox=x=0:y=957:w=1080:h=6:color=white:t=fill[v]", "-map", "[v]",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "19", pile])
    assembler("m2_ecran_partage", [pile], [
        ("turnitin flagged my essay. I wrote it myself 😭", 0, 2.0, 0.42),
        ("82% AI 💀", 2.0, 5.5, 0.45),
        ("ok let's try this 🙏", 5.5, 6.5, 0.45),
        ("wait…", 6.5, 10.6, 0.45),
        ("it actually sounds like me now ✅", 10.6, 14.6, 0.42),
    ])


def m3_score_qui_descend():
    """Hook, puis zoom sur le score, suspense, compteur qui chute, question finale."""
    a = clip("m3a", HOOK["seedance2"], 0, 3.0)                     # 3,0 s  hook
    b = clip("m3b", DEMO, 44.0, 46.0, 1, ZOOM_SCORE)               # 2,0 s  82%
    c = clip("m3c", DEMO, 46.0, 49.0, 2, ZOOM_SCORE)               # 1,5 s  clic
    d = clip("m3d", DEMO, 49.0, 99.0, 25)                          # 2,0 s  traitement
    e = carte_score("m3e", 3.5, descente=1.6)                      # 3,5 s  82 -> 2 (fictif)
    assembler("m3_score_qui_descend", [a, b, c, d, e], [
        ("turnitin said 82% AI on my essay i wrote myself 😭", 0, 3.0, 0.17),
        ("82%", 3.0, 5.0, 0.12),
        ("wait…", 5.0, 8.5, 0.12),
        ("which detector does your school use? 👇", 10.1, 12.0, 0.12),
    ])


if __name__ == "__main__":
    m1_resultat_dabord()
    m2_ecran_partage()
    m3_score_qui_descend()
