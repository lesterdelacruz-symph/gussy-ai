import type { CanvasState, FurnitureAsset } from "./types";

const FLOOR_SUPPORTED_CATEGORIES = new Set(["seating", "tables", "rugs", "storage"]);

export function buildRenderPrompt(_input: {
  projectId: string;
  canvasState: CanvasState;
  furnitureAssets: FurnitureAsset[];
  style: string;
  variationIndex: number;
}): string {
  const payload = buildRenderPromptPayload(_input);

  return [
    "PHOTO-REALISTIC SHOWROOM BRIEF",
    "Create a finished interior design showroom photograph, not a moodboard collage or pasted PNG composition.",
    "Use the supplied moodboard canvas only as the layout source of truth: preserve the furniture arrangement, relative scale, layer order, and position relationships.",
    "Use the supplied furniture images as exact product references for silhouette, color, texture, material, and proportions, then re-render them as real photographed furniture in one coherent interior scene.",
    "Render plain warm interior walls meeting a visible floor plane. Do not add windows, exterior views, curtains, doors, wall art, or busy architectural features.",
    "Unify all objects under one camera, one lens perspective, one lighting direction, natural bounce light, ambient occlusion, contact shadows, and believable material response.",
    "The final result should look like an interior design showroom portfolio image or furniture catalog photograph.",
    "",
    "STRICT JSON CONSTRAINTS",
    JSON.stringify(payload, null, 2)
  ].join("\n");
}

function buildRenderPromptPayload(_input: {
  projectId: string;
  canvasState: CanvasState;
  furnitureAssets: FurnitureAsset[];
  style: string;
  variationIndex: number;
}) {
  const assetMap = new Map(_input.furnitureAssets.map((asset) => [asset.id, asset]));
  const furniture = _input.canvasState.items
    .slice()
    .sort((a, b) => a.zIndex - b.zIndex)
    .map((item) => {
      const asset = assetMap.get(item.assetId);
      return {
        itemId: item.id,
        assetId: item.assetId,
        name: asset?.name ?? item.assetId,
        category: asset?.category ?? "unknown",
        sourceImage: asset?.src ?? null,
        placement: {
          x: item.x,
          y: item.y,
          width: item.width,
          height: item.height,
          rotation: item.rotation,
          scaleX: item.scaleX,
          scaleY: item.scaleY,
          zIndex: item.zIndex
        },
        grounding: buildGroundingInstruction(asset, item.assetId)
      };
    });

  return {
    task: "generate_realistic_interior_render",
    projectId: _input.projectId,
    style: _input.style || "realistic high-end interior design presentation",
    variation: {
      index: _input.variationIndex,
      count: 4,
      cameraPlan: cameraPlanForVariation(_input.variationIndex),
      cameraInstruction:
        "Create a distinct photo-realistic showroom angle while preserving the same room orientation family, furniture identities, material palette, lighting family, and relative arrangement."
    },
    canvas: {
      width: _input.canvasState.width,
      height: _input.canvasState.height,
      background: _input.canvasState.background
    },
    roomEnvelope: {
      primaryFocus: "plain interior walls",
      wallTreatment: "simple uninterrupted walls with subtle realistic material and lighting",
      instruction:
        "Render a minimal wall-focused interior backdrop. Use plain walls as the main architectural context and keep the wall planes clean, calm, and uninterrupted.",
      mustNotInclude: [
        "windows",
        "window frames",
        "exterior views",
        "curtains",
        "blinds",
        "glass walls",
        "balcony doors",
        "busy wall art",
        "built-in shelving"
      ]
    },
    spatialGrounding: {
      roomPlane: "plain walls meeting a visible floor plane",
      noFloatingFurniture: true,
      instruction:
        "Resolve the canvas as a grounded interior scene. The walls must meet a floor plane, and all floor-supported furniture must sit on that floor plane with physically plausible contact shadows.",
      floorLine:
        "Use a subtle wall-floor junction or natural floor gradient so sofas and tables have a clear surface to rest on."
    },
    realism: {
      target: "photo-realistic interior design showroom photograph",
      composition: "single coherent photographed room, not a collage",
      camera:
        "Interior design showroom photography with a natural eye-level camera, believable lens perspective, and editorial catalog framing.",
      lighting:
        "Soft showroom lighting with one coherent direction, realistic bounce light, ambient occlusion, and natural material response.",
      assetIntegration:
        "Use source furniture images as exact references for shape, color, texture, and proportions, then re-render them as real objects inside the room. Do not paste PNG cutouts onto the background.",
      qualityBar:
        "The final image should look like a finished interior design showroom photograph from a professional portfolio or furniture catalog."
    },
    furniture,
    integrityRules: [
      "Do not replace, redesign, recolor, retexture, or omit any furniture item.",
      "Preserve each furniture item's source texture, color, material, silhouette, and visible proportions.",
      "Preserve relative furniture positions, layer order, scale relationships, and rotation from the canvas.",
      "Use source furniture images as exact references, not pasted layers; re-render them as real photographed objects within one coherent room.",
      "Unify lighting direction, perspective, ambient occlusion, shadows, reflections, and material response across the entire scene.",
      "Only generate plain surrounding walls, simple floor contact, wall lighting behavior, shadows, and realistic camera treatment.",
      "Never render seating, tables, rugs, storage pieces, or floor lamps floating; their bases must touch the floor plane.",
      "Add visible natural contact shadows directly under sofas, chair legs, table legs, rugs, storage bases, and floor-supported lighting.",
      "Do not add windows, openings, exterior views, curtains, blinds, doors, or decorative wall features.",
      "If a furniture item is visually ambiguous, keep its source-image appearance over inventing details."
    ],
    output: {
      format: "photo-realistic interior design showroom photograph",
      aspectRatio: "16:9",
      exclude: [
        "text labels",
        "watermarks",
        "extra furniture not implied by the canvas",
        "pasted collage",
        "flat product cutouts",
        "sticker-like furniture",
        "alpha halos",
        "visible cutout edges",
        "mismatched lighting",
        "fake composite look",
        "windows",
        "window frames",
        "exterior views",
        "curtains",
        "blinds",
        "doors",
        "wall art",
        "floating sofas",
        "floating furniture",
        "levitating furniture"
      ]
    }
  };
}

