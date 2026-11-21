// Liaison avec le script Google (ou le serveur local de test).
// En ligne : connexion Google, puis chaque appel porte le jeton ; le script vérifie le compte.
import { REGLAGES } from './reglages.js';

const LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname);
let jeton = LOCAL ? 'local' : (sessionStorage.getItem('studio_jeton') || '');
let qui = LOCAL ? 'test local' : (sessionStorage.getItem('studio_qui') || '');

export const estLocal = LOCAL;
export function utilisateur() { return qui; }

function charger(src) {
  return new Promise((ok, ko) => {
    const s = document.createElement('script');
    s.src = src; s.async = true; s.onload = ok; s.onerror = () => ko(new Error('connexion Google indisponible'));
    document.head.appendChild(s);
  });
}

// Affiche le bouton « Se connecter avec Google » dans `zone` et attend la connexion.
export async function connecter(zone) {
  if (LOCAL || jeton) return;
  await charger('https://accounts.google.com/gsi/client');
  await new Promise((ok) => {
    google.accounts.id.initialize({
      client_id: REGLAGES.clientIdGoogle,
      auto_select: true,
      callback: (r) => {
        jeton = r.credential;
        try {
          const corps = JSON.parse(atob(jeton.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
          qui = corps.email || '';
        } catch (e) { qui = ''; }
        sessionStorage.setItem('studio_jeton', jeton);
        sessionStorage.setItem('studio_qui', qui);
        ok();
      },
    });
    google.accounts.id.renderButton(zone, { theme: 'outline', size: 'large', text: 'signin_with', locale: 'fr' });
    google.accounts.id.prompt();
  });
}

export function deconnecter() {
  sessionStorage.removeItem('studio_jeton');
  sessionStorage.removeItem('studio_qui');
  jeton = ''; qui = '';
  if (window.google && google.accounts) google.accounts.id.disableAutoSelect();
  location.reload();
}

export async function appel(action, donnees = {}) {
  const url = LOCAL ? '/api' : REGLAGES.urlScript;
  let r;
  try {
    // text/plain : requête « simple », acceptée par le script Google sans pré-vérification.
    r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                           body: JSON.stringify({ action, jeton, ...donnees }) });
  } catch (e) {
    throw new Error('pas de connexion internet ou serveur injoignable');
  }
  const b = await r.json().catch(() => ({ ok: false, erreur: 'réponse illisible du serveur' }));
  if (!b.ok) {
    if (/connexion expirée|reconnectez/.test(b.erreur || '')) {
      sessionStorage.removeItem('studio_jeton');
      jeton = '';
    }
    throw new Error(b.erreur || 'erreur inconnue');
  }
  return b;
}
