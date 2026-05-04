-- ============================================================
-- 0028_seed_thief_skills.sql
--
-- Adds two thief-flavored activity skills: Lockpicking and
-- Pickpocketing. Both reuse existing Gathering-category stats
-- (success_chance, gather_speed, gather_yield, rare_find_chance) so
-- no new substats are needed.
--
-- Idempotent.
-- ============================================================

insert into necro_content.skills (name, category, display_name, description, max_level, item_types, per_level_effects) values
    ('lockpicking', 'Activity', 'Lockpicking',
     'Force open chests, doors, and other locks without the key. Higher levels open tougher locks faster, with a chance for the chest to drop something extra.',
     99, '{}',
     '[
       {"type":"Stat","affects":"success_chance",   "ratio":0.2,  "description":"+0.2% chance to open the lock per level"},
       {"type":"Stat","affects":"gather_speed",     "ratio":0.1,  "description":"+0.1% faster picking per level"},
       {"type":"Stat","affects":"rare_find_chance", "ratio":0.05, "description":"+0.05% chance for bonus loot from picked containers per level"}
     ]'::jsonb),

    ('pickpocketing', 'Activity', 'Pickpocketing',
     'Quietly relieve targets of their coin and trinkets without alerting them. Higher levels pull more from each mark and dig up rarer finds.',
     99, '{}',
     '[
       {"type":"Stat","affects":"success_chance",   "ratio":0.2,  "description":"+0.2% chance to pick the pocket without getting caught per level"},
       {"type":"Stat","affects":"gather_yield",     "ratio":0.05, "description":"+0.05 extra coins per successful pick per level"},
       {"type":"Stat","affects":"rare_find_chance", "ratio":0.05, "description":"+0.05% chance to lift a valuable item per level"}
     ]'::jsonb)

on conflict (name) do update set
    category          = excluded.category,
    display_name      = excluded.display_name,
    description       = excluded.description,
    max_level         = excluded.max_level,
    item_types        = excluded.item_types,
    per_level_effects = excluded.per_level_effects;
