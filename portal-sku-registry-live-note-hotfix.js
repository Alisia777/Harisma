(function () {
  if (window.__ALTEA_SKU_REGISTRY_NOTE_HOTFIX_20260425A__) return;
  window.__ALTEA_SKU_REGISTRY_NOTE_HOTFIX_20260425A__ = true;

  function buildNote() {
    var card = document.createElement("div");
    card.setAttribute("data-sku-live-note", "true");
    card.className = "card subtle";
    card.style.margin = "12px 0 14px";
    card.innerHTML = [
      "<strong>\u0420\u0435\u0435\u0441\u0442\u0440 \u0436\u0438\u0432\u043e\u0439.</strong>",
      '<div class="muted small" style="margin-top:6px">',
      "\u0427\u0438\u0442\u0430\u0435\u043c snapshot-backed <code>data/skus.json</code>. ",
      "\u041f\u043e\u0441\u043b\u0435 \u043a\u043d\u043e\u043f\u043a\u0438 \u00ab\u041e\u0431\u043d\u043e\u0432\u0438\u0442\u044c \u043a\u043e\u043c\u0430\u043d\u0434\u043d\u044b\u0435 \u0434\u0430\u043d\u043d\u044b\u0435\u00bb ",
      "\u0440\u0435\u0435\u0441\u0442\u0440 \u043f\u0435\u0440\u0435\u0447\u0438\u0442\u044b\u0432\u0430\u0435\u0442\u0441\u044f, \u0430 \u043e\u0442\u043a\u0440\u044b\u0442\u0443\u044e \u043a\u0430\u0440\u0442\u043e\u0447\u043a\u0443 SKU ",
      "\u043c\u043e\u0436\u043d\u043e \u0441\u0440\u0430\u0437\u0443 \u043f\u0435\u0440\u0435\u043f\u0440\u043e\u0432\u0435\u0440\u0438\u0442\u044c \u043d\u0430 \u0441\u0432\u0435\u0436\u0435\u043c \u0441\u0440\u0435\u0437\u0435.",
      "</div>"
    ].join("");
    return card;
  }

  function ensureNote() {
    var root = document.getElementById("view-skus");
    if (!root) return;
    var title = root.querySelector(".section-title");
    if (!title) return;

    var existing = root.querySelector("[data-sku-live-note]");
    if (existing) return;

    title.insertAdjacentElement("afterend", buildNote());
  }

  function run() {
    ensureNote();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run, { once: true });
  } else {
    run();
  }

  window.addEventListener("altea:viewchange", run);
  window.setInterval(run, 1500);
})();
