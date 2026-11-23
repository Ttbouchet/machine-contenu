// Studio : l'appli de pilotage de la machine à vidéos.
// Une seule page ; les écrans changent avec l'adresse (#/aujourdhui, #/projets, …).
import { appel, connecter, deconnecter, estLocal, utilisateur } from './api.js';
import { REGLAGES } from './reglages.js';

const S = { cfg: null, etat: {}, decisions: [], brouillon: null, sale: false, catalogue: null, resultats: {}, tiktok: {}, ingredient: 'hook',
            filtre: 'tous', refus: {}, envoi: {}, confirmer: null, charge: false };
const app = document.getElementById('app');

// ------------------------------------------------------------------ outils
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const copie = (o) => JSON.parse(JSON.stringify(o));
const jourDubai = (d = new Date()) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Dubai' });
const heureDubai = () => { const p = new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Dubai', hour12: false }).split(':'); return +p[0] + p[1] / 60; };
const fmtH = (h) => `${Math.floor(h)} h ${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
const nombre = (n) => Math.round(n || 0).toLocaleString('fr-FR');
const ident = (nom) => (String(nom || 'x').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'x') + '-' + Math.random().toString(36).slice(2, 6);
const JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const TONS = { choc: 'Choc', blase: 'Blasé', complice: 'Complice' };
const MODELES_VIDEO = { kling: 'Kling 3.0', veo_fast: 'Veo 3.1 Fast', seedance: 'Seedance 2.0', grok: 'Grok Imagine 1.5' };
const FORMATS = { resultat_dabord: ["Résultat d'abord", '82 % → score bas en 2 s, puis le comment'],
                  ecran_partage: ['Écran partagé', 'Le personnage en haut, la démo en bas'],
                  score_descend: ['Score qui descend', 'Compteur animé + question finale'] };
const STATUTS = { nouveau: ['En attente', ''], image_en_cours: ['Image en cours', 'info'], a_valider: ['À valider', 'att'],
                  attente_motif: ['Refusée : nouvelle image bientôt', 'info'], valide: ['Validée : vidéo bientôt', 'info'],
                  video_en_cours: ['Vidéo en cours', 'info'], livre: ['Livrée dans le Drive', 'ok'], abandonne: ['Abandonnée', 'ko'] };
const MOTIFS_RAPIDES = ['Ne lui ressemble pas', 'Deux mains / bras bizarre', 'Fait trop IA', 'Objet en trop à l\'image'];

const icone = {
  jour: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"></path></svg>',
  dossier: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path></svg>',
  perso: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="8" r="4"></circle><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"></path></svg>',
  banc: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"></path></svg>',
  histo: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"></path><path d="M3 3v5h5M12 7v5l3 2"></path></svg>',
  resultats: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 17l6-6 4 4 8-8"></path><path d="M15 7h6v6"></path></svg>',
  calendrier: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"></rect><path d="M3 10h18M8 3v4M16 3v4"></path></svg>',
  veille: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="M21 21l-4.3-4.3"></path></svg>',
  reglages: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"></path><circle cx="16" cy="6" r="2"></circle><circle cx="10" cy="12" r="2"></circle><circle cx="18" cy="18" r="2"></circle></svg>',
};

function toast(t) {
  const el = document.getElementById('toast');
  el.textContent = t; el.classList.add('visible');
  clearTimeout(toast.m); toast.m = setTimeout(() => el.classList.remove('visible'), 3200);
}

function urlImage(u) {
  if (!u) return '';
  if (u.startsWith('simu://')) return '/simu?f=' + encodeURIComponent(u.slice(7));
  return u;
}

const projet = (id) => (S.cfg?.projets || []).find((p) => p.id === id);
const perso = (id) => (S.cfg?.personnages || []).find((p) => p.id === id);
const nomProjet = (id) => projet(id)?.nom || id;
const nomPerso = (id) => perso(id)?.nom || id;
const aujourdhui = () => (S.etat.jours || {})[jourDubai()];
const slotsDuJour = () => aujourdhui()?.slots || [];
const decisionPour = (s) => S.decisions.find((d) => d.type === 'image' && d.jour === jourDubai() && d.slot === s.id && String(d.essai) === String(s.essai));
const aValider = () => slotsDuJour().filter((s) => s.statut === 'a_valider' && !decisionPour(s));
function photoPerso(pid) {
  const info = (S.etat.personnages || {})[pid] || {};
  const c = (S.etat.castings || {})[pid] || {};
  return urlImage((info.refs_urls || [])[0] || (c.refs || [])[0] || '');
}
function limiteDuJour() {
  const j = aujourdhui();
  const base = +(S.cfg?.general?.heure_limite_validation ?? 8);
  if (!j?.cree) return base;
  const c = new Date(j.cree); const h = c.getHours() + c.getMinutes() / 60;
  return Math.max(base, h + 2);
}
function creditsDuJour() {
  const j = aujourdhui() || {};
  return (j.slots || []).reduce((a, s) => a + (s.credits || 0), 0) + ((S.etat.depenses || {})[jourDubai() + '_casting'] || 0);
}

// ------------------------------------------------------------------ chargement / enregistrement
async function recharger(silencieux) {
  try {
    const b = await appel('app_charger');
    S.etat = b.etat || {}; S.decisions = b.decisions || []; S.resultats = b.resultats || {}; S.tiktok = b.tiktok || {};
    if (!S.sale) {
      S.cfg = b.config || { version: 0, general: { pause: false, budget_credits_jour: 1600, heure_limite_validation: 8, alerte_si_credits_sous: 3000 }, projets: [], personnages: [] };
      S.brouillon = copie(S.cfg);
    }
    S.charge = true;
    rendre();
    if (!silencieux) toast('À jour');
  } catch (e) {
    if (/connexion expirée|reconnectez/.test(e.message)) return location.reload();
    if (!S.charge) return ecranErreur(e.message);
    toast('Actualisation impossible : ' + e.message);
  }
}

async function enregistrer() {
  try {
    const b = await appel('app_config_ecrire', { config: S.brouillon });
    S.cfg = b.config; S.brouillon = copie(S.cfg); S.sale = false;
    rendre(); toast('Enregistré. La machine en tiendra compte au prochain passage.');
  } catch (e) { toast('Pas enregistré : ' + e.message); }
}

function modifier() {
  S.sale = true;
  const barre = document.querySelector('.barre-enregistrer');
  if (barre) barre.hidden = false;
}

async function decider(decision, message) {
  try {
    const b = await appel('app_decider', { decision });
    S.decisions.push(b.decision);
    rendre(); toast(message);
  } catch (e) { toast('Non envoyé : ' + e.message); }
}

// ------------------------------------------------------------------ cadre
function cadre(page, html) {
  const n = aValider().length;
  const liens = [['aujourdhui', 'Aujourd\'hui', icone.jour, n], ['projets', 'Projets', icone.dossier], ['personnages', 'Personnages', icone.perso],
                 ['resultats', 'Résultats', icone.resultats], ['calendrier', 'Calendrier', icone.calendrier], ['veille', 'Veille', icone.veille], ['banc', 'Banc d\'essai IA', icone.banc], ['historique', 'Historique', icone.histo], ['reglages', 'Réglages', icone.reglages]];
  const lien = ([id, nom, ic, badge]) => `<a href="#/${id}" ${page === id ? 'aria-current="page"' : ''}>${ic}<span>${nom}</span>${badge ? `<span class="pastille">${badge}</span>` : ''}</a>`;
  const solde = S.etat.solde_kie;
  return `<div class="cadre">
    <nav class="menu" aria-label="Navigation">
      <div class="marque"><span class="logo">S</span>Studio</div>
      ${liens.map(lien).join('')}
      <div class="menu-pied">
        ${solde != null ? `<div>Solde KIE : <strong style="color:var(--encre)">${nombre(solde)} crédits</strong></div>` : ''}
        <div>${esc(utilisateur())}</div>
        <button type="button" class="lien-bouton" data-action="actualiser">Actualiser</button>
      </div>
    </nav>
    <main class="contenu" id="contenu">${html}</main>
    <nav class="onglets" aria-label="Navigation">${liens.filter((l) => !['historique', 'banc', 'veille'].includes(l[0])).map(([id, nom, ic, badge]) =>
      `<a href="#/${id}" ${page === id ? 'aria-current="page"' : ''}>${ic}<span>${nom.replace(' IA', '')}</span>${badge ? `<span class="pastille">${badge}</span>` : ''}</a>`).join('')}</nav>
  </div>`;
}

function barreEnregistrer() {
  return `<div class="barre-enregistrer" ${S.sale ? '' : 'hidden'}><span>Modifications non enregistrées</span>
    <span class="ligne"><button type="button" class="bouton" data-action="annuler" style="background:transparent;color:#fff;border-color:#52525B">Annuler</button>
    <button type="button" class="bouton principal" data-action="enregistrer">Enregistrer</button></span></div>`;
}

// ------------------------------------------------------------------ écran : Aujourd'hui
function vueAujourdhui() {
  const j = aujourdhui();
  const slots = slotsDuJour();
  const pause = S.cfg.general?.pause || S.etat.pause_telegram;
  const budget = +(S.cfg.general?.budget_credits_jour || 1600);
  const credits = creditsDuJour();
  const limite = limiteDuJour();
  const reste = limite - heureDubai();
  const dateLongue = new Date().toLocaleDateString('fr-FR', { timeZone: 'Asia/Dubai', weekday: 'long', day: 'numeric', month: 'long' });
  const projetsDuJour = [...new Set(slots.map((s) => s.projet))];
  const visibles = slots.filter((s) => S.filtre === 'tous' || s.projet === S.filtre);
  const cartes = visibles.filter((s) => s.statut === 'a_valider' || S.envoi[s.id]);
  let h = `<header class="entete"><div><div class="sur-titre">${esc(dateLongue)} · heure de Dubaï</div><h1>Images du jour à valider</h1></div>
    <button type="button" class="bouton" data-action="actualiser">Actualiser</button>`;
  if (j && aValider().length && reste > 0) {
    h += `<div class="bandeau att">${icone.histo}<span>Départ automatique à <strong>${fmtH(limite)}</strong> (dans ${fmtH(reste)}) : seules les images qui passent tous les contrôles partiront.</span></div>`;
  }
  h += `</header>`;
  if (pause) h += `<div class="bandeau ko">Machine en pause : rien n'est généré ni dépensé. <a href="#/reglages">Réglages</a></div>`;
  const livres = slots.filter((s) => s.statut === 'livre').length;
  const enVideo = slots.filter((s) => ['valide', 'video_en_cours'].includes(s.statut)).length;
  h += `<section class="grille g4" aria-label="Résumé">
    <div class="carte serree chiffre">À valider<b>${aValider().length}</b></div>
    <div class="carte serree chiffre">Vidéos en préparation<b>${enVideo}</b></div>
    <div class="carte serree chiffre">Livrées dans le Drive<b>${livres} <small>/ ${slots.length}</small></b></div>
    <div class="carte serree chiffre">Dépensé aujourd'hui<b>${nombre(credits)} <small>/ ${nombre(budget)} crédits</small></b><div class="jauge"><i style="width:${Math.min(100, credits / budget * 100)}%"></i></div></div>
  </section>`;
  if (!j) {
    h += `<div class="vide">Pas encore de production aujourd'hui.<br>Les images arrivent vers 4 h (heure de Dubaï)${S.cfg.projets.some((p) => p.actif) ? '' : ' — aucun projet actif pour l\'instant'}.</div>`;
    return h;
  }
  if (projetsDuJour.length > 1) {
    h += `<div class="puces-choix" role="group" aria-label="Filtrer par projet">
      <button type="button" data-action="filtre" data-id="tous" aria-pressed="${S.filtre === 'tous'}">Tous</button>
      ${projetsDuJour.map((p) => `<button type="button" data-action="filtre" data-id="${esc(p)}" aria-pressed="${S.filtre === p}">${esc(nomProjet(p))}</button>`).join('')}</div>`;
  }
  if (cartes.length) {
    h += `<section class="grille auto" aria-label="Images à valider">${cartes.map(carteImage).join('')}</section>`;
  } else {
    h += `<div class="vide">Aucune image à valider pour l'instant.${slots.some((s) => s.statut === 'image_en_cours') ? ' Des images sont en préparation : actualisez dans quelques minutes.' : ''}</div>`;
  }
  h += `<section class="carte" aria-label="Suivi"><h2>Où en sont les vidéos du jour</h2><div class="tableau"><table>
    <thead><tr><th>Vidéo</th><th>Personnage</th><th>Texte</th><th>État</th><th>Crédits</th></tr></thead><tbody>
    ${visibles.map((s) => { const [lib, cl] = STATUTS[s.statut] || [s.statut, '']; const d = decisionPour(s);
      return `<tr><td>${esc(nomProjet(s.projet))} · ${s.num}/${s.sur}</td><td>${esc(nomPerso(s.personnage))}</td><td>${esc(s.texte)}</td>
      <td><span class="puce ${cl}">${d ? (d.choix === 'valide' ? 'Validée : prise en compte au prochain passage' : 'Refusée : prise en compte au prochain passage') : lib}</span>
      ${s.drive_url && !s.drive_url.startsWith('simu') ? ` <a href="${esc(s.drive_url)}" target="_blank" rel="noopener">voir</a>` : ''}</td>
      <td>${nombre(s.credits)}</td></tr>`; }).join('')}
    </tbody></table></div></section>`;
  return h;
}

