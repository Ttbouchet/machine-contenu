"""python -m machine matin | suivi | diagnostic"""
import os
import sys
import traceback

from .base import log


def diagnostic():
    """Verifie chaque acces un par un et dit clairement ce qui manque. Ne genere rien de payant."""
    from .base import secret
    from .controles import Visage
    from .kie import Kie
    resultats = []

    def essai(nom, f):
        try:
            resultats.append(f"✅ {nom} : {f()}")
        except Exception as e:
            resultats.append(f"❌ {nom} : {e}")

    from . import drive
    from .base import dossier_travail
    kie = Kie()
    essai("KIE (clé API)", lambda: f"{kie.credits():.0f} crédits disponibles")
    cfg = {}

    def reglages():
        cfg.update(drive.config() or {})
        if not cfg:
            raise RuntimeError("aucun réglage : ouvrez Studio et enregistrez une fois les réglages")
        return f"{len(cfg.get('projets', []))} projet(s), {len(cfg.get('personnages', []))} personnage(s)"
    essai("Google Drive (réglages de Studio)", reglages)
    essai("Google Drive (état)", lambda: "lecture OK" if isinstance(drive.etat_lire(), dict) else "?")
    refs = {}

    def visage():
        actifs = [p for p in cfg.get("personnages", []) if p.get("statut") == "actif"]
        if not actifs:
            return "aucun personnage actif"
        pid = actifs[0]["id"]
        d = dossier_travail("refs", pid)
        for f in drive.lister(["personnages", pid]):
            drive.lire(f["id"], os.path.join(d, f["nom"]))
        refs["fichier"] = os.path.join(d, sorted(os.listdir(d))[0])
        return f"{actifs[0]['nom']} : {len(Visage(d).refs)} photos de référence reconnues"
    essai("Photos des personnages + contrôle du visage", visage)

    def vision():
        url = kie.envoyer(refs["fichier"])
        r = kie.vision('Is there a person in this image? Answer ONLY with JSON: {"ok":true_or_false}', [url])
        return "fonctionne" if r.get("ok") else f"réponse inattendue {r}"
    essai("Relecture IA (vision)", vision)
    def apify():
        if not secret("APIFY_TOKEN", obligatoire=False):
            return "pas encore de jeton (veille désactivée)"
        from .veille import solde_du_mois
        dep, lim = solde_du_mois()
        return f"connecté, {dep:.2f} $ dépensés sur {lim:.2f} $ ce mois-ci"
    essai("Apify (veille)", apify)
    essai("Décisions de Studio", lambda: f"{len(drive.decisions_lire())} en attente")
    rapport = "Diagnostic de la machine\n\n" + "\n".join(resultats)
    try:
        drive.notifier("Studio : diagnostic", rapport)
        rapport += "\n✅ E-mail : envoyé aux personnes autorisées"
    except Exception as e:
        rapport += f"\n❌ E-mail : {e}"
    print(rapport)
    if any(r.startswith("❌") for r in rapport.splitlines()):
        sys.exit(1)


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "diagnostic":
        return diagnostic()
    from . import pipeline
    if cmd not in ("matin", "suivi"):
        sys.exit("usage : python -m machine matin|suivi|diagnostic")
    try:
        pipeline.executer(cmd)
    except Exception as e:
        log("ERREUR : " + traceback.format_exc())
        try:
            from . import drive
            drive.notifier("Studio : problème technique", f"⚠️ Problème technique pendant « {cmd} » : {e}\n"
                           "Le prochain passage réessaie automatiquement.")
        except Exception:
            pass
        raise


if __name__ == "__main__":
    main()
