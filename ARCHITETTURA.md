# 📐 Architettura dello Scadenziario

> Documento per ricordarsi (e spiegare a chi arriva nuovo) come è costruita questa applicazione.
> Aggiornare quando si introducono cambiamenti importanti.

---

## 🎯 Cosa fa l'app, in 30 secondi

Scadenziario è uno **strumento web** per tenere traccia delle scadenze aziendali ricorrenti (fiscali, manutenzioni, contratti, utenze…) di una PMI di ~15 persone.

- 6 colleghi BIP la usano per non dimenticarsi le date
- Ogni scadenza ha un **modulo** (Fisco, Personale, ecc.), **data**, **responsabili interni**, eventuale **ricorrenza**
- Quando una scadenza viene "fatta", finisce nello **storico**; se è ricorrente, ricompare automaticamente alla data successiva
- I cambiamenti sono **realtime**: se Marco aggiunge una scadenza, Elisa la vede subito senza ricaricare la pagina

URL produzione: <https://valebignami.github.io/Scadenziario/>
Login: `info@overland-ocm.it` + password (condivisa tra i 6 colleghi)

---

## 🧰 Tecnologie usate

| Strato | Tecnologia | Perché |
|---|---|---|
| **Frontend** | HTML + CSS + JavaScript "vanilla" (no React/Vue) | Semplice, zero build step, basso peso |
| **Database** | Supabase (Postgres) | Gratis, gestito, realtime built-in |
| **Auth** | Supabase Auth (email/password) | Sicuro, sessione persistente, gratis |
| **Realtime** | Supabase Realtime (WebSocket) | Sync automatico tra utenti |
| **Hosting** | GitHub Pages | Gratis, deploy con `git push` |
| **Datepicker** | Flatpickr v4 (CDN) | Forza formato italiano gg/mm/aaaa |
| **Excel I/O** | SheetJS / xlsx (CDN) | Import/export Excel |

**Nessun framework**. **Nessuno step di build**. **Nessun package manager**. Il browser scarica i file, li interpreta, e l'app funziona. Tutta la complessità sta nel codice JavaScript scritto a mano.

---

## 📁 Struttura dei file

```
Scadenziario/
├── .git/              ← Cronologia git (non toccare)
├── .gitignore         ← Cosa NON pushare su GitHub
├── index.html         ← Scheletro HTML: login, sidebar, topbar, modali
├── style.css          ← Tutta la grafica (~1100 righe)
├── data.js            ← Config statica: lista DIPENDENTI + MODULES
├── app.js             ← Il "cervello": tutto il codice JS (~1730 righe)
└── ARCHITETTURA.md    ← Questo documento
```

### Cosa fa ogni file

#### `index.html`
Lo "scheletro" che il browser carica per primo. Definisce:
- Overlay del **login** (a tutto schermo finché non sei autenticata)
- **Sidebar** (brand + moduli + dropdown responsabili + bottoni export/import + bottone Esci)
- **Topbar** (vista Lista/Calendario/Storico + ricerca + bottone "Pulisci filtri" + "+ Nuova scadenza")
- **Dashboard** (5 KPI cards: Tutte / Scadute / Entro 7 giorni / Entro 30 giorni / Oltre 30 giorni)
- Aree **Lista**, **Calendario**, **Storico** (una visibile alla volta)
- **Modali**: form scadenza + form "segna come fatta"
- Riferimenti agli script esterni (Supabase JS, Flatpickr, XLSX, data.js, app.js)

#### `style.css`
Tutta la grafica. Sezioni principali (cerca i commenti):
- Variabili colore (`:root`)
- App grid + sidebar + main
- Topbar + view toggle + search + KPI cards
- Lista + chip moduli (colorati per categoria)
- Calendario (grid 7×6)
- Storico (tabella desktop / card mobile)
- Modali (read-mode + edit-mode)
- Login overlay
- Sidebar user + logout
- Bottone "Pulisci filtri"
- Media queries mobile (≤700px e ≤400px)

**Tutti i moduli (Personale, Fisco, ecc.) usano palette Tailwind shade-100 uniforme** per coerenza visiva tra sidebar, chip in lista, e eventi in calendario.

#### `data.js`
Solo 2 liste configurabili a mano:
```javascript
window.DIPENDENTI = ["Marco", "Davide", "Roberto M", "Roberto L", "Elisa", "Valentina"];
window.MODULES    = [{ key, label, short, icon }, ...]; // 6 moduli
```
Modificare qui = `git commit && git push` = tutti gli utenti vedono i nuovi nomi.

