import { NextRequest, NextResponse } from "next/server";
import { getImageDimensions, removeImageBackground } from "@/lib/background-removal";
import { SUPABASE_STORAGE_BUCKET } from "@/lib/supabase-config";
import { getAuthenticatedUser } from "@/lib/supabase-server";
import { uploadedAssetFromRow, type UploadedAssetRow } from "@/lib/uploaded-assets";

export async function POST(request: NextRequest) {
  try {
    const { user, client } = await getAuthenticatedUser(request);
    const body = (await request.json()) as { assetId?: string };
    if (!body.assetId) {
      return NextResponse.json({ error: "assetId is required." }, { status: 400 });
    }

    const { data: row, error: selectError } = await client
      .from("uploaded_assets")
      .select("id, owner_id, name, category, storage_path, public_url, mime_type, natural_width, natural_height, background_removed, created_at, updated_at")
      .eq("id", body.assetId)
      .eq("owner_id", user.id)
      .maybeSingle();
    if (selectError) throw new Error(selectError.message);
    if (!row) {
      return NextResponse.json({ error: "Uploaded asset not found." }, { status: 404 });
    }

    const source = row as UploadedAssetRow & { storage_path: string | null };
    const imageResponse = await fetch(source.public_url);
    if (!imageResponse.ok) {
      throw new Error("Uploaded image could not be loaded for background removal.");
    }
    const sourceMimeType = imageResponse.headers.get("content-type") ?? source.mime_type ?? "image/png";
    const sourceBytes = Buffer.from(await imageResponse.arrayBuffer());
    const file = new File([sourceBytes], `${source.id}.${extensionForMime(sourceMimeType)}`, { type: sourceMimeType });
    const processed = await removeImageBackground(file);
    const dimensions = getImageDimensions(processed.bytes, processed.mimeType);
    const storagePath = `${user.id}/uploads/${source.id}-nobg.png`;

    const { error: uploadError } = await client.storage.from(SUPABASE_STORAGE_BUCKET).upload(storagePath, processed.bytes, {
      contentType: processed.mimeType,
      upsert: true
    });
    if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`);

    const { data: publicData } = client.storage.from(SUPABASE_STORAGE_BUCKET).getPublicUrl(storagePath);
    const publicUrl = publicData.publicUrl;
    const { data, error: updateError } = await client
      .from("uploaded_assets")
      .update({
        storage_path: storagePath,
        public_url: publicUrl,
        mime_type: processed.mimeType,
        natural_width: dimensions?.width ?? source.natural_width,
        natural_height: dimensions?.height ?? source.natural_height,
        background_removed: true,
        updated_at: new Date().toISOString()
      })
      .eq("id", source.id)
      .eq("owner_id", user.id)
      .select("id, owner_id, name, category, public_url, mime_type, natural_width, natural_height, background_removed, created_at, updated_at")
      .single();
    if (updateError) throw new Error(`Uploaded asset update failed: ${updateError.message}`);

    if (source.storage_path && source.storage_path !== storagePath) {
      await client.storage.from(SUPABASE_STORAGE_BUCKET).remove([source.storage_path]);
    }

    return NextResponse.json({ asset: uploadedAssetFromRow(data as UploadedAssetRow) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to remove background." },
      { status: authStatus(error) }
    );
  }
}

function extensionForMime(mimeType: string) {
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("webp")) return "webp";
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "jpg";
  return "png";
}

function authStatus(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return message.includes("Authentication") || message.includes("session")
    ? 401
    : message.includes("not found")
      ? 404
      : 500;
}
