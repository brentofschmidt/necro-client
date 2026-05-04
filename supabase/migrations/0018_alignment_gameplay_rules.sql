-- ============================================================
-- 0018_alignment_gameplay_rules.sql
--
-- Adds a gameplay_rules text[] to necro_content.alignments. Each entry
-- is a one-line rule the alignment imposes on a character (PvP rules,
-- guard behavior, social consequences). Stored as a flat array rather
-- than separate boolean columns so authoring new rules doesn't require
-- a schema change — the UI just renders the array as a bulleted list,
-- and game logic later can string-match on stable keys (or migrate to
-- structured flags if branching gets complex).
--
-- Idempotent.
-- ============================================================

alter table necro_content.alignments
    add column if not exists gameplay_rules text[] not null default '{}';

update necro_content.alignments set gameplay_rules = array[
    'Guards defend you when attacked.',
    'Attacks on innocents bring guards and reputation loss.',
    'Welcome in cities, temples, and good-aligned settlements.',
    'Death penalty applies on PvE deaths (XP / durability loss).'
] where id = 'good';

update necro_content.alignments set gameplay_rules = array[
    'Guards defend you when attacked.',
    'Attacks on innocents bring guards and reputation loss.',
    'Welcome in most settlements; some good and evil enclaves are restricted.',
    'Death penalty applies on PvE deaths (XP / durability loss).'
] where id = 'neutral';

update necro_content.alignments set gameplay_rules = array[
    'Can be attacked on sight anywhere with no repercussions for the attacker.',
    'Guards do not respond when you are attacked.',
    'Guards do not intervene when you attack others.',
    'Barred from most cities, temples, and good-aligned settlements.',
    'Death penalty is harsher (additional XP loss; risk of dropping equipped items).'
] where id = 'evil';
