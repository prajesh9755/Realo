import * as THREE from 'three';

/**
 * A flat cutout sized in real-world metres. Y-axis billboarding only, so it
 * never reveals its zero thickness but still stands upright on the floor.
 */
export class Billboard extends THREE.Group {
  constructor(texture, { widthM, heightM, placement = 'floor' }) {
    super();

    texture.colorSpace = THREE.SRGBColorSpace;
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(widthM, heightM),
      new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        alphaTest: 0.5,
        side: THREE.DoubleSide,
        toneMapped: false
      })
    );

    this.placement = placement;
    if (placement === 'floor') {
      // Stand it on the surface: base at y=0.
      this.mesh.position.y = heightM / 2;
      this.faceCamera = true;
    } else {
      this.mesh.position.y = heightM / 2;
      this.faceCamera = false;
    }

    this.add(this.mesh);
    this.widthM = widthM;
    this.heightM = heightM;
  }

  resize(widthM, heightM) {
    this.mesh.geometry.dispose();
    this.mesh.geometry = new THREE.PlaneGeometry(widthM, heightM);
    this.mesh.position.y = heightM / 2;
    this.widthM = widthM;
    this.heightM = heightM;
  }

  /** Yaw toward the camera only — pitch/roll would expose that it is a plane. */
  update(cameraPosition) {
    if (!this.faceCamera) return;
    const dx = cameraPosition.x - this.position.x;
    const dz = cameraPosition.z - this.position.z;
    this.rotation.y = Math.atan2(dx, dz);
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.map?.dispose();
    this.mesh.material.dispose();
  }
}

export function sizeFromPreset(preset, aspect) {
  const cm = preset.cm;
  return preset.axis === 'w'
    ? { w: cm, h: cm / aspect }
    : { w: cm * aspect, h: cm };
}

export function sizeFromAxis(axis, cm, aspect) {
  return axis === 'w' ? { w: cm, h: cm / aspect } : { w: cm * aspect, h: cm };
}
