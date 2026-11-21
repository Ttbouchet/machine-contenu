#!/usr/bin/env python3
"""Montage automatique TikTok : hook IA + texte a l'ecran (+ demo ecran avec accelerations).

Usage :
  python montage.py --hook hook.mp4 --texte "just saw a girl..." --sortie out.mp4
        [--demo demo.mp4 --segments "0-4:1,4-12:3,12-20:1"] [--style blanc|noir]
"""
import re
import argparse, os, subprocess, tempfile, unicodedata
from PIL import Image, ImageDraw, ImageFont

W, H = 1080, 1920
FONT = "/usr/share/fonts/opentype/inter/Inter-Bold.otf"
EMOJI = "/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf"


def est_emoji(c):
    o = ord(c)
    return o >= 0x1F000 or 0x2600 <= o <= 0x27BF or o in (0x200D, 0xFE0F)


def morceaux(ligne):
    """Decoupe une ligne en suites texte / emoji."""
    res, cur, emo = [], "", None
    for c in ligne:
        e = est_emoji(c)
        if emo is None or e == emo:
            cur += c
        else:
            res.append((cur, emo)); cur = c
        emo = e
    if cur:
        res.append((cur, emo))
    return res


def largeur(txt, f, fe, taille):
    w = 0
    for s, e in morceaux(txt):
        if e:
            w += sum(taille * 1.15 for ch in s if ch not in "‍️")
        else:
            w += f.getlength(s)
    return w


def couper(texte, f, fe, taille, maxw):
    lignes = []
    for para in texte.split("\n"):
        mots, cur = para.split(" "), ""
        for m in mots:
            essai = (cur + " " + m).strip()
            if largeur(essai, f, fe, taille) <= maxw or not cur:
                cur = essai
            else:
                lignes.append(cur); cur = m
        lignes.append(cur)
    return lignes


def legende(texte, chemin, style="blanc", taille=58):
    """PNG transparent 1080 de large : chaque ligne dans une bulle arrondie, facon texte TikTok."""
    f = ImageFont.truetype(FONT, taille)
    fe = ImageFont.truetype(EMOJI, 109)
    maxw = W - 2 * 110
    lignes = couper(texte, f, fe, taille, maxw)
    pad_x, pad_y, inter = 26, 14, 6
    lh = int(taille * 1.25)
    hauteur = len(lignes) * (lh + 2 * pad_y + inter) + 20
    img = Image.new("RGBA", (W, hauteur), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    fond, encre = ((255, 255, 255, 255), (0, 0, 0, 255)) if style == "blanc" else ((0, 0, 0, 170), (255, 255, 255, 255))
    y = 10
    for l in lignes:
        lw = largeur(l, f, fe, taille)
        x0 = (W - lw) / 2 - pad_x
        d.rounded_rectangle([x0, y, x0 + lw + 2 * pad_x, y + lh + 2 * pad_y], radius=18, fill=fond)
        x = x0 + pad_x
        ty = y + pad_y + (lh - taille) / 2 - taille * 0.08
        for s, e in morceaux(l):
            if not e:
                d.text((x, ty), s, font=f, fill=encre)
                x += f.getlength(s)
            else:
                for ch in s:
                    if ch in "‍️":
                        continue
                    em = Image.new("RGBA", (136, 128), (0, 0, 0, 0))
                    ImageDraw.Draw(em).text((0, 0), ch, font=fe, embedded_color=True)
                    em = em.resize((int(taille * 1.1), int(taille * 1.04)), Image.LANCZOS)
                    img.alpha_composite(em, (int(x + taille * 0.03), int(ty + taille * 0.02)))
                    x += taille * 1.15
        y += lh + 2 * pad_y + inter
    img.save(chemin)
    return img.size[1]


def sh(cmd):
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)


