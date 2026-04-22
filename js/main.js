import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { ARButton } from 'three/addons/webxr/ARButton.js';
import { loadProduct }       from './modelLoader.js';
import { ARPlacement }       from './arPlacement.js';
import { GestureController } from './gestureController.js';
import { PhysicsWorld }      from './physicsWorld.js';

let renderer, scene, camera, product, physics, placement, gestures;
let mode = 'place';           // 'place' | 'manipulate'
let anchorPose = null;
let inARMode = false;

// Wait for DOM to be ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

async function init() {
  try {
    // ---- Three.js renderer ----
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(devicePixelRatio);
    renderer.setSize(innerWidth, innerHeight);
    renderer.xr.enabled = true;
    renderer.shadowMap.enabled = true;
    renderer.setClearColor(0x000000, 1);
    document.body.appendChild(renderer.domElement);
    console.log('✓ Renderer initialized');

    scene  = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.01, 40);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.2));
    const dir = new THREE.DirectionalLight(0xffffff, 1);
    dir.position.set(1, 2, 1); dir.castShadow = true;
    scene.add(dir);
    console.log('✓ Scene setup complete');

    // ---- Check AR support ----
    let arSupported = false;
    try {
      arSupported = navigator.xr && await navigator.xr.isSessionSupported('immersive-ar');
    } catch (e) {
      console.warn('AR not available:', e.message);
    }
    
    if (!arSupported) {
      document.getElementById('enter-ar').textContent = 'AR not supported on this device';
      document.getElementById('enter-ar').disabled = true;
      console.warn('AR is not supported');
    } else {
      // ---- AR button (requires hit-test + dom-overlay) ----
      try {
        const arBtn = ARButton.createButton(renderer, {
          requiredFeatures: ['hit-test'],
          optionalFeatures: ['dom-overlay', 'light-estimation'],
          domOverlay: { root: document.getElementById('overlay') }
        });
        document.getElementById('enter-ar').onclick = () => arBtn.click();
        console.log('✓ AR button configured');
      } catch (err) {
        console.error('AR button setup failed:', err);
        document.getElementById('enter-ar').textContent = 'AR Error';
        document.getElementById('enter-ar').disabled = true;
      }
    }

    // ---- iOS fallback (USDZ Quick Look) ----
    if (/iPad|iPhone|iPod/.test(navigator.userAgent) && !navigator.xr) {
      document.getElementById('ios-fallback').style.display = 'block';
      document.getElementById('enter-ar').textContent = 'View in AR (iOS)';
      document.getElementById('enter-ar').onclick = () =>
        document.getElementById('ios-fallback').activateAR();
      console.log('iOS fallback enabled');
    }

    // ---- Load product ----
    console.log('Loading product...');
    product = await loadProduct({
      glb:  'models/adam_smasher_cyberpunk.glb',
      usdz: 'models/product.usdz'
    });
    
    if (!product) {
      throw new Error('Product model is null');
    }
    
    scene.add(product);
    product.visible = true;  // Show in preview mode
    
    // Position camera to view the model
    const box = new THREE.Box3().setFromObject(product);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = camera.fov * (Math.PI / 180); // convert to radians
    let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2)) * 1.5;
    camera.position.z = cameraZ;
    console.log(`✓ Product loaded and positioned at Z: ${cameraZ.toFixed(2)}`);
    
    if (document.getElementById('mode')) {
      document.getElementById('mode').textContent = 'Mode: Preview';
    }

    // ---- Subsystems ----
    placement = new ARPlacement(renderer, scene);
    physics   = new PhysicsWorld();
    console.log('✓ Placement and physics initialized');

    // ---- Initialize gesture control (optional - fails gracefully) ----
    const webcamEl = document.getElementById('webcam');
    const canvasEl = document.getElementById('gesture-canvas');
    
    if (webcamEl && canvasEl) {
      Object.assign(canvasEl, { width: 160, height: 120 });
      
      try {
        gestures = new GestureController(webcamEl, canvasEl);
        await gestures.init();
        gestures.on(handleGesture);
        console.log('✓ Gesture control initialized');
      } catch (err) {
        console.warn('Gesture control failed (continuing without it):', err.message);
        // Don't return - app should work without gestures
      }
    } else {
      console.warn('Webcam or canvas elements not found');
    }

    // ---- XR Session event ----
    renderer.xr.addEventListener('sessionstart', () => {
      inARMode = true;
      product.visible = false;  // Hide preview, show only after gesture places it
      mode = 'place';
      if (document.getElementById('mode')) {
        document.getElementById('mode').textContent = 'Mode: Place';
      }
      placement.onSessionStart(renderer.xr.getSession());
      console.log('AR session started');
    });

    renderer.xr.addEventListener('sessionend', () => {
      inARMode = false;
      mode = 'place';
      product.visible = true;
      if (document.getElementById('mode')) {
        document.getElementById('mode').textContent = 'Mode: Preview';
      }
      console.log('AR session ended');
    });

    // ---- Start rendering ----
    renderer.setAnimationLoop(render);
    console.log('✓ Animation loop started');
    
  } catch (err) {
    console.error('Initialization error:', err);
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:red;font-size:20px;text-align:center;padding:20px;background:rgba(0,0,0,0.8);';
    errorDiv.textContent = `Error: ${err.message}\n\nCheck console for details`;
    document.body.appendChild(errorDiv);
  }
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
  
  // Animate product in preview mode (before AR)
  if (product && !inARMode && product.visible) {
    product.rotation.y += dt * 0.5;
  }
  
  if (inARMode && frame) {
    anchorPose = placement.update(frame) || anchorPose;
    physics.step(dt);
  }
  
  renderer.render(scene, camera);
}

// Handle window resize
window.addEventListener('resize', () => {
  if (renderer && camera) {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
});