/** @jsx jsx */
import { Hono } from "https://deno.land/x/hono@v3.2.3/mod.ts";
import { jsx } from "https://deno.land/x/hono@v3.2.3/middleware.ts";

const app = new Hono();

app.get("/api/hono", (c) => c.text("Hello Deno from Hono!"));
app.get("/api/hono/jsx", (c) => {
  return c.html(<h1>Hello Deno from Hono JSX!</h1>);
});

export { app };
