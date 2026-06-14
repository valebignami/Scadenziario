// ============================================================
// CONFIGURAZIONE SUPABASE — modifica qui se cambi DB
// ============================================================
const SUPABASE_URL = "https://cqdmfhdcdvaezmexzxrq.supabase.co";
const SUPABASE_KEY = "sb_publishable_1ECriACxKWx6_4GPxyMXVQ_MPVc2GYy";

// (Fix #2) Se la libreria supabase-js non si è caricata (CDN bloccata, offline, ad-blocker),
// mostriamo un errore amichevole nel login overlay invece di schermata bianca.
if (typeof window.supabase === "undefined" || typeof window.supabase.createClient !== "function") {
  const _showFatal = () => {
    const overlay = document.getElementById("login-overlay");
    const errEl = document.getElementById("login-error");
    const form = document.getElementById("login-form");
    if (overlay) overlay.style.display = "flex";
    if (errEl) {
      errEl.textContent = "Errore di rete: librerie non caricate. Disattiva ad-blocker/VPN e ricarica la pagina (Ctrl+F5).";
      errEl.hidden = false;
    }
    if (form) form.querySelectorAll("input,button").forEach(el => { el.disabled = true; });
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", _showFatal);
  } else {
    _showFatal();
  }
  // Ferma esecuzione: senza sb-js nessun handler ha senso
  throw new Error("supabase-js non caricato — script halted");
}

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,        // salva sessione in localStorage → resti loggato
    autoRefreshToken: true,      // rinnova token JWT automaticamente
    detectSessionInUrl: false
  }
});

// ============================================================
// AUTH — login con email/password, sessione persistente
// ============================================================
function showLogin(errorMessage) {
  document.getElementById("app-root").hidden = true;
  document.getElementById("login-overlay").style.display = "flex";
  const err = document.getElementById("login-error");
  if (errorMessage) {
    err.textContent = errorMessage;
    err.hidden = false;
  } else {
    err.hidden = true;
  }
  // (Fix #11) Focus solo se l'utente NON sta già interagendo con un input
  // (es. sta digitando la password e arriva un evento auth → non gli sposto il cursore)
  setTimeout(() => {
    const active = document.activeElement;
    const userIsTyping = active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA");
    if (!userIsTyping || active === document.body) {
      const emailEl = document.getElementById("login-email");
      if (emailEl && !emailEl.value) emailEl.focus();
    }
  }, 50);
}

function hideLogin() {
  document.getElementById("login-overlay").style.display = "none";
  document.getElementById("app-root").hidden = false;
}

// Detection robusta di errori auth/RLS — usata da boot e da tutti i CRUD
// (Fix #6) Preferiamo status code e codici PostgREST a substring fuzzy
function isAuthError(e) {
  if (!e) return false;
  if (e.status === 401 || e.status === 403) return true;
  if (e.code === "PGRST301" || e.code === "PGRST302") return true; // PostgREST: JWT expired/invalid
  if (e.name === "AuthError" || e.name === "AuthApiError") return true;
  const msg = (e.message || "").toLowerCase();
  return msg.includes("jwt") ||
         msg.includes("not authenticated") ||
         msg.includes("unauthorized") ||
         msg.includes("permission denied") ||
         msg.includes("row-level security") ||
         msg.includes("row level security") ||
         msg.includes("rls");
}

// (Fix #3) Se un errore di qualsiasi CRUD è di tipo auth/RLS,
// faccio signOut + login senza che l'utente debba indovinare.
// (Fix #7) Se signOut fallisce (rete), avviso che la sessione lato server potrebbe essere ancora viva.
let _authErrorHandled = false;
async function handleAuthErrorIfAny(e) {
  if (!isAuthError(e)) return false;
  if (_authErrorHandled) return true; // evita doppio signOut se più CRUD falliscono in serie
  _authErrorHandled = true;
  let signOutOk = true;
  try {
    const r = await sb.auth.signOut();
    if (r && r.error) signOutOk = false;
  } catch (_) {
    signOutOk = false;
  }
  showLogin(signOutOk
    ? "Sessione scaduta. Effettua di nuovo l'accesso."
    : "Sessione scaduta ma logout non confermato (rete?). Effettua login: se persiste, ricarica con Ctrl+F5.");
  return true;
}

// (Fix #2) Cleanup realtime estratto come helper riutilizzabile
async function sbUnsubscribe() {
  if (_sbChannel) {
    try { await sb.removeChannel(_sbChannel); } catch (_) {}
    _sbChannel = null;
  }
  if (_sbConfigChannel) {
    try { await sb.removeChannel(_sbConfigChannel); } catch (_) {}
    _sbConfigChannel = null;
  }
}

// (Fix #11) Reset filtri/ricerca tra utenti diversi.
// (Fix #10) NON resetta state.view né calYear/calMonth → l'utente torna dove era prima del logout.
function resetUiState() {
  state.modules = [];
  state.status = "all";
  state.recurFilter = "all";
  state.responsabili = [];
  state.query = "";
  state.histPeriod = "all";
  // Allinea anche il DOM (input non controllati)
  const search = document.getElementById("search");
  if (search) search.value = "";
  const histPeriod = document.getElementById("hist-period");
  if (histPeriod) histPeriod.value = "all";
  closeResponsabiliPanel();
}

// (Fix #5) Chiusura modali in stato pendente al logout
function closeAllModalsForLogout() {
  const modal = document.getElementById("modal");
  if (modal) modal.hidden = true;
  const doneModal = document.getElementById("done-modal");
  if (doneModal) doneModal.hidden = true;
  _pendingDoneId = null;
  _modalFromStorico = false;
}

async function handleLoginSubmit(e) {
  e.preventDefault();
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;
  const btn = document.getElementById("login-submit");
  const err = document.getElementById("login-error");
  err.hidden = true;
  btn.disabled = true;
  btn.textContent = "Accesso in corso…";
  try {
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    // signed in → onAuthStateChange farà il resto
    _authErrorHandled = false; // resetta flag per il prossimo eventuale errore
  } catch (e) {
    err.textContent = "Email o password errate. Riprova.";
    err.hidden = false;
    console.error("Login error:", e);
  } finally {
    btn.disabled = false;
    btn.textContent = "Accedi";
  }
}

async function handleLogout() {
  if (!confirm("Sicuro di voler uscire?")) return;
  const btn = document.getElementById("btn-logout");
  if (btn) btn.disabled = true; // evita doppio click
  try {
    await sbUnsubscribe();
    const r = await sb.auth.signOut();
    // (Fix #7) signOut può ritornare { error } invece di throware — controllo entrambi
    if (r && r.error) throw r.error;
    // onAuthStateChange farà vedere il login
  } catch (e) {
    console.error("Logout error:", e);
    // Forzo comunque cleanup UI lato client + mostro login con avviso.
    // Se la rete recupera, il prossimo refresh del token confermerà lo stato.
    closeAllModalsForLogout();
    resetUiState();
    _booted = false;
    _authErrorHandled = false;
    state.items = [];
    showLogin("Uscita non confermata dal server (rete?). Per sicurezza, ricarica con Ctrl+F5.");
  } finally {
    if (btn) btn.disabled = false;
  }
}

// (Fix #1) _booted viene settato a true SOLO dopo che boot() finisce con successo.
// _bootInProgress evita che due SIGNED_IN ravvicinati avviino boot in parallelo.
let _booted = false;
let _bootInProgress = false;
async function startApp(session) {
  // popola email utente nella sidebar
  const userEmailEl = document.getElementById("user-email");
  if (userEmailEl) userEmailEl.textContent = session?.user?.email || "—";
  hideLogin();
  if (_booted || _bootInProgress) return;
  _bootInProgress = true;
  try {
    await boot();
    _booted = true;
    _authErrorHandled = false; // boot ok → resetta il guard per i prossimi errori
  } catch (e) {
    console.error("startApp error:", e);
    // _booted resta false → un futuro SIGNED_IN potrà riprovare
  } finally {
    _bootInProgress = false;
  }
}

// Mappatura JS object ↔ riga SQL (camelCase ↔ snake_case)
function toSupabase(item) {
  return {
    id: item.id,
    title: item.title || "",
    description: item.description || item.notes || "",
    module: item.module,
    date: item.date,
    recur_type: item.recurType || "none",
    recur_n: (item.recurType && item.recurType !== "none") ? (item.recurN || 1) : null,
    done: !!item.done,
    done_at: item.doneAt || null,
    done_by: item.doneBy || null,
    last_done_at: item.lastDoneAt || null,
    last_done_by: item.lastDoneBy || null,
    previous_date: item.previousDate || null,
    history: Array.isArray(item.history) ? item.history : [],
    responsabili: Array.isArray(item.responsabili) ? item.responsabili : []
  };
}
function fromSupabase(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description || "",
    module: row.module == null ? null : Number(row.module),         // ID categoria numerico
    date: row.date,
    recurType: row.recur_type || "none",
    recurN: row.recur_n || null,
    done: !!row.done,
    doneAt: row.done_at || null,
    doneBy: row.done_by || null,
    lastDoneAt: row.last_done_at || null,
    lastDoneBy: row.last_done_by || null,
    previousDate: row.previous_date || null,
    history: Array.isArray(row.history) ? row.history : [],
    responsabili: (Array.isArray(row.responsabili) ? row.responsabili : []).map(Number) // ID dipendenti numerici
  };
}

// CRUD Supabase
// (Fix #3 + #1) Ogni CRUD AWAIT-a handleAuthErrorIfAny — così signOut+showLogin
// avvengono PRIMA del throw → l'utente vede il login subito, non un alert generico.
async function sbLoadAll() {
  const { data, error } = await sb.from("scadenze").select("*");
  if (error) {
    console.error("Errore load:", error);
    await handleAuthErrorIfAny(error);
    throw new Error(error.message || "sbLoadAll failed");
  }
  return data.map(fromSupabase);
}
async function sbUpsert(item) {
  const { error } = await sb.from("scadenze").upsert(toSupabase(item));
  if (error) {
    console.error("Errore upsert:", error);
    await handleAuthErrorIfAny(error);
    throw new Error(error.message || "Upsert failed");
  }
}
async function sbUpsertMany(items) {
  if (!items.length) return;
  const rows = items.map(toSupabase);
  const { error } = await sb.from("scadenze").upsert(rows);
  if (error) {
    console.error("Errore upsert bulk:", error);
    await handleAuthErrorIfAny(error);
    throw new Error(error.message || "UpsertMany failed");
  }
}
async function sbDelete(id) {
  const { error } = await sb.from("scadenze").delete().eq("id", id);
  if (error) {
    console.error("Errore delete:", error);
    await handleAuthErrorIfAny(error);
    throw new Error(error.message || "Delete failed");
  }
}
async function sbDeleteAll() {
  const { error } = await sb.from("scadenze").delete().neq("id", "__never_match__");
  if (error) {
    console.error("Errore deleteAll:", error);
    await handleAuthErrorIfAny(error);
  }
}

// ---------- Anagrafiche (categorie + dipendenti) da Supabase ----------
async function sbLoadCategorie() {
  const { data, error } = await sb.from("categorie").select("*").order("ordine", { ascending: true });
  if (error) {
    console.error("Errore load categorie:", error);
    await handleAuthErrorIfAny(error);
    throw new Error(error.message || "sbLoadCategorie failed");
  }
  return data;
}
async function sbLoadDipendenti() {
  const { data, error } = await sb.from("dipendenti").select("*").order("ordine", { ascending: true });
  if (error) {
    console.error("Errore load dipendenti:", error);
    await handleAuthErrorIfAny(error);
    throw new Error(error.message || "sbLoadDipendenti failed");
  }
  return data;
}
// Riversa le righe Supabase nelle liste in memoria usate da tutta l'app.
// MODULES: key = id categoria (numero); porta anche colori (bg/fg) come dato.
// DIPENDENTI: oggetti { id, nome, attivo }.
function applyConfig(categorie, dipendenti) {
  window.MODULES = (categorie || []).map(c => ({
    key: Number(c.id),     // ID sempre numerico (Supabase può restituire bigint come stringa)
    label: c.label,
    short: c.label,
    icon: c.icon || "•",
    bg: c.colore_bg || "#eef0f4",
    fg: c.colore_testo || "#333a45",
    attivo: c.attivo !== false
  }));
  window.DIPENDENTI = (dipendenti || []).map(d => ({
    id: Number(d.id),
    nome: d.nome,
    attivo: d.attivo !== false
  }));
}

