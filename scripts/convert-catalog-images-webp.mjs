#!/usr/bin/env node
import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { createClient } from "@supabase/supabase-js";

const execFile = promisify(execFileCallback);
const CATALOG_BUCKET = "catalog-assets";
const PAGE_SIZE = 1000;
const DEFAULT_CONCURRENCY = 4;
const DEFAULT_QUALITY = 82;
const DEFAULT_ALPHA_QUALITY = 92;
const DEFAULT_MAX_DIMENSION = 1600;

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

async function main() {
  loadEnvFile(".env.local");

  const options = parseArgs(process.argv.slice(2));
  await assertCommand("cwebp");
  await assertCommand("curl");
  await assertCommand("sips");

  const supabase = createClient(getSupabaseUrl(), requireServiceRoleKey(process.env.SUPABASE_SERVICE_ROLE_KEY), {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const rows = await loadCatalogRows(supabase);
  const targets = rows.filter((row) => row.public_url && row.image_storage_path && (options.force || !row.image_storage_path.endsWith(".webp")));
  const limitedTargets = options.limit ? targets.slice(0, options.limit) : targets;

  const totals = {
    converted: 0,
    skipped: rows.length - targets.length,
    failed: 0,
    processed: 0,
    originalBytes: 0,
    webpBytes: 0
  };

  console.log(
    JSON.stringify(
      {
        candidates: targets.length,
        processing: limitedTargets.length,
        skippedAlreadyWebpOrMissingImage: totals.skipped,
        dryRun: options.dryRun
      },
      null,
      2
    )
  );

  await runPool(limitedTargets, options.concurrency, async (row) => {
    const result = await convertRow(supabase, row, options);
    totals.originalBytes += result.originalBytes;
    totals.webpBytes += result.webpBytes;
    if (result.ok) totals.converted += 1;
    else totals.failed += 1;
    totals.processed += 1;

    if (totals.processed % options.progressEvery === 0 || totals.processed === limitedTargets.length) {
      console.log(
        JSON.stringify({
          progress: `${totals.processed}/${limitedTargets.length}`,
          converted: totals.converted,
          failed: totals.failed,
          savedMB: bytesToMegabytes(totals.originalBytes - totals.webpBytes)
        })
      );
    }
  });

  console.log(
    JSON.stringify(
      {
        converted: totals.converted,
        failed: totals.failed,
        originalMB: bytesToMegabytes(totals.originalBytes),
        webpMB: bytesToMegabytes(totals.webpBytes),
        savedMB: bytesToMegabytes(totals.originalBytes - totals.webpBytes),
        dryRun: options.dryRun
      },
      null,
      2
    )
  );
}

function parseArgs(args) {
  const parsed = {
    concurrency: DEFAULT_CONCURRENCY,
    dryRun: false,
    force: false,
    limit: 0,
    quality: DEFAULT_QUALITY,
    alphaQuality: DEFAULT_ALPHA_QUALITY,
    maxDimension: DEFAULT_MAX_DIMENSION,
    progressEvery: 25
  };

  for (const arg of args) {
    if (arg === "--dry-run") parsed.dryRun = true;
    if (arg === "--force") parsed.force = true;
    if (arg.startsWith("--limit=")) parsed.limit = Number(arg.slice("--limit=".length));
    if (arg.startsWith("--concurrency=")) parsed.concurrency = Number(arg.slice("--concurrency=".length));
    if (arg.startsWith("--quality=")) parsed.quality = Number(arg.slice("--quality=".length));
    if (arg.startsWith("--alpha-quality=")) parsed.alphaQuality = Number(arg.slice("--alpha-quality=".length));
    if (arg.startsWith("--max-dimension=")) parsed.maxDimension = Number(arg.slice("--max-dimension=".length));
    if (arg.startsWith("--progress-every=")) parsed.progressEvery = Number(arg.slice("--progress-every=".length));
  }

  parsed.concurrency = Math.max(1, Math.min(12, parsed.concurrency || DEFAULT_CONCURRENCY));
  parsed.progressEvery = Math.max(1, parsed.progressEvery || 25);
  return parsed;
}

async function loadCatalogRows(supabase) {
  const rows = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from("catalog_items")
      .select("firebase_doc_id, name, public_url, image_storage_path")
      .eq("active", true)
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) throw new Error(`Could not read catalog rows: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return rows;
}

async function convertRow(supabase, row, options) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "gussy-catalog-webp-"));
  const inputPath = path.join(tempDir, "source-image");
  const outputPath = path.join(tempDir, "optimized.webp");

  try {
    await execFile("curl", ["-L", "-sS", "--fail", row.public_url, "-o", inputPath]);
    const dimensions = await readImageDimensions(inputPath);
    const cwebpArgs = [
      "-quiet",
      "-q",
      String(options.quality),
      "-alpha_q",
      String(options.alphaQuality),
      "-m",
      "6"
    ];

    const resize = resizeArgs(dimensions, options.maxDimension);
    cwebpArgs.push(...resize, inputPath, "-o", outputPath);
    await execFile("cwebp", cwebpArgs);

    const [inputBytes, outputBytes] = await Promise.all([readFile(inputPath), readFile(outputPath)]);
    const outputDimensions = await readImageDimensions(outputPath);
    const safeId = sanitizePathPart(row.firebase_doc_id);
    const storagePath = `products/${safeId}/${safeId}.webp`;

    if (!options.dryRun) {
      const { error: uploadError } = await supabase.storage.from(CATALOG_BUCKET).upload(storagePath, outputBytes, {
        contentType: "image/webp",
        upsert: true
      });
      if (uploadError) throw new Error(`upload failed: ${uploadError.message}`);

      const { data } = supabase.storage.from(CATALOG_BUCKET).getPublicUrl(storagePath);
      const { error: updateError } = await supabase
        .from("catalog_items")
        .update({
          image_storage_path: storagePath,
          public_url: data.publicUrl,
          image_width: outputDimensions.width || null,
          image_height: outputDimensions.height || null,
          updated_at: new Date().toISOString()
        })
        .eq("firebase_doc_id", row.firebase_doc_id);

      if (updateError) throw new Error(`row update failed: ${updateError.message}`);
    }

    return { ok: true, originalBytes: inputBytes.byteLength, webpBytes: outputBytes.byteLength };
  } catch (error) {
    console.warn(`Could not convert ${row.firebase_doc_id} (${row.name}): ${error instanceof Error ? error.message : error}`);
    return { ok: false, originalBytes: 0, webpBytes: 0 };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function readImageDimensions(filePath) {
  const { stdout } = await execFile("sips", ["-g", "pixelWidth", "-g", "pixelHeight", filePath]);
  const width = Number(stdout.match(/pixelWidth:\s*(\d+)/)?.[1]);
  const height = Number(stdout.match(/pixelHeight:\s*(\d+)/)?.[1]);
  return {
    width: Number.isFinite(width) ? width : 0,
    height: Number.isFinite(height) ? height : 0
  };
}

function resizeArgs(dimensions, maxDimension) {
  if (!maxDimension || !dimensions.width || !dimensions.height) return [];
  if (Math.max(dimensions.width, dimensions.height) <= maxDimension) return [];
  return dimensions.width >= dimensions.height ? ["-resize", String(maxDimension), "0"] : ["-resize", "0", String(maxDimension)];
}

async function runPool(items, concurrency, worker) {
  let index = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length) {
      const currentIndex = index;
      index += 1;
      await worker(items[currentIndex], currentIndex);
    }
  });
  await Promise.all(runners);
}

async function assertCommand(command) {
  await execFile("command", ["-v", command], { shell: true });
}

function loadEnvFile(fileName) {
  const filePath = path.join(process.cwd(), fileName);
  if (!existsSync(filePath)) return;
  const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...valueParts] = trimmed.split("=");
    if (process.env[key]) continue;
    process.env[key] = valueParts.join("=").replace(/^['"]|['"]$/g, "");
  }
}

function getSupabaseUrl() {
  return process.env.NEXT_PUBLIC_SUPABASE_URL || "https://kzgrpjijmsslmevpgtsk.supabase.co";
}

function requireServiceRoleKey(value) {
  if (!value) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required.");
  return value;
}

function sanitizePathPart(value) {
  return String(value).replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "") || "asset";
}

function bytesToMegabytes(value) {
  return Math.round((value / 1024 / 1024) * 100) / 100;
}
