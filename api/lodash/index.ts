// deno-lint-ignore-file require-await
import { ld } from "https://x.nest.land/deno-lodash@1.0.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (_req: Request) => {
  const words = [
    "sky",
    "wood",
    "forest",
    "falcon",
    "pear",
    "ocean",
    "universe",
  ];

  const first = ld.first(words);
  const last = ld.last(words);

  console.log(`First element: ${first}`);
  console.log(`Last element: ${last}`);

  return new Response(null, { status: 204 });
});