// Realtime: quando un altro utente modifica, aggiorno lo stato locale
let _sbChannel = null;
let _sbConfigChannel = null;
function sbSubscribe() {
  if (_sbChannel) return;
  _sbChannel = sb.channel("scadenze-rt")
    .on("postgres_changes", { event: "*", schema: "public", table: "scadenze" }, (payload) => {
      if (payload.eventType === "INSERT") {
        const it = fromSupabase(payload.new);
        if (!state.items.some(i => i.id === it.id)) state.items.push(it);
      } else if (payload.eventType === "UPDATE") {
        const it = fromSupabase(payload.new);
        const idx = state.items.findIndex(i => i.id === it.id);
        if (idx >= 0) state.items[idx] = it;
        else state.items.push(it);
      } else if (payload.eventType === "DELETE") {
        const idx = state.items.findIndex(i => i.id === payload.old.id);
        if (idx >= 0) state.items.splice(idx, 1);
      }
      renderAll();
    })
    .subscribe();
}

// Realtime anagrafiche: se qualcuno cambia categorie/dipendenti, ricarico la config e rirenderizzo.
function sbSubscribeConfig() {
  if (_sbConfigChannel) return;
  const reload = async () => {
    try {
      const [categorie, dipendenti] = await Promise.all([sbLoadCategorie(), sbLoadDipendenti()]);
      applyConfig(categorie, dipendenti);
      renderAll();
      if (typeof renderConfig === "function") renderConfig();
    } catch (e) {
      console.error("Errore reload config realtime:", e);
    }
  };
  _sbConfigChannel = sb.channel("config-rt")
    .on("postgres_changes", { event: "*", schema: "public", table: "categorie" }, reload)
    .on("postgres_changes", { event: "*", schema: "public", table: "dipendenti" }, reload)
    .subscribe();
}

// ---------- Stato ----------
const _now = new Date();
const state = {
  items: [],
  modules: [],            // [] = tutte; altrimenti array di module.key selezionati
  status: "all",
  recurFilter: "all",     // "all" | "recurring" | "oneshot"
  responsabili: [],       // [] = tutti; può contenere "__none__" e/o ID dipendente
  query: "",
  view: "list",           // "list" | "calendar" | "history"
  calYear: _now.getFullYear(),
  calMonth: _now.getMonth(),
  histPeriod: "all"       // "all" | "year" | "90" | "30"
};

const MESI_IT = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno",
                 "Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];

// ---------- Boot ----------
// Carica le scadenze dal cloud (Supabase). Se il cloud e' vuoto, l'app mostra
// lo stato vuoto naturale; l'utente aggiungera' la prima scadenza dalla UI.
async function load() {
  // Prima le anagrafiche (servono per risolvere categorie/responsabili delle scadenze),
  // poi le scadenze.
  const [categorie, dipendenti] = await Promise.all([sbLoadCategorie(), sbLoadDipendenti()]);
  applyConfig(categorie, dipendenti);
  state.items = await sbLoadAll();
}

// ---------- Helpers ----------
function localISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function parseISO(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function todayISO() {
  return localISO(new Date());
}
function daysBetween(iso) {
  const today = parseISO(todayISO());
  const target = parseISO(iso);
  return Math.round((target - today) / 86400000);
}
function daysBetweenIso(fromIso, toIso) {
  return Math.round((parseISO(toIso) - parseISO(fromIso)) / 86400000);
}
function fmtDate(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
function fmtEuro(n) {
  if (n == null || n === "") return "";
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
}
function moduleOf(id) {
  return (window.MODULES || []).find(m => m.key === id)
    || { key: id, label: "—", icon: "•", bg: "#eef0f4", fg: "#333a45" };
}
function activeModules() {
  return (window.MODULES || []).filter(m => m.attivo);
}
function dipendenteOf(id) {
  return (window.DIPENDENTI || []).find(d => d.id === id) || { id, nome: "—" };
}
function activeDipendenti() {
  return (window.DIPENDENTI || []).filter(d => d.attivo);
}
// Array di ID responsabili → array di nomi (per visualizzazione/export)
function dipNomi(ids) {
  return (Array.isArray(ids) ? ids : []).map(id => dipendenteOf(id).nome);
}
function urgency(days, done) {
  if (done) return "done";
  if (days < 0) return "overdue";
  if (days <= 7) return "week";
  if (days <= 30) return "month";
  return "future";
}
function urgencyColor(u) {
  return { overdue: "red", week: "orange", month: "yellow", future: "green", done: "gray" }[u];
}
function recurLabel(item) {
  if (!item.recurType || item.recurType === "none") return "—";
  const n = item.recurN || 1;
  const unit = { day: n === 1 ? "giorno" : "giorni", month: n === 1 ? "mese" : "mesi", year: n === 1 ? "anno" : "anni" }[item.recurType];
  return `ogni ${n} ${unit}`;
}
function uid() {
  return "id-" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
function isRecurring(it) {
  return !!(it.recurType && it.recurType !== "none");
}
function inModuleScope(it) {
  // [] = nessun filtro (tutte le categorie). Altrimenti l'item passa se è in una delle selezionate.
  return state.modules.length === 0 || state.modules.includes(it.module);
}
function inRecurScope(it) {
  if (state.recurFilter === "all") return true;
  return state.recurFilter === "recurring" ? isRecurring(it) : !isRecurring(it);
}
function inResponsabileScope(it) {
  // [] = nessun filtro (tutti). Altrimenti basta che l'item soddisfi UNA delle selezioni (OR).
  if (state.responsabili.length === 0) return true;
  const resp = Array.isArray(it.responsabili) ? it.responsabili : [];
  return state.responsabili.some(sel =>
    sel === "__none__" ? resp.length === 0 : resp.includes(sel)
  );
}
function fmtRelativeDays(days) {
  if (days === 0) return "oggi";
  const abs = Math.abs(days);
  const future = days > 0;
  let n, unit;
  if (abs <= 14) {
    n = abs; unit = "gg";
  } else if (abs <= 60) {
    n = Math.round(abs / 7); unit = "sett";
  } else if (abs <= 330) {
    n = Math.round(abs / 30);
    unit = n === 1 ? "mese" : "mesi";
  } else {
    n = Math.round(abs / 365);
    unit = n === 1 ? "anno" : "anni";
  }
  return future ? `tra ${n} ${unit}` : `${n} ${unit} fa`;
}
function advanceDate(iso, type, n) {
  const d = parseISO(iso);
  if (type === "day") d.setDate(d.getDate() + n);
  else if (type === "month") d.setMonth(d.getMonth() + n);
  else if (type === "year") d.setFullYear(d.getFullYear() + n);
  return localISO(d);
}
// Vero se l'item ricorrente ha una occorrenza FUTURA proiettata sulla data data (oltre it.date)
function isProjectedOccurrenceOn(item, isoDate) {
  if (!item.recurType || item.recurType === "none") return false;
  if (item.date === isoDate) return false; // questa è la "vera" occorrenza, non una proiezione
  const baseD = parseISO(item.date);
  const targetD = parseISO(isoDate);
  if (targetD <= baseD) return false; // proiettiamo solo nel futuro rispetto a item.date
  const n = item.recurN || 1;
  if (item.recurType === "day") {
    const diff = Math.round((targetD - baseD) / 86400000);
    return diff > 0 && diff % n === 0;
  }
  if (item.recurType === "month") {
    if (baseD.getDate() !== targetD.getDate()) return false;
    const md = (targetD.getFullYear() - baseD.getFullYear()) * 12 + (targetD.getMonth() - baseD.getMonth());
    return md > 0 && md % n === 0;
  }
  if (item.recurType === "year") {
    if (baseD.getDate() !== targetD.getDate()) return false;
    if (baseD.getMonth() !== targetD.getMonth()) return false;
    const yd = targetD.getFullYear() - baseD.getFullYear();
    return yd > 0 && yd % n === 0;
  }
  return false;
}

// ---------- Render moduli sidebar ----------
function renderModules() {
  const nav = document.getElementById("modules");
  const total = state.items.filter(i => !i.done).length;
  nav.innerHTML = `
    <button class="module-btn module-all ${state.modules.length === 0 ? "active" : ""}" data-module="all" title="Mostra tutte / azzera selezione">
      <span class="mod-check mod-reset">✕</span>
      <span class="mod-ico">📋</span><span class="mod-label">Tutte le scadenze</span>
      <span class="mod-count">${total}</span>
    </button>
    ${activeModules().map(m => {
      const count = state.items.filter(i => i.module === m.key && !i.done).length;
      const checked = state.modules.includes(m.key);
      // Colore della categoria applicato inline (i colori sono un dato, non più CSS).
      return `
        <button class="module-btn ${checked ? "active" : ""}" data-module="${m.key}" style="background:${m.bg};color:${m.fg}">
          <input type="checkbox" class="mod-check" tabindex="-1" ${checked ? "checked" : ""}>
          <span class="mod-ico">${m.icon}</span><span class="mod-label">${escapeHtml(m.label)}</span>
          <span class="mod-count">${count}</span>
        </button>`;
    }).join("")}
  `;
  nav.querySelectorAll(".module-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const raw = btn.dataset.module;
      // "Tutte le scadenze" → svuota la selezione (mostra tutto).
      // Ogni altro modulo → toggle nella selezione (multiselezione, riclicco = rimuovi).
      if (raw === "all") {
        state.modules = [];
        renderAll();
        return;
      }
      const key = Number(raw); // gli ID sono numerici
      if (state.modules.includes(key)) {
        state.modules = state.modules.filter(k => k !== key);
      } else {
        state.modules = [...state.modules, key];
      }
      // NB: non chiudo il drawer mobile, così si possono selezionare più categorie di fila.
      renderAll();
    });
  });
}

// ---------- Avatar responsabili (iniziali + colore tenue, deterministico dal nome) ----------
function personInitials(name) {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0] || "?").slice(0, 1).toUpperCase();
}
function personColors(value) {
  if (value === "__none__") return { bg: "#e9ebef", fg: "#6b7280" };
  // Tinte distribuite uniformemente sul cerchio in base alla posizione in DIPENDENTI:
  // così risultano ben distinte tra loro. value = ID dipendente.
  const list = window.DIPENDENTI || [];
  const idx = list.findIndex(d => d.id === value);
  const total = Math.max(list.length, 1);
  const hue = Math.round((idx >= 0 ? idx : 0) * (360 / total) + 15) % 360;
  return { bg: `hsl(${hue} 52% 88%)`, fg: `hsl(${hue} 40% 38%)` };
}
// value = ID dipendente (numero) oppure "__none__"
function personAvatar(value, extraClass = "") {
  const c = personColors(value);
  const label = value === "__none__" ? "∅" : personInitials(dipendenteOf(value).nome);
  return `<span class="resp-av ${extraClass}" style="background:${c.bg};color:${c.fg}">${escapeHtml(label)}</span>`;
}
function respLabel(value) {
  return value === "__none__" ? "Non assegnato" : dipendenteOf(value).nome;
}
// Ordina i responsabili per nome, con "Non assegnato" sempre in fondo
function compareResp(a, b) {
  if (a === "__none__") return 1;
  if (b === "__none__") return -1;
  return dipendenteOf(a).nome.localeCompare(dipendenteOf(b).nome, "it");
}

