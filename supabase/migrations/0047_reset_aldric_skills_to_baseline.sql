-- ============================================================
-- 0047_reset_aldric_skills_to_baseline.sql
--
-- Replaces Aldric's curated skill spread (mining 12 / smithing 10 /
-- cooking 5 / swords 8) with one row per skill in necro_content.skills,
-- all at level 1 / 0 XP. Gives the test character a clean baseline so
-- the Skills tab on /g/necro/characters/<id>/skills shows every skill
-- and proficiency the world catalog defines, untouched by the
-- previous demo numbers.
--
-- 0045's seed has been updated to do the same thing for fresh installs.
-- This migration handles the existing seeded character.
--
-- Idempotent: deletes Aldric's existing skill / proficiency rows before
-- the catalog-driven insert, so re-runs converge on the same state.
-- ============================================================

do $$
declare
    v_email          text := 'brentofschmidt@gmail.com';   -- ← change for other dev accounts
    v_character_name text := 'Aldric';
    v_user_id        uuid;
    v_character_id   uuid;
begin
    select id into v_user_id
      from auth.users
     where lower(email) = lower(v_email);

    if v_user_id is null then
        raise notice 'No auth.users row for %, skipping skill reset.', v_email;
        return;
    end if;

    select id into v_character_id
      from necro_player.characters
     where user_id = v_user_id
       and lower(character_name) = lower(v_character_name)
       and deleted_at is null
     limit 1;

    if v_character_id is null then
        raise notice 'Character "%" not found for %, skipping skill reset.',
            v_character_name, v_email;
        return;
    end if;

    -- Wipe existing rows so the migration is convergent regardless of the
    -- starting state (curated demo levels OR a partial earlier reset).
    delete from necro_player.character_skills        where character_id = v_character_id;
    delete from necro_player.character_proficiencies where character_id = v_character_id;

    -- One row per Activity skill, all at level 1 / 0 XP.
    insert into necro_player.character_skills (character_id, skill, level, current_xp)
    select v_character_id, name, 1, 0
      from necro_content.skills
     where category = 'Activity';

    -- One row per Proficiency skill, all at level 1 / 0 XP.
    insert into necro_player.character_proficiencies (character_id, skill, level, current_xp)
    select v_character_id, name, 1, 0
      from necro_content.skills
     where category = 'Proficiency';

    raise notice 'Reset skills + proficiencies for "%" (%).',
        v_character_name, v_character_id;
end$$;
