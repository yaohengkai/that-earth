import * as THREE from "three";

export function makeGlowTexture({
  core = "rgba(255,255,255,1)",
  mid = "rgba(126,242,212,0.42)",
  edge = "rgba(126,242,212,0)",
  size = 256,
  midpoint = 0.28,
} = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const c = size / 2;
  const gradient = ctx.createRadialGradient(c, c, 0, c, c, c);
  gradient.addColorStop(0, core);
  gradient.addColorStop(midpoint, mid);
  gradient.addColorStop(1, edge);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

export function makeSoftSprite({
  color = "126,242,212",
  inner = 0.55,
  size = 128,
  scale = 1,
} = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const c = size / 2;
  const g = ctx.createRadialGradient(c, c, 0, c, c, c);
  g.addColorStop(0, `rgba(255,255,255,1)`);
  g.addColorStop(inner, `rgba(${color},0.85)`);
  g.addColorStop(0.75, `rgba(${color},0.12)`);
  g.addColorStop(1, `rgba(${color},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    opacity: 0,
    color: 0xffffff,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(scale, scale, 1);
  return sprite;
}

export const UP = new THREE.Vector3(0, 1, 0);
export const Z_AXIS = new THREE.Vector3(0, 0, 1);

export function randomUnitVector(target = new THREE.Vector3()) {
  const y = 1 - Math.random() * 2;
  const theta = Math.random() * Math.PI * 2;
  const r = Math.sqrt(Math.max(0, 1 - y * y));
  return target.set(Math.cos(theta) * r, y, Math.sin(theta) * r);
}
