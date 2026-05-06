export interface WalkthroughVideoPromptInput {
  clipIndex: number;
  clipCount: number;
  basePrompt?: string;
}

export function buildWalkthroughVideoPrompt(input: WalkthroughVideoPromptInput) {
  const brief = input.basePrompt?.trim() || "Photo-realistic interior design showroom walkthrough.";

  const contract = {
    task: "generate_single_8_second_interior_walkthrough",
    clip: {
      index: 1,
      count: 1,
      shot: "continuous_showroom_walkthrough",
      durationSeconds: 8
    },
    sourceImageUse: {
      preserveStillImageAsCanonicalReference: true,
      cameraMayMoveButSceneMustRemainTheSameRoom: true,
      doNotRecomposeFurnitureLayout: true
    },
    cameraDirection: {
      movement:
        "Create one slow front showroom push that gently glides into the room, with a subtle left-to-right arc around the seating area and mild parallax. Start wide enough to show the whole layout, move 15-25% closer by the end, and keep the camera height at natural standing eye level.",
      focus:
        "The motion should feel like a luxury interior photographer walking around the room: reveal depth between sofa, table, rug, storage, and lighting while keeping the original composition recognizable.",
      continuity:
        "Make this a single uninterrupted take from one source still. No clip sequence, no scene change, no hard cut, and no stitched-transition feeling."
    },
    integrityRules: [
      "Single continuous shot, no cuts.",
      "Generate exactly one 8-second video, not multiple alternate clips.",
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
    "Use one smooth 8-second camera move, like a luxury interior photographer walking slowly around the staged showroom.",
    "",
    "STRICT JSON CONSTRAINTS",
    JSON.stringify(contract, null, 2)
  ].join("\n");
}
