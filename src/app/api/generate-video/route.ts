import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { SUPABASE_STORAGE_BUCKET } from "@/lib/supabase-config";
import { storagePathForMedia } from "@/lib/supabase-project-store";
import { assertProjectOwner, getAuthenticatedUser } from "@/lib/supabase-server";
import { buildWalkthroughVideoPrompt } from "@/lib/video-prompt-builder";
import { startVideoGeneration } from "@/lib/veo";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      projectId?: string;
      images?: Array<{ id: string; base64?: string; mimeType?: string; url?: string }>;
      prompt?: string;
    };

    if (!body.projectId || !body.images || body.images.length === 0) {
      return NextResponse.json({ error: "projectId and images are required" }, { status: 400 });
    }

    const { user, client } = await getAuthenticatedUser(request);
    await assertProjectOwner(body.projectId, user.id, client);

    const sourceImage = body.images[0];
    const imageData = await readImageData(sourceImage, request.nextUrl.origin);
    const prompt = buildWalkthroughVideoPrompt({
      clipIndex: 1,
      clipCount: 1,
      basePrompt: body.prompt
    });
    const operation = await startVideoGeneration(prompt, imageData.base64, imageData.mimeType);
    if (!operation.name) throw new Error("Video operation did not return an operation name.");

    const jobId = uuidv4();
    const storagePath = storagePathForMedia(user.id, body.projectId, "videos", jobId, "video/mp4");
    const { error: insertError } = await client.from("generated_media").insert({
      id: jobId,
      project_id: body.projectId,
      kind: "walkthrough_video",
      status: "processing",
      storage_bucket: SUPABASE_STORAGE_BUCKET,
      storage_path: storagePath,
      public_url: "",
      mime_type: "video/mp4",
      prompt,
      model: "veo-3.1-generate-preview",
      metadata: {
        operationName: operation.name,
        sourceRenderId: sourceImage.id,
        selectedRenderCount: body.images.length,
        durationSeconds: 8,
        walkthroughMode: "single_continuous_clip"
      }
    });
    if (insertError) throw new Error(insertError.message);

    const jobs = [{ id: jobId, status: "processing" as const }];

    return NextResponse.json({ jobs });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to start video generation" },
      { status: authStatus(error) }
    );
  }
}

async function readImageData(image: { base64?: string; mimeType?: string; url?: string }, origin: string) {
  if (image.base64) {
    return {
      base64: image.base64,
      mimeType: image.mimeType || "image/png"
    };
  }

  if (!image.url?.startsWith("/generated/")) {
    if (!image.url) {
      throw new Error("Generated image URL is required for video generation.");
    }
    const response = await fetch(image.url.startsWith("/") ? new URL(image.url, origin) : image.url);
    if (!response.ok) {
      throw new Error("Generated image could not be loaded for video generation.");
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    return {
      base64: bytes.toString("base64"),
      mimeType: response.headers.get("content-type") ?? image.mimeType ?? "image/png"
    };
  }

  const fileName = path.basename(image.url.split("?")[0]);
  const filePath = path.join(process.cwd(), "public", "generated", fileName);
  const mimeType = fileName.endsWith(".png") ? "image/png" : "image/jpeg";

  return {
    base64: readFileSync(filePath).toString("base64"),
    mimeType
  };
}

function authStatus(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return message.includes("Authentication") || message.includes("session") ? 401 : message.includes("Project not found") ? 404 : 500;
}