// ---------- Render dropdown multiselezione Responsabili ----------
function renderResponsabili() {
  const panel = document.getElementById("responsabili-panel");
  const summary = document.getElementById("responsabili-summary");
  if (!panel || !summary) return;
  const dipendenti = activeDipendenti();

  // Conta non-completati per ogni dipendente (per ID) nel modulo+tipo correnti.
  // NB: NON applico inResponsabileScope qui (sarebbe circolare).
  const inOtherScope = it => inModuleScope(it) && inRecurScope(it);
  const counts = Object.fromEntries(dipendenti.map(d => [d.id, 0]));
  let unassigned = 0;
  state.items.forEach(it => {
    if (!inOtherScope(it)) return;
    if (it.done) return;
    const resp = Array.isArray(it.responsabili) ? it.responsabili : [];
    if (resp.length === 0) {
      unassigned++;
    } else {
      resp.forEach(id => { if (counts[id] !== undefined) counts[id]++; });
    }
  });

  const sel = new Set(state.responsabili);
  const ordered = [...dipendenti].sort((a, b) => a.nome.localeCompare(b.nome, "it"));
  const row = (value, label, count) => {
    const on = sel.has(value);
    return `
      <div class="resp-opt ${on ? "on" : ""}" data-value="${value}" role="option" aria-selected="${on}">
        ${personAvatar(value)}
        <span class="resp-nm">${escapeHtml(label)}</span>
        <span class="resp-ct">${count}</span>
        <span class="resp-tick">✓</span>
      </div>`;
  };
  panel.innerHTML =
    ordered.map(d => row(d.id, d.nome, counts[d.id])).join("") +
    row("__none__", "Non assegnato", unassigned);

  // Riepilogo sul bottone
  const selected = [...state.responsabili].sort(compareResp);
  const n = selected.length;
  if (n === 0) {
    summary.innerHTML = `<span class="resp-summary-text">Tutti</span>`;
  } else if (n === 1) {
    summary.innerHTML = `${personAvatar(selected[0])}<span class="resp-summary-text">${escapeHtml(respLabel(selected[0]))}</span>`;
  } else {
    const avatars = selected.slice(0, 4).map(v => personAvatar(v)).join("");
    const more = n > 4 ? `<span class="resp-more">+${n - 4}</span>` : "";
    summary.innerHTML = `${avatars}${more}<span class="resp-summary-text">${n} selezionati</span>`;
  }
}

// ---------- Drawer mobile ----------
function toggleDrawer(force) {
  const sidebar = document.getElementById("sidebar");
  const backdrop = document.getElementById("drawer-backdrop");
  const open = (typeof force === "boolean") ? force : !sidebar.classList.contains("open");
  sidebar.classList.toggle("open", open);
  backdrop.classList.toggle("open", open);
  document.body.style.overflow = open ? "hidden" : "";
}

// ---------- Render KPI ----------
function renderKpis() {
  // Tutti i KPI (incluso "Tutte le scadenze") rispettano modulo + filtro tipo, e contano solo item attivi (non done)
  // così la matematica torna sempre: kpi-all === overdue + week + month + future
  const scoped = state.items.filter(it => inModuleScope(it) && inRecurScope(it) && inResponsabileScope(it));
  const counts = { overdue: 0, week: 0, month: 0, future: 0, done: 0 };
  scoped.forEach(it => {
    const u = urgency(daysBetween(it.date), it.done);
    counts[u]++;
  });
  const activeTotal = counts.overdue + counts.week + counts.month + counts.future;
  document.getElementById("kpi-all").textContent = activeTotal;
  document.getElementById("kpi-overdue").textContent = counts.overdue;
  document.getElementById("kpi-week").textContent = counts.week;
  document.getElementById("kpi-month").textContent = counts.month;
  document.getElementById("kpi-future").textContent = counts.future;

  // Evidenzia il KPI corrispondente al filtro attivo
  document.querySelectorAll(".kpi").forEach(k => {
    k.classList.toggle("active", k.dataset.status === state.status);
  });
}

// ---------- Render lista ----------
function visibleItems() {
  const q = state.query.toLowerCase().trim();
  return state.items
    // Le scadenze "una tantum" già fatte vivono solo nello Storico, non in lista.
    // (Le ricorrenti non diventano mai done: avanzano alla data successiva.)
    .filter(it => !it.done)
    .filter(it => inModuleScope(it) && inRecurScope(it) && inResponsabileScope(it))
    .filter(it => {
      if (state.status === "all") return true;
      const u = urgency(daysBetween(it.date), it.done);
      return u === state.status;
    })
    .filter(it => {
      if (!q) return true;
      const respText = dipNomi(it.responsabili).join(" ").toLowerCase();
      return (it.title || "").toLowerCase().includes(q)
        || (it.description || "").toLowerCase().includes(q)
        || respText.includes(q);
    })
    .sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      return a.date.localeCompare(b.date);
    });
}

function renderList() {
  const list = document.getElementById("rows");
  const items = visibleItems();
  const empty = document.getElementById("empty");
  empty.hidden = items.length > 0;

  list.innerHTML = items.map(it => {
    const days = daysBetween(it.date);
    const u = urgency(days, it.done);
    const color = urgencyColor(u);
    const mod = moduleOf(it.module);
    const daysTxt = it.done ? "✓ fatta" : fmtRelativeDays(days);
    const noteParts = [];
    // Ordine: prima il flag "✓ ultima", poi la descrizione
    if (it.lastDoneAt) noteParts.push(`✓ ultima: ${fmtDate(it.lastDoneAt)}`);
    if (it.description) noteParts.push(it.description);
    return `
      <div class="row-item ${it.done ? "done" : ""}" data-id="${it.id}">
        <div><span class="status-dot ${color}"></span></div>
        <div class="title-cell">
          <strong>${escapeHtml(it.title)}</strong>
          ${noteParts.length ? `<span class="note">${escapeHtml(noteParts.join(" · "))}</span>` : ""}
        </div>
        <div><span class="chip" style="background:${mod.bg};color:${mod.fg}">${mod.icon} ${escapeHtml(mod.short || mod.label)}</span></div>
        <div>${fmtDate(it.date)}</div>
        <div class="days-cell ${color}" title="${it.done ? 'completata' : days + ' giorni'}">${daysTxt}</div>
        <div class="ref-cell">${escapeHtml(dipNomi(it.responsabili).join(", ") || "—")}</div>
        <div class="rec-cell">${recurLabel(it)}</div>
      </div>`;
  }).join("");

  list.querySelectorAll(".row-item").forEach(row => {
    const id = row.dataset.id;
    // Click su qualsiasi punto della riga → apre la scheda in modalità lettura
    row.addEventListener("click", () => {
      const it = state.items.find(i => i.id === id);
      if (it) openModal(it, "read");
    });
  });
}

function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// Filtri attivi: usato dal bottone "Pulisci filtri" per mostrarsi/nascondersi
// (Fix #9) Include histPeriod per coerenza con clearAllFilters
function hasActiveFilters() {
  return state.modules.length > 0 ||
         state.status !== "all" ||
         state.recurFilter !== "all" ||
         state.responsabili.length > 0 ||
         state.histPeriod !== "all" ||
         (state.query || "").trim() !== "";
}

function renderClearFiltersBtn() {
  const btn = document.getElementById("btn-clear-filters");
  if (!btn) return;
  btn.hidden = !hasActiveFilters();
}

// Reset di TUTTI i filtri (modulo + status + ricorrenza + responsabile + ricerca + periodo storico).
// (Fix #9) Aggiunto histPeriod. NON tocca view/calYear/calMonth → l'utente resta dove sta navigando.
function clearAllFilters() {
  state.modules = [];
  state.status = "all";
  state.recurFilter = "all";
  state.responsabili = [];
  state.query = "";
  state.histPeriod = "all";
  const search = document.getElementById("search");
  if (search) search.value = "";
  const histPeriod = document.getElementById("hist-period");
  if (histPeriod) histPeriod.value = "all";
  closeResponsabiliPanel();
  renderAll();
}

function renderAll() {
  renderModules();
  renderResponsabili();
  renderKpis();
  renderClearFiltersBtn();
  if (state.view === "calendar") renderCalendar();
  else if (state.view === "history") renderHistoryView();
  else renderList();
}

// ---------- Render Calendario ----------
function renderCalendar() {
  const grid = document.getElementById("cal-grid");
  const title = document.getElementById("cal-title");
  const y = state.calYear, m = state.calMonth;
  title.textContent = `${MESI_IT[m]} ${y}`;

  // Legenda categorie (dinamica, colori dal dato) + voce "proiezione"
  const legend = document.getElementById("cal-legend");
  if (legend) {
    legend.innerHTML = activeModules().map(mod =>
      `<span class="leg"><i class="leg-chip" style="background:${mod.bg};border-left-color:${mod.fg}"></i>${escapeHtml(mod.label)}</span>`
    ).join("") + `<span class="leg">↻<i style="opacity:.55;font-style:italic"> proiezione</i></span>`;
  }

  // Primo giorno del mese, offset settimana (lunedì = 0)
  const first = new Date(y, m, 1);
  const startOffset = (first.getDay() + 6) % 7;

  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(y, m, 1 - startOffset + i);
    const iso = localISO(d);
    const isOther = d.getMonth() !== m;
    const isToday = iso === todayISO();
    // Occorrenze "vere" (item.date === iso) e proiezioni future delle ricorrenti
    const events = state.items
      .filter(it => inModuleScope(it) && inRecurScope(it) && inResponsabileScope(it))
      .flatMap(it => {
        if (it.date === iso) return [{ it, virtual: false }];
        if (isProjectedOccurrenceOn(it, iso)) return [{ it, virtual: true }];
        return [];
      })
      .sort((a, b) =>
        (a.it.done?1:0) - (b.it.done?1:0) ||
        (a.virtual?1:0) - (b.virtual?1:0) ||
        a.it.title.localeCompare(b.it.title));
    cells.push({ iso, day: d.getDate(), isOther, isToday, events });
  }

  const MAX_EVENTS = 3;
  grid.innerHTML = cells.map(c => {
    const eventsHtml = c.events.slice(0, MAX_EVENTS).map(ev => {
      const it = ev.it;
      const isVirtual = ev.virtual;
      const isDone = !isVirtual && it.done;
      const prefix = isVirtual ? "↻ " : (isDone ? "✓ " : "");
      const label = prefix + it.title;
      // Colore = categoria (ora un dato, applicato inline). "done"/"virtual" restano modifier CSS.
      const mod = moduleOf(it.module);
      const cls = `cal-event${isDone ? " done" : ""}${isVirtual ? " virtual" : ""}`;
      const nomi = dipNomi(it.responsabili);
      const tip = isVirtual
        ? `${it.title} — occorrenza proiettata (prossima attiva: ${fmtDate(it.date)})`
        : `${it.title}${nomi.length ? " — " + nomi.join(", ") : ""}`;
      return `<div class="${cls}" data-id="${it.id}" style="background:${mod.bg};color:${mod.fg};border-left-color:${mod.fg}" title="${escapeHtml(tip)}">${escapeHtml(label)}</div>`;
    }).join("");
    const more = c.events.length > MAX_EVENTS
      ? `<div class="cal-more">+${c.events.length - MAX_EVENTS} altri</div>` : "";
    return `
      <div class="cal-day ${c.isOther ? "other-month" : ""} ${c.isToday ? "today" : ""}" data-date="${c.iso}">
        <div class="cal-day-num">${c.day}</div>
        ${eventsHtml}${more}
      </div>`;
  }).join("");

  grid.querySelectorAll(".cal-event").forEach(el => {
    el.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const id = el.dataset.id;
      const it = state.items.find(i => i.id === id);
      if (it) openModal(it, "read");
    });
  });
  grid.querySelectorAll(".cal-day").forEach(el => {
    el.addEventListener("click", () => {
      openModalWithDate(el.dataset.date);
    });
  });
}

function openModalWithDate(iso) {
  openModal(null);
  setDateField(iso);
}

function setView(v) {
  state.view = v;
  document.getElementById("list-wrap").hidden = (v !== "list");
  document.getElementById("calendar-wrap").hidden = (v !== "calendar");
  document.getElementById("history-wrap").hidden = (v !== "history");
  document.querySelectorAll(".vt-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.view === v);
  });
  // (Fix #3) Anche su setView devo aggiornare KPI active state + visibilità "Pulisci filtri"
  // (altrimenti il KPI cliccato che cambia vista lascia topbar stantia)
  renderKpis();
  renderClearFiltersBtn();
  if (v === "calendar") renderCalendar();
  else if (v === "history") renderHistoryView();
  else renderList();
}

function calNav(delta) {
  state.calMonth += delta;
  if (state.calMonth < 0) { state.calMonth = 11; state.calYear--; }
  else if (state.calMonth > 11) { state.calMonth = 0; state.calYear++; }
  renderCalendar();
}
function calToday() {
  const t = new Date();
  state.calYear = t.getFullYear();
  state.calMonth = t.getMonth();
  renderCalendar();
}