#### `app.js`
Il cuore dell'applicazione. Organizzato in sezioni delimitate da commenti `// ----------`:

| Sezione | Funzione principale |
|---|---|
| Config Supabase | `sb = createClient(...)` |
| Auth helpers | `showLogin`, `hideLogin`, `handleLoginSubmit`, `handleLogout`, `isAuthError`, `startApp` |
| CRUD Supabase | `sbLoadAll`, `sbUpsert`, `sbDelete` ecc. |
| Realtime | `sbSubscribe`, `sbUnsubscribe` |
| Stato | `state = { items, module, status, query, view, … }` |
| Boot | `load()` carica dal cloud |
| Helpers | `localISO`, `parseISO`, `fmtDate` (gg/mm/aaaa), `urgency`, ecc. |
| Render | `renderModules`, `renderResponsabili`, `renderKpis`, `renderList`, `renderCalendar`, `renderHistoryView` |
| Modal scadenza | `openModal`, `closeModal`, `applyModalMode`, `saveFromForm`, `switchToEditMode` |
| Modal "segna fatta" | `openDoneModal`, `applyDone` |
| Azioni riga | `handleAction` (delete, reopen) |
| Excel I/O | `exportXlsx`, `importXlsx`, `downloadTemplate` |
| Wiring | Tutti gli `addEventListener` |
| `boot()` finale | Avvio dell'app dopo login OK |

---

## 🗃️ Database (Supabase)

### Tabella `scadenze`

| Colonna | Tipo | Cosa contiene |
|---|---|---|
| `id` | text (PK) | ID univoco (es. `"id-abc123"`) |
| `title` | text | Titolo della scadenza |
| `description` | text | Descrizione opzionale |
| `module` | text | Chiave del modulo (`fisco`, `personale`, ecc.) |
| `date` | date | Data scadenza (`YYYY-MM-DD`) |
| `recur_type` | text | `none` / `day` / `month` / `year` |
| `recur_n` | int | Ogni N (es. ogni 3 mesi) |
| `done` | bool | Se è completata |
| `done_at` | date | Quando è stata completata |
| `done_by` | text | Chi l'ha completata |
| `last_done_at` | date | Per ricorrenti: ultima volta che è stata fatta |
| `last_done_by` | text | Per ricorrenti: chi l'ha fatta l'ultima volta |
| `previous_date` | date | Per ricorrenti: data precedente prima del rollover |
| `history` | jsonb | Array di `{ doneAt, dueDate, doneBy, note }` |
| `responsabili` | jsonb | Array di nomi (`["Marco", "Elisa"]`) |

### Policy RLS (Row Level Security)
Tutte e 4 (SELECT, INSERT, UPDATE, DELETE) usano:
```sql
auth.role() = 'authenticated'
```
Solo chi è loggato può leggere/scrivere. Anonimo bloccato.

### Auth
- 1 utente condiviso (`info@overland-ocm.it` + password)
- "Confirm email" disabilitato (nessuna mail di verifica)
- Sessione persistente (resta loggato anche chiudendo il browser)

---

## 🔄 Flussi principali

### 1. Apertura app

```
1. Browser scarica index.html
2. index.html carica style.css + JS (supabase-js, flatpickr, data.js, app.js)
3. app.js parte:
   ├─ Crea client Supabase
   ├─ Definisce funzioni
   └─ Registra onAuthStateChange
4. Supabase scatena INITIAL_SESSION:
   ├─ Se c'è sessione valida in localStorage → startApp() → boot() → carica scadenze
   └─ Altrimenti → showLogin() → utente inserisce credenziali
5. Dopo login (handleLoginSubmit) → onAuthStateChange("SIGNED_IN") → startApp() → boot()
6. boot():
   ├─ Carica scadenze (sbLoadAll)
   ├─ Render tutte le viste
   └─ Attiva realtime (sbSubscribe)
```

### 2. CRUD (es. salva una scadenza)

```
1. Utente clicca "+ Nuova scadenza" → openModal(null)
2. Compila form → click Salva → saveFromForm()
3. Aggiornamento ottimistico: state.items.push(item) + renderAll()
4. Chiamata Supabase: sbUpsert(item)
   ├─ Se OK → fine
   └─ Se errore di auth → handleAuthErrorIfAny → signOut → showLogin
       Se errore generico → rollback state + alert
5. Realtime: Supabase notifica TUTTI i client (incluso il nostro)
6. Altri client ricevono postgres_changes → state aggiornato → re-render
```

