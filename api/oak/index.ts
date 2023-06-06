import {
  Application,
  Router,
  Context,
} from "https://deno.land/x/oak@v12.3.0/mod.ts";

import { Pool } from "https://deno.land/x/postgres@v0.14.2/mod.ts";

import {
  Counter,
  Registry,
} from "https://deno.land/x/ts_prometheus@v0.3.0/mod.ts";

console.log("OAK worker started...");

const POOL_CONNECTIONS = 20;
const dbPool = new Pool(
  {
    user: "postgres",
    password: "123",
    database: "rust_test",
    hostname: "127.0.0.1",
    port: 5432,
    tls: {
      enabled: false,
    },
    connection: {
      attempts: 5,
    },
  },
  POOL_CONNECTIONS
);

const counter = Counter.with({
  name: "http_requests_total",
  help: "The total HTTP requests",
  labels: ["path", "method", "status"],
});

async function runQuery(query: string) {
  const client = await dbPool.connect();
  let result;
  try {
    result = await client.queryObject(query);
  } finally {
    client.release();
  }
  return result;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// stop server OAK, stop listen port
const controller = new AbortController();
const { signal } = controller;

const router = new Router({ prefix: "/api/oak" });

router
  // Note: path will be prefixed with function name
  .get("/", (context: Context) => {
    context.response.body = `<!DOCTYPE html>
    <html>
      <head><title>Hello oak!</title><head>
      <body>
        <h1>Hello oak!</h1>
        <h2>This is an example Oak server running on Edge Functions!</h2>
      </body>
    </html>
  `;
  })
  .post("/fibonacci", async (context: Context) => {
    try {
      const result = context.request.body({ type: "json", limit: 0 });
      const body = await result.value;
      const n = body?.n || 10;

      const fib = await Deno.fibonacci(n);
      context.response.body = fib;
    } catch (e) {
      console.error(e);
    }
  })
  .post("/fibonacci2", async (context: Context) => {
    try {
      const result = context.request.body({ type: "json", limit: 0 });
      const body = await result.value;
      const n = body?.n || 10;

      const fib = await Deno.fibonacci2(n);
      context.response.body = fib;
    } catch (e) {
      console.error(e);
    }
  })
  .post("/postgres", async (context: Context) => {
    try {
      const users = await runQuery("SELECT ID, NAME FROM USERS");
      context.response.body = users.rows;
    } catch (e) {
      console.error(e);
    }
  })
  .post("/greet", async (context: Context) => {
    // highload
    await delay(10000);
    // Note: request body will be streamed to the function as chunks, set limit to 0 to fully read it.
    const result = context.request.body({ type: "json", limit: 0 });
    const body = await result.value;
    const name = body.name || "you";

    context.response.body = { msg: `Hey ${name}!` };
  })
  .get("/redirect", (context: Context) => {
    context.response.redirect("https://www.example.com");
  })
  .get("/reboot", () => {
    // Work ===> event loop complited
    controller.abort();
  })
  .get("/metrics", (context: Context) => {
    context.response.headers.set("Content-Type", "");
    context.response.body = Registry.default.metrics();
  });

const app = new Application();

app.use(async (context: Context, next: () => Promise<unknown>) => {
  // before requests
  const start = Date.now();
  await next();
  // after serve requests and before send response
  const ms = Date.now() - start;
  context.response.headers.set("X-Response-Time", `${ms}ms`);
});

app.use(async (context: Context, next: () => Promise<unknown>) => {
  await next();
  counter
    .labels({
      path: context.request.url.pathname,
      method: context.request.method,
      status: String(context.response.status || 200),
    })
    .inc();
});

app.use(router.routes());
app.use(router.allowedMethods());

// if the routers above do not match, then the response from the middleware is called
app.use((context: Context) => {
  context.response.type = "application/json; charset=utf-8";
  context.response.status = 404;
  context.response.body = { error: "Router not found" };
});

const listenPromise = app.listen({ port: 8000, signal });

await listenPromise;
