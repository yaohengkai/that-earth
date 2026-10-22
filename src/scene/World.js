import * as THREE from "three";
import {
  earthVertex,
  earthFragment,
  cloudVertex,
  cloudFragment,
  atmosphereVertex,
  atmosphereFragment,
  gridVertex,
  atmosphereOuterFragment,
  gridFragment,
  layerVertex,
  layerFragment,
  isoVertex,
  isoFragment,
  starVertex,
  starFragment,
  nodeVertex,
  nodeFragment,
} from "./shaders.js";
import { FlowTrails, LightningSystem } from "./Flow.js";
import { makeGlowTexture, makeSoftSprite, randomUnitVector } from "./glow.js";

const clamp = THREE.MathUtils.clamp;
const damp = (current, target, lambda, dt) => target + (current - target) * Math.exp(-lambda * dt);
const smoothstep = (edge0, edge1, x) => {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};
const easeOutCubic = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
const shortestAngle = (from, to) => {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return from + d;
};

const TARGETS = {
  hero: { z: 16, x: 0.6, y: 0.55, yaw: 2.15, tilt: 0.06 },
  manifesto: { z: 3.6, x: 1.15, y: 0.02, yaw: 2.38, tilt: 0.1 },
  "phase-1": { z: 4.0, x: 0.96, y: 0.02, yaw: 2.32, tilt: 0.16 },
  variables: { z: 4.15, x: 1.05, y: 0, yaw: 2.5, tilt: 0.2 },
  effects: { z: 4.0, x: -0.98, y: 0, yaw: 2.08, tilt: 0.18 },
  "phase-2": { z: 4.0, x: 1.0, y: 0, yaw: 0.35, tilt: 0.14 },
  "phase-3": { z: 5.5, x: 0, y: -0.08, yaw: -1.82, tilt: 0.24 },
  outro: { z: 12, x: 0, y: 0.8, yaw: 2.0, tilt: 0.1 },
};

const MOBILE_TARGETS = {
  hero: { z: 16, x: 0.24, y: 0.55, yaw: 2.15, tilt: 0.06 },
  manifesto: { z: 5.15, x: 0, y: 0.08, yaw: 2.38, tilt: 0.12 },
  "phase-1": { z: 6.5, x: 0.28, y: 1.05, yaw: 2.32, tilt: 0.16 },
  variables: { z: 6.45, x: 0.24, y: 1.28, yaw: 2.5, tilt: 0.2 },
  effects: { z: 6.7, x: 0.16, y: 1.42, yaw: 2.08, tilt: 0.18 },
  "phase-2": { z: 6.5, x: 0.3, y: 0.35, yaw: 0.35, tilt: 0.14 },
  "phase-3": { z: 7.4, x: 0, y: -0.15, yaw: -1.82, tilt: 0.24 },
  outro: { z: 12, x: 0, y: 0.58, yaw: 2.0, tilt: 0.1 },
};

const LAYER_DEFS = [
  {
    type: 0,
    radius: 1.03,
    colorA: "#1c9f8e",
    colorB: "#83f5dd",
    offset: new THREE.Vector3(0.95, 0.5, 0.16).normalize(),
  },
  {
    type: 1,
    radius: 1.033,
    colorA: "#2c78cf",
    colorB: "#8fe9ff",
    offset: new THREE.Vector3(-0.82, 0.46, 0.3).normalize(),
  },
  {
    type: 2,
    radius: 1.036,
    colorA: "#a87944",
    colorB: "#e8c88f",
    offset: new THREE.Vector3(0.74, -0.52, 0.42).normalize(),
  },
  {
    type: 3,
    radius: 1.039,
    colorA: "#3d9a52",
    colorB: "#b6e88a",
    offset: new THREE.Vector3(-0.78, -0.4, 0.22).normalize(),
  },
];

const LAYER_NAMES = ["ATMOSPHERE", "OCEAN", "LITHOSPHERE", "BIOGEOCHEMISTRY"];

const LIGHT_LAYER_COLORS = [
  ["#0a7f73", "#2fb9a5"],
  ["#1d63b3", "#3f96d0"],
  ["#906123", "#b58845"],
  ["#2d7737", "#4f9948"],
];

