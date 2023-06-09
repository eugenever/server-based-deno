import { MapLibreMap, MlNavigationTools, React } from "@/dep.ts";
// import "./styles.css";

export default function App(mapOptions: any) {
  return (
    <>
      <MapLibreMap options={mapOptions} mapId="mapReact" />
      <MlNavigationTools />
    </>
  );
}
