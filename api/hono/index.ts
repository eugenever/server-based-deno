import { serve } from "https://deno.land/std@0.187.0/http/server.ts";
import { app } from "./client.tsx";

console.log("Hono started...");

serve(app.fetch, { port: 9021 });
