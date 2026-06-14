-- ============================================================
--  Scadenziario — tabelle anagrafiche (dipendenti + categorie)
--  Eseguire UNA volta nel SQL Editor di Supabase (tutto insieme).
--  Sicuro da ri-eseguire: azzera eventuali resti di tentativi precedenti.
--  ID interi 1,2,3. Disattivazione invece di cancellazione.
--  Scelta: ripartire puliti → le scadenze di prova vengono svuotate.
-- ============================================================

-- ----------------------------------------------------------------
-- 0) RESET — rimuove eventuali tabelle/vincoli da tentativi precedenti
-- ----------------------------------------------------------------
alter table public.scadenze drop constraint if exists scadenze_module_fkey;
drop table if exists public.dipendenti cascade;
drop table if exists public.categorie cascade;

-- ----------------------------------------------------------------
-- 1) DIPENDENTI  (anagrafica condivisa, riusabile da altre app)
-- ----------------------------------------------------------------
create table public.dipendenti (
  id          bigint generated always as identity primary key,  -- 1, 2, 3...
  nome        text    not null,
  email       text,                       -- non usata ora, pronta per le app future
  ruolo       text,                       -- idem
  attivo      boolean not null default true,
  ordine      int,
  created_at  timestamptz not null default now()
);

insert into public.dipendenti (nome, ordine) values
  ('Marco',     1),
  ('Davide',    2),
  ('Roberto M', 3),
  ('Roberto L', 4),
  ('Elisa',     5),
  ('Valentina', 6);

-- ----------------------------------------------------------------
-- 2) CATEGORIE  (specifiche dello Scadenziario; colore come dato)
-- ----------------------------------------------------------------
create table public.categorie (
  id            bigint generated always as identity primary key, -- 1, 2, 3...
  label         text    not null,
  icon          text,
  colore_bg     text,                      -- sfondo chip (es. '#f3e8ff')
  colore_testo  text,                      -- testo chip   (es. '#6b21a8')
  attivo        boolean not null default true,
  ordine        int,
  created_at    timestamptz not null default now()
);

insert into public.categorie (label, icon, colore_bg, colore_testo, ordine) values
  ('Personale',    '👥', '#dcfce7', '#166534', 1),
  ('Fisco',        '⚖️', '#f3e8ff', '#6b21a8', 2),
  ('Manutenzione', '🔧', '#ffedd5', '#9a3412', 3),
  ('Fornitori',    '🤝', '#fef3c7', '#854d0e', 4),
  ('Clienti',      '📦', '#dbeafe', '#1e40af', 5),
  ('Utenze',       '⚡', '#ccfbf1', '#134e4a', 6);

-- ----------------------------------------------------------------
-- 3) RLS — solo utenti autenticati (come la tabella scadenze)
-- ----------------------------------------------------------------
alter table public.dipendenti enable row level security;
alter table public.categorie  enable row level security;

create policy "dipendenti_authenticated_all" on public.dipendenti
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "categorie_authenticated_all" on public.categorie
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ----------------------------------------------------------------
-- 4) Realtime — modifiche all'anagrafica live agli altri (tollerante)
-- ----------------------------------------------------------------
do $$ begin
  alter publication supabase_realtime add table public.dipendenti;
exception when others then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.categorie;
exception when others then null; end $$;

-- ----------------------------------------------------------------
-- 5) SCADENZE — ripartiamo puliti e colleghiamo gli ID
--    module diventa l'ID (bigint) della categoria, con foreign key.
--    responsabili resta jsonb, ma ora contiene ID dipendenti (es. [1,3]).
-- ----------------------------------------------------------------
delete from public.scadenze;                       -- svuota i dati di prova

alter table public.scadenze alter column module drop default;
alter table public.scadenze alter column module type bigint using null;
alter table public.scadenze
  add constraint scadenze_module_fkey foreign key (module) references public.categorie(id);

-- (responsabili: nessuna foreign key possibile sugli elementi di un array jsonb;
--  l'integrità dei responsabili è garantita dall'app.)
