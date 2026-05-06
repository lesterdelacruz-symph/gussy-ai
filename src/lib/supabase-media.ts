import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_STORAGE_BUCKET } from "./supabase-config";
import { getSupabaseAdminClient } from "./supabase-server";
import { storagePathForMedia, type MediaKind, type MediaStatus } from "./supabase-project-store";

export async function uploadProjectMedia(input: {
  userId: string;
  projectId: string;
  mediaId: string;
  folder: "renders" | "videos" | "presentations";
  kind: MediaKind;
  status?: MediaStatus;
  bytes: Buffer;
  mimeType: string;
  prompt?: string | null;
  model?: string | null;
  variationIndex?: number | null;
  metadata?: Record<string, unknown>;
  error?: string | null;
  client?: SupabaseClient;
}) {
  const database = input.client ?? getSupabaseAdminClient();
  const storagePath = storagePathForMedia(input.userId, input.projectId, input.folder, input.mediaId, input.mimeType);
  const { error: uploadError } = await database.storage.from(SUPABASE_STORAGE_BUCKET).upload(storagePath, input.bytes, {
    contentType: input.mimeType,
    upsert: false
  });
  if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`);

  const { data } = database.storage.from(SUPABASE_STORAGE_BUCKET).getPublicUrl(storagePath);
  const publicUrl = data.publicUrl;

  const { error: insertError } = await database.from("generated_media").insert({
    id: input.mediaId,
    project_id: input.projectId,
    kind: input.kind,
    status: input.status ?? "succeeded",
    storage_bucket: SUPABASE_STORAGE_BUCKET,
    storage_path: storagePath,
    public_url: publicUrl,
    mime_type: input.mimeType,
    prompt: input.prompt ?? null,
    model: input.model ?? null,
    variation_index: input.variationIndex ?? null,
    metadata: input.metadata ?? {},
    error: input.error ?? null
  });
  if (insertError) throw new Error(`Generated media insert failed: ${insertError.message}`);

  return { storagePath, publicUrl };
}
