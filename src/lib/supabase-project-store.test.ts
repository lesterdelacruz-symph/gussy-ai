import { describe, expect, it } from "vitest";
import {
  diffCanvasRowsForSave,
  mediaToGeneratedRenders,
  mediaToVideoState,
  projectFromSupabaseRows,
  projectSummaryFromRow,
  projectToSupabaseRows,
  storagePathForMedia
} from "./supabase-project-store";
import type { MoodboardProject } from "./types";

const project: MoodboardProject = {
  id: "4a81a3e5-ad76-45f2-a08f-575ef5609bb9",
  name: "Showroom Draft",
  createdAt: "2026-05-02T08:00:00.000Z",
  updatedAt: "2026-05-02T09:00:00.000Z",
  budgetAmount: 250000,
  budgetCurrency: "PHP",
  canvas: {
    width: 1400,
    height: 900,
    background: "#fff7f4",
    items: [
      {
        id: "9de704c3-13ba-41cc-995e-3c5ea7d45821",
        assetId: "seating_01_sofa_nobg",
        x: 410,
        y: 390,
        width: 310,
        height: 180,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        zIndex: 1
      }
    ]
  },
  renders: [
    {
      id: "render-1",
      url: "https://example.supabase.co/storage/v1/object/public/project-media/user/project/renders/render-1.png",
      mimeType: "image/png",
      prompt: "prompt",
      selected: true,
      createdAt: "2026-05-02T09:01:00.000Z"
    }
  ],
  videoJobs: [{ id: "clip-1", status: "succeeded", videoUrl: "https://example.com/clip.mp4" }],
  stitchedVideoUrl: "https://example.com/final.mp4",
  presentationUrl: "https://example.com/presentation.pdf"
};

