import {
  add,
  multiply,
} from "https://x.nest.land/ramda@0.27.0/source/index.js";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

interface reqPayload {
  name: string;
}

function totalCost(outbound: number, inbound: number, tax: number): number {
  return multiply(add(outbound, inbound), tax);
}

serve(
  async (req: Request) => {
    console.log(totalCost(19, 31, 1.2));
    console.log(totalCost(45, 27, 1.15));

    const { name }: reqPayload = await req.json();
    const data = {
      message: `Hello ${name} from foo!`,
      test: "foo",
    };

    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json", Connection: "keep-alive" },
    });
  },
  { port: 9005 }
);
