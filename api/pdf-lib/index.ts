import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { join } from "https://deno.land/std@0.188.0/path/mod.ts";
import { PDFDocument, rgb } from "https://cdn.skypack.dev/pdf-lib@^1.11.1?dts";
import fontkit from "https://cdn.skypack.dev/@pdf-lib/fontkit@^1.0.0?dts";

console.log("PDF-Lib worker started...");

serve(
  async (_req: Request) => {
    /*
    // Fetch an Ubuntu font
    const url = "https://pdf-lib.js.org/assets/ubuntu/Ubuntu-R.ttf";
    const fontBytes = await fetch(url).then((res) => res.arrayBuffer());
    // Fetch a JPG image
    const jpgUrl = "https://pdf-lib.js.org/assets/cat_riding_unicorn.jpg";
    const jpgImageBytes = await fetch(pngUrl).then((res) => res.arrayBuffer());
    // Fetch a PNG image
    const pngUrl = "https://pdf-lib.js.org/assets/minions_banana_alpha.png";
    const pngImageBytes = await fetch(pngUrl).then((res) => res.arrayBuffer());
    */

    const start = performance.now();

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

    const end = performance.now();
    // console.log(`Duration PDF-Lib = ${end - start} ms`);

    return new Response(JSON.stringify({ hello: "PDF-Lib" }), {
      headers: { "Content-Type": "application/json", Connection: "keep-alive" },
    });
  },
  { port: 9006 }
);
