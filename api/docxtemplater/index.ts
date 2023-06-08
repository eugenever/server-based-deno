import Docxtemplater from "https://esm.sh/docxtemplater@3.37.9";
import PizZip from "https://cdn.skypack.dev/pizzip";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { join } from "https://deno.land/std@0.188.0/path/mod.ts";
import {
  writeFileSync,
  readFileSync,
} from "https://deno.land/std@0.177.0/node/fs.ts";

console.log("DOCXTEMPLATER worker started...");

// deno-lint-ignore require-await
serve(async (_req: Request) => {
  // Load the docx file as binary content
  const content = readFileSync(
    join(Deno.cwd(), "api", "docxtemplater", "template", "input.docx"),
    "binary"
  );

  const zip = new PizZip(content);

  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
  });

  // Render the document (Replace {first_name} by John, {last_name} by Doe, ...)
  doc.render({
    first_name: "John",
    last_name: "Doe",
    phone: "0652455478",
    description: "New Website",
  });

  const buf = doc.getZip().generate({
    type: "nodebuffer",
    // compression: DEFLATE adds a compression step.
    // For a 50MB output document, expect 500ms additional CPU time
    compression: "DEFLATE",
  });

  // buf is a nodejs Buffer, you can either write it to a
  // file or res.send it with express for example.
  writeFileSync(
    join(Deno.cwd(), "api", "docxtemplater", "report", "report.docx"),
    buf
  );

  return new Response(JSON.stringify({ hello: "docxtemplater" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
