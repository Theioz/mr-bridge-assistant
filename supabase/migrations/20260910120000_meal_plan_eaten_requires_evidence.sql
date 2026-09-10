-- A meal_plans row may only reach status='eaten' when there is EVIDENCE it was eaten.
--
-- THE BUG THIS EXISTS TO PREVENT
--
-- On 2026-09-10 Jason logged a lunch in the app and the day's macros did not move. `meal_log`
-- had zero rows for the date. The cause was one row written the previous afternoon:
--
--   meal_plans e1a037e1  date=2026-09-10  meal_type=lunch  status='eaten'
--   created_at = updated_at = 2026-09-09T23:14:12Z   (INSERTED as eaten, never PATCHed)
--
-- A planning write created TOMORROW'S lunch already marked eaten. By the time Jason went to log
-- it, the plan row was in its terminal state, so the app had nothing to do — KitchenPanel only
-- offers "Ate this"/"Ate it" on rows with status='planned'. No `meal_log` row was ever written,
-- and the failure is silent by construction: the only symptom is a macro total that stays flat.
--
-- `meal_plans.status` and `meal_log` are separate rows written by separate paths. A plan reading
-- 'eaten' is NOT evidence the meal was logged. That sentence is already in
-- feedback_mrbridge_script_written_rows_bypass_invariants (2026-08-08), where the same end
-- symptom arrived through a different door — there the gate was `recipes.macros_computed_at`,
-- fixed in 20260825120000. This is the third door onto the same open loop: an action Jason takes
-- must produce a visible result.
--
-- WHAT THE AUDIT FOUND, AND WHY A NARROWER RULE WOULD NOT HAVE HELD
--
-- Across all 64 rows that have ever reached 'eaten', three had no `meal_log` behind them:
--
--   2026-07-16 dinner  INSERTED as eaten, same day, no recipe and no cook at all
--   2026-07-23 dinner  INSERTED as eaten, PRE-DATED by 3 days, macro-backed recipe
--   2026-09-10 lunch   INSERTED as eaten, PRE-DATED by 1 day, cook-backed  <- the report
--
-- All three were INSERTED already eaten. A rule that only rejected FUTURE dates would have
-- caught two of the three and missed 2026-07-16 entirely, so the date check alone is not the
-- fix. What all three share is the absence of evidence, which is what these rules require.
--
-- WHY THIS IS A TRIGGER AND NOT A CHECK CONSTRAINT
--
-- Two reasons. A CHECK cannot call `now()` (Postgres requires immutability), and a CHECK cannot
-- look at another table. Both are needed here.
--
-- Same reasoning as 20260813120000 and 20260825120000 on `recipes`: the app's own routes are not
-- the path that breaks this. Every one of the three defects above came through PostgREST with
-- the service key — the assistant/script path. A rule enforced only where it has never broken is
-- not enforcement, so this runs on every writer including psql.
--
-- WHAT IS DELIBERATELY STILL ALLOWED
--
-- 1. BACKFILL. Recording a meal after the fact is normal and common — 30 of the 64 rows were
--    inserted already 'eaten'. That stays legal, but the `meal_log` row must exist FIRST. Write
--    the log, then the plan. The evidence is what makes it a record rather than an assertion.
--
-- 2. THE MACRO-LESS "Ate it" BUTTON. KitchenPanel falls through to a status-only button when a
--    plan has no cook and no resolved recipe — the "Eating out" placeholder (5c99f52c) is the
--    designed case: it carries no macros on purpose so a meal out can still satisfy the
--    "every plan has a recipe" rule of 20260721000001, and the real macros are logged afterwards.
--    Requiring a log row there would break a working flow, so rule 3 exempts macro-less plans.
--    They are covered by the orphan audit in the mr-bridge skill's context.sh instead — visible,
--    not fatal, exactly as unpinned fdc_ids are handled in 20260813120000.
--
-- THE THREE RULES
--
--   R1  (insert + update)  status='eaten' is rejected when `date` is in the future.
--   R2  (insert only)      a row ARRIVING as 'eaten' must already have a meal_log row for
--                          (user_id, date, meal_type).
--   R3  (update only)      a transition to 'eaten' on a MACRO-BACKED plan (a cook, or a recipe
--                          with macros_computed_at) must have a meal_log row. Macro-less plans
--                          are exempt — see (2) above.
--
-- R3 matches the app's own write order and cannot break it: `eatFromCook` in
-- web/src/lib/nutrition/cooks.ts inserts `meal_log` (carrying meal_plan_id), then draws the cook
-- down, then flips the status. `eatFromRecipe` delegates to it. By the time the status update
-- runs, the evidence is there. Verified against both routes before writing.
--
-- TIMEZONE: the comparison is made in America/Los_Angeles, matching `USER_TZ` in
-- web/src/lib/timezone.ts. Using the server's `current_date` (UTC) would call a 5pm Pacific meal
-- "tomorrow" for the last 7-8 hours of every day and reject a legitimate same-evening log — the
-- exact UTC-midnight trap already documented on `logDate` and `cooked_on`.
--
-- The three existing bad rows are NOT repaired here. 2026-09-10 was corrected by hand when it was
-- found (meal_log 1f4cac5c). The two July dinners are unrecoverable — what Jason ate on those
-- nights is not in any record, and inventing macros to satisfy a constraint would be worse than
-- the gap. A trigger only fires on write, so they are left in place and stay visible to the audit.

