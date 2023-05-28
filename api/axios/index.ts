import "https://deno.land/x/xhr@0.1.0/mod.ts";

import { serve } from "server";
import axios from "axios";

console.log("Axios started...");

serve(async (_req: Request) => {
  const { data } = await axios.get("https://supabase.com");

  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
  });
});
