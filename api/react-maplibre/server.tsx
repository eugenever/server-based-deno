import { Application, Router } from "oak";
import { bundle } from "emit";

import { React, ReactDOMServer } from "@/dep.ts";

import App from "@/app.tsx";

export async function runServer() {
  const app = new Application();

  const router = new Router();
  router.get("/api/react-maplibre", handlePage);

  const url = new URL("./client.tsx", import.meta.url);
  const result = await bundle(url);
  const { code } = result;

  const serverRouter = new Router();
  serverRouter.get("/api/react-maplibre/static/client.js", (context: any) => {
    context.response.headers.set("Content-Type", "text/html");
    context.response.body = code;
  });

  app.use(router.routes());
  app.use(serverRouter.routes());

  app.use(router.allowedMethods());

  console.log("Server is running on http://localhost:9000/");
  await app.listen({ port: 8000 });
}

const mapOptions = {
  zoom: 4,
  style: "https://wms.wheregroup.com/tileserver/style/osm-bright.json",
  center: [7.0851268, 50.73884],
};

function handlePage(ctx: any) {
  try {
    const body = ReactDOMServer.renderToString(<App options={mapOptions} />);
    ctx.response.body = `<!DOCTYPE html>
    <html lang="en">
        <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <link rel="stylesheet" href="styles.css">
                <link rel="stylesheet" href="https://stackpath.bootstrapcdn.com/bootstrap/4.3.1/css/bootstrap.min.css" integrity="sha384-ggOyR0iXCbMQv3Xipma34MD+dH/1fQ784/j6cY/iJTQUOhcWr7x9JvoRxT2MZw1T" crossorigin="anonymous">
                <title>Map Libre</title>
                
                <script>
                window.__INITIAL_STATE__ = {"mapOptions": ${JSON.stringify(
                  mapOptions
                )}};
                </script>
        </head>
        <body>
                <div id="root">${body}</div>
                <script  src="http://localhost:9000/api/react-maplibre/static/client.js" defer></script>
        </body>
    </html>`;
  } catch (error) {
    console.error(error);
  }
}
