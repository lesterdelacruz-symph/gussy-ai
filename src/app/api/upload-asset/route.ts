import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getImageDimensions } from "@/lib/background-removal";
import { SUPABASE_STORAGE_BUCKET } from "@/lib/supabase-config";
import { getAuthenticatedUser } from "@/lib/supabase-server";
import { uploadedAssetFromRow, type UploadedAssetRow } from "@/lib/uploaded-assets";

export async function POST(request: NextRequest) {
  try {
    const { user, client } = await getAuthenticatedUser(request);
    const form = await request.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Image file is required." }, { status: 400 });
    }
    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "Upload an image file." }, { status: 400 });
    }

    const originalBytes = Buffer.from(await file.arrayBuffer());
    const dimensions = getImageDimensions(originalBytes, file.type);
    const id = `upload_${uuidv4()}`;
    const name = cleanAssetName(String(form.get("name") || file.name || "Uploaded asset"));
    const storagePath = `${user.id}/uploads/${id}.${extensionForMime(file.type)}`;

    const { error: uploadError } = await client.storage.from(SUPABASE_STORAGE_BUCKET).upload(storagePath, originalBytes, {
      contentType: file.type,
      upsert: false
    });
    if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`);

    const { data: publicData } = client.storage.from(SUPABASE_STORAGE_BUCKET).getPublicUrl(storagePath);
    const publicUrl = publicData.publicUrl;
    const { data, error } = await client
      .from("uploaded_assets")
      .insert({
        id,
        owner_id: user.id,
        name,
        category: "uploads",
        storage_bucket: SUPABASE_STORAGE_BUCKET,
        storage_path: storagePath,
        public_url: publicUrl,
        mime_type: file.type,
        natural_width: dimensions?.width ?? null,
        natural_height: dimensions?.height ?? null,
        background_removed: false
      })
      .select("id, owner_id, name, category, public_url, mime_type, natural_width, natural_height, background_removed, created_at, updated_at")
      .single();

    if (error) throw new Error(`Uploaded asset insert failed: ${error.message}`);
    return NextResponse.json({ asset: uploadedAssetFromRow(data as UploadedAssetRow) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to upload asset." },
      { status: authStatus(error) }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { user, client } = await getAuthenticatedUser(request);
    const assetId = request.nextUrl.searchParams.get("assetId");
    if (!assetId) {
      return NextResponse.json({ error: "assetId is required." }, { status: 400 });
    }

    const { data, error: selectError } = await client
      .from("uploaded_assets")
      .select("id, owner_id, storage_path")
      .eq("id", assetId)
      .eq("owner_id", user.id)
      .maybeSingle();
    if (selectError) throw new Error(selectError.message);
    if (!data) {
      return NextResponse.json({ error: "Uploaded asset not found." }, { status: 404 });
    }

    const row = data as { id: string; storage_path: string | null };
    const { error: deleteError } = await client.from("uploaded_assets").delete().eq("id", row.id).eq("owner_id", user.id);
    if (deleteError) throw new Error(deleteError.message);

    if (row.storage_path) {
      await client.storage.from(SUPABASE_STORAGE_BUCKET).remove([row.storage_path]);
      if (row.storage_path.endsWith("-nobg.png")) {
        await client.storage.from(SUPABASE_STORAGE_BUCKET).remove([row.storage_path.replace(/-nobg\.png$/, ".png")]);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete uploaded asset." },
      { status: authStatus(error) }
    );
  }
}

function cleanAssetName(value: string) {
  const withoutExtension = value.replace(/\.[a-z0-9]+$/i, "");
  return withoutExtension.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim() || "Uploaded asset";
}

function extensionForMime(mimeType: string) {
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("webp")) return "webp";
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "jpg";
  return "png";
}

function authStatus(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return message.includes("Authentication") || message.includes("session") ? 401 : 500;
}
