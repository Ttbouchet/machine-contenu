// Script a coller dans https://script.google.com (voir docs/GUIDE_installation_machine.md).
// C'est le pont entre trois choses et votre Google Drive :
//   - la MACHINE (GitHub) : mot de passe SECRET ; lit les reglages et les decisions, ecrit l'etat, depose photos et videos ;
//   - l'APPLI Studio (iPhone / Mac) : connexion Google, seuls les e-mails de EMAILS_AUTORISES passent ;
//   - l'e-mail du matin « images pretes ».
// A remplir : SECRET, CLIENT_ID_GOOGLE, EMAILS_AUTORISES.
// Dans Parametres du projet > Proprietes du script (jamais dans le code ni dans une conversation) :
//   TIKTOK_APP_ID, TIKTOK_SECRET, TIKTOK_URL_AUTORISATION  (appli developpeur TikTok, lecture seule)
//   GITHUB_JETON                                            (relance la machine a heure fixe, voir installer_declencheurs)

const SECRET = 'COLLEZ_ICI_LE_MOT_DE_PASSE';
const CLIENT_ID_GOOGLE = 'COLLEZ_ICI_L_IDENTIFIANT_CLIENT.apps.googleusercontent.com';
const EMAILS_AUTORISES = ['email.de.medhi@gmail.com', 'email.de.l.associe@gmail.com'];
const DOSSIER_MACHINE = '1VJF-xiHGXMUeqve2RJUYQKefrWTsG353'; // MACHINE CONTENU (ne pas toucher)
const DOSSIER_VIDEOS = '1Hpp7AjMRv8KqWqu79wbbfFLNqP02bRBT';  // VIDEO CLAUDE MONTE
const TIKTOK_REDIRECTION = 'https://ttbouchet.github.io/machine-contenu/appli/tiktok/';
const TIKTOK_API = 'https://business-api.tiktok.com/open_api/v1.3/tt_user/oauth2/';
const DEPOT_GITHUB = 'Ttbouchet/machine-contenu';

function doPost(e) {
  try {
    const d = JSON.parse(e.postData.contents);
    if (d.jeton) {
      const qui = verifierJeton(d.jeton);
      const actions = { app_charger, app_config_ecrire, app_decider, app_image, app_lister, app_tiktok_code };
      if (!actions[d.action]) return rep({ ok: false, erreur: 'action inconnue : ' + d.action });
      return rep(Object.assign({ ok: true, qui }, actions[d.action](d, qui)));
    }
    if (d.secret !== SECRET) return rep({ ok: false, erreur: 'mot de passe incorrect' });
    const actions = { config, etat_lire, etat_ecrire, deposer, lister, lire, decisions_lire, decisions_purger, notifier,
                      resultats_lire, resultats_ecrire, tiktok_jeton };
    if (!actions[d.action]) return rep({ ok: false, erreur: 'action inconnue : ' + d.action });
    return rep(Object.assign({ ok: true }, actions[d.action](d)));
  } catch (err) {
    return rep({ ok: false, erreur: String(err.message || err) });
  }
}

function rep(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

// ------------------------------------------------------------------ connexion de l'appli
function verifierJeton(jeton) {
  const cache = CacheService.getScriptCache();
  const cle = 'j_' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, jeton));
  const connu = cache.get(cle);
  if (connu) return connu;
  const r = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(jeton),
                              { muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) throw new Error('connexion expirée : reconnectez-vous');
  const t = JSON.parse(r.getContentText());
  const email = String(t.email || '').toLowerCase();
  if (t.aud !== CLIENT_ID_GOOGLE) throw new Error('connexion refusée (application inconnue)');
  if (String(t.email_verified) !== 'true' || EMAILS_AUTORISES.map(x => x.toLowerCase()).indexOf(email) < 0) {
    throw new Error('ce compte Google n\'a pas accès à Studio : ' + email);
  }
  const reste = Math.max(60, Math.min(1800, Number(t.exp) - Math.floor(Date.now() / 1000)));
  cache.put(cle, email, reste);
  return email;
}

