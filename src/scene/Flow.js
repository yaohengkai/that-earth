import * as THREE from "three";
import { UP, randomUnitVector, makeSoftSprite } from "./glow.js";

const clamp = THREE.MathUtils.clamp;

/* ------------------------------------------------------------------------- */
/*  Particle trails flowing over the sphere                                  */
/* ------------------------------------------------------------------------- */

export class FlowTrails {
  constructor({
    parent,
    count = 90,
    segments = 24,
    radius = 1.05,
    colorA = "#6ff2d8",
    colorB = "#c8fff2",
    speed = 0.45,
    ocean = false,
    sampleSpec = null,
    headTexture = null,
    headScale = 0.02,
    lineOpacity = 0.9,
    headColor = "#c9fff4",
    reducedMotion = false,
  }) {
    this.parent = parent;
    this.count = count;
    this.segments = segments;
    this.radius = radius;
    this.speed = speed * (reducedMotion ? 0.2 : 1);
    this.ocean = ocean;
    this.sampleSpec = sampleSpec;
    this.headScale = headScale;
    this.lineOpacity = lineOpacity;

    this.seeds = [];
    this.time = 0;
    this.opacity = 0;

    const cA = new THREE.Color(colorA);
    const cB = new THREE.Color(colorB);

    const pairCount = count * (segments - 1);
    this.linePositions = new Float32Array(pairCount * 2 * 3);
    this.lineColors = new Float32Array(pairCount * 2 * 3);
    this.headPositions = new Float32Array(count * 3);
    this.beadPositions = new Float32Array(count * segments * 3);
    this.beadColors = new Float32Array(count * segments * 3);

    for (let j = 0; j < segments; j++) {
      const f = j / (segments - 1);
      const color = cA.clone().lerp(cB, f).multiplyScalar(Math.pow(f, 1.9) * 0.7);
      for (let i = 0; i < count; i++) {
        const beadBase = (i * segments + j) * 3;
        this.beadColors[beadBase] = color.r;
        this.beadColors[beadBase + 1] = color.g;
        this.beadColors[beadBase + 2] = color.b;
      }
    }

    for (let j = 0; j < segments - 1; j++) {
      const f = j / (segments - 1);
      const color = cA.clone().lerp(cB, f).multiplyScalar(Math.pow(f, 1.65));
      for (let i = 0; i < count; i++) {
        const base = (i * (segments - 1) + j) * 2 * 3;
        const base2 = base + 3;
        this.lineColors[base] = color.r;
        this.lineColors[base + 1] = color.g;
        this.lineColors[base + 2] = color.b;
        this.lineColors[base2] = color.r;
        this.lineColors[base2 + 1] = color.g;
        this.lineColors[base2 + 2] = color.b;
      }
    }

    for (let i = 0; i < count; i++) {
      const seed = this.createSeed(i);
      this.seeds.push(seed);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(this.linePositions, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute("color", new THREE.BufferAttribute(this.lineColors, 3));
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), radius * 1.15);

    this.lineMaterial = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
    });
    this.lines = new THREE.LineSegments(geometry, this.lineMaterial);
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 4;
    parent.add(this.lines);

    const headGeometry = new THREE.BufferGeometry();
    headGeometry.setAttribute("position", new THREE.BufferAttribute(this.headPositions, 3).setUsage(THREE.DynamicDrawUsage));
    headGeometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), radius * 1.15);
    this.headMaterial = new THREE.PointsMaterial({
      size: headScale,
      map: headTexture,
      color: new THREE.Color(headColor),
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
      alphaTest: 0.001,
    });
    this.heads = new THREE.Points(headGeometry, this.headMaterial);
    this.heads.frustumCulled = false;
    this.heads.renderOrder = 5;
    parent.add(this.heads);

    const beadGeometry = new THREE.BufferGeometry();
    beadGeometry.setAttribute("position", new THREE.BufferAttribute(this.beadPositions, 3).setUsage(THREE.DynamicDrawUsage));
    beadGeometry.setAttribute("color", new THREE.BufferAttribute(this.beadColors, 3));
    beadGeometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), radius * 1.15);
    this.beadMaterial = new THREE.PointsMaterial({
      size: headScale * 0.52,
      map: headTexture,
      vertexColors: true,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
      alphaTest: 0.001,
    });
    this.beads = new THREE.Points(beadGeometry, this.beadMaterial);
    this.beads.frustumCulled = false;
    this.beads.renderOrder = 4;
    parent.add(this.beads);

    this.writeGeometry();
  }

  createSeed(index) {
    const p = new THREE.Vector3();
    let attempts = 0;
    do {
      randomUnitVector(p);
      attempts++;
    } while (
      this.ocean &&
      this.sampleSpec &&
      this.sampleSpec(0.5 + Math.atan2(-p.z, p.x) / (Math.PI * 2), 0.5 + Math.asin(p.y) / Math.PI) > 0.45 &&
      attempts < 40
    );

    const trail = new Float32Array(this.segments * 3);
    for (let j = 0; j < this.segments; j++) {
      trail[j * 3] = p.x * this.radius;
      trail[j * 3 + 1] = p.y * this.radius;
      trail[j * 3 + 2] = p.z * this.radius;
    }

    return {
      head: p.clone(),
      trail,
      phase: Math.random() * Math.PI * 2,
      speed: 0.65 + Math.random() * 0.8,
      radius: this.radius + (Math.random() - 0.5) * 0.012,
      index,
    };
  }

  update(dt, time, opacity) {
    this.opacity = opacity;
    const visible = opacity > 0.008;
    this.lines.visible = visible;
    this.heads.visible = visible;
    this.beads.visible = visible;
    if (!visible) return;

    this.lineMaterial.opacity = opacity * this.lineOpacity;
    this.headMaterial.opacity = opacity * 0.95;
    this.beadMaterial.opacity = opacity * 0.62;
    this.time += dt;

    const step = Math.min(dt, 0.05);
    for (const seed of this.seeds) {
      const p = seed.head;
      const lat = Math.asin(clamp(p.y, -1, 1));
      const lon = Math.atan2(-p.z, p.x);

      let zonal = this.speed * (0.55 + 0.7 * Math.cos(lat * 3.2 + seed.phase * 0.12));
      let merc = 0;
      if (this.ocean) {
        zonal *= 0.42;
        merc = 0.09 * this.speed * Math.sin(lon * 3.0 + lat * 2.5 + this.time * 0.08 + seed.phase);
      } else {
        zonal *= 0.82 + 0.55 * Math.pow(Math.cos(lat * 2.2), 4.0);
        merc = 0.1 * this.speed * Math.sin(lon * 4.0 + this.time * 0.12 + seed.phase * 0.2) * Math.cos(lat * 2.0);
      }

      const up = Math.abs(p.y) > 0.975 ? new THREE.Vector3(0, 0, 1) : UP;
      const east = new THREE.Vector3().crossVectors(up, p).normalize();
      if (!Number.isFinite(east.x) || east.lengthSq() < 1e-6) east.set(1, 0, 0);
      const north = new THREE.Vector3().crossVectors(p, east).normalize();

      p.addScaledVector(east, zonal * seed.speed * step);
      p.addScaledVector(north, merc * seed.speed * step);
      p.normalize();

      const r = seed.radius + Math.sin(this.time * 0.8 + seed.phase) * 0.004;
      const trail = seed.trail;
      trail.copyWithin(0, 3);
      trail[(this.segments - 1) * 3] = p.x * r;
      trail[(this.segments - 1) * 3 + 1] = p.y * r;
      trail[(this.segments - 1) * 3 + 2] = p.z * r;
    }

    this.writeGeometry();
  }

  writeGeometry() {
    const count = this.count;
    const segments = this.segments;
    const positions = this.linePositions;
    const heads = this.headPositions;
    const beads = this.beadPositions;

    for (let i = 0; i < count; i++) {
      const trail = this.seeds[i].trail;
      for (let j = 0; j < segments; j++) {
        const beadBase = (i * segments + j) * 3;
        beads[beadBase] = trail[j * 3];
        beads[beadBase + 1] = trail[j * 3 + 1];
        beads[beadBase + 2] = trail[j * 3 + 2];
      }
      for (let j = 0; j < segments - 1; j++) {
        const out = (i * (segments - 1) + j) * 6;
        const a = j * 3;
        const b = (j + 1) * 3;
        positions[out] = trail[a];
        positions[out + 1] = trail[a + 1];
        positions[out + 2] = trail[a + 2];
        positions[out + 3] = trail[b];
        positions[out + 4] = trail[b + 1];
        positions[out + 5] = trail[b + 2];
      }
      const head = (segments - 1) * 3;
      heads[i * 3] = trail[head];
      heads[i * 3 + 1] = trail[head + 1];
      heads[i * 3 + 2] = trail[head + 2];
    }

    this.lines.geometry.attributes.position.needsUpdate = true;
    this.heads.geometry.attributes.position.needsUpdate = true;
    this.beads.geometry.attributes.position.needsUpdate = true;
  }
}

