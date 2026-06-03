import { createClient } from "@supabase/supabase-js";

const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnon) {
  console.error(
    "[P.A.C.E. Portal] Missing Supabase environment variables.\n" +
    "Create a .env.local file in the project root with:\n" +
    "  VITE_SUPABASE_URL=...\n" +
    "  VITE_SUPABASE_ANON_KEY=...\n" +
    "Do NOT use a service role key here — use the publishable/anon key only."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnon);
