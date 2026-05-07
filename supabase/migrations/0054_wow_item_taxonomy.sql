-- ============================================================
-- 0054_wow_item_taxonomy.sql
--
-- Aligns the item-categorisation tables with the WoW pattern:
--   ItemClass    → necro_content.item_classes        (high-level: weapon, armor, …)
--   ItemSubClass → necro_content.item_subclasses     (specific shape: sword, helmet, …)
--   InventoryType→ necro_content.inventory_slots     (paper-doll slot: Head, MainHand, …)
--
-- Renames performed:
--   item_types                       → item_subclasses
--   item_subclasses."group"          → item_class
--   item_subclasses.equip_slot       → inventory_slot
--   equip_slots                      → inventory_slots
--   items.item_type                  → items.item_subclass
--   items.slot                       → items.inventory_slot
--
-- New catalog:
--   item_classes (id, display_name, description, sort_order)
--   seeded with lowercase ids — 'weapon','armor','jewelry','tool',
--   'consumable','material','container','currency' — and the existing
--   PascalCase values on item_subclasses.item_class normalised to match.
--
-- RPCs that referenced the renamed columns are dropped + recreated:
--   get_public_character_equipment        — return column item_type
--                                          → item_subclass
--   get_public_character_calculated_stats — shield check rebound to
--                                          i.item_subclass
--
-- Idempotent — every step uses if-not-exists / if-exists guards so a
-- re-run is a no-op once applied.
-- ============================================================


-- ── 1. Drop dependent functions before renaming columns they reference ──────
drop function if exists necro_content.get_public_character_equipment(uuid);
drop function if exists necro_content.get_public_character_calculated_stats(uuid);


-- ── 2. New item_classes catalog ─────────────────────────────────────────────
create table if not exists necro_content.item_classes (
    id           text primary key,
    display_name text not null,
    description  text not null default '',
    sort_order   int  not null default 0
);

alter table necro_content.item_classes enable row level security;
drop policy if exists item_classes_read on necro_content.item_classes;
create policy item_classes_read on necro_content.item_classes for select using (true);

grant all on necro_content.item_classes to anon, authenticated, service_role;

insert into necro_content.item_classes (id, display_name, description, sort_order) values
    ('weapon',     'Weapon',     'Items wielded to attack — swords, axes, bows, wands.',         10),
    ('armor',      'Armor',      'Worn protection — helmets, chestplates, shields.',            20),
    ('jewelry',    'Jewelry',    'Rings and amulets that buff stats.',                          30),
    ('tool',       'Tool',       'Gathering tools — pickaxes, woodcutting axes, fishing rods.', 40),
    ('consumable', 'Consumable', 'Used up on use — food, potions, scrolls, bandages.',          50),
    ('material',   'Material',   'Crafting inputs — ores, ingots, herbs, hides, logs.',         60),
    ('container',  'Container',  'Holds other items — bags, quivers.',                          70),
    ('currency',   'Currency',   'Money and currency tokens.',                                  80)
on conflict (id) do update set
    display_name = excluded.display_name,
    description  = excluded.description,
    sort_order   = excluded.sort_order;


-- ── 3. Rename equip_slots → inventory_slots ─────────────────────────────────
do $$ begin
    if exists (
        select 1 from pg_tables
        where schemaname = 'necro_content' and tablename = 'equip_slots'
    ) then
        alter table necro_content.equip_slots rename to inventory_slots;
        drop policy if exists equip_slots_read on necro_content.inventory_slots;
        create policy inventory_slots_read on necro_content.inventory_slots
            for select using (true);
    end if;
end$$;


-- ── 4. Rename item_types → item_subclasses + column renames ─────────────────
do $$ begin
    if exists (
        select 1 from pg_tables
        where schemaname = 'necro_content' and tablename = 'item_types'
    ) then
        alter table necro_content.item_types rename to item_subclasses;
    end if;
end$$;

do $$ begin
    if exists (
        select 1 from information_schema.columns
        where table_schema = 'necro_content'
          and table_name   = 'item_subclasses'
          and column_name  = 'group'
    ) then
        alter table necro_content.item_subclasses rename column "group" to item_class;
    end if;
