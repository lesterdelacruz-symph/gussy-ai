import type { SupabaseClient } from "@supabase/supabase-js";
import type { FurnitureAsset } from "./types";

export interface UploadedAssetRow {
  id: string;
  owner_id: string;
  name: string;
  category: "uploads";
  public_url: string;
  mime_type: string | null;
  natural_width: number | null;
  natural_height: number | null;
  background_removed: boolean;
  created_at: string;
  updated_at: string;
}

export function uploadedAssetFromRow(row: UploadedAssetRow): FurnitureAsset {
  return {
    id: row.id,
    name: displayUploadedAssetName(row.name, row.id),
    category: "uploads",
    src: row.public_url,
    naturalWidth: row.natural_width ?? undefined,
    naturalHeight: row.natural_height ?? undefined,
    uploaded: true,
    backgroundRemoved: row.background_removed
  };
}

export function displayUploadedAssetName(name: string | null | undefined, id: string) {
  const trimmed = name?.trim();
  if (!trimmed || trimmed === id || /^upload_[0-9a-f-]{20,}$/i.test(trimmed)) return "Uploaded asset";
  return trimmed;
}

export async function listUploadedAssets(client: SupabaseClient): Promise<FurnitureAsset[]> {
  const { data, error } = await client
    .from("uploaded_assets")
    .select("id, owner_id, name, category, public_url, mime_type, natural_width, natural_height, background_removed, created_at, updated_at")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return ((data ?? []) as UploadedAssetRow[]).map(uploadedAssetFromRow);
}
