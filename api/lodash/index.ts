// deno-lint-ignore-file require-await
import { ld } from "lodash";
import { serve } from "server";

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
