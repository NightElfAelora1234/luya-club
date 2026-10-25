import { Vector3 } from 'three';

// The one sun of this world. Direction points from the scene toward the sun.
export const SUN_DIR = new Vector3(-0.34, 0.185, -0.92).normalize();
export const SUN_COLOR = [1.0, 0.74, 0.5];       // linear-ish golden hour
export const SUN_INTENSITY = 4.2;

export const WORLD = {
  surfaceY: 0,
  floorY: -96,
  floorCenter: new Vector3(0, -96, -10),
  rodPos: new Vector3(0.4, -95.1, -6.4),
  diveBottomY: -91.4,
  shop: {
    center: new Vector3(0, 0.15, -2.5),
    cameraRadius: 11.5,
    cameraHeight: 5.4,
    orbitSpeed: 0.035,
    orbitStart: 0.9,
  },
  fishing: {
    deck: new Vector3(0, 1.15, 0),
    camera: new Vector3(0.0, 1.65, 0.0),
    look: new Vector3(0.4, 0.7, -26),
  },
  zones: [
    { id: 'surface', label: '海面', from: 0, to: -6, radius: 46 },
    { id: 'sunlit', label: '透光层', from: -6, to: -26, radius: 60 },
    { id: 'twilight', label: '暮光带', from: -26, to: -62, radius: 64 },
    { id: 'deep', label: '无光层', from: -62, to: -88, radius: 58 },
    { id: 'floor', label: '海床', from: -88, to: -96, radius: 48 },
  ],
};

// Camera choreography for the dive. Shared with the fish / ambience systems so
// every creature can be authored against the actual camera route.
export const CAMERA_KEYS = [
  { p: 0.000, pos: [0, 3.70, 12.0], look: [0, 2.60, -60] },
  { p: 0.050, pos: [0, 3.45, 8.6], look: [0, 4.25, -16] },
  { p: 0.090, pos: [0, 2.85, 5.4], look: [0, 1.10, -17] },
  { p: 0.140, pos: [0, 1.25, 3.2], look: [0, -4.60, -19] },
  { p: 0.190, pos: [0, -5.20, 2.1], look: [0, 3.60, -13] },
  { p: 0.250, pos: [0, -11.5, 0.6], look: [0, -4.00, -24] },
  { p: 0.320, pos: [0, -18.5, -0.6], look: [1.2, -31.0, -27] },
  { p: 0.420, pos: [1.8, -30.0, -4.5], look: [-1.6, -42.0, -30] },
  { p: 0.550, pos: [-3.2, -45.0, -9.0], look: [2.2, -56.0, -34] },
  { p: 0.680, pos: [2.4, -60.5, -14.0], look: [-1.4, -71.0, -38] },
  { p: 0.800, pos: [-1.4, -74.5, -19.0], look: [0.6, -85.0, -40] },
  { p: 0.900, pos: [0.4, -86.5, -7.0], look: [0.2, -92.0, -22] },
  { p: 0.955, pos: [0, -89.6, -1.8], look: [0.4, -93.8, -7.2] },
  { p: 1.000, pos: [0, -92.35, -0.4], look: [0.4, -94.95, -6.4] },
];

export function sampleCameraPath(p) {
  const t = Math.min(1, Math.max(0, p));
  let i = 0;
  while (i < CAMERA_KEYS.length - 2 && t > CAMERA_KEYS[i + 1].p) i++;
  const a = CAMERA_KEYS[i], b = CAMERA_KEYS[i + 1];
  const k = Math.min(1, Math.max(0, (t - a.p) / Math.max(1e-6, b.p - a.p)));
  const e = k * k * (3 - 2 * k);
  return {
    pos: new Vector3(
      a.pos[0] + (b.pos[0] - a.pos[0]) * e,
      a.pos[1] + (b.pos[1] - a.pos[1]) * e,
      a.pos[2] + (b.pos[2] - a.pos[2]) * e,
    ),
    look: new Vector3(
      a.look[0] + (b.look[0] - a.look[0]) * e,
      a.look[1] + (b.look[1] - a.look[1]) * e,
      a.look[2] + (b.look[2] - a.look[2]) * e,
    ),
  };
}

// Narrative beats, used by captions and the logo timeline.
export const BEATS = {
  signRelease: 0.045,
  signImpact: 0.088,
  surfaceCross: 0.165,
  twilight: 0.430,
  deep: 0.700,
  floorReveal: 0.905,
};