export class World {
  constructor(canvas) {
    this.canvas = canvas;
    this.theme = document.documentElement.dataset.theme === "light" ? "light" : "dark";

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      // Keeps the last frame available to the compositor. Without this,
      // some GPU/driver combinations show black tiles while a fixed WebGL
      // canvas is composited under a long scrolling page.
      preserveDrawingBuffer: true,
      powerPreference: "high-performance",
    });
    this.renderer.setClearColor(this.theme === "light" ? 0xe9f3f0 : 0x02050a, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.02;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 500);

    this.isMobile = window.innerWidth <= 900;
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, this.isMobile ? 1.5 : 1.8);
    this.maxAniso = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());

    this.time = 0;
    this.spinOffset = 0;
    this.pointer = new THREE.Vector2();
    this.pointerTarget = new THREE.Vector2();
    this.camZ = TARGETS.hero.z;
    this.earthX = TARGETS.hero.x;
    this.earthY = TARGETS.hero.y;
    this.yaw = TARGETS.hero.yaw;
    this.tiltX = TARGETS.hero.tilt;

    this.activeLayer = -1;
    this.layerStates = [];
    this.solarFade = 0;
    this.isoOpacity = 0;
    this.ringsOpacity = 0;
    this.windOpacity = 0;
    this.oceanOpacity = 0;
    this.gridOpacity = 0;
    this.nodeOpacity = 0;
    this.atmosphereOpacity = 1;

    this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    this._onResize = this.resize.bind(this);
    window.addEventListener("resize", this._onResize, { passive: true });

    this.resize();

    this.buildStars();
    this.buildNebula();
    this.buildSolarSystem();
  }

  /* --------------------------------------------------------------------- */
  /*  Loading                                                              */
  /* --------------------------------------------------------------------- */

  async init(onProgress = () => {}) {
    onProgress(0.06);

    const manager = new THREE.LoadingManager();
    manager.onProgress = (_url, loaded, total) => {
      onProgress(0.06 + (loaded / Math.max(1, total)) * 0.78);
    };
    manager.onError = (url) => {
      console.warn("[That Earth] texture failed:", url);
    };

    const loader = new THREE.TextureLoader(manager);
    const base = "/textures/";
    const [day, spec, clouds, lights] = await Promise.all([
      loader.loadAsync(base + (this.isMobile ? "earth_day_2048.jpg" : "earth_day_4096.jpg")),
      loader.loadAsync(base + "earth_specular_2048.jpg"),
      loader.loadAsync(base + "clouds_2048.jpg"),
      loader.loadAsync(base + "earth_lights_2048.png"),
    ]);

    for (const tex of [day, spec, clouds, lights]) {
      tex.anisotropy = this.maxAniso;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
    }
    day.colorSpace = THREE.SRGBColorSpace;
    lights.colorSpace = THREE.SRGBColorSpace;

    this.dayMap = day;
    this.specMap = spec;
    this.cloudMap = clouds;
    this.lightsMap = lights;

    this.buildSpecSampler(spec);
    this.buildEarth();
    this.buildDataLayers();
    this.buildNodes();
    this.buildTrails();
    this.buildLightning();
    this.buildIsoSurface();
    this.buildRings();

    onProgress(0.94);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    onProgress(1);
  }

  buildSpecSampler(texture) {
    const w = 512;
    const h = 256;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(texture.image, 0, 0, w, h);
    this.specData = ctx.getImageData(0, 0, w, h).data;
    this.specW = w;
    this.specH = h;
    this.sampleSpec = (u, v) => {
      const x = Math.floor((((u % 1) + 1) % 1) * (w - 1));
      const y = Math.floor(clamp(1 - v, 0, 1) * (h - 1));
      return this.specData[(y * w + x) * 4] / 255;
    };
  }

  /* --------------------------------------------------------------------- */
  /*  Space: stars, nebula, sun and planets                                */
  /* --------------------------------------------------------------------- */

  buildStars() {
    this.starGroup = new THREE.Group();
    this.scene.add(this.starGroup);

    const count = this.isMobile ? 3200 : 5600;
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const phases = new Float32Array(count);
    const colors = new Float32Array(count * 3);
    const palette = [
      new THREE.Color("#eaf7ff"),
      new THREE.Color("#eaf7ff"),
      new THREE.Color("#eaf7ff"),
      new THREE.Color("#a8fff0"),
      new THREE.Color("#ffd9b0"),
      new THREE.Color("#bdb4ff"),
    ];

    for (let i = 0; i < count; i++) {
      const p = randomUnitVector();
      const r = 60 + Math.random() * 100;
      positions[i * 3] = p.x * r;
      positions[i * 3 + 1] = p.y * r;
      positions[i * 3 + 2] = p.z * r;
      sizes[i] = 0.22 + Math.pow(Math.random(), 3) * 1.1;
      phases[i] = Math.random();
      const c = palette[Math.floor(Math.random() * palette.length)];
      const brightness = 0.5 + Math.random() * 0.6;
      colors[i * 3] = c.r * brightness;
      colors[i * 3 + 1] = c.g * brightness;
      colors[i * 3 + 2] = c.b * brightness;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
    geometry.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));

    this.starMaterial = new THREE.ShaderMaterial({
      vertexShader: starVertex,
      fragmentShader: starFragment,
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: this.pixelRatio },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.stars = new THREE.Points(geometry, this.starMaterial);
    this.stars.frustumCulled = false;
    this.starGroup.add(this.stars);

    /* A faint galactic band — gives the black some grain */
    const bandCount = this.isMobile ? 900 : 1800;
    const bandPos = new Float32Array(bandCount * 3);
    const bandSize = new Float32Array(bandCount);
    const bandPhase = new Float32Array(bandCount);
    const bandColor = new Float32Array(bandCount * 3);
    const c1 = new THREE.Color("#b7d9ff");
    const c2 = new THREE.Color("#e6c6ff");

    for (let i = 0; i < bandCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const r = 75 + Math.random() * 80;
      const lat = (Math.random() - 0.5) * 0.34;
      const x = Math.cos(theta) * Math.cos(lat) * r;
      const y = Math.sin(lat) * r;
      const z = Math.sin(theta) * Math.cos(lat) * r;
      bandPos[i * 3] = x;
      bandPos[i * 3 + 1] = y;
      bandPos[i * 3 + 2] = z;
      bandSize[i] = 0.15 + Math.random() * 0.55;
      bandPhase[i] = Math.random();
      const c = c1.clone().lerp(c2, Math.random());
      const b = 0.3 + Math.random() * 0.35;
      bandColor[i * 3] = c.r * b;
      bandColor[i * 3 + 1] = c.g * b;
      bandColor[i * 3 + 2] = c.b * b;
    }

    const bandGeom = new THREE.BufferGeometry();
    bandGeom.setAttribute("position", new THREE.BufferAttribute(bandPos, 3));
    bandGeom.setAttribute("aSize", new THREE.BufferAttribute(bandSize, 1));
    bandGeom.setAttribute("aPhase", new THREE.BufferAttribute(bandPhase, 1));
    bandGeom.setAttribute("aColor", new THREE.BufferAttribute(bandColor, 3));

    this.band = new THREE.Points(bandGeom, this.starMaterial);
    this.band.frustumCulled = false;
    this.band.rotation.set(0.9, 0.4, 0.35);
    this.starGroup.add(this.band);
  }

  buildNebula() {
    this.nebulaGroup = new THREE.Group();
    this.scene.add(this.nebulaGroup);

    const a = makeGlowTexture({
      core: "rgba(120,190,205,0.18)",
      mid: "rgba(60,120,160,0.1)",
      edge: "rgba(20,50,80,0)",
      midpoint: 0.35,
    });
    const b = makeGlowTexture({
      core: "rgba(155,135,220,0.16)",
      mid: "rgba(95,80,160,0.08)",
      edge: "rgba(30,20,70,0)",
      midpoint: 0.4,
    });

    const n1 = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: a,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    n1.position.set(-55, 22, -150);
    n1.scale.set(150, 110, 1);

    const n2 = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: b,
        transparent: true,
        opacity: 0.75,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    n2.position.set(70, -30, -165);
    n2.scale.set(170, 130, 1);

    this.nebulaGroup.add(n1, n2);
  }

  buildSolarSystem() {
    this.solar = new THREE.Group();
    this.solar.position.set(this.isMobile ? -5.5 : -12, this.isMobile ? 3.8 : 4.6, -26);
    if (this.isMobile) this.solar.scale.setScalar(0.84);
    this.solar.rotation.set(-1.03, 0.22, 0.18);
    this.scene.add(this.solar);
    this.solarMats = [];
    this.planets = [];

    const addMat = (material, baseOpacity = 1, kind = "mesh") => {
      material.transparent = true;
      material.opacity = baseOpacity;
      this.solarMats.push({ material, baseOpacity, kind });
      return material;
    };

    /* sun */
    const sunMat = addMat(new THREE.MeshBasicMaterial({ color: 0xffe9bd }), 1, "sun");
    this.sunMaterial = sunMat;
    const sun = new THREE.Mesh(new THREE.SphereGeometry(1.15, 32, 24), sunMat);
    this.solar.add(sun);

    const glowWarm = makeSoftSprite({ color: "255,196,120", inner: 0.22, scale: 9.5 });
    glowWarm.material.opacity = 0.62;
    this.solarMats.push({ material: glowWarm.material, baseOpacity: 0.62, kind: "glow" });
    this.solar.add(glowWarm);

    const glowWhite = makeSoftSprite({ color: "255,243,210", inner: 0.15, scale: 4.2 });
    glowWhite.material.opacity = 0.92;
    this.solarMats.push({ material: glowWhite.material, baseOpacity: 0.92, kind: "glow" });
    this.solar.add(glowWhite);
    this.sunGlowMats = [glowWarm.material, glowWhite.material];

    /* orbit lines */
    this.orbitMats = [];
    const orbitColors = [0x8bb6b2, 0x9ec1bb, 0x84aeb1, 0xa1b9b0, 0xb7b4a0];
    for (let i = 0; i < 5; i++) {
      const radius = 3.2 + i * 1.7;
      const points = [];
      const segments = 192;
      for (let j = 0; j <= segments; j++) {
        const a = (j / segments) * Math.PI * 2;
        points.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius));
      }
      const geom = new THREE.BufferGeometry().setFromPoints(points);
      const mat = addMat(
        new THREE.LineBasicMaterial({
          color: orbitColors[i],
          transparent: true,
          opacity: 0.22,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
        0.18,
        "orbit"
      );
      mat.userData.darkColor = new THREE.Color(orbitColors[i]);
      mat.userData.lightColor = new THREE.Color(0x4f8e86);
      this.orbitMats.push(mat);
      const line = new THREE.Line(geom, mat);
      this.solar.add(line);
    }

    /* planets */
    const defs = [
      { r: 3.2, size: 0.13, color: 0xb9a896, lightColor: 0x877565, speed: 0.13, phase: 1.2 },
      { r: 4.9, size: 0.19, color: 0xe5c597, lightColor: 0xc19a5d, speed: 0.1, phase: 4.4 },
      { r: 6.6, size: 0.15, color: 0xd27f5f, lightColor: 0xb85d40, speed: 0.08, phase: 2.6 },
      { r: 8.3, size: 0.33, color: 0xdcc094, lightColor: 0xb58a52, speed: 0.055, phase: 5.2 },
      { r: 10.0, size: 0.26, color: 0xe3d1a3, lightColor: 0xb09a62, speed: 0.04, phase: 0.4, ring: true },
    ];

    for (const def of defs) {
      const group = new THREE.Group();
      const mat = addMat(new THREE.MeshBasicMaterial({ color: def.color }), 1, "planet");
      mat.userData.darkColor = new THREE.Color(def.color);
      mat.userData.lightColor = new THREE.Color(def.lightColor || def.color);
      this.planetMats = this.planetMats || [];
      this.planetMats.push(mat);
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(def.size, 18, 14), mat);
      group.add(mesh);

      if (def.ring) {
        const ringMat = addMat(
          new THREE.MeshBasicMaterial({
            color: 0xdccaa2,
            transparent: true,
            opacity: 0.42,
            side: THREE.DoubleSide,
            depthWrite: false,
          }),
          0.42,
          "ring"
        );
        const ring = new THREE.Mesh(new THREE.RingGeometry(def.size * 1.35, def.size * 1.9, 48), ringMat);
        ring.rotation.x = Math.PI / 2;
        group.add(ring);
      }

      this.solar.add(group);
      this.planets.push({ ...def, group });
    }

    /* asteroid belt */
    const beltCount = this.isMobile ? 220 : 460;
    const beltPos = new Float32Array(beltCount * 3);
    for (let i = 0; i < beltCount; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 5.5 + Math.random() * 0.9;
      beltPos[i * 3] = Math.cos(a) * r;
      beltPos[i * 3 + 1] = (Math.random() - 0.5) * 0.16;
      beltPos[i * 3 + 2] = Math.sin(a) * r;
    }
    const beltGeom = new THREE.BufferGeometry();
    beltGeom.setAttribute("position", new THREE.BufferAttribute(beltPos, 3));
    const beltMat = addMat(
      new THREE.PointsMaterial({
        color: 0x9b8f7a,
        size: 0.035,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
      0.55,
      "belt"
    );
    this.beltMaterial = beltMat;
    this.solar.add(new THREE.Points(beltGeom, beltMat));

    this.solarFade = 1;
    this.applySolarFade(1);
  }

  applySolarFade(fade) {
    this.solarFade = fade;
    this.solar.visible = fade > 0.005;
    const light = this.theme === "light";
    for (const item of this.solarMats) {
      let opacity = item.baseOpacity * fade;
      if (light) {
        if (item.kind === "glow") opacity *= 0.5;
        if (item.kind === "orbit") opacity *= 1.8;
        if (item.kind === "belt") opacity = 0;
      }
      item.material.opacity = opacity;
    }
  }

  /* --------------------------------------------------------------------- */
  /*  Earth                                                                */
  /* --------------------------------------------------------------------- */

  buildEarth() {
    this.earthGroup = new THREE.Group();
    this.earthGroup.position.set(TARGETS.hero.x, TARGETS.hero.y, 0);
    this.scene.add(this.earthGroup);

    this.tilt = new THREE.Group();
    this.tilt.rotation.z = -0.205;
    this.tilt.rotation.x = TARGETS.hero.tilt;
    this.earthGroup.add(this.tilt);

    this.spin = new THREE.Group();
    this.spin.rotation.y = TARGETS.hero.yaw;
    this.tilt.add(this.spin);

    this.sunDir = new THREE.Vector3(-0.62, 0.34, 0.52).normalize();

    const earthGeometry = new THREE.SphereGeometry(1, 144, 96);
    this.earthMaterial = new THREE.ShaderMaterial({
      vertexShader: earthVertex,
      fragmentShader: earthFragment,
      uniforms: {
        uDay: { value: this.dayMap },
        uSpec: { value: this.specMap },
        uLights: { value: this.lightsMap },
        uSunDir: { value: this.sunDir },
        uTime: { value: 0 },
        uNightLights: { value: 0.46 },
        uLightTheme: { value: 0 },
      },
    });
    this.earth = new THREE.Mesh(earthGeometry, this.earthMaterial);
    this.earth.renderOrder = 0;
    this.spin.add(this.earth);

    const cloudGeometry = new THREE.SphereGeometry(1.012, 128, 80);
    this.cloudMaterial = new THREE.ShaderMaterial({
      vertexShader: cloudVertex,
      fragmentShader: cloudFragment,
      uniforms: {
        uMap: { value: this.cloudMap },
        uSunDir: { value: this.sunDir },
        uTime: { value: 0 },
        uOpacity: { value: 1 },
      },
      transparent: true,
      depthWrite: false,
      side: THREE.FrontSide,
    });
    this.clouds = new THREE.Mesh(cloudGeometry, this.cloudMaterial);
    this.clouds.renderOrder = 1;
    this.spin.add(this.clouds);

    const gridGeometry = new THREE.SphereGeometry(1.005, 96, 64);
    this.gridMaterial = new THREE.ShaderMaterial({
      vertexShader: gridVertex,
      fragmentShader: gridFragment,
      uniforms: {
        uOpacity: { value: 0 },
        uColor: { value: new THREE.Color("#74e9d3") },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.grid = new THREE.Mesh(gridGeometry, this.gridMaterial);
    this.grid.renderOrder = 2;
    this.spin.add(this.grid);

    const atmosphereGeometry = new THREE.SphereGeometry(1.038, 128, 80);
    this.atmosphereMaterial = new THREE.ShaderMaterial({
      vertexShader: atmosphereVertex,
      fragmentShader: atmosphereFragment,
      uniforms: {
        uColor: { value: new THREE.Color("#8fe8df") },
        uSunDir: { value: this.sunDir },
        uOpacity: { value: 1 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.atmosphere = new THREE.Mesh(atmosphereGeometry, this.atmosphereMaterial);
    this.atmosphere.renderOrder = 6;
    this.earthGroup.add(this.atmosphere);

    const outerGeometry = new THREE.SphereGeometry(1.078, 96, 64);
    this.outerAtmosphereMaterial = new THREE.ShaderMaterial({
      vertexShader: atmosphereVertex,
      fragmentShader: atmosphereOuterFragment,
      uniforms: {
        uColor: { value: new THREE.Color("#3fa9b4") },
        uOpacity: { value: 0.13 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.outerAtmosphere = new THREE.Mesh(outerGeometry, this.outerAtmosphereMaterial);
    this.outerAtmosphere.renderOrder = 7;
    this.earthGroup.add(this.outerAtmosphere);

    const haloTexture = makeGlowTexture({
      core: "rgba(178,255,241,0.9)",
      mid: "rgba(65,190,190,0.32)",
      edge: "rgba(20,80,100,0)",
      midpoint: 0.24,
    });
    this.halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: haloTexture,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    this.halo.scale.set(3.1, 3.1, 1);
    this.halo.position.z = -0.45;
    this.halo.renderOrder = -1;
    this.earthGroup.add(this.halo);
  }

  buildDataLayers() {
    this.layerStates = [];

    for (let i = 0; i < LAYER_DEFS.length; i++) {
      const def = LAYER_DEFS[i];
      const group = new THREE.Group();
      const geometry = new THREE.SphereGeometry(def.radius, 112, 72);
      const material = new THREE.ShaderMaterial({
        vertexShader: layerVertex,
        fragmentShader: layerFragment,
        uniforms: {
          uTime: { value: 0 },
          uOpacity: { value: 0 },
          uPeel: { value: i === 0 ? 0 : 1 },
          uType: { value: def.type },
          uColorA: { value: new THREE.Color(def.colorA) },
          uColorB: { value: new THREE.Color(def.colorB) },
          uLightTheme: { value: 0 },
          uPeelDir: { value: new THREE.Vector3(0.85, 0.42, 0.3).normalize() },
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.FrontSide,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.renderOrder = 3;
      mesh.visible = false;
      group.add(mesh);
      this.spin.add(group);

      this.layerStates.push({
        group,
        mesh,
        material,
        def,
        opacity: 0,
        peel: i === 0 ? 0 : 1,
        baseRotation: group.rotation.clone(),
      });
    }
  }

  buildNodes() {
    const count = this.isMobile ? 22 : 36;
    const positions = new Float32Array(count * 3);
    const phases = new Float32Array(count);
    const sizes = new Float32Array(count);
    let found = 0;
    let attempts = 0;

    while (found < count && attempts < 2000) {
      attempts++;
      const p = randomUnitVector();
      const u = 0.5 + Math.atan2(-p.z, p.x) / (Math.PI * 2);
      const v = 0.5 + Math.asin(p.y) / Math.PI;
      if (this.sampleSpec(u, v) > 0.35) continue;
      positions[found * 3] = p.x * 1.012;
      positions[found * 3 + 1] = p.y * 1.012;
      positions[found * 3 + 2] = p.z * 1.012;
      phases[found] = Math.random();
      sizes[found] = 0.06 + Math.random() * 0.07;
      found++;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
    geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    geometry.setDrawRange(0, found);

    this.nodeMaterial = new THREE.ShaderMaterial({
      vertexShader: nodeVertex,
      fragmentShader: nodeFragment,
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: this.pixelRatio },
        uColor: { value: new THREE.Color("#a9ffec") },
        uOpacity: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.nodes = new THREE.Points(geometry, this.nodeMaterial);
    this.nodes.frustumCulled = false;
    this.nodes.renderOrder = 5;
    this.spin.add(this.nodes);
  }

  buildTrails() {
    const headTexture = makeGlowTexture({
      core: "rgba(255,255,255,1)",
      mid: "rgba(150,255,238,0.55)",
      edge: "rgba(90,220,210,0)",
      midpoint: 0.2,
    });

    this.windTrails = new FlowTrails({
      parent: this.spin,
      count: this.isMobile ? 68 : 120,
      segments: this.isMobile ? 22 : 28,
      radius: 1.052,
      colorA: "#3fdcc4",
      colorB: "#d4fff5",
      speed: 0.54,
      ocean: false,
      sampleSpec: this.sampleSpec,
      headTexture,
      headScale: 0.038,
      lineOpacity: 1.0,
      headColor: "#d5fff7",
      reducedMotion: this.reducedMotion,
    });

    this.oceanTrails = new FlowTrails({
      parent: this.spin,
      count: this.isMobile ? 54 : 96,
      segments: this.isMobile ? 22 : 30,
      radius: 1.017,
      colorA: "#3c9dff",
      colorB: "#baf6ff",
      speed: 0.24,
      ocean: true,
      sampleSpec: this.sampleSpec,
      headTexture,
      headScale: 0.03,
      lineOpacity: 0.9,
      headColor: "#aeeaff",
      reducedMotion: this.reducedMotion,
    });

    this.windTrails.lines.visible = false;
    this.windTrails.heads.visible = false;
    this.oceanTrails.lines.visible = false;
    this.oceanTrails.heads.visible = false;
  }

  buildLightning() {
    const flashTexture = makeGlowTexture({
      core: "rgba(255,255,255,1)",
      mid: "rgba(175,225,255,0.5)",
      edge: "rgba(90,160,255,0)",
      midpoint: 0.2,
    });
    this.lightning = new LightningSystem({
      parent: this.spin,
      camera: this.camera,
      spin: this.spin,
      flashTexture,
      intensity: 1,
    });
  }

  buildIsoSurface() {
    this.isoGroup = new THREE.Group();
    this.earthGroup.add(this.isoGroup);

    const material = new THREE.ShaderMaterial({
      vertexShader: isoVertex,
      fragmentShader: isoFragment,
      uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: 0 },
        uColorA: { value: new THREE.Color("#4d8cff") },
        uColorB: { value: new THREE.Color("#c4b7ff") },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.FrontSide,
    });
    const shell = new THREE.Mesh(new THREE.SphereGeometry(1.16, 128, 80), material);
    shell.renderOrder = 8;
    this.isoGroup.add(shell);
    this.isoMaterial = material;

    const wireMaterial = new THREE.MeshBasicMaterial({
      color: 0x9dc6ff,
      wireframe: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const wire = new THREE.Mesh(new THREE.IcosahedronGeometry(1.235, 3), wireMaterial);
    wire.renderOrder = 8;
    this.isoGroup.add(wire);
    this.isoWireMaterial = wireMaterial;
    this.isoGroup.visible = false;
  }

  buildRings() {
    this.twinGroup = new THREE.Group();
    this.earthGroup.add(this.twinGroup);
    this.ringMats = [];
    this.ringNodes = [];

    const ringDefs = [
      { radius: 1.52, color: 0xf3d6a1, rotation: [1.22, 0.1, 0.28], speed: 0.34, nodeColor: "243,214,161" },
      { radius: 1.78, color: 0x8fc7ff, rotation: [1.36, -0.28, -0.18], speed: -0.22, nodeColor: "143,199,255" },
      { radius: 2.04, color: 0x9ce9d8, rotation: [1.08, 0.54, 0.62], speed: 0.15, nodeColor: "126,242,212" },
    ];

    ringDefs.forEach((def, index) => {
      const group = new THREE.Group();
      group.rotation.set(...def.rotation);
      this.twinGroup.add(group);

      const points = [];
      const segments = 220;
      for (let i = 0; i <= segments; i++) {
        const a = (i / segments) * Math.PI * 2;
        const wobble = 1 + Math.sin(a * 5 + index) * 0.008;
        points.push(new THREE.Vector3(Math.cos(a) * def.radius * wobble, Math.sin(a) * def.radius * wobble, 0));
      }
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const material = new THREE.LineBasicMaterial({
        color: def.color,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const lightRingColors = [0xa37732, 0x2f74b8, 0x0d8f80];
      material.userData.darkColor = new THREE.Color(def.color);
      material.userData.lightColor = new THREE.Color(lightRingColors[index]);
      const line = new THREE.LineLoop(geometry, material);
      line.renderOrder = 9;
      group.add(line);
      this.ringMats.push({ material, baseOpacity: index === 0 ? 0.5 : 0.3 });

      const node = makeSoftSprite({ color: def.nodeColor, inner: 0.25, scale: 0.11 });
      node.material.opacity = 0;
      group.add(node);
      this.ringMats.push({ material: node.material, baseOpacity: 1 });
      this.ringNodes.push({ node, radius: def.radius, speed: def.speed, phase: Math.random() * Math.PI * 2 });
    });

    this.twinGroup.visible = false;
  }

  /* --------------------------------------------------------------------- */
  /*  Update                                                               */
  /* --------------------------------------------------------------------- */

  targetFor(name) {
    const table = this.isMobile ? MOBILE_TARGETS : TARGETS;
    const base = table[name] || TARGETS[name] || TARGETS.manifesto;
    let x = base.x;
    let z = base.z;
    if (!this.isMobile && this.camera.aspect < 1.45) {
      x *= 0.82;
      z *= 1.05;
    }
    return { ...base, x, z };
  }

  update(dt, state) {
    dt = Math.min(dt, 0.05);
    this.time += dt;

    /* scene target */
    let target;
    if (state.scene === "hero") {
      const a = this.targetFor("hero");
      const b = this.targetFor("manifesto");
      const p = easeOutCubic(state.heroProgress || 0);
      target = {
        z: a.z + (b.z - a.z) * p,
        x: a.x + (b.x - a.x) * p,
        y: a.y + (b.y - a.y) * p,
        yaw: a.yaw + (b.yaw - a.yaw) * p,
        tilt: a.tilt + (b.tilt - a.tilt) * p,
      };
    } else {
      target = this.targetFor(state.scene);
    }

    const camLambda = 2.7;
    this.camZ = damp(this.camZ, target.z, camLambda, dt);
    this.earthX = damp(this.earthX, target.x, 3.2, dt);
    this.earthY = damp(this.earthY, target.y, 3.2, dt);
    this.yaw = damp(this.yaw, shortestAngle(this.yaw, target.yaw), 1.65, dt);
    this.tiltX = damp(this.tiltX, target.tilt, 2.2, dt);

    /* mouse parallax */
    this.pointer.x = damp(this.pointer.x, this.pointerTarget.x, 3.2, dt);
    this.pointer.y = damp(this.pointer.y, this.pointerTarget.y, 3.2, dt);

    /* Scroll maps to a persistent rotation target instead of a spring that
       returns to zero. This keeps the globe moving forward smoothly and
       removes the small backward catch-up after each wheel gesture. */
    this.spinOffset = damp(this.spinOffset, state.scrollY * 0.00032, 5.0, dt);

    const bob = this.reducedMotion ? 0 : Math.sin(this.time * 0.18) * 0.014;
    this.earthGroup.position.set(this.earthX, this.earthY + bob, 0);
    this.earthGroup.rotation.y = this.pointer.x * 0.02;
    this.earthGroup.rotation.x = this.pointer.y * 0.016;

    this.tilt.rotation.x = this.tiltX;
    this.tilt.rotation.z = -0.205;

    const drift = this.reducedMotion ? 0 : Math.sin(this.time * 0.055) * 0.05;
    this.spin.rotation.y = this.yaw + this.spinOffset + drift;
    this.clouds.rotation.y += dt * (this.reducedMotion ? 0.001 : 0.0075);

    this.camera.position.set(
      this.pointer.x * (this.isMobile ? 0.035 : 0.14),
      this.pointer.y * (this.isMobile ? 0.028 : 0.1),
      this.camZ
    );
    this.camera.lookAt(0, 0, 0);

    /* solar fade & positions */
    const solarTarget = state.scene === "hero" ? 1 : 0;
    this.solarFade = damp(this.solarFade, solarTarget, 2.6, dt);
    this.applySolarFade(this.solarFade);
    if (this.solar.visible) {
      for (const p of this.planets) {
        const a = p.phase + (this.reducedMotion ? 0 : this.time) * p.speed;
        p.group.position.set(Math.cos(a) * p.r, 0, Math.sin(a) * p.r);
        if (!this.reducedMotion) p.group.rotation.y += dt * 0.15;
      }
    }

    if (!this.reducedMotion) this.starGroup.rotation.y += dt * 0.0016;
    this.starMaterial.uniforms.uTime.value = this.time;
    this.earthMaterial.uniforms.uTime.value = this.time;
    this.cloudMaterial.uniforms.uTime.value = this.time;
    this.nodeMaterial.uniforms.uTime.value = this.time;

    /* layers — only one at a time, the previous sheet peels away */
    const active = state.scene === "variables" ? state.varIndex : -1;
    const camLocal = this.spin.worldToLocal(this.camera.position.clone()).normalize();
    const peelRight = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), camLocal);
    if (peelRight.lengthSq() < 1e-5) peelRight.set(1, 0, 0);
    peelRight.normalize();
    const peelUp = new THREE.Vector3().crossVectors(camLocal, peelRight).normalize();
    const peelDir = camLocal
      .clone()
      .addScaledVector(peelRight, 0.22)
      .addScaledVector(peelUp, 0.18)
      .normalize();
    const driftDir = camLocal
      .clone()
      .multiplyScalar(0.24)
      .addScaledVector(peelRight, 0.58)
      .addScaledVector(peelUp, 0.62)
      .normalize();

    for (let i = 0; i < this.layerStates.length; i++) {
      const layer = this.layerStates[i];
      const isActive = i === active;
      const isPrevious = active > 0 && i === active - 1;
      // A layer that has just been peeled off must fade away, not linger
      // as a floating cap. The previous shell gets a slightly faster fade
      // so it dissolves while it leaves the surface.
      const targetOpacity = isActive ? 1 : 0;
      const targetPeel = isActive ? 0 : 1;
      const opacityRate = isPrevious ? 8.0 : 3.0;

      layer.opacity = damp(layer.opacity, targetOpacity, opacityRate, dt);
      layer.peel = damp(layer.peel, targetPeel, 2.6, dt);

      layer.material.uniforms.uTime.value = this.time;
      layer.material.uniforms.uOpacity.value = layer.opacity;
      layer.material.uniforms.uPeel.value = layer.peel;
      layer.material.uniforms.uPeelDir.value.copy(peelDir);

      const lift = smoothstep(0, 0.95, layer.peel);
      layer.group.position.copy(driftDir).multiplyScalar(lift * 0.92);
      layer.group.rotation.z = layer.def.offset.x * lift * 0.3;
      layer.group.rotation.x = layer.def.offset.y * lift * 0.18;
      layer.group.rotation.y += dt * 0.018 * lift;

      layer.mesh.visible = layer.opacity > 0.004;
    }

    /* everything else reacts to the current chapter */
    const near = 1 - smoothstep(6.0, 11.0, this.camZ);
    const effects = state.scene === "effects";
    const phase2 = state.scene === "phase-2";
    const phase3 = state.scene === "phase-3" || state.scene === "outro";

    this.windOpacity = damp(this.windOpacity, effects ? 1 : phase2 ? 0.1 : 0, 1.4, dt);
    this.oceanOpacity = damp(this.oceanOpacity, effects ? 0.9 : 0, 1.4, dt);
    this.windTrails.update(dt, this.time, this.windOpacity);
    this.oceanTrails.update(dt, this.time, this.oceanOpacity);
    this.lightning.update(dt, !this.reducedMotion && effects && this.windOpacity > 0.2);

    this.gridOpacity = damp(this.gridOpacity, state.scene === "hero" ? 0.14 : near * (this.theme === "light" ? 0.3 : 0.38), 2.0, dt);
    this.gridMaterial.uniforms.uOpacity.value = this.gridOpacity;

    const nodeTarget = state.scene === "hero" || state.scene === "manifesto" ? 0.25 : near * 0.95;
    this.nodeOpacity = damp(this.nodeOpacity, nodeTarget, 1.8, dt);
    this.nodeMaterial.uniforms.uOpacity.value = this.nodeOpacity;

    this.isoOpacity = damp(this.isoOpacity, phase2 ? 1 : 0, 1.5, dt);
    this.isoMaterial.uniforms.uOpacity.value = this.isoOpacity;
    this.isoMaterial.uniforms.uTime.value = this.time;
    this.isoWireMaterial.opacity = this.isoOpacity * (this.isMobile ? 0.055 : 0.13);
    this.isoGroup.visible = this.isoOpacity > 0.004;
    if (!this.reducedMotion) this.isoGroup.rotation.y += dt * 0.045;

    this.ringsOpacity = damp(this.ringsOpacity, phase3 ? (state.scene === "outro" ? 0.35 : 1) : 0, 1.2, dt);
    this.twinGroup.visible = this.ringsOpacity > 0.004;
    const ringLightBoost = this.theme === "light" ? 2.0 : 1;
    for (const item of this.ringMats) {
      item.material.opacity = Math.min(1, item.baseOpacity * this.ringsOpacity * ringLightBoost);
    }
    for (const node of this.ringNodes) {
      const a = node.phase + this.time * node.speed;
      node.node.position.set(Math.cos(a) * node.radius, Math.sin(a) * node.radius, 0);
    }
    if (!this.reducedMotion) this.twinGroup.rotation.y += dt * 0.02;

    /* atmosphere breathing */
    const light = this.theme === "light";
    this.atmosphereMaterial.uniforms.uOpacity.value = (light ? 0.24 : 0.62) + Math.sin(this.time * 0.4) * 0.022;
    this.halo.material.opacity = (light ? 0.01 : 0.18) + Math.sin(this.time * 0.28) * 0.004 + near * (light ? 0.003 : 0.06);

    this.activeLayer = active;
    this.lastScene = state.scene;
  }

  setTheme(theme) {
    this.theme = theme === "light" ? "light" : "dark";
    const light = this.theme === "light";

    this.renderer.setClearColor(light ? 0xe9f3f0 : 0x02050a, 1);
    if (this.starGroup) this.starGroup.visible = !light;
    if (this.nebulaGroup) this.nebulaGroup.visible = !light;

    if (this.sunMaterial) this.sunMaterial.color.set(light ? "#f5c96f" : "#ffe9bd");
    for (const material of this.sunGlowMats || []) {
      material.blending = light ? THREE.NormalBlending : THREE.AdditiveBlending;
      material.needsUpdate = true;
    }
    for (const material of this.orbitMats || []) {
      material.blending = light ? THREE.NormalBlending : THREE.AdditiveBlending;
      material.color.copy(light ? material.userData.lightColor : material.userData.darkColor);
      material.needsUpdate = true;
    }
    for (const material of this.planetMats || []) {
      material.color.copy(light ? material.userData.lightColor : material.userData.darkColor);
    }
    if (this.solarFade !== undefined) this.applySolarFade(this.solarFade);

    this.sunDir.set(light ? -0.42 : -0.62, 0.34, light ? 0.8 : 0.52).normalize();

    if (this.earthMaterial) {
      this.earthMaterial.uniforms.uLightTheme.value = light ? 1 : 0;
      this.earthMaterial.uniforms.uNightLights.value = light ? 0.05 : 0.46;
    }
    if (this.gridMaterial) this.gridMaterial.uniforms.uColor.value.set(light ? "#2e8f85" : "#74e9d3");
    if (this.atmosphereMaterial) {
      this.atmosphereMaterial.blending = light ? THREE.NormalBlending : THREE.AdditiveBlending;
      this.atmosphereMaterial.needsUpdate = true;
      this.atmosphereMaterial.uniforms.uColor.value.set(light ? "#3f9f98" : "#8fe8df");
      this.atmosphereMaterial.uniforms.uOpacity.value = light ? 0.24 : 0.62;
    }
    if (this.outerAtmosphereMaterial) {
      this.outerAtmosphereMaterial.uniforms.uColor.value.set(light ? "#72b8b2" : "#3fa9b4");
      this.outerAtmosphereMaterial.uniforms.uOpacity.value = light ? 0 : 0.13;
    }
    if (this.halo) {
      this.halo.visible = !light;
      this.halo.material.blending = light ? THREE.NormalBlending : THREE.AdditiveBlending;
      this.halo.material.color.set(light ? 0xbfe2dc : 0xffffff);
      this.halo.material.needsUpdate = true;
    }

    this.layerStates.forEach((layer, index) => {
      layer.material.blending = light ? THREE.NormalBlending : THREE.AdditiveBlending;
      layer.material.needsUpdate = true;
      const colors = light ? LIGHT_LAYER_COLORS[index] : [layer.def.colorA, layer.def.colorB];
      layer.material.uniforms.uColorA.value.set(colors[0]);
      layer.material.uniforms.uColorB.value.set(colors[1]);
      layer.material.uniforms.uLightTheme.value = light ? 1 : 0;
    });

    if (this.isoMaterial) {
      this.isoMaterial.blending = light ? THREE.NormalBlending : THREE.AdditiveBlending;
      this.isoMaterial.needsUpdate = true;
      this.isoMaterial.uniforms.uColorA.value.set(light ? "#2f6fbf" : "#4d8cff");
      this.isoMaterial.uniforms.uColorB.value.set(light ? "#6d5db3" : "#c4b7ff");
    }
    if (this.isoWireMaterial) this.isoWireMaterial.color.set(light ? "#2f6fbf" : "#9dc6ff");

    if (this.nodeMaterial) {
      this.nodeMaterial.blending = light ? THREE.NormalBlending : THREE.AdditiveBlending;
      this.nodeMaterial.needsUpdate = true;
      this.nodeMaterial.uniforms.uColor.value.set(light ? "#0d8f80" : "#a9ffec");
    }

    for (const item of this.ringMats || []) {
      if (item.material.isLineBasicMaterial) {
        item.material.blending = light ? THREE.NormalBlending : THREE.AdditiveBlending;
        item.material.color.copy(light ? item.material.userData.lightColor : item.material.userData.darkColor);
        item.material.needsUpdate = true;
      } else if (item.material.isSpriteMaterial) {
        item.material.blending = light ? THREE.NormalBlending : THREE.AdditiveBlending;
        item.material.needsUpdate = true;
      }
    }

    if (this.lightning) {
      for (const bolt of this.lightning.bolts) {
        bolt.line.material.blending = light ? THREE.NormalBlending : THREE.AdditiveBlending;
        bolt.line.material.color.set(light ? "#2f74b8" : "#dff6ff");
        bolt.line.material.needsUpdate = true;
        bolt.flash.material.blending = light ? THREE.NormalBlending : THREE.AdditiveBlending;
        bolt.flash.material.color.set(light ? "#2f74b8" : "#ffffff");
        bolt.flash.material.needsUpdate = true;
      }
    }
  }

  getViewCoords() {
    if (!this.spin) return { lat: 0, lon: 0, alt: 0 };
    const local = this.spin.worldToLocal(this.camera.position.clone());
    local.normalize();
    const lat = Math.asin(clamp(local.y, -1, 1)) * (180 / Math.PI);
    const lon = Math.atan2(-local.z, local.x) * (180 / Math.PI);
    const distance = this.camera.position.distanceTo(this.earthGroup.position);
    const alt = Math.max(0, (distance - 1) * 6371);
    return { lat, lon, alt };
  }

  getLayerName() {
    if (this.activeLayer < 0) return "SURFACE";
    return LAYER_NAMES[this.activeLayer] || "SURFACE";
  }

  setPointer(x, y) {
    this.pointerTarget.set(clamp(x, -1, 1), clamp(y, -1, 1));
  }

  snapTo(state) {
    let target;
    if (state.scene === "hero") {
      const a = this.targetFor("hero");
      const b = this.targetFor("manifesto");
      const p = easeOutCubic(state.heroProgress || 0);
      target = {
        z: a.z + (b.z - a.z) * p,
        x: a.x + (b.x - a.x) * p,
        y: a.y + (b.y - a.y) * p,
        yaw: a.yaw + (b.yaw - a.yaw) * p,
        tilt: a.tilt + (b.tilt - a.tilt) * p,
      };
    } else {
      target = this.targetFor(state.scene);
    }
    this.camZ = target.z;
    this.earthX = target.x;
    this.earthY = target.y;
    this.yaw = target.yaw;
    this.tiltX = target.tilt;
    this.spinOffset = state.scrollY * 0.00032;
    this.earthGroup.position.set(target.x, target.y, 0);
    this.spin.rotation.y = target.yaw + this.spinOffset;
    this.tilt.rotation.x = target.tilt;
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const wasMobile = this.isMobile;
    this.isMobile = width <= 900;
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, this.isMobile ? 1.5 : 1.8);

    this.camera.aspect = width / height;
    this.camera.fov = this.isMobile ? 44 : 38;
    this.camera.updateProjectionMatrix();

    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(width, height, false);

    if (wasMobile !== this.isMobile && this.earthGroup) {
      const target = this.targetFor(this.lastScene || "hero");
      this.camZ = target.z;
      this.earthX = target.x;
      this.earthY = target.y;
      if (this.solar) {
        this.solar.position.set(this.isMobile ? -5.5 : -12, this.isMobile ? 3.8 : 4.6, -26);
        this.solar.scale.setScalar(this.isMobile ? 0.84 : 1);
      }
    }

    if (this.starMaterial) this.starMaterial.uniforms.uPixelRatio.value = this.pixelRatio;
    if (this.nodeMaterial) this.nodeMaterial.uniforms.uPixelRatio.value = this.pixelRatio;
  }
}
