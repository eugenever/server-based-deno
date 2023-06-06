import { serve } from "https://deno.land/std@0.187.0/http/server.ts";
import { api } from "./client.tsx";

console.log("Hono started...");

serve(api.fetch, { port: 9021 });