function cameraPlanForVariation(index: number) {
  const plans = [
    {
      index: 1,
      role: "front_angle_anchor",
      shot:
        "Straight-on front showroom angle. Eye-level 28-35mm interior lens, wide enough to include the whole furniture arrangement, wall-floor junction, rug/table relationship, and sofa as the visual anchor. Keep verticals clean and the room facing mostly forward.",
      continuity:
        "This image defines the room orientation, lighting direction, wall/floor material language, and furniture realism for versions 2-4."
    },
    {
      index: 2,
      role: "front_sofa_zoom",
      shot:
        "Noticeably zoomed-in front-facing sofa vignette. Move the camera 35-45 percent closer than version 1 and crop tighter around the sofa, coffee table edge, and rug texture, while keeping enough wall/floor context to read as the same room. The zoom should be obvious.",
      continuity:
        "Use version 1 as the visual anchor. Keep the same front orientation, same sofa identity, same furniture positions, and same lighting direction; only change camera distance and crop."
    },
    {
      index: 3,
      role: "front_left_soft_angle",
      shot:
        "Mostly front-facing angle with a subtle left offset, like a photographer stepping a little left while still facing the room. Show gentle depth across the arrangement without making it look like a different room.",
      continuity:
        "Use version 1 as the visual anchor. Keep the room front-oriented and recognizable; do not mirror the room, swing to a side view, or move furniture."
    },
    {
      index: 4,
      role: "front_right_catalog_angle",
      shot:
        "Mostly front-facing angle with a subtle right offset and slightly lower catalog-photography camera. Emphasize floor contact, table/rug texture, sofa volume, and realistic shadows while keeping the front orientation.",
      continuity:
        "Use version 1 as the visual anchor. Preserve front room orientation, furniture identities, and material continuity; only vary the camera position modestly."
    }
  ];

  return plans[index - 1] ?? plans[0];
}

function buildGroundingInstruction(asset: FurnitureAsset | undefined, assetId: string) {
  const category = asset?.category ?? "unknown";
  const isFloorLamp = assetId.includes("floor_lamp");
  const isFloorSupported = FLOOR_SUPPORTED_CATEGORIES.has(category) || isFloorLamp;

  if (!isFloorSupported) {
    return {
      floorAnchored: false,
      instruction: "Use the item's normal interior relationship without changing its source appearance."
    };
  }

  const support =
    category === "seating"
      ? "sofa base and legs physically touch the floor plane"
      : "base physically touches the floor plane";

  return {
    floorAnchored: true,
    support,
    contactShadow: "visible soft contact shadows directly under the base, feet, or legs",
    instruction:
      "Place this item on the floor plane, not floating, wall-mounted, or suspended. Keep its relative canvas position while grounding the bottom edge to the visible floor surface."
  };
}
