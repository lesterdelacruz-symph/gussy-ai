import { execFile } from "child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "fs";
import path from "path";
import os from "os";
import { promisify } from "util";
import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { uploadProjectMedia } from "@/lib/supabase-media";
import { assertProjectOwner, getAuthenticatedUser } from "@/lib/supabase-server";
import { videoJobs } from "@/lib/video-jobs";

const execFileAsync = promisify(execFile);

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { projectId?: string; jobIds?: string[] };
    if (!body.projectId || !body.jobIds || body.jobIds.length === 0) {
      return NextResponse.json({ error: "projectId and jobIds are required" }, { status: 400 });
    }

    const { user, client } = await getAuthenticatedUser(request);
    await assertProjectOwner(body.projectId, user.id, client);

    const videosDir = path.join(process.cwd(), "public", "videos");
    mkdirSync(videosDir, { recursive: true });

    const clipPaths = body.jobIds.map((jobId) => {
      const job = videoJobs.get(jobId);
      if (!job || job.status !== "succeeded" || !job.diskFilename) {
        throw new Error(`Video job is not ready: ${jobId}`);
      }
      const filePath = path.join(videosDir, job.diskFilename);
      if (!existsSync(filePath)) {
        throw new Error(`Missing video file: ${job.diskFilename}`);
      }
      return filePath;
    });

    const outputFilename = `${sanitize(body.projectId)}-walkthrough-final.mp4`;
    const outputPath = path.join(videosDir, outputFilename);
    const tempFiles: string[] = [];

    try {
      if (clipPaths.length === 1) {
        copyFileSync(clipPaths[0], outputPath);
      } else {
        const concatFile = path.join(os.tmpdir(), `gussy-concat-${Date.now()}.txt`);
        tempFiles.push(concatFile);
        writeFileSync(concatFile, clipPaths.map((clipPath) => `file '${escapeConcatPath(clipPath)}'`).join("\n"));
        await execFileAsync("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", concatFile, "-c", "copy", outputPath]);
      }
    } finally {
      for (const tempFile of tempFiles) {
        try {
          if (existsSync(tempFile)) unlinkSync(tempFile);
        } catch {
          // Ignore temp cleanup errors.
        }
      }
    }

    const mediaId = uuidv4();
    const { publicUrl } = await uploadProjectMedia({
      userId: user.id,
      projectId: body.projectId,
      mediaId,
      folder: "videos",
      kind: "walkthrough_video",
      bytes: readFileSync(outputPath),
      mimeType: "video/mp4",
      metadata: { jobIds: body.jobIds },
      client
    });

    return NextResponse.json({ url: publicUrl });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to stitch videos" },
      { status: authStatus(error) }
    );
  }
}

function sanitize(value: string) {
  return value.replace(/[^a-z0-9-]/gi, "-");
}

function escapeConcatPath(filePath: string) {
  return filePath.replace(/'/g, "'\\''");
}

function authStatus(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return message.includes("Authentication") || message.includes("session") ? 401 : message.includes("Project not found") ? 404 : 500;
}
