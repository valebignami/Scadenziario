// Definizione moduli e dati demo dello scadenziario PMI
window.MODULES = [
  { key: "personale",    label: "Personale",    short: "Personale",    icon: "👥" },
  { key: "fisco",        label: "Fisco",        short: "Fisco",        icon: "⚖️" },
  { key: "manutenzione", label: "Manutenzione", short: "Manutenzione", icon: "🔧" },
  { key: "fornitori",    label: "Fornitori",    short: "Fornitori",    icon: "🤝" },
  { key: "clienti",      label: "Clienti",      short: "Clienti",      icon: "📦" },
  { key: "utenze",       label: "Utenze",       short: "Utenze",       icon: "⚡" }
];

// Mappa di migrazione: TUTTE le chiavi storiche → nuove 6 (applicata al load e su resetDemo)
window.MODULE_MIGRATION = {
  // Schema v1 (pre-refactor)
  fiscali:      "fisco",
  manutenzioni: "manutenzione",
  sicurezza:    "personale",
  hr:           "personale",
  veicoli:      "manutenzione",
  documenti:    "fisco",
  // Schema v2 (10 bucket) → v3 (6 bucket)
  hse:            "personale",
  macchinari:     "manutenzione",
  energia:        "utenze",
  certificazioni: "fisco",
  rifiuti:        "fisco",
  assicurazioni:  "fornitori"
};

// Helper: data relativa a oggi (delta giorni) — usa data locale per evitare shift UTC
function rel(days) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

