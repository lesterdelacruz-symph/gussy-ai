"use client";

import { Loader2, Search, Trash2 } from "lucide-react";
import Image from "next/image";
import { useMemo, useState } from "react";
import { furnitureCategories } from "@/lib/furniture-assets";
import type { FurnitureAsset } from "@/lib/types";

interface AssetLibraryProps {
  assets: FurnitureAsset[];
  onAddAsset: (asset: FurnitureAsset) => void;
  onDeleteUpload: (asset: FurnitureAsset) => void;
  onClearCanvas: () => void;
  canClearCanvas: boolean;
}

export function AssetLibrary({ assets, onAddAsset, onDeleteUpload, onClearCanvas, canClearCanvas }: AssetLibraryProps) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");

  const filteredAssets = useMemo(() => {
    const lower = query.trim().toLowerCase();
    return assets.filter((asset) => {
      const matchesCategory = category === "all" || asset.category === category;
      const matchesQuery =
        !lower || asset.name.toLowerCase().includes(lower) || asset.category.toLowerCase().includes(lower);
      return matchesCategory && matchesQuery;
    });
  }, [assets, category, query]);
  const categoryCounts = useMemo(
    () =>
      assets.reduce<Record<string, number>>(
        (counts, asset) => ({
          ...counts,
          [asset.category]: (counts[asset.category] ?? 0) + 1
        }),
        { all: assets.length }
      ),
    [assets]
  );
  const categories = useMemo(
    () => ["all", ...furnitureCategories, ...(categoryCounts.uploads ? ["uploads"] : ["uploads"])],
    [categoryCounts.uploads]
  );

  return (
    <aside className="flex h-[168px] min-h-0 min-w-0 max-w-full flex-col overflow-hidden border-t border-[var(--line)] bg-[var(--surface)]">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[var(--surface)] p-2">
        <div className="flex h-9 min-w-0 items-center gap-3 overflow-hidden">
          <label className="flex h-8 w-64 shrink-0 items-center gap-2 rounded-md border border-[var(--line)] bg-[var(--background)] px-3">
            <Search size={14} className="text-[var(--ink-muted)]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search assets"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--ink-muted)]"
            />
          </label>

          <div className="asset-scrollbar flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
            {categories.map((item) => (
              <button
                key={item}
                onClick={() => setCategory(item)}
                className={`h-8 shrink-0 rounded-md px-3 text-sm font-semibold capitalize transition ${
                  category === item
                    ? "bg-[var(--accent)] text-white"
                    : "bg-transparent text-[var(--foreground)] hover:bg-[var(--surface-subtle)]"
                }`}
              >
                <span>{item}</span>
                <span className={`ml-1.5 ${category === item ? "text-white/70" : "text-[var(--ink-muted)]"}`}>
                  {categoryCounts[item] ?? 0}
                </span>
              </button>
            ))}
          </div>
          <button
            onClick={onClearCanvas}
            disabled={!canClearCanvas}
            className="flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-[var(--clay)]/35 bg-white px-3 text-sm font-semibold text-[var(--clay)] transition enabled:hover:border-[var(--clay)] enabled:hover:bg-[#fff7f3] disabled:border-[var(--line)] disabled:text-[var(--ink-muted)] disabled:opacity-50"
          >
            <Trash2 size={13} />
            Clear canvas
          </button>
        </div>

        <div className="asset-scrollbar mt-2 flex min-h-0 min-w-0 max-w-full flex-1 gap-2 overflow-x-auto">
          {filteredAssets.map((asset, index) => (
            <button
              key={asset.id}
              draggable
              onDragStart={(event) => {
                event.dataTransfer.setData("application/x-gussy-asset", asset.id);
                event.dataTransfer.effectAllowed = "copy";
              }}
              onClick={() => onAddAsset(asset)}
              className="group relative flex h-full w-28 shrink-0 flex-col justify-between rounded-md border border-[var(--line)] bg-[var(--background)] p-2 text-center transition hover:-translate-y-0.5 hover:border-[var(--accent)] hover:bg-white"
            >
              {asset.uploaded ? (
                <span
                  role="button"
                  tabIndex={0}
                  title="Delete upload"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onDeleteUpload(asset);
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    event.stopPropagation();
                    onDeleteUpload(asset);
                  }}
                  className="absolute right-1 top-1 z-10 flex h-6 w-6 items-center justify-center rounded border border-[var(--line)] bg-white/90 text-[var(--ink-muted)] opacity-0 shadow-sm transition hover:border-[var(--clay)] hover:text-[var(--clay)] group-hover:opacity-100"
                >
                  <Trash2 size={12} />
                </span>
              ) : null}
              <span className="relative block min-h-0 flex-1">
                <Image src={asset.src} alt={asset.name} fill sizes="112px" priority={index < 8} className="object-contain" />
                {asset.backgroundProcessing ? (
                  <span className="absolute inset-0 flex items-center justify-center rounded bg-white/75 text-[var(--accent)]">
                    <Loader2 size={16} className="animate-spin" />
                  </span>
                ) : null}
              </span>
              <span className="truncate text-[11px] font-semibold leading-4 text-[var(--foreground)]">
                {asset.backgroundProcessing ? "Removing BG..." : asset.name}
              </span>
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}
