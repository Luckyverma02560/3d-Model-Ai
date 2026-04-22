import * as THREE from 'three';

export class ARPlacement {
  constructor(renderer, scene) {
    this.renderer = renderer;
    this.scene    = scene;
    this.hitTestSource = null;
    this.refSpace      = null;
    this.reticle = new THREE.Mesh(
      new THREE.RingGeometry(0.08, 0.1, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x00aaff })
    );
    this.reticle.matrixAutoUpdate = false;
    this.reticle.visible = false;
    scene.add(this.reticle);
  }

  async onSessionStart(session) {
    const viewerSpace = await session.requestReferenceSpace('viewer');
    this.hitTestSource = await session.requestHitTestSource({ space: viewerSpace });
    this.refSpace = await session.requestReferenceSpace('local-floor');
    this.renderer.xr.setReferenceSpace(this.refSpace);
  }

  update(frame) {
    if (!this.hitTestSource || !frame) return null;
    const hits = frame.getHitTestResults(this.hitTestSource);
    if (hits.length) {
      const pose = hits[0].getPose(this.refSpace);
      this.reticle.visible = true;
      this.reticle.matrix.fromArray(pose.transform.matrix);
      return pose;
    }
    this.reticle.visible = false;
    return null;
  }
}
