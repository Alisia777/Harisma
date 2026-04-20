(function () {
  if (window.__ALTEA_PRICE_WORKBENCH_LOADER_20260420M__) return;
  window.__ALTEA_PRICE_WORKBENCH_LOADER_20260420M__ = true;

  const SCRIPT_ID = "portalPriceWorkbenchHotfixRuntime";
  const BUNDLE_PARTS = [
    "portal-price-workbench.runtime.gz.part01.txt?v=20260420m",
    "portal-price-workbench.runtime.gz.part02.txt?v=20260420m"
  ];
  let loadingPromise = null;

  function decodeBase64ToBytes(base64) {
    const normalized = String(base64 || "").replace(/\s+/g, "");
    if (!normalized) return new Uint8Array();
    const binary = atob(normalized);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }

  async function inflateBase64Gzip(base64) {
    const bytes = decodeBase64ToBytes(base64);
    if (!bytes.length) return "";
    if (typeof DecompressionStream !== "function") {
      throw new Error("DecompressionStream unavailable");
    }
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    return new Response(stream).text();
  }

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
    const base64Parts = await Promise.all(
      BUNDLE_PARTS.map(async (src) => {
        const response = await fetch(src, { cache: "no-store" });
        if (!response.ok) throw new Error("Failed to load " + src);
        return response.text();
      })
    );
    const code = await inflateBase64Gzip(base64Parts.join(""));
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.textContent = code + "\n";
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
