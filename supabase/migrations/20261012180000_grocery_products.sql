-- Grocery product pins (#4, Phase 1): an ingredient identity -> one Amazon Fresh product.
--
-- The same rule as fdc_id pins: NO NAME MATCHING. A product is found from a recipe line by
-- identity only: packaged_food_id first, then fdc_id. "Mother-in-Law's Kimchi, House Napa
-- Cabbage" is the 7/29 order's proof that a name match buys the wrong food. A line whose
-- identity has no pin is reported as needing one, never guessed.
--
-- pack_grams is read off the listing ("14 oz" -> 396.9), never derived. Null is allowed for
-- count-sold produce (a head of cabbage): the list then buys 1 and says the weight is unknown.

create table if not exists public.grocery_products (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  asin             text not null check (asin ~ '^[A-Z0-9]{10}$'),
  title            text not null,
  pack_grams       numeric(10,2) check (pack_grams > 0),
  price_cents      integer check (price_cents >= 0),
  price_seen_at    timestamptz,
  fresh            boolean not null default true,
  fdc_id           integer,
  packaged_food_id uuid references public.packaged_foods(id) on delete set null,
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint grocery_products_has_identity check (fdc_id is not null or packaged_food_id is not null),
  constraint grocery_products_user_asin_unique unique (user_id, asin)
);

-- One pin per identity: re-pinning a food replaces its product, it never adds a rival.
create unique index if not exists grocery_products_user_fdc_idx
  on public.grocery_products (user_id, fdc_id) where fdc_id is not null;
create unique index if not exists grocery_products_user_label_idx
  on public.grocery_products (user_id, packaged_food_id) where packaged_food_id is not null;

alter table public.grocery_products enable row level security;

drop policy if exists "users manage own grocery products" on public.grocery_products;
create policy "users manage own grocery products" on public.grocery_products
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on public.grocery_products from anon, authenticated;
grant select, insert, update, delete on public.grocery_products to authenticated;

drop trigger if exists trg_grocery_products_updated_at on public.grocery_products;
create trigger trg_grocery_products_updated_at
  before update on public.grocery_products
  for each row execute function set_updated_at();
