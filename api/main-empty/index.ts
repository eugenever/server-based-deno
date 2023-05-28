import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

console.log("Main empty started...");

serve(
  async (_req: Request) => {
    // const text = await Deno.readFileTokio("./testing.md");
    const bytes = await Deno.readFile("./testing.md");
    const _text = new TextDecoder().decode(bytes);
    // console.log(text);

    return new Response(JSON.stringify({ hello: "WORLD!!!!" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  },
  { port: 9009 }
);
