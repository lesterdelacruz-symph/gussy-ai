export const SUPABASE_PROJECT_ID = "kzgrpjijmsslmevpgtsk";
export const SUPABASE_STORAGE_BUCKET = "project-media";

export function getSupabaseUrl() {
  return process.env.NEXT_PUBLIC_SUPABASE_URL || `https://${SUPABASE_PROJECT_ID}.supabase.co`;
}

export function getSupabaseAnonKey() {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
}

export function hasSupabaseBrowserConfig() {
  return Boolean(getSupabaseUrl() && getSupabaseAnonKey());
}

export function getSupabaseServiceRoleKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || "";
}

export function hasSupabaseServiceRoleKey() {
  return Boolean(getSupabaseServiceRoleKey());
}

export function assertSupabaseServerConfig() {
  const url = getSupabaseUrl();
  const serviceRoleKey = getSupabaseServiceRoleKey();
  if (!url || !serviceRoleKey) {
    throw new Error("Supabase server env is missing. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }
  return { url, serviceRoleKey };
}
