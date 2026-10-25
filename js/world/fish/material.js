// Fish skin shader — MeshStandardMaterial + procedural scale / countershading /
// iridescence / gill / mouth / caustics / tail-beat vertex wave.
// Kept as a standard material so scene fog, sun, hemi and the ROV fill apply.
import * as THREE from 'three';
import { SUN_DIR } from '../../core/world.js';

const VERT_COMMON = /* glsl */`
attribute float aPart;
attribute float aPhase;
attribute float aAmp;
attribute float aTint;
uniform float uTime;
uniform float uWaveAmp;
uniform float uWaveAmpY;
uniform float uWaveSpeed;
uniform float uWaveK;
varying vec2 vFishUv;
varying vec3 vLocal;
varying float vPart;
varying float vTint;
varying vec3 vFishWorld;
varying vec3 vFishNormalW;
`;

const VERT_NORMAL = /* glsl */`
  float fishT = clamp(0.5 - position.z, 0.0, 1.0);
  float fishEnv = pow(fishT, 1.8);
  float fishPh = uTime * uWaveSpeed + aPhase;
  float fishCos = cos(fishPh + (0.5 - position.z) * uWaveK);
  float fishSlope = -uWaveAmp * (1.0 + aAmp) * fishEnv * uWaveK * fishCos * 0.55;
  objectNormal = normalize(vec3(
    objectNormal.x + objectNormal.z * fishSlope,
    objectNormal.y,
    objectNormal.z - objectNormal.x * fishSlope
  ));
  vec3 fishNormalW = objectNormal;
  #ifdef USE_INSTANCING
    fishNormalW = mat3(instanceMatrix) * fishNormalW;
  #endif
  vFishNormalW = normalize(mat3(modelMatrix) * fishNormalW);
`;

const VERT_POS = /* glsl */`
  float fishT2 = clamp(0.5 - position.z, 0.0, 1.0);
  float fishEnv2 = pow(fishT2, 1.8);
  float fishPh2 = uTime * uWaveSpeed + aPhase;
  float fishLateral = sin(fishPh2 + (0.5 - position.z) * uWaveK) * uWaveAmp * (1.0 + aAmp) * fishEnv2;
  transformed.x += fishLateral;
  transformed.y += sin(fishPh2 + (0.5 - position.z) * uWaveK + 1.2) * uWaveAmpY * fishEnv2;
  // fins flutter a little more than the body
  transformed.y += sin(uTime * 8.4 + aPhase + uv.y * 6.2831) * 0.0045 * aPart;
  vFishUv = uv;
  vLocal = position;
  vPart = aPart;
  vTint = aTint;
  #ifdef USE_INSTANCING
    vFishWorld = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
  #else
    vFishWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
  #endif
`;

const FRAG_COMMON = /* glsl */`
uniform vec3 uBack;
uniform vec3 uSide;
uniform vec3 uBelly;
uniform vec3 uFin;
uniform vec3 uAccent;
uniform vec3 uCausticColor;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uTime;
uniform float uDepth;
uniform float uCaustic;
uniform float uPattern;
uniform float uIrid;
uniform float uRough;
uniform float uMetal;
uniform float uGlow;
uniform float uSpec;
uniform float uWet;
uniform float uHidePart;
uniform vec2 uScale;
uniform float uHalfH;
uniform float uHalfW;
uniform float uGillV;
uniform float uGillW;
uniform float uMouthV;
uniform float uMouthSize;
uniform float uFinRays;
uniform float uLateral;
uniform float uFinAlpha;
varying vec2 vFishUv;
varying vec3 vLocal;
varying float vPart;
varying float vTint;
varying vec3 vFishWorld;
varying vec3 vFishNormalW;

float gRough;
float gMetal;
float gAlpha;
float gFin;
float gBody;
float gScaleEdge;
float gEye;
float gEyeGlow;
float gIridGlint;

float fishHash(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}
float fishNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(fishHash(i), fishHash(i + vec2(1.0, 0.0)), u.x),
             mix(fishHash(i + vec2(0.0, 1.0)), fishHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fishCaustic(vec2 p, float t) {
  vec2 i = p;
  float c = 0.0;
  const float inten = 0.0045;
  for (int n = 0; n < 3; n++) {
    float tt = t * 0.32 + float(n) * 1.73;
    i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
    c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / inten), p.y / (cos(i.y + tt) / inten)));
  }
  c /= 3.0;
  c = 1.17 - pow(c, 1.4);
  return clamp(pow(abs(c), 8.0), 0.0, 1.0);
}
`;

