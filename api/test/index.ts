import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function hello(name: string): string {
  return "Hello " + capitalize(name);
}

// console.log(Deno);

serve(async (_req: Request) => {
  /*
    // WORK
    console.log(hello("john!!!!"));
    console.log(hello("Sarah"));
    console.log(hello("kai"));

    const jsonResponse = await fetch("https://api.github.com/users/denoland");
    const jsonData = await jsonResponse.json();
    console.log(jsonData);
    */

  // WORK
  const f = await Deno.readFileTokio("./testing.md");
  console.log(f);

  /** WORK
   * Output: HTML Data
   */
  // const textResponse = await fetch("https://deno.land/");
  // const textData = await textResponse.text();
  // console.log(textData);

  return new Response(JSON.stringify({ hello: "world" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});

/*
// WORK
function capitalize(word) {
    return word.charAt(0).toUpperCase() + word.slice(1);
}

function hello(name) {
    return "Hello " + capitalize(name);
}

console.log(hello("john"));
console.log(hello("Sarah"));
console.log(hello("kai"));
*/
