import gdal from "gdal";
import server from "server";
import path from "path";

console.log("GDAL start...");
console.log(gdal);

// deno-lint-ignore require-await
server.serve(async (_req: Request) => {
  const dataset = gdal.open(
    path.join(Deno.cwd(), "api", "gdal", "assets", "multiband.tif")
  );

  console.log("number of bands: " + dataset.bands.count());
  console.log("width: " + dataset.rasterSize.x);
  console.log("height: " + dataset.rasterSize.y);
  console.log("geotransform: " + dataset.geoTransform);
  console.log("srs: " + (dataset.srs ? dataset.srs.toWKT() : "null"));

  return new Response(JSON.stringify({ hello: "GDAL" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
