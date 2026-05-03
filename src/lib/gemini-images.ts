import { promises as fs } from "fs";
import path from "path";
import { buildRenderPrompt } from "./prompt-builder";
import { getGoogleAI } from "./google-ai";
import type { CanvasState, FurnitureAsset, ImageReference } from "./types";

const PRIMARY_IMAGE_MODEL = "gemini-3.1-flash-image-preview";
const FALLBACK_IMAGE_MODEL = "gemini-2.5-flash-image";

interface GenerateRenderInput {
  projectId: string;
  canvasImage: string;
  canvasState: CanvasState;
  furnitureAssets: FurnitureAsset[];
  style: string;
  variationIndex: number;
  orientationReference?: ImageReference;
}

export async function generateInteriorRender(input: GenerateRenderInput) {
  const prompt = buildRenderPrompt(input);
  const parts = await buildParts(input.canvasImage, input.furnitureAssets, prompt, input.orientationReference);

  try {
    return {
      ...(await callImageModel(PRIMARY_IMAGE_MODEL, parts)),
      prompt,
      model: PRIMARY_IMAGE_MODEL
    };
  } catch (error) {
    if (!isModelRejection(error)) {
      throw error;
    }

    return {
      ...(await callImageModel(FALLBACK_IMAGE_MODEL, parts)),
      prompt,
      model: FALLBACK_IMAGE_MODEL
    };
  }
}

async function buildParts(
  canvasImage: string,
  furnitureAssets: FurnitureAsset[],
  prompt: string,
  orientationReference?: ImageReference
) {
  const parts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }> = [
    { text: "Reference 1 is the exact moodboard canvas. Use it as the layout source of truth." },
    { inlineData: dataUrlToInline(canvasImage) }
  ];

  if (orientationReference) {
    parts.push({
      text:
        "Reference 2 is render version 1. Use it as the room orientation, lighting, material language, and furniture-realism anchor for this new camera angle."
    });
    parts.push({ inlineData: await imageReferenceToInlineData(orientationReference) });
  }

  for (const asset of furnitureAssets) {
    const inlineData = await readAssetInlineData(asset);
    if (!inlineData) continue;
    parts.push({
      text: `Furniture reference: ${asset.name} (${asset.id}). Preserve this exact texture, color, silhouette, and material.`
    });
    parts.push({ inlineData });
  }

  parts.push({
    text: `Create one photorealistic interior render using these structured instructions:\n${prompt}`
  });

  return parts;
}

async function callImageModel(
  model: string,
  parts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }>
) {
  const ai = getGoogleAI();
  const response = await ai.models.generateContent({
    model,
    contents: [{ role: "user", parts }],
    config: {
      responseModalities: ["IMAGE", "TEXT"]
    }
  });

  const responseParts = response.candidates?.[0]?.content?.parts ?? [];
  for (const part of responseParts) {
    if (part.inlineData?.data && part.inlineData.mimeType) {
      return {
        base64: part.inlineData.data,
        mimeType: part.inlineData.mimeType
      };
    }
  }

  throw new Error("No image data returned from Gemini");
}

function dataUrlToInline(dataUrl: string) {
  const [header, data] = dataUrl.split(",");
  if (!data || !header.startsWith("data:")) {
    return { data: dataUrl, mimeType: "image/png" };
  }
  const mimeType = header.match(/^data:(.*?);base64$/)?.[1] ?? "image/png";
  return { data, mimeType };
}

async function readAssetInlineData(asset: FurnitureAsset) {
  if (asset.src.startsWith("/furniture/")) {
    const filePath = path.join(process.cwd(), "public", asset.src);
    const bytes = await fs.readFile(filePath);
    return {
      data: bytes.toString("base64"),
      mimeType: "image/png"
    };
  }

  if (asset.src.startsWith("data:")) {
    return dataUrlToInline(asset.src);
  }

  if (asset.src.startsWith("http://") || asset.src.startsWith("https://")) {
    const response = await fetch(asset.src);
    if (!response.ok) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    return {
      data: bytes.toString("base64"),
      mimeType: response.headers.get("content-type") ?? "image/png"
    };
  }

  return null;
}

async function imageReferenceToInlineData(reference: ImageReference) {
  if (reference.base64) {
    return {
      data: reference.base64,
      mimeType: reference.mimeType ?? "image/png"
    };
  }

  if (!reference.url) {
    throw new Error("Orientation reference image is missing.");
  }

  if (reference.url.startsWith("data:")) {
    return dataUrlToInline(reference.url);
  }

  const response = await fetch(reference.url);
  if (!response.ok) {
    throw new Error("Orientation reference image could not be loaded.");
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  return {
    data: bytes.toString("base64"),
    mimeType: response.headers.get("content-type") ?? reference.mimeType ?? "image/png"
  };
}

function isModelRejection(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return message.includes("model") || message.includes("not found") || message.includes("unsupported");
}
