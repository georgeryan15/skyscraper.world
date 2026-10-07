import assert from "node:assert/strict";
import test from "node:test";
import { buildingAddress, describeBuilding, searchBuildings, toFeet } from "../src/lib/buildings.ts";
import catalog from "../db/buildings.seed.json" with { type: "json" };

// Model queries return the tile's anchor, shared by every tower in the tile.
function model(id, height = 300) {
  return { type: "Feature", id, properties: { height }, geometry: { type: "Point", coordinates: [-73.9819, 40.7639] } };
}

test("Landmark models resolve to catalog towers by model id", () => {
  const vanderbilt = describeBuilding(model("1105267467003890196", 427.8), catalog);
  assert.equal(vanderbilt.name, "One Vanderbilt");
  assert.equal(vanderbilt.placeholder, undefined);
  assert.equal(describeBuilding(model("12520060009192000714"), catalog).name, "270 Park Avenue");
  assert.equal(describeBuilding(model("7986796344800398594"), catalog).name, "Burj Khalifa");
});

test("Unknown models fall back to their own height, with nothing to fly to", () => {
  const unknown = describeBuilding(model("7451383165769620622", 332.36), catalog);
  assert.equal(unknown.placeholder, true);
  assert.equal(unknown.heightM, 332);
  assert.equal(unknown.coordinates, undefined);
  assert.equal(unknown.photo, undefined);
  assert.equal(describeBuilding(model("7451383165769620622"), catalog).id, unknown.id, "The same model keeps a stable id");
  assert.equal(describeBuilding(model("missing-height", "unknown"), catalog).heightM, 0);
  assert.equal(describeBuilding(model(undefined), catalog).placeholder, true, "An absent model ID must not resolve to a pin-only record");
});

test("Catalog entries are distinct and credit their photos", () => {
  assert.equal(catalog.length, 49);
  assert.equal(new Set(catalog.map((tower) => tower.id)).size, catalog.length);
  assert.equal(catalog.filter((tower) => tower.sourceRank).length, 46);
  assert.equal(catalog.filter((tower) => !tower.modelId).length, 19);
  for (const tower of catalog) {
    const [lng, lat] = tower.coordinates;
    assert.ok(Number.isFinite(lng) && Math.abs(lng) <= 180 && Number.isFinite(lat) && Math.abs(lat) <= 90, tower.id);
    assert.ok(tower.city && tower.country && tower.country !== "China", tower.id);
    assert.ok(tower.photo?.src.startsWith("https://"), tower.id);
    assert.ok(tower.photo.credit && tower.photo.license && tower.photo.href.startsWith("https://"), tower.id);
    assert.ok(tower.summary && tower.heightM > 0 && tower.floors > 0, tower.id);
  }
  assert.equal(Math.max(...catalog.map((tower) => tower.heightM)), 828);
  assert.equal(toFeet(427), "1,401");
});

test("Only explicitly grouped twin towers share a native mesh", () => {
  const seen = new Map();
  for (const tower of catalog.filter((tower) => tower.modelId)) {
    const previous = seen.get(tower.modelId);
    if (previous) {
      assert.ok(tower.modelGroup);
      assert.equal(tower.modelGroup, previous.modelGroup);
      assert.notEqual(tower.name, previous.name);
      assert.notDeepEqual(tower.coordinates, previous.coordinates);
    }
    seen.set(tower.modelId, tower);
  }
  assert.equal(seen.size, 28);
});

test("Search finds global buildings by name, city, country, and accents", () => {
  assert.equal(searchBuildings(catalog, "  KHALIFA dubai ")[0].id, "burj-khalifa");
  assert.equal(searchBuildings(catalog, "kuala lumpur").length, 4);
  assert.equal(searchBuildings(catalog, "petronas").length, 2);
  assert.equal(searchBuildings(catalog, "steInway")[0].id, "111-west-57th-street");
  assert.equal(searchBuildings(catalog, "nowhere at all").length, 0);
  assert.equal(searchBuildings(catalog, "")[0].heightM, 828);
  assert.equal(searchBuildings([{ ...catalog[0], name: "Étoile" }], "etoile").length, 1);
  const burj = catalog.find((tower) => tower.id === "burj-khalifa");
  assert.ok(buildingAddress(burj).includes("Dubai"));
  assert.ok(!buildingAddress(burj).includes("New York"));
  assert.equal(buildingAddress({ address: "Taipei", neighborhood: "", city: "Taipei", country: "Taiwan" }), "Taipei, Taiwan");
});
