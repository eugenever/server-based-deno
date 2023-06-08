import "https://deno.land/x/xhr@0.1.0/mod.ts";

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import axios from "https://esm.sh/axios@1.4.0";

console.log("Axios started...");

serve(async (_req: Request) => {
  const { data } = await axios.get("https://supabase.com");

  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
  });
});
