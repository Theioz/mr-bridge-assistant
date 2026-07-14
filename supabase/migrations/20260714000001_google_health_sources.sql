-- #607 — Fitbit Web API (turned down Sept 2026) and Google Fit REST (deprecated 2026)
-- are replaced by a single Google Health sync writing source = 'google_health'.
--
-- Two source labels retire: 'fitbit_body' (fitness_log) and 'fitbit' (recovery_metrics).
-- This migration keeps existing reads working across the cutover. Idempotent.

-- ---------------------------------------------------------------------------
-- fitness_log: relabel the Fitbit body-composition history.
--
-- get_fitness_summary (web/src/lib/tools/fitness.ts) filters fitness_log by the
-- user's preferred source. Leaving history under 'fitbit_body' while new rows land
-- under 'google_health' would empty that view until enough new weigh-ins accumulate.
--
-- Safe against the (user_id, date, source) unique constraint: only 'fitbit_body' rows
-- are relabelled, they are unique per (user_id, date), and no 'google_health' rows
-- exist yet. 'google_fit' rows are deliberately NOT relabelled — a date can hold both
-- a 'google_fit' and a 'fitbit_body' row, and collapsing both would collide.
-- ---------------------------------------------------------------------------

update fitness_log
   set source = 'google_health'
 where source = 'fitbit_body'
   and not exists (
     select 1 from fitness_log existing
      where existing.user_id = fitness_log.user_id
        and existing.date    = fitness_log.date
        and existing.source  = 'google_health'
   );

-- ---------------------------------------------------------------------------
-- user_metric_preferences: repoint sources that no longer produce data.
--
-- body_composition: 'fitbit_body' / 'google_fit' → 'google_health'.
-- Recovery metrics: 'fitbit' was a selectable alternative to Oura. The Google Health
-- sync does not write recovery_metrics (Oura is a strict superset — it also supplies
-- readiness, sleep_score and vo2_max, which Fitbit never did), so any preference still
-- pointing at 'fitbit' would silently return no rows. Repoint it to Oura.
-- ---------------------------------------------------------------------------

update user_metric_preferences
   set preferred_source = 'google_health'
 where metric = 'body_composition'
   and preferred_source in ('fitbit_body', 'google_fit');

update user_metric_preferences
   set preferred_source = 'oura'
 where preferred_source = 'fitbit';

-- Historical recovery_metrics rows with source = 'fitbit' are left in place: they are
-- real past measurements, nothing reads them now that no preference points at 'fitbit',
-- and deleting them would destroy history for no benefit.
