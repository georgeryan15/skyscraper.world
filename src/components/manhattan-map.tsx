"use client";

import { useEffect, useRef, useState } from "react";
import type { Map } from "mapbox-gl";

export default function ManhattanMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    let cancelled = false;
    let map: Map | undefined;
    let resizeObserver: ResizeObserver | undefined;

    async function initializeMap() {
      // Load the WebGL renderer only in the browser.
      const { default: mapboxgl } = await import("mapbox-gl");
      if (cancelled || !containerRef.current) return;

      const accessToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;

      if (!accessToken) {
        setError("Add your Mapbox access token to .env to load the map.");
        return;
      }

      if (!mapboxgl.supported()) {
        setError("Your browser needs WebGL support to display the 3D map.");
        return;
      }

      map = new mapboxgl.Map({
        container: containerRef.current,
        accessToken,
        style: "mapbox://styles/mapbox/standard",
        center: [-73.9795, 40.7586],
        zoom: 15.6,
        pitch: 60,
        bearing: -17.6,
        antialias: true,
        config: {
          basemap: {
            theme: "default",
            lightPreset: "day",
            show3dObjects: true,
            show3dBuildings: true,
            show3dTrees: true,
            show3dLandmarks: true,
            show3dFacades: true,
            showPedestrianRoads: true,
            showHdRoads: true,
            showPointOfInterestLabels: false,
            showTransitLabels: false,
            showLandmarkIcons: false,
            showLandmarkIconLabels: false,
            showIndoorLabels: false,
          },
        },
      });
      // Authentication failures are actionable; individual tile failures can recover.
      map.on("error", (event) => {
        const status = (event.error as Error & { status?: number }).status;
        if (status === 401 || status === 403) {
          setError(
            "Mapbox could not authorize this map. Check the access token and its allowed URLs.",
          );
        }
      });

      resizeObserver = new ResizeObserver(() => map?.resize());
      resizeObserver.observe(containerRef.current);
    }

    void initializeMap().catch(() => {
      if (!cancelled) {
        setError("The 3D map could not start. Try reloading the page.");
      }
    });

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      map?.remove();
    };
  }, []);

  return (
    <main className="map-view" aria-label="Interactive 3D map of Midtown Manhattan">
      <div ref={containerRef} className="map-canvas" />
      {error && (
        <div className="map-error" role="alert">
          <p>{error}</p>
        </div>
      )}
    </main>
  );
}
