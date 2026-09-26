-- ---------------------------------------------------------------------------
-- inventory_draws.match_method: allow 'packaged_food_id' (#722).
--
-- A recipe line pinned to a catalog label now draws from the stock row linked to the same
-- catalog product, tried before fdc_id and name. The ledger records which strategy produced
-- each draw so a bad one is traceable, and the original inline CHECK allowed only the two
-- strategies that existed in #706.
--
-- The constraint was declared inline and unnamed, so Postgres named it
-- inventory_draws_match_method_check. Dropped and re-added under the same name.
-- ---------------------------------------------------------------------------

alter table inventory_draws
  drop constraint if exists inventory_draws_match_method_check;

alter table inventory_draws
  add constraint inventory_draws_match_method_check
  check (match_method in ('packaged_food_id', 'fdc_id', 'name'));
