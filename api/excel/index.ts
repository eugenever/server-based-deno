import "https://deno.land/x/xhr@0.1.0/mod.ts";

// @deno-types="https://cdn.sheetjs.com/xlsx-0.19.3/package/types/index.d.ts"
import * as XLSX from "https://cdn.sheetjs.com/xlsx-0.19.3/package/xlsx.mjs";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import axios from "https://esm.sh/axios@1.4.0";

console.log("sheetjs worker started...");

serve(async (_req: Request) => {
  const url = "https://sheetjs.com/data/executive.json";
  const { data } = await axios.get(url);

  const prez = data.filter((row) =>
    row.terms.some((term) => term.type === "prez")
  );
  const rows = prez.map((row) => ({
    name: row.name.first + " " + row.name.last,
    birthday: row.bio.birthday,
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Dates");
  XLSX.writeFile(workbook, "Presidents.xlsx");

  console.log("Excel file saved...");

  return new Response(JSON.stringify({ hello: "WORLD!" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
