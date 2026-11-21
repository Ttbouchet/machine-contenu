// Réglages de connexion de l'appli. Rien de secret ici : l'identifiant client Google et l'adresse du script
// sont publics par nature ; la sécurité vient de la liste d'e-mails autorisés, vérifiée côté script Google.
export const REGLAGES = {
  urlScript: 'COLLEZ_ICI_L_URL_DE_L_APPLICATION_WEB_DU_SCRIPT_GOOGLE',
  clientIdGoogle: 'COLLEZ_ICI_L_IDENTIFIANT_CLIENT.apps.googleusercontent.com',
  catalogue: '../machine-contenu/donnees/catalogue.json',
  prixCreditUsd: 0.005,
};
