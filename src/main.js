import "./style.css";
import { World } from "./scene/World.js";
import { Experience } from "./ui.js";
import { initI18n, t, getLanguage, applyLanguage, detectSystemLanguage } from "./i18n.js";

const i18n = initI18n();

if ("scrollRestoration" in history) {
  history.scrollRestoration = "manual";
}

const canvas = document.querySelector("#world");
let world = null;
let experience = null;

function fail(error) {
  console.error("[That Earth] failed to start:", error);
  document.body.classList.add("webgl-error");
  document.body.classList.remove("is-loading");
  const status = document.querySelector("#loaderStatus");
  if (status) status.textContent = t("error.webgl");
}

function setupTheme(world) {
  const root = document.documentElement;
  const toggle = document.querySelector("#themeToggle");
  const meta = document.querySelector("#themeColor");
  const query = window.matchMedia("(prefers-color-scheme: light)");

  const apply = (theme, source) => {
    root.dataset.theme = theme;
    root.dataset.themeSource = source;
    world.setTheme(theme);
    if (meta) meta.setAttribute("content", theme === "light" ? "#edf4f1" : "#02060b");
    if (toggle) {
      const target = theme === "light" ? t("theme.toDark") : t("theme.toLight");
      const suffix = source === "system" ? t("theme.systemSuffix") : "";
      toggle.setAttribute("aria-label", target + suffix);
      toggle.title = target + suffix;
    }
  };

  const refresh = () => {
    const theme = root.dataset.theme === "light" ? "light" : "dark";
    const source = root.dataset.themeSource || "system";
    if (toggle) {
      const target = theme === "light" ? t("theme.toDark") : t("theme.toLight");
      const suffix = source === "system" ? t("theme.systemSuffix") : "";
      toggle.setAttribute("aria-label", target + suffix);
      toggle.title = target + suffix;
    }
  };

  apply(root.dataset.theme === "light" ? "light" : "dark", root.dataset.themeSource || "system");

  if (toggle) {
    toggle.addEventListener("click", () => {
      const next = root.dataset.theme === "light" ? "dark" : "light";
      try {
        localStorage.setItem("that-earth-theme", next);
      } catch (error) {}
      apply(next, "manual");
    });
  }

  const onSystemChange = (event) => {
    if (root.dataset.themeSource !== "system") return;
    apply(event.matches ? "light" : "dark", "system");
  };

  if (query.addEventListener) query.addEventListener("change", onSystemChange);
  else if (query.addListener) query.addListener(onSystemChange);

  return refresh;
}

function setupLanguage(refreshTheme) {
  const root = document.documentElement;
  const toggle = document.querySelector("#langToggle");
  const label = document.querySelector("#langToggleLabel");

  const refresh = () => {
    const lang = getLanguage();
    if (label) label.textContent = lang === "zh" ? "EN" : "ZH";
    if (!toggle) return;
    const target = lang === "zh" ? t("lang.toEnglish") : t("lang.toChinese");
    const suffix = root.dataset.langSource === "system" ? t("lang.systemSuffix") : "";
    toggle.setAttribute("aria-label", target + suffix);
    toggle.title = target + suffix;
  };

  const apply = (lang, source, persist) => {
    applyLanguage(lang, source);
    if (persist) {
      try {
        localStorage.setItem("that-earth-lang", lang);
      } catch (error) {}
    }
    refresh();
    refreshTheme();
    experience.updateAutoplayButton();
  };

  refresh();
  if (toggle) {
    toggle.addEventListener("click", () => {
      apply(getLanguage() === "zh" ? "en" : "zh", "manual", true);
    });
  }

  window.addEventListener("languagechange", () => {
    if (root.dataset.langSource !== "system") return;
    const next = detectSystemLanguage();
    if (next !== getLanguage()) apply(next, "system", false);
  });

  window.addEventListener("that-earth:language", refresh);
}

async function boot() {
  try {
    world = new World(canvas);
    experience = new Experience(world);
  } catch (error) {
    fail(error);
    return;
  }

  window.__THAT_EARTH__ = {
    world,
    experience,
    getState: () => experience.getState(),
    scrollToScene(id) {
      const el = document.querySelector(id);
      if (!el) return;
      window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY);
    },
  };

  try {
    await world.init((p) => experience.setLoadProgress(p));
    const refreshTheme = setupTheme(world);
    setupLanguage(refreshTheme);
    experience.setLoadProgress(0.96, t("loader.typeset"));

    if (document.fonts && document.fonts.ready) {
      await Promise.race([
        document.fonts.ready,
        new Promise((resolve) => setTimeout(resolve, 2200)),
      ]);
    }

    experience.setLoadProgress(1, t("loader.enter"));
    await new Promise((resolve) => setTimeout(resolve, 320));
    experience.ready();
    startLoop();
  } catch (error) {
    fail(error);
  }
}

let lastTime = performance.now();

function startLoop() {
  lastTime = performance.now();
  requestAnimationFrame(tick);
}

function tick(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;

  if (!document.hidden && world && experience) {
    const state = experience.getState();
    world.update(dt, state);
    experience.update(state);
    world.render();
  }

  requestAnimationFrame(tick);
}

boot();
