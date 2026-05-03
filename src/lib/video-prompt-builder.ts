export interface WalkthroughVideoPromptInput {
  clipIndex: number;
  clipCount: number;
  basePrompt?: string;
}

const CLIP_DIRECTIONS = [
  {
    shot: "front_anchor_dolly",
    cameraMove:
      "Start from the same front-facing showroom composition as the source still. Make a very slow forward dolly, straight line, no pan, no rotation, no orbit.",
    focus: "Establish the whole interior arrangement with the sofa, rug, table, lighting, and storage pieces staying locked in their source positions."
  },
  {
    shot: "front_sofa_push_in",
    cameraMove:
      "Keep the front-facing orientation, then push in more noticeably toward the sofa, coffee table, and rug. The camera may move 25-35% closer, but must not crop away the room context abruptly.",
    focus: "Create a closer designer detail view of upholstery texture, rug pattern, tabletop material, contact shadows, and floor reflections."
  },
  {
    shot: "front_left_glide",
    cameraMove:
      "Begin from a similar front orientation with a subtle left-side vantage. Glide gently from left toward center with mild parallax, keeping vertical lines stable.",
    focus: "Show depth between the storage piece, sofa, table, rug, and floor lighting while preserving the original layout."
  },
  {
    shot: "front_right_catalog_push",
    cameraMove:
      "Begin from a similar front orientation with a subtle right-side vantage. Use a restrained right-to-left catalog push with a slightly lower eye level.",
    focus: "Emphasize floor contact, realistic shadows, material response, and the relationship between the table, sofa, rug, and lamps."
  }
];

export function buildWalkthroughVideoPrompt(input: WalkthroughVideoPromptInput) {
  const clipIndex = clampIndex(input.clipIndex);
  const direction = CLIP_DIRECTIONS[(clipIndex - 1) % CLIP_DIRECTIONS.length];
  const brief = input.basePrompt?.trim() || "Photo-realistic interior design showroom walkthrough.";

  const contract = {
    task: "generate_interior_walkthrough_clip",
    clip: {
      index: clipIndex,
      count: Math.max(1, input.clipCount),
      shot: direction.shot,
      durationSeconds: 8
    },
    sourceImageUse: {
      preserveStillImageAsCanonicalReference: true,
      cameraMayMoveButSceneMustRemainTheSameRoom: true,
      doNotRecomposeFurnitureLayout: true
    },
    cameraDirection: {
      movement: direction.cameraMove,
      focus: direction.focus,
      continuity: "Keep orientation, scale relationships, lens feel, wall color, floor plane, and lighting family consistent with the other clips."
    },
    integrityRules: [
      "Single continuous shot, no cuts.",
      "Keep everything exactly as shown in the source image unless it is natural camera parallax.",
      "Do not replace, redesign, recolor, retexture, resize, or omit any furniture item.",
      "Do not add new furniture, decor, people, pets, text, logos, mirrors with reflections, windows, doors, exterior views, curtains, or plants unless already present in the source image.",
      "Maintain exact furniture positions, relative scale, orientation, materials, colors, and texture identity from the source still.",
      "Keep sofas, tables, storage pieces, rugs, and lamps physically grounded with realistic contact shadows.",
      "No floating furniture, sliding furniture, morphing geometry, changing rug pattern, changing upholstery, changing wood grain, or changing lamp shape.",
      "Plain warm interior walls only; no windows or outdoor scenery unless already visible in the source render.",
      "Smooth real-estate showroom camera motion with natural stabilization, no fast moves, no fisheye, no handheld shake."
    ],
    photorealism: {
      style: "premium interior design showroom video",
      lighting: "soft realistic studio daylight with consistent shadows and ambient occlusion",
      materials: "showroom-grade fabric, wood, metal, rug fibers, wall paint, and floor reflections",
      avoid: [
        "pasted collage look",
        "product cutout edges",
        "warped furniture",
        "melting textures",
        "animated furniture",
        "camera jump cuts",
        "new windows"
      ]
    }
  };

  return [
    "INTERIOR WALKTHROUGH VIDEO BRIEF",
    brief,
    "",
    "Create one polished real-estate style video clip from the supplied still image.",
    "The still image is the canonical design reference: animate only the camera, not the furniture.",
    "Use the same disciplined motion language as a luxury interior photographer capturing a staged showroom.",
    "",
    "STRICT JSON CONSTRAINTS",
    JSON.stringify(contract, null, 2)
  ].join("\n");
}

function clampIndex(index: number) {
  if (!Number.isFinite(index)) return 1;
  return Math.max(1, Math.floor(index));
}
