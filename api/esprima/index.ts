import { serve } from "server";
import esprima from "esprima";

// deno-lint-ignore require-await
serve(async (_req: Request) => {
  const program = "const answer = 42";
  console.log(esprima.tokenize(program));

  return new Response(JSON.stringify(program), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
