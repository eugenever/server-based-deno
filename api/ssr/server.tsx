import { Application, Router } from "https://deno.land/x/oak@v12.3.0/mod.ts";
import { bundle } from "https://deno.land/x/emit/mod.ts";

import { React, ReactDOMServer } from "./dep.ts";

import App from "./app.tsx";

const todos: Map<number, any> = new Map();

function init() {
  todos.set(todos.size + 1, { id: Date.now(), task: "build an ssr deno app" });
  todos.set(todos.size + 1, {
    id: Date.now(),
    task: "write blogs on deno ssr",
  });
}

init();

export async function runServer() {
  const app = new Application();

  const router = new Router();
  router.get("/api/ssr", handlePage);

  router
    .get("/api/ssr/todos", (context: any) => {
      context.response.body = Array.from(todos.values());
    })
    .get("/api/ssr/todos/:id", (context: any) => {
      if (
        context.params &&
        context.params.id &&
        todos.has(Number(context.params.id))
      ) {
        context.response.body = todos.get(Number(context.params.id));
      } else {
        context.response.status = 404;
      }
    })
    .post("/api/ssr/todos", async (context: any) => {
      const body = context.request.body();
      if (body.type === "json") {
        const todo = await body.value;
        todos.set(Date.now(), todo);
      }
      context.response.body = { status: "OK" };
    });

  const url = new URL("./client.tsx", import.meta.url);
  const result = await bundle(url);
  const { code } = result;

  const serverRouter = new Router();
  serverRouter.get("/api/ssr/static/client.js", (context: any) => {
    context.response.headers.set("Content-Type", "text/html");
    context.response.body = code;
  });

  app.use(router.routes());
  app.use(serverRouter.routes());

  app.use(router.allowedMethods());

  console.log("Server is running on http://localhost:9000/");
  await app.listen({ port: 8000 });
}

function handlePage(ctx: any) {
  try {
    const body = ReactDOMServer.renderToString(
      <App todos={Array.from(todos.values())} />
    );
    ctx.response.body = `<!DOCTYPE html>
    <html lang="en">
        <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <link rel="stylesheet" href="https://stackpath.bootstrapcdn.com/bootstrap/4.3.1/css/bootstrap.min.css" integrity="sha384-ggOyR0iXCbMQv3Xipma34MD+dH/1fQ784/j6cY/iJTQUOhcWr7x9JvoRxT2MZw1T" crossorigin="anonymous">
                <title>Document</title>
                <script>
                window.__INITIAL_STATE__ = {"todos": ${JSON.stringify(
                  Array.from(todos.values())
                )}};
                </script>
        </head>
        <body >
                <div id="root">${body}</div>
                <script  src="http://localhost:9000/api/ssr/static/client.js" defer></script>
        </body>
    </html>`;
  } catch (error) {
    console.error(error);
  }
}
