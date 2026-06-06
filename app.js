// ============================================================
// CONFIGURAZIONE SUPABASE — modifica qui se cambi DB
// ============================================================
const SUPABASE_URL = "https://cqdmfhdcdvaezmexzxrq.supabase.co";
const SUPABASE_KEY = "sb_publishable_1ECriACxKWx6_4GPxyMXVQ_MPVc2GYy";
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Mappatura JS object ↔ riga SQL (camelCase ↔ snake_case)
function toSupabase(item) {
  return {
    id: item.id,
    title: item.title || "",
    description: item.description || item.notes || "",
    module: item.module,
    date: item.date,
    ref: item.ref || null,
    recur_type: item.recurType || "none",
    recur_n: (item.recurType && item.recurType !== "none") ? (item.recurN || 1) : null,
    done: !!item.done,
    done_at: item.doneAt || null,
    done_by: item.doneBy || null,
    last_done_at: item.lastDoneAt || null,
    last_done_by: item.lastDoneBy || null,
    previous_date: item.previousDate || null,
    history: Array.isArray(item.history) ? item.history : []
  };
}
function fromSupabase(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description || "",
    module: row.module,
    date: row.date,
    ref: row.ref || "",
    recurType: row.recur_type || "none",
    recurN: row.recur_n || null,
    done: !!row.done,
    doneAt: row.done_at || null,
    doneBy: row.done_by || null,
    lastDoneAt: row.last_done_at || null,
    lastDoneBy: row.last_done_by || null,
    previousDate: row.previous_date || null,
    history: Array.isArray(row.history) ? row.history : []
  };
}

// CRUD Supabase
async function sbLoadAll() {
  const { data, error } = await sb.from("scadenze").select("*");
  if (error) { console.error("Errore load:", error); throw new Error(error.message || "sbLoadAll failed"); }
  return data.map(fromSupabase);
}
async function sbUpsert(item) {
  const { error } = await sb.from("scadenze").upsert(toSupabase(item));
  if (error) { console.error("Errore upsert:", error); throw new Error(error.message || "Upsert failed"); }
}
async function sbUpsertMany(items) {
  if (!items.length) return;
  const rows = items.map(toSupabase);
  const { error } = await sb.from("scadenze").upsert(rows);
  if (error) { console.error("Errore upsert bulk:", error); throw new Error(error.message || "UpsertMany failed"); }
}
async function sbDelete(id) {
  const { error } = await sb.from("scadenze").delete().eq("id", id);
  if (error) { console.error("Errore delete:", error); throw new Error(error.message || "Delete failed"); }
}
async function sbDeleteAll() {
  const { error } = await sb.from("scadenze").delete().neq("id", "__never_match__");
  if (error) console.error("Errore deleteAll:", error);
}

// Realtime: quando un altro utente modifica, aggiorno lo stato locale
let _sbChannel = null;
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

// ---------- Stato ----------
const STORAGE_KEY = "scadenziario_v1"; // tenuto come fallback solo per migrazione localStorage → cloud
const _now = new Date();
const state = {
  items: [],
  module: "all",
  status: "all",
  recurFilter: "all",     // "all" | "recurring" | "oneshot"
  responsabile: "all",    // "all" | "__none__" | <nome>
  query: "",
  view: "list",           // "list" | "calendar" | "history"
  calYear: _now.getFullYear(),
  calMonth: _now.getMonth(),
  histPeriod: "all"       // "all" | "year" | "90" | "30"
};

const MESI_IT = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno",
                 "Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];

// ---------- Boot ----------
async function load() {
  // 1) carica da Supabase
  const cloud = await sbLoadAll();
  if (cloud.length > 0) {
    state.items = cloud;
    // Anche su dati cloud esistenti applico la migrazione (chiavi modulo legacy, notes→description)
    if (migrateModuleKeys()) {
      await sbUpsertMany(state.items);
      console.log(`Migrazione cloud applicata + sincronizzata.`);
    }
    return;
  }
  // 2) cloud vuoto → bootstrap. Se ho localStorage legacy lo migro, altrimenti carico il demo
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      const local = JSON.parse(raw);
      if (Array.isArray(local) && local.length > 0) {
        state.items = local;
        migrateModuleKeys();
        await sbUpsertMany(state.items);
        console.log(`Migrazione: ${state.items.length} item da localStorage → Supabase.`);
        localStorage.removeItem(STORAGE_KEY);
        return;
      }
    } catch (e) { console.warn("Dati locali corrotti:", e); }
  }
  state.items = JSON.parse(JSON.stringify(window.DEMO_DATA));
  migrateModuleKeys();
  await sbUpsertMany(state.items);
  console.log(`Bootstrap demo: ${state.items.length} item caricati su Supabase.`);
}