function carteImage(s) {
  const c = s.controle || {};
  const d = decisionPour(s);
  const refus = S.refus[s.id];
  let bas;
  if (d) {
    bas = d.choix === 'valide'
      ? `<div class="fin" style="background:var(--vert-pale);color:var(--vert)">Validée par ${esc(d.qui)} : la vidéo part au prochain passage</div>`
      : `<div class="fin" style="background:var(--bleu-pale);color:var(--bleu)">Refusée : nouvelle image au prochain passage${d.motif ? ` (règle : « ${esc(d.motif)} »)` : ''}</div>`;
  } else if (refus) {
    bas = `<div style="display:flex;flex-direction:column;gap:8px;margin-top:auto">
      <label class="champ" for="motif-${esc(s.id)}">Qu'est-ce qui ne va pas ? <small>Devient une règle pour toutes les prochaines images.</small></label>
      <div class="motifs">${MOTIFS_RAPIDES.map((m) => `<button type="button" data-action="motif-rapide" data-id="${esc(s.id)}" data-motif="${esc(m)}">${esc(m)}</button>`).join('')}</div>
      <input class="saisie" id="motif-${esc(s.id)}" type="text" placeholder="Autre chose…" value="${esc(refus.motif || '')}" data-action-saisie="motif" data-id="${esc(s.id)}">
      <div class="actions"><button type="button" class="bouton" data-action="annuler-refus" data-id="${esc(s.id)}">Annuler</button>
      <button type="button" class="bouton noir" data-action="envoyer-refus" data-id="${esc(s.id)}">Refaire l'image</button></div></div>`;
  } else {
    bas = `<div class="actions"><button type="button" class="bouton principal grand" data-action="valider" data-id="${esc(s.id)}">Valider</button>
      <button type="button" class="bouton grand" data-action="refuser" data-id="${esc(s.id)}">Refaire</button></div>`;
  }
  const visage = c.visage != null ? `<span class="puce ${c.visage >= 0.38 ? 'ok' : 'ko'}">Visage ${String(c.visage).replace('.', ',')}</span>` : '';
  const auto = s.controle_ok ? '<span class="puce ok">Contrôles auto OK</span>'
    : `<span class="puce att">${esc(c.probleme_fr || c.probleme || 'Contrôle auto : à vérifier')}</span>`;
  return `<article class="vignette">
    <div class="photo"><img src="${esc(urlImage(s.image_url))}" alt="Image proposée : ${esc(nomPerso(s.personnage))}" loading="lazy">
      <span class="etiquette">${esc(nomProjet(s.projet))} · vidéo ${s.num}/${s.sur} · essai ${s.essai}</span></div>
    <div class="corps"><div class="hook">« ${esc(s.texte)} »</div>
      <div class="petit">${esc([s.decor, s.tenue, s.cadrage, s.reaction && 'réaction ' + s.reaction].filter(Boolean).join(' · '))}</div>
      <div class="ligne">${visage}${auto}</div>${bas}</div></article>`;
}

// ------------------------------------------------------------------ écran : Projets
function vueProjets() {
  const ps = S.brouillon.projets;
  let h = `<header class="entete"><div><h1>Projets</h1><p class="petit" style="margin-top:6px">Chaque projet a son dossier : ses personnages, ses textes, ses formats, ses vidéos.</p></div>
    <button type="button" class="bouton noir" data-action="nouveau-projet">+ Nouveau projet</button></header>
    <section class="grille auto" style="grid-template-columns:repeat(auto-fill,minmax(290px,1fr))">`;
  for (const p of ps) {
    const persos = Object.entries(p.personnages || {}).filter(([, v]) => v > 0).map(([k]) => k);
    h += `<a class="dossier" href="#/projet/${esc(p.id)}">
      <div class="ligne entre"><div class="ligne">${icone.dossier}<strong style="font-size:18px">${esc(p.nom || 'Sans nom')}</strong></div>
      <span class="puce ${p.actif ? 'ok' : ''}">${p.actif ? 'Actif' : 'En pause'}</span></div>
      <div class="ligne">${persos.slice(0, 4).map((k) => photoPerso(k) ? `<img class="avatar" src="${esc(photoPerso(k))}" alt="${esc(nomPerso(k))}">` : '').join('')}
        <span class="petit">${persos.length ? esc(persos.map(nomPerso).join(', ')) : 'Aucun personnage'}</span></div>
      <div class="grille g3" style="gap:8px">
        <div class="chiffre"><b style="font-size:18px">${p.videos_par_jour || 0}/jour</b>vidéos</div>
        <div class="chiffre"><b style="font-size:18px">${(p.formats || []).length || '—'}</b>formats</div>
        <div class="chiffre"><b style="font-size:18px">${(p.hooks || []).length}</b>textes</div></div>
      <div class="petit" style="border-top:1px solid var(--doux);padding-top:12px">${esc((p.jours?.length ? p.jours.map((n) => JOURS[n - 1]).join(', ') : 'Tous les jours'))} · ${esc(MODELES_VIDEO[p.modele_video] || 'Kling 3.0')}</div>
    </a>`;
  }
  h += `<button type="button" class="dossier nouveau" data-action="nouveau-projet"><span style="font-size:32px;font-weight:300">+</span><strong style="color:var(--encre)">Nouveau projet</strong><span class="petit">Ex. MEDNA.IO</span></button></section>`;
  return h + barreEnregistrer();
}