window.DEMO_DATA = [
  // ---------------- 👥 PERSONALE ----------------
  { id: "demo-p1", module: "personale", title: "Elaborazione buste paga",
    date: rel(8), ref: "Studio paghe ConsulPaghe",
    recurType: "month", recurN: 1, notes: "15 dipendenti", done: false },
  { id: "demo-p2", module: "personale", title: "Scadenza contratto a termine - Bianchi A.",
    date: rel(52), ref: "ConsulPaghe",
    notes: "Decidere proroga / trasformazione a tempo indeterminato", done: false },
  { id: "demo-p3", module: "personale", title: "CCNL - aggiornamento minimi retributivi",
    date: rel(28), ref: "ConsulPaghe",
    recurType: "year", recurN: 1, done: false },
  { id: "demo-p4", module: "personale", title: "TFR - rivalutazione annuale",
    date: rel(280), ref: "Studio paghe",
    recurType: "year", recurN: 1, done: false },
  { id: "demo-p5", module: "personale", title: "Comunicazione lavoratori autonomi occasionali",
    date: rel(5), ref: "INL",
    notes: "Obbligo comunicazione preventiva inizio prestazione", done: false },

  // ---------------- 🦺 HSE (→ PERSONALE via migrazione) ----------------
  { id: "demo-h1", module: "hse", title: "Revisione semestrale estintori",
    date: rel(40), ref: "AntincendioPlus - 12 estintori",
    recurType: "month", recurN: 6, done: false },
  { id: "demo-h2", module: "hse", title: "Formazione antincendio rischio medio",
    date: rel(75), ref: "Ente formazione Sicurlavoro",
    recurType: "year", recurN: 3, notes: "4 addetti squadra emergenza", done: false },
  { id: "demo-h3", module: "hse", title: "Formazione primo soccorso (BLSD)",
    date: rel(150), ref: "Croce Verde - 3 addetti designati",
    recurType: "year", recurN: 3, done: false },
  { id: "demo-h4", module: "hse", title: "Revisione DVR",
    date: rel(220), ref: "RSPP Ing. Verdi",
    recurType: "year", recurN: 1, notes: "Annuale o al variare dei rischi", done: false },
  { id: "demo-h5", module: "hse", title: "Verifica impianto di terra",
    date: rel(-10), ref: "ASL - PROD03",
    recurType: "year", recurN: 2, notes: "URGENTE: verifica scaduta, prenotare subito", done: false },
  { id: "demo-h6", module: "hse", title: "Visita medica - Sig. Marchetti (magazziniere)",
    date: rel(7), ref: "Medico competente Dr. Galli",
    recurType: "year", recurN: 1, notes: "Sorveglianza sanitaria", done: false },
  { id: "demo-h7", module: "hse", title: "Visite mediche - 4 operai produzione",
    date: rel(35), ref: "Medico competente Dr. Galli",
    recurType: "year", recurN: 1, done: false },
  { id: "demo-h8", module: "hse", title: "Formazione carrellisti (patentino muletto)",
    date: rel(180), ref: "Ente Sicurlavoro - 3 operatori",
    recurType: "year", recurN: 5, done: false },

  // ---------------- 🏭 MACCHINARI (→ MANUTENZIONE via migrazione) ----------------
  { id: "demo-m1", module: "macchinari", title: "Cambio olio carrello elevatore",
    date: rel(-3), ref: "Officina Tecnomec - matr. CRL-12",
    recurType: "month", recurN: 2, notes: "Controllare anche filtro aria", done: false },
  { id: "demo-m2", module: "macchinari", title: "Manutenzione climatizzatori uffici",
    date: rel(25), ref: "ClimaService Srl",
    recurType: "month", recurN: 6, notes: "Pulizia filtri + sanificazione", done: false },
  { id: "demo-m3", module: "macchinari", title: "Taratura strumenti di misura",
    date: rel(95), ref: "Lab. Metrologico Bianchi",
    recurType: "year", recurN: 1, notes: "Certificato ISO 17025", done: false },
  { id: "demo-m4", module: "macchinari", title: "Revisione compressore aria",
    date: rel(60), ref: "Tecnomec srl",
    recurType: "year", recurN: 1, done: false },
  { id: "demo-m5", module: "macchinari", title: "Revisione ministeriale - Doblò AB123CD",
    date: rel(-5), ref: "Motorizzazione",
    recurType: "year", recurN: 2, notes: "SCADUTA: non utilizzare il mezzo", done: false },
  { id: "demo-m6", module: "macchinari", title: "Tagliando Iveco EF456GH",
    date: rel(90), ref: "Concessionaria Iveco - 80.000 km", done: false },
  { id: "demo-m7", module: "macchinari", title: "Verifica periodica paranco officina",
    date: rel(170), ref: "Organismo abilitato INAIL",
    recurType: "year", recurN: 1, done: false },

  // ---------------- 🪵 FORNITORI ----------------
  { id: "demo-f1", module: "fornitori", title: "Pagamento Acciaierie Lombarde (bonifico 30gg)",
    date: rel(12), ref: "Fattura 2026/4521",
    recurType: "month", recurN: 1, done: false },
  { id: "demo-f2", module: "fornitori", title: "Riordino lamiera Inox AISI 304",
    date: rel(6), ref: "Metallurgica Verdi srl",
    recurType: "month", recurN: 1, notes: "Lotto produzione settimanale", done: false },
  { id: "demo-f3", module: "fornitori", title: "Rinnovo contratto quadro utensili",
    date: rel(110), ref: "Bosch Profutensili",
    recurType: "year", recurN: 1, done: false },
  { id: "demo-f4", module: "fornitori", title: "Verifica certificati origine materie prime",
    date: rel(45), ref: "Ufficio acquisti",
    recurType: "month", recurN: 3, notes: "Compliance tracciabilità clienti", done: false },
  { id: "demo-f5", module: "fornitori", title: "Audit fornitore strategico Beta Componenti",
    date: rel(85), ref: "Direzione qualità",
    recurType: "year", recurN: 1, done: false },

  // ---------------- 📦 CLIENTI ----------------
  { id: "demo-c1", module: "clienti", title: "Scadenza RIBA cliente PRIME SRL",
    date: rel(3), ref: "Fatt. 2026/0089",
    recurType: "month", recurN: 1, done: false },
  { id: "demo-c2", module: "clienti", title: "Solleciti pagamento clienti in ritardo",
    date: rel(14), ref: "Amm.ne crediti",
    recurType: "month", recurN: 1, done: false },
  { id: "demo-c3", module: "clienti", title: "Rinnovo contratto fornitura Beta SpA",
    date: rel(75), ref: "Direzione commerciale",
    recurType: "year", recurN: 1, notes: "Negoziare prezzo prima della scadenza", done: false },
  { id: "demo-c4", module: "clienti", title: "Visura camerale aggiornata per gara",
    date: rel(17), ref: "Gara Comune di Milano", done: false },
  { id: "demo-c5", module: "clienti", title: "Riconciliazione partitari clienti",
    date: rel(28), ref: "Amm.ne",
    recurType: "month", recurN: 1, done: false },

  // ---------------- ⚡ UTENZE ----------------
  { id: "demo-e1", module: "energia", title: "Fattura energia elettrica",
    date: rel(4), ref: "Enel Energia - POD IT001E12345",
    recurType: "month", recurN: 1, done: false },
  { id: "demo-e2", module: "energia", title: "Fattura gas",
    date: rel(14), ref: "Eni Plenitude - PDR 09876543",
    recurType: "month", recurN: 1, done: false },
  { id: "demo-e3", module: "energia", title: "Canone affitto capannone",
    date: rel(-1), ref: "Immobiliare Verdi srl",
    recurType: "month", recurN: 1, notes: "Bonifico IBAN IT60 X054 28...", done: false },
  { id: "demo-e4", module: "energia", title: "Leasing tornio CNC",
    date: rel(22), ref: "UnicreditLeasing - contr. 2023/8821",
    recurType: "month", recurN: 1, done: false },
  { id: "demo-e5", module: "energia", title: "Abbonamento gestionale ERP",
    date: rel(70), ref: "Software house GestPro",
    recurType: "year", recurN: 1, done: false },

  // ---------------- ⚖️ FISCO ----------------
  { id: "demo-x1", module: "fisco", title: "Versamento F24 mensile",
    date: rel(11), ref: "Agenzia delle Entrate",
    recurType: "month", recurN: 1, notes: "Ritenute dipendenti, contributi INPS, IVA mensile", done: false },
  { id: "demo-x2", module: "fisco", title: "Liquidazione IVA trimestrale",
    date: rel(45), ref: "Studio Rossi Commercialisti",
    recurType: "month", recurN: 3, notes: "Verificare crediti IVA su acquisti", done: false },
  { id: "demo-x3", module: "fisco", title: "Versamento accise",
    date: rel(2), ref: "Agenzia Dogane",
    recurType: "month", recurN: 1, notes: "Accise carburanti uso aziendale", done: false },
  { id: "demo-x4", module: "fisco", title: "Dichiarazione Intrastat",
    date: rel(18), ref: "Studio Rossi Commercialisti",
    recurType: "month", recurN: 1, notes: "Acquisti UE > soglia", done: false },
  { id: "demo-x5", module: "fisco", title: "Modello 770 - Certificazioni Uniche",
    date: rel(120), ref: "Studio Rossi Commercialisti",
    recurType: "year", recurN: 1, done: false },
  { id: "demo-x6", module: "fisco", title: "Bollo Fiat Doblò AB123CD",
    date: rel(20), ref: "Regione",
    recurType: "year", recurN: 1, done: false },
  { id: "demo-x7", module: "fisco", title: "Diritto camerale CCIAA",
    date: rel(40), ref: "CCIAA Milano",
    recurType: "year", recurN: 1, done: false },
  { id: "demo-x8", module: "fisco", title: "Bilancio d'esercizio - deposito CCIAA",
    date: rel(195), ref: "Studio Rossi Commercialisti",
    recurType: "year", recurN: 1, done: false },

  // ---------------- 📜 CERTIFICAZIONI (→ FISCO via migrazione) ----------------
  { id: "demo-q1", module: "certificazioni", title: "Audit di sorveglianza ISO 9001",
    date: rel(130), ref: "Bureau Veritas",
    recurType: "year", recurN: 1, notes: "Preparare riesame della direzione 4 settimane prima", done: false },
  { id: "demo-q2", module: "certificazioni", title: "Verifica conformità marcatura CE prodotti",
    date: rel(180), ref: "Ufficio qualità",
    recurType: "year", recurN: 1, done: false },
  { id: "demo-q3", module: "certificazioni", title: "Rinnovo abilitazione fornitore certificato Cliente Top",
    date: rel(95), ref: "Vendor compliance Beta SpA",
    recurType: "year", recurN: 1, done: false },
  { id: "demo-q4", module: "certificazioni", title: "Rinnovo iscrizione Albo Gestori Ambientali",
    date: rel(220), ref: "Albo Nazionale Gestori",
    recurType: "year", recurN: 5, done: false },

  // ---------------- ♻️ RIFIUTI (→ FISCO via migrazione) ----------------
  { id: "demo-r1", module: "rifiuti", title: "MUD - Modello Unico Dichiarazione ambientale",
    date: rel(85), ref: "Studio ambientale Verdi",
    recurType: "year", recurN: 1, notes: "Scadenza 30 aprile di ogni anno", done: false },
  { id: "demo-r2", module: "rifiuti", title: "Ritiro rifiuti speciali pericolosi",
    date: rel(8), ref: "Ecoservizi spa - CER 12 01 09",
    recurType: "month", recurN: 1, done: false },
  { id: "demo-r3", module: "rifiuti", title: "Analisi emissioni in atmosfera",
    date: rel(110), ref: "Laboratorio ambientale",
    recurType: "year", recurN: 1, done: false },
  { id: "demo-r4", module: "rifiuti", title: "Rinnovo AUA - Autorizzazione Unica Ambientale",
    date: rel(540), ref: "Provincia di Milano",
    recurType: "year", recurN: 15, notes: "Validità 15 anni", done: false },
  { id: "demo-r5", module: "rifiuti", title: "Tenuta registro carico/scarico rifiuti",
    date: rel(15), ref: "Resp. ambiente",
    recurType: "month", recurN: 3, done: false },

  // ---------------- 🛡️ ASSICURAZIONI (→ FORNITORI via migrazione) ----------------
  { id: "demo-a1", module: "assicurazioni", title: "Rinnovo polizza RC aziendale",
    date: rel(63), ref: "Allianz - polizza globale",
    recurType: "year", recurN: 1, done: false },
  { id: "demo-a2", module: "assicurazioni", title: "Assicurazione furgone Iveco EF456GH",
    date: rel(48), ref: "Generali polizza nr. 998877",
    recurType: "year", recurN: 1, done: false },
  { id: "demo-a3", module: "assicurazioni", title: "Polizza infortuni dipendenti",
    date: rel(85), ref: "Reale Mutua",
    recurType: "year", recurN: 1, done: false },
  { id: "demo-a4", module: "assicurazioni", title: "Affidamento bancario - revisione annuale",
    date: rel(155), ref: "Intesa SP - rapp. 12345",
    recurType: "year", recurN: 1, notes: "Preparare bilancio e business plan", done: false },
  { id: "demo-a5", module: "assicurazioni", title: "Polizza credito clienti (assicurazione crediti)",
    date: rel(120), ref: "Coface",
    recurType: "year", recurN: 1, done: false }
];