// ---------- Storico globale (registro esecuzioni) ----------
function renderHistoryView() {
  // Raccolgo tutte le esecuzioni dei item nello scope (modulo + ricorrenti/una tantum)
  const scoped = state.items.filter(it => inModuleScope(it) && inRecurScope(it) && inResponsabileScope(it));

  const execs = [];
  scoped.forEach(it => {
    if (Array.isArray(it.history) && it.history.length > 0) {
      it.history.forEach(h => execs.push({ ...h, item: it }));
    } else if (it.done && it.doneAt) {
      // Item già marcato done ma senza history (item legacy o creato prima dello storico)
      execs.push({
        doneAt: it.doneAt,
        dueDate: it.date,
        doneBy: it.doneBy || "",
        note: "",
        item: it
      });
    }
  });

  // Filtra per periodo + ricerca
  const today = todayISO();
  const q = (state.query || "").toLowerCase().trim();
  const filtered = execs.filter(e => {
    if (state.histPeriod && state.histPeriod !== "all") {
      const days = daysBetweenIso(e.doneAt, today);
      if (state.histPeriod === "30" && (days < 0 || days > 30)) return false;
      if (state.histPeriod === "90" && (days < 0 || days > 90)) return false;
      if (state.histPeriod === "year" && !e.doneAt.startsWith(today.slice(0, 4))) return false;
    }
    if (q) {
      const hay = `${e.item.title} ${e.note || ""} ${e.doneBy || ""} ${e.item.description || ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  filtered.sort((a, b) => b.doneAt.localeCompare(a.doneAt));

  // Stats riassunto: anticipo conta come "puntuale" (= consegnata entro la scadenza)
  const total = filtered.length;
  const onTime = filtered.filter(e => daysBetweenIso(e.dueDate, e.doneAt) <= 0).length;
  const late = filtered.filter(e => daysBetweenIso(e.dueDate, e.doneAt) > 0).length;
  const statsEl = document.getElementById("hist-stats");
  statsEl.innerHTML = total === 0 ? "" :
    `<strong>${total}</strong> esecuzioni · <span class="s-ontime">${onTime} puntuali</span> · <span class="s-late">${late} in ritardo</span>`;

  const list = document.getElementById("history-list-global");
  const emptyEl = document.getElementById("hist-empty");

  if (filtered.length === 0) {
    emptyEl.hidden = false;
    list.innerHTML = "";
    return;
  }
  emptyEl.hidden = true;

  list.innerHTML = filtered.map(e => {
    const it = e.item;
    const mod = moduleOf(it.module);
    const lateDays = daysBetweenIso(e.dueDate, e.doneAt);
    // Solo due categorie: puntuale (entro la scadenza, anche in anticipo) o in ritardo
    const lateLabel = lateDays > 0 ? `${lateDays} gg in ritardo` : "puntuale";
    const lateClass = lateDays > 0 ? "late" : "ontime";
    return `
      <div class="hist-global-row" data-item-id="${it.id}">
        <div class="hist-date-cell">${fmtDate(e.doneAt)}</div>
        <div class="hist-title-cell">
          <strong>${escapeHtml(it.title)}</strong>
          ${e.note ? `<span class="hist-note">${escapeHtml(e.note)}</span>` : ""}
        </div>
        <div><span class="chip" style="background:${mod.bg};color:${mod.fg}">${mod.icon} ${escapeHtml(mod.short || mod.label)}</span></div>
        <div class="hist-late ${lateClass}">${lateLabel}</div>
        <div class="hist-by-cell">${escapeHtml(e.doneBy || "—")}</div>
      </div>`;
  }).join("");

  list.querySelectorAll(".hist-global-row").forEach(row => {
    row.addEventListener("click", () => {
      const id = row.dataset.itemId;
      const it = state.items.find(i => i.id === id);
      if (it) openModal(it, "read", true); // fromStorico → mostra Riapri al posto di "Segna come fatta"
    });
  });
}

// ---------- Azioni riga ----------
async function handleAction(id, act) {
  const idx = state.items.findIndex(i => i.id === id);
  if (idx < 0) return;
  const it = state.items[idx];

  if (act === "done") {
    askMarkDone(it);
    return;
  } else if (act === "reopen") {
    const snapshot = JSON.parse(JSON.stringify(it));
    // Riapri = annulla l'ultima esecuzione registrata
    // - Per ricorrenti: ripristina la data alla scadenza dell'ultima esecuzione (rollback)
    // - Per una tantum: pulisce lo stato done
    // - In entrambi i casi: rimuove l'ultima entry dallo storico e ricalcola lastDoneAt/By dal penultimo
    const isRecur = !!(it.recurType && it.recurType !== "none");
    if (Array.isArray(it.history) && it.history.length > 0) {
      const last = it.history.pop();
      if (isRecur && last.dueDate) it.date = last.dueDate;
    }
    it.done = false;
    delete it.doneAt;
    delete it.doneBy;
    delete it.previousDate;
    if (Array.isArray(it.history) && it.history.length > 0) {
      const prev = it.history[it.history.length - 1];
      it.lastDoneAt = prev.doneAt;
      it.lastDoneBy = prev.doneBy;
    } else {
      delete it.lastDoneAt;
      delete it.lastDoneBy;
    }
    renderAll();
    try {
      await sbUpsert(it);
    } catch (err) {
      state.items[idx] = snapshot;
      renderAll();
      alert(`Riapertura fallita, modifica annullata: ${err.message}`);
    }
  } else if (act === "edit") {
    openModal(it);
  } else if (act === "del") {
    if (!confirm(`Eliminare "${it.title}"?`)) return;
    const snapshot = JSON.parse(JSON.stringify(it));
    const removedId = it.id;
    const removedIdx = idx;
    state.items.splice(idx, 1);
    renderAll();
    try {
      await sbDelete(removedId);
    } catch (err) {
      state.items.splice(removedIdx, 0, snapshot);
      renderAll();
      alert(`Eliminazione fallita, item ripristinato: ${err.message}`);
    }
  }
}

// ---------- Mini-modal "Segna come fatta" ----------
const LAST_OPERATOR_KEY = "scadenziario_last_operator";
let _pendingDoneId = null;

function askMarkDone(item) {
  _pendingDoneId = item.id;
  document.getElementById("done-target").textContent = item.title;
  document.getElementById("d-by").value = localStorage.getItem(LAST_OPERATOR_KEY) || "";
  document.getElementById("d-note").value = "";
  document.getElementById("done-modal").hidden = false;
  setTimeout(() => document.getElementById("d-by").focus(), 30);
}
function closeDoneModal() {
  document.getElementById("done-modal").hidden = true;
  _pendingDoneId = null;
}
function confirmDone(e) {
  if (e) e.preventDefault();
  const id = _pendingDoneId;
  if (!id) return;
  const by = document.getElementById("d-by").value.trim();
  const note = document.getElementById("d-note").value.trim();
  if (by) localStorage.setItem(LAST_OPERATOR_KEY, by);
  applyDone(id, by, note);
  closeDoneModal();
}

async function applyDone(id, by, note) {
  const idx = state.items.findIndex(i => i.id === id);
  if (idx < 0) return;
  const it = state.items[idx];
  const snapshot = JSON.parse(JSON.stringify(it));
  const now = todayISO();

  // Aggiunge entry storico
  if (!Array.isArray(it.history)) it.history = [];
  it.history.push({
    doneAt: now,
    dueDate: it.date,
    doneBy: by || "",
    note: note || ""
  });

  if (it.recurType && it.recurType !== "none") {
    // Ricorrente: avanza alla prossima occorrenza nel futuro
    let nextDate = advanceDate(it.date, it.recurType, it.recurN || 1);
    while (daysBetween(nextDate) < 0) {
      nextDate = advanceDate(nextDate, it.recurType, it.recurN || 1);
    }
    it.lastDoneAt = now;
    it.lastDoneBy = by || "";
    it.previousDate = it.date;
    it.date = nextDate;
  } else {
    it.done = true;
    it.doneAt = now;
    it.doneBy = by || "";
  }
  renderAll();
  try {
    await sbUpsert(it);
  } catch (err) {
    state.items[idx] = snapshot;
    renderAll();
    alert(`Marcatura "fatta" fallita, modifica annullata: ${err.message}`);
  }
}

// ---------- Storico (sezione nel modal principale) ----------
function renderHistory(item) {
  const section = document.getElementById("history-section");
  const list = document.getElementById("history-list");
  const count = document.getElementById("history-count");
  const arrow = document.querySelector(".history-arrow");
  const toggle = document.getElementById("history-toggle");
  if (!item || !Array.isArray(item.history) || item.history.length === 0) {
    section.hidden = true;
    return;
  }
  section.hidden = false;
  // Sempre collassato all'apertura
  list.hidden = true;
  arrow.classList.remove("expanded");
  toggle.setAttribute("aria-expanded", "false");
  count.textContent = item.history.length;
  const entries = item.history.slice().sort((a, b) => b.doneAt.localeCompare(a.doneAt));
  list.innerHTML = entries.map(h => {
    const late = daysBetweenIso(h.dueDate, h.doneAt);
    // Solo due categorie: puntuale (entro la scadenza) o in ritardo
    const lateLabel = late > 0 ? `${late} gg in ritardo` : "puntuale";
    const lateClass = late > 0 ? "late" : "ontime";
    const metaParts = [];
    if (h.doneBy) metaParts.push(`<span class="hist-by">${escapeHtml(h.doneBy)}</span>`);
    if (h.note) metaParts.push(`<span class="hist-note">${escapeHtml(h.note)}</span>`);
    return `
      <div class="hist-row">
        <div class="hist-date">${fmtDate(h.doneAt)}</div>
        <div class="hist-late ${lateClass}">${lateLabel}</div>
        <div class="hist-meta">${metaParts.join(" · ") || "—"}</div>
      </div>`;
  }).join("");
}

// ---------- Modal ----------
function populateModuleSelect() {
  const moduleSel = document.getElementById("f-module");
  const mods = activeModules();
  if (!mods.length) return; // anagrafiche non ancora caricate
  moduleSel.innerHTML = mods
    .map(m => `<option value="${m.key}">${m.icon} ${m.label}</option>`)
    .join("");
}

function populateResponsabiliCheckboxes(selected = []) {
  const wrap = document.getElementById("f-responsabili");
  if (!wrap) return;
  const dipendenti = activeDipendenti();
  const sel = new Set(Array.isArray(selected) ? selected : []);
  wrap.innerHTML = dipendenti.map(d => `
    <label>
      <input type="checkbox" name="responsabili" value="${d.id}" ${sel.has(d.id) ? "checked" : ""}>
      <span>${escapeHtml(d.nome)}</span>
    </label>`).join("");
}

function readResponsabiliFromForm() {
  return Array.from(document.querySelectorAll('#f-responsabili input[type="checkbox"]:checked'))
    .map(c => Number(c.value)); // gli ID sono numerici
}

let _modalMode = "edit"; // "read" | "edit"
let _modalFromStorico = false; // true se la scheda è stata aperta cliccando una riga nello Storico

function openModal(item, mode, fromStorico = false) {
  // Default: item esistente → read, nuovo → edit
  _modalMode = mode || (item ? "read" : "edit");
  _modalFromStorico = !!fromStorico;

  const isNew = !item;
  document.getElementById("modal-title").textContent =
    isNew ? "Nuova scadenza" :
    (_modalMode === "read" ? "Scheda scadenza" : "Modifica scadenza");
  populateModuleSelect();

  document.getElementById("f-id").value = item?.id || "";
  document.getElementById("f-title").value = item?.title || "";
  document.getElementById("f-description").value = item?.description || "";
  const firstModuleId = activeModules()[0] && activeModules()[0].key;
  document.getElementById("f-module").value = String(item?.module ?? firstModuleId ?? "");
  setDateField(item?.date || todayISO());
  populateResponsabiliCheckboxes(item?.responsabili || []);
  document.getElementById("f-recur-type").value = item?.recurType || "none";
  document.getElementById("f-recur-n").value = item?.recurN || 1;
  updateRecurVisibility();

  renderHistory(item);
  applyModalMode(item);

  document.getElementById("modal").hidden = false;
}

function applyModalMode(item) {
  const card = document.querySelector("#modal .modal-card");
  const isRead = _modalMode === "read";
  const isNew = !item;
  const isDone = !!(item && item.done);
  const hasHistory = !!(item && Array.isArray(item.history) && item.history.length > 0);
  const fromStorico = _modalFromStorico;

  card.classList.toggle("read-mode", isRead);

  // (NUOVO) Disabilita tutti i campi del form in read-mode: blocca anche tastiera/Tab,
  // non solo il click come il pointer-events del CSS. In edit-mode tutto editabile.
  // (Fix #14) Escludo #f-date dal selector generico: flatpickr lo nasconde e gestiamo
  // l'altInput visibile separatamente sotto. Evita double-disable e possibili sync issue.
  card.querySelectorAll(
    ".modal-body input:not([type='hidden']):not(#f-date), .modal-body select, .modal-body textarea"
  ).forEach(el => { el.disabled = isRead; });
  // Flatpickr altInput è il campo visibile dell'utente: lo disabilito esplicitamente
  if (typeof _fpDate !== "undefined" && _fpDate && _fpDate.altInput) {
    _fpDate.altInput.disabled = isRead;
  } else {
    // Fallback: senza flatpickr, #f-date è il picker nativo visibile → disabilita
    const dateEl = document.getElementById("f-date");
    if (dateEl) dateEl.disabled = isRead;
  }

  // Bottoni footer
  // Read mode: scheda di sola lettura → bottoni azione + Chiudi
  // Edit mode: form editabile → Annulla + Salva
  // Da Storico: forza Riapri al posto di "Segna come fatta" (= annulla ultima esecuzione)
  if (fromStorico) {
    document.getElementById("modal-done").hidden   = true;
    document.getElementById("modal-reopen").hidden = !isRead || isNew || !(isDone || hasHistory);
  } else {
    document.getElementById("modal-done").hidden   = !isRead || isNew || isDone;
    document.getElementById("modal-reopen").hidden = !isRead || isNew || !isDone;
  }
  // Dallo Storico la scheda è di sola consultazione: niente Modifica/Elimina.
  // (Resta solo "Riapri" per annullare un'esecuzione registrata per errore.)
  document.getElementById("modal-edit").hidden     = !isRead || isNew || fromStorico;
  document.getElementById("modal-delete").hidden   = !isRead || isNew || fromStorico;
  document.getElementById("modal-close-read").hidden = !isRead;
  document.getElementById("modal-cancel").hidden   = isRead;
  document.getElementById("modal-save").hidden     = isRead;
}

function switchToEditMode() {
  _modalMode = "edit";
  document.getElementById("modal-title").textContent = "Modifica scadenza";
  const id = document.getElementById("f-id").value;
  const item = state.items.find(i => i.id === id);
  applyModalMode(item);
}

function closeModal() {
  document.getElementById("modal").hidden = true;
  _modalFromStorico = false;
}
function updateRecurVisibility() {
  const type = document.getElementById("f-recur-type").value;
  document.getElementById("f-recur-n-wrap").hidden = (type === "none");
}

async function saveFromForm(e) {
  e.preventDefault();
  const id = document.getElementById("f-id").value;
  const data = {
    title: document.getElementById("f-title").value.trim(),
    description: document.getElementById("f-description").value.trim(),
    module: Number(document.getElementById("f-module").value), // ID categoria (numerico)
    date: document.getElementById("f-date").value,
    responsabili: readResponsabiliFromForm(),
    recurType: document.getElementById("f-recur-type").value,
    recurN: parseInt(document.getElementById("f-recur-n").value, 10) || 1
  };
  if (data.recurType === "none") data.recurN = null;

  let saved, snapshot, idx;
  if (id) {
    idx = state.items.findIndex(i => i.id === id);
    if (idx < 0) {
      alert("Scadenza non trovata (forse eliminata da un altro utente). Riapri la lista.");
      closeModal();
      return;
    }
    snapshot = JSON.parse(JSON.stringify(state.items[idx]));
    state.items[idx] = { ...state.items[idx], ...data };
    saved = state.items[idx];
  } else {
    saved = { id: uid(), done: false, ...data };
    state.items.push(saved);
  }
  renderAll();
  closeModal();
  try {
    await sbUpsert(saved);
  } catch (err) {
    // Rollback
    if (id) {
      state.items[idx] = snapshot;
    } else {
      state.items = state.items.filter(i => i.id !== saved.id);
    }
    renderAll();
    alert(`Salvataggio fallito, modifica annullata: ${err.message}`);
  }
}

// ---------- Export / Import / Reset ----------
function statoLabel(it) {
  if (it.done) return "Completata";
  const u = urgency(daysBetween(it.date), false);
  return ({ overdue: "Scaduta", week: "Entro 7 giorni", month: "Entro 30 giorni", future: "Futura" })[u];
}

function exportXlsx() {
  if (typeof XLSX === "undefined") {
    alert("Libreria Excel non caricata.\nVerifica la connessione internet e ricarica la pagina (Ctrl+F5).");
    return;
  }
  const ordered = state.items.slice().sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    return a.date.localeCompare(b.date);
  });
  const rows = ordered.map(it => ({
    "Stato": statoLabel(it),
    "Modulo": moduleOf(it.module).label,
    "Titolo": it.title,
    "Descrizione": it.description || "",
    "Data scadenza": it.date,
    "Giorni alla scadenza": it.done ? "" : daysBetween(it.date),
    "Responsabili": dipNomi(it.responsabili).join(", "),
    "Ricorrenza": recurLabel(it),
    "Ultima esecuzione": it.lastDoneAt || it.doneAt || "",
    "Eseguito da (ultima)": it.lastDoneBy || it.doneBy || "",
    "N. esecuzioni storiche": Array.isArray(it.history) ? it.history.length : 0
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = [
    { wch: 16 }, // stato
    { wch: 18 }, // modulo
    { wch: 42 }, // titolo
    { wch: 55 }, // descrizione
    { wch: 14 }, // data
    { wch: 10 }, // giorni
    { wch: 28 }, // responsabili
    { wch: 18 }, // ricorrenza
    { wch: 16 }, // ultima esecuzione
    { wch: 20 }, // eseguito da
    { wch: 10 }  // n. esecuzioni
  ];
  // Freeze prima riga (intestazioni)
  ws["!freeze"] = { xSplit: 0, ySplit: 1 };
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Scadenze");

  // Sheet aggiuntivo: riepilogo per modulo
  const summary = window.MODULES.map(m => {
    const items = state.items.filter(i => i.module === m.key && !i.done);
    return {
      "Modulo": m.label,
      "Attive": items.length,
      "Scadute": items.filter(i => daysBetween(i.date) < 0).length,
      "Entro 7 gg": items.filter(i => { const d = daysBetween(i.date); return d >= 0 && d <= 7; }).length,
      "Entro 30 gg": items.filter(i => { const d = daysBetween(i.date); return d > 7 && d <= 30; }).length,
      "Future": items.filter(i => daysBetween(i.date) > 30).length
    };
  });
  const ws2 = XLSX.utils.json_to_sheet(summary);
  ws2["!cols"] = [{ wch: 22 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, ws2, "Riepilogo");

  // Foglio Storico — tutte le esecuzioni di tutti gli item
  const historyRows = [];
  state.items.forEach(it => {
    if (!Array.isArray(it.history)) return;
    it.history.forEach(h => {
      const late = daysBetweenIso(h.dueDate, h.doneAt);
      historyRows.push({
        "Data esecuzione": h.doneAt,
        "Modulo": moduleOf(it.module).label,
        "Titolo": it.title,
        "Data scadenza originale": h.dueDate,
        "Ritardo (giorni)": late,
        "Esito": late > 0 ? "In ritardo" : "Puntuale",
        "Eseguito da": h.doneBy || "",
        "Nota": h.note || ""
      });
    });
  });
  if (historyRows.length) {
    historyRows.sort((a, b) => b["Data esecuzione"].localeCompare(a["Data esecuzione"]));
    const ws3 = XLSX.utils.json_to_sheet(historyRows);
    ws3["!cols"] = [
      { wch: 16 }, { wch: 18 }, { wch: 42 }, { wch: 20 },
      { wch: 14 }, { wch: 14 }, { wch: 20 }, { wch: 40 }
    ];
    ws3["!freeze"] = { xSplit: 0, ySplit: 1 };
    XLSX.utils.book_append_sheet(wb, ws3, "Storico");
  }

  XLSX.writeFile(wb, `scadenziario-${todayISO()}.xlsx`);
}
function importJson(file) {
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const data = JSON.parse(reader.result);
      if (!Array.isArray(data)) throw new Error("Formato non valido (atteso array di scadenze)");
      // Rigenera gli ID per evitare collisioni con item esistenti
      data.forEach(it => {
        if (!it.id || state.items.some(x => x.id === it.id)) it.id = uid();
        if (it.done === undefined) it.done = false;
      });
      const append = confirm(
        `Trovate ${data.length} scadenze.\n\n` +
        `OK = aggiungi alle esistenti\nAnnulla = sostituisci tutto`
      );
      if (append) {
        state.items.push(...data);
        await sbUpsertMany(data);
      } else {
        await sbDeleteAll();
        state.items = data;
        await sbUpsertMany(data);
      }
      renderAll();
      alert(`Importate ${data.length} scadenze.`);
    } catch (e) {
      alert("File non valido: " + e.message);
    }
  };
  reader.readAsText(file);
}

// --- Helpers di parsing per import Excel ---
function parseImportedDate(v) {
  if (v == null || v === "") return null;
  if (v instanceof Date && !isNaN(v)) return localISO(v);
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const d = new Date(s);
  if (!isNaN(d)) return localISO(d);
  return null;
}
// Ricorrenza da due colonne: unità (Giorni/Mesi/Anni) + numero N.
// Compatibile col vecchio formato in un'unica cella ("ogni 3 mesi").
function parseImportedRecur(unitRaw, nRaw) {
  const raw = String(unitRaw == null ? "" : unitRaw).trim();
  if (!raw) return { recurType: "none", recurN: null };
  const low = raw.toLowerCase();
  if (low === "nessuna" || low === "no" || low === "una tantum") return { recurType: "none", recurN: null };
  // vecchio formato unica cella: "ogni 3 mesi"
  const m = low.match(/ogni\s+(\d+)\s+(giorn|mes|ann)/);
  if (m) {
    const t = m[2].startsWith("giorn") ? "day" : m[2].startsWith("mes") ? "month" : "year";
    return { recurType: t, recurN: parseInt(m[1], 10) || 1 };
  }
  // nuovo formato: parola unità + numero in colonna separata
  let type = null;
  if (low.startsWith("giorn")) type = "day";
  else if (low.startsWith("mes")) type = "month";
  else if (low.startsWith("ann")) type = "year";
  if (!type) return { recurType: "none", recurN: null, error: true };
  const n = parseInt(nRaw, 10);
  return { recurType: type, recurN: n > 0 ? n : 1 };
}
// Risolve un'etichetta categoria (testo dell'Excel) → ID categoria
function moduleIdByLabel(label) {
  if (!label) return null;
  const norm = String(label).toLowerCase().trim();
  const exact = (window.MODULES || []).find(m => m.label.toLowerCase() === norm);
  if (exact) return exact.key;
  const partial = (window.MODULES || []).find(m => norm.includes(m.label.toLowerCase()));
  return partial ? partial.key : null;
}
// Risolve un nome dipendente (testo dell'Excel) → ID dipendente (solo attivi)
function dipendenteIdByNome(nome) {
  const norm = String(nome).toLowerCase().trim();
  const d = activeDipendenti().find(x => x.nome.toLowerCase() === norm);
  return d ? d.id : null;
}
function pick(row, ...keys) {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== "") return row[k];
  }
  return "";
}

function importXlsx(file) {
  if (typeof XLSX === "undefined") {
    alert("Libreria Excel non caricata. Verifica connessione e ricarica (Ctrl+F5).");
    return;
  }
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, { type: "array", cellDates: true });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

      const items = [];
      const errors = [];
      rows.forEach((r, i) => {
        const title = String(pick(r, "Titolo", "titolo", "Title", "Scadenza")).trim();
        if (!title) return;
        const dateRaw = pick(r, "Data scadenza", "Data", "data", "Date");
        const date = parseImportedDate(dateRaw);
        if (!date) { errors.push(`Riga ${i + 2}: data non valida (${dateRaw})`); return; }
        const modKey = moduleIdByLabel(pick(r, "Modulo", "modulo", "Module"));
        if (!modKey) { errors.push(`Riga ${i + 2}: categoria mancante o non riconosciuta`); return; }
        const recRaw = pick(r, "Ricorrenza", "ricorrenza");
        const rec = parseImportedRecur(recRaw, pick(r, "Ogni (numero)", "Ogni", "ogni", "Ogni N"));
        if (rec.error) { errors.push(`Riga ${i + 2}: ricorrenza "${recRaw}" non valida (usa Giorni, Mesi o Anni, oppure lascia vuoto)`); return; }
        const { recurType, recurN } = rec;
        const stato = String(pick(r, "Stato", "stato")).toLowerCase().trim();
        const done = stato === "completata" || stato === "fatta" || stato === "done";
        // "Note" è accettato come fallback per importare vecchi file
        const description = String(
          pick(r, "Descrizione", "descrizione", "Description") ||
          pick(r, "Note", "note", "Notes") || ""
        ).trim();
        const item = {
          id: uid(),
          title,
          description,
          module: modKey,
          date,
          responsabili: String(pick(r, "Responsabili", "responsabili", "Responsabile", "responsabile") || "")
            .split(",")
            .map(s => dipendenteIdByNome(s))
            .filter(id => id != null),
          recurType, recurN,
          done
        };
        const last = parseImportedDate(pick(r, "Ultima esecuzione", "ultima esecuzione"));
        if (last) item.lastDoneAt = last;
        if (done) item.doneAt = last || todayISO();
        items.push(item);
      });

      // TUTTO-O-NIENTE: se c'è anche un solo errore, non importo nulla.
      // Così l'utente corregge e reimporta l'intero file senza rischio di duplicati.
      if (errors.length) {
        alert(
          `Import annullato: ${errors.length} righe contengono errori, quindi NON è stata importata nessuna scadenza.\n\n` +
          `Correggi queste righe e reimporta il file:\n\n` +
          errors.slice(0, 12).join("\n") +
          (errors.length > 12 ? `\n…e altre ${errors.length - 12}.` : "")
        );
        return;
      }
      if (!items.length) {
        alert("Nessuna scadenza trovata nel file.");
        return;
      }
      if (!confirm(
        `Importare ${items.length} scadenze?\n\nVerranno aggiunte a quelle esistenti.`
      )) return;
      state.items.push(...items);
      await sbUpsertMany(items);
      renderAll();
      alert(`Importate ${items.length} scadenze.`);
    } catch (err) {
      console.error(err);
      alert("Errore lettura file Excel: " + err.message);
    }
  };
  reader.readAsArrayBuffer(file);
}

function importFile(file) {
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (ext === "xlsx" || ext === "xls") return importXlsx(file);
  alert(`Estensione ".${ext}" non supportata.\nUsa un file Excel (.xlsx o .xls).`);
}

// ---------- Template Excel per import ----------
function downloadTemplate() {
  if (typeof XLSX === "undefined") {
    alert("Libreria Excel non caricata.\nVerifica la connessione e ricarica (Ctrl+F5).");
    return;
  }
  // Solo intestazioni: l'utente compila le righe sotto (nessun esempio precompilato).
  const headers = ["Titolo", "Descrizione", "Modulo", "Data scadenza", "Responsabili", "Ricorrenza", "Ogni (numero)"];
  const ws = XLSX.utils.aoa_to_sheet([headers]);
  ws["!cols"] = [
    { wch: 48 }, // titolo
    { wch: 70 }, // descrizione
    { wch: 20 }, // modulo
    { wch: 14 }, // data
    { wch: 28 }, // responsabili
    { wch: 14 }, // ricorrenza (Giorni/Mesi/Anni)
    { wch: 14 }  // ogni (numero)
  ];
  ws["!freeze"] = { xSplit: 0, ySplit: 1 };

  // Foglio "Istruzioni"
  // Solo le colonne che vanno scritte in un formato preciso (Titolo/Descrizione sono testo libero, ovvi).
  const help = [
    ["COLONNA", "OBBLIGATORIA", "FORMATO / VALORI AMMESSI"],
    ["Modulo", "SÌ",
      "una categoria esistente, tra: " + (window.MODULES || []).map(m => m.label).join(" | ") + ". Se anche una sola riga ha la categoria sbagliata o mancante, l'import si blocca e ti segnala le righe da correggere (non viene importato nulla)."],
    ["Data scadenza", "SÌ", "formati ammessi: 2026-09-30 (ISO), 30/09/2026, 30-09-2026, oppure data nativa Excel"],
    ["Responsabili", "no",
      "uno o più dipendenti separati da virgola. Valori ammessi (lista corrente): " + activeDipendenti().map(d => d.nome).join(", ") + ". Es. 'Marco' oppure 'Marco, Valentina'. Nomi sconosciuti vengono ignorati."],
    ["Ricorrenza", "no",
      "vuoto = una tantum; oppure scrivi: Giorni | Mesi | Anni"],
    ["Ogni (numero)", "no",
      "il numero N della ricorrenza: 1 = ogni mese/anno, 3 = ogni 3 mesi. Lascia vuoto se Ricorrenza è vuota"]
  ];
  const ws2 = XLSX.utils.aoa_to_sheet(help);
  ws2["!cols"] = [{ wch: 18 }, { wch: 14 }, { wch: 90 }];
  ws2["!freeze"] = { xSplit: 0, ySplit: 1 };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Scadenze");
  XLSX.utils.book_append_sheet(wb, ws2, "Istruzioni");
  XLSX.writeFile(wb, "template-scadenziario.xlsx");
}
// resetDemo rimosso: era footgun callable da console (cancellava il DB condiviso)

// ---------- Wiring ----------
// (NUOVO) Datepicker italiano gg/mm/aaaa per il campo "Data scadenza".
// Valore interno mantenuto sempre in ISO YYYY-MM-DD per compatibilità con il resto del codice.
let _fpDate = null;
if (typeof flatpickr === "function") {
  _fpDate = flatpickr("#f-date", {
    dateFormat: "Y-m-d",      // .value resta ISO (compatibile con saveFromForm e fmtDate)
    altInput: true,
    altFormat: "d/m/Y",       // visibile a schermo: 06/06/2026
    locale: (window.flatpickr && window.flatpickr.l10ns && window.flatpickr.l10ns.it) || "default",
    allowInput: true,         // permette anche di scrivere a mano la data
    disableMobile: true       // usa flatpickr anche su mobile (no native picker locale-dependent)
  });
} else {
  // (Fix #6) flatpickr non caricato (CDN giù, ad-blocker) → log esplicito per QA/debug.
  // L'app funziona ancora ma il campo data tornerà al picker nativo del browser.
  console.warn("flatpickr non disponibile: il campo data userà il picker nativo del browser (locale-dipendente)");
}
// Helper per impostare la data: usa l'API flatpickr se presente, fallback .value
function setDateField(iso) {
  if (_fpDate) _fpDate.setDate(iso || "", false);
  else document.getElementById("f-date").value = iso || "";
}

document.getElementById("btn-add").addEventListener("click", () => openModal(null));
document.getElementById("modal-close").addEventListener("click", closeModal);
document.getElementById("modal-cancel").addEventListener("click", closeModal);
// Chiusura cliccando sul backdrop, MA solo se la pressione del mouse è iniziata sul backdrop
// stesso. Altrimenti, selezionando testo (es. nella descrizione) e rilasciando fuori dalla
// textarea, il browser genererebbe un click con target=#modal che chiudeva la scheda.
let _modalMouseDownOnBackdrop = false;
document.getElementById("modal").addEventListener("mousedown", (e) => {
  _modalMouseDownOnBackdrop = (e.target.id === "modal");
});
document.getElementById("modal").addEventListener("click", (e) => {
  if (e.target.id === "modal" && _modalMouseDownOnBackdrop) closeModal();
  _modalMouseDownOnBackdrop = false;
});
document.getElementById("form").addEventListener("submit", saveFromForm);
document.getElementById("f-recur-type").addEventListener("change", updateRecurVisibility);

// Azioni dal modal (utili soprattutto dalla vista calendario)
document.getElementById("modal-done").addEventListener("click", () => {
  const id = document.getElementById("f-id").value;
  if (id) { closeModal(); handleAction(id, "done"); }
});
document.getElementById("modal-edit").addEventListener("click", switchToEditMode);
document.getElementById("modal-close-read").addEventListener("click", closeModal);

// Toggle storico esecuzioni (collassabile)
document.getElementById("history-toggle").addEventListener("click", () => {
  const list = document.getElementById("history-list");
  const arrow = document.querySelector(".history-arrow");
  const toggle = document.getElementById("history-toggle");
  const willOpen = list.hidden;
  list.hidden = !willOpen;
  arrow.classList.toggle("expanded", willOpen);
  toggle.setAttribute("aria-expanded", String(willOpen));
});

// Mini-modal "Segna come fatta"
document.getElementById("done-close").addEventListener("click", closeDoneModal);
document.getElementById("done-cancel").addEventListener("click", closeDoneModal);
document.getElementById("done-modal").addEventListener("click", (e) => {
  if (e.target.id === "done-modal") closeDoneModal();
});
document.getElementById("done-form").addEventListener("submit", confirmDone);
document.getElementById("modal-reopen").addEventListener("click", () => {
  const id = document.getElementById("f-id").value;
  if (id) { handleAction(id, "reopen"); closeModal(); }
});
document.getElementById("modal-delete").addEventListener("click", () => {
  const id = document.getElementById("f-id").value;
  if (id) { handleAction(id, "del"); closeModal(); }
});

document.getElementById("search").addEventListener("input", (e) => {
  state.query = e.target.value;
  renderClearFiltersBtn(); // ricalcola visibilità bottone "Pulisci filtri"
  if (state.view === "history") renderHistoryView();
  else renderList();
});
document.getElementById("hist-period").addEventListener("change", (e) => {
  state.histPeriod = e.target.value;
  renderClearFiltersBtn(); // (Fix #9) anche histPeriod conta come filtro attivo
  if (state.view === "history") renderHistoryView();
});
// KPI cliccabili — unico modo per filtrare per stato (i dropdown sono stati rimossi per semplicità)
// "Tutte le scadenze" → reset completo (modulo + status)
// Altri KPI → filtrano per status mantenendo il modulo corrente (toggle sullo stesso = reset status)
document.querySelectorAll(".kpi").forEach(k => {
  k.addEventListener("click", () => {
    const status = k.dataset.status;
    if (status === "all") {
      state.modules = [];
      state.status = "all";
      state.responsabili = [];
    } else {
      state.status = (state.status === status) ? "all" : status;
    }
    // Se ero in calendario o storico, passo alla lista per vedere il filtro applicato
    if (state.view !== "list") setView("list");
    else renderAll();
  });
});

// Bottone "Pulisci filtri" in topbar
document.getElementById("btn-clear-filters").addEventListener("click", clearAllFilters);

document.getElementById("btn-export").addEventListener("click", exportXlsx);
document.getElementById("btn-template").addEventListener("click", downloadTemplate);
document.getElementById("btn-import").addEventListener("click", () => document.getElementById("file-import").click());
document.getElementById("file-import").addEventListener("change", (e) => {
  if (e.target.files[0]) importFile(e.target.files[0]);
  e.target.value = "";
});

// ============================================================
//  PANNELLO CONFIGURAZIONE (anagrafiche: dipendenti + categorie)
// ============================================================
const CFG_PALETTE = [
  { bg: "#dcfce7", fg: "#166534" }, { bg: "#f3e8ff", fg: "#6b21a8" },
  { bg: "#ffedd5", fg: "#9a3412" }, { bg: "#fef3c7", fg: "#854d0e" },
  { bg: "#dbeafe", fg: "#1e40af" }, { bg: "#ccfbf1", fg: "#134e4a" },
  { bg: "#fce7f3", fg: "#9d174d" }, { bg: "#fee2e2", fg: "#b91c1c" },
  { bg: "#e5e7eb", fg: "#374151" }, { bg: "#e7ded2", fg: "#7c5a33" },
  { bg: "#e6efb8", fg: "#4d7c0f" }
];
const CFG_EMOJIS = ["📋","🗂️","📁","💼","📦","🤝","⚖️","🔧","⚡","💧","🔥","🛡️",
  "🏢","🚗","🩺","🧾","💳","📅","📞","✉️","🔑","🌱","♻️","📊","🔒","🧯","🏗️","🖥️"];

// --- CRUD Supabase anagrafiche ---
async function sbInsertDipendente(fields) {
  const { data, error } = await sb.from("dipendenti").insert(fields).select().single();
  if (error) { await handleAuthErrorIfAny(error); throw new Error(error.message); }
  return data;
}
async function sbUpdateDipendente(id, fields) {
  const { error } = await sb.from("dipendenti").update(fields).eq("id", id);
  if (error) { await handleAuthErrorIfAny(error); throw new Error(error.message); }
}
async function sbDeleteDipendente(id) {
  const { error } = await sb.from("dipendenti").delete().eq("id", id);
  if (error) { await handleAuthErrorIfAny(error); throw new Error(error.message); }
}
async function sbInsertCategoria(fields) {
  const { data, error } = await sb.from("categorie").insert(fields).select().single();
  if (error) { await handleAuthErrorIfAny(error); throw new Error(error.message); }
  return data;
}
async function sbUpdateCategoria(id, fields) {
  const { error } = await sb.from("categorie").update(fields).eq("id", id);
  if (error) { await handleAuthErrorIfAny(error); throw new Error(error.message); }
}
async function sbDeleteCategoria(id) {
  const { error } = await sb.from("categorie").delete().eq("id", id);
  if (error) { await handleAuthErrorIfAny(error); throw new Error(error.message); }
}

// --- Ricariche ---
async function reloadConfig() {
  const [c, d] = await Promise.all([sbLoadCategorie(), sbLoadDipendenti()]);
  applyConfig(c, d);
  renderAll();
  renderConfig();
}
async function reloadAllData() { // anche le scadenze (dopo riassegnazioni)
  const [c, d] = await Promise.all([sbLoadCategorie(), sbLoadDipendenti()]);
  applyConfig(c, d);
  state.items = await sbLoadAll();
  renderAll();
  renderConfig();
}

// --- Conteggi d'uso ---
function dipUsage(id) {
  return state.items.filter(it => Array.isArray(it.responsabili) && it.responsabili.includes(id)).length;
}
function catUsage(id) {
  return state.items.filter(it => it.module === id).length;
}

// --- Modifiche di massa alle scadenze (per eliminazioni) ---
async function reassignModule(oldId, newId) {
  const changed = [];
  state.items.forEach(it => { if (it.module === oldId) { it.module = newId; changed.push(it); } });
  if (changed.length) await sbUpsertMany(changed);
}
async function replaceResponsabile(oldId, newId) {
  const changed = [];
  state.items.forEach(it => {
    if (Array.isArray(it.responsabili) && it.responsabili.includes(oldId)) {
      it.responsabili = [...new Set(it.responsabili.map(r => r === oldId ? newId : r))];
      changed.push(it);
    }
  });
  if (changed.length) await sbUpsertMany(changed);
}
async function removeResponsabile(id) {
  const changed = [];
  state.items.forEach(it => {
    if (Array.isArray(it.responsabili) && it.responsabili.includes(id)) {
      it.responsabili = it.responsabili.filter(r => r !== id);
      changed.push(it);
    }
  });
  if (changed.length) await sbUpsertMany(changed);
}

// --- Apertura / render ---
let _cfgTab = "dip";
function openConfig() {
  document.getElementById("config-modal").hidden = false;
  renderConfig();
}
function closeConfig() {
  document.getElementById("config-modal").hidden = true;
  closeCfgPops();
  closeCfgDialog();
}
function renderConfig() {
  if (document.getElementById("config-modal").hidden) return;
  renderCfgDip();
  renderCfgCat();
}
function renderCfgDip() {
  const wrap = document.getElementById("cfg-dip-rows");
  if (!wrap) return;
  const list = window.DIPENDENTI || [];
  wrap.innerHTML = list.map((d, i) => {
    const hue = Math.round(i * (360 / Math.max(list.length, 1)) + 15) % 360;
    const u = dipUsage(d.id);
    return `
      <div class="cfg-row dip">
        <span class="cfg-av" style="background:hsl(${hue} 45% 52%)">${escapeHtml(personInitials(d.nome))}</span>
        <div>
          <input class="cfg-cell" data-dip-name="${d.id}" value="${escapeHtml(d.nome)}" placeholder="Nome…">
          ${u ? `<span class="cfg-count">· ${u} scad.</span>` : ""}
        </div>
        <button class="cfg-del" data-dip-del="${d.id}" title="Elimina">🗑️</button>
      </div>`;
  }).join("");
}
function renderCfgCat() {
  const wrap = document.getElementById("cfg-cat-rows");
  if (!wrap) return;
  wrap.innerHTML = (window.MODULES || []).map(m => {
    const u = catUsage(m.key);
    return `
      <div class="cfg-row cat">
        <span style="display:flex;align-items:center;gap:6px;min-width:0">
          <label class="cfg-cat-edit" style="background:${m.bg};color:${m.fg}">
            <span>${m.icon}</span>
            <input data-cat-name="${m.key}" value="${escapeHtml(m.label)}" placeholder="nome categoria…">
          </label>${u ? `<span class="cfg-count">· ${u} scad.</span>` : ""}
        </span>
        <button class="cfg-icon-btn" data-cat-icon="${m.key}">${m.icon}</button>
        <button class="cfg-color-btn" data-cat-color="${m.key}"><span class="sw" style="background:${m.bg}"></span></button>
        <button class="cfg-del" data-cat-del="${m.key}" title="Elimina">🗑️</button>
      </div>`;
  }).join("");
}

// --- Popover icone / colori ---
let _cfgPickCat = null;
function placeCfgPop(pop, btn) {
  const r = btn.getBoundingClientRect();
  pop.style.left = Math.max(8, window.scrollX + r.left - 90) + "px";
  pop.style.top = (window.scrollY + r.bottom + 6) + "px";
  pop.hidden = false;
}
function closeCfgPops() {
  document.getElementById("cfg-emoji-pop").hidden = true;
  document.getElementById("cfg-color-pop").hidden = true;
  _cfgPickCat = null;
}
function openEmojiPicker(catId, btn) {
  closeCfgPops();
  _cfgPickCat = catId;
  document.getElementById("cfg-emoji-grid").innerHTML =
    CFG_EMOJIS.map(e => `<button data-e="${e}">${e}</button>`).join("");
  placeCfgPop(document.getElementById("cfg-emoji-pop"), btn);
}
function openColorPicker(catId, btn) {
  closeCfgPops();
  _cfgPickCat = catId;
  const usedByOthers = new Set((window.MODULES || []).filter(m => m.key !== catId).map(m => m.bg));
  const cur = moduleOf(catId).bg;
  document.getElementById("cfg-color-grid").innerHTML = CFG_PALETTE.map(p =>
    `<span class="cg ${p.bg === cur ? "on" : ""} ${usedByOthers.has(p.bg) ? "used" : ""}" data-bg="${p.bg}" data-fg="${p.fg}" style="background:${p.bg}" title="${usedByOthers.has(p.bg) ? "già usato" : ""}"></span>`
  ).join("");
  placeCfgPop(document.getElementById("cfg-color-pop"), btn);
}

// --- Dialog conferma/riassegnazione ---
function openCfgDialog(html) {
  document.getElementById("cfg-dialog-body").innerHTML = html;
  document.getElementById("cfg-dialog-modal").hidden = false;
}
function closeCfgDialog() {
  document.getElementById("cfg-dialog-modal").hidden = true;
}
function openDeleteCat(id) {
  const m = moduleOf(id);
  const u = catUsage(id);
  const others = (window.MODULES || []).filter(x => x.key !== id && x.attivo);
  if (u > 0) {
    if (!others.length) {
      openCfgDialog(`<h3>Impossibile eliminare</h3>
        <p>"${escapeHtml(m.label)}" ha ${u} scadenze, ma non c'è un'altra categoria attiva dove spostarle. Creane/attivane un'altra prima.</p>
        <div class="cfg-dialog-acts"><button class="ghost-btn" data-cfgact="cancel">Chiudi</button></div>`);
      return;
    }
    openCfgDialog(`<h3>Eliminare "${escapeHtml(m.label)}"?</h3>
      <p><strong>${u} scadenze</strong> usano questa categoria. Spostale in un'altra, poi la elimino.</p>
      <select id="cfg-reassign-cat">${others.map(o => `<option value="${o.key}">${o.icon} ${escapeHtml(o.label)}</option>`).join("")}</select>
      <div class="cfg-dialog-acts">
        <button class="ghost-btn" data-cfgact="cancel">Annulla</button>
        <button class="primary-btn" data-cfgact="cat-reassign" data-id="${id}">Sposta ed elimina</button>
      </div>`);
  } else {
    openCfgDialog(`<h3>Eliminare "${escapeHtml(m.label)}"?</h3>
      <p>Nessuna scadenza la usa: si può eliminare senza conseguenze.</p>
      <div class="cfg-dialog-acts">
        <button class="ghost-btn" data-cfgact="cancel">Annulla</button>
        <button class="ghost-btn danger" data-cfgact="cat-delete" data-id="${id}">Elimina</button>
      </div>`);
  }
}
function openDeleteDip(id) {
  const d = dipendenteOf(id);
  const u = dipUsage(id);
  const others = (window.DIPENDENTI || []).filter(x => x.id !== id && x.attivo);
  if (u > 0) {
    const replaceMode = others.length
      ? `<label><input type="radio" name="cfgdipmode" value="replace" checked> Sostituiscilo con:
           <select id="cfg-reassign-dip" style="flex:1;margin:0">${others.map(o => `<option value="${o.id}">${escapeHtml(o.nome)}</option>`).join("")}</select></label>`
      : "";
    openCfgDialog(`<h3>Eliminare "${escapeHtml(d.nome)}"?</h3>
      <p><strong>${escapeHtml(d.nome)}</strong> è responsabile di <strong>${u} scadenze</strong>. Scegli cosa fare:</p>
      <div class="cfg-dialog-modes">
        ${replaceMode}
        <label><input type="radio" name="cfgdipmode" value="remove" ${others.length ? "" : "checked"}> Rimuovilo soltanto (le scadenze restano agli altri responsabili)</label>
      </div>
      <div class="cfg-dialog-acts">
        <button class="ghost-btn" data-cfgact="cancel">Annulla</button>
        <button class="primary-btn" data-cfgact="dip-confirm" data-id="${id}">Conferma ed elimina</button>
      </div>`);
  } else {
    openCfgDialog(`<h3>Eliminare "${escapeHtml(d.nome)}"?</h3>
      <p>Non è responsabile di nessuna scadenza: si può eliminare senza conseguenze.</p>
      <div class="cfg-dialog-acts">
        <button class="ghost-btn" data-cfgact="cancel">Annulla</button>
        <button class="ghost-btn danger" data-cfgact="dip-delete" data-id="${id}">Elimina</button>
      </div>`);
  }
}

// --- Wiring pannello ---
document.getElementById("btn-config").addEventListener("click", openConfig);
document.getElementById("config-close").addEventListener("click", closeConfig);
document.getElementById("config-modal").addEventListener("click", (e) => {
  if (e.target.id === "config-modal") closeConfig();
});
document.querySelectorAll(".config-tab").forEach(t => t.addEventListener("click", () => {
  _cfgTab = t.dataset.cfgtab;
  document.querySelectorAll(".config-tab").forEach(x => x.classList.toggle("active", x === t));
  document.getElementById("config-body-dip").hidden = _cfgTab !== "dip";
  document.getElementById("config-body-cat").hidden = _cfgTab !== "cat";
}));

// Dipendenti: rename (change), avatar live (input), toggle attivo, elimina
document.getElementById("config-body-dip").addEventListener("change", async (e) => {
  const nm = e.target.closest("input[data-dip-name]");
  if (nm) { try { await sbUpdateDipendente(Number(nm.dataset.dipName), { nome: nm.value.trim() }); await reloadConfig(); } catch (err) { alert("Errore: " + err.message); } return; }
});
document.getElementById("config-body-dip").addEventListener("input", (e) => {
  const nm = e.target.closest("input[data-dip-name]");
  if (nm) { const av = nm.closest(".cfg-row").querySelector(".cfg-av"); if (av) av.textContent = personInitials(nm.value); }
});
document.getElementById("config-body-dip").addEventListener("click", (e) => {
  const del = e.target.closest("[data-dip-del]");
  if (del) openDeleteDip(Number(del.dataset.dipDel));
});
document.getElementById("cfg-add-dip").addEventListener("click", async () => {
  try {
    await sbInsertDipendente({ nome: "Nuovo", ordine: (window.DIPENDENTI || []).length + 1 });
    await reloadConfig();
    const inputs = document.querySelectorAll("#cfg-dip-rows input[data-dip-name]");
    if (inputs.length) { const last = inputs[inputs.length - 1]; last.focus(); last.select(); }
  } catch (err) { alert("Errore: " + err.message); }
});

// Categorie: rename (change), toggle attivo, icona, colore, elimina
document.getElementById("config-body-cat").addEventListener("change", async (e) => {
  const nm = e.target.closest("input[data-cat-name]");
  if (nm) { try { await sbUpdateCategoria(Number(nm.dataset.catName), { label: nm.value.trim() }); await reloadConfig(); } catch (err) { alert("Errore: " + err.message); } return; }
});
document.getElementById("config-body-cat").addEventListener("click", (e) => {
  const ib = e.target.closest("[data-cat-icon]");
  if (ib) { openEmojiPicker(Number(ib.dataset.catIcon), ib); return; }
  const cb = e.target.closest("[data-cat-color]");
  if (cb) { openColorPicker(Number(cb.dataset.catColor), cb); return; }
  const del = e.target.closest("[data-cat-del]");
  if (del) { openDeleteCat(Number(del.dataset.catDel)); return; }
});
document.getElementById("cfg-add-cat").addEventListener("click", async () => {
  try {
    const used = new Set((window.MODULES || []).map(m => m.bg));
    const free = CFG_PALETTE.find(p => !used.has(p.bg)) || CFG_PALETTE[0];
    await sbInsertCategoria({ label: "", icon: "📋", colore_bg: free.bg, colore_testo: free.fg, ordine: (window.MODULES || []).length + 1 });
    await reloadConfig();
    const inputs = document.querySelectorAll("#cfg-cat-rows input[data-cat-name]");
    if (inputs.length) inputs[inputs.length - 1].focus();
  } catch (err) { alert("Errore: " + err.message); }
});

// Popover icone
document.getElementById("cfg-emoji-grid").addEventListener("click", async (e) => {
  const b = e.target.closest("button[data-e]");
  if (!b || _cfgPickCat == null) return;
  const id = _cfgPickCat; closeCfgPops();
  try { await sbUpdateCategoria(id, { icon: b.dataset.e }); await reloadConfig(); } catch (err) { alert("Errore: " + err.message); }
});
// Popover colori
document.getElementById("cfg-color-grid").addEventListener("click", async (e) => {
  const s = e.target.closest(".cg");
  if (!s || _cfgPickCat == null) return;
  const id = _cfgPickCat; closeCfgPops();
  try { await sbUpdateCategoria(id, { colore_bg: s.dataset.bg, colore_testo: s.dataset.fg }); await reloadConfig(); } catch (err) { alert("Errore: " + err.message); }
});
// Click fuori → chiudi popover
document.addEventListener("click", (e) => {
  if (!e.target.closest(".cfg-pop") && !e.target.closest("[data-cat-icon]") && !e.target.closest("[data-cat-color]")) closeCfgPops();
});

// Dialog: azioni
document.getElementById("cfg-dialog-modal").addEventListener("click", async (e) => {
  if (e.target.id === "cfg-dialog-modal") { closeCfgDialog(); return; }
  const b = e.target.closest("[data-cfgact]");
  if (!b) return;
  const act = b.dataset.cfgact;
  if (act === "cancel") { closeCfgDialog(); return; }
  const id = Number(b.dataset.id);
  try {
    if (act === "cat-delete") {
      await sbDeleteCategoria(id);
    } else if (act === "cat-reassign") {
      const to = Number(document.getElementById("cfg-reassign-cat").value);
      await reassignModule(id, to);   // prima sposto le scadenze (la FK lo richiede)
      await sbDeleteCategoria(id);
    } else if (act === "dip-delete") {
      await sbDeleteDipendente(id);
    } else if (act === "dip-confirm") {
      const mode = (document.querySelector('input[name="cfgdipmode"]:checked') || {}).value;
      if (mode === "replace") {
        await replaceResponsabile(id, Number(document.getElementById("cfg-reassign-dip").value));
      } else {
        await removeResponsabile(id);
      }
      await sbDeleteDipendente(id);
    }
    closeCfgDialog();
    await reloadAllData(); // ricarico anche le scadenze (sono cambiate)
  } catch (err) {
    alert("Errore: " + err.message);
    closeCfgDialog();
    try { await reloadAllData(); } catch (_) {}
  }
});

// Drawer (sidebar mobile)
document.getElementById("hamburger").addEventListener("click", () => toggleDrawer(true));
document.getElementById("drawer-backdrop").addEventListener("click", () => toggleDrawer(false));

// Dropdown multiselezione Responsabili
function closeResponsabiliPanel() {
  const ms = document.getElementById("responsabili-multiselect");
  const panel = document.getElementById("responsabili-panel");
  const toggle = document.getElementById("responsabili-toggle");
  if (!ms) return;
  ms.classList.remove("open");
  if (panel) panel.hidden = true;
  if (toggle) toggle.setAttribute("aria-expanded", "false");
}
function toggleResponsabiliPanel() {
  const ms = document.getElementById("responsabili-multiselect");
  const panel = document.getElementById("responsabili-panel");
  const toggle = document.getElementById("responsabili-toggle");
  if (!ms) return;
  const open = !ms.classList.contains("open");
  ms.classList.toggle("open", open);
  if (panel) panel.hidden = !open;
  if (toggle) toggle.setAttribute("aria-expanded", open ? "true" : "false");
}
document.getElementById("responsabili-toggle").addEventListener("click", toggleResponsabiliPanel);
// Seleziona/deseleziona un responsabile (multiselezione) cliccando la riga
document.getElementById("responsabili-panel").addEventListener("click", (e) => {
  const opt = e.target.closest(".resp-opt");
  if (!opt) return;
  const raw = opt.dataset.value;
  const value = raw === "__none__" ? raw : Number(raw); // gli ID sono numerici
  if (state.responsabili.includes(value)) {
    state.responsabili = state.responsabili.filter(v => v !== value);
  } else {
    state.responsabili = [...state.responsabili, value];
  }
  renderAll(); // ricostruisce righe + riepilogo + conteggi, lasciando il pannello aperto
});
// Click fuori dal dropdown → chiudi
document.addEventListener("click", (e) => {
  const ms = document.getElementById("responsabili-multiselect");
  if (ms && ms.classList.contains("open") && !ms.contains(e.target)) closeResponsabiliPanel();
});
// Chiudi drawer su resize verso desktop
window.addEventListener("resize", () => {
  if (window.innerWidth > 900) toggleDrawer(false);
});

// View toggle + calendario
document.querySelectorAll(".vt-btn").forEach(b => {
  b.addEventListener("click", () => setView(b.dataset.view));
});
document.getElementById("cal-prev").addEventListener("click", () => calNav(-1));
document.getElementById("cal-next").addEventListener("click", () => calNav(1));
document.getElementById("cal-today").addEventListener("click", calToday);
// btn-reset rimosso completamente (UI + funzione) per evitare cancellazioni accidentali del DB condiviso

// NB: capture=true → questo handler gira PRIMA di flatpickr. Così, quando l'utente preme
// Esc sul calendario data aperto, possiamo vederlo ancora aperto (isOpen) e NON chiudere
// il modal: lasciamo che sia flatpickr a chiudere solo il proprio calendario.
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  // Calendario data aperto → Esc chiude solo quello (lo fa flatpickr), non il modal.
  if (_fpDate && _fpDate.isOpen) return;
  // Pannello configurazione: prima i popover, poi il dialog, poi la modale.
  const emojiPop = document.getElementById("cfg-emoji-pop");
  const colorPop = document.getElementById("cfg-color-pop");
  if ((emojiPop && !emojiPop.hidden) || (colorPop && !colorPop.hidden)) { closeCfgPops(); return; }
  if (!document.getElementById("cfg-dialog-modal").hidden) { closeCfgDialog(); return; }
  if (!document.getElementById("config-modal").hidden) { closeConfig(); return; }
  // Dropdown multiselezione responsabili aperto → Esc chiude prima quello.
  const respMs = document.getElementById("responsabili-multiselect");
  if (respMs && respMs.classList.contains("open")) { closeResponsabiliPanel(); return; }
  if (!document.getElementById("done-modal").hidden) closeDoneModal();
  else if (!document.getElementById("modal").hidden) closeModal();
  else if (document.getElementById("sidebar").classList.contains("open")) toggleDrawer(false);
}, true);

// ---------- Avvio ----------
async function boot() {
  // NB: niente populateModuleSelect qui — le anagrafiche arrivano da Supabase con load().
  renderModules();      // sidebar (vuota finché non carica l'anagrafica)
  renderResponsabili();
  renderKpis();
  // Mostra spinner mentre Supabase carica
  document.getElementById("rows").innerHTML =
    '<div style="padding:60px 20px;text-align:center;color:var(--ink-soft);">⏳ Caricamento da Supabase…</div>';
  try {
    await load();
  } catch (e) {
    console.error("Errore boot:", e);
    // (Fix #6) Detection robusta via isAuthError invece di substring fuzzy.
    // sbLoadAll già chiama handleAuthErrorIfAny, ma ricontrollo come safety net.
    if (await handleAuthErrorIfAny(e)) return;
    document.getElementById("rows").innerHTML =
      `<div style="padding:60px 20px;text-align:center;color:var(--red);">⚠ Errore connessione a Supabase.<br><small>${(e && e.message) || e}</small></div>`;
    return;
  }
  renderAll();
  sbSubscribe();       // realtime scadenze
  sbSubscribeConfig(); // realtime anagrafiche (categorie/dipendenti)
}

// ---------- Wire login + auth state ----------
document.getElementById("login-form").addEventListener("submit", handleLoginSubmit);
document.getElementById("btn-logout").addEventListener("click", handleLogout);

// Reagisce a login / logout / refresh token / sessione iniziale
sb.auth.onAuthStateChange(async (event, session) => {
  if (event === "SIGNED_IN" || event === "INITIAL_SESSION") {
    if (session) startApp(session);
    else showLogin();
  } else if (event === "SIGNED_OUT") {
    // (Fix #13) Await per evitare race con sbSubscribe se SIGNED_IN arriva subito dopo
    await sbUnsubscribe();
    // (Fix #5) Chiudi modali aperti prima che diventino orfani
    closeAllModalsForLogout();
    // (Fix #11) Reset filtri/ricerca tra utenti diversi (view preservata, Fix #10)
    resetUiState();
    _booted = false;
    // (Fix #8) Reset del guard auth-error → il prossimo errore può ri-triggerare il flow
    _authErrorHandled = false;
    state.items = [];
    showLogin();
  } else if (event === "USER_UPDATED") {
    // Se l'admin cambia email dell'utente, aggiorno la label in sidebar
    const userEmailEl = document.getElementById("user-email");
    if (userEmailEl && session?.user?.email) userEmailEl.textContent = session.user.email;
  }
  // TOKEN_REFRESHED: il client usa automaticamente il nuovo JWT per le query REST.
  // Nota: per il realtime con RLS, in caso di problemi futuri valutare sb.realtime.setAuth(session.access_token).
});

// (Fix #12) Niente showLogin() unconditional qui: l'overlay parte hidden in HTML.
// INITIAL_SESSION fire poco dopo e decide se mostrarlo (no session) o tenerlo nascosto (session esiste).
