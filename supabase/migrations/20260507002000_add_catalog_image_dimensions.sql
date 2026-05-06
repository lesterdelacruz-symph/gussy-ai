alter table public.catalog_items
  add column if not exists image_width int,
  add column if not exists image_height int;

create index if not exists catalog_items_image_dimensions_idx
  on public.catalog_items (image_width, image_height)
  where public_url is not null;
