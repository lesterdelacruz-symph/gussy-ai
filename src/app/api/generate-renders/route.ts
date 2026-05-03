import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { generateInteriorRender } from "@/lib/image-generation";
import { uploadProjectMedia } from "@/lib/supabase-media";
import { SUPABASE_STORAGE_BUCKET } from "@/lib/supabase-config";
import { mediaToGeneratedRenders, type SupabaseGeneratedMediaRow } from "@/lib/supabase-project-store";
import { assertProjectOwner, getAuthenticatedUser } from "@/lib/supabase-server";
import type { CanvasState, FurnitureAsset, GeneratedRender, ImageReference } from "@/lib/types";

export async function GET(request: NextRequest) {
  try {
    const projectId = request.nextUrl.searchParams.get("projectId");
    if (!projectId) {
      return NextResponse.json({ error: "projectId is required" }, { status: 400 });
    }

    const { user, client } = await getAuthenticatedUser(request);
    await assertProjectOwner(projectId, user.id, client);
    const { data, error } = await client
      .from("generated_media")
      .select("id, kind, status, public_url, mime_type, prompt, model, variation_index, created_at, error")
      .eq("project_id", projectId)
      .eq("kind", "render_image")
      .order("variation_index", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) throw new Error(error.message);
    const images = mediaToGeneratedRenders((data ?? []) as SupabaseGeneratedMediaRow[]);
    return NextResponse.json({ images });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load generated renders" },
      { status: authStatus(error) }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      projectId?: string;
      canvasImage?: string;
      canvasState?: CanvasState;
      furnitureAssets?: FurnitureAsset[];
      style?: string;
      variationIndex?: number;
      variationCount?: number;
      orientationReference?: ImageReference;
      replaceExisting?: boolean;
    };

    if (!body.projectId || !body.canvasImage || !body.canvasState) {
      return NextResponse.json({ error: "projectId, canvasImage, and canvasState are required" }, { status: 400 });
    }

    const { user, client } = await getAuthenticatedUser(request);
    await assertProjectOwner(body.projectId, user.id, client);

    if (!body.canvasState.items || body.canvasState.items.length === 0) {
      return NextResponse.json({ error: "Canvas must contain at least one furniture item" }, { status: 400 });
    }

    const variationIndexes =
      typeof body.variationIndex === "number" && body.variationIndex >= 1
        ? [body.variationIndex]
        : Array.from({ length: body.variationCount ?? 4 }, (_, index) => index + 1);

    if (body.replaceExisting) {
      await deleteExistingProjectRenders(client, body.projectId);
    }

    const images: GeneratedRender[] = [];
    for (const index of variationIndexes) {
      const result = await generateInteriorRender({
        projectId: body.projectId,
        canvasImage: body.canvasImage,
        canvasState: body.canvasState,
        furnitureAssets: body.furnitureAssets ?? [],
        style: body.style ?? "",
        variationIndex: index,
        orientationReference: body.orientationReference
      });

      const id = uuidv4();
      const { publicUrl } = await uploadProjectMedia({
        userId: user.id,
        projectId: body.projectId,
        mediaId: id,
        folder: "renders",
        kind: "render_image",
        bytes: Buffer.from(result.base64, "base64"),
        mimeType: result.mimeType,
        prompt: result.prompt,
        model: result.model,
        variationIndex: index,
        client
      });
      images.push({
        id,
        url: publicUrl,
        mimeType: result.mimeType,
        prompt: result.prompt,
        selected: true,
        createdAt: new Date().toISOString()
      });
    }

    return NextResponse.json({ images });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate renders" },
      { status: authStatus(error) }
    );
  }
}

async function deleteExistingProjectRenders(client: Awaited<ReturnType<typeof getAuthenticatedUser>>["client"], projectId: string) {
  const { data, error: selectError } = await client
    .from("generated_media")
    .select("id, storage_path")
    .eq("project_id", projectId)
    .eq("kind", "render_image");
  if (selectError) throw new Error(selectError.message);

  const rows = (data ?? []) as Array<{ id: string; storage_path: string | null }>;
  if (rows.length === 0) return;

  const { error: deleteError } = await client
    .from("generated_media")
    .delete()
    .eq("project_id", projectId)
    .eq("kind", "render_image");
  if (deleteError) throw new Error(deleteError.message);

  const storagePaths = rows.map((row) => row.storage_path).filter((value): value is string => Boolean(value));
  if (storagePaths.length > 0) {
    await client.storage.from(SUPABASE_STORAGE_BUCKET).remove(storagePaths);
  }
}

function authStatus(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return message.includes("Authentication") || message.includes("session") ? 401 : message.includes("Project not found") ? 404 : 500;
}
