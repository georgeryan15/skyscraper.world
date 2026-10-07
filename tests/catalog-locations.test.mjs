import assert from "node:assert/strict";
import test from "node:test";
import { addCatalogLocations, catalogLocations } from "../src/lib/catalog-locations.ts";
import catalog from "../db/buildings.seed.json" with { type: "json" };

test("Location pins use building coordinates, with independent records for twin towers", () => {
  const data = catalogLocations(catalog);
  assert.equal(data.features.length, catalog.length);
  assert.equal(data.features.filter((feature) => !feature.properties.hasModel).length, 19);
  const twins = data.features.filter((feature) => feature.properties.buildingId.startsWith("petronas-tower-"));
  assert.equal(twins.length, 2);
  assert.notDeepEqual(twins[0].geometry.coordinates, twins[1].geometry.coordinates);
  assert.equal(catalogLocations([{ id: "unknown-model" }]).features.length, 0);
});

test("A pin selects its database record before native landmark handlers and cleans up", () => {
  const handlers = new Map();
  const layers = new Map();
  const sources = new Map();
  const canvas = { style: {} };
  const map = {
    on(event, ...args) { handlers.set([event, ...args.slice(0, -1)].join(":"), args.at(-1)); },
    off(event, ...args) { handlers.delete([event, ...args.slice(0, -1)].join(":")); },
    addLayer(layer) { layers.set(layer.id, layer); },
    addSource(id, source) { sources.set(id, source); },
    getLayer: (id) => layers.get(id), getSource: (id) => sources.get(id),
    removeLayer: (id) => layers.delete(id), removeSource: (id) => sources.delete(id),
    getCanvas: () => canvas,
  };
  const hovered = [];
  const selected = [];
  const dispose = addCatalogLocations(map, catalog, { onHover: (building) => hovered.push(building), onSelect: (building) => selected.push(building) });
  const marina = catalog.find((building) => building.id === "marina-101");
  const event = { features: [{ properties: { buildingId: marina.id } }], preventDefault() { this.defaultPrevented = true; } };
  handlers.get("mousemove:catalog-location-pins")(event);
  assert.equal(hovered.at(-1), marina);
  assert.equal(canvas.style.cursor, "pointer");
  handlers.get("click:catalog-location-pins")(event);
  assert.equal(event.defaultPrevented, true);
  assert.deepEqual(selected, [marina]);
  handlers.get("movestart")();
  assert.equal(hovered.at(-1), null);
  assert.equal(canvas.style.cursor, "");
  dispose();
  assert.equal(handlers.size + layers.size + sources.size, 0);
});
