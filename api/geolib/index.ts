import geolib from "https://esm.sh/geolib@3.3.3";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

console.log("Geolib worker started...");

// deno-lint-ignore require-await
serve(async (_req: Request) => {
  const dist = geolib.getPreciseDistance(
    { latitude: 51.5103, longitude: 7.49347 },
    { latitude: "51° 31' N", longitude: "7° 28' E" }
  );
  console.log(dist);

  const dist2 = geolib.getDistance(
    { latitude: 51.5103, longitude: 7.49347 },
    { latitude: "51° 31' N", longitude: "7° 28' E" }
  );
  console.log(dist2);

  return new Response(JSON.stringify({ hello: "GEOLIB" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
