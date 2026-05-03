import { NextRequest, NextResponse } from "next/server";
import { videoJobs } from "@/lib/video-jobs";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const job = videoJobs.get(jobId);
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  return NextResponse.json(job);
}
