/** Inclusive extent of a silhouette, in mask texels (rows bottom-up, as in GL). */
export type MaskBounds = { minX: number; minY: number; maxX: number; maxY: number };

/** A landmark's visible silhouette for one camera position, read back from the GPU. */
export type LandmarkMask = {
  /** One bit per texel, least significant first; rows are bottom-up and `stride` bytes apart. */
  bits: Uint8Array;
  width: number;
  height: number;
  stride: number;
  bounds: MaskBounds | null;
};

function covered(bits: Uint8Array, stride: number, x: number, y: number): boolean {
  return (bits[y * stride + (x >> 3)] & (1 << (x & 7))) !== 0;
}

export function maskBounds(bits: Uint8Array, width: number, height: number, stride: number): MaskBounds | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    const row = y * stride;
    for (let byte = 0; byte < stride; byte++) {
      const value = bits[row + byte];
      if (!value) continue;
      const first = byte * 8 + 31 - Math.clz32(value & -value);
      const last = byte * 8 + 31 - Math.clz32(value);
      if (first >= width) continue;
      minX = Math.min(minX, first);
      maxX = Math.max(maxX, Math.min(last, width - 1));
      minY = Math.min(minY, y);
      maxY = y;
    }
  }
  return maxX < 0 ? null : { minX, minY, maxX, maxY };
}

/** Whether the silhouette lies within `radius` CSS pixels of the pointer.
 * The tolerance is in CSS pixels, independent of display density, and bridges
 * mullions, spires and antialiased edges.
 */
export function maskCovers(
  mask: LandmarkMask,
  point: { x: number; y: number },
  canvas: { clientWidth: number; clientHeight: number },
  radius: number,
): boolean {
  const { bounds } = mask;
  if (!bounds || !canvas.clientWidth || !canvas.clientHeight) return false;
  const scaleX = mask.width / canvas.clientWidth;
  const scaleY = mask.height / canvas.clientHeight;
  const centerX = point.x * scaleX;
  const centerY = (canvas.clientHeight - point.y) * scaleY;
  const minX = Math.max(bounds.minX, Math.floor(centerX - radius * scaleX));
  const maxX = Math.min(bounds.maxX, Math.floor(centerX + radius * scaleX));
  const minY = Math.max(bounds.minY, Math.floor(centerY - radius * scaleY));
  const maxY = Math.min(bounds.maxY, Math.floor(centerY + radius * scaleY));
  for (let y = minY; y <= maxY; y++) {
    const dy = (y + 0.5 - centerY) / scaleY;
    for (let x = minX; x <= maxX; x++) {
      const dx = (x + 0.5 - centerX) / scaleX;
      if (dx * dx + dy * dy <= radius * radius + 0.5 && covered(mask.bits, mask.stride, x, y)) return true;
    }
  }
  return false;
}
