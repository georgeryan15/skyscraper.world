import assert from "node:assert/strict";
import test from "node:test";
import { isMajorMidtownBuilding, matchLandmarkBuildings } from "../src/lib/landmark-hover.ts";

function building(id, lng, lat, height) {
  const d = 0.0001;
  return {
    type: "Feature", id, properties: { height },
    geometry: { type: "Polygon", coordinates: [[
      [lng - d, lat - d], [lng + d, lat - d], [lng + d, lat + d],
      [lng - d, lat + d], [lng - d, lat - d],
    ]] },
  };
}
function landmark(lng, lat) {
  return { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [lng, lat] } };
}

test("Midtown eligibility includes both requested towers and excludes other neighborhoods", () => {
  assert.equal(isMajorMidtownBuilding(building(1, -73.9792, 40.759, 260)), true);
  assert.equal(isMajorMidtownBuilding(building(2, -73.9754, 40.7556, 423)), true);
  assert.equal(isMajorMidtownBuilding(building(3, -74.0134, 40.7127, 541)), false);
  assert.equal(isMajorMidtownBuilding(building(4, -73.9717, 40.791, 200)), false);
  assert.equal(isMajorMidtownBuilding(building(5, -73.9792, 40.759, 30)), false);
});

test("Landmark matching ignores neighboring ordinary towers and deduplicates tile copies", () => {
  const rockefeller = building(1, -73.9792, 40.759, 260);
  const neighbor = building(2, -73.9788, 40.759, 200);
  const distant = building(3, -73.99, 40.75, 300);
  const points = [landmark(-73.9792, 40.759), landmark(-73.9792, 40.759)];
  assert.deepEqual(matchLandmarkBuildings([rockefeller, neighbor, distant], points).map((b) => b.id), [1]);
  assert.deepEqual(matchLandmarkBuildings([distant], points), []);
  assert.deepEqual(matchLandmarkBuildings([rockefeller], [landmark(-74.0134, 40.7127)]), []);
});

test("All stepped sections of a landmark tower share one hover group", () => {
  const shaft = building(1, -73.9792, 40.759, 260);
  const shoulder = building(2, -73.9792, 40.759, 245);
  const neighbor = building(3, -73.9788, 40.759, 200);
  const matches = matchLandmarkBuildings([shaft, shoulder, neighbor], [landmark(-73.9792, 40.759)]);
  assert.deepEqual(matches.map((b) => b.id), [1, 2]);
  assert.deepEqual(matches.map((b) => b.properties.hover_group), [1, 1]);
});
