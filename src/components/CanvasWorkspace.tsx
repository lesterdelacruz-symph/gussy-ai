"use client";

import type Konva from "konva";
import { BringToFront, Copy, FlipHorizontal2, FlipVertical2, RotateCcw, RotateCw, SendToBack, Trash2, Undo2 } from "lucide-react";
import type { ReactNode } from "react";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Image as KonvaImage, Layer, Rect, Stage, Transformer } from "react-konva";
import { normalizeZIndex } from "@/lib/canvas-utils";
import { getFurnitureAssetFromList } from "@/lib/furniture-assets";
import type { CanvasItem, CanvasState, FurnitureAsset } from "@/lib/types";

export interface CanvasWorkspaceRef {
  exportCanvas: () => string;
}

interface CanvasWorkspaceProps {
  canvas: CanvasState;
  assets: FurnitureAsset[];
  selectedItemId: string | null;
  onCanvasChange: (canvas: CanvasState) => void;
  onSelectItem: (id: string | null) => void;
  canUndo: boolean;
  onUndo: () => void;
  onDropAsset: (assetId: string, position: { x: number; y: number }) => void;
}

export const CanvasWorkspace = forwardRef<CanvasWorkspaceRef, CanvasWorkspaceProps>(
  ({ canvas, assets, selectedItemId, onCanvasChange, onSelectItem, canUndo, onUndo, onDropAsset }, ref) => {
    const stageRef = useRef<Konva.Stage>(null);
    const transformerRef = useRef<Konva.Transformer>(null);
    const selectedNodeRef = useRef<Konva.Image | null>(null);
    const [stageSize, setStageSize] = useState({ width: 900, height: 600 });

    const sortedItems = useMemo(() => canvas.items.slice().sort((a, b) => a.zIndex - b.zIndex), [canvas.items]);
    const selectedItem = useMemo(
      () => canvas.items.find((item) => item.id === selectedItemId) ?? null,
      [canvas.items, selectedItemId]
    );

    useImperativeHandle(ref, () => ({
      exportCanvas() {
        const stage = stageRef.current;
        if (!stage) return "";
        transformerRef.current?.nodes([]);
        transformerRef.current?.getLayer()?.batchDraw();
        onSelectItem(null);
        return stage.toDataURL({ mimeType: "image/png", pixelRatio: 2 });
      }
    }));

    useEffect(() => {
      const checkSize = () => {
        const element = document.getElementById("moodboard-stage-wrap");
        if (!element) return;
        setStageSize({
          width: Math.max(1, element.clientWidth),
          height: Math.max(1, element.clientHeight)
        });
      };

      checkSize();
      const element = document.getElementById("moodboard-stage-wrap");
      const observer = element ? new ResizeObserver(checkSize) : null;
      if (element) observer?.observe(element);
      window.addEventListener("resize", checkSize);
      return () => {
        observer?.disconnect();
        window.removeEventListener("resize", checkSize);
      };
    }, []);

    useEffect(() => {
      const transformer = transformerRef.current;
      if (!transformer) return;
      if (!selectedItemId) {
        selectedNodeRef.current = null;
      }
      if (selectedNodeRef.current) {
        transformer.nodes([selectedNodeRef.current]);
      } else {
        transformer.nodes([]);
      }
      transformer.getLayer()?.batchDraw();
    }, [selectedItemId, sortedItems]);

    const scale = stageSize.height / canvas.height;
    const stageWidth = stageSize.width;
    const stageHeight = stageSize.height;
    const visibleCanvasWidth = stageWidth / scale;
    const visibleCanvasHeight = stageHeight / scale;

    function updateItem(id: string, updates: Partial<CanvasItem>) {
      onCanvasChange({
        ...canvas,
        items: canvas.items.map((item) => (item.id === id ? { ...item, ...updates } : item))
      });
    }

    function removeSelected() {
      if (!selectedItemId) return;
      onCanvasChange({
        ...canvas,
        items: canvas.items.filter((item) => item.id !== selectedItemId)
      });
      onSelectItem(null);
    }

    function updateSelected(updater: (item: CanvasItem) => CanvasItem) {
      if (!selectedItemId) return;
      onCanvasChange({
        ...canvas,
        items: canvas.items.map((item) => (item.id === selectedItemId ? updater(item) : item))
      });
    }

    function rotateSelected(direction: -1 | 1) {
      updateSelected((item) => ({ ...item, rotation: item.rotation + direction * 15 }));
    }

    function flipSelected(axis: "horizontal" | "vertical") {
      updateSelected((item) => {
        if (axis === "horizontal") {
          const nextScaleX = item.scaleX * -1;
          return {
            ...item,
            x: item.scaleX >= 0 ? item.x + item.width : item.x - item.width,
            scaleX: nextScaleX
          };
        }

        const nextScaleY = item.scaleY * -1;
        return {
          ...item,
          y: item.scaleY >= 0 ? item.y + item.height : item.y - item.height,
          scaleY: nextScaleY
        };
      });
    }

    function moveSelectedLayer(direction: "front" | "back") {
      if (!selectedItemId) return;
      const targetZIndex = direction === "front" ? canvas.items.length : -1;
      onCanvasChange({
        ...canvas,
        items: normalizeZIndex(
          canvas.items.map((item) => (item.id === selectedItemId ? { ...item, zIndex: targetZIndex } : item))
        )
      });
    }

    function duplicateSelected() {
      const item = selectedItem;
      if (!item) return;
      const nextId = createCanvasItemId();
      onCanvasChange({
        ...canvas,
        items: normalizeZIndex([
          ...canvas.items,
          {
            ...item,
            id: nextId,
            x: item.x + 24,
            y: item.y + 24,
            zIndex: canvas.items.length
          }
        ])
      });
      onSelectItem(nextId);
    }

    useEffect(() => {
      const onKeyDown = (event: KeyboardEvent) => {
        if (!selectedItemId) return;
        if (event.key === "Backspace" || event.key === "Delete") {
          event.preventDefault();
          removeSelected();
        }
      };
      window.addEventListener("keydown", onKeyDown);
      return () => window.removeEventListener("keydown", onKeyDown);
    });

    return (
      <section className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[var(--surface-subtle)]">
        <div
          id="moodboard-stage-wrap"
          className="relative min-h-0 flex-1 overflow-hidden"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            const assetId = event.dataTransfer.getData("application/x-gussy-asset");
            const stage = stageRef.current;
            if (!assetId || !stage) return;
            const rect = stage.container().getBoundingClientRect();
            const x = (event.clientX - rect.left) / scale;
            const y = (event.clientY - rect.top) / scale;
            onDropAsset(assetId, {
              x: Math.max(0, Math.min(visibleCanvasWidth, x)),
              y: Math.max(0, Math.min(visibleCanvasHeight, y))
            });
          }}
        >
          <SelectionToolbar
            visible={Boolean(selectedItem) || canUndo}
            hasSelection={Boolean(selectedItem)}
            canUndo={canUndo}
            onUndo={onUndo}
            onFlipHorizontal={() => flipSelected("horizontal")}
            onFlipVertical={() => flipSelected("vertical")}
            onRotateLeft={() => rotateSelected(-1)}
            onRotateRight={() => rotateSelected(1)}
            onDuplicate={duplicateSelected}
            onBringToFront={() => moveSelectedLayer("front")}
            onSendToBack={() => moveSelectedLayer("back")}
            onDelete={removeSelected}
          />
          <div className="absolute inset-0 overflow-hidden">
            <div className="h-full w-full overflow-hidden bg-white">
              <Stage
                ref={stageRef}
                width={stageWidth}
                height={stageHeight}
                scaleX={scale}
                scaleY={scale}
                onMouseDown={(event) => {
                  if (event.target === event.target.getStage()) {
                    onSelectItem(null);
                  }
                }}
              >
                <Layer>
                  <Rect
                    x={0}
                    y={0}
                    width={Math.max(canvas.width, visibleCanvasWidth)}
                    height={Math.max(canvas.height, visibleCanvasHeight)}
                    fill={canvas.background}
                  />
                  {sortedItems.map((item) => (
                    <CanvasImageItem
                      key={item.id}
                      item={item}
                      asset={getFurnitureAssetFromList(item.assetId, assets)}
                      selected={item.id === selectedItemId}
                      onSelect={() => onSelectItem(item.id)}
                      setNodeRef={(node) => {
                        if (item.id === selectedItemId) selectedNodeRef.current = node;
                      }}
                      onChange={(updates) => updateItem(item.id, updates)}
                    />
                  ))}
                  <Transformer
                    ref={transformerRef}
                    keepRatio
                    rotateEnabled
                    enabledAnchors={[
                      "top-left",
                      "top-center",
                      "top-right",
                      "middle-left",
                      "middle-right",
                      "bottom-left",
                      "bottom-center",
                      "bottom-right"
                    ]}
                    boundBoxFunc={(_, newBox) => {
                      if (newBox.width < 30 || newBox.height < 30) return _;
                      return newBox;
                    }}
                  />
                </Layer>
              </Stage>
            </div>
          </div>
        </div>
      </section>
    );
  }
);

