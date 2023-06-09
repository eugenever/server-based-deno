import pdf from "https://cdn.skypack.dev/pdfkit";
import { serve } from "https://x.nest.land/deno-lodash@1.0.0/mod.ts";

console.log("PDF = ", pdf);
console.log("PDFKit started...");

serve(
  // deno-lint-ignore require-await
  async (_req: Request) => {
    return new Response(JSON.stringify({ pdfkit: "pdfkit" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  },
  { port: 9022 }
);