end$$;

do $$ begin
    if exists (
        select 1 from information_schema.columns
        where table_schema = 'necro_content'
          and table_name   = 'item_subclasses'
          and column_name  = 'equip_slot'
    ) then
        alter table necro_content.item_subclasses rename column equip_slot to inventory_slot;
    end if;
end$$;


-- ── 5. Normalise item_subclasses.item_class to lowercase ids ────────────────
-- Existing data uses PascalCase ('Weapon','Armor','Tool',…). The new
-- item_classes catalog uses lowercase ids to match the rest of the
-- catalogs (rarities, abilities, resources, …). Map them in one shot.
update necro_content.item_subclasses set item_class = lower(item_class)
 where item_class <> lower(item_class);


-- ── 6. Rename items.item_type → items.item_subclass and items.slot →
-- items.inventory_slot ─────────────────────────────────────────────────
do $$ begin
    if exists (
        select 1 from information_schema.columns
        where table_schema = 'necro_content'
          and table_name   = 'items'
          and column_name  = 'item_type'
    ) then
        alter table necro_content.items rename column item_type to item_subclass;
    end if;
end$$;

do $$ begin
    if exists (
        select 1 from information_schema.columns
        where table_schema = 'necro_content'
          and table_name   = 'items'
          and column_name  = 'slot'
    ) then
        alter table necro_content.items rename column slot to inventory_slot;
    end if;
end$$;


-- ── 7. Recreate dependent functions with the new column names ───────────────
create function necro_content.get_public_character_equipment(p_character_id uuid)
returns table (
    slot           text,
    item_id        text,
    item_name      text,
    item_rarity    text,
    item_subclass  text
)
language sql
stable
security definer
set search_path = ''
as $$
    select e.slot,
           e.item_name as item_id,
           i.item_name,
           i.rarity,
           i.item_subclass
    from necro_player.equipment e
    left join necro_content.items i on i.id = e.item_name
    where e.character_id = p_character_id
      and e.item_name <> ''
    order by e.slot;
$$;

grant execute on function necro_content.get_public_character_equipment(uuid)
    to anon, authenticated;


