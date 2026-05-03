import { promises as fs } from "fs";
import path from "path";
import { buildRenderPrompt } from "./prompt-builder";
import type { CanvasState, FurnitureAsset, ImageReference } from "./types";

const OPENAI_IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-2";
const OPENAI_IMAGE_FALLBACK_MODEL = process.env.OPENAI_IMAGE_FALLBACK_MODEL || "gpt-image-1.5";
const MAX_REFERENCE_IMAGES = 16;

interface GenerateRenderInput {
  projectId: string;
  canvasImage: string;
  canvasState: CanvasState;
  furnitureAssets: FurnitureAsset[];
  style: string;
  variationIndex: number;
  orientationReference?: ImageReference;
}

export async function generateOpenAIInteriorRender(input: GenerateRenderInput) {
  const prompt = buildOpenAIImagePrompt(input);
  try {
    return {
      ...(await callOpenAIImageEdit(OPENAI_IMAGE_MODEL, input, prompt)),
      prompt,
      model: OPENAI_IMAGE_MODEL
    };
  } catch (error) {
    if (!isModelRejection(error) || OPENAI_IMAGE_FALLBACK_MODEL === OPENAI_IMAGE_MODEL) {
      throw error;
    }

    return {
      ...(await callOpenAIImageEdit(OPENAI_IMAGE_FALLBACK_MODEL, input, prompt)),
      prompt,
      model: OPENAI_IMAGE_FALLBACK_MODEL
    };
  }
}

export function hasOpenAIImageConfig() {
  return Boolean(process.env.OPENAI_API_KEY);
}

async function callOpenAIImageEdit(model: string, input: GenerateRenderInput, prompt: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY environment variable is not set");
  }

  const formData = new FormData();
  formData.append("model", model);
  formData.append("prompt", prompt);
  formData.append("size", "1536x1024");
  formData.append("quality", "high");
  formData.append("output_format", "png");
  formData.append("image[]", dataUrlToBlob(input.canvasImage), "moodboard-canvas.png");

  if (input.orientationReference) {
    const referenceBlob = await imageReferenceToBlob(input.orientationReference);
    formData.append("image[]", referenceBlob, "anchor-render-version-1.png");
  }

  const usedReferences = input.orientationReference ? 2 : 1;
  const uniqueAssets = dedupeAssets(input.furnitureAssets).slice(0, MAX_REFERENCE_IMAGES - usedReferences);
  for (const asset of uniqueAssets) {
    const blob = await readAssetBlob(asset);
    if (!blob) continue;
    formData.append("image[]", blob, `${asset.id}.png`);
  }

  const response = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`
    },
    body: formData
  });

  const data = (await response.json()) as {
    data?: Array<{ b64_json?: string; revised_prompt?: string }>;
    error?: { message?: string };
  };

  if (!response.ok) {
    throw new Error(data.error?.message || `OpenAI image generation failed with ${response.status}`);
  }

  const image = data.data?.[0]?.b64_json;
  if (!image) {
    throw new Error("No image data returned from OpenAI");
  }

  return {
    base64: image,
    mimeType: "image/png"
  };
}

function buildOpenAIImagePrompt(input: GenerateRenderInput) {
  const hasAnchor = Boolean(input.orientationReference);
  return [
    "Use the attached first image as the exact moodboard layout reference.",
    hasAnchor
      ? "Use the attached second image, anchor-render-version-1, as the orientation and room-consistency reference. Keep the same room, same furniture identities, same lighting family, same wall/floor material language, and same overall camera orientation family while changing only the photographer angle requested for this variation."
      : "This is image 1, the anchor showroom render. Establish the final room, wall/floor language, lighting family, and furniture realism that later images should preserve.",
    "Use the remaining attached images as exact product references for furniture texture, color, silhouette, material, and proportions.",
    "Generate one photo-realistic interior design showroom image.",
    buildRenderPrompt(input)
  ].join("\n\n");
}

function dataUrlToBlob(dataUrl: string) {
  const [header, data] = dataUrl.split(",");
  const mimeType = header?.match(/^data:(.*?);base64$/)?.[1] ?? "image/png";
  return new Blob([Buffer.from(data || dataUrl, "base64")], { type: mimeType });
}

async function imageReferenceToBlob(reference: ImageReference) {
  if (reference.base64) {
    return new Blob([Buffer.from(reference.base64, "base64")], { type: reference.mimeType ?? "image/png" });
  }

  if (!reference.url) {
    throw new Error("Orientation reference image is missing.");
  }

  if (reference.url.startsWith("data:")) {
    return dataUrlToBlob(reference.url);
  }

  const response = await fetch(reference.url);
  if (!response.ok) {
    throw new Error("Orientation reference image could not be loaded.");
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  return new Blob([bytes], { type: response.headers.get("content-type") ?? reference.mimeType ?? "image/png" });
}

async function readAssetBlob(asset: FurnitureAsset) {
  if (asset.src.startsWith("/furniture/")) {
    const filePath = path.join(process.cwd(), "public", asset.src);
    const bytes = await fs.readFile(filePath);
    return new Blob([bytes], { type: "image/png" });
  }

  if (asset.src.startsWith("data:")) {
    return dataUrlToBlob(asset.src);
  }

  if (asset.src.startsWith("http://") || asset.src.startsWith("https://")) {
    const response = await fetch(asset.src);
    if (!response.ok) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    return new Blob([bytes], { type: response.headers.get("content-type") ?? "image/png" });
  }

  return null;
}

function dedupeAssets(assets: FurnitureAsset[]) {
  const seen = new Set<string>();
  return assets.filter((asset) => {
    if (seen.has(asset.id)) return false;
    seen.add(asset.id);
    return true;
  });
}

function isModelRejection(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return message.includes("model") || message.includes("not found") || message.includes("unsupported");
}
