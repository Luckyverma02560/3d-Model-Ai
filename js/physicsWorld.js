import * as CANNON from 'cannon-es';
import { threeToCannon, ShapeType } from 'three-to-cannon';
import * as THREE from 'three';

export class PhysicsWorld {
  constructor() {
    this.world = new CANNON.World({
      gravity: new CANNON.Vec3(0, -9.82, 0),
      allowSleep: true
    });
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    this.world.solver.iterations = 12;

    // Invisible floor at y = 0 (updated by AR hit-test)
    this.floorBody = new CANNON.Body({
      mass: 0,
      shape: new CANNON.Plane(),
      material: new CANNON.Material({ friction: 0.6, restitution: 0.25 })
    });
    this.floorBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    this.world.addBody(this.floorBody);

    this.bodies = new Map();   // mesh → body
    this.gravityOn = true;
  }

  /**
   * Auto-pick collider shape from mesh curvature:
   *   • Spheres / round meshes → Sphere (rolls)
   *   • Boxy                   → Box (tumbles)
   *   • Complex                → ConvexHull (realistic)
   */
  addMesh(mesh) {
    // Heuristic: ratio of bounding-sphere / bounding-box volume
    const box = new THREE.Box3().setFromObject(mesh);
    const size = box.getSize(new THREE.Vector3());
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const boxVol = size.x * size.y * size.z;
    const sphVol = (4 / 3) * Math.PI * sphere.radius ** 3;
    const roundness = sphVol / boxVol;   // ~1 = cubic, >1.5 = round-ish

    let shapeType;
    if (roundness > 1.6) shapeType = ShapeType.SPHERE;
    else if (roundness < 1.1) shapeType = ShapeType.BOX;
    else shapeType = ShapeType.HULL;

    const { shape, offset, orientation } =
      threeToCannon(mesh, { type: shapeType });

    const body = new CANNON.Body({
      mass: 1.2,
      shape,
      linearDamping: 0.05,
      angularDamping: 0.05,
      position: new CANNON.Vec3().copy(mesh.position),
      quaternion: new CANNON.Quaternion().copy(mesh.quaternion)
    });
    if (offset)      body.shapeOffsets[0].copy(offset);
    if (orientation) body.shapeOrientations[0].copy(orientation);

    this.world.addBody(body);
    this.bodies.set(mesh, body);
    return body;
  }

  setFloorY(y) { this.floorBody.position.y = y; }

  toggleGravity() {
    this.gravityOn = !this.gravityOn;
    this.world.gravity.set(0, this.gravityOn ? -9.82 : 0, 0);
    if (!this.gravityOn) {
      // Anti-gravity: give each body a tiny upward float impulse
      for (const body of this.bodies.values()) {
        body.velocity.set(
          (Math.random() - .5) * .2,
          0.4,
          (Math.random() - .5) * .2
        );
        body.angularVelocity.set(
          (Math.random() - .5) * .3, 0, (Math.random() - .5) * .3
        );
      }
    }
    document.getElementById('gravity').textContent =
      `Gravity: ${this.gravityOn ? 'ON' : 'OFF (float)'}`;
  }

  step(dt) {
    this.world.step(1 / 60, dt, 3);
    for (const [mesh, body] of this.bodies) {
      mesh.position.copy(body.position);
      mesh.quaternion.copy(body.quaternion);
    }
  }
}