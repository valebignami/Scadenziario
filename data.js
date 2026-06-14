// Configurazione "statica" dello Scadenziario PMI.
//
// NOTA: da giugno 2026 dipendenti e categorie NON stanno più qui, ma in due
// tabelle Supabase ('dipendenti' e 'categorie'), caricate all'avvio da app.js
// (vedi sbLoadDipendenti / sbLoadCategorie / applyConfig).
//
// Questi due array restano solo come fallback vuoto: vengono SOVRASCRITTI
// dal caricamento da Supabase. Non modificarli a mano per cambiare l'anagrafica:
// le modifiche si fanno sulle tabelle Supabase.
window.DIPENDENTI = [];
window.MODULES = [];
