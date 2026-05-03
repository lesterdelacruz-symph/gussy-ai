import { describe, expect, it } from "vitest";
import { buildRenderPrompt } from "./prompt-builder";
import type { CanvasState, FurnitureAsset } from "./types";

const canvasState: CanvasState = {
  width: 1400,
  height: 900,
  background: "#f7f3ea",
  items: [
    {
      id: "item-1",
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
};

const furnitureAssets: FurnitureAsset[] = [
  {
    id: "seating_01_sofa_nobg",
    name: "Sofa",
    category: "seating",
    src: "/furniture/seating_01_sofa_nobg.png"
  }
];

function parseStructuredPayload(prompt: string) {
  const jsonStart = prompt.indexOf("{\n");
  if (jsonStart === -1) {
    throw new Error("Prompt does not contain structured JSON payload");
  }
  return JSON.parse(prompt.slice(jsonStart));
}

describe("buildRenderPrompt", () => {
  it("builds structured JSON instructions that preserve furniture identity and placement", () => {
    const prompt = buildRenderPrompt({
      projectId: "project-1",
      canvasState,
      furnitureAssets,
      style: "warm contemporary residence",
      variationIndex: 2
    });

    const payload = parseStructuredPayload(prompt);

    expect(payload.task).toBe("generate_realistic_interior_render");
    expect(payload.variation.index).toBe(2);
    expect(payload.integrityRules).toContain("Do not replace, redesign, recolor, retexture, or omit any furniture item.");
    expect(payload.furniture[0]).toMatchObject({
      assetId: "seating_01_sofa_nobg",
      name: "Sofa",
      category: "seating",
      placement: {
        x: 410,
        y: 390,
        width: 310,
        height: 180,
        rotation: 0,
        zIndex: 1
      }
    });
  });

  it("instructs Nano Banana to focus on plain walls and avoid windows", () => {
    const prompt = buildRenderPrompt({
      projectId: "project-1",
      canvasState,
      furnitureAssets,
      style: "warm contemporary residence",
      variationIndex: 1
    });

    const payload = parseStructuredPayload(prompt);

    expect(payload.roomEnvelope).toMatchObject({
      primaryFocus: "plain interior walls",
      wallTreatment: "simple uninterrupted walls with subtle realistic material and lighting"
    });
    expect(payload.roomEnvelope.mustNotInclude).toEqual(
      expect.arrayContaining(["windows", "window frames", "exterior views", "curtains", "blinds"])
    );
    expect(payload.output.exclude).toEqual(expect.arrayContaining(["windows", "window frames", "exterior views"]));
  });

  it("grounds seating on the floor plane so sofas do not float", () => {
    const prompt = buildRenderPrompt({
      projectId: "project-1",
      canvasState,
      furnitureAssets,
      style: "plain warm interior walls",
      variationIndex: 1
    });

    const payload = parseStructuredPayload(prompt);

    expect(payload.spatialGrounding).toMatchObject({
      roomPlane: "plain walls meeting a visible floor plane",
      noFloatingFurniture: true
    });
    expect(payload.furniture[0].grounding).toMatchObject({
      floorAnchored: true,
      support: "sofa base and legs physically touch the floor plane"
    });
    expect(payload.integrityRules).toEqual(
      expect.arrayContaining([
        "Never render seating, tables, rugs, storage pieces, or floor lamps floating; their bases must touch the floor plane.",
        "Add visible natural contact shadows directly under sofas, chair legs, table legs, rugs, storage bases, and floor-supported lighting."
      ])
    );
    expect(payload.output.exclude).toEqual(expect.arrayContaining(["floating sofas", "floating furniture"]));
  });

  it("requests showroom-grade photo realism instead of pasted PNG cutouts", () => {
    const prompt = buildRenderPrompt({
      projectId: "project-1",
      canvasState,
      furnitureAssets,
      style: "photo-realistic interior design showroom",
      variationIndex: 1
    });

    const payload = parseStructuredPayload(prompt);

    expect(payload.realism).toMatchObject({
      target: "photo-realistic interior design showroom photograph",
      composition: "single coherent photographed room, not a collage"
    });
    expect(payload.realism.assetIntegration).toContain("Use source furniture images as exact references");
    expect(payload.integrityRules).toEqual(
      expect.arrayContaining([
        "Use source furniture images as exact references, not pasted layers; re-render them as real photographed objects within one coherent room.",
        "Unify lighting direction, perspective, ambient occlusion, shadows, reflections, and material response across the entire scene."
      ])
    );
    expect(payload.output.exclude).toEqual(
      expect.arrayContaining(["pasted collage", "flat product cutouts", "sticker-like furniture", "alpha halos"])
    );
  });

  it("places a natural-language showroom brief before the structured JSON contract", () => {
    const prompt = buildRenderPrompt({
      projectId: "project-1",
      canvasState,
      furnitureAssets,
      style: "photo-realistic interior design showroom",
      variationIndex: 1
    });

    expect(prompt).toMatch(/^PHOTO-REALISTIC SHOWROOM BRIEF/);
    expect(prompt).toContain("finished interior design showroom photograph");
    expect(prompt).toContain("not a moodboard collage or pasted PNG composition");
    expect(prompt).toContain("Use the supplied furniture images as exact product references");
    expect(prompt).toContain("STRICT JSON CONSTRAINTS");
    expect(prompt.indexOf("PHOTO-REALISTIC SHOWROOM BRIEF")).toBeLessThan(prompt.indexOf("{\n"));
    expect(parseStructuredPayload(prompt).task).toBe("generate_realistic_interior_render");
  });
});
