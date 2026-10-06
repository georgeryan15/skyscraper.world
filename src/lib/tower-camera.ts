export type Padding = { top: number; right: number; bottom: number; left: number };

const PITCH = 48;
/** Share of the uncovered height the tower spans, top to bottom. */
const FILL = 0.72;
/** A typical Midtown tower's half-width; broad slabs reach towards the camera. */
const HALF_WIDTH_M = 40;
/** Mapbox's default 36.87° vertical field of view gives a focal length of 1.5 viewport heights. */
const FOCAL_LENGTH = 0.5 / Math.tan(0.6435011087932844 / 2);
const EARTH_CIRCUMFERENCE = 40075016.686;
const METRES_PER_DEGREE_LAT = 110574;
const METRES_PER_DEGREE_LNG = 111320;

/** Vertical screen extent (pixels above the centre) of a box-shaped tower, seen
 * from `distance` metres along a line of sight through `target` metres up its axis.
 */
function verticalExtent(heightM: number, target: number, distance: number, pitch: number, focal: number) {
  const [sin, cos] = [Math.sin(pitch), Math.cos(pitch)];
  let top = -Infinity;
  let bottom = Infinity;
  // Horizontal positions are along the view direction, relative to the tower's axis.
  for (const x of [-HALF_WIDTH_M, HALF_WIDTH_M]) {
    for (const z of [0, heightM]) {
      const dz = z - target;
      const depth = distance + x * sin - dz * cos;
      if (depth <= 0) return { top: Infinity, bottom: -Infinity };
      const up = x * cos + dz * sin;
      const y = (focal * up) / depth;
      top = Math.max(top, y);
      bottom = Math.min(bottom, y);
    }
  }
  return { top, bottom };
}

/** The look-at height that centres the tower vertically from a given distance. */
function centredTarget(heightM: number, distance: number, pitch: number, focal: number) {
  let [low, high] = [0, heightM];
  for (let i = 0; i < 40; i++) {
    const target = (low + high) / 2;
    const { top, bottom } = verticalExtent(heightM, target, distance, pitch, focal);
    // Looking higher moves the tower down the screen.
    if (top + bottom > 0) low = target; else high = target;
  }
  return (low + high) / 2;
}

/** Camera options that frame a whole tower, upright, in the part of the map the
 * padding leaves uncovered. Mapbox moves its perspective centre into the padded
 * area, so the tower does not lean as it would if merely offset from the middle.
 */
export function towerCamera(
  { coordinates: [lng, lat], heightM }: { coordinates: [number, number]; heightM: number },
  { bearing, viewportHeight, padding }: { bearing: number; viewportHeight: number; padding: Padding },
) {
  const pitch = (PITCH * Math.PI) / 180;
  const focal = FOCAL_LENGTH * viewportHeight;
  const span = FILL * (viewportHeight - padding.top - padding.bottom);
  // Back away until the centred tower spans the target share of the view.
  let [near, far] = [heightM, heightM * 40];
  for (let i = 0; i < 40; i++) {
    const distance = (near + far) / 2;
    const { top, bottom } = verticalExtent(heightM, centredTarget(heightM, distance, pitch, focal), distance, pitch, focal);
    if (top - bottom > span) near = distance; else far = distance;
  }
  const distance = (near + far) / 2;
  const target = centredTarget(heightM, distance, pitch, focal);
  // Mapbox's centre is where the line of sight reaches the ground, beyond the target.
  const metresPerPixel = (distance + target / Math.cos(pitch)) / focal;
  const zoom = Math.log2((EARTH_CIRCUMFERENCE * Math.cos((lat * Math.PI) / 180)) / (512 * metresPerPixel));
  const beyond = target * Math.tan(pitch);
  const heading = (bearing * Math.PI) / 180;
  return {
    center: [
      lng + (beyond * Math.sin(heading)) / (METRES_PER_DEGREE_LNG * Math.cos((lat * Math.PI) / 180)),
      lat + (beyond * Math.cos(heading)) / METRES_PER_DEGREE_LAT,
    ] as [number, number],
    // Landmark models, and their hover, start at zoom 14.6.
    zoom: Math.min(17.5, Math.max(14.7, zoom)),
    pitch: PITCH,
    bearing,
    padding,
  };
}