const FRAG_COLOR = /* glsl */`
  vec2 fuv = vFishUv;
  float part = vPart;
  float tint = 1.0 + vTint;
  if (uHidePart > -0.5 && abs(part - uHidePart) < 0.5) discard;
  vec3 viewDir = normalize(vViewPosition);
  vec3 vN = normalize(vNormal);
  float fres = pow(1.0 - clamp(abs(dot(vN, viewDir)), 0.0, 1.0), 2.4);

  float hN = clamp(vLocal.y / max(uHalfH, 1e-4), -1.35, 1.35);
  float dTop = smoothstep(-0.12, 0.32, hN);
  float dBelly = 1.0 - smoothstep(-0.95, -0.55, hN);
  float dSide = clamp(1.0 - dTop - dBelly, 0.0, 1.0);
  float sideMask = clamp(dSide + 0.4 * dTop * (1.0 - dTop) * 4.0, 0.0, 1.0);

  // ---- procedural scales (diamond lattice with bright rims) ----
  vec2 sp = vec2(fuv.x * uScale.x, fuv.y * uScale.y);
  sp.x += floor(sp.y) * 0.5;
  vec2 cell = fract(sp) - 0.5;
  float diamond = abs(cell.x) * 1.55 + abs(cell.y);
  float scaleEdge = smoothstep(0.5, 0.99, diamond);
  float scaleFace = 1.0 - smoothstep(0.0, 0.62, diamond);
  float scaleVar = fishHash(floor(sp) + 17.31);
  // the scale lattice is meaningless on the snout where the UVs compress:
  // fade it out over the head so it never reads as netting around the mouth
  float headFade = smoothstep(0.03, 0.15, fuv.y);
  scaleEdge *= headFade;
  scaleFace *= headFade;
  gScaleEdge = scaleEdge;

  vec3 col = (uBack * dTop + uSide * dSide + uBelly * dBelly * 0.9);
  col /= max(dTop + dSide + dBelly, 1e-3);
  // lateral wrap: the flank facing the camera is lit, the top/bottom wrap away
  float xN = clamp(abs(vLocal.x) / max(uHalfW, 1e-4), 0.0, 1.0);
  col *= 0.62 + 0.38 * smoothstep(0.1, 0.94, xN);
  // camera-relative key so the volume reads from any viewing angle
  vec3 keyV = normalize(vec3(-0.42, 0.56, 0.72));
  float keyL = max(dot(vN, keyV), 0.0);
  float keyD = max(dot(vN, -keyV), 0.0);
  col *= 0.82 + 0.38 * keyL - 0.12 * keyD;
  // countershading: dark spine, silver flank, bright belly
  col *= mix(1.18, 0.68, smoothstep(-0.35, 0.95, hN));
  float flank = exp(-pow((hN + 0.16) / 0.22, 2.0)) * sideMask;
  col = mix(col, mix(uBelly, uSide, 0.4) * 1.08, flank * 0.3);
  // each scale is a little dome: darker under-edge, bright rim, random tone
  col *= (0.9 + 0.16 * (1.0 - scaleEdge)) * (0.95 + 0.09 * scaleVar);
  col += mix(uBelly, uAccent, 0.3) * pow(1.0 - scaleEdge, 8.0) * 0.06;
  col += mix(uBelly, vec3(0.7, 0.85, 0.9), 0.5) * scaleFace * sideMask * 0.025;

  // ---- countershading accents per species ----
  if (uPattern < 1.5) {
    // yellowfin: dark blue nape, golden lateral band, finlet yellow
    float nape = smoothstep(0.05, 0.5, hN);
    col = mix(col, uBack * 0.82, nape * 0.7);
    float band = exp(-pow((hN + 0.02) / 0.16, 2.0)) * sideMask;
    col = mix(col, uFin * 0.5 + uAccent * 0.2, band * 0.4);
    float bars = smoothstep(0.55, 0.95, sin(fuv.y * 86.0 + sin(fuv.x * 9.0) * 0.8) * 0.5 + 0.5);
    col = mix(col, uBelly, bars * 0.14 * dTop);
    col += uAccent * pow(fres, 3.0) * 0.2;
  } else if (uPattern < 2.5) {
    // mahi: electric green-gold flank, turquoise speckles
    float gold = (1.0 - smoothstep(-0.5, 0.35, hN)) * sideMask;
    col = mix(col, uBelly * 0.8 + uFin * 0.35, gold * 0.45);
    float dots = step(0.86, fishHash(floor(vec2(fuv.x * 52.0, fuv.y * 78.0)))) * sideMask;
    col = mix(col, uAccent, dots * 0.6);
    col += uAccent * fres * uIrid * 0.4;
  } else if (uPattern < 3.5) {
    // red snapper: dark nape, pale belly, fine diagonal bars
    float nape = smoothstep(0.3, 1.0, hN);
    col = mix(col, uBack, nape * 0.4);
    float bar = smoothstep(0.84, 0.99, sin(fuv.y * 30.0 + hN * 2.4) * 0.5 + 0.5) * sideMask;
    col = mix(col, uAccent, bar * 0.15);
    col += uAccent * pow(fres, 2.5) * 0.14;
  } else if (uPattern < 4.5) {
    // grouper: mottled rock camouflage
    float n = fishNoise(vec2(fuv.x * 8.0, fuv.y * 15.0)) * 0.62
            + fishNoise(vec2(fuv.x * 21.0, fuv.y * 33.0)) * 0.38;
    col *= 0.78 + 0.42 * n;
    float blotch = smoothstep(0.6, 0.8, n) * (0.35 + 0.65 * dTop);
    col = mix(col, uAccent, blotch * 0.3);
    float spots = step(0.92, fishHash(floor(vec2(fuv.x * 46.0, fuv.y * 40.0))));
    col *= 1.0 - spots * 0.24;
  } else if (uPattern < 5.5) {
    // parrotfish: scale rows, orange margins, pale cheek
    float rows = sin(fuv.y * 150.0) * 0.5 + 0.5;
    col *= 0.91 + 0.14 * rows * sideMask;
    col = mix(col, uFin, smoothstep(0.5, 1.0, hN) * 0.26);
    float cheek = (1.0 - smoothstep(0.04, 0.16, fuv.y)) * sideMask;
    col = mix(col, uAccent, cheek * 0.5);
    col += uAccent * fres * 0.18;
  } else if (uPattern < 6.5) {
    // lionfish: banded cream and rust, dark eye mask
    float stripe = step(0.5, sin(fuv.y * 104.0 + sin(fuv.x * 6.0) * 0.9));
    col = mix(col, uBelly, stripe * 0.88);
    col *= 0.84 + 0.24 * fishNoise(vec2(fuv.x * 30.0, fuv.y * 30.0));
    col = mix(col, uBack, (1.0 - smoothstep(0.07, 0.2, fuv.y)) * 0.55);
    col += uAccent * pow(fres, 2.0) * 0.12;
  } else if (uPattern < 7.5) {
    // hairtail: mirror-silver ribbon
    col = mix(uSide, uBelly, 1.0 - smoothstep(-0.7, -0.05, hN));
    col = mix(col, uBack, smoothstep(0.38, 0.9, hN) * 0.55);
    col += vec3(0.08, 0.12, 0.13) * pow(fres, 3.0);
    col *= 0.92 + 0.12 * scaleVar;
  } else if (uPattern < 8.5) {
    // scad: blue-green back, dark shoulder spot
    float spot = (1.0 - smoothstep(0.0, 0.07, abs(fuv.y - 0.185)))
               * (1.0 - smoothstep(0.0, 0.06, abs(abs(fuv.x - 0.5) - 0.25)));
    col = mix(col, uBack * 0.6, spot * 0.85);
    float keel = smoothstep(0.9, 1.0, -hN) * 0.5;
    col = mix(col, uBelly, keel);
    col += uAccent * fres * 0.22;
  } else {
    // cobia: dark humped back with a pale lateral stripe
    float stripe = exp(-pow((hN - 0.16) / 0.12, 2.0)) * sideMask;
    col = mix(col, uAccent, stripe * 0.4);
    col = mix(col, uBack, smoothstep(0.35, 0.95, hN) * 0.35);
  }

  // ---- operculum / gill cover, lateral line, mouth ----
  float gillLine = 1.0 - smoothstep(0.0, uGillW * 0.62, abs(fuv.y - (uGillV + 0.03 * cos((fuv.x - 0.25) * 6.2831))));
  col *= 1.0 - 0.4 * gillLine;
  float coverMask = smoothstep(0.05, 0.1, fuv.y) * (1.0 - smoothstep(uGillV - 0.045, uGillV, fuv.y));
  col *= 1.0 + 0.05 * coverMask;
  float coverRim = exp(-pow((fuv.y - (uGillV - 0.016)) / 0.014, 2.0)) * sideMask;
  col += uBelly * 0.12 * coverRim;
  float gillRim = exp(-pow((fuv.y - uGillV - 0.028) / 0.02, 2.0)) * 0.15 * sideMask;
  col += uBelly * gillRim;
  float preop = 1.0 - smoothstep(0.0, uGillW * 0.5, abs(fuv.y - (uGillV - 0.055 + 0.018 * cos((fuv.x - 0.25) * 6.2831))));
  col *= 1.0 - 0.16 * preop * sideMask;
  float lat = exp(-pow((hN - uLateral) / 0.055, 2.0)) * sideMask;
  col *= 1.0 - 0.12 * lat;
  // mouth: a curved jaw line plus the dark gape under the snout
  float jawW = 0.0025 + 0.0055 * clamp(uMouthSize, 0.0, 2.4);
  float jawLine = 1.0 - smoothstep(0.0, jawW, abs(fuv.y - (uMouthV + 0.018 * cos((fuv.x - 0.25) * 6.2831))));
  col *= 1.0 - 0.62 * jawLine;
  col += uBelly * 0.07 * (1.0 - smoothstep(0.0, jawW * 2.2, abs(fuv.y - uMouthV - jawW * 2.2)));
  float frontMask = 1.0 - smoothstep(0.018, 0.06, fuv.y);
  float lowMask = smoothstep(-0.08, -0.32, hN);
  float gape = frontMask * lowMask;
  col = mix(col, vec3(0.016, 0.011, 0.01), gape * 0.92);
  col += uBelly * 0.05 * gape * (1.0 - gape);

  // subtle iridescent sheen in the diffuse
  col += mix(uAccent, vec3(0.23, 0.52, 0.7), 0.45) * fres * uIrid * (0.07 + 0.2 * scaleEdge) * tint;
  col *= tint;

  float alpha = 1.0;
  gRough = uRough;
  gMetal = uMetal;
  gFin = 0.0;
  gBody = 1.0;
  gEye = 0.0;
  gEyeGlow = 0.0;
  gIridGlint = scaleEdge * (0.4 + 0.6 * scaleVar) * uIrid;

  if (part > 0.5 && part < 1.5) {
    // ---- fins: membrane with visible rays, dark grooves, soft margins ----
    gFin = 1.0;
    gBody = 0.0;
    float rayPhase = abs(sin(fuv.x * uFinRays * 3.14159));
    float rayLine = pow(rayPhase, 22.0);
    float groove = 1.0 - 0.42 * pow(1.0 - rayPhase, 2.1);
    vec3 fcol = uFin * groove * (0.8 + 0.46 * rayLine);
    fcol *= 0.9 + 0.26 * smoothstep(0.04, 0.95, fuv.y);
    fcol = mix(fcol, uFin * 1.25, pow(fuv.y, 4.0) * 0.25);
    fcol += uAccent * rayLine * (0.12 + 0.12 * uIrid);
    if (uPattern < 1.5) fcol = mix(fcol, uAccent, rayLine * 0.35);
    else if (uPattern < 2.5) fcol = mix(fcol, uAccent, smoothstep(0.35, 0.9, fuv.y) * 0.65 + rayLine * 0.2);
    else if (uPattern < 3.5) fcol = mix(fcol, uAccent, smoothstep(0.5, 1.0, fuv.y) * 0.35);
    else if (uPattern < 4.5) fcol *= 0.9 + 0.18 * fishNoise(vec2(fuv.x * 20.0, fuv.y * 14.0));
    else if (uPattern < 5.5) fcol = mix(fcol, uAccent, 0.3 + 0.3 * rayLine);
    else if (uPattern < 6.5) {
      float band = step(0.5, sin(fuv.y * 26.0 + fuv.x * 2.4));
      fcol = mix(uFin, uBack * 1.45, band * 0.62);
      fcol += uAccent * rayLine * 0.2;
    } else if (uPattern > 7.5) fcol = mix(fcol, uAccent, 0.25);
    // translucent trailing membrane catches light, dark margin keeps shape
    fcol += uAccent * smoothstep(0.7, 0.95, fuv.y) * 0.06;
    fcol *= 1.0 - 0.28 * smoothstep(0.86, 1.0, fuv.y);
    float edge = smoothstep(0.0, 0.09, fuv.y) * (1.0 - smoothstep(0.58, 1.0, fuv.y) * 0.45);
    float clipped = smoothstep(0.0, 0.05, fuv.x) * smoothstep(1.0, 0.95, fuv.x);
    alpha = uFinAlpha * edge * (0.4 + 0.6 * clipped);
    col = fcol;
    gRough = 0.6;
    gMetal = 0.06;
    gIridGlint = 0.0;
  } else if (part > 1.5 && part < 2.5) {
    // ---- eyeball ----
    gEye = 1.0;
    gBody = 0.0;
    col = vec3(0.022, 0.026, 0.032);
    gRough = 0.07;
    gMetal = 0.05;
    gIridGlint = 0.0;
  } else if (part > 2.5 && part < 3.5) {
    // ---- iris (golden ring) ----
    gEye = 1.0;
    gEyeGlow = 1.0;
    gBody = 0.0;
    float rr = length(fuv - 0.5) * 2.0;
    vec3 iris = mix(uAccent * 0.5, uBack * 0.22, smoothstep(0.25, 0.82, rr));
    iris = mix(iris, vec3(0.008, 0.009, 0.012), smoothstep(0.82, 1.0, rr));
    // wet catchlight, upper-left of the pupil
    vec2 hl = vec2(-0.2, 0.24);
    float catchlight = 1.0 - smoothstep(0.0, 0.22, length(fuv - 0.5 - hl));
    iris += vec3(0.95, 0.98, 1.0) * catchlight * 0.85;
    col = iris;
    alpha = 1.0 - smoothstep(0.96, 1.0, rr);
    gRough = 0.12;
    gMetal = 0.15;
    gIridGlint = 0.0;
  } else if (part > 3.5 && part < 4.5) {
    // ---- pupil ----
    gEye = 1.0;
    gBody = 0.0;
    col = vec3(0.006, 0.007, 0.009);
    alpha = 1.0 - smoothstep(0.88, 1.0, length(fuv - 0.5) * 2.0);
    gRough = 0.035;
    gMetal = 0.0;
    gIridGlint = 0.0;
  } else if (part > 4.5 && part < 5.5) {
    // ---- eye socket / lids ----
    gEye = 1.0;
    gBody = 0.0;
    col = mix(uBack * 0.6, uSide * 0.28, 0.4);
    gRough = 0.68;
    gMetal = 0.04;
    gIridGlint = 0.0;
  } else if (part > 7.5 && part < 8.5) {
    // ---- lips: thick wet skin, darker at the seam ----
    gEye = 0.0;
    gBody = 0.0;
    float lipU = clamp(fuv.y, 0.0, 1.0);
    col = mix(uBelly * 0.34, uBack * 0.3, 0.35 + 0.3 * lipU);
    col *= 0.72 + 0.28 * (1.0 - lipU);
    gRough = 0.34;
    gMetal = 0.05;
    gIridGlint = 0.0;
  } else if (part > 5.5) {
    // ---- mouth ----
    gEye = 0.0;
    gBody = 0.4;
    col = mix(uBack * 0.35, vec3(0.022, 0.016, 0.014), 0.6);
    // wet inner membrane catches a little light at the throat
    col += vec3(0.06, 0.02, 0.02) * pow(fuv.y, 2.0);
    gRough = 0.42;
    gMetal = 0.05;
    gIridGlint = 0.0;
  }

  diffuseColor.rgb = max(col, 0.0);
  diffuseColor.a = alpha;
  gAlpha = alpha;
`;

