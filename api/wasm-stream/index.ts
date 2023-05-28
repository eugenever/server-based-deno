import { serve } from "server";
import { init } from "init";

serve(async (_req: Request) => {
  // deno-lint-ignore require-await
  await init(async (imports: any) => {
    return WebAssembly.instantiateStreaming(
      fetch("https://esm.sh/@dqbd/tiktoken@1.0.3/lite/tiktoken_bg.wasm"),
      imports
    );
  });

  return new Response(
    JSON.stringify({
      hello: "world",
    }),
    {
      headers: { "Content-Type": "application/json" },
    }
  );
});
