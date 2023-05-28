import { Application, Router } from "oak";
import { Pool } from "postgres";

console.log("OAK worker started...");

const POOL_CONNECTIONS = 10;
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

const router = new Router();

router
  // Note: path will be prefixed with function name
  .get("/api/oak", (context) => {
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
  .post("/api/oak/postgres", async (context) => {
    try {
      const users = await runQuery("SELECT ID, NAME FROM USERS");
      context.response.body = users.rows;
    } catch (e) {
      console.error(e);
      /*
      console.log("Retry connect to PostgreSQL...");
      const client = await dbPool.connect();
      const users = await client.queryObject("SELECT ID, NAME FROM USERS");
      client.release();
      console.log("Reconnect successful...");
      context.response.body = users.rows;
      */
    }
  })
  .post("/api/oak/greet", async (context) => {
    // highload
    await delay(5000);
    // Note: request body will be streamed to the function as chunks, set limit to 0 to fully read it.
    const result = context.request.body({ type: "json", limit: 0 });
    const body = await result.value;
    const name = body.name || "you";

    context.response.body = { msg: `Hey ${name}!` };
  })
  .get("/api/oak/redirect", (context) => {
    context.response.redirect("https://www.example.com");
  })
  .get("/api/oak/reboot", () => {
    // Work ===> event loop complited
    controller.abort();
  });

const app = new Application();

app.use(async (context, next) => {
  // before requests
  const start = Date.now();
  await next();
  // after serve requests and before send response
  const ms = Date.now() - start;
  context.response.headers.set("X-Response-Time", `${ms}ms`);
});

app.use(router.routes());
app.use(router.allowedMethods());

const listenPromise = app.listen({ port: 8000, signal });

await listenPromise;

// and you can do something after the close to shutdown
