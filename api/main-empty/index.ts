import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  dateToString,
  registerFormat,
} from "https://deno.land/x/date_format_deno@v1.1.0/mod.ts";

console.log("Main empty started...");

serve(
  async (_req: Request) => {
    // const text = await Deno.readFileTokio("./testing.md");
    const bytes = await Deno.readFile("C:/Users/user/ДОКУМЕНТЫ/Work/edge-runtime/testing.md");
    const _text = new TextDecoder().decode(bytes);
    // console.log(text);
    registerFormat({ myFormat: "yyyy/MM/dd hh-mm-ss" });

    dateToString("MYFORMAT"); // return : "2020/07/06 05-04-03"

    // redefine format
    registerFormat({ default: "hh:mm:ss dd.MM.yyyy", time: "hh:mm" });

    const date = new Date("2020-12-11T10:09:54.321");
    dateToString(date); // return : "10:09:54 11.12.2020"
    dateToString("TIME", date); // return : "09:54"
    // console.log(dateToString(date));

    return new Response(JSON.stringify({ hello: "WORLD!!!!" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  },
  { port: 9009 }
);
