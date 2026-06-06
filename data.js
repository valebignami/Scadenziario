// Configurazione "statica" dello Scadenziario PMI.
// Tutto il resto (scadenze, storico, responsabili per scadenza) e' su Supabase.

// Lista dipendenti — modificabile facilmente: aggiungi/rimuovi un nome e poi commit/push.
// Tutti vedranno la nuova lista entro 1-2 minuti.
// NOTA: in roadmap → spostare su tabella Supabase 'dipendenti' per gestione da UI.
window.DIPENDENTI = ["Marco", "Davide", "Roberto M", "Roberto L", "Elisa", "Valentina"];

// I 6 moduli/categorie dello scadenziario. Ogni scadenza appartiene a uno solo.
// "key" e' la chiave interna (no spazi), "label" e' cio' che vede l'utente.
window.MODULES = [
  { key: "personale",    label: "Personale",    short: "Personale",    icon: "👥" },
  { key: "fisco",        label: "Fisco",        short: "Fisco",        icon: "⚖️" },
  { key: "manutenzione", label: "Manutenzione", short: "Manutenzione", icon: "🔧" },
  { key: "fornitori",    label: "Fornitori",    short: "Fornitori",    icon: "🤝" },
  { key: "clienti",      label: "Clienti",      short: "Clienti",      icon: "📦" },
  { key: "utenze",       label: "Utenze",       short: "Utenze",       icon: "⚡" }
];