create function necro_content.get_public_character_calculated_stats(p_character_id uuid)
returns table (
    id                   text,
    display_name         text,
    category             text,
    is_percent           boolean,
    affects              text,
    conversion_per_point text,
    value                real,
    sort_order           int
)
language sql
stable
security definer
set search_path = ''
as $$
    with base as (
        select s.ability, s.value as base_value
        from necro_player.character_ability_scores s
        where s.character_id = p_character_id
    ),
    equipment_bonuses as (
        select
            (b.elem ->> 'ability') as ability,
            sum(((b.elem ->> 'value')::real)) as bonus_value
        from necro_player.equipment e
        join necro_content.items i on i.id = e.item_name
        cross join lateral
            jsonb_array_elements(coalesce(i.ability_bonuses, '[]'::jsonb)) as b(elem)
        where e.character_id = p_character_id
          and e.item_name <> ''
          and (b.elem ->> 'modifier_type') = 'Flat'
        group by b.elem ->> 'ability'
    ),
    aura_ability_bonuses as (
        select
            (b.elem ->> 'ability') as ability,
            sum(((b.elem ->> 'value')::real) * aa.stacks) as bonus_value
        from necro_player.active_auras aa
        join necro_content.auras a on a.id = aa.aura_id
        cross join lateral
            jsonb_array_elements(coalesce(a.ability_bonuses, '[]'::jsonb)) as b(elem)
        where aa.character_id = p_character_id
          and (b.elem ->> 'modifier_type') = 'Flat'
        group by b.elem ->> 'ability'
    ),
    aura_stat_bonuses as (
        select
            (b.elem ->> 'stat') as stat,
            sum(((b.elem ->> 'value')::real) * aa.stacks) as bonus_value
        from necro_player.active_auras aa
        join necro_content.auras a on a.id = aa.aura_id
        cross join lateral
            jsonb_array_elements(coalesce(a.stat_bonuses, '[]'::jsonb)) as b(elem)
        where aa.character_id = p_character_id
          and (b.elem ->> 'modifier_type') = 'Flat'
        group by b.elem ->> 'stat'
    ),
    eff as (
        select
            coalesce(max(case when ab.ability = 'strength'     then ab.value end), 10) as str,
            coalesce(max(case when ab.ability = 'dexterity'    then ab.value end), 10) as dex,
            coalesce(max(case when ab.ability = 'constitution' then ab.value end), 10) as con,
            coalesce(max(case when ab.ability = 'intelligence' then ab.value end), 10) as int_,
            coalesce(max(case when ab.ability = 'wisdom'       then ab.value end), 10) as wis,
            coalesce(max(case when ab.ability = 'charisma'     then ab.value end), 10) as cha
        from (
            select coalesce(b.ability, eb.ability, ab.ability) as ability,
                   coalesce(b.base_value,    0::real)
                   + coalesce(eb.bonus_value, 0::real)
                   + coalesce(ab.bonus_value, 0::real) as value
            from base b
            full outer join equipment_bonuses eb on eb.ability = b.ability
            full outer join aura_ability_bonuses ab on ab.ability = coalesce(b.ability, eb.ability)
        ) ab
    ),
    gear as (
        -- Shield check now bound to the renamed column.
        select exists (
            select 1
            from necro_player.equipment e
            join necro_content.items i on i.id = e.item_name
            where e.character_id = p_character_id
              and i.item_subclass = 'shield'
        ) as has_shield
    ),
    formula as (
        select
            s.id,
            s.display_name,
            s.category,
            s.is_percent,
            s.affects,
            s.conversion_per_point,
            s.sort_order,
            case s.id
                when 'attack_power'   then (eff.str  * 2)::real
                when 'spell_power'    then (eff.int_ * 2)::real
                when 'healing_power'  then (eff.wis  * 2)::real
                when 'crit_damage'    then 50::real

                when 'crit_chance'    then floor((eff.dex  - 10) / 2.0)::real
                when 'spell_crit'     then floor((eff.int_ - 10) / 2.0)::real
                when 'heal_crit'      then floor((eff.wis  - 10) / 2.0)::real

                when 'haste'          then floor(eff.dex / 4.0)::real
                when 'attack_speed'   then floor(eff.dex / 4.0)::real
                when 'movement_speed' then floor(eff.dex / 5.0)::real

                when 'armor'          then eff.con::real
                when 'dodge_chance'   then floor((eff.dex - 10) / 2.0)::real
                when 'parry_chance'   then floor((eff.str - 10) / 2.0)::real
                when 'block_chance'   then case
                                              when gear.has_shield
                                                  then floor((eff.con - 10) / 2.0)::real
                                              else 0::real
                                           end
                when 'magic_resist'   then eff.wis::real

                when 'hit_chance'     then (floor((eff.dex - 10) / 2.0)
                                            + floor((eff.wis - 10) / 2.0))::real
                when 'spell_hit'      then floor((eff.int_ - 10) / 2.0)::real
                when 'expertise'      then floor((eff.cha - 10) / 2.0)::real

                when 'mana_regen'     then floor(eff.wis / 4.0)::real
                when 'health_regen'   then floor(eff.con / 5.0)::real
                when 'life_steal'     then 0::real

                when 'mastery'        then 0::real
                when 'versatility'    then floor(eff.cha / 5.0)::real

                else 0::real
            end as base_value
        from necro_content.stats s
        cross join eff
        cross join gear
    )
    select
        f.id,
        f.display_name,
        f.category,
        f.is_percent,
        f.affects,
        f.conversion_per_point,
        f.base_value + coalesce(asb.bonus_value, 0::real) as value,
        f.sort_order
    from formula f
    left join aura_stat_bonuses asb on asb.stat = f.id
    order by f.sort_order, f.id;
$$;

grant execute on function necro_content.get_public_character_calculated_stats(uuid)
    to anon, authenticated;
