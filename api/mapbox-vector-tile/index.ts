import mapVT from "https://esm.sh/@mapbox/vector-tile@1.3.1";
import Protobuf from "https://esm.sh/pbf@3.2.1";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

console.log("MapboxVectorTile worker started...");

// deno-lint-ignore require-await
serve(async (_req: Request) => {
  try {
    const tile = new mapVT.VectorTile(new Protobuf());
    console.log(tile);
  } catch (error) {
    console.log("Error MapboxVectorTile: ", error.message);
  }
  return new Response(JSON.stringify({ hello: "MapboxVectorTile" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
