(function () {
  if (window.__ALTEA_PRICE_WORKBENCH_LOADER_20260420I__) return;
  window.__ALTEA_PRICE_WORKBENCH_LOADER_20260420I__ = true;

  const SCRIPT_ID = "portalPriceWorkbenchHotfixRuntime";
  const PARTS = [
    "portal-price-workbench.line90.part01.txt?v=20260420i",
    "portal-price-workbench.line90.part02.txt?v=20260420i",
    "portal-price-workbench.line90.part03.txt?v=20260420i",
    "portal-price-workbench.line90.part04.txt?v=20260420i",
    "portal-price-workbench.line90.part05.txt?v=20260420i",
    "portal-price-workbench.line90.part06.txt?v=20260420i",
    "portal-price-workbench.line90.part07.txt?v=20260420i",
    "portal-price-workbench.line90.part08.txt?v=20260420i",
    "portal-price-workbench.line90.part09.txt?v=20260420i",
    "portal-price-workbench.line90.part10.txt?v=20260420i",
    "portal-price-workbench.line90.part11.txt?v=20260420i",
    "portal-price-workbench.line90.part12.txt?v=20260420i",
    "portal-price-workbench.line90.part13.txt?v=20260420i",
    "portal-price-workbench.line90.part14.txt?v=20260420i"
  ];
  let loadingPromise = null;

  function kick() {
    if (typeof window.renderPriceWorkbench === "function") {
      try {
        window.renderPriceWorkbench();
      } catch (error) {
        console.warn("[portal-price-workbench-loader] render", error);
      }
    }
  }

  async function injectBundle() {
    if (window.__ALTEA_PRICE_WORKBENCH_HOTFIX_20260419D__) {
      kick();
      return true;
    }
    if (document.getElementById(SCRIPT_ID)) {
      kick();
      return true;
    }
    const fragments = await Promise.all(
      PARTS.map(async (src) => {
        const response = await fetch(src, { cache: "no-store" });
        if (!response.ok) throw new Error("Failed to load " + src);
        return response.text();
      })
    );
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.textContent = fragments.join("") + "\n";
    (document.body || document.documentElement).appendChild(script);
    kick();
    return true;
  }

  function start() {
    if (window.__ALTEA_PRICE_WORKBENCH_HOTFIX_20260419D__ || document.getElementById(SCRIPT_ID)) {
      kick();
      return;
    }
    if (!document.body) {
      window.setTimeout(start, 180);
      return;
    }
    if (!loadingPromise) {
      loadingPromise = injectBundle()
        .catch((error) => console.warn("[portal-price-workbench-loader]", error))
        .finally(() => {
          loadingPromise = null;
          if (!window.__ALTEA_PRICE_WORKBENCH_HOTFIX_20260419D__) {
            window.setTimeout(start, 1000);
          }
        });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
  window.addEventListener("load", start, { once: true });
  window.setTimeout(start, 0);
  window.setTimeout(start, 1200);
  window.setTimeout(start, 4200);
})();
