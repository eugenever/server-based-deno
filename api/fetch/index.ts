import { serve } from "server";

async function handler(_req: Request): Promise<Response> {
  const resp = await fetch("https://api.github.com/users/denoland", {
    // The init object here has an headers object containing a
    // header that indicates what type of response we accept.
    // We're not specifying the method field since by default
    // fetch makes a GET request.
    headers: {
      accept: "application/json",
    },
  });
  const resp_json = await resp.json();
  console.log(resp_json);
  return new Response(JSON.stringify(resp_json, null, 2), {
    status: resp.status,
    headers: {
      "content-type": "application/json",
    },
  });
}

serve(handler);
