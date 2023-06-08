import { React } from "./deps.ts";
import hydrate from "hydrate";
import App from "./app.tsx";

hydrate(document, <App />);
