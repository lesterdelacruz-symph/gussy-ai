import { PNG } from "pngjs";
import { getGoogleAI } from "./google-ai";

const GEMINI_BACKGROUND_REMOVAL_MODEL = process.env.GEMINI_BACKGROUND_REMOVAL_MODEL || "gemini-2.5-flash-image";
const GEMINI_BACKGROUND_REMOVAL_FALLBACK_MODEL =
  process.env.GEMINI_BACKGROUND_REMOVAL_FALLBACK_MODEL || "gemini-3.1-flash-image-preview";

export async function removeImageBackground(file: File) {
  if (!process.env.GOOGLE_API_KEY) {
    throw new Error("GOOGLE_API_KEY is required to remove image backgrounds.");
  }

  const prompt = [
    "Remove the background from this furniture or decor product photo.",
    "Return a clean transparent PNG cutout only with a real alpha channel. If true alpha is unavailable, place the unchanged object on a perfectly flat pure white background.",
    "Preserve the exact object shape, proportions, color, texture, material, shadows on the object, and visible details.",
    "Do not create a checkerboard, white, gray, green, or solid-color background.",
    "Do not redesign, recolor, stylize, crop, or add new objects.",
    "Output only the isolated object."
  ].join(" ");

  try {
    return await callGeminiBackgroundRemoval(GEMINI_BACKGROUND_REMOVAL_MODEL, file, prompt);
  } catch (error) {
    if (!isModelRejection(error)) throw error;
    return callGeminiBackgroundRemoval(GEMINI_BACKGROUND_REMOVAL_FALLBACK_MODEL, file, prompt);
  }
}

export function getImageDimensions(bytes: Buffer, mimeType: string) {
  if (mimeType.includes("png") && bytes.length >= 24 && bytes.toString("ascii", 1, 4) === "PNG") {
    return {
      width: bytes.readUInt32BE(16),
      height: bytes.readUInt32BE(20)
    };
  }

  if ((mimeType.includes("jpeg") || mimeType.includes("jpg")) && bytes.length > 4) {
    let offset = 2;
    while (offset < bytes.length) {
      if (bytes[offset] !== 0xff) break;
      const marker = bytes[offset + 1];
      const length = bytes.readUInt16BE(offset + 2);
      if (marker >= 0xc0 && marker <= 0xc3) {
        return {
          height: bytes.readUInt16BE(offset + 5),
          width: bytes.readUInt16BE(offset + 7)
        };
      }
      offset += 2 + length;
    }
  }

  return null;
}

async function callGeminiBackgroundRemoval(model: string, file: File, prompt: string) {
  const ai = getGoogleAI();
  const bytes = Buffer.from(await file.arrayBuffer());
  const response = await ai.models.generateContent({
    model,
    contents: [
      {
        role: "user",
        parts: [
          {
            text:
              "Edit this product image for an interior design asset library. Remove only the background and keep the furniture/decor object unchanged."
          },
          {
            inlineData: {
              data: bytes.toString("base64"),
              mimeType: file.type || "image/png"
            }
          },
          {
            text: prompt
          }
        ]
      }
    ],
    config: {
      responseModalities: ["IMAGE", "TEXT"]
    }
  });

  const parts = response.candidates?.[0]?.content?.parts ?? [];
  for (const part of parts) {
    if (part.inlineData?.data && part.inlineData.mimeType) {
      const originalBytes = Buffer.from(part.inlineData.data, "base64");
      const transparentBytes = makeBackgroundTransparent(originalBytes, part.inlineData.mimeType);
      return {
        bytes: transparentBytes ?? originalBytes,
        mimeType: transparentBytes ? "image/png" : part.inlineData.mimeType
      };
    }
  }

  throw new Error("No background-removed image data returned from Gemini.");
}

