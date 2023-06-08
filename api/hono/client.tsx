/** @jsx jsx */
import { Hono } from "https://deno.land/x/hono@v3.2.3/mod.ts";
import { jsx } from "https://deno.land/x/hono@v3.2.3/middleware.ts";
// import { Pool } from "https://deno.land/x/postgres@v0.14.2/mod.ts";
import {
  Counter,
  Registry,
} from "https://deno.land/x/ts_prometheus@v0.3.0/mod.ts";

// const POOL_CONNECTIONS = 20;
// const dbPool = new Pool(
//   {
//     user: "postgres",
//     password: "123",
//     database: "rust_test",
//     hostname: "127.0.0.1",
//     port: 5432,
//     tls: {
//       enabled: false,
//     },
//     connection: {
//       attempts: 5,
//     },
//   },
//   POOL_CONNECTIONS
// );

// async function runQuery(query: string) {
//   const client = await dbPool.connect();
//   let result;
//   try {
//     result = await client.queryObject(query);
//   } finally {
//     client.release();
//   }
//   return result;
// }

const counter = Counter.with({
  name: "http_requests_total",
  help: "The total HTTP requests",
  labels: ["path", "method", "status"],
});

const app = new Hono();

app.get("/", (c) => c.text("Hello Deno from Hono!"));
app.get("/jsx", (c) => {
  return c.html(<h1>Hello Deno from Hono JSX!</h1>);
});

app.all("/fibonacci", async (c) => {
  const fib = await Deno.fibonacci(10);
  c.status(201);
  return c.text(fib);
});

app.all("/fibonacci2", async (c) => {
  const fib = await Deno.fibonacci2(10);
  c.status(201);
  return c.text(fib);
});

app.all("/postgres", async (c) => {
  try {
    // const users = await runQuery("SELECT ID, NAME FROM USERS");
    // return c.json(users.rows);
  } catch (e) {
    console.error(e);
  }
});

app.get("/metrics", (c) => {
  c.header("Content-Type", "");
  console.log(Registry.default.metrics());
  return c.text(Registry.default.metrics());
});

app.use("*", async (c, next: () => Promise<void>) => {
  await next();
  console.log(c.req.path, c.req.method, c.res.status);
  counter
    .labels({
      path: c.req.path,
      method: c.req.method,
      status: String(c.res.status || 200),
    })
    .inc();
});

const api = new Hono();
api.route("/api/hono", app);

export { api };
