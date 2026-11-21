// Studio : l'appli de pilotage de la machine à vidéos.
// Une seule page ; les écrans changent avec l'adresse (#/aujourdhui, #/projets, …).
import { appel, connecter, deconnecter, estLocal, utilisateur } from './api.js';
import { REGLAGES } from './reglages.js';

const S = { cfg: null, etat: {}, decisions: [], brouillon: null, sale: false, catalogue: null,
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
    S.etat = b.etat || {}; S.decisions = b.decisions || [];
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
                 ['banc', 'Banc d\'essai IA', icone.banc], ['historique', 'Historique', icone.histo], ['reglages', 'Réglages', icone.reglages]];
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
    <nav class="onglets" aria-label="Navigation">${liens.filter((l) => l[0] !== 'historique').map(([id, nom, ic, badge]) =>
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
      <label class="champ">Démo montée après le hook<input data-p="demo" value="${esc(p.demo || 'defaut')}"><small>« defaut » ou l'identifiant Drive d'une vidéo écran.</small></label>
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
      <p class="petit">Le texte affiché à l'écran pendant la réaction. Le ton choisit la réaction du personnage. Un texte ne revient pas avant 14 jours.</p>
      <div style="display:flex;flex-direction:column;gap:8px">${(p.hooks || []).map((k, i) => `<div class="hook-ligne">
        <input class="saisie" data-action-saisie="hook-texte" data-i="${i}" value="${esc(k.texte)}" aria-label="Texte du hook ${i + 1}">
        <select class="saisie" data-action-saisie="hook-ton" data-i="${i}" aria-label="Ton">${Object.entries(TONS).map(([t, l]) => `<option value="${t}" ${k.ton === t ? 'selected' : ''}>${l}</option>`).join('')}</select>
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
                 personnage: () => vuePersonnage(id), banc: vueBanc, historique: vueHistorique, reglages: vueReglages };
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
  if (a === 'hook-ton') { projetOuvert().hooks[+el.dataset.i].ton = el.value; return modifier(); }
});
app.addEventListener('change', (e) => { if (e.target.tagName === 'SELECT') e.target.dispatchEvent(new Event('input', { bubbles: true })); });
app.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.dataset.actionSaisie === 'motif') ACTIONS['envoyer-refus'](e.target);
});

window.addEventListener('hashchange', () => { S.confirmer = null; rendre(); });
window.addEventListener('beforeunload', (e) => { if (S.sale) { e.preventDefault(); e.returnValue = ''; } });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.charge && !S.sale) recharger(true); });
setInterval(() => { if (document.visibilityState === 'visible' && S.charge && !S.sale) recharger(true); }, 120000);

// ------------------------------------------------------------------ démarrage
(async () => {
  try {
    if (!estLocal && REGLAGES.urlScript.startsWith('COLLEZ')) return ecranErreur('Studio n\'est pas encore relié au script Google (fichier reglages.js).');
    if (!estLocal) {
      app.innerHTML = `<div class="ecran-centre"><div class="logo">S</div><h1 style="color:var(--encre)">Studio</h1><p>Connecte-toi avec ton compte Google autorisé.</p><div id="bouton-google"></div></div>`;
      await connecter(document.getElementById('bouton-google'));
    }
    await recharger(true);
  } catch (e) {
    if (/connexion expirée|reconnectez/.test(e.message)) return location.reload();
    ecranErreur(e.message);
  }
})();
