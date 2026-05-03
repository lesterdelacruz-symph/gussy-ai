import { NextRequest, NextResponse } from "next/server";
import { videoJobs, videoStore } from "@/lib/video-jobs";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const job = videoJobs.get(jobId);
  if (!job || job.status !== "succeeded") {
    return NextResponse.json({ error: "Video not ready" }, { status: 404 });
  }

  const video = videoStore.get(jobId);
  if (!video) {
    return NextResponse.json({ error: "Video data not found" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(video.bytes), {
    headers: {
      "Content-Type": video.mimeType,
      "Content-Disposition": `attachment; filename="gussy-walkthrough-${job.index + 1}.mp4"`,
      "Content-Length": video.bytes.length.toString()
    }
  });
}
