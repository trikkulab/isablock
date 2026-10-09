// Configurazione dell'ambiente DEV (progetto Firebase personale, dati finti).
// Committata: i valori della config web NON sono segreti (identificano il
// progetto; l'accesso lo decidono le regole in firestore.rules.template).
// Sul ramo pubblicato (rel) questo file viene rimosso da scripts/publish-rel.sh.
// Finché il progetto non esiste `firebase` resta null: l'app dice
// "cloud non configurato" fuori da localhost (dove si usano gli emulatori).
export default {
  firebase: {
    apiKey: "AIzaSyAK_VvRDTvc9aVv4nCdv5BBkHOLlnsdzSQ",
    authDomain: "isablock-faadc.firebaseapp.com",
    projectId: "isablock-faadc",
    storageBucket: "isablock-faadc.firebasestorage.app",
    messagingSenderId: "1015224161510",
    appId: "1:1015224161510:web:4ebdc70c2d0f6625b75727"
  },
  // Su dev l'account personale non è del dominio: niente suggerimento `hd`.
  suggerisciDominio: false,
};
