import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { ARButton } from 'three/addons/webxr/ARButton.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

console.log('🔵 main.js loaded');

let renderer, scene, camera, product;
let inARMode = false;

// Initialize as soon as possible
(async () => {
  console.log('🔵 Initialization starting');
  
  try {
    // Create Three.js scene
    console.log('Creating renderer...');
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;
    renderer.setClearColor(0x1a1a1a, 1);
    document.body.appendChild(renderer.domElement);
    console.log('✅ Renderer created');

    // Create scene
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 40);
    camera.position.z = 1;

    // Add lighting
    const light1 = new THREE.HemisphereLight(0xffffff, 0x444444, 1.2);
    scene.add(light1);
    
    const light2 = new THREE.DirectionalLight(0xffffff, 1);
    light2.position.set(1, 2, 1);
    light2.castShadow = true;
    scene.add(light2);
    
    console.log('✅ Lights added');

    // Load product model
    console.log('📦 Loading model (with debug fetch)...');
    const draco = new DRACOLoader().setDecoderPath('https://www.gstatic.com/draco/v1/decoders/');
    const loader = new GLTFLoader().setDRACOLoader(draco);

    // Fetch the GLB first to diagnose unexpected HTML responses
    const modelUrl = '/models/adam_smasher_cyberpunk.glb';
    console.log('Fetching model URL:', modelUrl);
    const resp = await fetch(modelUrl);
    console.log('Fetch status:', resp.status, 'Content-Type:', resp.headers.get('content-type'));
    const buf = await resp.arrayBuffer();

    // Quick check: if returned data begins with '<' it's HTML (index.html served)
    const headBytes = new Uint8Array(buf.slice(0, 16));
    const firstChars = Array.from(headBytes).map(b => String.fromCharCode(b)).join('');
    if (firstChars.trim().startsWith('<')) {
      // decode some text for debugging
      const text = new TextDecoder().decode(buf.slice(0, 1024));
      console.error('Model fetch returned HTML (likely index.html or error page). First bytes:', text.slice(0, 300));
      throw new Error('Model fetch returned HTML instead of binary GLB. Check Network tab and model path.');
    }

    // Parse the ArrayBuffer using the GLTFLoader parser
    product = await new Promise((resolve, reject) => {
      try {
        loader.parse(buf, '', (gltf) => {
          console.log('✅ Model parsed successfully');
          resolve(gltf.scene);
        }, (err) => {
          console.error('❌ GLTF parse error:', err);
          reject(err);
        });
      } catch (e) {
        reject(e);
      }
    });

    // Normalize and position the model
    console.log('Normalizing model...');
    const box = new THREE.Box3().setFromObject(product);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    product.position.sub(center);
    const scale = 0.3 / size.length();
    product.scale.setScalar(scale);
    product.traverse(m => {
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
    
    scene.add(product);
    product.visible = true;
    console.log('✅ Model added to scene');

    // Position camera to see the model
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = camera.fov * (Math.PI / 180);
    const cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2)) * 1.5;
    camera.position.z = cameraZ;
    console.log(`✅ Camera positioned at Z: ${cameraZ.toFixed(2)}`);

    // Set up AR button
    console.log('Setting up AR...');
    try {
      const arBtn = ARButton.createButton(renderer, {
        requiredFeatures: ['hit-test'],
        optionalFeatures: ['dom-overlay', 'light-estimation'],
        domOverlay: { root: document.getElementById('overlay') }
      });
      
      const enterBtn = document.getElementById('enter-ar');
      if (enterBtn) {
        enterBtn.onclick = () => {
          console.log('🟢 AR button clicked');
          arBtn.click();
        };
        console.log('✅ AR button configured');
      } else {
        console.warn('⚠️ #enter-ar button not found in DOM');
      }
    } catch (err) {
      console.warn('⚠️ AR setup failed (WebXR not available):', err.message);
      const btn = document.getElementById('enter-ar');
      if (btn) {
        btn.textContent = 'AR Not Supported';
        btn.disabled = true;
      }
    }

    // Handle window resize
    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // Start animation loop
    console.log('Starting animation loop...');
    renderer.setAnimationLoop(() => {
      // Rotate model in preview mode
      if (product && !inARMode) {
        product.rotation.y += 0.003;
      }
      renderer.render(scene, camera);
    });

    console.log('✅ Initialization complete!');

  } catch (err) {
    console.error('❌ FATAL ERROR:', err);
    document.body.innerHTML = `
      <div style="
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        text-align: center;
        color: #f00;
        font-family: monospace;
        background: rgba(0,0,0,0.9);
        padding: 40px;
        border-radius: 10px;
        max-width: 80%;
      ">
        <h2>❌ Error Loading AR Viewer</h2>
        <p>${err.message}</p>
        <pre style="text-align: left; overflow-x: auto; margin-top: 20px;">
${err.stack}
        </pre>
        <p style="margin-top: 20px; font-size: 12px;">Check browser console (F12) for more details</p>
      </div>
    `;
  }
})();

// Log if main.js completes
console.log('🔵 main.js script execution complete');