// ------------------------------------------------------------------ outils Drive
function sousDossier(parent, nom) {
  const it = parent.getFoldersByName(nom);
  return it.hasNext() ? it.next() : parent.createFolder(nom);
}

function chemin(base, morceaux) {
  let f = base;
  morceaux.filter(String).forEach(m => { f = sousDossier(f, m); });
  return f;
}

function fichierJson(nom, creer) {
  const racine = DriveApp.getFolderById(DOSSIER_MACHINE);
  const it = racine.getFilesByName(nom);
  if (it.hasNext()) return it.next();
  return creer ? racine.createFile(nom, nom === 'decisions.json' ? '[]' : '{}', 'application/json') : null;
}

function lireJson(nom, defaut) {
  const f = fichierJson(nom, false);
  if (!f) return defaut;
  try { return JSON.parse(f.getBlob().getDataAsString('UTF-8')); } catch (e) { return defaut; }
}

function dansDossierMachine(f) {
  // Securite : l'appli ne peut lire que des fichiers rangés sous MACHINE CONTENU.
  const vus = {};
  let parents = f.getParents();
  for (let profondeur = 0; profondeur < 8 && parents.hasNext(); profondeur++) {
    const p = parents.next();
    if (p.getId() === DOSSIER_MACHINE) return true;
    if (vus[p.getId()]) break;
    vus[p.getId()] = true;
    parents = p.getParents();
  }
  return false;
}

// ------------------------------------------------------------------ machine
// Les reglages les plus recents. Garde les 40 derniers, met les autres a la corbeille.
function config() {
  const dossier = sousDossier(DriveApp.getFolderById(DOSSIER_MACHINE), 'reglages');
  const fichiers = [];
  const it = dossier.getFiles();
  while (it.hasNext()) fichiers.push(it.next());
  fichiers.sort((a, b) => b.getDateCreated() - a.getDateCreated());
  fichiers.slice(40).forEach(f => f.setTrashed(true));
  if (!fichiers.length) return { contenu: null };
  return { contenu: fichiers[0].getBlob().getDataAsString('UTF-8'), nom: fichiers[0].getName() };
}

function etat_lire() {
  const f = fichierJson('etat.json', false);
  return { contenu: f ? f.getBlob().getDataAsString('UTF-8') : '{}' };
}

function etat_ecrire(d) {
  fichierJson('etat.json', true).setContent(d.contenu);
  return {};
}

// zone = 'videos' (VIDEO CLAUDE MONTE) ou 'machine' ; chemin = sous-dossiers, ex. ['RewordyAI', '2026-11-21']
function deposer(d) {
  const base = DriveApp.getFolderById(d.zone === 'videos' ? DOSSIER_VIDEOS : DOSSIER_MACHINE);
  const dossier = chemin(base, d.chemin || []);
  const anciens = dossier.getFilesByName(d.nom);
  while (anciens.hasNext()) anciens.next().setTrashed(true);
  const f = dossier.createFile(Utilities.newBlob(Utilities.base64Decode(d.data), d.mime, d.nom));
  return { id: f.getId(), url: f.getUrl() };
}

function lister(d) {
  const dossier = chemin(DriveApp.getFolderById(DOSSIER_MACHINE), d.chemin || []);
  const res = [];
  const it = dossier.getFiles();
  while (it.hasNext()) { const f = it.next(); res.push({ id: f.getId(), nom: f.getName(), mime: f.getMimeType() }); }
  return { fichiers: res };
}

function lire(d) {
  const f = DriveApp.getFileById(d.id);
  return { nom: f.getName(), mime: f.getMimeType(), data: Utilities.base64Encode(f.getBlob().getBytes()) };
}

// Decisions prises dans l'appli (validations, refus + motif, choix de casting), pas encore traitees.
function decisions_lire() {
  return { decisions: lireJson('decisions.json', []) };
}

// La machine a traite ces decisions : on les retire.
function decisions_purger(d) {
  const verrou = LockService.getScriptLock();
  verrou.waitLock(20000);
  try {
    const faits = {};
    (d.ids || []).forEach(i => { faits[i] = true; });
    const reste = lireJson('decisions.json', []).filter(x => !faits[x.id]);
    fichierJson('decisions.json', true).setContent(JSON.stringify(reste));
    return { reste: reste.length };
  } finally {
    verrou.releaseLock();
  }
}

