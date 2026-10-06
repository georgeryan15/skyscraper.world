"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Map } from "mapbox-gl";
import BuildingPopup from "@/components/building-popup";
import BuildingTooltip from "@/components/building-tooltip";
import { describeBuilding, type BuildingDetails } from "@/lib/buildings";
import { addLandmarkHover } from "@/lib/landmark-hover";
import { towerCamera } from "@/lib/tower-camera";

export default function ManhattanMap() {
  const viewRef = useRef<HTMLElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hovered, setHovered] = useState<BuildingDetails | null>(null);
  const [selected, setSelected] = useState<BuildingDetails | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    let cancelled = false;
    let map: Map | undefined;
    let resizeObserver: ResizeObserver | undefined;
    let removeHover: (() => void) | undefined;

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
      mapRef.current = map;
      map.on("style.load", () => {
        removeHover?.();
        if (map) {
          removeHover = addLandmarkHover(map, {
            onHoverChange: (feature) => setHovered(feature && describeBuilding(feature)),
            onSelect: (feature) => setSelected(feature && describeBuilding(feature)),
          });
        }
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
      removeHover?.();
      resizeObserver?.disconnect();
      map?.remove();
      mapRef.current = null;
    };
  }, []);

  const closePopup = useCallback(() => setSelected(null), []);

  // Hand the panel's space back to the map once it closes.
  useEffect(() => {
    const map = mapRef.current;
    if (selected || !map) return;
    const { top, right, bottom, left } = map.getPadding();
    if (top || right || bottom || left) map.easeTo({ padding: { top: 0, right: 0, bottom: 0, left: 0 }, duration: 600 });
  }, [selected]);

  const flyTo = useCallback((building: BuildingDetails, panel: HTMLElement | null) => {
    const map = mapRef.current;
    if (!map || !building.coordinates) return;
    // Frame the whole tower in the part of the map the panel leaves uncovered.
    const view = map.getCanvas().getBoundingClientRect();
    const covered = panel?.getBoundingClientRect();
    const padding = { top: 0, right: 0, bottom: 0, left: 0 };
    // A side panel leaves more room beside it; a bottom sheet, above it.
    if (covered && (covered.left - view.left) * view.height > (covered.top - view.top) * view.width) {
      padding.right = view.right - covered.left;
    } else if (covered) {
      padding.bottom = view.bottom - covered.top;
    }
    const camera = towerCamera(
      { coordinates: building.coordinates, heightM: building.heightM },
      { bearing: map.getBearing(), viewportHeight: view.height, padding },
    );
    map.flyTo({ ...camera, duration: 2400 });
  }, []);

  // The popup already names the building it was opened for.
  const tooltipBuilding = hovered && hovered.id !== selected?.id ? hovered : null;

  return (
    <main ref={viewRef} className="map-view" aria-label="Interactive 3D map of Midtown Manhattan">
      <div ref={containerRef} className="map-canvas" />
      <BuildingTooltip building={tooltipBuilding} containerRef={viewRef} />
      <BuildingPopup building={selected} onClose={closePopup} onFlyTo={flyTo} />
      {error && (
        <div className="map-error" role="alert">
          <p>{error}</p>
        </div>
      )}
    </main>
  );
}