// Migra le vecchie chiavi modulo (fiscali, manutenzioni, sicurezza, hr, veicoli, documenti, utenze)
// alle nuove (fisco, macchinari, hse, personale, ...)
function migrateModuleKeys() {
  const map = window.MODULE_MIGRATION || {};
  let changed = 0;
  state.items.forEach(it => {
    if (map[it.module]) {
      it.module = map[it.module];
      changed++;
    }
    // Migra "notes" → "description" se quest'ultima è vuota; poi rimuove notes
    if (it.notes) {
      if (!it.description) it.description = it.notes;
      delete it.notes;
      changed++;
    }
  });
  if (changed) console.log(`Migrazione dati: ${changed} modifiche applicate.`);
  return changed > 0;
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
function moduleOf(key) {
  return window.MODULES.find(m => m.key === key) || { key, label: key, icon: "•" };
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
  return state.module === "all" || it.module === state.module;
}
function inRecurScope(it) {
  if (state.recurFilter === "all") return true;
  return state.recurFilter === "recurring" ? isRecurring(it) : !isRecurring(it);
}
function inResponsabileScope(it) {
  if (state.responsabile === "all") return true;
  const r = (it.ref || "").trim();
  if (state.responsabile === "__none__") return !r;
  return r === state.responsabile;
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
    <button class="module-btn ${state.module === "all" ? "active" : ""}" data-module="all">
      <span class="mod-ico">📋</span><span>Tutte le scadenze</span>
      <span class="mod-count">${total}</span>
    </button>
    ${window.MODULES.map(m => {
      const count = state.items.filter(i => i.module === m.key && !i.done).length;
      return `
        <button class="module-btn ${state.module === m.key ? "active" : ""}" data-module="${m.key}">
          <span class="mod-ico">${m.icon}</span><span>${m.label}</span>
          <span class="mod-count">${count}</span>
        </button>`;
    }).join("")}
  `;
  nav.querySelectorAll(".module-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      state.module = btn.dataset.module;
      if (window.innerWidth <= 900) toggleDrawer(false);
      renderAll();
    });
  });
}

// ---------- Render sidebar Responsabili ----------
function renderResponsabili() {
  const nav = document.getElementById("responsabili");
  if (!nav) return;

  // Conta non-completati per ogni responsabile, rispettando il filtro modulo + tipo (per coerenza scope)
  const inOtherScope = it => inModuleScope(it) && inRecurScope(it) && inResponsabileScope(it);
  const counts = new Map();
  let unassigned = 0;
  state.items.forEach(it => {
    if (!inOtherScope(it)) return;
    if (it.done) return;
    const r = (it.ref || "").trim();
    if (!r) unassigned++;
    else counts.set(r, (counts.get(r) || 0) + 1);
  });
  const total = Array.from(counts.values()).reduce((a, b) => a + b, 0) + unassigned;
  const sorted = Array.from(counts.entries()).sort((a, b) => a[0].localeCompare(b[0]));

  nav.innerHTML = `
    <button class="resp-btn ${state.responsabile === "all" ? "active" : ""}" data-resp="all">
      <span>Tutti</span>
      <span class="resp-count">${total}</span>
    </button>
    ${sorted.map(([name, count]) => `
      <button class="resp-btn ${state.responsabile === name ? "active" : ""}" data-resp="${escapeHtml(name)}">
        <span>${escapeHtml(name)}</span>
        <span class="resp-count">${count}</span>
      </button>`).join("")}
    ${unassigned > 0 ? `
      <button class="resp-btn ${state.responsabile === "__none__" ? "active" : ""}" data-resp="__none__">
        <span class="resp-name-empty">— Non assegnato</span>
        <span class="resp-count">${unassigned}</span>
      </button>` : ""}
  `;

  nav.querySelectorAll(".resp-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      state.responsabile = btn.dataset.resp;
      if (window.innerWidth <= 900) toggleDrawer(false);
      renderAll();
    });
  });
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
    .filter(it => inModuleScope(it) && inRecurScope(it) && inResponsabileScope(it))
    .filter(it => {
      if (state.status === "all") return true;
      const u = urgency(daysBetween(it.date), it.done);
      return u === state.status;
    })
    .filter(it => {
      if (!q) return true;
      return (it.title || "").toLowerCase().includes(q)
        || (it.ref || "").toLowerCase().includes(q)
        || (it.description || "").toLowerCase().includes(q);
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
        <div><span class="chip ${it.module}">${mod.icon} ${mod.short || mod.label}</span></div>
        <div>${fmtDate(it.date)}</div>
        <div class="days-cell ${color}" title="${it.done ? 'completata' : days + ' giorni'}">${daysTxt}</div>
        <div class="ref-cell">${escapeHtml(it.ref || "—")}</div>
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

function renderAll() {
  renderModules();
  renderResponsabili();
  renderKpis();
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
      // Per le proiezioni, l'urgenza è relativa alla data proiettata; non sono "fatte"
      const days = daysBetween(c.iso);
      const u = urgency(days, isVirtual ? false : it.done);
      const color = urgencyColor(u);
      const prefix = isVirtual ? "↻ " : (it.done ? "✓ " : "");
      const label = prefix + it.title;
      const cls = `cal-event ${color}${isVirtual ? " virtual" : ""}`;
      const tip = isVirtual
        ? `${it.title} — occorrenza proiettata (prossima attiva: ${fmtDate(it.date)})`
        : `${it.title}${it.ref ? " — " + it.ref : ""}`;
      return `<div class="${cls}" data-id="${it.id}" title="${escapeHtml(tip)}">${escapeHtml(label)}</div>`;
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
  document.getElementById("f-date").value = iso;
}

function setView(v) {
  state.view = v;
  document.getElementById("list-wrap").hidden = (v !== "list");
  document.getElementById("calendar-wrap").hidden = (v !== "calendar");
  document.getElementById("history-wrap").hidden = (v !== "history");
  document.querySelectorAll(".vt-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.view === v);
  });
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
        <div><span class="chip ${it.module}">${mod.icon} ${mod.short || mod.label}</span></div>
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
  const mods = window.MODULES || [];
  if (!mods.length) {
    console.error("MODULES non definito — data.js non caricato?");
    return;
  }
  moduleSel.innerHTML = mods
    .map(m => `<option value="${m.key}">${m.icon} ${m.label}</option>`)
    .join("");
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
  document.getElementById("f-module").value = item?.module || window.MODULES[0].key;
  document.getElementById("f-date").value = item?.date || todayISO();
  document.getElementById("f-ref").value = item?.ref || "";
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
  document.getElementById("modal-edit").hidden     = !isRead || isNew;
  document.getElementById("modal-delete").hidden   = !isRead || isNew;
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
    module: document.getElementById("f-module").value,
    date: document.getElementById("f-date").value,
    ref: document.getElementById("f-ref").value.trim(),
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
    "Responsabile": it.ref || "",
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
    { wch: 32 }, // riferimento
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
function parseImportedRecur(s) {
  if (!s) return { recurType: "none", recurN: null };
  const m = String(s).match(/ogni\s+(\d+)\s+(giorn|mes|ann)/i);
  if (!m) return { recurType: "none", recurN: null };
  const n = parseInt(m[1], 10) || 1;
  const stem = m[2].toLowerCase();
  const type = stem === "giorn" ? "day" : stem === "mes" ? "month" : "year";
  return { recurType: type, recurN: n };
}
function moduleKeyByLabel(label) {
  if (!label) return null;
  const norm = String(label).toLowerCase().trim();
  const exact = window.MODULES.find(m => m.label.toLowerCase() === norm);
  if (exact) return exact.key;
  const partial = window.MODULES.find(m => norm.includes(m.key) || norm.includes(m.label.toLowerCase()));
  return partial ? partial.key : null;
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
        const modKey = moduleKeyByLabel(pick(r, "Modulo", "modulo", "Module"))
          || (window.MODULES[0] && window.MODULES[0].key) || "fisco";
        const { recurType, recurN } = parseImportedRecur(pick(r, "Ricorrenza", "ricorrenza"));
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
          ref: String(pick(r, "Responsabile", "responsabile", "Riferimento", "riferimento", "Ref") || "").trim(),
          recurType, recurN,
          done
        };
        const last = parseImportedDate(pick(r, "Ultima esecuzione", "ultima esecuzione"));
        if (last) item.lastDoneAt = last;
        if (done) item.doneAt = last || todayISO();
        items.push(item);
      });

      if (!items.length) {
        let msg = "Nessuna scadenza valida trovata nel file.";
        if (errors.length) msg += "\n\nErrori:\n" + errors.slice(0, 5).join("\n");
        alert(msg);
        return;
      }
      // Step 1: conferma intento di importare. ✕/Esc qui = annulla, NON sostituisce.
      if (!confirm(
        `Trovate ${items.length} scadenze${errors.length ? ` (${errors.length} righe scartate)` : ""}.\n\n` +
        `Vuoi importarle?`
      )) return;
      // Step 2: modalità import. Default = aggiungi (sicuro). Sostituisci richiede OK esplicito.
      const replaceAll = confirm(
        `🚨 ATTENZIONE — Premi OK SOLO se vuoi CANCELLARE tutti i dati esistenti e sostituirli con quelli del file.\n\n` +
        `Per aggiungere alle esistenti (operazione sicura), premi ANNULLA.`
      );
      if (replaceAll) {
        // Step 3: doppia conferma per operazione distruttiva
        if (!confirm("Ultima conferma: stai per CANCELLARE TUTTI i dati attuali (anche dei colleghi). Continuare?")) return;
        await sbDeleteAll();
        state.items = items;
        await sbUpsertMany(items);
      } else {
        state.items.push(...items);
        await sbUpsertMany(items);
      }
      renderAll();
      let done = `Importate ${items.length} scadenze.`;
      if (errors.length) done += `\n\n${errors.length} righe scartate:\n` + errors.slice(0, 5).join("\n");
      alert(done);
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
  // Tre esempi reali: le scadenze accise energia di cui hai chiesto + un esempio generico
  const example = [
    {
      "Titolo": "Accise energia - Rate di acconto mensili",
      "Descrizione": "Versamento mensile dell'acconto accise sull'energia elettrica autoconsumata. Periodo: mese solare precedente. Calcolo: (kWh totali × 28,41%) × 0,0125. Rif. Testo Unico Accise + Decreto MEF 10.03.2026.",
      "Modulo": "Fisco",
      "Data scadenza": "2026-06-30",
      "Responsabile": "Anna Rossi (Amministrazione)",
      "Ricorrenza": "ogni 1 mese",
      "Eseguito da": "",
      "Stato": ""
    },
    {
      "Titolo": "Accise energia - Dichiarazione 1° semestre",
      "Descrizione": "Dichiarazione semestrale dei consumi di energia elettrica (periodo gennaio-giugno) all'Agenzia delle Dogane. Invio telematico tramite Portale Dogane.",
      "Modulo": "Fisco",
      "Data scadenza": "2026-09-30",
      "Responsabile": "Anna Rossi (Amministrazione)",
      "Ricorrenza": "ogni 1 anno",
      "Eseguito da": "",
      "Stato": ""
    },
    {
      "Titolo": "Accise energia - Conguaglio 1° semestre",
      "Descrizione": "Pagamento (o credito) della differenza tra accise dovute sul semestre e acconti versati. Calcolo: (Σ kWh × 28,41% × 0,0125 €/kWh) − Σ acconti mensili versati.",
      "Modulo": "Fisco",
      "Data scadenza": "2026-09-30",
      "Responsabile": "Anna Rossi (Amministrazione)",
      "Ricorrenza": "ogni 1 anno",
      "Eseguito da": "",
      "Stato": ""
    },
    {
      "Titolo": "(esempio) Visita medica annuale operaio",
      "Descrizione": "Sorveglianza sanitaria obbligatoria art. 41 D.Lgs. 81/08 per lavoratori esposti a rischi specifici. Lavoratore: Sig. Marchetti.",
      "Modulo": "Personale",
      "Data scadenza": "15/12/2026",
      "Responsabile": "Marco Bianchi (HSE)",
      "Ricorrenza": "ogni 1 anno",
      "Eseguito da": "",
      "Stato": ""
    }
  ];
  const ws = XLSX.utils.json_to_sheet(example);
  ws["!cols"] = [
    { wch: 48 }, // titolo
    { wch: 70 }, // descrizione
    { wch: 20 }, // modulo
    { wch: 14 }, // data
    { wch: 38 }, // riferimento
    { wch: 16 }, // ricorrenza
    { wch: 18 }, // eseguito da
    { wch: 14 }  // stato
  ];
  ws["!freeze"] = { xSplit: 0, ySplit: 1 };

  // Foglio "Istruzioni"
  const help = [
    ["COLONNA", "OBBLIGATORIA", "FORMATO / VALORI AMMESSI"],
    ["Titolo", "SÌ", "testo libero breve (es. 'Versamento F24 mensile')"],
    ["Descrizione", "no", "testo libero (anche lungo, multi-riga): cosa è, come si calcola, riferimenti normativi, dettagli. Mostrata sotto al titolo nella lista come anteprima e per esteso nella scheda completa."],
    ["Modulo", "consigliato",
      "uno tra: Personale | Fisco | Manutenzione | Fornitori | Clienti | Utenze (match parziale supportato)"],
    ["Data scadenza", "SÌ", "formati ammessi: 2026-09-30 (ISO), 30/09/2026, 30-09-2026, oppure data nativa Excel"],
    ["Responsabile", "no", "nome del responsabile assegnato (es. 'Anna Rossi', 'M. Bianchi', 'Studio Collarini'). La sidebar 'Responsabili' filtra automaticamente per questo campo."],
    ["Ricorrenza", "no",
      "formula 'ogni N giorni|mesi|anni'. Esempi: 'ogni 1 mese', 'ogni 2 mesi', 'ogni 3 mesi', 'ogni 1 anno'. VUOTO = una tantum"],
    ["Eseguito da", "no", "testo (nome/iniziali). Si combina con 'Stato'=Completata per registrare lo storico"],
    ["Stato", "no", "lasciare vuoto per scadenze attive. Scrivere 'Completata' per marcarla già fatta"]
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
document.getElementById("btn-add").addEventListener("click", () => openModal(null));
document.getElementById("modal-close").addEventListener("click", closeModal);
document.getElementById("modal-cancel").addEventListener("click", closeModal);
document.getElementById("modal").addEventListener("click", (e) => {
  if (e.target.id === "modal") closeModal();
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
  if (state.view === "history") renderHistoryView();
  else renderList();
});
document.getElementById("hist-period").addEventListener("change", (e) => {
  state.histPeriod = e.target.value;
  if (state.view === "history") renderHistoryView();
});
// KPI cliccabili — unico modo per filtrare per stato (i dropdown sono stati rimossi per semplicità)
// "Tutte le scadenze" → reset completo (modulo + status)
// Altri KPI → filtrano per status mantenendo il modulo corrente (toggle sullo stesso = reset status)
document.querySelectorAll(".kpi").forEach(k => {
  k.addEventListener("click", () => {
    const status = k.dataset.status;
    if (status === "all") {
      state.module = "all";
      state.status = "all";
      state.responsabile = "all";
    } else {
      state.status = (state.status === status) ? "all" : status;
    }
    // Se ero in calendario o storico, passo alla lista per vedere il filtro applicato
    if (state.view !== "list") setView("list");
    else renderAll();
  });
});

document.getElementById("btn-export").addEventListener("click", exportXlsx);
document.getElementById("btn-template").addEventListener("click", downloadTemplate);
document.getElementById("btn-import").addEventListener("click", () => document.getElementById("file-import").click());
document.getElementById("file-import").addEventListener("change", (e) => {
  if (e.target.files[0]) importFile(e.target.files[0]);
  e.target.value = "";
});

// Drawer (sidebar mobile)
document.getElementById("hamburger").addEventListener("click", () => toggleDrawer(true));
document.getElementById("drawer-backdrop").addEventListener("click", () => toggleDrawer(false));
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

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (!document.getElementById("done-modal").hidden) closeDoneModal();
  else if (!document.getElementById("modal").hidden) closeModal();
  else if (document.getElementById("sidebar").classList.contains("open")) toggleDrawer(false);
});

// ---------- Avvio ----------
async function boot() {
  populateModuleSelect();
  renderModules();      // sidebar moduli con conteggi a 0
  renderResponsabili(); // sidebar responsabili (vuota all'inizio)
  renderKpis();         // KPI a 0
  // Mostra spinner mentre Supabase carica
  document.getElementById("rows").innerHTML =
    '<div style="padding:60px 20px;text-align:center;color:var(--ink-soft);">⏳ Caricamento da Supabase…</div>';
  try {
    await load();
  } catch (e) {
    console.error("Errore boot:", e);
    document.getElementById("rows").innerHTML =
      `<div style="padding:60px 20px;text-align:center;color:var(--red);">⚠ Errore connessione a Supabase.<br><small>${(e && e.message) || e}</small></div>`;
    return;
  }
  renderAll();
  sbSubscribe(); // attiva realtime: modifiche degli altri utenti compaiono in tempo reale
}
boot();
