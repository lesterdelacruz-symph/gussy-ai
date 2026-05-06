import { execFile } from "child_process";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "fs";
import os from "os";
import path from "path";
import { promisify } from "util";
import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { uploadProjectMedia } from "@/lib/supabase-media";
import { assertProjectOwner, getAuthenticatedUser } from "@/lib/supabase-server";

const execFileAsync = promisify(execFile);

interface VideoMediaRow {
  id: string;
  project_id: string;
  kind: "video_clip" | "walkthrough_video";
  status: "pending" | "processing" | "succeeded" | "failed";
  public_url: string | null;
  mime_type: string | null;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { projectId?: string; jobIds?: string[] };
    if (!body.projectId || !body.jobIds || body.jobIds.length === 0) {
      return NextResponse.json({ error: "projectId and jobIds are required" }, { status: 400 });
    }

    const { user, client } = await getAuthenticatedUser(request);
    await assertProjectOwner(body.projectId, user.id, client);

    const { data, error } = await client
      .from("generated_media")
      .select("id, project_id, kind, status, public_url, mime_type")
      .eq("project_id", body.projectId)
      .in("id", body.jobIds)
      .in("kind", ["video_clip", "walkthrough_video"]);
    if (error) throw new Error(error.message);

    const rowsById = new Map((data ?? []).map((row) => [row.id, row as VideoMediaRow]));
    const videos = body.jobIds.map((jobId) => {
      const row = rowsById.get(jobId);
      if (!row || row.status !== "succeeded" || !row.public_url) {
        throw new Error(`Video job is not ready: ${jobId}`);
      }
      return row;
    });

    if (videos.length === 1) {
      return NextResponse.json({ url: videos[0].public_url });
    }

    const outputPath = path.join(os.tmpdir(), `${sanitize(body.projectId)}-${uuidv4()}-walkthrough-final.mp4`);
    const tempFiles: string[] = [];

    try {
      const clipPaths = await Promise.all(
        videos.map(async (video, index) => {
          const clipPath = path.join(os.tmpdir(), `gussy-clip-${uuidv4()}-${index}.mp4`);
          tempFiles.push(clipPath);
          const response = await fetch(video.public_url!);
          if (!response.ok) throw new Error(`Video file could not be loaded: ${video.id}`);
          writeFileSync(clipPath, Buffer.from(await response.arrayBuffer()));
          return clipPath;
        })
      );

      const concatFile = path.join(os.tmpdir(), `gussy-concat-${uuidv4()}.txt`);
      tempFiles.push(concatFile);
      writeFileSync(concatFile, clipPaths.map((clipPath) => `file '${escapeConcatPath(clipPath)}'`).join("\n"));
      await execFileAsync("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", concatFile, "-c", "copy", outputPath]);

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
    } finally {
      for (const tempFile of [...tempFiles, outputPath]) {
        try {
          if (existsSync(tempFile)) unlinkSync(tempFile);
        } catch {
          // Ignore temp cleanup errors.
        }
      }
    }
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
