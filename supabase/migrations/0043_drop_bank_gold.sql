-- ============================================================
-- 0043_drop_bank_gold.sql
--
-- Removes necro_player.bank.bank_gold. Gold is now treated as a normal
-- stackable item (the `gold` row from 0034) and held in the existing
-- bank_tabs.slots jsonb the same way every other bank-stored item is.
-- Eliminates the "two sources of truth" problem — wherever the gold
-- item lives is the only count we trust.
--
-- The bank row itself stays: it carries `version` and `saved_at_utc`
-- for save-record metadata, and the bank_tabs FK still hangs off the
-- (character_id) PK.
--
-- bank_tabs is unchanged; it already supports gold as a stackable item
-- the same as any other:
--   '[{"itemName":"gold","quantity":250}]'::jsonb
--
-- Idempotent — safe to re-run.
-- ============================================================

alter table necro_player.bank
    drop column if exists bank_gold;
