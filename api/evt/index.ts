import { serve } from "https://deno.land/std@0.187.0/http/server.ts";
import { Evt } from "https://deno.land/x/evt@v2.4.22/mod.ts";

console.log("EVT started...");

serve(
  (_req: Request) => {
    console.log(Evt);
    return new Response(JSON.stringify({ hello: "EVT" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  },
  { port: 9022 }
);
