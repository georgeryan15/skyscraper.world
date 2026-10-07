"use client";

import { useId, useRef, useState } from "react";
import { searchBuildings, type BuildingDetails } from "@/lib/buildings";
import LiquidGlass from "./liquid-glass";

export default function BuildingCatalog({ buildings, onSelect }: {
  buildings: BuildingDetails[];
  onSelect: (building: BuildingDetails) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const toggleRef = useRef<HTMLButtonElement>(null);
  const id = useId();
  const results = searchBuildings(buildings, query);
  return (
    <aside className="building-catalog" aria-label="Building explorer">
      <LiquidGlass className="building-catalog__glass" bezel={20} refraction={30}>
        <button ref={toggleRef} className="building-catalog__toggle" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
          <span>Explore skyscrapers</span><span>{buildings.length} buildings {open ? "−" : "+"}</span>
        </button>
        {open && <div id={id} className="building-catalog__content">
          <label htmlFor={`${id}-search`}>Find a building or city</label>
          <input id={`${id}-search`} type="search" placeholder="Burj Khalifa, Dubai, New York…" value={query} onChange={(event) => setQuery(event.target.value)} />
          <p className="building-catalog__count" role="status">{results.length} {results.length === 1 ? "building" : "buildings"}</p>
          <ul className="building-catalog__list">
            {results.map((building) => <li key={building.id}>
              <button onClick={() => { toggleRef.current?.focus(); onSelect(building); setOpen(false); }}>
                <span><strong>{building.name}</strong><small>{building.city}, {building.country}</small></span>
                <span className="building-catalog__height">{building.heightM} m</span>
              </button>
            </li>)}
          </ul>
          {!results.length && <p className="building-catalog__empty">No buildings match. Try a city or a shorter name.</p>}
        </div>}
      </LiquidGlass>
    </aside>
  );
}
