/**
 * Vercount footer readout.
 *
 * The third-party script (events.vercount.one) posts a page view, fills the
 * #vercount_value_* spans and reveals their containers. This module waits for
 * those numbers, groups them with the same formatting everywhere, and only
 * then reveals the telemetry strip in the footer. If the counter is blocked or
 * offline the strip stays hidden, so the page never shows "—" placeholders.
 */

const STATS = ["page_pv", "site_uv", "site_pv"];
const formatter = new Intl.NumberFormat("en-US");

export function initCounter() {
  const strip = document.querySelector("[data-counter]");
  if (!strip) return;

  const values = STATS.map((name) => strip.querySelector(`#vercount_value_${name}`)).filter(Boolean);
  if (!values.length) return;

  let revealed = false;

  const reveal = () => {
    if (revealed) return;
    revealed = true;
    strip.classList.add("is-ready");
  };

  const format = (element) => {
    const text = (element.textContent || "").trim();
    if (!/^\d+$/.test(text)) return;

    const grouped = formatter.format(Number(text));
    if (grouped !== text) element.textContent = grouped;
    reveal();
  };

  const observer = new MutationObserver(() => values.forEach(format));

  values.forEach((element) => {
    observer.observe(element, { childList: true, characterData: true, subtree: true });
    format(element);
  });
}
