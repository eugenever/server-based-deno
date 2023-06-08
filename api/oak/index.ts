import {
  Application,
  Router,
  Context,
} from "https://deno.land/x/oak@v12.3.0/mod.ts";
// import { Pool } from "https://deno.land/x/postgres@v0.14.2/mod.ts";
import {
  Counter,
  Registry,
} from "https://deno.land/x/ts_prometheus@v0.3.0/mod.ts";
import { join } from "https://deno.land/std@0.188.0/path/mod.ts";
// excel
import { genReport } from "./xlsx-template/index.ts";
// docx
import { template } from "./docx/template.ts";
import { CV } from "./docx/cv.ts";
// pdf
import { PDFDocument, rgb } from "https://cdn.skypack.dev/pdf-lib@^1.11.1?dts";
import fontkit from "https://cdn.skypack.dev/@pdf-lib/fontkit@^1.0.0?dts";

console.log("OAK worker started...");

// const POOL_CONNECTIONS = 60;
// const dbPool = new Pool(
//   {
//     user: "postgres",
//     password: "123",
//     database: "rust_test",
//     hostname: "127.0.0.1",
//     port: 5432,
//     tls: {
//       enabled: false,
//     },
//     connection: {
//       attempts: 5,
//     },
//   },
//   POOL_CONNECTIONS
// );

const counter = Counter.with({
  name: "http_requests_total",
  help: "The total HTTP requests",
  labels: ["path", "method", "status"],
});

// async function runQuery(query: string) {
//   const client = await dbPool.connect();
//   let result;
//   try {
//     result = await client.queryObject(query);
//   } finally {
//     client.release();
//   }
//   return result;
// }

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// stop server OAK, stop listen port
const controller = new AbortController();
const { signal } = controller;

const router = new Router({ prefix: "/api/oak" });

