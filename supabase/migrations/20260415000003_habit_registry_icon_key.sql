alter table habit_registry add column if not exists icon_key text;

-- Backfill: mirror web/src/lib/habit-icons.ts derivation.
-- Category match first, then name keyword, else 'target'.
update habit_registry
set icon_key = case
  when icon_key is not null then icon_key
  when lower(trim(category)) = 'fitness' then 'dumbbell'
  when lower(trim(category)) = 'health' then 'heart-pulse'
  when lower(trim(category)) = 'hygiene' then 'sparkles'
  when lower(trim(category)) = 'learning' then 'graduation-cap'
  when lower(trim(category)) = 'recovery' then 'moon'
  when lower(trim(category)) = 'mindset' then 'brain'
  when lower(name) ~ 'sleep' then 'moon'
  when lower(name) ~ 'water|hydrat' then 'droplet'
  when lower(name) ~ 'read|book' then 'book-open'
  when lower(name) ~ 'code|coding|programming' then 'code-2'
  when lower(name) ~ 'japanese|study|learn|language' then 'graduation-cap'
  when lower(name) ~ 'step|walk' then 'footprints'
  when lower(name) ~ 'workout|gym|lift|exercise' then 'dumbbell'
  when lower(name) ~ 'floss|teeth' then 'smile'
  when lower(name) ~ 'journal|write' then 'notebook-pen'
  when lower(name) ~ 'alcohol|^no ' then 'ban'
  when lower(name) ~ 'meditat|mindful' then 'brain'
  when lower(name) ~ 'lotion|shower|hygien' then 'sparkles'
  else 'target'
end
where icon_key is null;
