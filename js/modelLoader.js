import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { USDZLoader }  from 'three/addons/loaders/USDZLoader.js';

export async function loadProduct(urls) {
  // urls: { glb: 'models/product.glb', usdz: 'models/product.usdz' }
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  if (isIOS && urls.usdz) {
    try {
      const loader = new USDZLoader();
      const asset  = await loader.loadAsync(urls.usdz);
      return normalize(asset);
    } catch (e) { console.warn('USDZ failed, fallback to GLB', e); }
  }
  const draco = new DRACOLoader().setDecoderPath(
    'https://www.gstatic.com/draco/v1/decoders/'
  );
  const gltf = await new GLTFLoader().setDRACOLoader(draco).loadAsync(urls.glb);
  return normalize(gltf.scene);
}

function normalize(obj) {
  // Centre on origin & fit to 0.3 m default AR size
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3()).length();
  const center = box.getCenter(new THREE.Vector3());
  obj.position.sub(center);
  const scale = 0.3 / size;
  obj.scale.setScalar(scale);
  obj.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  return obj;
}