### 3. Logout

```
1. Utente clicca "🚪 Esci" → handleLogout()
2. Confirm → sbUnsubscribe (chiude WebSocket realtime) → sb.auth.signOut()
3. onAuthStateChange("SIGNED_OUT") triggera:
   ├─ sbUnsubscribe (idempotente)
   ├─ closeAllModalsForLogout
   ├─ resetUiState (filtri, ricerca)
   ├─ state.items = []
   ├─ _booted = false
   └─ showLogin()
```

### 4. Sessione che scade durante l'uso

```
1. Token JWT scade (es. dopo 1h di inattività)
2. Utente fa azione (es. Salva) → sbUpsert → riceve errore 401
3. handleAuthErrorIfAny(error) detecta auth error
4. Forza signOut() → SIGNED_OUT → showLogin con messaggio "Sessione scaduta"
5. Utente rifa login → app riprende
```

---

## 🧠 Concetti chiave

### Realtime
Quando ti connetti a Supabase, oltre alle query HTTP, c'è un WebSocket aperto. Il server ti notifica ogni volta che la tabella `scadenze` cambia (INSERT/UPDATE/DELETE), così l'app si auto-aggiorna senza dover ricaricare.

### Aggiornamento ottimistico
Quando salvi una scadenza, l'app aggiorna SUBITO l'UI (come se fosse già salvata) e POI chiama Supabase. Se la chiamata fallisce, l'app **fa rollback** (ripristina lo stato precedente). Questo dà la sensazione di essere super reattiva.

### Read-mode vs Edit-mode (modale)
La scheda di una scadenza si apre sempre in **sola lettura**: vedi i bottoni "Segna fatta / Modifica / Elimina / Chiudi". Cliccando "Modifica" i campi si sbloccano (`disabled=false`) e appaiono "Salva / Annulla". Questo previene modifiche accidentali.

### RLS (Row Level Security)
Postgres ti permette di mettere "regole" sul database. La nostra regola: "Solo chi è autenticato può leggere/scrivere". Anche se qualcuno trova le chiavi pubbliche Supabase nel sorgente, senza login non può fare nulla.

### Anon key vs Service key
La chiave Supabase che vedi nel sorgente (`SUPABASE_KEY`) è la **anon publishable key** — è pubblica per design. La key segreta è la `service_role` key che NON è mai sul client (la useremmo solo per le Edge Functions lato server).

### JSONB
Postgres permette colonne di tipo "JSON". Usiamo JSONB per `responsabili` (array di nomi) e `history` (array di esecuzioni). Comodo perché sono dati liberi che cambiano forma, e non vogliamo creare tabelle separate.

---

## 🛠️ Come fare modifiche tipiche

### Aggiungere/togliere un dipendente
1. Edita `data.js` riga 7
2. `git add data.js && git commit -m "Aggiungi/togli X" && git push`
3. Tutti devono fare Ctrl+Shift+R per vedere il cambio (cache)

### Aggiungere un modulo (es. "Sicurezza")
1. Edita `data.js`: aggiungi all'array `MODULES`:
   ```js
   { key: "sicurezza", label: "Sicurezza", short: "Sicur.", icon: "🛡️" }
   ```
2. Edita `style.css`: copia un blocco di colori esistente (es. `.module-btn[data-module="utenze"]`) e adatta:
   - `.module-btn[data-module="sicurezza"]`
   - `.chip.sicurezza`
   - `.cal-legend .leg-chip.sicurezza`
   - `.cal-event.sicurezza`
3. Edita `index.html`: nella legenda calendario aggiungi:
   ```html
   <span class="leg"><i class="leg-chip sicurezza"></i>Sicurezza</span>
   ```
4. Push. Tutti gli utenti vedono il nuovo modulo dopo Ctrl+Shift+R.

### Aggiungere una colonna alla tabella scadenze
1. **Su Supabase Dashboard** → Table Editor → `scadenze` → Add column (es. `priorita` text)
2. In `app.js` → `toSupabase()` e `fromSupabase()`: aggiungi la mappatura
3. In `index.html` → form: aggiungi un `<input>` o `<select>`
4. In `app.js` → `openModal()` e `saveFromForm()`: leggi/scrivi il valore
5. (Opzionale) Mostra la colonna in lista (`renderList()`)
6. Push.

