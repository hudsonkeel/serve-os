import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

let instance: ReturnType<typeof createClient> | null = null;

export function getSupabaseBrowserClient() {
  if (!instance) {
    instance = createClient(env.supabaseUrl, env.supabaseAnonKey);
  }
  return instance;
}
