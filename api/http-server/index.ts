import { serve, ConnInfo } from "https://deno.land/std@0.168.0/http/server.ts";

async function reqHandler(req: Request, _conn: ConnInfo) {
  console.log(req);
  if (req.method !== "POST") {
    return new Response(null, { status: 405 });
  }
  return new Response("Hello world!");
}

serve(reqHandler, { port: 5000 });