// E-mail aux personnes autorisees (ex. « 5 images pretes a valider »).
function notifier(d) {
  MailApp.sendEmail({ to: EMAILS_AUTORISES.join(','), subject: d.sujet || 'Studio', body: d.texte || '' });
  return {};
}

// ------------------------------------------------------------------ appli
function app_charger() {
  const c = config().contenu;
  return { config: c ? JSON.parse(c) : null, etat: lireJson('etat.json', {}), decisions: lireJson('decisions.json', []),
           resultats: lireJson('resultats.json', {}), tiktok: tiktok_statut() };
}

// Enregistre de nouveaux reglages. Refuse si quelqu'un d'autre a enregistre entre-temps (version).
function app_config_ecrire(d, qui) {
  const verrou = LockService.getScriptLock();
  verrou.waitLock(20000);
  try {
    const actuel = config().contenu;
    const versionActuelle = actuel ? Number(JSON.parse(actuel).version || 0) : 0;
    if (Number(d.config.version || 0) !== versionActuelle) {
      throw new Error('les réglages ont été modifiés ailleurs entre-temps : rechargez la page');
    }
    const nouveau = Object.assign({}, d.config, { version: versionActuelle + 1, maj: new Date().toISOString(), maj_par: qui });
    const dossier = sousDossier(DriveApp.getFolderById(DOSSIER_MACHINE), 'reglages');
    const nom = 'config-' + String(nouveau.version).padStart(5, '0') + '.json';
    dossier.createFile(nom, JSON.stringify(nouveau, null, 1), 'application/json');
    return { config: nouveau };
  } finally {
    verrou.releaseLock();
  }
}

// d.decision = { type: 'image', jour, slot, essai, choix: 'valide'|'refuse', motif? }
//            | { type: 'casting', personnage, essai, choix: <index du candidat> }
function app_decider(d, qui) {
  const verrou = LockService.getScriptLock();
  verrou.waitLock(20000);
  try {
    const liste = lireJson('decisions.json', []);
    const dec = Object.assign({}, d.decision, { id: Utilities.getUuid(), qui: qui, quand: new Date().toISOString() });
    liste.push(dec);
    fichierJson('decisions.json', true).setContent(JSON.stringify(liste));
    return { decision: dec };
  } finally {
    verrou.releaseLock();
  }
}

function app_image(d) {
  const f = DriveApp.getFileById(d.id);
  if (!dansDossierMachine(f)) throw new Error('fichier non autorisé');
  return { mime: f.getMimeType(), data: Utilities.base64Encode(f.getBlob().getBytes()) };
}

function app_lister(d) {
  return lister(d);
}

// ------------------------------------------------------------------ resultats (fiches des videos + chiffres TikTok)
function resultats_lire() {
  const f = fichierJson('resultats.json', false);
  return { contenu: f ? f.getBlob().getDataAsString('UTF-8') : '{}' };
}

function resultats_ecrire(d) {
  fichierJson('resultats.json', true).setContent(d.contenu);
  return {};
}

// ------------------------------------------------------------------ TikTok (lecture seule des statistiques)
// Les jetons TikTok restent ici, dans les proprietes du script. La machine demande un jeton valable a chaque releve.
function proprietes() { return PropertiesService.getScriptProperties(); }

function tiktok_statut() {
  const p = proprietes();
  const pret = !!(p.getProperty('TIKTOK_APP_ID') && p.getProperty('TIKTOK_SECRET'));
  return { appli_prete: pret, connecte: !!p.getProperty('TIKTOK_REFRESH'),
           url_autorisation: pret ? (p.getProperty('TIKTOK_URL_AUTORISATION') || '') : '',
           connecte_le: p.getProperty('TIKTOK_CONNECTE_LE') || '' };
}