describe("supabase project store mapping", () => {
  it("maps an app project into project and canvas rows with exact placement coordinates", () => {
    const rows = projectToSupabaseRows(project, "user-1");

    expect(rows.projectRow).toMatchObject({
      id: project.id,
      owner_id: "user-1",
      name: "Showroom Draft",
      canvas_width: 1400,
      canvas_height: 900,
      canvas_background: "#fff7f4",
      budget_amount: 250000,
      budget_currency: "PHP"
    });
    expect(rows.canvasRows).toEqual([
      {
        id: "9de704c3-13ba-41cc-995e-3c5ea7d45821",
        project_id: project.id,
        asset_id: "seating_01_sofa_nobg",
        x: 410,
        y: 390,
        width: 310,
        height: 180,
        rotation: 0,
        scale_x: 1,
        scale_y: 1,
        z_index: 1
      }
    ]);
  });

  it("maps project, canvas, and media rows back into the app project shape", () => {
    const mapped = projectFromSupabaseRows({
      id: project.id,
      owner_id: "user-1",
      name: "Showroom Draft",
      canvas_width: 1400,
      canvas_height: 900,
      canvas_background: "#fff7f4",
      status: "draft",
      budget_amount: "250000.00",
      budget_currency: "PHP",
      created_at: "2026-05-02T08:00:00.000Z",
      updated_at: "2026-05-02T09:00:00.000Z",
      canvas_items: [
        {
          id: "item-2",
          project_id: project.id,
          asset_id: "tables_02_coffee_nobg",
          x: 100,
          y: 200,
          width: 180,
          height: 90,
          rotation: 10,
          scale_x: 1.2,
          scale_y: 0.8,
          z_index: 2
        },
        {
          id: "item-1",
          project_id: project.id,
          asset_id: "seating_01_sofa_nobg",
          x: 410,
          y: 390,
          width: 310,
          height: 180,
          rotation: 0,
          scale_x: 1,
          scale_y: 1,
          z_index: 1
        }
      ],
      generated_media: [
        {
          id: "render-1",
          kind: "render_image",
          status: "succeeded",
          public_url: "https://example.com/render.png",
          mime_type: "image/png",
          prompt: "prompt",
          model: "gemini",
          variation_index: 1,
          metadata: { angleLabel: "Front showroom wide" },
          created_at: "2026-05-02T09:01:00.000Z",
          error: null
        },
        {
          id: "final-1",
          kind: "walkthrough_video",
          status: "succeeded",
          public_url: "https://example.com/final.mp4",
          mime_type: "video/mp4",
          prompt: null,
          model: null,
          variation_index: null,
          metadata: null,
          created_at: "2026-05-02T09:03:00.000Z",
          error: null
        },
        {
          id: "pdf-1",
          kind: "presentation_pdf",
          status: "succeeded",
          public_url: "https://example.com/presentation.pdf",
          mime_type: "application/pdf",
          prompt: null,
          model: null,
          variation_index: null,
          metadata: null,
          created_at: "2026-05-02T09:04:00.000Z",
          error: null
        }
      ]
    });

    expect(mapped.canvas.items.map((item) => item.id)).toEqual(["item-1", "item-2"]);
    expect(mapped.canvas.items[0]).toMatchObject({ x: 410, y: 390, zIndex: 1 });
    expect(mapped.renders).toHaveLength(1);
    expect(mapped.renders[0]).toMatchObject({
      id: "render-1",
      url: "https://example.com/render.png",
      selected: true,
      angleLabel: "Front showroom wide"
    });
    expect(mapped.budgetAmount).toBe(250000);
    expect(mapped.stitchedVideoUrl).toBe("https://example.com/final.mp4");
    expect(mapped.presentationUrl).toBe("https://example.com/presentation.pdf");
  });

  it("maps project summaries, media subsets, and storage paths", () => {
    expect(
      projectSummaryFromRow({
        id: project.id,
        name: "Showroom Draft",
        created_at: "2026-05-02T08:00:00.000Z",
        updated_at: "2026-05-02T09:00:00.000Z",
        canvas_items: [{ id: "item-1" }, { id: "item-2" }]
      })
    ).toEqual({
      id: project.id,
      name: "Showroom Draft",
      createdAt: "2026-05-02T08:00:00.000Z",
      updatedAt: "2026-05-02T09:00:00.000Z",
      itemCount: 2
    });

    const media = [
      {
        id: "clip-1",
        kind: "video_clip" as const,
        status: "processing" as const,
        public_url: "",
        mime_type: "video/mp4",
        prompt: null,
        model: null,
        variation_index: null,
        metadata: null,
        created_at: "2026-05-02T09:02:00.000Z",
        error: null
      }
    ];

    expect(mediaToGeneratedRenders(media)).toEqual([]);
    expect(mediaToVideoState(media).videoJobs).toEqual([{ id: "clip-1", status: "processing", videoUrl: "", error: undefined }]);
    expect(storagePathForMedia("user-1", project.id, "renders", "render-1", "image/png")).toBe(
      `user-1/${project.id}/renders/render-1.png`
    );
    expect(storagePathForMedia("user-1", project.id, "presentations", "pdf-1", "application/pdf")).toBe(
      `user-1/${project.id}/presentations/pdf-1.pdf`
    );
  });

  it("diffs canvas saves so furniture moves do not rewrite unchanged rows", () => {
    const movedProject: MoodboardProject = {
      ...project,
      canvas: {
        ...project.canvas,
        items: [
          { ...project.canvas.items[0], x: 520, y: 430 },
          {
            id: "c8ec07bd-f88b-49ab-851d-2e198947515e",
            assetId: "decor_01_plant_nobg",
            x: 80,
            y: 220,
            width: 120,
            height: 190,
            rotation: 0,
            scaleX: 1,
            scaleY: 1,
            zIndex: 2
          }
        ]
      }
    };

    const diff = diffCanvasRowsForSave(movedProject, project);

    expect(diff.deleteIds).toEqual([]);
    expect(diff.upsertRows.map((row) => row.id)).toEqual([
      "9de704c3-13ba-41cc-995e-3c5ea7d45821",
      "c8ec07bd-f88b-49ab-851d-2e198947515e"
    ]);
    expect(diff.upsertRows[0]).toMatchObject({ x: 520, y: 430 });
  });

  it("diffs removed canvas items without touching retained furniture", () => {
    const emptiedProject: MoodboardProject = {
      ...project,
      canvas: {
        ...project.canvas,
        items: []
      }
    };

    const diff = diffCanvasRowsForSave(emptiedProject, project);

    expect(diff.upsertRows).toEqual([]);
    expect(diff.deleteIds).toEqual(["9de704c3-13ba-41cc-995e-3c5ea7d45821"]);
  });
});
