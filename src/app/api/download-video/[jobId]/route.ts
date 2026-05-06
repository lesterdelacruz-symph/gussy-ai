import { NextRequest, NextResponse } from "next/server";
import { assertProjectOwner, getAuthenticatedUser } from "@/lib/supabase-server";

export async function GET(request: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  try {
    const { jobId } = await params;
    const { user, client } = await getAuthenticatedUser(request);
    const { data, error } = await client
      .from("generated_media")
      .select("id, project_id, status, public_url, mime_type, variation_index")
      .eq("id", jobId)
      .in("kind", ["video_clip", "walkthrough_video"])
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data || data.status !== "succeeded" || !data.public_url) {
      return NextResponse.json({ error: "Video not ready" }, { status: 404 });
    }

    const row = data as {
      project_id: string;
      public_url: string;
      mime_type: string | null;
      variation_index: number | null;
    };
    await assertProjectOwner(row.project_id, user.id, client);

    const videoResponse = await fetch(row.public_url);
    if (!videoResponse.ok) {
      return NextResponse.json({ error: "Video file could not be loaded" }, { status: 404 });
    }

    const bytes = Buffer.from(await videoResponse.arrayBuffer());
    const index = row.variation_index === null ? "" : `-${row.variation_index + 1}`;
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": row.mime_type ?? videoResponse.headers.get("content-type") ?? "video/mp4",
        "Content-Disposition": `attachment; filename="gussy-walkthrough${index}.mp4"`,
        "Content-Length": bytes.length.toString()
      }
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to download video" },
      { status: authStatus(error) }
    );
  }
}

function authStatus(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return message.includes("Authentication") || message.includes("session") ? 401 : message.includes("Project not found") ? 404 : 500;
}
