-- ESPN team IDs are only unique within a league (Celtics NBA id=2, Bills NFL id=2).
-- Re-key the unique constraint to include league so cross-league collisions don't merge rows.
alter table sports_cache
  drop constraint if exists sports_cache_user_id_team_id_key;

alter table sports_cache
  add constraint sports_cache_user_id_team_id_league_key
  unique (user_id, team_id, league);
