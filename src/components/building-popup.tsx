"use client";

import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { Button, CloseButton } from "@heroui/react";
import LiquidGlass from "./liquid-glass";
import { buildingAddress, toFeet, type BuildingDetails, type BuildingPhoto } from "@/lib/buildings";

const EXIT_MS = 200;

type BuildingPopupProps = {
  building: BuildingDetails | null;
  buildings: BuildingDetails[];
  onClose: () => void;
  onFlyTo: (building: BuildingDetails, panel: HTMLElement | null) => void;
  onSelect: (building: BuildingDetails) => void;
};

export default function BuildingPopup({ building, buildings, onClose, onFlyTo, onSelect }: BuildingPopupProps) {
  const [shown, setShown] = useState(building);
  const panelRef = useRef<HTMLElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const open = building !== null;

  // Hold the last building while the panel animates out.
  if (building && building !== shown) setShown(building);
  useEffect(() => {
    if (open || !shown) return;
    const timer = setTimeout(() => setShown(null), EXIT_MS);
    return () => clearTimeout(timer);
  }, [open, shown]);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel?.contains(document.activeElement)) {
      returnFocusRef.current = document.activeElement as HTMLElement | null;
      panel?.focus({ preventScroll: true });
    }
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      // Closing from inside the panel hands focus back to the map.
      if (panel?.contains(document.activeElement)) returnFocusRef.current?.focus({ preventScroll: true });
    };
  }, [open, building?.id, onClose]);

  const details = building ?? shown;
  if (!details) return null;

  return (
    <section
      ref={panelRef}
      className="building-popup"
      data-state={open ? "open" : "closed"}
      role="dialog"
      aria-labelledby={titleId}
      tabIndex={-1}
    >
      <LiquidGlass className="building-popup__glass" bezel={30} refraction={76}>
        <PopupContent
          key={details.id}
          building={details}
          buildings={buildings}
          titleId={titleId}
          onClose={onClose}
          onFlyTo={() => onFlyTo(details, panelRef.current)}
          onSelect={onSelect}
        />
      </LiquidGlass>
    </section>
  );
}

type PopupContentProps = {
  building: BuildingDetails;
  buildings: BuildingDetails[];
  titleId: string;
  onClose: () => void;
  onFlyTo: () => void;
  onSelect: (building: BuildingDetails) => void;
};

function PopupContent({ building, buildings, titleId, onClose, onFlyTo, onSelect }: PopupContentProps) {
  const [copy, setCopy] = useState<"idle" | "copied" | "failed">("idle");
  const { name, heightM, floors, completed, style, architect, summary, photo } = building;

  useEffect(() => {
    if (copy === "idle") return;
    const timer = setTimeout(() => setCopy("idle"), 2000);
    return () => clearTimeout(timer);
  }, [copy]);

  function copyAddress() {
    navigator.clipboard
      .writeText(buildingAddress(building))
      .then(() => setCopy("copied"), () => setCopy("failed"));
  }

  return (
    <div className="building-popup__content" data-photo={photo ? "true" : "false"}>
      {photo && <Photo photo={photo} name={name} />}
      <LiquidGlass className="glass-orb building-popup__close" bezel={14} refraction={30}>
        <CloseButton aria-label="Close details" onPress={onClose} />
      </LiquidGlass>

      <div className="building-popup__body">
        <h2 id={titleId} className="building-popup__title">{name}</h2>
        <p className="building-popup__address">{buildingAddress(building)}</p>
        {building.modelGroup && <div className="building-popup__siblings" aria-label="Towers in this complex">
          {buildings.filter((tower) => tower.modelGroup === building.modelGroup).map((tower) => (
            <Button key={tower.id} size="sm" variant="secondary" aria-pressed={tower.id === building.id} onPress={() => onSelect(tower)}>{tower.name}</Button>
          ))}
        </div>}

        <dl className="building-popup__facts">
          <div>
            <dt>Height</dt>
            <dd>
              {heightM} m <span>{toFeet(heightM)} ft</span>
            </dd>
          </div>
          {floors ? (
            <div>
              <dt>Floors</dt>
              <dd>{floors}</dd>
            </div>
          ) : null}
          {completed ? (
            <div>
              <dt>{building.status === "topped-out" ? "Topped out / expected" : "Completed"}</dt>
              <dd>{completed}</dd>
            </div>
          ) : null}
          {style && (
            <div>
              <dt>Style</dt>
              <dd>{style}</dd>
            </div>
          )}
          {architect && (
            <div className="building-popup__fact--wide">
              <dt>Architect</dt>
              <dd>{architect}</dd>
            </div>
          )}
        </dl>

        <Skyline building={building} buildings={buildings} />

        <p className="building-popup__summary">{summary}</p>
        {building.sourceUrl && <p className="building-popup__source"><a href={building.sourceUrl} target="_blank" rel="noreferrer">Building facts ↗</a></p>}
        {!building.modelId && !building.placeholder && <p className="building-popup__source">Explore this building by its location pin. A detailed 3D model is not available on the map yet.</p>}

        {!building.placeholder && (
          <div className="building-popup__actions">
            {building.coordinates && (
              <Button className="building-popup__action" onPress={onFlyTo}>
                Fly to building
              </Button>
            )}
            <Button className="building-popup__action" variant="secondary" onPress={copyAddress}>
              {copy === "copied" ? "Address copied" : copy === "failed" ? "Copy unavailable" : "Copy address"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function Photo({ photo, name }: { photo: BuildingPhoto; name: string }) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  return (
    <figure className="building-popup__photo" data-status={status}>
      {status === "error" ? (
        <p className="building-popup__no-photo">Photo unavailable</p>
      ) : (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- Commons photos are hotlinked, not optimised. */}
          <img src={photo.src} alt={photo.caption ? `${name} — ${photo.caption.toLowerCase()}` : name} decoding="async" onLoad={() => setStatus("loaded")} onError={() => setStatus("error")} />
          <LiquidGlass className="building-popup__credit" bezel={10} refraction={20}>
            <figcaption>
              {photo.caption && <span>{photo.caption}. </span>}
              <a href={photo.href} target="_blank" rel="noreferrer">
                {photo.credit}
              </a>
              {", "}<a href={photo.licenseHref ?? photo.href} target="_blank" rel="noreferrer">{photo.license}</a>
            </figcaption>
          </LiquidGlass>
        </>
      )}
    </figure>
  );
}

/** Every tower in the catalog, shortest to tallest. */
function Skyline({ building, buildings }: { building: BuildingDetails; buildings: BuildingDetails[] }) {
  const towers = building.placeholder ? [...buildings, building] : buildings;
  const byHeight = [...towers].sort((a, b) => a.heightM - b.heightM);
  const tallest = Math.max(1, byHeight.at(-1)?.heightM ?? 0);
  const rank = towers.filter((tower) => tower.heightM > building.heightM).length + 1;
  return (
    <figure className="skyline">
      <div className="skyline__bars" aria-hidden="true">
        {byHeight.map((tower) => (
          <span
            key={tower.id}
            className="skyline__bar"
            data-current={tower.id === building.id || undefined}
            style={{ "--bar-height": tower.heightM / tallest } as CSSProperties}
          />
        ))}
      </div>
      <figcaption className="skyline__caption">
        {rank === 1 ? "Tallest" : `${ordinal(rank)} tallest`} of {towers.length} catalogued buildings
      </figcaption>
    </figure>
  );
}

function ordinal(value: number): string {
  const suffix = value % 100 >= 11 && value % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][value % 10] ?? "th";
  return `${value}${suffix}`;
}