def _infos(f):
    """Lit duree et pistes avec ffmpeg seul (ffprobe n'est pas toujours installe)."""
    return subprocess.run(["ffmpeg", "-hide_banner", "-i", f], capture_output=True, text=True).stderr


def duree(f):
    m = re.search(r"Duration: (\d+):(\d+):([\d.]+)", _infos(f))
    return int(m[1]) * 3600 + int(m[2]) * 60 + float(m[3]) if m else 0.0


def a_audio(f):
    return bool(re.search(r"Stream #.*: Audio:", _infos(f)))


def norm(entree, sortie, tmp, debut=None, fin=None, vitesse=1.0, garder_son=True):
    """Remet n'importe quelle video en 1080x1920 30 i/s. Paysage -> fond flou + video au centre."""
    v = (f"[0:v]setpts=PTS/{vitesse},split[a][b];"
         f"[a]scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},boxblur=30:5,eq=brightness=-0.08[bg];"
         f"[b]scale={W}:{H}:force_original_aspect_ratio=decrease[fg];"
         f"[bg][fg]overlay=(W-w)/2:(H-h)/2,fps=30,format=yuv420p[v]")
    cmd = ["ffmpeg", "-y"]
    if debut is not None:
        cmd += ["-ss", str(debut)]
    if fin is not None:
        cmd += ["-to", str(fin)]
    cmd += ["-i", entree]
    son = garder_son and a_audio(entree) and vitesse <= 2.0
    if son:
        at = f"atempo={vitesse}" if vitesse != 1 else "anull"
        cmd += ["-filter_complex", v + f";[0:a]{at},aresample=44100[aout]", "-map", "[v]", "-map", "[aout]"]
    else:
        cmd += ["-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo", "-filter_complex", v,
                "-map", "[v]", "-map", "1:a", "-shortest"]
    cmd += ["-c:v", "libx264", "-preset", "veryfast", "-crf", "19", "-c:a", "aac", "-b:a", "160k", "-ac", "2", sortie]
    sh(cmd)


def monter(hook, texte, sortie, demo=None, segments=None, style="blanc", position=0.17):
    tmp = tempfile.mkdtemp()
    png = os.path.join(tmp, "legende.png")
    legende(texte, png, style)
    parts = []
    h = os.path.join(tmp, "p0.mp4")
    norm(hook, h, tmp)
    parts.append(h)
    if demo:
        segs = []
        for s in (segments or "").split(","):
            if s.strip():
                a, v = s.split(":")
                d0, d1 = a.split("-")
                segs.append((float(d0), float(d1), float(v)))
        if not segs:
            segs = [(0, duree(demo), 1.0)]
        for i, (d0, d1, v) in enumerate(segs, 1):
            p = os.path.join(tmp, f"p{i}.mp4")
            norm(demo, p, tmp, d0, d1, v)
            parts.append(p)
    liste = os.path.join(tmp, "liste.txt")
    open(liste, "w").write("".join(f"file '{p}'\n" for p in parts))
    brut = os.path.join(tmp, "brut.mp4")
    sh(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", liste, "-c", "copy", brut])
    fin_texte = duree(parts[0]) + (1.5 if demo else 0)
    y = int(H * position)
    sh(["ffmpeg", "-y", "-i", brut, "-i", png, "-filter_complex",
        f"[0:v][1:v]overlay=0:{y}:enable='lte(t,{fin_texte:.2f})',noise=alls=4:allf=t,format=yuv420p[v]",
        "-map", "[v]", "-map", "0:a", "-c:v", "libx264", "-preset", "medium", "-crf", "20",
        "-c:a", "copy", "-movflags", "+faststart", sortie])
    return sortie


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--hook", required=True); p.add_argument("--texte", required=True); p.add_argument("--sortie", required=True)
    p.add_argument("--demo"); p.add_argument("--segments"); p.add_argument("--style", default="blanc")
    a = p.parse_args()
    monter(a.hook, a.texte, a.sortie, a.demo, a.segments, a.style)
