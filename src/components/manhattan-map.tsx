"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Map } from "mapbox-gl";
import BuildingPopup from "@/components/building-popup";
import BuildingTooltip from "@/components/building-tooltip";
import BuildingCatalog from "@/components/building-catalog";
import { describeBuilding, type BuildingDetails } from "@/lib/buildings";
import { addLandmarkHover } from "@/lib/landmark-hover";
import { towerCamera } from "@/lib/tower-camera";
import { addCatalogLocations } from "@/lib/catalog-locations";

// TEMP: first-load diagnostics.
const mapDebug = (step: string) =>
  console.info(
    `[map-debug] ${step} t=${Math.round(performance.now())} prerendering=${
      (document as Document & { prerendering?: boolean }).prerendering
    } visibility=${document.visibilityState}`,
  );
if (typeof window !== "undefined") {
  mapDebug("module evaluated");
  document.addEventListener("prerenderingchange", () => mapDebug("prerenderingchange"));
  document.addEventListener("visibilitychange", () => mapDebug("visibilitychange"));
}

export default function ManhattanMap({ buildings }: { buildings: BuildingDetails[] }) {
  const viewRef = useRef<HTMLElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hovered, setHovered] = useState<BuildingDetails | null>(null);
  const [hoveredLocation, setHoveredLocation] = useState<BuildingDetails | null>(null);
  const [selected, setSelected] = useState<BuildingDetails | null>(null);
  const pendingFlightRef = useRef(false);

  useEffect(() => {
    mapDebug(`effect start container=${Boolean(containerRef.current)}`);
    if (!containerRef.current) return;

    let cancelled = false;
    let map: Map | undefined;
    let resizeObserver: ResizeObserver | undefined;
    let removeHover: (() => void) | undefined;
    let removeLocations: (() => void) | undefined;

    async function initializeMap() {
      // Load the WebGL renderer only in the browser.
      mapDebug("importing mapbox-gl");
      const { default: mapboxgl } = await import("mapbox-gl");
      mapDebug(`imported cancelled=${cancelled} container=${Boolean(containerRef.current)}`);
      if (cancelled || !containerRef.current) return;

      const accessToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;

      if (!accessToken) {
        setError("Add your Mapbox access token to .env to load the map.");
        return;
      }

      mapDebug(`token=${Boolean(accessToken)} supported=${mapboxgl.supported()}`);
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
      mapDebug("map created");
      map.on("load", () => mapDebug("map load"));
      map.on("style.load", () => {
        mapDebug("style.load");
        removeHover?.();
        removeLocations?.();
        if (map) {
          removeLocations = addCatalogLocations(map, buildings, { onHover: setHoveredLocation, onSelect: setSelected });
          removeHover = addLandmarkHover(map, {
            onHoverChange: (feature) => setHovered(feature && describeBuilding(feature, buildings)),
            onSelect: (feature) => setSelected(feature && describeBuilding(feature, buildings)),
          }, new Set(buildings.flatMap((building) => building.modelId ? [building.modelId] : [])));
        }
      });
      // Authentication failures are actionable; individual tile failures can recover.
      map.on("error", (event) => {
        mapDebug(`map error ${String(event.error?.message ?? event.error)}`);
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

    void initializeMap().catch((reason) => {
      mapDebug(`initializeMap failed ${String(reason?.stack ?? reason)}`);
      if (!cancelled) {
        setError("The 3D map could not start. Try reloading the page.");
      }
    });

    return () => {
      mapDebug(`cleanup map=${Boolean(map)}`);
      cancelled = true;
      removeHover?.();
      removeLocations?.();
      resizeObserver?.disconnect();
      map?.remove();
      mapRef.current = null;
    };
  }, [buildings]);

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
    const camera = building.modelId ? towerCamera(
      { coordinates: building.coordinates, heightM: building.heightM },
      { bearing: map.getBearing(), viewportHeight: view.height, padding },
    ) : { center: building.coordinates, zoom: 16, pitch: 40, bearing: map.getBearing(), padding };
    map.flyTo({ ...camera, duration: 2400 });
  }, []);

  useEffect(() => {
    if (!selected || !pendingFlightRef.current) return;
    pendingFlightRef.current = false;
    flyTo(selected, viewRef.current?.querySelector<HTMLElement>(".building-popup") ?? null);
  }, [selected, flyTo]);

  // The popup already names the building it was opened for.
  const activeHover = hoveredLocation ?? hovered;
  const sameSelection = activeHover?.id === selected?.id || (activeHover?.modelGroup && activeHover.modelGroup === selected?.modelGroup);
  const tooltipBuilding = activeHover && !sameSelection ? activeHover : null;

  return (
    <main ref={viewRef} className="map-view" aria-label="Interactive 3D map of the world's tallest buildings">
      <div ref={containerRef} className="map-canvas" />
      <BuildingCatalog buildings={buildings} onSelect={(building) => {
        if (building.id === selected?.id) {
          flyTo(building, viewRef.current?.querySelector<HTMLElement>(".building-popup") ?? null);
        } else {
          pendingFlightRef.current = true;
          setSelected(building);
        }
      }} />
      <BuildingTooltip building={tooltipBuilding} containerRef={viewRef} tallestHeightM={Math.max(0, ...buildings.map((building) => building.heightM))} />
      <BuildingPopup building={selected} buildings={buildings} onClose={closePopup} onFlyTo={flyTo} onSelect={setSelected} />
      {error && (
        <div className="map-error" role="alert">
          <p>{error}</p>
        </div>
      )}
    </main>
  );
}
