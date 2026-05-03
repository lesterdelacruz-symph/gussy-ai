"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAnonKey, getSupabaseUrl, hasSupabaseBrowserConfig } from "./supabase-config";

let browserClient: SupabaseClient | null = null;

export function getSupabaseBrowserClient() {
  if (!hasSupabaseBrowserConfig()) return null;
  if (!browserClient) {
    browserClient = createClient(getSupabaseUrl(), getSupabaseAnonKey());
  }
  return browserClient;
}