function vueProjet(id) {
  const p = S.brouillon.projets.find((x) => x.id === id);
  if (!p) return `<div class="vide">Projet introuvable. <a href="#/projets">Retour aux projets</a></div>`;
  const persos = S.brouillon.personnages.filter((x) => x.statut !== 'supprime');
  const jours = p.jours?.length ? p.jours : [1, 2, 3, 4, 5, 6, 7];
  const formats = p.formats || [];
  let h = `<header class="entete"><div><a href="#/projets" style="font-size:13px;text-decoration:none">← Projets</a>
      <label class="cache" for="p-nom">Nom du projet</label>
      <input id="p-nom" class="saisie" data-p="nom" value="${esc(p.nom)}" placeholder="Nom du projet" style="font-size:24px;font-weight:700;border:none;background:transparent;padding:4px 0;min-width:280px"></div>
    <button type="button" class="bouton" data-action="basculer-projet">${p.actif ? 'Mettre en pause' : 'Activer le projet'}</button></header>
    <section class="carte"><h2>Production</h2><div class="grille g3">
      <div class="champ">Vidéos par jour<div class="compteur"><button type="button" aria-label="Une vidéo de moins" data-action="nb" data-d="-1">−</button><b>${p.videos_par_jour || 0}</b><button type="button" aria-label="Une vidéo de plus" data-action="nb" data-d="1">+</button></div>
        <small>≈ ${nombre((p.videos_par_jour || 0) * 85)} crédits/jour estimés</small></div>
      <label class="champ">Modèle vidéo<select data-p="modele_video">${Object.entries(MODELES_VIDEO).map(([k, v]) => `<option value="${k}" ${(p.modele_video || 'kling') === k ? 'selected' : ''}>${v}</option>`).join('')}</select><small>Le banc d'essai dit lequel est le meilleur.</small></label>
      <label class="champ">Démo montée après le hook<input data-p="demo" value="${esc(p.demo || 'defaut')}"><small>« defaut » = toutes les démos du dossier Drive MACHINE CONTENU/demos, à tour de rôle (jamais deux fois la même le même jour). Sinon : l'identifiant Drive d'une démo précise.</small></label>
    </div>
    <div class="champ">Jours de production<div class="puces-choix">${JOURS.map((n, i) => `<button type="button" data-action="jour" data-n="${i + 1}" aria-pressed="${jours.includes(i + 1)}">${n}</button>`).join('')}</div></div></section>
    <section class="carte"><h2>Formats de vidéo (rétention)</h2><p class="petit">Les vidéos du jour sont réparties entre les formats cochés.</p>
      <div class="grille g3">${Object.entries(FORMATS).map(([k, [nom, desc]]) => `<label class="carte serree" style="cursor:pointer;border:2px solid ${formats.includes(k) ? 'var(--bleu)' : 'var(--bord)'}">
        <span class="ligne" style="font-weight:600"><input type="checkbox" data-action="format" data-f="${k}" ${formats.includes(k) ? 'checked' : ''}> ${nom}</span><span class="petit">${desc}</span></label>`).join('')}</div></section>
    <section class="carte"><div class="ligne entre"><h2>Personnages du projet</h2><a href="#/personnages" style="font-size:14px;font-weight:600;text-decoration:none">+ Créer un personnage</a></div>
      <p class="petit">Part des vidéos pour chacun (0 = pas dans ce projet). Seuls les personnages actifs sont utilisés.</p>
      ${persos.length ? `<div class="grille g2">${persos.map((x) => `<label class="ligne carte serree" style="flex-direction:row;align-items:center">
        ${photoPerso(x.id) ? `<img class="avatar" src="${esc(photoPerso(x.id))}" alt="">` : '<span class="avatar"></span>'}
        <span style="flex:1"><strong>${esc(x.nom)}</strong><br><span class="petit">${x.statut === 'actif' ? 'actif' : 'pas encore actif'}</span></span>
        <input class="saisie" type="number" min="0" max="100" style="width:90px" data-action-saisie="part" data-id="${esc(x.id)}" value="${(p.personnages || {})[x.id] || 0}" aria-label="Part de ${esc(x.nom)}"></label>`).join('')}</div>` : '<div class="vide">Aucun personnage. Créez-en un dans Personnages.</div>'}</section>
    <section class="carte"><div class="ligne entre"><h2>Textes de hook (${(p.hooks || []).length})</h2><button type="button" class="bouton" data-action="ajout-hook">+ Ajouter</button></div>
      <p class="petit">Le texte affiché à l'écran pendant la réaction. Le ton choisit la réaction du personnage. Langue et ennemi servent au calendrier de tests (hors tests, seuls les textes EN sont utilisés). Un texte ne revient pas avant 14 jours.</p>
      <div style="display:flex;flex-direction:column;gap:8px">${(p.hooks || []).map((k, i) => `<div class="hook-ligne">
        <input class="saisie" data-action-saisie="hook-texte" data-i="${i}" value="${esc(k.texte)}" aria-label="Texte du hook ${i + 1}">
        <select class="saisie" data-action-saisie="hook-ton" data-i="${i}" aria-label="Ton">${Object.entries(TONS).map(([t, l]) => `<option value="${t}" ${k.ton === t ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <select class="saisie" data-action-saisie="hook-langue" data-i="${i}" aria-label="Langue"><option value="en" ${(k.langue || 'en') === 'en' ? 'selected' : ''}>EN</option><option value="fr" ${k.langue === 'fr' ? 'selected' : ''}>FR</option></select>
        <select class="saisie" data-action-saisie="hook-ennemi" data-i="${i}" aria-label="Ennemi"><option value="" ${!k.ennemi ? 'selected' : ''}>Ennemi : auto (${esc(ENNEMIS[ennemiAuto(k.texte)] || 'aucun')})</option>${Object.entries(ENNEMIS).map(([e, l]) => `<option value="${e}" ${k.ennemi === e ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <button type="button" class="bouton danger" style="padding:0" data-action="suppr-hook" data-i="${i}" aria-label="Supprimer ce texte">✕</button></div>`).join('')}</div></section>
    <section class="carte"><label class="champ">Consignes pour toutes les images de ce projet<small>En français. Ex. « jamais le mot beautiful », « public : étudiants américains ».</small>
      <textarea data-p="contraintes">${esc(p.contraintes || '')}</textarea></label></section>
    <div class="ligne">${S.confirmer === 'projet' ? `<span>Supprimer ce projet ?</span><button type="button" class="bouton danger" data-action="suppr-projet-ok">Oui, supprimer</button><button type="button" class="bouton" data-action="annuler-confirm">Non</button>`
      : `<button type="button" class="bouton danger" data-action="suppr-projet">Supprimer le projet</button>`}</div>`;
  return h + barreEnregistrer();
}

// ------------------------------------------------------------------ écran : Personnages
const LIB_CASTING = { candidats_en_cours: ['6 candidats en préparation', 'info'], candidats_prets: ['Candidats prêts : à toi de choisir', 'att'],
                      refs_en_cours: ['Photos de référence en préparation', 'info'], refs_pretes: ['Prêt : à vérifier et activer', 'att'] };
function etatPerso(p) {
  if (p.statut === 'actif') return ['Actif', 'ok'];
  if (p.statut === 'casting') { const c = (S.etat.castings || {})[p.id]; return (c && c.essai === (p.essai_casting || 1) && LIB_CASTING[c.statut]) || ['Casting : démarre au prochain passage', 'info']; }
  if (p.statut === 'brouillon') return ['Brouillon', ''];
  return ['En pause', ''];
}

function vuePersonnages() {
  const ps = S.brouillon.personnages.filter((x) => x.statut !== 'supprime');
  let h = `<header class="entete"><div><h1>Personnages</h1><p class="petit" style="margin-top:6px">Un personnage peut servir dans plusieurs projets.</p></div>
    <button type="button" class="bouton noir" data-action="nouveau-perso">+ Créer un personnage</button></header>
    <section class="grille auto">`;
  for (const p of ps) {
    const [lib, cl] = etatPerso(p);
    const img = photoPerso(p.id);
    h += `<a class="dossier" href="#/personnage/${esc(p.id)}" style="padding:0;overflow:hidden;gap:0">
      ${img ? `<img src="${esc(img)}" alt="${esc(p.nom)}" style="width:100%;aspect-ratio:4/3;object-fit:cover">` : '<div style="aspect-ratio:4/3;background:var(--doux)"></div>'}
      <div style="padding:14px;display:flex;flex-direction:column;gap:8px"><strong style="font-size:16px">${esc(p.nom || 'Sans nom')}</strong>
      <span class="petit">${esc(p.genre === 'homme' ? 'Homme' : 'Femme')}${p.description ? ' · ' + esc(p.description.slice(0, 70)) : ''}</span>
      <span><span class="puce ${cl}">${esc(lib)}</span></span></div></a>`;
  }
  if (!ps.length) h += `<div class="vide">Aucun personnage pour l'instant.</div>`;
  return h + '</section>' + barreEnregistrer();
}

function vuePersonnage(id) {
  const p = S.brouillon.personnages.find((x) => x.id === id);
  if (!p) return `<div class="vide">Personnage introuvable. <a href="#/personnages">Retour</a></div>`;
  const c = (S.etat.castings || {})[p.id];
  const enCours = c && c.essai === (p.essai_casting || 1) ? c : null;
  const [lib, cl] = etatPerso(p);
  const verrou = p.statut === 'casting' || p.statut === 'actif';
  let h = `<header class="entete"><div><a href="#/personnages" style="font-size:13px;text-decoration:none">← Personnages</a><h1>${esc(p.nom || 'Nouveau personnage')}</h1></div><span class="puce ${cl}">${esc(lib)}</span></header>
    <section class="carte"><h2>${verrou ? 'Description' : 'Décris-le en quelques mots (en français)'}</h2>
      <div class="grille g3"><label class="champ">Nom<input data-pe="nom" value="${esc(p.nom)}"></label>
      <label class="champ">Genre<select data-pe="genre" ${verrou ? 'disabled' : ''}><option value="femme" ${p.genre !== 'homme' ? 'selected' : ''}>Femme</option><option value="homme" ${p.genre === 'homme' ? 'selected' : ''}>Homme</option></select></label>
      <label class="champ">Âge<input data-pe="age" value="${esc(p.age || '')}" placeholder="~25 ans" ${verrou ? 'disabled' : ''}></label></div>
      <label class="champ">Description<small>Visage, cheveux, style. Ex. « étudiant, cheveux châtains courts, barbe de 3 jours, look simple ».</small><textarea data-pe="description" ${verrou ? 'disabled' : ''}>${esc(p.description || '')}</textarea></label>
      <label class="champ">Règles propres à ce personnage<small>Ex. « toujours des lunettes ». Appliquées à toutes ses images.</small><textarea data-pe="notes">${esc(p.notes || '')}</textarea></label>`;
  if (p.statut === 'brouillon' || (!p.statut)) h += `<div class="ligne entre"><span class="petit">6 candidats ≈ 36 crédits</span><button type="button" class="bouton principal" data-action="lancer-casting">Enregistrer et lancer le casting</button></div>`;
  h += `</section>`;
  if (p.statut === 'casting') {
    if (!enCours || ['candidats_en_cours', 'refs_en_cours'].includes(enCours.statut)) {
      h += `<div class="bandeau">${esc(lib)}… La machine s'en occupe à son prochain passage (toutes les 15 min). Revenez un peu plus tard.</div>`;
    } else if (enCours.statut === 'candidats_prets') {
      h += `<section class="carte"><div class="ligne entre"><h2>Choisis le bon visage</h2><button type="button" class="bouton" data-action="recasting">Aucun ne va : 6 autres</button></div>
        <div class="candidats">${(enCours.candidats || []).map((u, i) => `<button type="button" data-action="choix" data-i="${i}" aria-pressed="${p.choix === i}"><img src="${esc(urlImage(u))}" alt="Candidat ${i + 1}" loading="lazy"></button>`).join('')}</div>
        <p class="petit">Après ton choix (puis Enregistrer), la machine crée 4 photos de référence du même visage (≈ 24 crédits).</p></section>`;
    } else if (enCours.statut === 'refs_pretes') {
      h += `<section class="carte"><h2>Photos de référence</h2><div class="candidats">${(enCours.refs || []).map((u, i) => `<div><img src="${esc(urlImage(u))}" alt="Référence ${i + 1}" style="width:100%;aspect-ratio:3/4;object-fit:cover;border-radius:12px">
        ${enCours.scores && i > 0 && enCours.scores[i - 1] != null ? `<span class="puce ok" style="margin-top:6px">Visage ${String(enCours.scores[i - 1]).replace('.', ',')}</span>` : ''}</div>`).join('')}</div>
        <div class="ligne entre"><button type="button" class="bouton" data-action="recasting">Recommencer le casting</button><button type="button" class="bouton vert" data-action="activer">Activer le personnage</button></div></section>`;
    }
  }
  if (p.statut === 'actif' || p.statut === 'pause') {
    const refs = ((S.etat.personnages || {})[p.id] || {}).refs_urls || (c || {}).refs || [];
    h += `<section class="carte"><h2>Photos de référence</h2>${refs.length ? `<div class="candidats">${refs.map((u, i) => `<img src="${esc(urlImage(u))}" alt="Référence ${i + 1}" style="width:100%;aspect-ratio:3/4;object-fit:cover;border-radius:12px">`).join('')}</div>` : '<p class="petit">Les photos sont dans le Drive (MACHINE CONTENU / personnages).</p>'}
      <div class="ligne"><button type="button" class="bouton" data-action="basculer-perso">${p.statut === 'actif' ? 'Mettre en pause' : 'Réactiver'}</button></div></section>`;
  }
  h += `<div class="ligne">${S.confirmer === 'perso' ? `<span>Supprimer ce personnage ?</span><button type="button" class="bouton danger" data-action="suppr-perso-ok">Oui, supprimer</button><button type="button" class="bouton" data-action="annuler-confirm">Non</button>`
    : `<button type="button" class="bouton danger" data-action="suppr-perso">Supprimer le personnage</button>`}</div>`;
  return h + barreEnregistrer();
}

// ------------------------------------------------------------------ écran : Banc d'essai
function vueBanc() {
  const bancs = S.etat.bancs || [];
  let h = `<header class="entete"><div><h1>Banc d'essai des modèles IA</h1><p class="petit" style="margin-top:6px">Même image, même consigne, plusieurs modèles : on garde le meilleur rapport qualité/prix.</p></div></header>`;
  if (!bancs.length) return h + `<div class="vide">Aucun banc enregistré pour l'instant. Le banc automatique mensuel arrive à l'étape suivante.</div>`;
  const b = bancs[bancs.length - 1];
  h += `<p class="petit">Banc du ${esc(b.jour)} · ${esc(b.description || '')}</p><section class="grille g4">`;
  for (const m of b.modeles || []) {
    h += `<article class="vignette">${m.apercu ? `<div class="photo"><img src="${esc(urlImage(m.apercu))}" alt="Aperçu ${esc(m.nom)}" style="aspect-ratio:9/12"></div>` : ''}
      <div class="corps"><strong style="font-size:16px">${esc(m.nom)}</strong>
      <span class="petit">${nombre(m.credits)} crédits · visage ${String(m.visage ?? '—').replace('.', ',')}</span>
      <span class="petit">${esc(m.avis || '')}</span>
      ${m.video ? `<a href="${esc(m.video)}" target="_blank" rel="noopener">Voir la vidéo</a>` : ''}
      ${m.defaut ? '<span><span class="puce info">Modèle par défaut</span></span>' : ''}</div></article>`;
  }
  return h + `</section>`;
}

// ------------------------------------------------------------------ écran : Historique
function vueHistorique() {
  const jours = Object.keys(S.etat.jours || {}).sort().reverse().slice(0, 14);
  const regles = S.etat.regles_apprises || [];
  const oubliees = new Set(S.decisions.filter((d) => d.type === 'regle_oublier').map((d) => d.fr));
  let h = `<header class="entete"><h1>Historique</h1></header>
    <section class="carte"><h2>14 derniers jours</h2>${jours.length ? `<div class="tableau"><table><thead><tr><th>Jour</th><th>Vidéos livrées</th><th>Crédits</th><th>≈ $</th></tr></thead><tbody>
    ${jours.map((d) => { const ss = S.etat.jours[d].slots || []; const c = S.etat.jours[d].credits_utilises ?? ss.reduce((a, s) => a + (s.credits || 0), 0);
      return `<tr><td>${esc(d)}</td><td>${ss.filter((s) => s.statut === 'livre').length} / ${ss.length}</td><td>${nombre(c)}</td><td>${(c * REGLAGES.prixCreditUsd).toFixed(2)}</td></tr>`; }).join('')}
    </tbody></table></div>` : '<p class="petit">Rien encore.</p>'}</section>
    <section class="carte"><h2>Règles apprises de vos refus (${regles.length})</h2>${regles.length ? regles.map((r) => `<div class="ligne entre" style="border-top:1px solid var(--doux);padding-top:10px">
      <span>« ${esc(r.fr)} » <span class="petit">· ${esc(r.jour || '')}</span></span>
      ${oubliees.has(r.fr) ? '<span class="puce">Retirée au prochain passage</span>' : `<button type="button" class="bouton" data-action="oublier" data-fr="${esc(r.fr)}">Oublier</button>`}</div>`).join('') : '<p class="petit">Aucune pour l\'instant : elles viennent des motifs de refus.</p>'}</section>
    <section class="carte"><h2>Journal de la machine</h2>${(S.etat.journal || []).slice().reverse().slice(0, 40).map((x) => `<div class="petit" style="border-top:1px solid var(--doux);padding-top:8px"><strong style="color:var(--texte)">${esc((x.quand || '').replace('T', ' '))}</strong> · ${esc(x.texte)}</div>`).join('') || '<p class="petit">Vide.</p>'}
    ${S.etat.derniere_execution ? `<p class="petit">Dernier passage : ${esc((S.etat.derniere_execution.quand || '').replace('T', ' '))} · ${esc(S.etat.derniere_execution.resultat || '')}</p>` : ''}</section>`;
  return h;
}

// ------------------------------------------------------------------ écran : Veille (ce qui marche en ce moment sur TikTok)
const fmtK = (n) => n >= 1e6 ? (n / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' M' : n >= 1e3 ? Math.round(n / 1e3) + ' k' : String(n || 0);

function vueVeille() {
  const V = (S.resultats || {}).veille || {}; const sem = V.semaines || {};
  const cles = Object.keys(sem).sort().reverse();
  const demande = S.decisions.some((d) => d.type === 'veille_lancer');
  const enCours = (S.etat.veille || {}).en_cours;
  const choisie = cles.includes(S.semaineVeille) ? S.semaineVeille : cles[0];
  const w = choisie ? sem[choisie] : null;
  const ap = V.apify;
  let h = `<header class="entete"><div><h1>Veille</h1><p class="petit" style="margin-top:6px">Chaque dimanche à 4 h, la machine récolte les vidéos TikTok de la semaine (mots-clés étudiants + comptes surveillés), garde celles qui font beaucoup plus de vues que la taille du compte, et l'IA lit leur hook. Partie 2 à venir : écriture de nos hooks + note du juge.</p></div>
    ${enCours ? '<span class="puce info">Récolte en cours…</span>' : demande ? '<span class="puce info">Demandée : prochain passage</span>' : '<button type="button" class="bouton" data-action="lancer-veille">Lancer maintenant</button>'}</header>`;
  if (!cles.length) {
    return h + `<section class="carte"><p class="petit">Aucune veille pour l'instant. Elle démarre dès que le jeton Apify est rangé dans les secrets GitHub (APIFY_TOKEN), puis chaque dimanche.</p></section>`;
  }
  if (cles.length > 1) h += `<div class="puces-choix" role="group" aria-label="Semaine">${cles.map((k) => `<button type="button" data-action="semaine-veille" data-s="${esc(k)}" aria-pressed="${k === choisie}">${esc(k.replace(/^\d+-/, ''))}</button>`).join('')}</div>`;
  if (w.erreur) return h + `<section class="carte"><p><span class="puce ko">${esc(w.erreur)}</span></p></section>`;
  const vids = w.videos || [];
  const compte = (f) => { const c = {}; vids.forEach((v) => { const x = (v.lecture || {})[f]; if (x) c[x] = (c[x] || 0) + 1; }); return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 5); };
  const resume = (titre, f) => `<div><h3 style="font-size:14px;margin-bottom:6px">${titre}</h3>${compte(f).map(([k, n]) => `<div class="petit">${esc(k)} · <strong style="color:var(--encre)">${n}</strong></div>`).join('') || '<div class="petit">—</div>'}</div>`;
  h += `<section class="carte"><div class="ligne entre"><h2>Semaine ${esc(choisie.replace(/^\d+-/, ''))}</h2><span class="petit">${esc((w.date || '').replace('T', ' '))} · ${nombre(w.recoltees)} vidéos récoltées · ${vids.length} gardées · Apify ${(w.cout_usd || 0).toFixed(2)} $${ap ? ` · ce mois-ci ${ap.depense_mois.toFixed(2)} $ / ${ap.plafond.toFixed(2)} $` : ''}</span></div>
    <div class="grille" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr));margin-top:12px">${resume('Formats qui marchent', 'format')}${resume('Ennemis', 'ennemi')}${resume('Émotions', 'emotion')}</div></section>`;
  h += `<section class="carte"><h2>Les vidéos de la semaine</h2><p class="petit">Classées par « vues ÷ abonnés » : ce qui a marché grâce au format, pas grâce à la célébrité du compte.</p>
    ${vids.map((v, i) => { const l = v.lecture || {};
      return `<article style="border-top:1px solid var(--doux);padding-top:12px;margin-top:12px">
        <div class="ligne entre"><strong>${i + 1}. ${l.hook_texte ? `« ${esc(l.hook_texte)} »` : '<span class="petit">(pas de texte à l\'écran)</span>'}</strong>
          <a class="bouton" href="${esc(v.url)}" target="_blank" rel="noopener">Voir sur TikTok</a></div>
        <div class="ligne" style="margin-top:6px"><span class="puce info">${fmtK(v.vues)} vues</span><span class="puce">@${esc(v.compte)} · ${fmtK(v.abonnes)} abonnés</span><span class="puce ok">× ${nombre(v.score)}</span>
          ${l.format ? `<span class="puce">${esc(l.format)}</span>` : ''}${l.ennemi ? `<span class="puce att">ennemi : ${esc(l.ennemi)}</span>` : ''}${l.emotion ? `<span class="puce">${esc(l.emotion)}</span>` : ''}${v.duree ? `<span class="puce">${esc(v.duree)} s</span>` : ''}</div>
        ${l.structure ? `<p class="petit" style="margin-top:6px"><strong style="color:var(--texte)">Structure :</strong> ${esc(l.structure)}</p>` : ''}
        ${l.pourquoi ? `<p class="petit"><strong style="color:var(--texte)">Pourquoi ça marche :</strong> ${esc(l.pourquoi)}</p>` : ''}
        ${l.idee_rewordy ? `<p class="petit"><strong style="color:var(--texte)">Idée pour nous :</strong> ${esc(l.idee_rewordy)}</p>` : ''}
        ${l.erreur ? `<p class="petit">Lecture IA impossible : ${esc(l.erreur)}</p>` : ''}
        ${v.recherche ? `<p class="petit">Trouvée par : « ${esc(v.recherche)} »</p>` : ''}
      </article>`; }).join('')}</section>`;
  return h;
}

// ------------------------------------------------------------------ écran : Résultats (chiffres TikTok + fiche de chaque vidéo)
const INGREDIENTS = { hook: 'Hook', ton: 'Ton du hook', reaction: 'Réaction', decor: 'Décor', tenue: 'Tenue', cadrage: 'Cadrage', demo: 'Démo écran',
                      langue: 'Langue', ennemi: 'Ennemi du hook', modele_video: 'Modèle vidéo', personnage: 'Personnage', format: 'Format', jour_semaine: 'Jour de publication',
                      heure_pub: 'Heure de publication (Dubaï)' };
const JOURS_LONGS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const PAYS = { US: 'États-Unis', FR: 'France', GB: 'Royaume-Uni', AE: 'Émirats', BE: 'Belgique', CA: 'Canada', DE: 'Allemagne',
               BR: 'Brésil', IE: 'Irlande', NL: 'Pays-Bas', MV: 'Maldives', AU: 'Australie', CH: 'Suisse', MA: 'Maroc', ES: 'Espagne', IT: 'Italie' };
const pct = (x, d = 0) => (x == null || isNaN(x)) ? '—' : (x * 100).toLocaleString('fr-FR', { maximumFractionDigits: d, minimumFractionDigits: d }) + ' %';
const sec = (x) => (x == null || isNaN(x)) ? '—' : (+x).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' s';
const joli = (id) => String(id ?? '—').replace(/[_-]+/g, ' ');
const partUS = (v) => (v.audience_countries || []).find((c) => c.country === 'US')?.percentage ?? null;

// Une ligne par publication TikTok, avec sa fiche d'ingrédients si on l'a retrouvée.
function lignesResultats() {
  const R = S.resultats || {}; const fiches = R.fiches || {};
  return Object.values(R.videos || {}).map((v) => {
    const f = v.fiche ? fiches[v.fiche] : null;
    const hr = v.hook_reconnu;
    const d = v.create_time ? new Date(+v.create_time * 1000) : null;
    const hDub = d ? +d.toLocaleTimeString('en-GB', { timeZone: 'Asia/Dubai', hour: '2-digit', hour12: false }) : null;
    return { v, f, d,
      texte: f?.texte || hr?.texte || v.texte_lu || v.caption || '',
      ing: { hook: f?.texte || hr?.texte || null, ton: TONS[f?.ton || hr?.ton] || null, reaction: f?.reaction, decor: f?.decor, tenue: f?.tenue,
             cadrage: f?.cadrage, demo: f?.demo ? joli(f.demo.replace(/\.mp4$/i, '')) : null, modele_video: MODELES_VIDEO[f?.modele_video] || f?.modele_video, personnage: f ? nomPerso(f.personnage) : null,
             format: f ? (FORMATS[f.format]?.[0] || 'Classique') : null,
             langue: f ? (f.langue === 'fr' ? 'Français' : 'Anglais') : null, ennemi: f?.ennemi ? (ENNEMIS[f.ennemi] || f.ennemi) : null,
             jour_semaine: d ? JOURS_LONGS[+new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Dubai' })).getDay()] : null,
             heure_pub: hDub == null ? null : `${String(Math.floor(hDub / 3) * 3).padStart(2, '0')} h – ${String(Math.floor(hDub / 3) * 3 + 3).padStart(2, '0')} h` },
      vues: +v.video_views || 0, entier: v.full_video_watched_rate, moy: v.average_time_watched, us: partUS(v) };
  }).sort((a, b) => (b.d || 0) - (a.d || 0));
}

const moyenne = (xs) => { const ok = xs.filter((x) => x != null && !isNaN(x)); return ok.length ? ok.reduce((a, b) => a + +b, 0) / ok.length : null; };

// Note « réelle » de 1 à 10 : rang des vues parmi toutes les vidéos (10 = la meilleure).
function noteReelle(l, toutes) {
  if (toutes.length < 3) return null;
  const moins = toutes.filter((x) => x.vues < l.vues).length;
  return Math.max(1, Math.round(1 + 9 * moins / (toutes.length - 1)));
}

function vueResultats() {
  const R = S.resultats || {}; const T = S.tiktok || {}; const t = R.tiktok || {};
  const lignes = lignesResultats();
  const demande = S.decisions.some((d) => d.type === 'releve_tiktok');
  let h = `<header class="entete"><div><h1>Résultats</h1><p class="petit" style="margin-top:6px">Chiffres TikTok de chaque vidéo, reliés à sa fiche (hook, réaction, décor, modèle…). Relevé chaque jour vers 9 h ; TikTok a 24 à 48 h de retard.</p></div>
    ${T.connecte ? `<button type="button" class="bouton" data-action="releve-tiktok" ${demande ? 'disabled' : ''}>${demande ? 'Relevé demandé…' : 'Relever maintenant'}</button>` : ''}</header>`;
  if (!T.connecte) {
    h += `<section class="carte"><h2>Connecter TikTok (lecture seule)</h2>`;
    h += T.url_autorisation
      ? `<p>L'appli TikTok est prête. Clique, connecte-toi avec le compte <strong>@rewordyai</strong> et accepte : Studio pourra lire les statistiques (jamais publier).</p>
         <div><button type="button" class="bouton principal" data-action="connecter-tiktok">Connecter TikTok</button></div>`
      : `<p class="petit">Il faut d'abord créer l'appli développeur TikTok et la faire valider (guide <em>docs/GUIDE_connexion_tiktok.md</em>). En attendant, les fiches des vidéos sont déjà enregistrées : rien ne sera perdu.</p>`;
    h += `</section>`;
  } else if (t.etat === 'erreur') {
    h += `<div class="bandeau ko">Dernier relevé TikTok en échec : ${esc(t.message)}</div>`;
  }
  if (t.releve) h += `<p class="petit">Dernier relevé : ${esc(t.releve.replace('T', ' '))} · ${nombre(t.nb)} vidéos${T.connecte_le ? ` · connecté le ${esc(T.connecte_le.slice(0, 10))}` : ''}</p>`;

  // Chiffres clés
  if (lignes.length) {
    const vuesTot = lignes.reduce((a, l) => a + l.vues, 0);
    const usPond = lignes.filter((l) => l.us != null);
    const us = usPond.length ? usPond.reduce((a, l) => a + l.us * l.vues, 0) / Math.max(1, usPond.reduce((a, l) => a + l.vues, 0)) : null;
    h += `<section class="grille g4">
      <div class="carte chiffre">Vidéos publiées<b>${nombre(lignes.length)}</b><small>${nombre(lignes.filter((l) => l.f).length)} reliées à leur fiche</small></div>
      <div class="carte chiffre">Vues moyennes<b>${nombre(vuesTot / lignes.length)}</b><small>meilleure : ${nombre(Math.max(...lignes.map((l) => l.vues)))}</small></div>
      <div class="carte chiffre">Regardées en entier<b>${pct(moyenne(lignes.map((l) => l.entier)), 1)}</b><small>durée moyenne regardée : ${sec(moyenne(lignes.map((l) => l.moy)))}</small></div>
      <div class="carte chiffre">Spectateurs aux US<b>${pct(us)}</b><small>c'est la cible : à faire monter</small></div></section>`;
  }

  // Publications à relier (doute)
  const doutes = lignes.filter((l) => l.v.liaison === 'doute');
  const enAttente = new Set(S.decisions.filter((d) => d.type === 'liaison').map((d) => String(d.video)));
  if (doutes.length) {
    h += `<section class="carte"><h2>À confirmer (${doutes.length})</h2><p class="petit">Plusieurs fiches ressemblent à ces vidéos : choisis la bonne.</p>`;
    for (const l of doutes) {
      const iid = l.v.item_id;
      h += `<div class="ligne" style="border-top:1px solid var(--doux);padding-top:12px;align-items:flex-start;gap:12px">
        ${l.v.thumbnail_url ? `<img src="${esc(l.v.thumbnail_url)}" alt="" style="width:56px;height:90px;object-fit:cover;border-radius:8px;background:var(--doux)">` : ''}
        <div style="flex:1;display:flex;flex-direction:column;gap:8px"><span><strong>« ${esc(l.v.texte_lu || l.v.caption || 'sans texte')} »</strong> <span class="petit">· publiée le ${l.d ? esc(l.d.toLocaleDateString('fr-FR', { timeZone: 'Asia/Dubai' })) : '?'}</span></span>
        ${enAttente.has(String(iid)) ? '<span class="puce">Enregistré, pris en compte au prochain passage</span>'
          : `<div class="puces-choix">${(l.v.possibles || []).map((fid) => `<button type="button" data-action="relier" data-video="${esc(iid)}" data-fiche="${esc(fid)}">${esc((R.fiches[fid] || {}).texte || fid)} · ${esc((R.fiches[fid] || {}).jour || '')}</button>`).join('')}
            <button type="button" data-action="relier" data-video="${esc(iid)}" data-fiche="">Aucune</button></div>`}</div></div>`;
    }
    h += `</section>`;
  }

  // Classements par ingrédient
  if (lignes.length) {
    const ing = S.ingredient || 'hook';
    const groupes = {};
    for (const l of lignes) { const k = l.ing[ing]; if (k == null || k === '') continue; (groupes[k] = groupes[k] || []).push(l); }
    const rangs = Object.entries(groupes).map(([k, ls]) => ({ k, n: ls.length, vues: moyenne(ls.map((l) => l.vues)), entier: moyenne(ls.map((l) => l.entier)), moy: moyenne(ls.map((l) => l.moy)), us: moyenne(ls.map((l) => l.us)) }))
      .sort((a, b) => b.vues - a.vues);
    const maxV = Math.max(1, ...rangs.map((r) => r.vues));
    h += `<section class="carte"><div class="ligne entre"><h2>Ce qui marche le mieux</h2>
      <label class="champ" style="flex-direction:row;align-items:center;gap:8px">Classer par <select data-action-saisie="ingredient">${Object.entries(INGREDIENTS).map(([k, n]) => `<option value="${k}" ${k === ing ? 'selected' : ''}>${n}</option>`).join('')}</select></label></div>
      ${rangs.length ? `<div class="tableau"><table><thead><tr><th>${esc(INGREDIENTS[ing])}</th><th>Vidéos</th><th style="min-width:160px">Vues moyennes</th><th>En entier</th><th>Durée moy.</th><th>US</th></tr></thead><tbody>
      ${rangs.map((r) => `<tr><td>${esc(ing === 'hook' ? r.k : joli(r.k))}</td><td>${r.n}${r.n < 3 ? ' <span class="petit">(peu)</span>' : ''}</td>
        <td><div class="ligne" style="gap:8px"><div class="jauge" style="flex:1;min-width:60px"><i style="width:${(100 * r.vues / maxV).toFixed(0)}%"></i></div>${nombre(r.vues)}</div></td>
        <td>${pct(r.entier, 1)}</td><td>${sec(r.moy)}</td><td>${pct(r.us)}</td></tr>`).join('')}</tbody></table></div>`
        : '<p class="petit">Pas encore de vidéo avec cette information (elle vient des fiches de la machine).</p>'}
      <p class="petit">À lire avec prudence tant qu'il y a moins de 3 vidéos par ligne.</p></section>`;
  }

  // Toutes les vidéos
  if (lignes.length) {
    h += `<section class="carte"><h2>Toutes les vidéos</h2><div class="tableau"><table><thead><tr><th></th><th>Publiée</th><th>Hook</th><th>Vues</th><th>En entier</th><th>Durée moy.</th><th>US</th><th>Partages</th><th>Prévu / réel</th></tr></thead><tbody>
      ${lignes.map((l) => { const reel = noteReelle(l, lignes); const prevu = l.f?.note_prevue;
        return `<tr><td>${l.v.thumbnail_url ? `<img src="${esc(l.v.thumbnail_url)}" alt="" loading="lazy" style="width:40px;height:64px;object-fit:cover;border-radius:6px;background:var(--doux)">` : ''}</td>
        <td>${l.d ? esc(l.d.toLocaleDateString('fr-FR', { timeZone: 'Asia/Dubai', day: 'numeric', month: 'short' })) : '—'}</td>
        <td style="max-width:280px">${l.v.share_url ? `<a href="${esc(l.v.share_url)}" target="_blank" rel="noopener">${esc(l.texte || 'sans texte')}</a>` : esc(l.texte)}
          <div class="petit">${l.f ? `fiche ${esc(l.f.jour)} · ${esc(joli(l.f.reaction))} · ${esc(joli(l.f.decor))}` : (l.v.hook_reconnu ? 'avant la machine' : 'sans fiche')}</div></td>
        <td><strong>${nombre(l.vues)}</strong></td><td>${pct(l.entier, 1)}</td><td>${sec(l.moy)}</td><td>${pct(l.us)}</td><td>${nombre(l.v.shares)}</td>
        <td>${prevu ? prevu : '—'} / ${reel ?? '—'}</td></tr>`; }).join('')}</tbody></table></div></section>`;

    // Pays (moyenne pondérée par les vues)
    const pays = {}; let poids = 0;
    for (const l of lignes) { if (!(l.v.audience_countries || []).length) continue; poids += l.vues; for (const c of l.v.audience_countries) pays[c.country] = (pays[c.country] || 0) + c.percentage * l.vues; }
    if (poids) {
      const top = Object.entries(pays).map(([c, x]) => [c, x / poids]).sort((a, b) => b[1] - a[1]).slice(0, 8);
      h += `<section class="carte"><h2>D'où viennent les spectateurs</h2>${top.map(([c, x]) => `<div class="ligne" style="gap:10px"><span style="width:120px">${esc(PAYS[c] || c)}</span><div class="jauge" style="flex:1"><i style="width:${(x * 100).toFixed(0)}%;${c === 'US' ? '' : 'background:var(--bord-fort)'}"></i></div><span style="width:56px;text-align:right">${pct(x)}</span></div>`).join('')}</section>`;
    }
  }

  // Fiches pas encore publiées : prévision 1-10
  const publiees = new Set(lignes.map((l) => l.v.fiche).filter(Boolean));
  const aNoter = Object.values(R.fiches || {}).filter((f) => !publiees.has(f.id)).sort((a, b) => String(b.jour).localeCompare(a.jour)).slice(0, 12);
  const notes = Object.fromEntries(S.decisions.filter((d) => d.type === 'note').map((d) => [d.fiche, d.note]));
  if (aNoter.length) {
    h += `<section class="carte"><h2>Vidéos livrées, pas encore vues sur TikTok (${aNoter.length})</h2><p class="petit">Ta prévision de 1 à 10 avant publication. On la comparera au résultat réel pour affiner le calendrier.</p>
      ${aNoter.map((f) => { const n = notes[f.id] ?? f.note_prevue; return `<div class="ligne entre" style="border-top:1px solid var(--doux);padding-top:10px;flex-wrap:wrap;gap:8px">
        <span style="flex:1;min-width:200px"><strong>${esc(f.texte)}</strong><br><span class="petit">${esc(f.jour)} · ${esc(joli(f.reaction))} · ${esc(joli(f.decor))} · ${esc(MODELES_VIDEO[f.modele_video] || f.modele_video)}${f.drive_url ? ` · <a href="${esc(f.drive_url)}" target="_blank" rel="noopener">voir</a>` : ''}</span></span>
        <span class="puces-choix">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((k) => `<button type="button" style="min-width:38px;padding:0 8px" data-action="noter" data-fiche="${esc(f.id)}" data-note="${k}" aria-pressed="${+n === k}">${k}</button>`).join('')}</span></div>`; }).join('')}</section>`;
  }
  if (!lignes.length && !aNoter.length) h += `<div class="vide">Rien encore : les fiches apparaissent dès qu'une vidéo est livrée, les chiffres dès que TikTok est connecté.</div>`;
  return h;
}

// ------------------------------------------------------------------ écran : Calendrier de tests
// Même logique que machine/calendrier.py : chaque jour teste UNE variable, A-B-A le 1er jour, B-A-B le 2e.
const CAL_BASE = { langue: 'en', heure: '19:00', demo: 'actuelle', format: 'classique' };
const CAL_DEFAUT = { actif: true, debut: '2026-11-24', gagnants: {}, tests: [
  { id: 'reference', nom: 'Référence', jours: 2, A: {}, B: null },
  { id: 'langue', nom: 'Langue', jours: 2, A: { langue: 'en' }, B: { langue: 'fr' } },
  { id: 'ennemi', nom: 'Ennemi du hook', jours: 2, A: { ennemi: 'turnitin' }, B: { ennemi: 'prof' } },
  { id: 'heure', nom: 'Heure de publication', jours: 2, A: { heure: '19:00' }, B: { heure: '22:00' } },
  { id: 'demo', nom: 'Démo', jours: 2, A: { demo: 'actuelle' }, B: { format: 'ecran_partage' } }] };
const ENNEMIS = { turnitin: 'Turnitin / Compilatio', prof: 'Prof', chatgpt: 'ChatGPT', detecteur: 'Détecteur d\'IA', deadline: 'Deadline' };
const MOTS_ENNEMIS = { turnitin: ['turnitin', 'compilatio'], prof: ['prof', 'professor', 'teacher', 'ta', 'lecturer', 'enseignant', 'maitresse'],
  chatgpt: ['chatgpt', 'chat gpt', 'gpt'], detecteur: ['detector', 'gptzero', 'zerogpt', 'detecteur', 'flagged', 'flag'],
  deadline: ['deadline', 'due', 'due at', '2am', '3am', 'a rendre', 'rendu'] };
const plat = (t) => String(t || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
function ennemiAuto(texte) {
  const t = ' ' + plat(texte) + ' ';
  for (const [e, mots] of Object.entries(MOTS_ENNEMIS)) if (mots.some((m) => new RegExp('(?<![a-z])' + m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![a-z])').test(t))) return e;
  return '';
}
const ennemiHook = (h) => h.ennemi || ennemiAuto(h.texte);
const ajoutJours = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const ecartJours = (a, b) => Math.round((new Date(b + 'T12:00:00Z') - new Date(a + 'T12:00:00Z')) / 864e5);
const dateCourte = (iso) => new Date(iso + 'T12:00:00Z').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const fmtHeure = (h) => String(h || '19:00').replace(':00', ' h').replace(':', ' h ');

function libVariante(p) {
  if (!p || !Object.keys(p).length) return 'format actuel';
  const m = [];
  if (p.langue) m.push(p.langue === 'fr' ? 'français' : 'anglais');
  if (p.ennemi) m.push('ennemi : ' + (ENNEMIS[p.ennemi] || p.ennemi));
  if (p.heure) m.push('publication ' + fmtHeure(p.heure) + ' (Paris)');
  if (p.format && p.format !== 'classique') m.push(FORMATS[p.format]?.[0] || p.format);
  else if (p.demo) m.push('démo actuelle');
  return m.join(' · ');
}
function calPosition(cal, jour) {
  if (!cal?.actif || !cal.debut) return null;
  const e = ecartJours(cal.debut, jour); if (e < 0) return null;
  let cumul = 0;
  for (const [i, t] of (cal.tests || []).entries()) { const n = Math.max(1, +t.jours || 2); if (e < cumul + n) return { i, n: e - cumul + 1, j: e + 1 }; cumul += n; }
  return null;
}
function calBase(cal, i) {
  const b = { ...CAL_BASE };
  for (const t of (cal.tests || []).slice(0, i)) { const g = (cal.gagnants || {})[t.id]; if ((g === 'A' || g === 'B') && t[g]) Object.assign(b, t[g]); }
  return b;
}
function calDebutTest(cal, i) { return ajoutJours(cal.debut, (cal.tests || []).slice(0, i).reduce((a, t) => a + Math.max(1, +t.jours || 2), 0)); }
const projetCalendrier = () => S.brouillon.projets.find((p) => p.calendrier) || S.brouillon.projets.find((p) => p.actif) || S.brouillon.projets[0];

// Chiffres d'une fiche : TikTok (API) si la vidéo est reliée, sinon la saisie manuelle (ou celle en attente).
function chiffresFiche(f) {
  const v = Object.values(S.resultats?.videos || {}).find((x) => x.fiche === f.id);
  if (v && v.video_views != null) return { vues: +v.video_views, entier: v.full_video_watched_rate ?? null, source: 'TikTok' };
  const d = [...S.decisions].reverse().find((x) => x.type === 'chiffres' && x.fiche === f.id);
  const m = d ? { vues: d.vues, entier: d.entier } : f.manuel;
  if (m && (m.vues != null || m.entier != null)) return { vues: m.vues ?? null, entier: m.entier ?? null, source: d ? 'en attente' : 'saisi' };
  return null;
}
// Fiches d'un test : celles marquées par la machine, sinon déduites de la date (jours de référence).
function fichesDuTest(cal, i) {
  const t = cal.tests[i];
  return Object.values(S.resultats?.fiches || {}).filter((f) => {
    if (f.test) return f.test === t.id && calPosition(cal, f.jour)?.i === i;
    const pos = calPosition(cal, f.jour); return pos && pos.i === i;
  }).sort((a, b) => String(a.jour + a.slot).localeCompare(b.jour + b.slot));
}
function comparer(fiches) {
  const cote = (v) => { const fs = fiches.filter((f) => (f.variante || null) === v); const ch = fs.map(chiffresFiche).filter(Boolean);
    return { n: fs.length, mesures: ch.length, vues: moyenne(ch.map((c) => c.vues)), entier: moyenne(ch.map((c) => c.entier)) }; };
  const A = cote('A'), B = cote('B');
  let propose = null;
  if (A.mesures >= 2 && B.mesures >= 2) {
    if (A.entier != null && B.entier != null && A.entier !== B.entier) propose = A.entier > B.entier ? 'A' : 'B';
    else if (A.vues != null && B.vues != null) propose = A.vues >= B.vues ? 'A' : 'B';
  }
  return { A, B, propose };
}

function vueCalendrier() {
  const p = projetCalendrier();
  let h = `<header class="entete"><div><h1>Calendrier de tests</h1><p class="petit" style="margin-top:6px">Une seule chose change à la fois. 3 vidéos/jour, A et B mélangés. On juge à 48 h sur le % regardé en entier, puis les vues ; le gagnant devient la base des tests suivants.</p></div></header>`;
  if (!p) return h + '<div class="vide">Aucun projet.</div>';
  const cal = p.calendrier;
  if (!cal) {
    return h + `<section class="carte"><h2>${esc(p.nom)} : pas encore de calendrier</h2><p>Plan validé le 23/11 : J1-2 référence · J3-4 langue EN/FR · J5-6 ennemi Turnitin/prof · J7-8 heure 19 h/22 h · J9-10 démo actuelle/écran partagé.</p>
      <div><button type="button" class="bouton principal" data-action="cal-creer">Créer ce calendrier (J1 = 24 nov.)</button></div></section>` + barreEnregistrer();
  }
  const aujourd = jourDubai();
  const pos = calPosition(cal, aujourd);
  const fin = ajoutJours(cal.debut, (cal.tests || []).reduce((a, t) => a + Math.max(1, +t.jours || 2), 0) - 1);

  // Bandeau du jour
  if (!cal.actif) h += `<div class="bandeau att">Calendrier en pause : la machine produit comme avant (anglais, format actuel).</div>`;
  else if (pos) {
    const t = cal.tests[pos.i]; const base = calBase(cal, pos.i);
    h += `<section class="carte" style="border:2px solid var(--bleu)"><div class="sur-titre">Aujourd'hui · J${pos.j} sur ${ecartJours(cal.debut, fin) + 1}</div>
      <h2 style="margin:4px 0">Test « ${esc(t.nom)} » (jour ${pos.n}/${t.jours || 2})</h2>
      ${t.B ? `<div class="grille g2"><div class="carte serree"><span><span class="puce info">A</span> <strong>${esc(libVariante(t.A))}</strong></span></div><div class="carte serree"><span><span class="puce att">B</span> <strong>${esc(libVariante(t.B))}</strong></span></div></div><p class="petit">Le reste ne bouge pas : ${esc(libVariante(base))}.</p>`
        : `<p>${esc(libVariante(base))} : 3 vidéos de base pour comparer la suite.</p>`}
      ${slotsDuJour().filter((s) => s.projet === p.id).length ? `<div style="display:flex;flex-direction:column;gap:6px;margin-top:8px">${slotsDuJour().filter((s) => s.projet === p.id).map((s) =>
        `<div class="ligne" style="gap:8px;flex-wrap:wrap">${s.variante ? `<span class="puce ${s.variante === 'A' ? 'info' : 'att'}">${s.variante}</span>` : '<span class="puce">Réf.</span>'}
          <span style="flex:1;min-width:180px">${esc(s.texte)}</span><span class="petit">publier à ${esc(fmtHeure(s.heure_pub || base.heure))} (Paris)</span>
          <span class="puce ${STATUTS[s.statut]?.[1] || ''}">${esc(STATUTS[s.statut]?.[0] || s.statut)}</span></div>`).join('')}</div>` : ''}
    </section>`;
  } else if (ecartJours(cal.debut, aujourd) < 0) h += `<div class="bandeau">Le calendrier commence le ${esc(dateCourte(cal.debut))}</div>`;
  else h += `<div class="bandeau">Calendrier terminé le ${esc(dateCourte(fin))}. Les gagnants restent la base : pense à un nouveau cycle.</div>`;

  // Réglages du calendrier
  h += `<section class="carte"><div class="ligne entre" style="flex-wrap:wrap;gap:12px"><h2>${esc(p.nom)} · ${esc(dateCourte(cal.debut))} → ${esc(dateCourte(fin))}</h2>
    <div class="ligne" style="gap:12px;flex-wrap:wrap"><label class="champ" style="flex-direction:row;align-items:center;gap:8px;white-space:nowrap">Départ (J1) <input type="date" class="saisie" data-action-saisie="cal-debut" value="${esc(cal.debut)}"></label>
    <button type="button" class="bouton" data-action="cal-actif">${cal.actif ? 'Mettre en pause' : 'Reprendre'}</button></div></div>`;

  // Les tests
  (cal.tests || []).forEach((t, i) => {
    const d0 = calDebutTest(cal, i); const d1 = ajoutJours(d0, Math.max(1, +t.jours || 2) - 1);
    const base = calBase(cal, i); const g = (cal.gagnants || {})[t.id];
    const fs = fichesDuTest(cal, i); const c = comparer(fs);
    const juge48 = ecartJours(d1, aujourd) >= 2;
    const etat = g ? ['Jugé : ' + g + ' gagne', 'ok'] : aujourd < d0 ? ['À venir', ''] : aujourd <= d1 ? ['En cours', 'info'] : (t.B ? [juge48 ? 'À juger' : 'Attente 48 h', 'att'] : ['Fait', 'ok']);
    const jA = ecartJours(cal.debut, d0) + 1;
    h += `<div style="border-top:1px solid var(--doux);padding-top:14px;margin-top:14px">
      <div class="ligne entre" style="flex-wrap:wrap;gap:8px"><div class="ligne" style="gap:10px"><strong>J${jA}${t.jours > 1 ? '-' + (jA + (+t.jours || 2) - 1) : ''} · ${esc(t.nom)}</strong><span class="petit">${esc(dateCourte(d0))} → ${esc(dateCourte(d1))}</span></div>
        <div class="ligne" style="gap:6px"><span class="puce ${etat[1]}">${esc(etat[0])}</span>
          <button type="button" class="bouton" style="padding:0 10px" data-action="cal-monter" data-i="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Avancer ce test">↑</button>
          <button type="button" class="bouton" style="padding:0 10px" data-action="cal-descendre" data-i="${i}" ${i === cal.tests.length - 1 ? 'disabled' : ''} aria-label="Reculer ce test">↓</button></div></div>`;
    if (t.B) {
      const ligne = (v, s) => `<div class="carte serree" style="${g === v ? 'border:2px solid var(--vert)' : ''}"><div class="ligne entre"><span><span class="puce ${v === 'A' ? 'info' : 'att'}">${v}</span> <strong>${esc(libVariante(t[v]))}</strong></span></div>
        <div class="grille g3" style="gap:6px;margin-top:6px"><div class="chiffre"><b style="font-size:17px">${s.mesures}/${s.n}</b>mesurées</div><div class="chiffre"><b style="font-size:17px">${pct(s.entier, 1)}</b>en entier</div><div class="chiffre"><b style="font-size:17px">${s.vues == null ? '—' : nombre(s.vues)}</b>vues moy.</div></div></div>`;
      h += `<div class="grille g2" style="margin-top:8px">${ligne('A', c.A)}${ligne('B', c.B)}</div><p class="petit" style="margin-top:6px">Le reste ne bouge pas : ${esc(libVariante(base))}.</p>`;
      if (g) h += `<p class="petit">Gagnant confirmé : <strong>${g}</strong> (${esc(libVariante(t[g]))}). <button type="button" class="lien-bouton" data-action="cal-gagnant" data-id="${esc(t.id)}" data-v="">Annuler</button></p>`;
      else if (c.propose) h += `<div class="ligne" style="gap:8px;flex-wrap:wrap;margin-top:8px"><span>Proposition : <strong>${c.propose}</strong> gagne${juge48 ? '' : ' (attendre 48 h après les dernières publications pour confirmer)'}.</span>
        <button type="button" class="bouton vert" data-action="cal-gagnant" data-id="${esc(t.id)}" data-v="${c.propose}">Garder ${c.propose}</button>
        <button type="button" class="bouton" data-action="cal-gagnant" data-id="${esc(t.id)}" data-v="${c.propose === 'A' ? 'B' : 'A'}">Garder ${c.propose === 'A' ? 'B' : 'A'}</button></div>`;
      else if (aujourd > d1) h += `<p class="petit">Il faut au moins 2 vidéos mesurées de chaque côté pour proposer un gagnant (saisie plus bas).</p>`;
    } else {
      h += `<p class="petit" style="margin-top:6px">${esc(libVariante(base))} · ${fs.length} vidéo(s)${fs.length ? ` · en entier ${pct(moyenne(fs.map(chiffresFiche).filter(Boolean).map((x) => x.entier)), 1)}` : ''}</p>`;
    }
    h += `</div>`;
  });
  h += `</section>`;

  // Saisie des chiffres (en attendant l'API TikTok)
  const toutes = (cal.tests || []).flatMap((t, i) => fichesDuTest(cal, i).map((f) => ({ f, t })));
  if (toutes.length) {
    h += `<section class="carte"><h2>Chiffres à 48 h</h2><p class="petit">${S.tiktok?.connecte ? 'TikTok est connecté : les chiffres arrivent seuls. Saisie possible pour les vidéos non reliées.' : 'En attendant l\'API TikTok : ouvre la vidéo dans TikTok → Statistiques, et recopie les vues et le « % regardé en entier », 48 h après la publication.'}</p>
      <div class="tableau"><table><thead><tr><th>Jour</th><th>Var.</th><th>Hook</th><th>Vues</th><th>% en entier</th><th></th></tr></thead><tbody>
      ${toutes.map(({ f, t }) => { const ch = chiffresFiche(f); const api = ch?.source === 'TikTok'; const vieux = ecartJours(f.jour, aujourd) >= 2;
        return `<tr><td>J${calPosition(cal, f.jour)?.j || '?'}<div class="petit">${esc(dateCourte(f.jour))}</div></td>
        <td>${f.variante ? `<span class="puce ${f.variante === 'A' ? 'info' : 'att'}">${f.variante}</span>` : '<span class="petit">réf.</span>'}</td>
        <td style="max-width:260px">${esc(f.texte)}<div class="petit">${esc(t.nom)}${f.heure_pub ? ' · publier ' + esc(fmtHeure(f.heure_pub)) : ''}${f.drive_url ? ` · <a href="${esc(f.drive_url)}" target="_blank" rel="noopener">vidéo</a>` : ''}</div></td>
        ${api ? `<td>${nombre(ch.vues)}</td><td>${pct(ch.entier, 1)}</td><td><span class="puce ok">TikTok</span></td>`
          : `<td><input class="saisie" style="width:96px" inputmode="numeric" id="cv-${esc(f.id)}" aria-label="Vues" value="${ch?.vues ?? ''}" placeholder="vues"></td>
             <td><input class="saisie" style="width:80px" inputmode="decimal" id="ce-${esc(f.id)}" aria-label="% regardé en entier" value="${ch?.entier != null ? String(+(ch.entier * 100).toFixed(1)).replace('.', ',') : ''}" placeholder="%"></td>
             <td><button type="button" class="bouton ${!ch && vieux ? 'principal' : ''}" data-action="cal-chiffres" data-fiche="${esc(f.id)}">${ch ? (ch.source === 'en attente' ? 'Envoyé' : 'Modifier') : 'Enregistrer'}</button></td>`}</tr>`; }).join('')}
      </tbody></table></div></section>`;
  }

  // Textes proposés (à valider avant d'entrer dans la machine)
  const enCours = new Set(S.decisions.filter((d) => d.type === 'proposition_traitee').map((d) => d.proposition));
  const existants = new Set(S.brouillon.projets.flatMap((x) => (x.hooks || []).map((k) => k.id)));
  const props = (S.resultats?.propositions || []).filter((x) => !enCours.has(x.id) && !existants.has(x.id));
  if (props.length) {
    h += `<section class="carte"><h2>Textes de hook proposés (${props.length})</h2><p class="petit">Écrits par Claude pour les tests. Corrige le texte si besoin, puis ajoute ou écarte. Rien n'entre dans la machine sans ton accord.</p>
      ${props.map((x) => `<div class="ligne" style="border-top:1px solid var(--doux);padding-top:10px;gap:8px;flex-wrap:wrap">
        <span class="puce ${x.langue === 'fr' ? 'att' : 'info'}">${x.langue === 'fr' ? 'FR' : 'EN'}</span>${x.ennemi ? `<span class="puce">${esc(ENNEMIS[x.ennemi] || x.ennemi)}</span>` : ''}<span class="puce">${esc(TONS[x.ton] || x.ton)}</span>
        <input class="saisie" style="flex:1;min-width:220px" id="pr-${esc(x.id)}" value="${esc(x.texte)}" aria-label="Texte proposé">
        <button type="button" class="bouton vert" data-action="prop-ok" data-id="${esc(x.id)}">Ajouter</button>
        <button type="button" class="bouton" data-action="prop-non" data-id="${esc(x.id)}">Écarter</button>
        ${x.pourquoi ? `<div class="petit" style="flex-basis:100%">${esc(x.pourquoi)}</div>` : ''}</div>`).join('')}</section>`;
  }

  // Textes disponibles par variante (pour éviter les trous)
  const hooks = (p.hooks || []).filter((k) => (k.texte || '').trim());
  const compte = (f) => hooks.filter(f).length;
  h += `<section class="carte"><h2>Textes disponibles</h2><p class="petit">Chaque test a besoin d'au moins 3 textes par variante (un texte ne revient pas avant 14 jours). Étiquettes modifiables dans Projets → textes de hook.</p>
    <div class="grille g4">
      <div class="chiffre"><b>${compte((k) => (k.langue || 'en') === 'en')}</b>anglais</div>
      <div class="chiffre"><b>${compte((k) => k.langue === 'fr')}</b>français</div>
      ${['turnitin', 'prof'].map((e) => `<div class="chiffre"><b>${compte((k) => ennemiHook(k) === e && (k.langue || 'en') === 'en')} EN · ${compte((k) => ennemiHook(k) === e && k.langue === 'fr')} FR</b>${esc(ENNEMIS[e])}</div>`).join('')}
    </div></section>`;
  return h + barreEnregistrer();
}

// ------------------------------------------------------------------ écran : Réglages
function vueReglages() {
  const g = S.brouillon.general || (S.brouillon.general = {});
  return `<header class="entete"><h1>Réglages</h1></header>
    <section class="carte"><div class="ligne entre"><div><h2>Machine</h2><p class="petit" style="margin-top:4px">${g.pause ? 'En pause : plus rien n\'est généré ni dépensé.' : 'En marche.'}</p></div>
      <button type="button" class="bouton ${g.pause ? 'vert' : ''}" data-action="pause">${g.pause ? 'Relancer la machine' : 'Mettre toute la machine en pause'}</button></div></section>
    <section class="carte"><h2>Budget et horaires</h2><div class="grille g3">
      <label class="champ">Budget maximum par jour (crédits)<input type="number" min="0" step="100" data-g="budget_credits_jour" value="${esc(g.budget_credits_jour ?? 1600)}"><small>≈ ${((+g.budget_credits_jour || 0) * REGLAGES.prixCreditUsd).toFixed(2)} $ par jour, tous projets confondus.</small></label>
      <label class="champ">Départ automatique (heure de Dubaï)<input type="number" min="4" max="12" step="0.5" data-g="heure_limite_validation" value="${esc(g.heure_limite_validation ?? 8)}"><small>Sans réponse, les images qui passent tous les contrôles partent en vidéo.</small></label>
      <label class="champ">Alerte si le solde KIE passe sous<input type="number" min="0" step="500" data-g="alerte_si_credits_sous" value="${esc(g.alerte_si_credits_sous ?? 3000)}"><small>Un e-mail est envoyé.</small></label></div></section>
    <section class="carte"><h2>Sur l'iPhone</h2><p class="petit">Dans Safari : bouton Partager → « Sur l'écran d'accueil ». Studio s'ouvre ensuite comme une appli.</p></section>
    <section class="carte"><div class="ligne entre"><span>Connecté : <strong>${esc(utilisateur())}</strong>${estLocal ? ' (test local, aucun vrai compte)' : ''}</span>
      ${estLocal ? '' : '<button type="button" class="bouton" data-action="deconnecter">Se déconnecter</button>'}</div></section>` + barreEnregistrer();
}

// ------------------------------------------------------------------ rendu
function route() { return (location.hash.replace(/^#\/?/, '') || 'aujourdhui').split('/'); }

function rendre() {
  if (!S.charge) return;
  const [page, id] = route();
  const vues = { aujourdhui: vueAujourdhui, projets: vueProjets, projet: () => vueProjet(id), personnages: vuePersonnages,
                 personnage: () => vuePersonnage(id), resultats: vueResultats, calendrier: vueCalendrier, veille: vueVeille, banc: vueBanc, historique: vueHistorique, reglages: vueReglages };
  const actif = { projet: 'projets', personnage: 'personnages' }[page] || page;
  const y = window.scrollY;
  app.innerHTML = cadre(actif, (vues[page] || vueAujourdhui)());
  if (rendre.page === location.hash) window.scrollTo(0, y); else window.scrollTo(0, 0);
  rendre.page = location.hash;
  document.title = 'Studio' + (aValider().length ? ` (${aValider().length})` : '');
}

function ecranErreur(msg) {
  app.innerHTML = `<div class="ecran-centre"><div class="logo">S</div><h1 style="color:var(--encre)">Studio</h1>
    <p>${esc(msg)}</p><button type="button" class="bouton principal" onclick="location.reload()">Réessayer</button></div>`;
}

// ------------------------------------------------------------------ actions
const projetOuvert = () => S.brouillon.projets.find((x) => x.id === route()[1]);
const persoOuvert = () => S.brouillon.personnages.find((x) => x.id === route()[1]);

const ACTIONS = {
  actualiser: () => recharger(),
  enregistrer: () => enregistrer(),
  annuler: () => { S.brouillon = copie(S.cfg); S.sale = false; rendre(); },
  deconnecter: () => deconnecter(),
  filtre: (el) => { S.filtre = el.dataset.id; rendre(); },
  valider: (el) => { const s = slotsDuJour().find((x) => x.id === el.dataset.id);
    decider({ type: 'image', jour: jourDubai(), slot: s.id, essai: s.essai, choix: 'valide' }, 'Validée : la vidéo part au prochain passage'); },
  refuser: (el) => { S.refus[el.dataset.id] = { motif: '' }; rendre(); document.getElementById('motif-' + el.dataset.id)?.focus(); },
  'annuler-refus': (el) => { delete S.refus[el.dataset.id]; rendre(); },
  'motif-rapide': (el) => { S.refus[el.dataset.id].motif = el.dataset.motif; ACTIONS['envoyer-refus'](el); },
  'envoyer-refus': (el) => { const s = slotsDuJour().find((x) => x.id === el.dataset.id); const motif = (S.refus[s.id]?.motif || '').trim();
    delete S.refus[s.id];
    decider({ type: 'image', jour: jourDubai(), slot: s.id, essai: s.essai, choix: 'refuse', motif }, 'Refusée : une nouvelle image arrive'); },
  'nouveau-projet': () => { const id = ident('projet');
    S.brouillon.projets.push({ id, nom: '', actif: false, videos_par_jour: 2, jours: [1, 2, 3, 4, 5, 6, 7], modele_video: 'kling', demo: 'defaut', formats: Object.keys(FORMATS), personnages: {}, hooks: [], contraintes: '' });
    modifier(); location.hash = '#/projet/' + id; },
  'basculer-projet': () => { const p = projetOuvert(); p.actif = !p.actif; modifier(); rendre(); },
  nb: (el) => { const p = projetOuvert(); p.videos_par_jour = Math.max(0, Math.min(20, (+p.videos_par_jour || 0) + +el.dataset.d)); modifier(); rendre(); },
  jour: (el) => { const p = projetOuvert(); const n = +el.dataset.n; const j = new Set(p.jours?.length ? p.jours : [1, 2, 3, 4, 5, 6, 7]);
    j.has(n) ? j.delete(n) : j.add(n); p.jours = [...j].sort(); modifier(); rendre(); },
  format: (el) => { const p = projetOuvert(); const f = new Set(p.formats || []); el.checked ? f.add(el.dataset.f) : f.delete(el.dataset.f); p.formats = [...f]; modifier(); rendre(); },
  'ajout-hook': () => { const p = projetOuvert(); (p.hooks = p.hooks || []).push({ id: ident('hook'), texte: '', ton: 'choc', lieux: [] }); modifier(); rendre();
    const champs = document.querySelectorAll('[data-action-saisie="hook-texte"]'); champs[champs.length - 1]?.focus(); },
  'suppr-hook': (el) => { projetOuvert().hooks.splice(+el.dataset.i, 1); modifier(); rendre(); },
  'suppr-projet': () => { S.confirmer = 'projet'; rendre(); },
  'suppr-perso': () => { S.confirmer = 'perso'; rendre(); },
  'annuler-confirm': () => { S.confirmer = null; rendre(); },
  'suppr-projet-ok': () => { S.brouillon.projets = S.brouillon.projets.filter((x) => x.id !== route()[1]); S.confirmer = null; modifier(); location.hash = '#/projets'; },
  'suppr-perso-ok': () => { const p = persoOuvert(); p.statut = 'supprime'; S.confirmer = null; modifier(); location.hash = '#/personnages'; },
  'nouveau-perso': () => { const id = ident('perso');
    S.brouillon.personnages.push({ id, nom: '', genre: 'femme', age: '', description: '', notes: '', statut: 'brouillon' });
    modifier(); location.hash = '#/personnage/' + id; },
  'lancer-casting': () => { const p = persoOuvert();
    if (!p.nom?.trim() || !p.description?.trim()) return toast('Il faut au moins un nom et une description.');
    p.statut = 'casting'; p.essai_casting = 1; p.choix = null; enregistrer(); },
  choix: (el) => { persoOuvert().choix = +el.dataset.i; modifier(); rendre(); },
  recasting: () => { const p = persoOuvert(); p.essai_casting = (p.essai_casting || 1) + 1; p.choix = null; enregistrer(); },
  activer: () => { const p = persoOuvert(); const c = (S.etat.castings || {})[p.id] || {};
    p.statut = 'actif'; if (c.identite) p.identite = c.identite; enregistrer(); },
  'basculer-perso': () => { const p = persoOuvert(); p.statut = p.statut === 'actif' ? 'pause' : 'actif'; modifier(); rendre(); },
  oublier: (el) => decider({ type: 'regle_oublier', fr: el.dataset.fr }, 'La règle sera retirée au prochain passage'),
  pause: () => { const g = S.brouillon.general; g.pause = !g.pause; enregistrer(); },
  'lancer-veille': () => decider({ type: 'veille_lancer' }, 'Veille demandée : récolte lancée au prochain passage (≤ 1 h), rapport environ 1 h après'),
  'semaine-veille': (el) => { S.semaineVeille = el.dataset.s; rendre(); },
  'releve-tiktok': () => decider({ type: 'releve_tiktok' }, 'Relevé demandé : il sera fait au prochain passage (≤ 1 h)'),
  relier: (el) => decider({ type: 'liaison', video: el.dataset.video, fiche: el.dataset.fiche }, 'Enregistré'),
  noter: (el) => { S.decisions = S.decisions.filter((d) => !(d.type === 'note' && d.fiche === el.dataset.fiche));
    decider({ type: 'note', fiche: el.dataset.fiche, note: +el.dataset.note }, `Prévision : ${el.dataset.note}/10`); },
  'cal-creer': () => { projetCalendrier().calendrier = copie(CAL_DEFAUT); modifier(); rendre(); },
  'cal-actif': () => { const c = projetCalendrier().calendrier; c.actif = !c.actif; modifier(); rendre(); },
  'cal-monter': (el) => { const t = projetCalendrier().calendrier.tests; const i = +el.dataset.i; [t[i - 1], t[i]] = [t[i], t[i - 1]]; modifier(); rendre(); },
  'cal-descendre': (el) => { const t = projetCalendrier().calendrier.tests; const i = +el.dataset.i; [t[i + 1], t[i]] = [t[i], t[i + 1]]; modifier(); rendre(); },
  'cal-gagnant': (el) => { const c = projetCalendrier().calendrier; c.gagnants = c.gagnants || {};
    if (el.dataset.v) c.gagnants[el.dataset.id] = el.dataset.v; else delete c.gagnants[el.dataset.id];
    if (S.sale) { modifier(); rendre(); toast('Pense à enregistrer'); } else enregistrer(); },
  'cal-chiffres': (el) => { const id = el.dataset.fiche;
    const vues = (document.getElementById('cv-' + id)?.value || '').replace(/[\s.  ]/g, '');
    const ent = (document.getElementById('ce-' + id)?.value || '').replace('%', '').replace(',', '.').trim();
    if (vues === '' && ent === '') return toast('Saisis au moins les vues ou le %.');
    if ((vues !== '' && !/^\d+$/.test(vues)) || (ent !== '' && (isNaN(+ent) || +ent < 0 || +ent > 100))) return toast('Vues : un nombre entier · % en entier : entre 0 et 100.');
    S.decisions = S.decisions.filter((d) => !(d.type === 'chiffres' && d.fiche === id));
    decider({ type: 'chiffres', fiche: id, vues: vues === '' ? null : +vues, entier: ent === '' ? null : +ent / 100 }, 'Chiffres enregistrés'); },
  'prop-ok': async (el) => { const x = (S.resultats?.propositions || []).find((y) => y.id === el.dataset.id); if (!x) return;
    if (S.sale) return toast('Enregistre d\'abord tes autres modifications.');
    const p = S.brouillon.projets.find((y) => y.id === x.projet) || projetCalendrier();
    const texte = (document.getElementById('pr-' + x.id)?.value || x.texte).trim();
    (p.hooks = p.hooks || []).push({ id: x.id, texte, ton: x.ton || 'choc', langue: x.langue || 'en', ...(x.ennemi ? { ennemi: x.ennemi } : {}), lieux: x.lieux || [], source: x.source || 'claude' });
    await enregistrer();
    if (!S.sale) decider({ type: 'proposition_traitee', proposition: x.id, choix: 'ajoute' }, 'Texte ajouté au projet'); },
  'prop-non': (el) => decider({ type: 'proposition_traitee', proposition: el.dataset.id, choix: 'ecarte' }, 'Texte écarté'),
  'connecter-tiktok': () => { const etatOauth = Math.random().toString(36).slice(2);
    try { sessionStorage.setItem('studio_tiktok_state', etatOauth); } catch (e) { /* navigation privée */ }
    const u = new URL(S.tiktok.url_autorisation); u.searchParams.set('state', etatOauth); location.href = u.toString(); },
};

app.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || el.tagName === 'INPUT' && el.type !== 'checkbox') return;
  const f = ACTIONS[el.dataset.action];
  if (f) { if (el.tagName !== 'INPUT') e.preventDefault(); f(el); }
});

app.addEventListener('input', (e) => {
  const el = e.target;
  const v = el.type === 'number' ? (el.value === '' ? '' : +el.value) : el.value;
  if (el.dataset.p != null) { projetOuvert()[el.dataset.p] = v; return modifier(); }
  if (el.dataset.pe != null) { persoOuvert()[el.dataset.pe] = v; return modifier(); }
  if (el.dataset.g != null) { S.brouillon.general[el.dataset.g] = v; return modifier(); }
  const a = el.dataset.actionSaisie;
  if (a === 'motif') { S.refus[el.dataset.id].motif = el.value; return; }
  if (a === 'part') { const p = projetOuvert(); (p.personnages = p.personnages || {})[el.dataset.id] = +el.value || 0; return modifier(); }
  if (a === 'hook-texte') { projetOuvert().hooks[+el.dataset.i].texte = el.value; return modifier(); }
  if (a === 'ingredient') { S.ingredient = el.value; return rendre(); }
  if (a === 'hook-ton') { projetOuvert().hooks[+el.dataset.i].ton = el.value; return modifier(); }
  if (a === 'hook-langue') { projetOuvert().hooks[+el.dataset.i].langue = el.value; return modifier(); }
  if (a === 'hook-ennemi') { const k = projetOuvert().hooks[+el.dataset.i]; if (el.value) k.ennemi = el.value; else delete k.ennemi; return modifier(); }
  if (a === 'cal-debut') { if (el.value) { projetCalendrier().calendrier.debut = el.value; modifier(); rendre(); } return; }
});
app.addEventListener('change', (e) => { if (e.target.tagName === 'SELECT') e.target.dispatchEvent(new Event('input', { bubbles: true })); });
app.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.dataset.actionSaisie === 'motif') ACTIONS['envoyer-refus'](e.target);
});

window.addEventListener('hashchange', () => { S.confirmer = null; rendre(); });
window.addEventListener('beforeunload', (e) => { if (S.sale) { e.preventDefault(); e.returnValue = ''; } });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.charge && !S.sale) recharger(true); });
setInterval(() => { if (document.visibilityState === 'visible' && S.charge && !S.sale) recharger(true); }, 120000);

