// Script a coller dans https://script.google.com (voir docs/GUIDE_installation_machine.md).
// C'est le pont entre trois choses et votre Google Drive :
//   - la MACHINE (GitHub) : mot de passe SECRET ; lit les reglages et les decisions, ecrit l'etat, depose photos et videos ;
//   - l'APPLI Studio (iPhone / Mac) : connexion Google, seuls les e-mails de EMAILS_AUTORISES passent ;
//   - l'e-mail du matin « images pretes ».
// A remplir : SECRET, CLIENT_ID_GOOGLE, EMAILS_AUTORISES.

const SECRET = 'COLLEZ_ICI_LE_MOT_DE_PASSE';
const CLIENT_ID_GOOGLE = 'COLLEZ_ICI_L_IDENTIFIANT_CLIENT.apps.googleusercontent.com';
const EMAILS_AUTORISES = ['email.de.medhi@gmail.com', 'email.de.l.associe@gmail.com'];
const DOSSIER_MACHINE = '1VJF-xiHGXMUeqve2RJUYQKefrWTsG353'; // MACHINE CONTENU (ne pas toucher)
const DOSSIER_VIDEOS = '1Hpp7AjMRv8KqWqu79wbbfFLNqP02bRBT';  // VIDEO CLAUDE MONTE

function doPost(e) {
  try {
    const d = JSON.parse(e.postData.contents);
    if (d.jeton) {
      const qui = verifierJeton(d.jeton);
      const actions = { app_charger, app_config_ecrire, app_decider, app_image, app_lister };
      if (!actions[d.action]) return rep({ ok: false, erreur: 'action inconnue : ' + d.action });
      return rep(Object.assign({ ok: true, qui }, actions[d.action](d, qui)));
    }
    if (d.secret !== SECRET) return rep({ ok: false, erreur: 'mot de passe incorrect' });
    const actions = { config, etat_lire, etat_ecrire, deposer, lister, lire, decisions_lire, decisions_purger, notifier };
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
  return { config: c ? JSON.parse(c) : null, etat: lireJson('etat.json', {}), decisions: lireJson('decisions.json', []) };
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
