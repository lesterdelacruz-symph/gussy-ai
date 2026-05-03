export interface FurnitureAsset {
  id: string;
  name: string;
  category: string;
  src: string;
  naturalWidth?: number;
  naturalHeight?: number;
  uploaded?: boolean;
  backgroundRemoved?: boolean;
  backgroundProcessing?: boolean;
}

export interface CanvasItem {
  id: string;
  assetId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  zIndex: number;
}

export interface CanvasState {
  width: number;
  height: number;
  background: string;
  items: CanvasItem[];
}

export interface GeneratedRender {
  id: string;
  url: string;
  base64?: string;
  mimeType: string;
  prompt: string;
  selected: boolean;
  createdAt: string;
  status?: "pending" | "succeeded";
}

export interface ImageReference {
  url?: string;
  base64?: string;
  mimeType?: string;
}

export interface VideoJob {
  id: string;
  status: "pending" | "processing" | "succeeded" | "failed";
  videoUrl?: string;
  error?: string;
}

export interface MoodboardProject {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  canvas: CanvasState;
  renders: GeneratedRender[];
  videoJobs: VideoJob[];
  stitchedVideoUrl: string | null;
}

export interface ProjectSummary {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  itemCount: number;
}
