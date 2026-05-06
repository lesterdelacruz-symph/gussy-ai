import type { GenerateVideosOperation } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";
import { SUPABASE_STORAGE_BUCKET } from "@/lib/supabase-config";
import { assertProjectOwner, getAuthenticatedUser } from "@/lib/supabase-server";
import { downloadVideo, getVideoOperation } from "@/lib/veo";

type VideoMetadata = Record<string, unknown> & {
  operationName?: string;
};

export async function GET(request: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  try {
    const { jobId } = await params;
    const { user, client } = await getAuthenticatedUser(request);
    const { data, error } = await client
      .from("generated_media")
      .select("id, project_id, status, public_url, storage_path, metadata, error")
      .eq("id", jobId)
      .eq("kind", "walkthrough_video")
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const row = data as {
      id: string;
      project_id: string;
      status: "pending" | "processing" | "succeeded" | "failed";
      public_url: string | null;
      storage_path: string;
      metadata: VideoMetadata | null;
      error: string | null;
    };

    await assertProjectOwner(row.project_id, user.id, client);

    if (row.status === "succeeded") {
      return NextResponse.json({ id: row.id, status: "succeeded", videoUrl: row.public_url ?? undefined });
    }

    if (row.status === "failed") {
      return NextResponse.json({ id: row.id, status: "failed", error: row.error ?? undefined });
    }

    const operationName = row.metadata?.operationName;
    if (!operationName) {
      const errorMessage = "Video operation name is missing.";
      await updateVideoFailure(client, row.id, errorMessage);
      return NextResponse.json({ id: row.id, status: "failed", error: errorMessage });
    }

    const operation = await getVideoOperation(operationName);
    if (!operation.done) {
      return NextResponse.json({ id: row.id, status: "processing" });
    }

    if (operation.error) {
      const errorMessage = videoOperationError(operation);
      await updateVideoFailure(client, row.id, errorMessage);
      return NextResponse.json({ id: row.id, status: "failed", error: errorMessage });
    }

    const video = await downloadVideo(operation);
    if (!video) {
      const errorMessage = "No video data returned.";
      await updateVideoFailure(client, row.id, errorMessage);
      return NextResponse.json({ id: row.id, status: "failed", error: errorMessage });
    }

    const { error: uploadError } = await client.storage.from(SUPABASE_STORAGE_BUCKET).upload(row.storage_path, video.bytes, {
      contentType: video.mimeType,
      upsert: true
    });
    if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`);

    const { data: publicData } = client.storage.from(SUPABASE_STORAGE_BUCKET).getPublicUrl(row.storage_path);
    const publicUrl = publicData.publicUrl;
    const metadata = {
      ...(row.metadata ?? {}),
      completedAt: new Date().toISOString()
    };
    const { error: updateError } = await client
      .from("generated_media")
      .update({
        status: "succeeded",
        public_url: publicUrl,
        mime_type: video.mimeType,
        metadata,
        error: null,
        updated_at: new Date().toISOString()
      })
      .eq("id", row.id);
    if (updateError) throw new Error(updateError.message);

    return NextResponse.json({ id: row.id, status: "succeeded", videoUrl: publicUrl });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to read video status" },
      { status: authStatus(error) }
    );
  }
}

async function updateVideoFailure(
  client: Awaited<ReturnType<typeof getAuthenticatedUser>>["client"],
  id: string,
  errorMessage: string
) {
  await client
    .from("generated_media")
    .update({
      status: "failed",
      error: errorMessage,
      updated_at: new Date().toISOString()
    })
    .eq("id", id);
}

function videoOperationError(operation: GenerateVideosOperation) {
  const message = operation.error?.message;
  return typeof message === "string" && message ? message : "Video generation failed.";
}

function authStatus(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return message.includes("Authentication") || message.includes("session") ? 401 : message.includes("Project not found") ? 404 : 500;
}
