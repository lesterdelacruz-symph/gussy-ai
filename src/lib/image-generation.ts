import { generateInteriorRender as generateGeminiInteriorRender } from "./gemini-images";
import { generateOpenAIInteriorRender, hasOpenAIImageConfig } from "./openai-images";
import type { CanvasState, FurnitureAsset, ImageReference } from "./types";

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
  if (!hasOpenAIImageConfig()) {
    return generateGeminiInteriorRender(input);
  }

  try {
    return await generateOpenAIInteriorRender(input);
  } catch (error) {
    if (!isModelRejection(error)) {
      throw error;
    }
    return generateGeminiInteriorRender(input);
  }
}

function isModelRejection(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return message.includes("model") || message.includes("not found") || message.includes("unsupported");
}
