import assert from "node:assert/strict";
import test from "node:test";
import { towerCamera } from "../src/lib/tower-camera.ts";

const NONE = { top: 0, right: 0, bottom: 0, left: 0 };
const VANDERBILT = { coordinates: [-73.97854, 40.75297], heightM: 427 };
const FOCAL = 1.5;

/** Project a box-shaped tower through the camera Mapbox would derive from the
 * options, independently of the solver: returns its top and bottom in pixels
 * above the padded centre.
 */
function project(tower, camera, viewportHeight, halfWidth = 40) {
  const pitch = (camera.pitch * Math.PI) / 180;
  const [lng, lat] = tower.coordinates;
  const metresPerPixel = (40075016.686 * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** camera.zoom);
  // How far beyond the tower the camera's centre lies, along the bearing.
  const heading = (camera.bearing * Math.PI) / 180;
  const east = (camera.center[0] - lng) * 111320 * Math.cos((lat * Math.PI) / 180);
  const north = (camera.center[1] - lat) * 110574;
  const beyond = east * Math.sin(heading) + north * Math.cos(heading);
  const sideways = east * Math.cos(heading) - north * Math.sin(heading);
  assert.ok(Math.abs(sideways) < 0.01, "The tower lies on the line of sight");
  const range = FOCAL * viewportHeight * metresPerPixel;
  const camera3 = [beyond - range * Math.sin(pitch), range * Math.cos(pitch)];
  const ys = [];
  for (const x of [-halfWidth, halfWidth]) {
    for (const z of [0, tower.heightM]) {
      const rel = [x - camera3[0], z - camera3[1]];
      const depth = rel[0] * Math.sin(pitch) - rel[1] * Math.cos(pitch);
      const up = rel[0] * Math.cos(pitch) + rel[1] * Math.sin(pitch);
      ys.push((FOCAL * viewportHeight * up) / depth);
    }
  }
  return { top: Math.max(...ys), bottom: Math.min(...ys) };
}

test("Towers are framed vertically centred, filling most of the view", () => {
  for (const heightM of [242, 319, 427, 472]) {
    const tower = { ...VANDERBILT, heightM };
    const camera = towerCamera(tower, { bearing: -17.6, viewportHeight: 900, padding: NONE });
    const { top, bottom } = project(tower, camera, 900);
    assert.ok(Math.abs(top + bottom) < 1, `centred: ${top}, ${bottom}`);
    assert.ok(Math.abs(top - bottom - 0.72 * 900) < 1, `fills 72%: ${top - bottom}`);
  }
});

test("Shorter towers are approached more closely", () => {
  const zoom = (heightM) => towerCamera({ ...VANDERBILT, heightM }, { bearing: 0, viewportHeight: 900, padding: NONE }).zoom;
  assert.ok(zoom(242) > zoom(319));
  assert.ok(zoom(319) > zoom(472));
  assert.ok(zoom(472) >= 14.7 && zoom(242) <= 17.5);
});

test("A side panel shifts the perspective centre; a bottom sheet also shrinks the frame", () => {
  const side = { ...NONE, right: 416 };
  const sheet = { ...NONE, bottom: 450 };
  const open = towerCamera(VANDERBILT, { bearing: 30, viewportHeight: 900, padding: NONE });
  const beside = towerCamera(VANDERBILT, { bearing: 30, viewportHeight: 900, padding: side });
  const above = towerCamera(VANDERBILT, { bearing: 30, viewportHeight: 900, padding: sheet });
  assert.deepEqual(beside.padding, side);
  assert.equal(beside.zoom, open.zoom);
  assert.ok(above.zoom < open.zoom);
  const { top, bottom } = project(VANDERBILT, above, 900);
  assert.ok(Math.abs(top - bottom - 0.72 * 450) < 1);
});

test("The camera keeps its bearing and looks past the tower along it", () => {
  for (const bearing of [0, 90, -17.6, 200]) {
    const camera = towerCamera(VANDERBILT, { bearing, viewportHeight: 800, padding: NONE });
    assert.equal(camera.bearing, bearing);
    assert.equal(camera.pitch, 48);
    project(VANDERBILT, camera, 800);
  }
});
