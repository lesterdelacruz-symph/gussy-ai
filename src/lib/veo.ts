import type { GenerateVideosOperation } from "@google/genai";
import { promises as fs } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { getGoogleAI } from "./google-ai";

export async function startVideoGeneration(
  prompt: string,
  imageBase64: string,
  imageMimeType: string
): Promise<GenerateVideosOperation> {
  const ai = getGoogleAI();

  return ai.models.generateVideos({
    model: "veo-3.1-generate-preview",
    prompt,
    image: {
      imageBytes: stripDataUrl(imageBase64),
      mimeType: imageMimeType
    },
    config: {
      durationSeconds: 8
    }
  });
}

export async function pollUntilDone(operation: GenerateVideosOperation): Promise<GenerateVideosOperation> {
  const ai = getGoogleAI();

  while (!operation.done) {
    await new Promise((resolve) => setTimeout(resolve, 10000));
    operation = await ai.operations.getVideosOperation({ operation });
  }

  return operation;
}

export async function downloadVideo(operation: GenerateVideosOperation) {
  const ai = getGoogleAI();
  const video = operation.response?.generatedVideos?.[0]?.video;
  if (!video) return null;

  const downloadPath = join(tmpdir(), `gussy-veo-${Date.now()}.mp4`);
  await ai.files.download({ file: video, downloadPath });
  const bytes = await fs.readFile(downloadPath);
  await fs.unlink(downloadPath);

  return {
    bytes: Buffer.from(bytes),
    mimeType: "video/mp4"
  };
}

function stripDataUrl(value: string) {
  return value.includes(",") ? value.split(",")[1] : value;
}
