-- ---------------------------------------------------------------------------
-- packaged_foods: the nutrition label on the box, as photographed.
--
-- Every macro in this app ultimately comes from USDA FoodData Central, and for whole foods
-- that is right: "chicken breast, raw" is the same food in every kitchen. For BRANDED
-- packaged goods it is not, and the gap is not theoretical — it was measured on the two
-- items that prompted this table:
--
--   Barilla tri-color rotini. USDA Branded has no Barilla record for it. The closest match
--   by numbers (fdc 729736) agrees to the decimal on all six macros but is REGGANO, a
--   different company. Pinning it would file an Aldi product as a Barilla one.
--
--   Classico Italian Sausage pasta sauce. The nearest Branded record (fdc 2615521, Riviana)
--   reads 2.4 P / 1.6 F / 400 mg Na per 100 g against the jar's actual 1.6 / 1.2 / 352 —
--   a 50% overstatement on protein and a 14% overstatement on sodium. Close enough to look
--   right in a search result, wrong enough to matter across a four-portion batch.
--
-- USDA Branded is a snapshot of label data submitted by manufacturers, so it is both
-- incomplete and stale by construction. The label in the kitchen is the ground truth for
-- the food actually being eaten. This table is that ground truth, written down once.
--
-- WHY PER 100 G AND NOT PER SERVING. Every other macro path here is per-100 g: USDA records,
-- recipes.ingredients_json, metadata.macro_items "basis" strings. Storing the label's
-- per-serving numbers would make every consumer redo the same division, and each one would
-- round it slightly differently. The division happens once, on the way in
-- (labelToPer100g in lib/nutrition/packaged-foods.ts), and serving_size_g is kept so the
-- printed label can always be reconstructed and audited against the photo.
--
-- WHY prep_state IS NOT OPTIONAL. This is the single most expensive mistake this table can
-- prevent, and it has already happened once here in a different form: the resolver silently
-- rewrote "2 cups DRY brown rice" to the COOKED record and produced a 3x carb error, reported
-- as high confidence (see the nutrition pipeline notes). A pasta label is DRY weight. If a
-- caller logs 200 g of tri-color meaning what is on the plate, dry macros overstate it by
-- roughly 2.5x, because cooked pasta is mostly absorbed water. Making the state explicit and
-- NOT NULL means a caller has to have an opinion about which weight it holds.
--
-- WHAT THIS TABLE CANNOT DO: escape FDA label rounding. Values under 5 g round to the nearest
-- 0.5 g, calories above 50 to the nearest 10, so "200 calories, 1 g fat" per 56 g is really
-- 195-204 kcal and 0.75-1.25 g. Scaled to a 336 g box that is +/- 2.5% on energy. That is
-- better than a wrong-brand USDA record and worse than a lab assay, and callers averaging a
-- week should know it is a band, not a point. Recorded here rather than in a comment nobody
-- reads at the call site.
-- ---------------------------------------------------------------------------

create table if not exists packaged_foods (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,

  brand       text not null,
  product     text not null,
  -- The barcode when it was captured. This is the only truly stable identity a packaged
  -- good has: brands rename products and redesign boxes without changing the formulation,
  -- and reformulate without renaming. Nullable because a phone photo of the nutrition panel
  -- often does not include the barcode.
  upc         text,

  -- The label's own serving, kept verbatim so the panel can be reconstructed from the row
  -- and checked against the photo. serving_label is the printed household measure
  -- ("2 oz", "1/2 cup") which is what a person actually reads; serving_size_g is the gram
  -- figure in parentheses next to it, which is what arithmetic uses.
  serving_size_g         numeric(8, 2) not null
                         constraint packaged_foods_serving_positive check (serving_size_g > 0),
  serving_label          text,
  servings_per_container numeric(6, 2),
  -- Front-of-pack net weight. Not derivable from the two columns above: "about 5 servings"
  -- is itself a rounded number, so servings x serving_size can miss the true net weight by
  -- most of a serving. Needed whenever a whole container goes into one batch cook.
  net_weight_g           numeric(9, 2),

  -- Whether the numbers describe the food AS SOLD in the package, or some prepared state.
  -- Dry pasta and dry rice are the dangerous ones: their labels are dry weight and the food
  -- roughly triples in mass when cooked.
  prep_state  text not null default 'as_sold'
              constraint packaged_foods_prep_state_check
              check (prep_state in ('as_sold', 'dry', 'cooked', 'drained', 'prepared')),

  -- Canonical macros, per 100 g of the food in `prep_state`.
  calories_per_100g   numeric(7, 2) not null
                      constraint packaged_foods_calories_nonneg check (calories_per_100g >= 0),
  protein_per_100g    numeric(7, 2) not null,
  carbs_per_100g      numeric(7, 2) not null,
  fat_per_100g        numeric(7, 2) not null,
  fiber_per_100g      numeric(7, 2),
  sugar_per_100g      numeric(7, 2),
  sodium_mg_per_100g  numeric(9, 2),

  -- A USDA record whose numbers match this label closely enough to stand in when something
  -- downstream insists on an fdc_id. It is a PROXY, never an identity claim — 729736 is a
  -- Reggano record standing in for a Barilla box. Always explain the choice in `notes`; the
  -- recipe pin audit treats a written substitution as an accepted one.
  fdc_proxy_id  integer,

  -- Formulations change and labels get redesigned. A row is evidence about the package that
  -- was photographed on this date, not a permanent fact, so a staleness report can ask which
  -- entries deserve a fresh photo.
  label_photographed_on date not null default current_date,

  notes       text,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- One row per product. Without this the catalog develops the same disease the recipe pin
-- audit exists to catch: the same food entered twice, slightly differently, and two meals
-- priced off two different versions of one box. Case- and space-insensitive because the same
-- product gets typed "Barilla" and "barilla " on different days.
create unique index if not exists packaged_foods_user_product_idx
  on packaged_foods (user_id, lower(btrim(brand)), lower(btrim(product)));

-- The barcode is the stronger key when it was captured, so it gets its own guarantee.
create unique index if not exists packaged_foods_user_upc_idx
  on packaged_foods (user_id, upc)
  where upc is not null;

create index if not exists packaged_foods_user_brand_idx
  on packaged_foods (user_id, brand);

comment on table packaged_foods is
  'Label-verified macros for branded packaged goods, per 100 g. Authoritative over USDA '
  'Branded for these items: Branded is manufacturer-submitted, incomplete and stale, and '
  'was measurably wrong for both items this table was created with.';
comment on column packaged_foods.prep_state is
  'Which weight the label describes. Dry pasta/rice labels are DRY weight and the food '
  'roughly triples cooked, so treating one as cooked overstates macros ~2.5-3x.';
comment on column packaged_foods.fdc_proxy_id is
  'A numerically equivalent USDA record for downstream code that requires an fdc_id. A '
  'proxy, not an identity claim - explain every one in notes.';
comment on column packaged_foods.net_weight_g is
  'Front-of-pack net weight. Not servings x serving_size: "about 5 servings" is rounded.';
comment on column packaged_foods.label_photographed_on is
  'When the label was read. Formulations drift; an old row is a claim about an old package.';

alter table packaged_foods enable row level security;

drop policy if exists packaged_foods_owner_all on packaged_foods;
create policy packaged_foods_owner_all on packaged_foods
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
