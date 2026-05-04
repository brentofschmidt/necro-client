-- ============================================================
-- 0017_alignments_and_carrion_pact.sql
--
-- Splits "alignment" out from "factions". Previously good / neutral /
-- evil sat in necro_content.factions, but those are ideological axes
-- (a character IS good/neutral/evil), not in-world political groups.
-- Factions become actual organizations players can earn rep with;
-- alignment becomes a character attribute driven by gameplay actions
-- (moral choices, kills, faction reputations).
--
-- Changes:
--   1. Create necro_content.alignments and seed good/neutral/evil there.
--   2. Add necro_player.characters.alignment_id (nullable — assigned by
--      gameplay later).
--   3. Null out zones.controlling_faction_id rows that point to the
--      legacy good/neutral/evil factions, then delete those rows.
--   4. Insert the first real faction: The Carrion Pact.
--   5. RLS + grant on alignments.
--
-- Idempotent.
-- ============================================================


-- ── 1. Alignments table + seed ───────────────────────────────────────────────
create table if not exists necro_content.alignments (
    id           text primary key,
    display_name text not null,
    description  text not null default '',
    icon_path    text,
    sort_order   int  not null default 0
);

insert into necro_content.alignments (id, display_name, description, sort_order) values
    ('good',    'Good',    'Defenders of the realm. Compassion and honor over self-interest.',                  0),
    ('neutral', 'Neutral', 'Independents and pragmatists. Loyal to none beyond their own oath.',                10),
    ('evil',    'Evil',    'Those who hurt the living, dabble with what should not be touched, or rule by fear.', 20)
on conflict (id) do update set
    display_name = excluded.display_name,
    description  = excluded.description,
    sort_order   = excluded.sort_order;


-- ── 2. characters.alignment_id ──────────────────────────────────────────────
alter table necro_player.characters
    add column if not exists alignment_id text references necro_content.alignments(id);


-- ── 3. Detach + delete legacy good/neutral/evil "factions" ──────────────────
update necro_content.zones
   set controlling_faction_id = null
 where controlling_faction_id in ('good', 'neutral', 'evil');

delete from necro_content.factions where id in ('good', 'neutral', 'evil');


-- ── 4. The Carrion Pact ─────────────────────────────────────────────────────
insert into necro_content.factions (id, display_name, description, is_player_faction, starting_standing) values
    ('carrion_pact',
     'The Carrion Pact',
     'A secretive league that profits from the dying world — grave robbers, mercenary embalmers, and worse. They claim no banner and own no city, yet their mark is found on every battlefield by morning.',
     true,
     'Neutral')
on conflict (id) do update set
    display_name      = excluded.display_name,
    description       = excluded.description,
    is_player_faction = excluded.is_player_faction,
    starting_standing = excluded.starting_standing;


-- ── 5. RLS + grants for alignments ──────────────────────────────────────────
alter table necro_content.alignments enable row level security;

drop policy if exists alignments_read on necro_content.alignments;
create policy alignments_read on necro_content.alignments
    for select using (true);

grant select on necro_content.alignments to anon, authenticated;