create or replace function public.meal_plans_check_eaten_evidence()
returns trigger
language plpgsql
as $$
declare
  today_local date;
  evidence    int;
  macro_backed boolean;
begin
  if new.status is distinct from 'eaten' then
    return new;
  end if;

  today_local := (now() at time zone 'America/Los_Angeles')::date;

  -- R1. You cannot have eaten a meal that has not happened yet. This is the shape that produced
  -- the 2026-09-10 report and the 2026-07-23 row: a planning write dated forward.
  if new.date > today_local then
    raise exception
      'meal_plans %/%: cannot set status=''eaten'' on a FUTURE date (% is after %). A plan is created as ''planned'' and becomes ''eaten'' when the meal is actually logged. Marking it eaten in advance puts the row in its terminal state, so the app offers no "Ate this" button and meal_log is never written — the meal then logs nothing and the day''s macros stay flat.',
      new.date, new.meal_type, new.date, today_local;
  end if;

  -- R2. A row that ARRIVES eaten is a backfill, and a backfill must be backed by the log it
  -- claims. Match on (user_id, date, meal_type): on INSERT the plan has no id yet for a
  -- pre-existing meal_log row to reference, so meal_plan_id cannot be the test.
  if tg_op = 'INSERT' then
    select count(*) into evidence
      from public.meal_log ml
     where ml.user_id = new.user_id
       and ml.date = new.date
       and ml.meal_type is not distinct from new.meal_type;

    if evidence = 0 then
      raise exception
        'meal_plans %/%: inserted with status=''eaten'' but there is no meal_log row for that user, date and meal_type. Write the meal_log row FIRST, then the plan — a plan status is not evidence a meal was logged, and the two are separate rows on separate paths. If you meant to plan this meal, insert it as ''planned''.',
        new.date, new.meal_type;
    end if;
  end if;

  -- R3. A macro-backed plan flipping to 'eaten' must have produced a log row. Macro-less plans
  -- ("Eating out", an unresolved recipe) are exempt: KitchenPanel's status-only button is the
  -- designed path for them and logs nothing on purpose.
  if tg_op = 'UPDATE' and old.status is distinct from 'eaten' then
    macro_backed := new.cook_id is not null
      or exists (
        select 1 from public.recipes r
         where r.id = new.recipe_id
           and r.macros_computed_at is not null
      );

    if macro_backed then
      select count(*) into evidence
        from public.meal_log ml
       where ml.user_id = new.user_id
         and (
           ml.meal_plan_id = new.id
           or (ml.date = new.date and ml.meal_type is not distinct from new.meal_type)
         );

      if evidence = 0 then
        raise exception
          'meal_plans %/%: this plan is macro-backed (a cook, or a recipe with resolved macros) so eating it must write a meal_log row, and none exists. The app does this in one step — /api/meals/eat inserts the log, draws the cook down, then sets the status. Setting the status on its own records that it happened while logging no macros, which is the failure this rule exists to stop.',
          new.date, new.meal_type;
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists meal_plans_check_eaten_evidence on public.meal_plans;

create trigger meal_plans_check_eaten_evidence
  before insert or update of status, date, meal_type, cook_id, recipe_id
  on public.meal_plans
  for each row
  execute function public.meal_plans_check_eaten_evidence();

comment on function public.meal_plans_check_eaten_evidence() is
  'Rejects meal_plans reaching status=''eaten'' without evidence: a future date, an INSERT already eaten with no meal_log row behind it, or a macro-backed plan flipped to eaten without a meal_log row. Macro-less plans ("Eating out") keep the status-only path. Applies to every writer including PostgREST, which is where all three known occurrences came from.';