CanvasWorkspace.displayName = "CanvasWorkspace";

function SelectionToolbar({
  visible,
  hasSelection,
  canUndo,
  onUndo,
  onFlipHorizontal,
  onFlipVertical,
  onRotateLeft,
  onRotateRight,
  onDuplicate,
  onBringToFront,
  onSendToBack,
  onDelete
}: {
  visible: boolean;
  hasSelection: boolean;
  canUndo: boolean;
  onUndo: () => void;
  onFlipHorizontal: () => void;
  onFlipVertical: () => void;
  onRotateLeft: () => void;
  onRotateRight: () => void;
  onDuplicate: () => void;
  onBringToFront: () => void;
  onSendToBack: () => void;
  onDelete: () => void;
}) {
  if (!visible) return null;

  return (
    <div className="absolute left-1/2 top-3 z-20 flex -translate-x-1/2 items-center gap-1 rounded-md border border-[var(--line)] bg-[var(--surface)] p-1 shadow-sm">
      <ToolbarButton title="Undo" disabled={!canUndo} onClick={onUndo}>
        <Undo2 size={14} />
      </ToolbarButton>
      <div className="mx-0.5 h-5 w-px bg-[var(--line)]" />
      <ToolbarButton title="Flip horizontal" disabled={!hasSelection} onClick={onFlipHorizontal}>
        <FlipHorizontal2 size={14} />
      </ToolbarButton>
      <ToolbarButton title="Flip vertical" disabled={!hasSelection} onClick={onFlipVertical}>
        <FlipVertical2 size={14} />
      </ToolbarButton>
      <ToolbarButton title="Rotate left" disabled={!hasSelection} onClick={onRotateLeft}>
        <RotateCcw size={14} />
      </ToolbarButton>
      <ToolbarButton title="Rotate right" disabled={!hasSelection} onClick={onRotateRight}>
        <RotateCw size={14} />
      </ToolbarButton>
      <div className="mx-0.5 h-5 w-px bg-[var(--line)]" />
      <ToolbarButton title="Duplicate" disabled={!hasSelection} onClick={onDuplicate}>
        <Copy size={14} />
      </ToolbarButton>
      <ToolbarButton title="Bring to front" disabled={!hasSelection} onClick={onBringToFront}>
        <BringToFront size={14} />
      </ToolbarButton>
      <ToolbarButton title="Send to back" disabled={!hasSelection} onClick={onSendToBack}>
        <SendToBack size={14} />
      </ToolbarButton>
      <div className="mx-0.5 h-5 w-px bg-[var(--line)]" />
      <ToolbarButton title="Delete" disabled={!hasSelection} danger onClick={onDelete}>
        <Trash2 size={14} />
      </ToolbarButton>
    </div>
  );
}

