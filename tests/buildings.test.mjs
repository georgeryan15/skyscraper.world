import assert from "node:assert/strict";
import test from "node:test";
import { describeBuilding, toFeet } from "../src/lib/buildings.ts";
import MIDTOWN_TOWERS from "../db/buildings.seed.json" with { type: "json" };

// Model queries return the tile's anchor, shared by every tower in the tile.
function model(id, height = 300) {
  return { type: "Feature", id, properties: { height }, geometry: { type: "Point", coordinates: [-73.9819, 40.7639] } };
}

test("Landmark models resolve to catalog towers by model id", () => {
  const vanderbilt = describeBuilding(model("1105267467003890196", 427.8), MIDTOWN_TOWERS);
  assert.equal(vanderbilt.name, "One Vanderbilt");
  assert.equal(vanderbilt.placeholder, undefined);
  assert.equal(describeBuilding(model("12520060009192000714"), MIDTOWN_TOWERS).name, "270 Park Avenue");
});

test("Unknown models fall back to their own height, with nothing to fly to", () => {
  const unknown = describeBuilding(model("7451383165769620622", 332.36), MIDTOWN_TOWERS);
  assert.equal(unknown.placeholder, true);
  assert.equal(unknown.heightM, 332);
  assert.equal(unknown.coordinates, undefined);
  assert.equal(unknown.photo, undefined);
  assert.equal(describeBuilding(model("7451383165769620622"), MIDTOWN_TOWERS).id, unknown.id, "The same model keeps a stable id");
  assert.equal(describeBuilding(model("missing-height", "unknown"), MIDTOWN_TOWERS).heightM, 0);
});

test("Catalog entries are distinct and credit their photos", () => {
  assert.equal(new Set(MIDTOWN_TOWERS.map((tower) => tower.id)).size, MIDTOWN_TOWERS.length);
  assert.equal(new Set(MIDTOWN_TOWERS.map((tower) => tower.modelId)).size, MIDTOWN_TOWERS.length);
  for (const tower of MIDTOWN_TOWERS) {
    assert.ok(tower.coordinates, tower.id);
    assert.ok(tower.photo?.src.startsWith("https://upload.wikimedia.org/"), tower.id);
    assert.ok(tower.photo.credit && tower.photo.license && tower.photo.href, tower.id);
  }
  assert.equal(Math.max(...MIDTOWN_TOWERS.map((tower) => tower.heightM)), 472);
  assert.equal(toFeet(427), "1,401");
});