function tiktokAppel(chemin, corps) {
  const p = proprietes();
  const r = UrlFetchApp.fetch(TIKTOK_API + chemin, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    payload: JSON.stringify(Object.assign({ client_id: p.getProperty('TIKTOK_APP_ID'),
                                            client_secret: p.getProperty('TIKTOK_SECRET') }, corps)) });
  const b = JSON.parse(r.getContentText() || '{}');
  if (b.code !== 0 || !b.data || !b.data.access_token) throw new Error('TikTok : ' + (b.message || r.getContentText().slice(0, 200)));
  return b.data;
}

function tiktokGarder(d) {
  proprietes().setProperties({
    TIKTOK_ACCES: d.access_token, TIKTOK_ACCES_FIN: String(Date.now() + (Number(d.expires_in || 86400) - 600) * 1000),
    TIKTOK_REFRESH: d.refresh_token, TIKTOK_OPEN_ID: d.open_id || proprietes().getProperty('TIKTOK_OPEN_ID') || '' });
}

// L'appli renvoie ici le code recu apres « Connecter TikTok » (valable 10 minutes, une seule fois).
function app_tiktok_code(d, qui) {
  if (!tiktok_statut().appli_prete) throw new Error('appli TikTok pas encore configurée dans le script Google');
  tiktokGarder(tiktokAppel('token/', { grant_type: 'authorization_code', auth_code: d.code, redirect_uri: TIKTOK_REDIRECTION }));
  proprietes().setProperty('TIKTOK_CONNECTE_LE', new Date().toISOString() + ' par ' + qui);
  return { tiktok: tiktok_statut() };
}

// Pour la machine : un jeton d'acces valable (renouvele automatiquement ; le renouvellement dure un an).
function tiktok_jeton() {
  const p = proprietes();
  if (!p.getProperty('TIKTOK_REFRESH')) return { erreur: 'TikTok non connecté : bouton « Connecter TikTok » dans Studio > Résultats' };
  if (!p.getProperty('TIKTOK_ACCES') || Date.now() > Number(p.getProperty('TIKTOK_ACCES_FIN') || 0)) {
    tiktokGarder(tiktokAppel('refresh_token/', { grant_type: 'refresh_token', refresh_token: p.getProperty('TIKTOK_REFRESH') }));
  }
  return { access_token: p.getProperty('TIKTOK_ACCES'), open_id: p.getProperty('TIKTOK_OPEN_ID') };
}

// ------------------------------------------------------------------ relance de la machine a heure fixe
// Le planning de GitHub est peu fiable (3 passages sur 56 le 22/11). Ce script relance donc la machine lui-meme :
// chaque heure, a 3 h 47 (images du jour) et vers 8 h (depart automatique). Executer UNE fois installer_declencheurs.
function lancerMachine(commande) {
  const jeton = proprietes().getProperty('GITHUB_JETON');
  if (!jeton) throw new Error('GITHUB_JETON manquant dans les propriétés du script');
  const r = UrlFetchApp.fetch('https://api.github.com/repos/' + DEPOT_GITHUB + '/actions/workflows/machine.yml/dispatches', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + jeton, Accept: 'application/vnd.github+json' },
    payload: JSON.stringify({ ref: 'main', inputs: { commande: commande } }) });
  if (r.getResponseCode() !== 204) throw new Error('GitHub a refusé (' + r.getResponseCode() + ') : ' + r.getContentText().slice(0, 200));
}

function relancer_matin() { lancerMachine('matin'); }
function relancer_suivi() { lancerMachine('suivi'); }

function installer_declencheurs() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (['relancer_matin', 'relancer_suivi'].indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('relancer_matin').timeBased().everyDays(1).atHour(3).nearMinute(50).inTimezone('Asia/Dubai').create();
  ScriptApp.newTrigger('relancer_suivi').timeBased().everyDays(1).atHour(8).nearMinute(15).inTimezone('Asia/Dubai').create();
  ScriptApp.newTrigger('relancer_suivi').timeBased().everyHours(1).create();
  lancerMachine('diagnostic');  // test immediat : un passage « diagnostic » doit apparaitre dans GitHub > Actions
  return 'ok';
}
