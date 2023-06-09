import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { template } from "./template.ts";
import { CV } from "./cv.ts";

console.log("DOCX worker started...");

serve(
  // deno-lint-ignore require-await
  async (_req: Request) => {
    const start = performance.now();
    template();
    CV();
    const end = performance.now();
    // console.log(`Duration DOCX = ${end - start} ms`);

    return new Response(JSON.stringify({ hello: "DOCX" }), {
      headers: { "Content-Type": "application/json", Connection: "keep-alive" },
    });
  },
  { port: 9007 }
);
