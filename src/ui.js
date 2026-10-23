import { t } from "./i18n.js";

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

const LAYER_META = [
  { name: "ATMOSPHERE", lat: "23.5°N", alt: "12 KM" },
  { name: "OCEAN", lat: "18.2°N", alt: "200 M" },
  { name: "LITHOSPHERE", lat: "31.2°N", alt: "0 M" },
  { name: "BIOGEOCHEMISTRY", lat: "12.8°S", alt: "0 M" },
];

const NAV_BY_SCENE = {
  "phase-1": "phase-1",
  variables: "phase-1",
  effects: "phase-1",
  "phase-2": "phase-2",
  "phase-3": "phase-3",
  outro: "outro",
};

const PHASE_TEXT = {
  hero: "PHASE 01 / BUILDING",
  manifesto: "EARTH SYSTEM / 2026—∞",
  "phase-1": "PHASE 01 / REALITY",
  variables: "PHASE 01 / REALITY",
  effects: "PHASE 01 / REALITY",
  "phase-2": "PHASE 02 / FORECAST",
  "phase-3": "PHASE 03 / INTELLIGENCE",
  outro: "CURRENT ORBIT / ∞",
};

const RAIL_BY_SCENE = {
  hero: "hero",
  manifesto: "hero",
  "phase-1": "phase-1",
  variables: "phase-1",
  effects: "phase-1",
  "phase-2": "phase-2",
  "phase-3": "phase-3",
  outro: "phase-3",
};

const AUTOPLAY_RESTART_DELAY = 5000;

const LOAD_MESSAGES = [
  [0.0, "loader.link"],
  [0.2, "loader.shells"],
  [0.45, "loader.sun"],
  [0.66, "loader.data"],
  [0.86, "loader.camera"],
  [0.98, "loader.prepare"],
];

const $ = (sel) => document.querySelector(sel);

