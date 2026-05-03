import type { VideoJob } from "./types";

export interface ServerVideoJob extends VideoJob {
  projectId: string;
  index: number;
  diskFilename?: string;
  operationName?: string;
}

const globalForJobs = globalThis as unknown as {
  __gussyVideoJobs?: Map<string, ServerVideoJob>;
  __gussyVideoStore?: Map<string, { bytes: Buffer; mimeType: string }>;
};

if (!globalForJobs.__gussyVideoJobs) {
  globalForJobs.__gussyVideoJobs = new Map<string, ServerVideoJob>();
}

if (!globalForJobs.__gussyVideoStore) {
  globalForJobs.__gussyVideoStore = new Map<string, { bytes: Buffer; mimeType: string }>();
}

export const videoJobs = globalForJobs.__gussyVideoJobs;
export const videoStore = globalForJobs.__gussyVideoStore;

export function createVideoJob(input: { id: string; projectId: string; index: number }) {
  const job: ServerVideoJob = {
    id: input.id,
    projectId: input.projectId,
    index: input.index,
    status: "pending"
  };
  videoJobs.set(job.id, job);
  return job;
}

export function updateVideoJob(id: string, updates: Partial<ServerVideoJob>) {
  const job = videoJobs.get(id);
  if (!job) return null;
  const next = { ...job, ...updates };
  videoJobs.set(id, next);
  return next;
}