/* ------------------------------------------------------------------------- */
/*  Lightning — brief, restrained strikes on the visible hemisphere          */
/* ------------------------------------------------------------------------- */

export class LightningSystem {
  constructor({ parent, camera, spin, flashTexture, intensity = 1 }) {
    this.parent = parent;
    this.camera = camera;
    this.spin = spin;
    this.intensity = intensity;
    this.bolts = [];

    for (let i = 0; i < 3; i++) {
      const group = new THREE.Group();
      group.visible = false;

      const geometry = new THREE.BufferGeometry();
      const positions = new Float32Array(10 * 3);
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 0.3);

      const material = new THREE.LineBasicMaterial({
        color: 0xdff6ff,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const line = new THREE.Line(geometry, material);
      line.frustumCulled = false;

      const flash = makeSoftSprite({
        color: "170,220,255",
        inner: 0.32,
        scale: 0.62,
      });
      flash.position.y = 0.05;

      group.add(line, flash);
      parent.add(group);

      this.bolts.push({
        group,
        line,
        flash,
        positions,
        timer: 1.5 + Math.random() * 5,
        life: 1,
        active: false,
      });
    }
  }

  strike(bolt) {
    const localCam = this.spin.worldToLocal(this.camera.position.clone()).normalize();
    const t1 = new THREE.Vector3().crossVectors(UP, localCam);
    if (t1.lengthSq() < 1e-4) t1.set(1, 0, 0).cross(localCam);
    t1.normalize();
    const t2 = new THREE.Vector3().crossVectors(localCam, t1).normalize();

    const angle = Math.random() * Math.PI * 2;
    const off = 0.18 + Math.random() * 0.62;
    const dir = localCam
      .clone()
      .multiplyScalar(Math.cos(off))
      .addScaledVector(t1, Math.sin(off) * Math.cos(angle))
      .addScaledVector(t2, Math.sin(off) * Math.sin(angle))
      .normalize();

    bolt.group.position.copy(dir).multiplyScalar(1.001);
    bolt.group.quaternion.setFromUnitVectors(UP, dir);

    let x = 0;
    let z = 0;
    const points = bolt.positions;
    for (let i = 0; i < 10; i++) {
      const t = i / 9;
      x += (Math.random() - 0.5) * 0.022;
      z += (Math.random() - 0.5) * 0.022;
      points[i * 3] = x;
      points[i * 3 + 1] = 0.16 * (1 - t);
      points[i * 3 + 2] = z;
    }
    bolt.line.geometry.attributes.position.needsUpdate = true;

    bolt.life = 0;
    bolt.active = true;
    bolt.timer = 2.8 + Math.random() * 5.5;
    bolt.group.visible = true;
  }

  update(dt, enabled) {
    for (const bolt of this.bolts) {
      if (!enabled) {
        bolt.line.material.opacity = 0;
        bolt.flash.material.opacity = 0;
        bolt.group.visible = false;
        bolt.active = false;
        continue;
      }

      bolt.timer -= dt;
      if (bolt.timer <= 0) {
        this.strike(bolt);
      }

      if (!bolt.active) continue;
      bolt.life += dt;

      let opacity = 0;
      const l = bolt.life;
      if (l < 0.07) opacity = 1;
      else if (l < 0.13) opacity = 0.08;
      else if (l < 0.2) opacity = 0.8;
      else if (l < 0.28) opacity = 0.22;
      else if (l < 0.42) opacity = 0.5;
      else opacity = 0;

      if (l > 0.55) {
        bolt.active = false;
        bolt.group.visible = false;
        continue;
      }

      bolt.line.material.opacity = opacity * this.intensity;
      bolt.flash.material.opacity = opacity * 0.65 * this.intensity;
      const s = 0.45 + opacity * 0.35;
      bolt.flash.scale.set(s, s, 1);
    }
  }
}
