"""La machine : lit vos reglages (Studio, via le Drive), produit, rend compte (etat dans le Drive).

  matin  (3 h 47, heure de Dubai) : pour chaque projet actif aujourd'hui, choisit les combinaisons, genere et
         controle les images ; elles apparaissent dans l'appli Studio (e-mail « images pretes »).
  suivi  (chaque heure)      : decisions prises dans Studio, images a refaire, videos validees, controles, montage,
         Drive ; et les castings de nouveaux personnages demandes dans Studio.

Chaque video a une case (slot) qui avance :
  image_en_cours -> a_valider -> valide -> video_en_cours -> livre   (attente_motif apres un refus ; abandonne)
Un casting avance :
  candidats_en_cours -> candidats_prets -> (vous choisissez dans Studio) -> refs_en_cours -> refs_pretes
  -> (vous activez le personnage dans Studio)"""
import datetime as dt
import json
import os
import time

from . import drive, resultats, scenarios
from .base import (PUBLIC, RACINE, SIMULATION, TECH, dossier_travail, heure, horodatage, jour, lien_studio, log,
                   maintenant)
from .controles import (Visage, controler_image, controler_video, description_casting, identite_depuis_photo,
                        traduire, traduire_motif)
from .kie import Kie, telecharger
from .montage import duree, monter

FINIS = ("livre", "abandonne")
ACTIFS = ("image_en_cours", "valide", "video_en_cours", "attente_motif")
CASTING_ACTIFS = ("candidats_en_cours", "refs_en_cours")
NB_CANDIDATS, NB_REFS = 6, 4


def fmt_h(h):
    return f"{int(h)} h" + (f" {int(round((h % 1) * 60)):02d}" if h % 1 else "")


ETAT_VIDE = {"historique": [], "regles_apprises": [], "jours": {},
             "personnages": {}, "castings": {}, "journal": [], "traductions": {}, "depenses": {}}


