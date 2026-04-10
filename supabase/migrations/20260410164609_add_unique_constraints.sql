-- Add unique constraints needed for idempotent upserts

alter table habit_registry add constraint habit_registry_name_key unique (name);
