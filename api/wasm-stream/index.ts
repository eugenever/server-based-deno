import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { init } from "https://esm.sh/@dqbd/tiktoken/lite/init";

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
