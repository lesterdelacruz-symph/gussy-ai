import type { SupabaseClient } from "@supabase/supabase-js";
import { listCatalogAssets } from "./catalog-assets";
import type { FurnitureAsset } from "./types";

export async function listDesignerCatalogAssets(client: SupabaseClient): Promise<FurnitureAsset[]> {
  const supabaseAssets = await listCatalogAssets(client);
  if (supabaseAssets.length >= 500) return supabaseAssets;

  const response = await fetch("/api/catalog-products");
  if (!response.ok) return supabaseAssets;

  const data = (await response.json()) as { assets?: FurnitureAsset[] };
  const firestoreAssets = data.assets ?? [];
  const merged = new Map<string, FurnitureAsset>();
  for (const asset of firestoreAssets) merged.set(asset.id, asset);
  for (const asset of supabaseAssets) merged.set(asset.id, asset);
  return [...merged.values()].sort((left, right) => left.name.localeCompare(right.name));
}