router
  // Note: path will be prefixed with function name
  .get("/", (context: Context) => {
    context.response.body = `<!DOCTYPE html>
    <html>
      <head><title>Hello oak!</title><head>
      <body>
        <h1>Hello oak!</h1>
        <h2>This is an example Oak server running on Edge Functions!</h2>
      </body>
    </html>
  `;
  })
  .all("/fibonacci", async (context: Context) => {
    try {
      // const result = context.request.body({ type: "json", limit: 0 });
      // const body = await result.value;
      // const n = body?.n || 10;

      const fib = await Deno.fibonacci(18);
      context.response.body = fib;
    } catch (e) {
      console.error(e);
    }
  })
  .all("/fibonacci2", async (context: Context) => {
    try {
      //   const result = context.request.body({ type: "json", limit: 0 });
      //   const body = await result.value;
      //   const n = body?.n || 10;

      const fib = await Deno.fibonacci2(10);
      context.response.body = fib;
    } catch (e) {
      console.error(e);
    }
  })
  .post("/postgres", async (context: Context) => {
    try {
      // const users = await runQuery("SELECT ID, NAME FROM USERS");
      // context.response.body = users.rows;
    } catch (e) {
      console.error(e);
    }
  })
  .post("/excel", async (context: Context) => {
    // Load an XLSX file into memory
    const data = await Deno.readFile(
      join(Deno.cwd(), "api", "xlsx-template", "templates", "template1.xlsx")
    );

    const nameReport = "report1.xlsx";
    genReport(data, nameReport);

    context.response.body = { hello: "XLSX Template" };
  })
  .post("/docx", async (context: Context) => {
    await template();
    await CV();
    context.response.body = { hello: "DOCX Template" };
  })
  .post("/pdf", async (context: Context) => {
    const fontBytes = await Deno.readFile(
      join(Deno.cwd(), "api", "pdf-lib", "assets", "Ubuntu-R.ttf")
    );

    const jpgImageBytes = await Deno.readFile(
      join(Deno.cwd(), "api", "pdf-lib", "assets", "cat_riding_unicorn.jpg")
    );

    const pngImageBytes = await Deno.readFile(
      join(Deno.cwd(), "api", "pdf-lib", "assets", "minions_banana_alpha.png")
    );

    // Create a new PDFDocument
    const pdfDoc = await PDFDocument.create();

    // Embed the Ubuntu font
    pdfDoc.registerFontkit(fontkit);
    const customFont = await pdfDoc.embedFont(fontBytes);

    // Embed the JPG and PNG images
    const jpgImage = await pdfDoc.embedJpg(jpgImageBytes);
    const pngImage = await pdfDoc.embedPng(pngImageBytes);

    // Define and measure a string of text
    const text = "This is text in an embedded font!";
    const textSize = 35;
    const textWidth = customFont.widthOfTextAtSize(text, textSize);
    const textHeight = customFont.heightAtSize(textSize);

    // Get the image dimensions scaled to 50% of their original size
    const jpgDims = jpgImage.scale(0.5);
    const pngDims = pngImage.scale(0.5);

    // Add a page to the PDFDocument
    const page = pdfDoc.addPage();

    // Draw the string of text on the page using the Ubuntu font
    page.drawText(text, {
      x: 40,
      y: 450,
      size: textSize,
      font: customFont,
      color: rgb(0, 0.53, 0.71),
    });

    // Draw a rectangle around the text
    page.drawRectangle({
      x: 40,
      y: 450,
      width: textWidth,
      height: textHeight,
      borderColor: rgb(1, 0, 0),
      borderWidth: 1.5,
    });

    // Draw the JPG image
    page.drawImage(jpgImage, {
      x: page.getWidth() / 2 - jpgDims.width / 2,
      y: page.getHeight() / 2 - jpgDims.height / 2 + 250,
      width: jpgDims.width,
      height: jpgDims.height,
    });

    // Draw the PNG image
    page.drawImage(pngImage, {
      x: page.getWidth() / 2 - pngDims.width / 2 + 25,
      y: page.getHeight() / 2 - pngDims.height + 125,
      width: pngDims.width,
      height: pngDims.height,
    });

    // Save the PDFDocument and write it to a file
    const pdfBytes = await pdfDoc.save();
    await Deno.writeFile(
      join(Deno.cwd(), "api", "pdf-lib", "report", "report.pdf"),
      pdfBytes
    );

    context.response.body = { hello: "PDF Template" };
  })
  .post("/greet", async (context: Context) => {
    // highload
    await delay(10000);
    // Note: request body will be streamed to the function as chunks, set limit to 0 to fully read it.
    const result = context.request.body({ type: "json", limit: 0 });
    const body = await result.value;
    const name = body.name || "you";

    context.response.body = { msg: `Hey ${name}!` };
  })
  .get("/redirect", (context: Context) => {
    context.response.redirect("https://www.example.com");
  })
  .get("/reboot", () => {
    // Work ===> event loop complited
    controller.abort();
  })
  .get("/metrics", (context: Context) => {
    context.response.headers.set("Content-Type", "");
    context.response.body = Registry.default.metrics();
  });

const app = new Application();

app.use(async (context: Context, next: () => Promise<unknown>) => {
  // before requests
  const start = Date.now();
  await next();
  // after serve requests and before send response
  const ms = Date.now() - start;
  context.response.headers.set("X-Response-Time", `${ms}ms`);
});

app.use(async (context: Context, next: () => Promise<unknown>) => {
  await next();
  counter
    .labels({
      path: context.request.url.pathname,
      method: context.request.method,
      status: String(context.response.status || 200),
    })
    .inc();
});

app.use(router.routes());
app.use(router.allowedMethods());

// if the routers above do not match, then the response from the middleware is called
app.use((context: Context) => {
  context.response.type = "application/json; charset=utf-8";
  context.response.status = 404;
  context.response.body = { error: "Router not found" };
});

const listenPromise = app.listen({ port: 8001, signal });

await listenPromise;
