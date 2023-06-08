import express from "https://esm.sh/express";

const app = express();

app.get("/api/express", (_req, res) => {
  res.send("Hello World");
});

app.listen(3000);