function formatCoord(lat, lon) {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(1)}°${ns} · ${Math.abs(lon).toFixed(1)}°${ew}`;
}

function formatNumber(n) {
  return Math.round(n).toLocaleString("en-US");
}

// Layout position that ignores reveal transforms, so autoplay stops stay
// stable whether or not an element has already animated in.
function layoutTop(el) {
  let top = 0;
  for (let node = el; node; node = node.offsetParent) top += node.offsetTop || 0;
  return top;
}

export class Experience {
  constructor(world) {
    this.world = world;
    this.dom = {
      body: document.body,
      header: $("#siteHeader"),
      loader: $("#loader"),
      loaderBar: $("#loaderBar"),
      loaderPct: $("#loaderPct"),
      loaderStatus: $("#loaderStatus"),
      scrollBar: $("#scrollBar"),
      scrollMeterFill: $("#scrollMeterFill"),
      scrollPct: $("#scrollPct"),
      railFill: $("#railFill"),
      railPct: $("#railPct"),
      hudCoord: $("#hudCoord"),
      hudAlt: $("#hudAlt"),
      hudLayer: $("#hudLayer"),
      hudTime: $("#hudTime"),
      headerPhase: $("#headerPhase"),
      layerHudName: $("#layerHudName"),
      layerHudLat: $("#layerHudLat"),
      layerHudAlt: $("#layerHudAlt"),
      varIndex: $("#varIndex"),
      cards: [...document.querySelectorAll(".var-card")],
      varDots: [...document.querySelectorAll(".var-progress span")],
      navLinks: [...document.querySelectorAll("[data-nav]")],
      railNodes: [...document.querySelectorAll(".rail-node")],
      autoplay: $("#autoplay"),
      autoplayLabel: $("#autoplayLabel"),
    };

    this.sections = [];
    this.anchors = [];
    this.variables = null;
    this.lastScene = null;
    this.lastVarIndex = -1;
    this.lastNav = null;
    this.lastHud = 0;
    this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this._compact = window.matchMedia("(max-width: 1100px)").matches;
    this._autoplayHidden = false;

    this._playing = false;
    this._ended = false;
    this._autoRaf = null;
    this._autoTimer = null;
    this._restartTimer = null;
    this._autoScrolling = false;
    this._ignoreScrollUntil = 0;
    this._userInteracted = false;
    this._stops = [];

    this.measure();
    this.bind();
  }

  measure() {
    const vh = window.innerHeight;
    const scrollY = window.scrollY;

    this.sections = [...document.querySelectorAll("[data-scene]")].map((el) => {
      const rect = el.getBoundingClientRect();
      return {
        el,
        scene: el.dataset.scene,
        top: rect.top + scrollY,
        height: rect.height,
      };
    });

    const variablesSection = this.sections.find((s) => s.scene === "variables");
    this.variables = variablesSection || null;

    this.anchors = [{ at: 0, scene: "hero" }];
    for (let i = 1; i < this.sections.length; i++) {
      const section = this.sections[i];
      const at = Math.max(1, section.top - vh * 0.55);
      this.anchors.push({ at, scene: section.scene });
    }

    this.maxScroll = Math.max(1, document.documentElement.scrollHeight - vh);
    this.vh = vh;
  }

  bind() {
    window.addEventListener("resize", () => {
      if (this._playing) this.pauseAutoplay();
      this._compact = window.matchMedia("(max-width: 1100px)").matches;
      if (!this._compact && this.dom.autoplay) {
        this.dom.autoplay.classList.remove("is-covert");
        this._autoplayHidden = false;
      }
      this.measure();
      window.clearTimeout(this._resizeTimer);
      this._resizeTimer = window.setTimeout(() => this.measure(), 260);
    });

    window.addEventListener(
      "mousemove",
      (event) => {
        const x = (event.clientX / window.innerWidth) * 2 - 1;
        const y = -((event.clientY / window.innerHeight) * 2 - 1);
        this.world.setPointer(x, y);
      },
      { passive: true }
    );

    window.addEventListener("mouseleave", () => {
      this.world.setPointer(0, 0);
    });

    document.addEventListener("visibilitychange", () => {
      this._lastTime = performance.now();
      if (document.hidden && this._playing) this.pauseAutoplay();
    });

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-in");
          }
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
    );
    document.querySelectorAll("[data-reveal]").forEach((el) => io.observe(el));
    this.revealObserver = io;

    if (this.dom.autoplay) {
      this.dom.autoplay.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (this._playing) this.pauseAutoplay();
        else this.startAutoplay();
      });
    }

    const isAutoplayControl = (event) => {
      const target = event.target;
      return target && target.closest && target.closest(".autoplay");
    };

    const onUserScroll = (event) => {
      if (isAutoplayControl(event)) return;
      this._userInteracted = true;
      this._cancelRestart();
      if (this._playing) this.pauseAutoplay();
    };

    window.addEventListener("wheel", onUserScroll, { passive: true });
    window.addEventListener("touchstart", onUserScroll, { passive: true });
    window.addEventListener("pointerdown", onUserScroll, { passive: true });
    window.addEventListener(
      "keydown",
      (event) => {
        if (isAutoplayControl(event)) return;
        if (["PageDown", "PageUp", "Home", "End", "ArrowDown", "ArrowUp", " "].includes(event.key)) {
          this._userInteracted = true;
          this._cancelRestart();
          if (this._playing) this.pauseAutoplay();
        }
      },
      { passive: true }
    );
    window.addEventListener(
      "scroll",
      () => {
        if (!this._playing) {
          this._cancelRestart();
          return;
        }
        if (this._autoScrolling) return;
        if (performance.now() < this._ignoreScrollUntil) return;
        this.pauseAutoplay();
      },
      { passive: true }
    );

    document.querySelectorAll('a[href^="#"]').forEach((link) => {
      link.addEventListener("click", (event) => {
        const id = link.getAttribute("href");
        if (!id || id === "#") return;
        const target = document.querySelector(id);
        if (!target) return;
        event.preventDefault();
        this._userInteracted = true;
        this._cancelRestart();
        if (this._playing) this.pauseAutoplay();
        const top = target.getBoundingClientRect().top + window.scrollY;
        window.scrollTo({ top: Math.max(0, top - 24), behavior: this.reducedMotion ? "auto" : "smooth" });
      });
    });
  }

  getState() {
    const scrollY = window.scrollY;
    const vh = window.innerHeight;
    const maxScroll = Math.max(1, document.documentElement.scrollHeight - vh);
    const progress = clamp(scrollY / maxScroll, 0, 1);

    let scene = "hero";
    for (const anchor of this.anchors) {
      if (scrollY + 1 >= anchor.at) scene = anchor.scene;
    }

    const heroProgress = clamp(scrollY / (vh * 0.62), 0, 1);
    let varIndex = 0;
    let varProgress = 0;
    if (this.variables) {
      const range = Math.max(1, this.variables.height - vh);
      varProgress = clamp((scrollY - this.variables.top) / range, 0, 1);
      varIndex = Math.min(3, Math.floor(varProgress * 4));
    }

    return {
      scrollY,
      vh,
      progress,
      scene,
      heroProgress,
      varIndex,
      varProgress,
    };
  }

  setLoadProgress(p, message) {
    const pct = Math.round(clamp(p, 0, 1) * 100);
    if (this.dom.loaderBar) this.dom.loaderBar.style.width = `${pct}%`;
    if (this.dom.loaderPct) this.dom.loaderPct.textContent = String(pct).padStart(3, "0");
    if (this.dom.loaderStatus && message) this.dom.loaderStatus.textContent = message;
    else if (this.dom.loaderStatus) {
      let key = LOAD_MESSAGES[0][1];
      for (const [threshold, value] of LOAD_MESSAGES) {
        if (p >= threshold) key = value;
      }
      this.dom.loaderStatus.textContent = t(key);
    }
  }

  ready() {
    const state = this.getState();
    this.world.snapTo(state);
    this.world.update(0.016, state);
    this.world.render();
    this.measure();

    document.querySelectorAll("#hero [data-reveal]").forEach((el) => el.classList.add("is-in"));

    requestAnimationFrame(() => {
      this.dom.body.classList.remove("is-loading");
      this.dom.body.classList.add("is-ready");
      this.setLoadProgress(1, t("loader.enter"));
      this.updateAutoplayButton();
      if (!this.reducedMotion && !document.hidden) {
        this.startAutoplay();
      }
    });
  }

  update(state) {
    const { progress, scene } = state;

    this.dom.scrollBar.style.transform = `scaleX(${progress})`;
    if (this.dom.scrollMeterFill) this.dom.scrollMeterFill.style.transform = `scaleX(${progress})`;
    if (this.dom.scrollPct) this.dom.scrollPct.textContent = String(Math.round(progress * 100)).padStart(2, "0");
    if (this.dom.railFill) this.dom.railFill.style.height = `${progress * 100}%`;
    if (this.dom.railPct) this.dom.railPct.textContent = String(Math.round(progress * 100)).padStart(2, "0");

    if (this.dom.header) {
      this.dom.header.classList.toggle("is-scrolled", state.scrollY > 42);
    }

    if (this.dom.autoplay) {
      const hidden = this._compact && state.scrollY < state.vh * 0.35;
      if (hidden !== this._autoplayHidden) {
        this._autoplayHidden = hidden;
        this.dom.autoplay.classList.toggle("is-covert", hidden);
      }
    }

    if (scene !== this.lastScene) {
      this.lastScene = scene;
      if (this.dom.headerPhase) this.dom.headerPhase.textContent = PHASE_TEXT[scene] || PHASE_TEXT.hero;

      const nav = NAV_BY_SCENE[scene] || null;
      if (nav !== this.lastNav) {
        this.lastNav = nav;
        this.dom.navLinks.forEach((link) => {
          link.classList.toggle("is-active", link.dataset.nav === nav);
        });
      }

      const rail = RAIL_BY_SCENE[scene] || "hero";
      this.dom.railNodes.forEach((node) => {
        node.classList.toggle("is-active", node.dataset.rail === rail);
      });

      this.dom.body.classList.toggle(
        "hud-on",
        scene === "phase-1" || scene === "effects"
      );
    }

    if (scene === "variables") {
      this.setVariableIndex(state.varIndex);
    }

    const now = performance.now();
    if (now - this.lastHud > 110) {
      this.lastHud = now;
      const coords = this.world.getViewCoords();
      if (this.dom.hudCoord) this.dom.hudCoord.textContent = formatCoord(coords.lat, coords.lon);
      if (this.dom.hudAlt) this.dom.hudAlt.textContent = `${formatNumber(coords.alt)} KM`;
      if (this.dom.hudLayer) this.dom.hudLayer.textContent = this.world.getLayerName();
      if (this.dom.hudTime) {
        const d = new Date();
        this.dom.hudTime.textContent = `${String(d.getUTCHours()).padStart(2, "0")}:${String(
          d.getUTCMinutes()
        ).padStart(2, "0")}:${String(d.getUTCSeconds()).padStart(2, "0")}`;
      }
    }
  }

  buildAutoStops() {
    const vh = window.innerHeight;
    const max = Math.max(0, document.documentElement.scrollHeight - vh);
    const find = (scene) => this.sections.find((section) => section.scene === scene);
    const rootStyles = getComputedStyle(document.documentElement);
    const headerH = Number.parseFloat(rootStyles.getPropertyValue("--header-h")) || 86;
    // Labels should sit clear of the fixed header once it collapses to 66px.
    const safeTop = headerH + clamp(vh * 0.03, 16, 30);
    const stops = [];
    const push = (y, hold, label) => {
      const value = clamp(y, 0, max);
      if (stops.length && Math.abs(value - stops[stops.length - 1].y) < 36) return;
      stops.push({ y: value, hold, label });
    };
    // Numeric offsets are only used where a specific scene position (rather
    // than a label) is the point of the stop.
    const add = (scene, offset, hold, label) => {
      const section = find(scene);
      if (!section) return;
      push(section.top + offset, hold, label);
    };
    // Anchor a stop to an element so the heading/label lands just below the
    // header instead of sliding underneath it.
    const addAt = (scene, selector, hold, label) => {
      const section = find(scene);
      const el = section && section.el.querySelector(selector);
      if (!el) return;
      push(layoutTop(el) - safeTop, hold, label);
    };
    // Like addAt, but fall back to a shorter inner element when the whole
    // block cannot fit in the viewport (e.g. stacked mobile layout).
    const addBlock = (scene, selector, hold, label, fitSelector) => {
      const section = find(scene);
      if (!section) return;
      let el = section.el.querySelector(selector);
      if (!el) return;
      if (fitSelector && el.offsetHeight > vh - safeTop - 24) {
        el = section.el.querySelector(fitSelector) || el;
      }
      push(layoutTop(el) - safeTop, hold, label);
    };

    add("hero", 0, 2400, "ORBIT");
    addAt("manifesto", ".eyebrow", 3200, "MANIFESTO");
    addAt("phase-1", ".phase-kicker", 3000, "PHASE 01");

    const variables = find("variables");
    if (variables) {
      const range = Math.max(1, variables.height - vh);
      [0.04, 0.3, 0.55, 0.8].forEach((progress, index) => {
        add("variables", range * progress, 3000, `DATA 0${index + 1}`);
      });
    }

    addAt("effects", ".effects-head .eyebrow", 3600, "MOTION");
    addAt("phase-2", ".phase-kicker", 3000, "PHASE 02");
    addAt("phase-2", ".p2-capabilities", 3200, "FORECAST");
    addAt("phase-3", ".phase-kicker", 3000, "PHASE 03");
    addBlock("phase-3", ".p3-lower", 3600, "TWIN", ".terminal-card");
    addAt("outro", ".eyebrow", 5600, "OUTRO / CASES");

    return stops;
  }

  startAutoplay() {
    this._cancelRestart();
    if (this._playing) return;
    this._stops = this.buildAutoStops();
    if (!this._stops.length) return;

    const replay = this._ended;
    this._ended = false;
    this._playing = true;
    document.documentElement.style.scrollBehavior = "auto";
    this.updateAutoplayButton();

    if (replay) {
      this._animateTo(0, this.reducedMotion ? 0 : 1500, () => {
        if (!this._playing) return;
        this._schedule(() => this._goTo(1), this._stops[0].hold);
      });
      return;
    }

    const current = window.scrollY;
    if (current < 40) {
      this._schedule(() => this._goTo(1), this._stops[0].hold);
      return;
    }

    const next = this._stops.findIndex((stop) => stop.y > current + 40);
    if (next === -1) {
      this.finishAutoplay();
      return;
    }
    this._schedule(() => this._goTo(next), 450);
  }

  pauseAutoplay() {
    this._playing = false;
    this._cancelAuto();
    document.documentElement.style.scrollBehavior = "";
    this.updateAutoplayButton();
  }

  finishAutoplay() {
    this._playing = false;
    this._ended = true;
    this._cancelAuto();
    document.documentElement.style.scrollBehavior = "";
    this.updateAutoplayButton();
    this._scheduleRestart();
  }

  _scheduleRestart() {
    window.clearTimeout(this._restartTimer);
    this._restartTimer = window.setTimeout(() => {
      this._restartTimer = null;
      if (!this._ended || this._playing) return;
      this.startAutoplay();
    }, AUTOPLAY_RESTART_DELAY);
  }

  _cancelRestart() {
    window.clearTimeout(this._restartTimer);
    this._restartTimer = null;
  }

  updateAutoplayButton() {
    const button = this.dom.autoplay;
    if (!button) return;
    button.classList.toggle("is-playing", this._playing);
    button.classList.toggle("is-ended", this._ended);
    button.setAttribute("aria-pressed", this._playing ? "true" : "false");
    const label = this._playing ? "PAUSE" : this._ended ? "REPLAY" : "PLAY";
    if (this.dom.autoplayLabel) this.dom.autoplayLabel.textContent = label;
    const description = this._playing ? t("autoplay.pause") : this._ended ? t("autoplay.replay") : t("autoplay.play");
    button.setAttribute("aria-label", description);
    button.title = description;
  }

  _schedule(fn, delay) {
    window.clearTimeout(this._autoTimer);
    this._autoTimer = window.setTimeout(() => {
      if (this._playing) fn();
    }, Math.max(0, delay));
  }

  _cancelAuto() {
    if (this._autoRaf) cancelAnimationFrame(this._autoRaf);
    this._autoRaf = null;
    window.clearTimeout(this._autoTimer);
    this._autoTimer = null;
    this._cancelRestart();
    this._autoScrolling = false;
  }

  _goTo(index) {
    if (!this._playing) return;
    if (index >= this._stops.length) {
      this.finishAutoplay();
      return;
    }
    const stop = this._stops[index];
    const distance = Math.abs(stop.y - window.scrollY);
    const duration = this.reducedMotion ? 0 : Math.min(3200, Math.max(1100, 900 + distance * 0.75));
    this._animateTo(stop.y, duration, () => {
      if (!this._playing) return;
      this._schedule(() => this._goTo(index + 1), stop.hold);
    });
  }

  _animateTo(target, duration, done) {
    this._cancelAuto();
    const start = window.scrollY;
    const delta = target - start;
    this._autoScrolling = true;

    if (Math.abs(delta) < 2 || duration <= 0) {
      window.scrollTo(0, target);
      this._autoScrolling = false;
      this._ignoreScrollUntil = performance.now() + 800;
      done();
      return;
    }

    const started = performance.now();
    const step = (now) => {
      if (!this._playing) {
        this._autoScrolling = false;
        return;
      }
      const t = Math.min(1, (now - started) / duration);
      const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      window.scrollTo(0, start + delta * eased);
      if (t < 1) {
        this._autoRaf = requestAnimationFrame(step);
      } else {
        this._autoScrolling = false;
        this._ignoreScrollUntil = performance.now() + 800;
        done();
      }
    };
    this._autoRaf = requestAnimationFrame(step);
  }

  setVariableIndex(index) {
    const i = clamp(index, 0, 3);
    if (i === this.lastVarIndex) return;
    this.lastVarIndex = i;

    this.dom.cards.forEach((card, idx) => {
      card.classList.toggle("is-active", idx === i);
      card.classList.toggle("is-leaving", idx < i);
      card.setAttribute("aria-hidden", idx === i ? "false" : "true");
    });

    this.dom.varDots.forEach((dot, idx) => {
      dot.classList.toggle("is-on", idx <= i);
    });

    if (this.dom.varIndex) this.dom.varIndex.textContent = String(i + 1).padStart(2, "0");

    const meta = LAYER_META[i];
    if (this.dom.layerHudName) this.dom.layerHudName.textContent = meta.name;
    if (this.dom.layerHudLat) this.dom.layerHudLat.textContent = meta.lat;
    if (this.dom.layerHudAlt) this.dom.layerHudAlt.textContent = meta.alt;
  }
}
