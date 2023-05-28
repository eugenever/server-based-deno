import { serve } from "server";

async function reqHandler(req: Request, _conn: connInfo) {
  console.log(req);
  if (req.method !== "POST") {
    return new Response(null, { status: 405 });
  }
  return new Response("Hello world!");
}

serve(reqHandler, { port: 5000 });
