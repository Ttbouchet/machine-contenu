#!/usr/bin/env python3
"""Fabrique une serie de videos finies : corps de demo (fait une fois) + chaque hook avec ses textes."""
import json, os, subprocess, sys, tempfile
from montage import legende, norm, duree, sh, W, H

ICI = os.path.dirname(os.path.abspath(__file__))


def corps_demo(demo, etapes, sortie):
    """etapes : liste de [debut, fin, vitesse, legende_ou_vide]. Video muette, legendes d'etape en bas."""
    tmp = tempfile.mkdtemp()
    parts, t, overlays = [], 0.0, []
    for i, (d0, d1, v, txt) in enumerate(etapes):
        p = os.path.join(tmp, f"s{i}.mp4")
        norm(demo, p, tmp, d0, d1, v, garder_son=False)
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
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-c:a", "aac", "-b:a", "160k", sortie]
    sh(cmd)
    return sortie


def video(hook, texte, corps, sortie):
    tmp = tempfile.mkdtemp()
    h = os.path.join(tmp, "h.mp4")
    norm(hook, h, tmp)
    png = os.path.join(tmp, "c.png")
    legende(texte, png, "blanc", 58)
    fin = duree(h) + 1.5
    sh(["ffmpeg", "-y", "-i", h, "-i", corps, "-i", png, "-filter_complex",
        f"[0:v][0:a][1:v][1:a]concat=n=2:v=1:a=1[cv][ca];"
        f"[cv][2:v]overlay=0:{int(H*0.17)}:enable='lte(t,{fin:.2f})',noise=alls=4:allf=t,format=yuv420p[v]",
        "-map", "[v]", "-map", "[ca]", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
        "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", sortie])


if __name__ == "__main__":
    plan = json.load(open(sys.argv[1]))
    os.makedirs(plan["sortie"], exist_ok=True)
    corps = os.path.join(plan["sortie"], "_corps_demo.mp4")
    if not os.path.exists(corps):
        corps_demo(plan["demo"], plan["etapes"], corps)
        print("corps demo :", round(duree(corps), 1), "s", flush=True)
    for v in plan["videos"]:
        for i, t in enumerate(v["textes"], 1):
            out = os.path.join(plan["sortie"], f'{v["nom"]}_v{i}.mp4')
            if not os.path.exists(out):
                video(v["hook"], t, corps, out)
                print("ok", out, round(duree(out), 1), "s", flush=True)
