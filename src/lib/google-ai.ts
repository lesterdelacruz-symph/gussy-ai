import { GoogleGenAI } from "@google/genai";

const globalForAI = globalThis as unknown as {
  __gussyGoogleAI?: GoogleGenAI;
};

export function getGoogleAI() {
  if (!globalForAI.__gussyGoogleAI) {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      throw new Error("GOOGLE_API_KEY environment variable is not set");
    }
    globalForAI.__gussyGoogleAI = new GoogleGenAI({ apiKey });
  }
  return globalForAI.__gussyGoogleAI;
}