const FRAG_NORMAL = /* glsl */`
  #ifndef FLAT_SHADED
    // scale relief without tangents: one dome per scale cell
    float bump = (gScaleEdge - 0.58) * 0.32 * gBody;
    vec3 dpx = dFdx(-vViewPosition);
    vec3 dpy = dFdy(-vViewPosition);
    float dbx = dFdx(bump);
    float dby = dFdy(bump);
    vec3 nn = normalize(normal);
    vec3 r1 = cross(dpy, nn);
    vec3 r2 = cross(nn, dpx);
    float det = dot(dpx, r1);
    if (abs(det) > 1e-8) {
      vec3 grad = sign(det) * (dbx * r1 + dby * r2);
      normal = normalize(abs(det) * nn - grad);
    }
  #endif
`;

const FRAG_EMISSIVE = /* glsl */`
  float fishFres = pow(1.0 - clamp(abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0), 3.0);
  float deep = smoothstep(24.0, 80.0, uDepth);
  float topness = clamp(vFishNormalW.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 nW = normalize(vFishNormalW);
  vec3 Vw = normalize(cameraPosition - vFishWorld);
  vec3 Lw = normalize(uSunDir);

  // Caustic dapple on the back (shallow fish only)
  float caustic = fishCaustic(vFishWorld.xz * 0.5 + vec2(0.0, uTime * 0.035), uTime);
  totalEmissiveRadiance += uCausticColor * caustic * uCaustic * (0.3 + 0.7 * topness) * (1.0 - 0.6 * gFin) * gBody * 0.34;

  // Form fill: a soft, view-independent key so fish read as volumes in water
  // where the scene's sun/hemi are almost gone. No extra scene lights.
  float ndl = max(dot(nW, Lw), 0.0);
  float upL = max(dot(nW, vec3(0.0, 1.0, 0.0)), 0.0);
  float fill = mix(0.14, 0.26, deep);
  vec3 albedo = diffuseColor.rgb;
  // at depth the flank should stay dark: fill only lifts the form, not the albedo
  totalEmissiveRadiance += albedo * fill * (0.5 + 0.34 * ndl + 0.42 * upL + 0.22 * max(dot(nW, Vw), 0.0)) * (1.0 - 0.72 * gFin) * gBody;
  totalEmissiveRadiance += uSide * 0.035 * deep * (1.0 - 0.6 * gFin) * gBody;

  // Sun / sky specular with a scale-edge sparkle
  vec3 H = normalize(Lw + Vw);
  float specPow = mix(110.0, 26.0, clamp(uRough, 0.0, 1.0));
  float spec = pow(max(dot(nW, H), 0.0), specPow);
  float sunFade = 1.0 - smoothstep(6.0, 50.0, uDepth) * 0.8;
  totalEmissiveRadiance += uSunColor * spec * uSpec * sunFade * (0.4 + 0.45 * gScaleEdge) * (1.0 - 0.6 * gFin) * gBody;
  totalEmissiveRadiance += mix(uAccent, vec3(0.55, 0.9, 1.0), 0.35) * spec * uIrid * 0.16 * gBody;

  // Rim light: the silhouette that makes deep fish legible
  float rim = pow(1.0 - clamp(dot(nW, Vw), 0.0, 1.0), 3.2);
  totalEmissiveRadiance += mix(uAccent, vec3(0.52, 0.88, 1.0), 0.3) * rim * (0.05 + 0.52 * deep) * (0.28 + 0.72 * gBody);
  totalEmissiveRadiance += uFin * rim * gFin * (0.12 + 0.32 * deep);

  // Wet skin: cool sky rim + a scale-edge sheen so fresh fish read as wet.
  vec3 wetCol = mix(uSunColor, vec3(0.5, 0.78, 0.92), 0.45);
  float wetRim = pow(1.0 - clamp(dot(nW, Vw), 0.0, 1.0), 3.4) * uWet;
  totalEmissiveRadiance += wetCol * wetRim * (0.055 + 0.15 * topness) * gBody;
  totalEmissiveRadiance += uSunColor * pow(max(dot(nW, H), 0.0), 20.0) * uWet
    * (0.07 + 0.18 * gScaleEdge) * gBody * (0.3 + 0.7 * (1.0 - gFin));
  totalEmissiveRadiance += wetCol * wetRim * gFin * 0.22;

  totalEmissiveRadiance += uAccent * gEyeGlow * 0.24;
  totalEmissiveRadiance += vec3(0.55, 0.95, 1.0) * gEye * 0.015;

  // Faint bioluminescent flecks on deep fish
  float fleck = step(0.988, fishHash(floor(vec2(vFishUv.x * 90.0, vFishUv.y * 130.0))));
  totalEmissiveRadiance += vec3(0.25, 0.75, 0.85) * fleck * deep * 0.55 * gBody;
  // Fin membrane translucency read
  totalEmissiveRadiance += uFin * fishFres * gFin * (0.03 + 0.07 * deep);
`;