function ToolbarButton({
  title,
  disabled,
  danger,
  onClick,
  children
}: {
  title: string;
  disabled?: boolean;
  danger?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={`flex h-7 w-7 items-center justify-center rounded text-[var(--ink-muted)] transition enabled:hover:bg-[var(--surface-subtle)] disabled:opacity-40 ${
        danger ? "enabled:hover:text-[var(--clay)]" : "enabled:hover:text-[var(--accent)]"
      }`}
    >
      {children}
    </button>
  );
}

function createCanvasItemId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (char) =>
    (Number(char) ^ (Math.random() * 16) >> (Number(char) / 4)).toString(16)
  );
}

function CanvasImageItem({
  item,
  asset,
  selected,
  onSelect,
  onChange,
  setNodeRef
}: {
  item: CanvasItem;
  asset: FurnitureAsset | null;
  selected: boolean;
  onSelect: () => void;
  onChange: (updates: Partial<CanvasItem>) => void;
  setNodeRef: (node: Konva.Image | null) => void;
}) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const imageRef = useRef<Konva.Image>(null);

  useEffect(() => {
    if (!asset) return;
    const nextImage = new window.Image();
    nextImage.crossOrigin = "anonymous";
    nextImage.onload = () => setImage(nextImage);
    nextImage.onerror = () => setImage(null);
    nextImage.src = asset.src;
  }, [asset]);

  useEffect(() => {
    if (selected) setNodeRef(imageRef.current);
    return () => setNodeRef(null);
  }, [selected, setNodeRef]);

  if (!asset) return null;

  return (
    <KonvaImage
      ref={imageRef}
      image={image ?? undefined}
      x={item.x}
      y={item.y}
      width={item.width}
      height={item.height}
      rotation={item.rotation}
      scaleX={item.scaleX}
      scaleY={item.scaleY}
      draggable
      shadowEnabled={selected}
      shadowColor="#315c57"
      shadowBlur={selected ? 14 : 0}
      onClick={onSelect}
      onTap={onSelect}
      onDragEnd={(event) => {
        onChange({
          x: Math.round(event.target.x()),
          y: Math.round(event.target.y())
        });
      }}
      onTransformEnd={() => {
        const node = imageRef.current;
        if (!node) return;
        const scaleX = node.scaleX();
        const scaleY = node.scaleY();
        node.scaleX(1);
        node.scaleY(1);
        onChange({
          x: Math.round(node.x()),
          y: Math.round(node.y()),
          width: Math.round(Math.max(30, node.width() * Math.abs(scaleX))),
          height: Math.round(Math.max(30, node.height() * Math.abs(scaleY))),
          rotation: Math.round(node.rotation()),
          scaleX: scaleX < 0 ? -1 : 1,
          scaleY: scaleY < 0 ? -1 : 1
        });
      }}
    />
  );
}