class Machine:
    def __init__(self):
        self.kie = Kie()
        self.cfg = drive.config()
        if not self.cfg:
            raise RuntimeError("aucun réglage trouvé dans le Drive : ouvrez le Studio et enregistrez une fois")
        self.etat = {**json.loads(json.dumps(ETAT_VIDE)), **drive.etat_lire()}
        self._sauve = json.dumps(self.etat, sort_keys=True)
        self._visages = {}
        self._res, self._res_ko = None, False

    # ------------------------------------------------------------------ outils
    @property
    def general(self):
        return self.cfg.get("general", {})

    @property
    def pause(self):
        return bool(self.general.get("pause"))

    @property
    def res(self):
        """Fiches des videos + chiffres TikTok (resultats.json), lu une seule fois par passage."""
        if self._res is None:
            try:
                self._res = resultats.lire()
                self._res_ko = False
            except Exception as e:  # ex. script Google pas encore mis a jour : la production continue quand meme
                log(f"résultats illisibles ({e}) : fiches non enregistrées pendant ce passage")
                self._res, self._res_ko = json.loads(json.dumps(resultats.VIDE)), True
            self._res_sauve = json.dumps(self._res, sort_keys=True)
        return self._res

    @property
    def j(self):
        return self.etat["jours"].get(jour())

    def sauver(self, force=False):
        texte = json.dumps(self.etat, sort_keys=True)
        if force or texte != self._sauve:
            self.etat["maj"] = horodatage()
            jours = sorted(self.etat["jours"])
            for vieux in jours[:-14]:
                del self.etat["jours"][vieux]
            self.etat["journal"] = self.etat["journal"][-80:]
            self.etat["historique"] = self.etat["historique"][-500:]
            drive.etat_ecrire(self.etat)
            self._sauve = json.dumps(self.etat, sort_keys=True)
        if self._res is not None and not self._res_ko and json.dumps(self._res, sort_keys=True) != self._res_sauve:
            try:
                resultats.ecrire(self._res)
                self._res_sauve = json.dumps(self._res, sort_keys=True)
            except Exception as e:
                log(f"résultats non enregistrés : {e}")

    def noter(self, texte, public=None):
        """Journal complet dans Studio ; `public` = version courte pour les journaux GitHub (visibles de tous)."""
        log(public if (public is not None and PUBLIC) else texte)
        self.etat["journal"].append({"quand": horodatage(), "texte": texte})

    def alerte(self, texte, sujet="Studio : information", public=None):
        """Note dans le journal (visible dans Studio) et envoie un e-mail aux personnes autorisees."""
        self.noter(texte, public if public is not None else sujet)
        try:
            drive.notifier(sujet, texte + lien_studio())
        except Exception as e:
            log(f"e-mail impossible : {e}")

    def projet(self, pid):
        return next((p for p in self.cfg.get("projets", []) if p["id"] == pid), None)

    def perso(self, pid):
        return next((p for p in self.cfg.get("personnages", []) if p["id"] == pid), None)

    def refs_locales(self, pid):
        d = dossier_travail("refs", pid)
        if not os.listdir(d):
            for f in drive.lister(["personnages", pid]):
                if f["nom"].lower().endswith((".png", ".jpg", ".jpeg", ".webp")):
                    drive.lire(f["id"], os.path.join(d, f["nom"]))
        if not os.listdir(d):
            raise RuntimeError(f"aucune photo de référence pour {pid} dans le Drive (personnages/{pid})")
        return d

    def visage(self, pid):
        if pid not in self._visages:
            self._visages[pid] = Visage(self.refs_locales(pid))
        return self._visages[pid]

    def refs_urls(self, pid):
        """Photos de reference mises en ligne chez KIE (une fois par jour : les liens expirent)."""
        info = self.etat["personnages"].setdefault(pid, {})
        if info.get("refs_jour") != jour() or not info.get("refs_urls"):
            d = self.refs_locales(pid)
            info["refs_urls"] = [self.kie.envoyer(os.path.join(d, n)) for n in sorted(os.listdir(d))]
            info["refs_jour"] = jour()
        return info["refs_urls"]

    def credits_du_jour(self):
        actuel = self.kie.credits()
        if actuel is not None:
            self.etat["solde_kie"] = actuel
        somme = float(sum(s.get("credits", 0) for s in (self.j or {}).get("slots", [])))
        somme += float(self.etat["depenses"].get(jour() + "_casting", 0))
        debut = (self.j or {}).get("credits_debut")
        if actuel is not None and debut is not None:
            return max(somme, debut - actuel), actuel
        return somme, actuel

    def budget_ok(self):
        utilises, actuel = self.credits_du_jour()
        budget = float(self.general.get("budget_credits_jour", 1600))
        if utilises >= budget:
            cle = jour() + "_alerte_budget"
            if not self.etat["depenses"].get(cle):
                self.etat["depenses"][cle] = True
                self.alerte(f"🛑 Budget du jour atteint ({utilises:.0f} crédits ≈ {utilises * TECH['prix_credit_usd']:.2f} $). "
                                "Plus aucune génération aujourd'hui. Vous pouvez l'augmenter dans Studio (Réglages).")
                self.noter("budget du jour atteint")
            return False
        return True

    def limite(self):
        c = dt.datetime.fromisoformat(self.j["cree"])
        return max(float(self.general.get("heure_limite_validation", 8)), c.hour + c.minute / 60 + 2)

    def derniere(self):
        c = dt.datetime.fromisoformat(self.j["cree"])
        return max(TECH["derniere_heure_de_validation"], c.hour + c.minute / 60 + 4)

    def titre(self, s):
        p, pe = self.projet(s["projet"]) or {}, self.perso(s["personnage"]) or {}
        return f"{p.get('nom', s['projet'])} · {pe.get('nom', s['personnage'])} · vidéo {s['num']}/{s['sur']}"

    # ------------------------------------------------------------------ matin
    def matin(self):
        if self.j:
            log("journée déjà commencée : on poursuit")
            return self.avancer()
        if self.pause:
            self.noter("matin : machine en pause, rien n'est lancé")
            return self.sauver(force=True)
        credits = self.kie.credits()
        seuil = float(self.general.get("alerte_si_credits_sous", 3000))
        if credits is not None and credits < seuil:
            self.alerte(f"⚠️ Solde KIE bas : {credits:.0f} crédits. Pensez à recharger, sinon la production s'arrêtera.")
        self.etat["jours"][jour()] = {"cree": horodatage(), "credits_debut": credits, "slots": []}
        resume = []
        semaine = maintenant().isoweekday()
        for projet in self.cfg.get("projets", []):
            if not projet.get("actif") or semaine not in (projet.get("jours") or range(1, 8)):
                continue
            poids = {pid: p for pid, p in (projet.get("personnages") or {}).items()
                     if (self.perso(pid) or {}).get("statut") == "actif"}
            nb = int(os.environ.get("NB_VIDEOS") or projet.get("videos_par_jour", 0))
            qui = scenarios.repartir(nb, poids)
            if not qui:
                self.noter(f"{projet['nom']} : aucun personnage actif attribué, rien à produire")
                continue
            try:
                combos = scenarios.choisir(projet, [self.perso(q) for q in qui], self.etat["historique"])
            except Exception as e:
                self.noter(f"{projet['nom']} : impossible de préparer la journée ({e})")
                self.alerte(f"⚠️ {projet['nom']} : {e}. Corrigez dans Studio.")
                continue
            for n, c in enumerate(combos, 1):
                self.j["slots"].append({"id": f"{projet['id']}-{n}", "num": n, "sur": len(combos), **c,
                                        "statut": "nouveau", "essai": 0, "essais_auto": 0, "refus": 0,
                                        "essais_video": 0, "erreurs": 0, "essais": []})
                self.etat["historique"].append({"jour": jour(), **{k: c[k] for k in
                                                ("projet", "personnage", "hook", "decor", "tenue", "reaction")}})
            resume.append(f"{projet['nom']} : {len(combos)}")
        if not self.j["slots"]:
            self.noter("matin : aucun projet à produire aujourd'hui")
            return self.sauver(force=True)
        for s in self.j["slots"]:
            try:
                self.lancer_image(s)
            except Exception as e:
                s["erreurs"] += 1
                self.noter(f"{s['id']} : lancement impossible ({e})")
        self.noter("matin : " + ", ".join(resume))
        self.sauver()
        self.avancer()

    # ------------------------------------------------------------------ boucle
    def avancer(self):
        debut, tours = time.time(), 0
        while True:
            tours += 1
            self.lire_decisions()
            if not self.pause:
                self.castings()
                if self.j:
                    for s in self.j["slots"]:
                        if s["statut"] in FINIS:
                            continue
                        try:
                            self.etape(s)
                        except Exception as ex:
                            s["erreurs"] = s.get("erreurs", 0) + 1
                            log(f"{s['id']} : erreur {ex}")
                            if s["erreurs"] >= 3:
                                s["statut"] = "abandonne"
                                self.noter(f"{s['id']} abandonnée après 3 erreurs : {ex}")
                                self.alerte(f"⚠️ {self.titre(s)} abandonnée après 3 erreurs techniques : {ex}")
                        self.sauver()
                    self.fin_de_journee()
            self.sauver()
            en_cours = not self.pause and (
                (self.j and any(s["statut"] in ACTIFS for s in self.j["slots"])) or
                any(c.get("statut") in CASTING_ACTIFS for c in self.etat["castings"].values()))
            if not en_cours or time.time() - debut > TECH["minutes_max_par_passage"] * 60 or (SIMULATION and tours >= 3):
                break
            time.sleep(0 if SIMULATION else 20)

    def contexte(self, s):
        perso, projet = self.perso(s["personnage"]), self.projet(s["projet"])
        if not perso or not projet:
            raise RuntimeError("projet ou personnage supprimé dans Studio")
        contraintes = " ".join(x for x in (traduire(self.kie, projet.get("contraintes"), self.etat["traductions"]),
                                           traduire(self.kie, perso.get("notes"), self.etat["traductions"])) if x)
        return perso, projet, contraintes

    def etape(self, s):
        st = s["statut"]
        if st == "nouveau":
            self.lancer_image(s)
        elif st == "image_en_cours":
            res, urls, credits = self.kie.etat(s["tache_image"])
            if res == "attente":
                return
            s["credits"] = s.get("credits", 0) + (credits or 0)
            if res == "echec" or not urls:
                s["erreurs"] = s.get("erreurs", 0) + 1
                if s["erreurs"] < 3:
                    return self.lancer_image(s)
                s["statut"] = "abandonne"
                self.noter(f"{s['id']} : la génération d'image échoue ({urls})")
                return self.alerte(f"⚠️ {self.titre(s)} : la génération d'image échoue ({urls}).")
            self.image_prete(s, urls[0])
        elif st == "a_valider":
            if heure() >= self.limite() and s.get("controle_ok"):
                s.update(statut="valide", valide_par="auto")
                self.noter(f"{s['id']} : partie automatiquement à {fmt_h(self.limite())} (tous les contrôles OK)")
            elif heure() >= self.derniere():
                s["statut"] = "abandonne"
                self.noter(f"{s['id']} : non validée, abandonnée pour aujourd'hui")
        elif st == "attente_motif":
            attente = (maintenant() - dt.datetime.fromisoformat(s["refuse_a"])).total_seconds()
            if attente > 600 or heure() >= self.limite():
                self.lancer_image(s, "Make a clearly different variation and fix anything that looks unrealistic.")
        elif st == "valide":
            if not self.budget_ok():
                return
            perso, projet, _ = self.contexte(s)
            s["essais_video"] += 1
            s["tache_video"] = self.kie.lancer_video(projet.get("modele_video", "kling"),
                                                     scenarios.prompt_video(s, perso), s["image_url"])
            s["statut"] = "video_en_cours"
            log(f"{s['id']} : vidéo lancée")
        elif st == "video_en_cours":
            res, urls, credits = self.kie.etat(s["tache_video"])
            if res == "attente":
                return
            s["credits"] = s.get("credits", 0) + (credits or 0)
            if res == "echec" or not urls:
                return self.video_ratee(s, f"génération échouée ({urls})")
            self.video_prete(s, urls[0])

    # ------------------------------------------------------------------ images
    def lancer_image(self, s, correction=""):
        if not self.budget_ok():
            s["statut"] = "nouveau"
            return
        perso, projet, contraintes = self.contexte(s)
        s["essai"] += 1
        s["prompt_image"] = scenarios.prompt_image(s, perso, self.etat["regles_apprises"], contraintes, correction)
        s["tache_image"] = self.kie.lancer_image(TECH["modele_image"], s["prompt_image"], self.refs_urls(perso["id"]),
                                                 TECH["resolution_image"])
        s["statut"] = "image_en_cours"
        log(f"{s['id']} : image essai {s['essai']} lancée")

    def image_prete(self, s, url):
        chemin = os.path.join(dossier_travail(jour()), f"{s['id']}_e{s['essai']}.png")
        telecharger(url, chemin)
        ok, rapport = controler_image(self.kie, self.visage(s["personnage"]), TECH, chemin, url, self.etat["regles_apprises"])
        s["essais"].append({"essai": s["essai"], "url": url, "ok_auto": ok, "probleme": rapport.get("probleme", "")})
        s.update(image_url=url, controle=rapport, controle_ok=ok)
        if not ok and s["essais_auto"] < TECH["essais_auto_image"]:
            s["essais_auto"] += 1
            log(f"{s['id']} : contrôle auto KO ({rapport.get('probleme')}), nouvel essai")
            return self.lancer_image(s, rapport.get("probleme", ""))
        s["statut"] = "a_valider"
        s["envoye_a"] = horodatage()
        self.prevenir_images()

    def prevenir_images(self):
        """Un seul e-mail par jour, quand toutes les images du matin sont pretes a valider."""
        j = self.j
        if not j or j.get("mail_images"):
            return
        if any(x["statut"] in ("nouveau", "image_en_cours") for x in j["slots"]):
            return
        n = sum(x["statut"] == "a_valider" for x in j["slots"])
        if not n:
            return
        j["mail_images"] = horodatage()
        self.alerte(f"{n} image(s) prête(s) à valider dans Studio. À {fmt_h(self.limite())}, celles qui ont passé "
                    "tous les contrôles partiront en vidéo automatiquement.", f"Studio : {n} image(s) à valider")

    # ------------------------------------------------------------------ videos
    def video_ratee(self, s, raison):
        if s["essais_video"] < TECH["essais_video"]:
            log(f"{s['id']} : vidéo ratée ({raison}), nouvel essai")
            s["statut"] = "valide"
        else:
            s["statut"] = "abandonne"
            self.noter(f"{s['id']} abandonnée : vidéo ratée {s['essais_video']} fois ({raison})")
            self.alerte(f"⚠️ {self.titre(s)} abandonnée : la vidéo a échoué {s['essais_video']} fois ({raison}).")

    def demos_dispo(self):
        """Corps de démo déposés dans le Drive (MACHINE CONTENU/demos), lus une fois par passage."""
        if not hasattr(self, "_demos"):
            try:
                self._demos = sorted((f for f in drive.lister(["demos"]) if f["nom"].lower().endswith(".mp4")),
                                     key=lambda f: f["nom"])
            except Exception as e:
                log(f"liste des démos illisible : {e}")
                self._demos = []
        return self._demos

    def demo_locale(self, projet, s=None):
        """« defaut » = rotation de toutes les démos du Drive : jamais deux fois la même démo le même jour,
        la moins utilisée d'abord. Sinon : l'identifiant Drive d'une démo précise."""
        d = projet.get("demo") or "defaut"
        if d != "defaut":
            chemin = os.path.join(dossier_travail("demos"), f"{projet['id']}_{d}.mp4")
            if not os.path.exists(chemin):
                drive.lire(d, chemin)
            if s is not None:
                s["demo"] = d
            return chemin
        demos = self.demos_dispo()
        if not demos:
            if s is not None:
                s["demo"] = "corps_demo"
            return os.path.join(RACINE, "medias", "corps_demo.mp4")
        if s is not None and s.get("demo") in {f["nom"] for f in demos}:
            choix = next(f for f in demos if f["nom"] == s["demo"])  # nouvel essai : même démo
        else:
            du_jour = {x.get("demo") for x in (self.j or {}).get("slots", []) if x is not s}
            compte = self.etat.setdefault("demos_utilisees", {})
            choix = min(demos, key=lambda f: (f["nom"] in du_jour, compte.get(f["nom"], 0), f["nom"]))
            compte[choix["nom"]] = compte.get(choix["nom"], 0) + 1
            if s is not None:
                s["demo"] = choix["nom"]
        chemin = os.path.join(dossier_travail("demos"), choix["nom"])
        if not os.path.exists(chemin):
            drive.lire(choix["id"], chemin)
        return chemin

    def video_prete(self, s, url):
        d = dossier_travail(jour(), f"{s['id']}_v{s['essais_video']}")
        hook = telecharger(url, os.path.join(d, "hook.mp4"))
        ok, rapport = controler_video(self.kie, self.visage(s["personnage"]), TECH, hook, d, self.etat["regles_apprises"])
        s["controle_video"] = rapport
        if not ok:
            return self.video_ratee(s, rapport.get("probleme", ""))
        perso, projet, _ = self.contexte(s)
        nom = f"{jour()}_{s['id']}_{s['personnage']}_{s['hook']}.mp4"
        finale = monter(hook, s["texte"], os.path.join(d, nom), self.demo_locale(projet, s))
        s["drive_url"] = drive.deposer(finale, "videos", [projet["nom"], jour()])
        s["statut"] = "livre"
        s["livre_a"] = horodatage()
        try:
            s["duree"] = round(duree(finale), 3)
        except Exception as e:
            log(f"durée illisible : {e}")
        f = resultats.fiche_depuis_slot(jour(), s, projet, s.get("duree"))
        self.res["fiches"][f["id"]] = f
        self.noter(f"{s['id']} livrée")

    # ------------------------------------------------------------------ castings
    def depense_casting(self, credits):
        k = jour() + "_casting"
        self.etat["depenses"][k] = self.etat["depenses"].get(k, 0) + (credits or 0)

    def castings(self):
        for perso in self.cfg.get("personnages", []):
            if perso.get("statut") != "casting":
                continue
            pid, essai = perso["id"], int(perso.get("essai_casting") or 1)
            c = self.etat["castings"].get(pid)
            try:
                if not c or c.get("essai") != essai:
                    if not self.budget_ok():
                        return
                    desc = description_casting(self.kie, perso)
                    taches = [self.kie.lancer_image(TECH["modele_image"], scenarios.prompt_candidat(desc, perso.get("genre"), i),
                                                    [], TECH["resolution_image"]) for i in range(NB_CANDIDATS)]
                    self.etat["castings"][pid] = {"essai": essai, "statut": "candidats_en_cours", "description_en": desc,
                                                  "taches": taches, "candidats": [], "depuis": horodatage()}
                    self.noter(f"casting {perso['nom']} : {NB_CANDIDATS} candidats en cours", f"casting {pid} : {NB_CANDIDATS} candidats en cours")
                elif c["statut"] == "candidats_en_cours":
                    urls = self._suivre(c)
                    if urls is not None:
                        c.update(statut="candidats_prets", candidats=urls, taches=[])
                        self.noter(f"casting {perso['nom']} : {len(urls)} candidats prêts", f"casting {pid} : {len(urls)} candidats prêts")
                        self.alerte(f"🎭 Casting « {perso['nom']} » : {len(urls)} candidats prêts. "
                                        "Choisissez le bon dans Studio (Personnages).")
                elif c["statut"] == "candidats_prets" and perso.get("choix") is not None:
                    if not self.budget_ok():
                        return
                    url = c["candidats"][int(perso["choix"])]
                    c.update(choix=int(perso["choix"]), statut="refs_en_cours", depuis=horodatage(),
                             taches=[self.kie.lancer_image(TECH["modele_image"], scenarios.prompt_ref(perso.get("genre"), i),
                                                           [url], TECH["resolution_image"]) for i in range(NB_REFS)])
                    self.noter(f"casting {perso['nom']} : photos de référence en cours", f"casting {pid} : photos de référence en cours")
                elif c["statut"] == "refs_en_cours":
                    urls = self._suivre(c)
                    if urls is not None:
                        self._finir_casting(perso, c, urls)
            except Exception as e:
                self.noter(f"casting {perso.get('nom')} : erreur {e}", f"casting {perso.get('id')} : erreur {e}")

    def _suivre(self, c):
        """Renvoie la liste des URLs quand toutes les taches sont finies, sinon None."""
        res = c.setdefault("resultats", {})
        for i, t in enumerate(c["taches"]):
            if str(i) in res:
                continue
            r, urls, credits = self.kie.etat(t)
            if r != "attente":
                self.depense_casting(credits)
                res[str(i)] = urls[0] if r == "ok" and urls else None
        if len(res) < len(c["taches"]):
            return None
        urls = [res[str(i)] for i in range(len(c["taches"])) if res.get(str(i))]
        c["resultats"] = {}
        return urls

    def _finir_casting(self, perso, c, urls):
        pid = perso["id"]
        d = dossier_travail("casting", pid, str(c["essai"]))
        base = os.path.join(d, "base")
        os.makedirs(base, exist_ok=True)
        choisi = c["candidats"][c["choix"]]
        telecharger(choisi, os.path.join(base, "ref0_choisi.png"))
        v = Visage(base)
        gardes = []
        for i, u in enumerate(urls, 1):
            p = telecharger(u, os.path.join(d, f"ref{i}.png"))
            s = v.score(p)
            gardes.append((s, p, u))
        gardes.sort(reverse=True)
        bons = [g for g in gardes if g[0] >= TECH["seuil_visage"]] or gardes[:2]
        for _, p, _ in bons:
            drive.deposer(p, "machine", ["personnages", pid], mime="image/png")
        drive.deposer(os.path.join(base, "ref0_choisi.png"), "machine", ["personnages", pid], mime="image/png")
        identite = identite_depuis_photo(self.kie, choisi, perso.get("genre")) or perso.get("description", "")
        c.update(statut="refs_pretes", refs=[choisi] + [u for _, _, u in bons], identite=identite,
                 scores=[round(g[0], 3) for g in bons], taches=[], fini=horodatage())
        self.etat["personnages"].setdefault(pid, {}).update(refs_urls=c["refs"], refs_jour=jour())
        self.noter(f"casting {perso['nom']} : terminé ({len(bons)} photos gardées)", f"casting {pid} : terminé ({len(bons)} photos gardées)")
        self.alerte(f"✅ « {perso['nom']} » est prêt ({len(bons) + 1} photos de référence). "
                        "Vérifiez-le et activez-le dans Studio pour qu'il entre en production.")

    # ------------------------------------------------------------------ decisions prises dans Studio
    def slot(self, j, sid):
        jr = self.etat["jours"].get(j)
        return next((s for s in jr["slots"] if s["id"] == sid), None) if jr else None

    def lire_decisions(self):
        try:
            decisions = drive.decisions_lire()
        except Exception as ex:
            log(f"lecture des décisions impossible : {ex}")
            return
        faites = []
        for d in decisions:
            try:
                if d.get("type") == "image":
                    self.decision_image(d)
                elif d.get("type") == "regle_oublier":
                    avant = len(self.etat["regles_apprises"])
                    self.etat["regles_apprises"] = [r for r in self.etat["regles_apprises"] if r.get("fr") != d.get("fr")]
                    if len(self.etat["regles_apprises"]) < avant:
                        self.noter(f"règle retirée par {d.get('qui')} : {d.get('fr')}", "règle retirée")
                elif d.get("type") == "note":
                    f = self.res["fiches"].get(d.get("fiche"))
                    if f:
                        f["note_prevue"] = max(1, min(10, int(d.get("note"))))
                elif d.get("type") == "liaison":
                    v = self.res["videos"].get(str(d.get("video")))
                    if v:
                        v.update(fiche=d.get("fiche") or None, liaison="manuel", possibles=[])
                elif d.get("type") == "releve_tiktok":
                    self._releve_demande = True
            except Exception as ex:
                log(f"décision ignorée ({ex}) : {d}")
            faites.append(d["id"])
        if faites:
            self.sauver()
            try:
                drive.decisions_purger(faites)
            except Exception as ex:
                log(f"purge des décisions impossible : {ex}")

    def decision_image(self, d):
        s = self.slot(d.get("jour"), d.get("slot"))
        if not s or s["statut"] != "a_valider" or str(s["essai"]) != str(d.get("essai")):
            return log(f"décision trop tard ou déjà traitée : {d}")
        qui = d.get("qui") or "?"
        if d.get("choix") == "valide":
            s.update(statut="valide", valide_par=qui)
            return self.noter(f"{s['id']} validée par {qui}")
        s["refus"] += 1
        s["essais"][-1]["refus_humain"] = True
        motif = (d.get("motif") or "").strip()
        correction = "Make a clearly different variation and fix anything that looks unrealistic."
        if motif:
            regle = traduire_motif(self.kie, motif)
            self.etat["regles_apprises"].append({"jour": jour(), "fr": motif, "par": qui, **regle})
            s["motif"] = motif
            correction = regle.get("consigne_prompt") or correction
            self.noter(f"règle apprise ({qui}) : {motif}", "règle apprise")
        if s["refus"] >= TECH["refus_max_par_video"]:
            s["statut"] = "abandonne"
            return self.noter(f"{s['id']} abandonnée pour aujourd'hui ({s['refus']} refus)")
        s["essais_auto"] = 0
        self.noter(f"{s['id']} refusée par {qui} : nouvelle image")
        self.lancer_image(s, correction)

    def resume(self):
        if not self.j:
            return "Pas de production lancée aujourd'hui." + (" (machine en pause)" if self.pause else "")
        noms = {"nouveau": "en attente", "image_en_cours": "image en cours", "a_valider": "à valider",
                "attente_motif": "attend votre motif", "valide": "validée", "video_en_cours": "vidéo en cours",
                "livre": "✅ livrée", "abandonne": "⏹ abandonnée"}
        lignes = [f"{self.titre(s)} : {noms.get(s['statut'], s['statut'])}" for s in self.j["slots"]]
        utilises, actuel = self.credits_du_jour()
        return (f"Journée du {jour()}" + (" (PAUSE)" if self.pause else "") + "\n" + "\n".join(lignes) +
                f"\nCrédits utilisés : {utilises:.0f} (≈ {utilises * TECH['prix_credit_usd']:.2f} $)" +
                (f" · solde {actuel:.0f}" if actuel is not None else ""))

    # ------------------------------------------------------------------ resultats TikTok
    def completer_fiches(self):
        """Cree la fiche des videos livrees qui n'en ont pas encore (ex. livrees avant cette version)."""
        for jr, info in self.etat["jours"].items():
            for s in info.get("slots", []):
                if s.get("statut") == "livre" and f"{jr}_{s['id']}" not in self.res["fiches"]:
                    f = resultats.fiche_depuis_slot(jr, s, self.projet(s["projet"]), s.get("duree"))
                    self.res["fiches"][f["id"]] = f

    def resultats_du_jour(self):
        """Une fois par jour a partir de 9 h (Dubai), ou tout de suite si demande dans Studio."""
        self.completer_fiches()
        if self._res_ko:
            return
        t = self.res.get("tiktok") or {}
        dernier = (t.get("releve") or t.get("essai") or "")[:10]
        if not (getattr(self, "_releve_demande", False) or os.environ.get("RELEVE_TIKTOK") == "1"
                or (heure() >= 9 and dernier != jour())):
            return
        self._releve_demande = False
        try:
            self.noter(resultats.releve(self.res, self.kie, self.cfg))
        except Exception as e:
            self.noter(f"relevé TikTok impossible : {e}")

    # ------------------------------------------------------------------ fin
    def fin_de_journee(self):
        j = self.j
        if not j or j.get("bilan_envoye"):
            return
        if not (all(s["statut"] in FINIS for s in j["slots"]) or heure() >= self.derniere() + 0.75):
            return
        utilises, actuel = self.credits_du_jour()
        j["credits_utilises"] = round(utilises)
        self.etat["depenses"][jour()] = round(utilises)
        lignes = []
        for pid in dict.fromkeys(s["projet"] for s in j["slots"]):
            ss = [s for s in j["slots"] if s["projet"] == pid]
            lignes.append(f"{(self.projet(pid) or {}).get('nom', pid)} : {sum(s['statut'] == 'livre' for s in ss)}/{len(ss)}")
        complet = all(s["statut"] == "livre" for s in j["slots"])
        msg = (("" if complet else "⚠️ ") + f"📊 Bilan du {jour()} — " + " · ".join(lignes) +
               f"\nCrédits : {utilises:.0f} (≈ {utilises * TECH['prix_credit_usd']:.2f} $)" +
               (f" · solde {actuel:.0f}" if actuel is not None else "") + "\nDétail dans Studio.")
        self.alerte(msg, f"Studio : bilan du {jour()}")
        self.noter("bilan : " + " · ".join(lignes))
        j["bilan_envoye"] = True


def executer(commande):
    m = Machine()
    m.etat["derniere_execution"] = {"quand": horodatage(), "commande": commande, "resultat": "en cours"}
    try:
        if commande == "matin":
            m.matin()
        else:
            if not m.j and 4.5 <= heure() < float(m.general.get("heure_limite_validation", 8)) and not m.pause:
                log("le passage du matin n'a pas eu lieu : on le lance maintenant")
                m.matin()
            else:
                m.avancer()
        try:
            m.resultats_du_jour()
        except Exception as e:
            log(f"résultats : {e}")
        m.etat["derniere_execution"]["resultat"] = "ok"
    except Exception as e:
        m.etat["derniere_execution"]["resultat"] = f"erreur : {e}"
        raise
    finally:
        m.etat["derniere_execution"]["fin"] = horodatage()
        try:
            m.sauver(force=True)
        except Exception as e:
            log(f"sauvegarde de l'état impossible : {e}")
