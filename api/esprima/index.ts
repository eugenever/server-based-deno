import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import esprima from "https://dev.jspm.io/esprima";

// deno-lint-ignore require-await
serve(async (_req: Request) => {
  const program = "const answer = 42";
  console.log(esprima.tokenize(program));

  return new Response(JSON.stringify(program), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
