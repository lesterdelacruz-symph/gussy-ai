import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "fs";
import path from "path";
import type { GeneratedRender } from "./types";

export function safeProjectId(projectId: string) {
  return projectId.replace(/[^a-z0-9-]/gi, "-");
}

export function generatedImageFileName(projectId: string, id: string, mimeType: string) {
  const ext = mimeType.includes("png") ? "png" : "jpg";
  return `${safeProjectId(projectId)}-${id}.${ext}`;
}

export function generatedImageUrl(projectId: string, id: string, mimeType: string) {
  return `/generated/${generatedImageFileName(projectId, id, mimeType)}`;
}

export function saveGeneratedImageFile(projectId: string, id: string, base64: string, mimeType: string) {
  const generatedDir = path.join(process.cwd(), "public", "generated");
  mkdirSync(generatedDir, { recursive: true });
  const fileName = generatedImageFileName(projectId, id, mimeType);
  writeFileSync(path.join(generatedDir, fileName), Buffer.from(base64, "base64"));
  return {
    fileName,
    url: `/generated/${fileName}`
  };
}

export function listGeneratedImageFiles(projectId: string, limit = 4): GeneratedRender[] {
  const generatedDir = path.join(process.cwd(), "public", "generated");
  if (!existsSync(generatedDir)) return [];

  const prefix = `${safeProjectId(projectId)}-`;
  return listFiles(generatedDir, (fileName) => fileName.startsWith(prefix), limit).map(({ fileName, stat }, index) => {
    const mimeType = fileName.endsWith(".png") ? "image/png" : "image/jpeg";
    return {
      id: fileName.replace(prefix, "").replace(/\.(jpe?g|png)$/i, ""),
      url: `/generated/${fileName}`,
      mimeType,
      prompt: "Recovered from local generated image file.",
      selected: index === 0,
      createdAt: stat.mtime.toISOString()
    };
  });
}

export function listLatestGeneratedImageFiles(limit = 4): GeneratedRender[] {
  const generatedDir = path.join(process.cwd(), "public", "generated");
  if (!existsSync(generatedDir)) return [];

  return listFiles(generatedDir, () => true, limit).map(({ fileName, stat }, index) => {
    const mimeType = fileName.endsWith(".png") ? "image/png" : "image/jpeg";
    return {
      id: fileName.replace(/\.(jpe?g|png)$/i, ""),
      url: `/generated/${fileName}`,
      mimeType,
      prompt: "Recovered from latest local generated image file.",
      selected: index === 0,
      createdAt: stat.mtime.toISOString()
    };
  });
}

function listFiles(generatedDir: string, includeFile: (fileName: string) => boolean, limit: number) {
  return readdirSync(generatedDir)
    .filter((fileName) => includeFile(fileName) && /\.(jpe?g|png)$/i.test(fileName))
    .map((fileName) => {
      const filePath = path.join(generatedDir, fileName);
      return {
        fileName,
        filePath,
        stat: statSync(filePath)
      };
    })
    .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs)
    .slice(0, limit)
    .reverse();
}
