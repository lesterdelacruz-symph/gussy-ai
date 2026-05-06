#!/usr/bin/env node
import { execFile as execFileCallback } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { createClient } from "@supabase/supabase-js";

const execFile = promisify(execFileCallback);
const PAGE_SIZE = 1000;
const DEFAULT_CONCURRENCY = 8;

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

async function main() {
  loadEnvFile(".env.local");
  const options = parseArgs(process.argv.slice(2));
  await assertCommand("curl");
  await assertCommand("sips");

  const supabase = createClient(getSupabaseUrl(), requireServiceRoleKey(process.env.SUPABASE_SERVICE_ROLE_KEY), {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const rows = await loadRows(supabase);
  const targets = rows.filter((row) => row.public_url && (!row.image_width || !row.image_height));
  const limitedTargets = options.limit ? targets.slice(0, options.limit) : targets;
  const totals = { processed: 0, updated: 0, failed: 0 };

  console.log(JSON.stringify({ candidates: targets.length, processing: limitedTargets.length, dryRun: options.dryRun }, null, 2));

  await runPool(limitedTargets, options.concurrency, async (row) => {
    const dimensions = await readRemoteDimensions(row.public_url);
    totals.processed += 1;
    if (dimensions) {
      if (!options.dryRun) {
        const { error } = await supabase
          .from("catalog_items")
          .update({
            image_width: dimensions.width,
            image_height: dimensions.height,
            updated_at: new Date().toISOString()
          })
          .eq("firebase_doc_id", row.firebase_doc_id);
        if (error) throw new Error(`Could not update ${row.firebase_doc_id}: ${error.message}`);
      }
      totals.updated += 1;
    } else {
      totals.failed += 1;
    }

    if (totals.processed % options.progressEvery === 0 || totals.processed === limitedTargets.length) {
      console.log(JSON.stringify({ progress: `${totals.processed}/${limitedTargets.length}`, updated: totals.updated, failed: totals.failed }));
    }
  });

  console.log(JSON.stringify({ ...totals, dryRun: options.dryRun }, null, 2));
}

function parseArgs(args) {
  const parsed = { concurrency: DEFAULT_CONCURRENCY, dryRun: false, limit: 0, progressEvery: 100 };
  for (const arg of args) {
    if (arg === "--dry-run") parsed.dryRun = true;
    if (arg.startsWith("--limit=")) parsed.limit = Number(arg.slice("--limit=".length));
    if (arg.startsWith("--concurrency=")) parsed.concurrency = Number(arg.slice("--concurrency=".length));
    if (arg.startsWith("--progress-every=")) parsed.progressEvery = Number(arg.slice("--progress-every=".length));
  }
  parsed.concurrency = Math.max(1, Math.min(16, parsed.concurrency || DEFAULT_CONCURRENCY));
  parsed.progressEvery = Math.max(1, parsed.progressEvery || 100);
  return parsed;
}

async function loadRows(supabase) {
  const rows = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from("catalog_items")
      .select("firebase_doc_id, public_url, image_width, image_height")
      .eq("active", true)
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(`Could not load catalog rows: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return rows;
}

async function readRemoteDimensions(url) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "gussy-image-dimensions-"));
  const imagePath = path.join(tempDir, "asset-image");
  try {
    await execFile("curl", ["-L", "-sS", "--fail", url, "-o", imagePath]);
    const { stdout } = await execFile("sips", ["-g", "pixelWidth", "-g", "pixelHeight", imagePath]);
    const width = Number(stdout.match(/pixelWidth:\s*(\d+)/)?.[1]);
    const height = Number(stdout.match(/pixelHeight:\s*(\d+)/)?.[1]);
    if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
    return { width, height };
  } catch (error) {
    console.warn(`Could not read image dimensions for ${url}: ${error instanceof Error ? error.message : error}`);
    return null;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
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