### Modificare il design / colori
Cerca le **variabili CSS** in `style.css` (`:root { --brand: ...; ... }`). Cambiarle aggiorna tutta l'app. Per colori per-modulo, vedi sezione "Module color tags" in `style.css`.

### Backup manuale del database
- Login app → click "⬇ Export Excel" nella sidebar → salvi un .xlsx con tutto
- Oppure da Supabase Dashboard → Database → Backups (a pagamento dopo certe soglie)

### Aggiungere una scadenza in massa via Excel
- Click "📄 Template Excel" → scarichi il template col formato corretto
- Compili l'Excel
- Click "⬆ Import Excel" → scegli il file
- Conferma in 2 step (importa? sovrascrivi tutto?)

---

## 🚀 Roadmap futura

### 🥇 Prima dell'app Formazione (priorità alta)
- [ ] Tabella `dipendenti` su Supabase (con email, ruolo, attivo, data assunzione)
- [ ] UI "Gestisci dipendenti" dentro l'app (solo admin)
- [ ] Migrazione `responsabili` per scadenza: da nomi-stringa a ID stabili
- [ ] Tabella `profili` con ruolo (admin/user) → policy RLS più granulari

### 🥈 Prossimi miglioramenti (priorità media)
- [ ] Notifiche email automatiche per scadenze imminenti (Supabase Edge Function + cron)
- [ ] Audit log "chi ha modificato cosa quando" (tabella + trigger Postgres)
- [ ] Backup automatico settimanale via Edge Function

### 🥉 Nice to have (priorità bassa)
- [ ] PWA: "Installa app" su mobile (manifest + service worker)
- [ ] Dark mode
- [ ] Export PDF report mensile
- [ ] Multi-azienda (se Overland-OCM diventerà multi-tenant)

### 🎓 Nuova app "Formazione" (futura)
Stesse fondamenta (auth, dipendenti, Supabase, stile UI). Aggiunge:
- Tabella `corsi` (catalogo)
- Tabella `formazioni` (dipendente ↔ corso, con scadenza)
- Dashboard "chi deve fare cosa entro quando"
- Notifiche email mirate per dipendente sui corsi obbligatori

---

## 🗂️ Glossario

- **PMI**: Piccola/Media Impresa (l'utente target dell'app).
- **Scadenza**: una riga della tabella `scadenze`. Può essere una-tantum o ricorrente.
- **Modulo / Categoria**: una delle 6 etichette (Personale, Fisco, Manutenzione, Fornitori, Clienti, Utenze). Filtraggio principale dell'app.
- **Responsabile**: un dipendente che è "owner" di una scadenza. Una scadenza può avere più responsabili.
- **Ricorrenza**: pattern di ripetizione (es. "ogni 1 mese", "ogni 1 anno"). Quando una scadenza ricorrente viene "fatta", la sua `date` viene avanzata alla prossima occorrenza.
- **Storico / History**: array dentro la scadenza che ricorda ogni volta che è stata segnata "fatta" (data, chi, note).
- **Vista Storico**: vista globale che mostra TUTTE le esecuzioni di TUTTE le scadenze, filtrabile per periodo. Cliccando una riga si riapre la scadenza con il bottone "Riapri" (annulla l'ultima esecuzione = rollback).
- **Realtime**: il meccanismo Supabase per cui le modifiche di un utente arrivano automaticamente agli altri senza ricaricare.
- **CDN**: rete di distribuzione contenuti. Le librerie esterne (Supabase JS, Flatpickr, XLSX) vengono scaricate da CDN jsdelivr.net.
- **RLS**: Row Level Security. Regole Postgres che restringono chi può vedere/modificare cosa a livello di singola riga.
- **JWT**: JSON Web Token. Il "biglietto" che Supabase ti dà quando fai login, che il client manda con ogni richiesta per provare di essere autenticato. Scade dopo ~1h ma viene rinnovato automaticamente finché la tab è aperta.
- **Anon key / publishable key**: la chiave Supabase nel sorgente. È pubblica per design. Non dà accesso ai dati senza essere autenticati (grazie a RLS).

---

## 📞 Per modifiche / dubbi

1. **Modifiche piccole** (testo, colore, nuovo dipendente): edita file → push
2. **Modifiche medie** (nuovo campo, nuovo modulo): segui i "Come fare modifiche tipiche"
3. **Modifiche grosse** (nuova tabella, nuova app): chiama Claude Code, includi questo file nel contesto. Lui capirà l'architettura senza dover indovinare.

---

*Ultimo aggiornamento: Giugno 2026*
