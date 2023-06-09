import { serve } from "server";
import { App } from "./app.tsx";

// deno-lint-ignore require-await
serve(async (_req: Request) => {
  console.log(App);
  return new Response(null, { status: 204 });
});
