import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { join } from "https://deno.land/std@0.188.0/path/mod.ts";

import docx from "https://esm.sh/docx@8.0.4";

import {
  writeFileSync,
  readFileSync,
} from "https://deno.land/std@0.177.0/node/fs.ts";

console.log("DOCX worker started...");

serve(
  // deno-lint-ignore require-await
  async (_req: Request) => {
    docx
      .patchDocument(
        readFileSync(
          join(Deno.cwd(), "api", "docx", "template", "simple-template.docx")
        ),
        {
          patches: {
            name: {
              type: docx.PatchType.PARAGRAPH,
              children: [
                new docx.TextRun("Sir. "),
                new docx.TextRun("John Doe"),
                new docx.TextRun("(The Conqueror)"),
              ],
            },
            table_heading_1: {
              type: docx.PatchType.PARAGRAPH,
              children: [new docx.TextRun("Heading wow!")],
            },
            item_1: {
              type: docx.PatchType.PARAGRAPH,
              children: [
                new docx.TextRun("#657"),
                new docx.ExternalHyperlink({
                  children: [
                    new docx.TextRun({
                      text: "BBC News Link",
                    }),
                  ],
                  link: "https://www.bbc.co.uk/news",
                }),
              ],
            },
            paragraph_replace: {
              type: docx.PatchType.DOCUMENT,
              children: [
                new docx.Paragraph("Lorem ipsum paragraph"),
                new docx.Paragraph("Another paragraph"),
                new docx.Paragraph({
                  children: [
                    new docx.TextRun("This is a "),
                    new docx.ExternalHyperlink({
                      children: [
                        new docx.TextRun({
                          text: "Google Link",
                        }),
                      ],
                      link: "https://www.google.co.uk",
                    }),
                    new docx.ImageRun({
                      data: readFileSync(
                        join(Deno.cwd(), "api", "docx", "images", "dog.png")
                      ),
                      transformation: { width: 100, height: 100 },
                    }),
                  ],
                }),
              ],
            },
            header_adjective: {
              type: docx.PatchType.PARAGRAPH,
              children: [new docx.TextRun("Delightful Header")],
            },
            footer_text: {
              type: docx.PatchType.PARAGRAPH,
              children: [
                new docx.TextRun("replaced just as"),
                new docx.TextRun(" well"),
                new docx.ExternalHyperlink({
                  children: [
                    new docx.TextRun({
                      text: "BBC News Link",
                    }),
                  ],
                  link: "https://www.bbc.co.uk/news",
                }),
              ],
            },
            image_test: {
              type: docx.PatchType.PARAGRAPH,
              children: [
                new docx.ImageRun({
                  data: readFileSync(
                    join(Deno.cwd(), "api", "docx", "images", "image1.jpeg")
                  ),
                  transformation: { width: 100, height: 100 },
                }),
              ],
            },
            table: {
              type: docx.PatchType.DOCUMENT,
              children: [
                new docx.Table({
                  rows: [
                    new docx.TableRow({
                      children: [
                        new docx.TableCell({
                          children: [
                            new docx.Paragraph({}),
                            new docx.Paragraph({}),
                          ],
                          verticalAlign: docx.VerticalAlign.CENTER,
                        }),
                        new docx.TableCell({
                          children: [
                            new docx.Paragraph({}),
                            new docx.Paragraph({}),
                          ],
                          verticalAlign: docx.VerticalAlign.CENTER,
                        }),
                        new docx.TableCell({
                          children: [
                            new docx.Paragraph({ text: "bottom to top" }),
                            new docx.Paragraph({}),
                          ],
                          textDirection:
                            docx.TextDirection.BOTTOM_TO_TOP_LEFT_TO_RIGHT,
                        }),
                        new docx.TableCell({
                          children: [
                            new docx.Paragraph({ text: "top to bottom" }),
                            new docx.Paragraph({}),
                          ],
                          textDirection:
                            docx.TextDirection.TOP_TO_BOTTOM_RIGHT_TO_LEFT,
                        }),
                      ],
                    }),
                    new docx.TableRow({
                      children: [
                        new docx.TableCell({
                          children: [
                            new docx.Paragraph({
                              text: "Blah Blah Blah Blah Blah Blah Blah Blah Blah Blah Blah Blah Blah Blah Blah Blah Blah Blah Blah Blah Blah Blah Blah Blah Blah",
                              heading: docx.HeadingLevel.HEADING_1,
                            }),
                          ],
                        }),
                        new docx.TableCell({
                          children: [
                            new docx.Paragraph({
                              text: "This text should be in the middle of the cell",
                            }),
                          ],
                          verticalAlign: docx.VerticalAlign.CENTER,
                        }),
                        new docx.TableCell({
                          children: [
                            new docx.Paragraph({
                              text: "Text above should be vertical from bottom to top",
                            }),
                          ],
                          verticalAlign: docx.VerticalAlign.CENTER,
                        }),
                        new docx.TableCell({
                          children: [
                            new docx.Paragraph({
                              text: "Text above should be vertical from top to bottom",
                            }),
                          ],
                          verticalAlign: docx.VerticalAlign.CENTER,
                        }),
                      ],
                    }),
                  ],
                }),
              ],
            },
          },
        }
      )
      .then((doc: any) => {
        writeFileSync(
          join(Deno.cwd(), "api", "docx", "report", "report.docx"),
          doc
        );
      });

    return new Response(JSON.stringify({ hello: "DOCX" }), {
      headers: { "Content-Type": "application/json", Connection: "keep-alive" },
    });
  },
  { port: 9007 }
);