export function createFishMaterial(species, form) {
  const c = species.colors;
  const uniforms = {
    uTime: { value: 0 },
    uDepth: { value: 0 },
    uCaustic: { value: 0 },
    uCausticColor: { value: new THREE.Color(0.42, 0.82, 0.76) },
    uSunDir: { value: SUN_DIR.clone() },
    uSunColor: { value: new THREE.Color(1.0, 0.84, 0.62) },
    uBack: { value: new THREE.Color(c.back) },
    uSide: { value: new THREE.Color(c.side) },
    uBelly: { value: new THREE.Color(c.belly) },
    uFin: { value: new THREE.Color(c.fin) },
    uAccent: { value: new THREE.Color(c.accent) },
    uPattern: { value: form.pattern },
    uIrid: { value: form.irid },
    uRough: { value: form.rough },
    uMetal: { value: form.metal },
    uGlow: { value: form.glow },
    uWet: { value: form.wet ?? 0.45 },
    uHidePart: { value: -1 },
    uSpec: { value: 0.14 + form.metal * 0.45 },
    uScale: { value: new THREE.Vector2(form.scale[0], form.scale[1]) },
    uHalfH: { value: form.body.depth * 0.5 },
    uHalfW: { value: form.body.width * 0.5 },
    uGillV: { value: form.gill.t },
    uGillW: { value: form.gill.width },
    uMouthV: { value: form.mouth.t },
    uMouthSize: { value: form.mouth.size },
    uFinRays: { value: form.finRays || form.fins?.dorsal?.rays || 13 },
    uLateral: { value: 0.04 },
    uFinAlpha: { value: 0.82 },
    uWaveAmp: { value: form.swim.amp },
    uWaveAmpY: { value: form.swim.ampY || 0 },
    uWaveSpeed: { value: form.swim.speed },
    uWaveK: { value: form.swim.wave },
  };

  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.42,
    metalness: 0.2,
    side: THREE.DoubleSide,
    transparent: true,
    alphaTest: 0.02,
    depthWrite: true,
    fog: true,
  });
  material.name = `fish-skin-${species.id}`;
  material.userData.uniforms = uniforms;

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_COMMON}`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>\n${VERT_NORMAL}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERT_POS}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_COMMON}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${FRAG_COLOR}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n  roughnessFactor = gRough;`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>\n  metalnessFactor = gMetal;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${FRAG_NORMAL}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${FRAG_EMISSIVE}`);
  };
  material.customProgramCacheKey = () => 'fish-skin-v3';

  return material;
}

export function updateFishMaterial(material, time, depth, caustic) {
  const u = material.userData.uniforms;
  if (!u) return;
  u.uTime.value = time;
  u.uDepth.value = depth;
  u.uCaustic.value = caustic;
}
