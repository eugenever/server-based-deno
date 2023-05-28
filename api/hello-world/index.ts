import { serve } from "server";

interface reqPayload {
  name: string;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

console.log("Hello, world started...");

serve(
  async (req: Request) => {
    const { name }: reqPayload = await req.json();
    const data = {
      message: `Hello ${name} from foo!`,
      test: "foo",
    };

    // emulates highload
    await delay(1);

    return new Response(JSON.stringify(data), {
      headers: {
        "Content-Type": "application/json",
        Connection: "keep-alive",
      },
    });
  },
  { port: 9005 }
);
