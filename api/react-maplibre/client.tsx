import { React, ReactDOM } from "@/dep.ts";

declare global {
  var __INITIAL_STATE__: any;
}

import App from "./app.tsx";

const { mapOptions } = window.__INITIAL_STATE__ || { mapOptions: {} };

(ReactDOM as any).hydrate(
  <App options={mapOptions} />,
  document.getElementById("root")
);