// Retour de la page de connexion TikTok (appli/tiktok/) : on envoie le code au script Google, qui le garde.
async function retourTiktok() {
  const q = new URLSearchParams(location.search);
  const code = q.get('tiktok_code');
  if (!code) return;
  history.replaceState(null, '', location.pathname + '#/resultats');
  let attendu = null; try { attendu = sessionStorage.getItem('studio_tiktok_state'); } catch (e) { /* rien */ }
  if (attendu && q.get('state') !== attendu) return toast('Connexion TikTok refusée (vérification de sécurité). Réessaie.');
  try {
    const b = await appel('app_tiktok_code', { code });
    S.tiktok = b.tiktok || S.tiktok; rendre(); toast('TikTok connecté. Premier relevé au prochain passage.');
    decider({ type: 'releve_tiktok' }, 'TikTok connecté. Premier relevé au prochain passage (≤ 1 h).');
  } catch (e) { toast('Connexion TikTok impossible : ' + e.message); }
}

// ------------------------------------------------------------------ démarrage
(async () => {
  try {
    if (!estLocal && REGLAGES.urlScript.startsWith('COLLEZ')) return ecranErreur('Studio n\'est pas encore relié au script Google (fichier reglages.js).');
    if (!estLocal) {
      app.innerHTML = `<div class="ecran-centre"><div class="logo">S</div><h1 style="color:var(--encre)">Studio</h1><p>Connecte-toi avec ton compte Google autorisé.</p><div id="bouton-google"></div></div>`;
      await connecter(document.getElementById('bouton-google'));
    }
    await recharger(true);
    await retourTiktok();
  } catch (e) {
    if (/connexion expirée|reconnectez/.test(e.message)) return location.reload();
    ecranErreur(e.message);
  }
})();
