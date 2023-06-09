// @deno-types="https://denopkg.com/soremwar/deno_types/react/v16.13.1/react.d.ts"
import React from "react@17.0.2";
// @deno-types="https://denopkg.com/soremwar/deno_types/react-dom/v16.13.1/server.d.ts"
import ReactDOMServer from "react-dom-server@17.0.2";
// @deno-types="https://denopkg.com/soremwar/deno_types/react-dom/v16.13.1/react-dom.d.ts"
import ReactDOM from "react-dom@17.0.2";

import Map, { NavigationControl } from "react-map-gl@7.0.23";
import maplibregl from "maplibre-gl@2.4.0";

export function App() {
  return (
    <div className="App">
      <Map
        mapLib={maplibregl}
        initialViewState={{
          longitude: 16.62662018,
          latitude: 49.2125578,
          zoom: 14,
        }}
        style={{ width: "100%", height: " calc(100vh - 77px)" }}
        mapStyle="https://api.maptiler.com/maps/streets/style.json?key=YOUR_MAPTILER_API_KEY_HERE"
      >
        <NavigationControl position="top-left" />
      </Map>
    </div>
  );
}