function makeBackgroundTransparent(bytes: Buffer, mimeType: string) {
  if (!mimeType.includes("png")) return null;

  let image: PNG;
  try {
    image = PNG.sync.read(bytes);
  } catch {
    return null;
  }

  const { width, height, data } = image;
  if (width < 2 || height < 2) return null;

  const background = estimateBackgroundColor(image);
  const tolerance = estimateTolerance(image, background);
  const visited = new Uint8Array(width * height);
  const queue: number[] = [];

  function enqueue(x: number, y: number) {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const index = y * width + x;
    if (visited[index]) return;
    const offset = index * 4;
    if (!isBackgroundPixel(data, offset, background, tolerance)) return;
    visited[index] = 1;
    queue.push(index);
  }

  for (let x = 0; x < width; x++) {
    enqueue(x, 0);
    enqueue(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    enqueue(0, y);
    enqueue(width - 1, y);
  }

  while (queue.length > 0) {
    const index = queue.shift()!;
    const x = index % width;
    const y = Math.floor(index / width);
    const offset = index * 4;
    data[offset + 3] = 0;
    enqueue(x + 1, y);
    enqueue(x - 1, y);
    enqueue(x, y + 1);
    enqueue(x, y - 1);
  }

  softenTransparentEdges(image);
  return PNG.sync.write(image);
}

function estimateBackgroundColor(image: PNG) {
  const samples: Array<[number, number, number]> = [];
  const { width, height, data } = image;
  const sampleStep = Math.max(1, Math.floor(Math.min(width, height) / 24));

  for (let x = 0; x < width; x += sampleStep) {
    samples.push(readPixel(data, x, 0, width));
    samples.push(readPixel(data, x, height - 1, width));
  }
  for (let y = 0; y < height; y += sampleStep) {
    samples.push(readPixel(data, 0, y, width));
    samples.push(readPixel(data, width - 1, y, width));
  }

  samples.sort((left, right) => luminance(left) - luminance(right));
  const middle = samples.slice(Math.floor(samples.length * 0.25), Math.ceil(samples.length * 0.75));
  const source = middle.length > 0 ? middle : samples;

  return {
    r: median(source.map((pixel) => pixel[0])),
    g: median(source.map((pixel) => pixel[1])),
    b: median(source.map((pixel) => pixel[2]))
  };
}

function estimateTolerance(image: PNG, background: { r: number; g: number; b: number }) {
  const { width, height, data } = image;
  const distances: number[] = [];
  const sampleStep = Math.max(1, Math.floor(Math.min(width, height) / 24));

  for (let x = 0; x < width; x += sampleStep) {
    distances.push(colorDistance(readPixel(data, x, 0, width), background));
    distances.push(colorDistance(readPixel(data, x, height - 1, width), background));
  }
  for (let y = 0; y < height; y += sampleStep) {
    distances.push(colorDistance(readPixel(data, 0, y, width), background));
    distances.push(colorDistance(readPixel(data, width - 1, y, width), background));
  }

  return Math.max(26, Math.min(72, median(distances) + 22));
}

function softenTransparentEdges(image: PNG) {
  const { width, height, data } = image;
  const copy = Buffer.from(data);

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const offset = (y * width + x) * 4;
      if (copy[offset + 3] === 0) continue;
      const transparentNeighbors = [
        copy[((y - 1) * width + x) * 4 + 3],
        copy[((y + 1) * width + x) * 4 + 3],
        copy[(y * width + x - 1) * 4 + 3],
        copy[(y * width + x + 1) * 4 + 3]
      ].filter((alpha) => alpha === 0).length;

      if (transparentNeighbors > 0 && isNearWhite(data, offset)) {
        data[offset + 3] = Math.max(0, 255 - transparentNeighbors * 72);
      }
    }
  }
}

function isBackgroundPixel(
  data: Buffer,
  offset: number,
  background: { r: number; g: number; b: number },
  tolerance: number
) {
  if (data[offset + 3] === 0) return true;
  return colorDistance([data[offset], data[offset + 1], data[offset + 2]], background) <= tolerance;
}

function readPixel(data: Buffer, x: number, y: number, width: number): [number, number, number] {
  const offset = (y * width + x) * 4;
  return [data[offset], data[offset + 1], data[offset + 2]];
}

function colorDistance(pixel: [number, number, number], background: { r: number; g: number; b: number }) {
  return Math.sqrt((pixel[0] - background.r) ** 2 + (pixel[1] - background.g) ** 2 + (pixel[2] - background.b) ** 2);
}

function isNearWhite(data: Buffer, offset: number) {
  return data[offset] > 220 && data[offset + 1] > 220 && data[offset + 2] > 220;
}

function luminance(pixel: [number, number, number]) {
  return pixel[0] * 0.2126 + pixel[1] * 0.7152 + pixel[2] * 0.0722;
}

function median(values: number[]) {
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function isModelRejection(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return message.includes("model") || message.includes("not found") || message.includes("unsupported");
}
