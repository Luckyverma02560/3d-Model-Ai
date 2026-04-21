import * as THREE from 'three';
import { ARButton } from 'three/addons/webxr/ARButton.js';
import { loadProduct }       from './modelLoader.js';
import { ARPlacement }       from './arPlacement.js';
import { GestureController } from './gestureController.js';
import { PhysicsWorld }      from './physicsWorld.js';

let renderer, scene, camera, product, physics, placement, gestures;
let mode = 'place';           // 'place' | 'manipulate'
let anchorPose = null;

init();

async function init() {
  // ---- Three.js renderer ----
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(devicePixelRatio);
  renderer.setSize(innerWidth, innerHeight);
  renderer.xr.enabled = true;
  renderer.shadowMap.enabled = true;
  document.body.appendChild(renderer.domElement);

  scene  = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.01, 40);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.2));
  const dir = new THREE.DirectionalLight(0xffffff, 1);
  dir.position.set(1, 2, 1); dir.castShadow = true;
  scene.add(dir);

  // ---- AR button (requires hit-test + dom-overlay) ----
  const arBtn = ARButton.createButton(renderer, {
    requiredFeatures: ['hit-test'],
    optionalFeatures: ['dom-overlay', 'light-estimation'],
    domOverlay: { root: document.getElementById('overlay') }
  });
  document.getElementById('enter-ar').onclick = () => arBtn.click();

  // ---- iOS fallback (USDZ Quick Look) ----
  if (/iPad|iPhone|iPod/.test(navigator.userAgent) &&
      !navigator.xr) {
    document.getElementById('ios-fallback').style.display = 'block';
    document.getElementById('enter-ar').textContent = 'View in AR (iOS)';
    document.getElementById('enter-ar').onclick = () =>
      document.getElementById('ios-fallback').activateAR();
    return;
  }

  // ---- Load product ----
  product = await loadProduct({
    glb:  'models/product.glb',
    usdz: 'models/product.usdz'
  });
  product.visible = false;
  scene.add(product);

  // ---- Subsystems ----
  placement = new ARPlacement(renderer, scene);
  physics   = new PhysicsWorld();
  gestures  = new GestureController(
    document.getElementById('webcam'),
    Object.assign(document.getElementById('gesture-canvas'),
                  { width: 160, height: 120 })
  );
  await gestures.init();
  gestures.on(handleGesture);

  renderer.xr.addEventListener('sessionstart',
    () => placement.onSessionStart(renderer.xr.getSession()));

  renderer.setAnimationLoop(render);
}

function handleGesture(e) {
  if (e.type !== 'gesture') return;
  const { name, position, pinchDelta, changed } = e;

  // Place the product on the reticle when user shows Open_Palm the first time
  if (mode === 'place' && name === 'Open_Palm' && anchorPose) {
    product.position.setFromMatrixPosition(placement.reticle.matrix);
    product.visible = true;
    physics.addMesh(product);
    physics.setFloorY(product.position.y);
    mode = 'manipulate';
    document.getElementById('mode').textContent = 'Mode: Manipulate';
    return;
  }
  if (mode !== 'manipulate') return;

  const body = physics.bodies.get(product);
  if (!body) return;

  switch (name) {
    case 'Open_Palm': {                           // translate X/Y
      const tx = (position.x - 0.5) * 1.5;
      const ty = (0.5 - position.y) * 1.0 + anchorPose.transform.position.y;
      body.type = CANNON.Body.KINEMATIC;
      body.velocity.set(0,0,0);
      body.position.x += (anchorPose.transform.position.x + tx - body.position.x) * .2;
      body.position.y += (ty - body.position.y) * .2;
      break;
    }
    case 'Closed_Fist': {                          // drag in Z (depth)
      body.type = CANNON.Body.KINEMATIC;
      const tz = (position.z) * 4;                 // MediaPipe z ~ [-.5,.5]
      body.position.z += (tz - body.position.z) * .15;
      break;
    }
    case 'Pointing_Up': {                          // rotate Y
      body.type = CANNON.Body.KINEMATIC;
      body.quaternion.setFromEuler(0, position.x * Math.PI * 2, 0);
      break;
    }
    case 'Victory': {                              // scale via pinch delta
      const s = Math.max(0.1, Math.min(3, product.scale.x + pinchDelta * 5));
      product.scale.setScalar(s);
      // Rebuild collider so physics matches new size
      physics.world.removeBody(body);
      physics.bodies.delete(product);
      physics.addMesh(product);
      break;
    }
    case 'Thumb_Up':   if (changed && physics.gravityOn)  physics.toggleGravity(); break;
    case 'Thumb_Down': if (changed && !physics.gravityOn) physics.toggleGravity(); break;
    case 'ILoveYou':
      if (changed) {
        body.position.setFromMatrixPosition(placement.reticle.matrix);
        body.velocity.set(0,0,0); body.angularVelocity.set(0,0,0);
      }
      break;
    default:
      body.type = CANNON.Body.DYNAMIC;            // release → physics takes over
  }
}

const clock = new THREE.Clock();
function render(t, frame) {
  const dt = clock.getDelta();
  anchorPose = placement.update(frame) || anchorPose;
  physics.step(dt);
  renderer.render(scene, camera);
}