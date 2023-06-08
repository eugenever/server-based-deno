import { createServer } from "server_ultra";
import { React } from "./deps.ts";

// This is your main app entrypoint that you created earlier,
// you can adjust the path if you named it differently.
import App from "./app.tsx";

export const server = await createServer({
  // This is the path to the importMap you created earlier.
  importMapPath: import.meta.resolve("./importMap.json"),

  // This is the entrypoint that is sent along with the
  // server rendered HTML to the browser.
  browserEntrypoint: import.meta.resolve("./client.tsx"),
});

// Add a route to the server that will handle all incoming GET requests.
server.get("*", async (context) => {
  // Render the incoming request to a https://developer.mozilla.org/docs/Web/API/ReadableStream.
  const stream = await server.render(<App />);

  // Return a response with the server rendered HTML.
  return context.body(stream, 200, {
    "content-type": "text/html; charset=utf-8",
  });
});
