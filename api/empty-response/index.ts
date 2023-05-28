// deno-lint-ignore-file
import { serve } from "server";

console.log("Empty response start...");

// stop server OAK, stop listen port
const controller = new AbortController();
const { signal } = controller;

serve(
  async (_req: Request) => {
    return new Response(null, { status: 204 });
  },
  { signal }
);
