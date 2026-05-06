import { NextRequest, NextResponse } from "next/server";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { uploadProjectMedia } from "@/lib/supabase-media";
import { assertProjectOwner, getAuthenticatedUser } from "@/lib/supabase-server";
import { buildWalkthroughVideoPrompt } from "@/lib/video-prompt-builder";
import { createVideoJob, updateVideoJob, videoStore } from "@/lib/video-jobs";
import { downloadVideo, pollUntilDone, startVideoGeneration } from "@/lib/veo";

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
    const job = createVideoJob({
      id: uuidv4(),
      projectId: body.projectId,
      index: 0
    });
    const jobs = [job];

    {
      const diskFilename = `${sanitize(body.projectId)}-walkthrough-${job.id}.mp4`;

      void (async () => {
        try {
          updateVideoJob(job.id, { status: "processing", diskFilename });
          const imageData = await readImageData(sourceImage, request.nextUrl.origin);
          const prompt = buildWalkthroughVideoPrompt({
            clipIndex: 1,
            clipCount: 1,
            basePrompt: body.prompt
          });
          const operation = await startVideoGeneration(prompt, imageData.base64, imageData.mimeType);
          updateVideoJob(job.id, { operationName: operation.name });
          const completedOperation = await pollUntilDone(operation);
          const video = await downloadVideo(completedOperation);

          if (!video) {
            updateVideoJob(job.id, { status: "failed", error: "No video data returned" });
            return;
          }

          saveVideoToDisk(diskFilename, video.bytes);
          const { publicUrl } = await uploadProjectMedia({
            userId: user.id,
            projectId: body.projectId!,
            mediaId: job.id,
            folder: "videos",
            kind: "walkthrough_video",
            bytes: video.bytes,
            mimeType: video.mimeType,
            prompt,
            metadata: {
              sourceRenderId: sourceImage.id,
              selectedRenderCount: body.images!.length,
              durationSeconds: 8,
              walkthroughMode: "single_continuous_clip"
            },
            client
          });
          videoStore.set(job.id, { bytes: video.bytes, mimeType: video.mimeType });
          updateVideoJob(job.id, {
            status: "succeeded",
            videoUrl: publicUrl,
            diskFilename
          });
        } catch (error) {
          updateVideoJob(job.id, {
            status: "failed",
            error: error instanceof Error ? error.message : "Video generation failed"
          });
        }
      })();
    }

    return NextResponse.json({ jobs });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to start video generation" },
      { status: authStatus(error) }
    );
  }
}

function saveVideoToDisk(filename: string, bytes: Buffer) {
  const videosDir = path.join(process.cwd(), "public", "videos");
  mkdirSync(videosDir, { recursive: true });
  writeFileSync(path.join(videosDir, filename), bytes);
}

function sanitize(value: string) {
  return value.replace(/[^a-z0-9-]/gi, "-");
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
