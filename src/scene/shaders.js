/* ------------------------------------------------------------------------- */
/*  GLSL — all scene shaders live here                                       */
/* ------------------------------------------------------------------------- */

export const NOISE = /* glsl */ `
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

    vec3 i  = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);

    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);

    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;

    i = mod289(i);
    vec4 p = permute(permute(permute(
              i.z + vec4(0.0, i1.z, i2.z, 1.0))
            + i.y + vec4(0.0, i1.y, i2.y, 1.0))
            + i.x + vec4(0.0, i1.x, i2.x, 1.0));

    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;

    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);

    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);

    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);

    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));

    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);

    vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;

    vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
  }

  float fbm(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * snoise(p);
      p *= 2.02;
      a *= 0.5;
    }
    return v;
  }
`;

/* ------------------------------------------------------------------------- */
/*  Earth surface                                                            */
/* ------------------------------------------------------------------------- */

export const earthVertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  varying vec3 vViewW;
  varying vec3 vLocal;

  void main() {
    vUv = uv;
    vLocal = position;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vec4 world = modelMatrix * vec4(position, 1.0);
    vPosW = world.xyz;
    vViewW = normalize(cameraPosition - world.xyz);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

export const earthFragment = /* glsl */ `
  uniform sampler2D uDay;
  uniform sampler2D uSpec;
  uniform sampler2D uLights;
  uniform vec3 uSunDir;
  uniform float uTime;
  uniform float uNightLights;
  uniform float uLightTheme;

  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  varying vec3 vViewW;
  varying vec3 vLocal;

  ${NOISE}

  void main() {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(vViewW);
    vec3 L = normalize(uSunDir);

    vec3 tex = texture2D(uDay, vUv).rgb;
    float lum = dot(tex, vec3(0.299, 0.587, 0.114));
    float maxc = max(max(tex.r, tex.g), tex.b);
    float minc = min(min(tex.r, tex.g), tex.b);
    float sat = maxc - minc;

    float ocean = smoothstep(0.35, 0.75, texture2D(uSpec, vUv).r);
    float ice = smoothstep(0.72, 0.94, lum) * (1.0 - smoothstep(0.05, 0.17, sat));
    ice *= smoothstep(0.42, 0.62, abs(vUv.y - 0.5) * 2.0);
    ice = max(ice, smoothstep(0.8, 0.96, lum) * (1.0 - smoothstep(0.03, 0.13, sat)));

    /* --- land: a fresh, hand-painted palette ----------------------------- */
    float warmth = clamp((tex.r - tex.b) * 2.8 + (tex.g - tex.b) * 0.9, 0.0, 1.0);
    vec3 forest = mix(vec3(0.10, 0.255, 0.185), vec3(0.20, 0.43, 0.30), uLightTheme);
    vec3 moss   = mix(vec3(0.27, 0.445, 0.255), vec3(0.48, 0.62, 0.40), uLightTheme);
    vec3 sand   = mix(vec3(0.64, 0.52, 0.32), vec3(0.80, 0.69, 0.47), uLightTheme);
    vec3 rock   = mix(vec3(0.37, 0.34, 0.27), vec3(0.55, 0.48, 0.38), uLightTheme);

    vec3 land = mix(forest, moss, smoothstep(0.25, 0.68, tex.g));
    land = mix(land, sand, smoothstep(0.03, 0.48, warmth));
    land = mix(land, rock, smoothstep(0.55, 0.86, lum) * 0.32);
    land *= 0.78 + lum * 0.4;
    land = mix(land, tex * 0.34 + land * 0.66, 0.2);

    /* --- ocean: tropical teal, deep indigo ------------------------------- */
    float shallow = smoothstep(0.02, 0.38, lum);
    vec3 deep = mix(vec3(0.004, 0.038, 0.068), vec3(0.02, 0.125, 0.18), uLightTheme);
    vec3 mid  = mix(vec3(0.012, 0.135, 0.175), vec3(0.035, 0.30, 0.35), uLightTheme);
    vec3 lagoon = mix(vec3(0.035, 0.315, 0.295), vec3(0.10, 0.50, 0.43), uLightTheme);

    vec3 sea = mix(deep, mid, smoothstep(0.01, 0.2, lum));
    sea = mix(sea, lagoon, shallow * 0.55);

    float caustic = fbm(vec3(vUv * vec2(34.0, 17.0), uTime * 0.018));
    sea += vec3(0.012, 0.045, 0.042) * (caustic * 0.5 + 0.5);
    sea += vec3(0.02, 0.075, 0.055) * smoothstep(0.3, 0.9, cos(vUv.y * 6.28318 * 2.0)) * 0.18;

    vec3 iceColor = mix(vec3(0.67, 0.86, 0.88), vec3(0.86, 0.95, 0.94), uLightTheme) * (0.86 + tex.r * 0.12);

    vec3 surface = mix(land, sea, ocean);
    surface = mix(surface, iceColor, ice * 0.96);

    /* --- light ---------------------------------------------------------- */
    float sunDot = dot(N, L);
    float day = smoothstep(-0.1, 0.62, sunDot);
    float ambient = mix(0.045, 0.30, uLightTheme);
    float diffuse = mix(0.98, 0.68, uLightTheme);
    vec3 color = surface * (ambient + day * diffuse);

    float terminator = smoothstep(-0.22, 0.02, sunDot) * (1.0 - smoothstep(0.02, 0.24, sunDot));
    color += surface * vec3(0.46, 0.25, 0.12) * terminator * mix(0.55, 0.12, uLightTheme);

    vec3 H = normalize(L + V);
    float spec = pow(max(dot(N, H), 0.0), 86.0) * ocean * day;
    color += vec3(0.72, 0.95, 1.0) * spec * mix(0.5, 0.28, uLightTheme);

    float night = 1.0 - smoothstep(-0.18, 0.06, sunDot);
    vec3 city = texture2D(uLights, vUv).rgb;
    city = pow(city, vec3(1.7));
    color += city * night * vec3(1.0, 0.66, 0.32) * uNightLights * (1.0 - uLightTheme);

    float fresnel = pow(1.0 - max(dot(N, V), 0.0), 2.7);
    color += mix(vec3(0.22, 0.72, 0.74) * 0.34, vec3(0.04, 0.34, 0.34) * 0.56, uLightTheme) * fresnel;
    color += vec3(0.08, 0.22, 0.3) * fresnel * 0.16;

    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/* ------------------------------------------------------------------------- */
/*  Clouds                                                                   */
/* ------------------------------------------------------------------------- */

export const cloudVertex = earthVertex;

export const cloudFragment = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec3 uSunDir;
  uniform float uTime;
  uniform float uOpacity;

  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  varying vec3 vViewW;

  void main() {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(vViewW);
    vec3 L = normalize(uSunDir);

    float density = texture2D(uMap, vUv).r;
    float alpha = smoothstep(0.16, 0.78, density) * uOpacity * 0.48;

    float sunDot = dot(N, L);
    float day = smoothstep(-0.12, 0.55, sunDot);
    float rim = pow(1.0 - max(dot(N, V), 0.0), 2.2);

    vec3 col = vec3(0.72, 0.88, 0.92) * (0.1 + day * 1.0);
    col += vec3(0.28, 0.56, 0.62) * rim * 0.38;
    col += vec3(0.84, 0.46, 0.25) * (1.0 - smoothstep(0.0, 0.28, abs(sunDot))) * 0.12;

    gl_FragColor = vec4(col, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/* ------------------------------------------------------------------------- */
/*  Atmosphere                                                               */
/* ------------------------------------------------------------------------- */

export const atmosphereVertex = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vPosW;
  varying vec3 vViewW;

  void main() {
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vec4 world = modelMatrix * vec4(position, 1.0);
    vPosW = world.xyz;
    vViewW = normalize(cameraPosition - world.xyz);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

export const atmosphereFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uSunDir;
  uniform float uOpacity;

  varying vec3 vNormalW;
  varying vec3 vPosW;
  varying vec3 vViewW;

  void main() {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(vViewW);
    vec3 L = normalize(uSunDir);

    float fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.4);
    float sunFacing = smoothstep(-0.35, 0.7, dot(N, L));
    float alpha = fresnel * (0.2 + sunFacing * 0.9) * uOpacity;

    vec3 col = mix(vec3(0.18, 0.62, 0.72), vec3(0.72, 0.96, 1.0), fresnel);
    col += vec3(0.85, 0.42, 0.22) * (1.0 - smoothstep(0.0, 0.22, abs(dot(N, L)))) * 0.18;

    gl_FragColor = vec4(col, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export const glowVertex = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vPosW;
  varying vec3 vViewW;
  void main() {
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vec4 world = modelMatrix * vec4(position, 1.0);
    vPosW = world.xyz;
    vViewW = normalize(cameraPosition - world.xyz);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

export const atmosphereOuterFragment = /* glsl */ `
  uniform float uOpacity;
  uniform vec3 uColor;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  varying vec3 vViewW;

  void main() {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(vViewW);
    float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
    gl_FragColor = vec4(uColor, fres * uOpacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/* ------------------------------------------------------------------------- */
/*  Lat / lon graticule                                                      */
/* ------------------------------------------------------------------------- */

export const gridVertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  varying vec3 vViewW;

  void main() {
    vUv = uv;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vec4 world = modelMatrix * vec4(position, 1.0);
    vPosW = world.xyz;
    vViewW = normalize(cameraPosition - world.xyz);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

export const gridFragment = /* glsl */ `
  uniform float uOpacity;
  uniform vec3 uColor;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  varying vec3 vViewW;

  void main() {
    vec2 g = abs(fract(vUv * vec2(36.0, 18.0) + 0.5) - 0.5);
    float line = 1.0 - smoothstep(0.0, 0.012, min(g.x, g.y));
    vec2 g2 = abs(fract(vUv * vec2(4.0, 2.0) + 0.5) - 0.5);
    float major = 1.0 - smoothstep(0.0, 0.004, min(g2.x, g2.y));

    vec3 N = normalize(vNormalW);
    vec3 V = normalize(vViewW);
    float fres = pow(1.0 - max(dot(N, V), 0.0), 1.6);
    float alpha = (line * 0.16 + major * 0.28) * (0.3 + fres * 0.7) * uOpacity;

    gl_FragColor = vec4(uColor, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/* ------------------------------------------------------------------------- */
/*  Data shells — peelable layers                                            */
/* ------------------------------------------------------------------------- */

export const layerVertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vLocal;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  varying vec3 vViewW;

  void main() {
    vUv = uv;
    vLocal = normalize(position);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vec4 world = modelMatrix * vec4(position, 1.0);
    vPosW = world.xyz;
    vViewW = normalize(cameraPosition - world.xyz);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

export const layerFragment = /* glsl */ `
  uniform float uTime;
  uniform float uOpacity;
  uniform float uPeel;
  uniform float uType;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform vec3 uPeelDir;
  uniform float uLightTheme;
  uniform sampler2D uDay;

  varying vec2 vUv;
  varying vec3 vLocal;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  varying vec3 vViewW;

  ${NOISE}

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  void main() {
    float lat = (vUv.y - 0.5) * 3.14159265;
    float lon = vUv.x * 6.2831853;
    float t = uTime;

    float pattern = 0.0;
    float lines = 0.0;
    vec3 col = uColorA;
    vec3 hot = uColorB;

    if (uType < 0.5) {
      /* wind belts */
      float n = fbm(vec3(vUv * vec2(5.0, 3.0), t * 0.06));
      float bands = sin(lat * 15.0 + n * 4.0 + t * 0.18);
      float streak = smoothstep(0.93, 1.0, sin(lon * 20.0 + lat * 9.0 + n * 7.0 + t * 0.55));
      float jet = exp(-pow((abs(lat) - 0.6) * 7.0, 2.0)) + 0.55 * exp(-pow((abs(lat) - 0.2) * 10.0, 2.0));
      float latLine = smoothstep(0.96, 1.0, abs(sin(vUv.y * 3.14159 * 14.0)));
      pattern = 0.06 + (bands * 0.5 + 0.5) * 0.07 + streak * 0.42 + jet * 0.2 + latLine * 0.06;
      lines = clamp(streak * 0.9 + latLine * 0.5 + jet * 0.06, 0.0, 1.0);
      col = mix(uColorA, uColorB, clamp(streak * 0.5 + jet * 0.22, 0.0, 1.0));
    } else if (uType < 1.5) {
      /* ocean flow — contour eddies */
      float n = fbm(vec3(vUv * vec2(5.5, 2.8), t * 0.035));
      float contour = smoothstep(0.46, 0.5, abs(fract(n * 7.0 + lat * 0.4) - 0.5));
      float flow = smoothstep(0.9, 1.0, sin(lon * 9.0 + n * 12.0 + t * 0.22));
      float fine = smoothstep(0.975, 1.0, sin(lon * 34.0 + lat * 14.0 + n * 8.0));
      pattern = 0.035 + contour * 0.11 + flow * 0.32 + fine * 0.06;
      lines = clamp(contour * 0.9 + fine * 0.8 + flow * 0.08, 0.0, 1.0);
      col = mix(uColorA, uColorB, clamp(flow * 0.6 + contour * 0.2, 0.0, 1.0));
    } else if (uType < 2.5) {
      /* lithosphere — topographic contours */
      float n = fbm(vec3(vUv * vec2(5.0, 2.5), 1.7));
      float contour = smoothstep(0.46, 0.5, abs(fract(n * 9.0) - 0.5));
      float contour2 = smoothstep(0.475, 0.5, abs(fract(n * 23.0) - 0.5));
      float grid = smoothstep(0.975, 1.0, abs(sin(vUv.x * 3.14159 * 12.0))) * smoothstep(0.975, 1.0, abs(sin(vUv.y * 3.14159 * 8.0)));
      pattern = 0.025 + contour * 0.22 + contour2 * 0.07 + grid * 0.18;
      lines = clamp(contour * 0.85 + contour2 * 0.6 + grid * 0.5, 0.0, 1.0);
      col = mix(uColorA, uColorB, contour * 0.5 + grid * 0.2);
    } else {
      /* biosphere — bioluminescent plankton clustered by concentration */
      vec3 surface = texture2D(uDay, vUv).rgb;
      // Bias the colonies toward ocean and vegetated land instead of deserts.
      float ocean = smoothstep(0.0, 0.16, surface.b - surface.r);
      float vegetation = smoothstep(0.0, 0.12, surface.g - surface.r);
      float habitat = clamp(0.38 + ocean * 0.52 + vegetation * 0.42, 0.0, 1.0);

      vec3 sp = vLocal;
      float drift = t * 0.03;

      // Seamless concentration field: broad chlorophyll blooms with finer
      // texture, slowly drifting so the layer feels alive.
      float field = fbm(sp * 2.35 + vec3(drift * 0.5, -drift * 0.35, drift * 0.25));
      float detail = snoise(sp * 8.5 - vec3(drift * 1.4, drift * 0.6, 0.0));
      float conc = clamp(0.5 + field * 0.42 + detail * 0.1, 0.0, 1.0);
      float bloom = smoothstep(0.48, 0.8, conc);
      float haze = smoothstep(0.36, 0.8, conc);
      float density = smoothstep(0.3, 0.85, conc) * (0.38 + habitat * 0.62);
      // Isopleths make the concentration field legible as a data layer.
      float isobands = abs(fract(conc * 5.0 + t * 0.012 + 0.5) - 0.5);
      float isopleth = (1.0 - smoothstep(0.0, 0.055, isobands)) * (0.3 + haze * 0.7) * (0.38 + habitat * 0.62);

      // Colonies are warped rather than gridded: they clump around the
      // concentration peaks and get larger/brighter where life is dense.
      vec2 warp = vec2(
        snoise(vec3(vUv * 5.0, t * 0.05)),
        snoise(vec3(vUv * 5.0 + 17.0, t * 0.05))
      );
      vec2 colonies = vUv * vec2(96.0, 48.0) + warp * 1.6;
      vec2 cell = floor(colonies);
      vec2 gv = fract(colonies) - 0.5;
      float rnd = hash21(cell);
      float seed = hash21(cell + 4.7);
      // More cells light up where the concentration is high, so the field
      // reads as clustered life rather than an even starfield.
      float colonyActive = step(1.0 - (0.1 + 0.65 * density), rnd);
      float radius = (0.06 + 0.17 * seed) * (0.8 + bloom * 0.7);
      float dist = length(gv);
      float facing = clamp(dot(normalize(vNormalW), normalize(vViewW)), 0.0, 1.0);
      float limbFade = smoothstep(0.03, 0.32, facing);
      float core = (1.0 - smoothstep(radius * 0.12, radius, dist)) * colonyActive;
      float glow = (1.0 - smoothstep(0.0, radius * 3.2, dist)) * colonyActive;
      float phase = seed * 6.28318;

      // Slow breathing plus an expanding pulse ring around dense colonies.
      float pulse = 0.55 + 0.45 * sin(t * 1.35 + phase + conc * 8.0);
      float ringR = 0.12 + 0.24 * (0.5 + 0.5 * sin(t * 0.9 + phase));
      float ring = (1.0 - smoothstep(0.0, 0.03, abs(dist - ringR))) * colonyActive * bloom;

      pattern = 0.012 + haze * 0.07 + bloom * 0.16 + isopleth * 0.34
        + (glow * pulse * 0.32 + core * pulse * 0.66 + ring * 0.08) * limbFade;
      lines = clamp(haze * 0.14 + bloom * 0.55 + isopleth * 0.8
        + (glow * pulse * 0.55 + core * pulse * 1.1 + ring * 0.4) * limbFade, 0.0, 1.0);
      col = mix(uColorA, uColorB, clamp(core * pulse * 0.9 + glow * 0.35 + ring * 0.4 + bloom * 0.32 + isopleth * 0.55, 0.0, 1.0));
    }

    /* peel mask — a ragged sheet lifting away from the planet */
    vec3 peelDir = normalize(uPeelDir);
    float axis = dot(vLocal, peelDir);
    float threshold = mix(-1.45, 1.45, uPeel);
    float edgeNoise = snoise(vec3(vUv * 14.0, uPeel * 3.0)) * 0.035;
    float keep = smoothstep(threshold - 0.015 + edgeNoise, threshold + 0.05 + edgeNoise, axis);
    float edge = exp(-pow((axis - threshold) * 15.0, 2.0)) * smoothstep(0.001, 0.08, uPeel) * (1.0 - smoothstep(0.92, 1.0, uPeel));

    vec3 N = normalize(vNormalW);
    vec3 V = normalize(vViewW);
    float fres = pow(1.0 - max(dot(N, V), 0.0), 2.4);

    float darkAlpha = (pattern * 0.62 + 0.012 + fres * 0.12) * uOpacity * keep;
    float lineMask = smoothstep(0.12, 0.62, lines);
    float lightAlpha = (0.002 + fres * 0.045 + lineMask * 0.55 + edge * 0.6) * uOpacity * keep;
    float alpha = mix(darkAlpha, lightAlpha, uLightTheme);
    col += hot * edge * 2.2;
    col += hot * fres * 0.18;

    gl_FragColor = vec4(col, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/* ------------------------------------------------------------------------- */
/*  Iso-surface / forecast shell                                             */
/* ------------------------------------------------------------------------- */

export const isoVertex = layerVertex;

export const isoFragment = /* glsl */ `
  uniform float uTime;
  uniform float uOpacity;
  uniform vec3 uColorA;
  uniform vec3 uColorB;

  varying vec2 vUv;
  varying vec3 vLocal;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  varying vec3 vViewW;

  ${NOISE}

  void main() {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(vViewW);

    float n = fbm(vLocal * 3.2 + uTime * 0.05);
    float bands = smoothstep(0.46, 0.5, abs(fract(n * 9.0 + vLocal.y * 3.0) - 0.5));
    float scan = smoothstep(0.02, 0.0, abs(vLocal.y - sin(uTime * 0.22) * 0.85)) * 0.4;
    float fres = pow(1.0 - max(dot(N, V), 0.0), 2.1);

    float alpha = (fres * 0.4 + bands * 0.10 + scan * 0.18) * uOpacity;
    vec3 col = mix(uColorA, uColorB, bands * 0.75 + fres * 0.4);
    col += uColorB * scan * 0.7;

    gl_FragColor = vec4(col, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/* ------------------------------------------------------------------------- */
/*  Stars                                                                    */
/* ------------------------------------------------------------------------- */

export const starVertex = /* glsl */ `
  attribute float aSize;
  attribute float aPhase;
  attribute vec3 aColor;
  uniform float uTime;
  uniform float uPixelRatio;
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float twinkle = 0.62 + 0.38 * sin(uTime * (0.35 + aPhase * 0.7) + aPhase * 6.28318);
    vAlpha = twinkle;
    vColor = aColor;
    gl_PointSize = aSize * uPixelRatio * (300.0 / max(1.0, -mv.z)) * (0.7 + twinkle * 0.5);
  }
`;

export const starFragment = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    float core = smoothstep(0.5, 0.0, d);
    core = pow(core, 2.4);
    gl_FragColor = vec4(vColor, core * vAlpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/* ------------------------------------------------------------------------- */
/*  Surface nodes                                                            */
/* ------------------------------------------------------------------------- */

export const nodeVertex = /* glsl */ `
  attribute float aPhase;
  attribute float aSize;
  uniform float uTime;
  uniform float uPixelRatio;
  varying float vAlpha;

  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float pulse = 0.5 + 0.5 * sin(uTime * 1.7 + aPhase * 6.28318);
    vAlpha = 0.25 + pulse * 0.75;
    gl_PointSize = aSize * uPixelRatio * (300.0 / max(1.0, -mv.z)) * (0.75 + pulse * 0.6);
  }
`;

export const nodeFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vAlpha;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    float glow = smoothstep(0.5, 0.0, d);
    float core = smoothstep(0.14, 0.0, d);
    gl_FragColor = vec4(uColor, (glow * 0.42 + core * 1.1) * vAlpha * uOpacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;
