import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { assertSupabaseServerConfig, getSupabaseAnonKey, getSupabaseServiceRoleKey, getSupabaseUrl } from "./supabase-config";

let adminClient: SupabaseClient | null = null;

export function getSupabaseAdminClient() {
  if (!adminClient) {
    const { url, serviceRoleKey } = assertSupabaseServerConfig();
    adminClient = createClient(url, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
  }
  return adminClient;
}

export function getSupabaseServerClient(accessToken: string) {
  const serviceRoleKey = getSupabaseServiceRoleKey();
  if (serviceRoleKey) {
    return getSupabaseAdminClient();
  }

  const url = getSupabaseUrl();
  const anonKey = getSupabaseAnonKey();
  if (!url || !anonKey) {
    throw new Error("Supabase server env is missing. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }

  return createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  });
}

export async function getAuthenticatedUser(
  request: NextRequest
): Promise<{ user: User; accessToken: string; client: SupabaseClient }> {
  const accessToken = getBearerToken(request);
  if (!accessToken) {
    throw new Error("Authentication required.");
  }

  const client = getSupabaseServerClient(accessToken);
  const { data, error } = await client.auth.getUser(accessToken);
  if (error || !data.user) {
    throw new Error("Invalid or expired session.");
  }

  return { user: data.user, accessToken, client };
}

export async function assertProjectOwner(projectId: string, userId: string, client?: SupabaseClient) {
  const database = client ?? getSupabaseAdminClient();
  const { data, error } = await database
    .from("projects")
    .select("id, owner_id")
    .eq("id", projectId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data || data.owner_id !== userId) {
    throw new Error("Project not found.");
  }
}

function getBearerToken(request: NextRequest) {
  const header = request.headers.get("authorization") ?? "";
  const [scheme, token] = header.split(" ");
  return scheme?.toLowerCase() === "bearer" ? token : null;
}
