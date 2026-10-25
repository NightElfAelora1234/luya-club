// Fish-local preview page: boots sky/ocean/atmosphere/camera/fish/ambience only,
// so art iteration is not blocked by teammates' in-flight modules.
// ?p=0.19 to set dive progress. Owner: fish.
import * as THREE from 'three';
import { engine } from '../../core/engine.js';
import { app } from '../../core/state.js';
import { createSky } from '../sky.js';
import { createOcean } from '../ocean.js';
import { createAtmosphere } from '../atmosphere.js';
import { createCameraRig } from '../camera.js';
import { createSeafloor } from '../seafloor.js';
import { createFishSystem } from './index.js';
import { createAmbience } from '../ambience.js';

const params = new URLSearchParams(location.search);
const p0 = Math.max(0, Math.min(1, parseFloat(params.get('p') || '0.2') || 0.2));

engine.init();
const sky = createSky(engine);
const ocean = createOcean(engine, sky);
const atmosphere = createAtmosphere(engine);
const rig = createCameraRig(engine);
const seafloor = createSeafloor(engine);
const ctx = { engine, app, ocean, sky, atmosphere, rig, seafloor };
const fish = createFishSystem(engine, app, ctx);
const ambience = createAmbience(engine, app, ctx);
ctx.fish = fish;
ctx.ambience = ambience;

app.loaded = true;
app.progress = p0;
app.progressTarget = p0;
rig.snapProgress(p0);
app.depth = Math.max(0, -engine.camera.position.y);
app.cameraDepth = app.depth;
atmosphere.update(app.cameraDepth);

const clock = new THREE.Clock();
let elapsed = 0;
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(Math.max(clock.getDelta(), 0.0001), 0.05);
  elapsed += dt;
  app.dt = dt;
  app.time = elapsed;
  app.frame = (app.frame || 0) + 1;
  app.cameraDepth = Math.max(0, -engine.camera.position.y);
  app.depth = app.cameraDepth;
  const underwater = engine.camera.position.y < 0.02;
  atmosphere.update(app.cameraDepth);
  sky.update(dt, engine.camera.position, underwater);
  ocean.setFog(atmosphere.fogColor, engine.scene.fog.density);
  ocean.update(dt, app.cameraDepth);
  seafloor.update(dt);
  fish.update(dt, { mode: 'dive', underwater, depth: app.cameraDepth });
  ambience.update(dt, { underwater, depth: app.cameraDepth });
  engine.grade.uniforms.uTime.value = app.time;
  engine.grade.uniforms.uUnderwater.value += ((underwater ? 1 : 0) - engine.grade.uniforms.uUnderwater.value) * Math.min(1, dt * 3);
  engine.render();
  app.pointer.justDown = false;
  app.pointer.justUp = false;
}

window.__APP = {
  app, engine, rig, ocean, sky, atmosphere, seafloor, fish, ambience,
  jumpTo(p) {
    app.progress = p;
    app.progressTarget = p;
    rig.snapProgress(p);
    app.cameraDepth = Math.max(0, -engine.camera.position.y);
    app.depth = app.cameraDepth;
    atmosphere.update(app.cameraDepth);
  },
  get ready() { return true; },
};
window.__READY = true;
requestAnimationFrame(frame);
