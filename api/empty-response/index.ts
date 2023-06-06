// deno-lint-ignore-file
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

console.log("Empty response start...");

// stop server OAK, stop listen port
const controller = new AbortController();
const { signal } = controller;

serve(
  async (_req: Request) => {
    const fib = await Deno.fibonacci(10);
    return new Response(null, { status: 204 });
  },
  { signal }
);
