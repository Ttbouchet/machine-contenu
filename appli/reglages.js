// Réglages de connexion de l'appli. Rien de secret ici : l'identifiant client Google et l'adresse du script
// sont publics par nature ; la sécurité vient de la liste d'e-mails autorisés, vérifiée côté script Google.
export const REGLAGES = {
  urlScript: 'https://script.google.com/macros/s/AKfycbyCiV-f3TZhVW69w9CELUY29IWXMUSlsSGCaIpBAISwzf38vXol9rUXUwXMf8CNFtZkWA/exec',
  clientIdGoogle: '84497296428-5mktpmq3jccdt3c8ntcf184c4nip02ja.apps.googleusercontent.com',
  catalogue: '../machine-contenu/donnees/catalogue.json',
  prixCreditUsd: 0.005,
};
