(function () {
  if (window.__ALTEA_REPRICER_OPERATOR_MODE_20260515E__) return;
  window.__ALTEA_REPRICER_OPERATOR_MODE_20260515E__ = true;
  window.__ALTEA_REPRICER_OPERATOR_MODE_20260515D__ = true;
  window.__ALTEA_REPRICER_OPERATOR_MODE_20260515C__ = true;
  window.__ALTEA_REPRICER_OPERATOR_MODE_20260515B__ = true;
  window.__ALTEA_REPRICER_OPERATOR_MODE_20260515A__ = true;

  const ROOT_ID = "view-repricer";
  let timer = 0;
  let observer = null;
  let applying = false;

  function root() {
    return document.getElementById(ROOT_ID);
  }

  function isRepricerHash() {
    return window.location.hash === "#repricer";
  }

  function readBinding(name) {
    try {
      if (typeof window[name] !== "undefined") return window[name];
    } catch {}
    try {
      return Function(`return typeof ${name} === "undefined" ? undefined : ${name}`)();
    } catch {
      return undefined;
    }
  }

  function appState() {
    return readBinding("state") || window.state || window.__alteaAppState || null;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function numberOrZero(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function fmtInt(value) {
    return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(numberOrZero(value));
  }

  function collectMetrics() {
    const buildRows = readBinding("buildRepricerRows");
    let rows = [];
    try {
      rows = typeof buildRows === "function" ? buildRows() : [];
    } catch {
      rows = [];
    }
    const sides = rows.flatMap(function (row) {
      return [
        row?.wb ? { platform: "wb", side: row.wb } : null,
        row?.ozon ? { platform: "ozon", side: row.ozon } : null
      ].filter(Boolean);
    });
    const changed = (side) => Math.abs(numberOrZero(side?.finalPrice ?? side?.recommendedPrice ?? side?.recPrice) - numberOrZero(side?.currentPrice)) >= 1;
    const wbChanges = sides.filter(({ platform, side }) => platform === "wb" && changed(side)).length;
    const ozonChanges = sides.filter(({ platform, side }) => platform === "ozon" && changed(side)).length;
    const wbSafe = sides.filter(({ platform, side }) => platform === "wb" && side?.safeToExport).length;
    const ozonSafe = sides.filter(({ platform, side }) => platform === "ozon" && side?.safeToExport).length;
    const green = sides.filter(({ side }) => side?.confidence === "green").length;
    const yellow = sides.filter(({ side }) => side?.confidence === "yellow").length;
    const red = sides.filter(({ side }) => side?.confidence === "red").length;
    const blocked = sides.filter(({ side }) => side?.criticalGate === "BLOCK" || side?.reasonCode === "BLOCK").length;
    const belowMin = sides.filter(({ side }) => Boolean(side?.belowFloorNow) || (
      numberOrZero(side?.currentPrice) > 0
      && numberOrZero(side?.effectiveFloor ?? side?.minPrice) > 0
      && numberOrZero(side?.currentPrice) + 0.001 < numberOrZero(side?.effectiveFloor ?? side?.minPrice)
    )).length;
    const manual = rows.filter((row) => row?.hasManualOverride || row?.wb?.hasOverride || row?.ozon?.hasOverride).length;
    const generatedAt = appState()?.smartPriceWorkbench?.generatedAt || appState()?.repricer?.generatedAt || "";
    const ok = blocked === 0 && belowMin === 0;
    return {
      rows: rows.length,
      wbChanges,
      ozonChanges,
      wbSafe,
      ozonSafe,
      green,
      yellow,
      red,
      blocked,
      belowMin,
      manual,
      generatedAt,
      ok
    };
  }

  function formatDate(value) {
    if (!value) return "нет даты";
    try {
      return new Date(value).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
    } catch {
      return String(value);
    }
  }

  function setGlobalChrome(active) {
    document.body.classList.toggle("repricer-operator-active", Boolean(active));
    ["pullRemoteBtn", "pushRemoteBtn", "exportStorageBtn", "toggleAdminBarBtn"].forEach(function (id) {
      const node = document.getElementById(id);
      if (node) node.classList.toggle("repricer-top-admin-hidden", Boolean(active));
    });
    const importInput = document.getElementById("importStorageInput");
    const importLabel = importInput?.closest(".file-input");
    if (importLabel) importLabel.classList.toggle("repricer-top-admin-hidden", Boolean(active));
  }

  function ensurePanel(host) {
    let panel = host.querySelector("[data-repricer-operator-panel]");
    if (!panel) {
      panel = document.createElement("div");
      panel.className = "repricer-operator-panel";
      panel.setAttribute("data-repricer-operator-panel", "1");
    }

    const metrics = collectMetrics();
    const actionBar = host.querySelector(".section-title .quick-actions, [data-repricer-operator-actions] > .quick-actions");
    const statusTone = metrics.ok ? "ok" : "warn";
    const statusText = metrics.wbSafe || metrics.ozonSafe ? "Можно выгружать" : "Сначала проверить";
    const advancedToggleText = host.classList.contains("repricer-simple-expanded") ? "Скрыть настройки" : "Настройки";
    const panelHtml = [
      '<div class="repricer-operator-copy">',
      '<div class="label">Режим оператора</div>',
      "<strong>", escapeHtml(statusText), "</strong>",
      "<p>В шаблоны попадут только зелёные строки. Желтые и красные остаются в аудите, чтобы не отправить сомнительную цену.</p>",
      "</div>",
      '<div class="repricer-operator-stats">',
      '<span class="chip ok">WB к выгрузке ', fmtInt(metrics.wbSafe), "</span>",
      '<span class="chip ok">Ozon к выгрузке ', fmtInt(metrics.ozonSafe), "</span>",
      '<span class="chip ok">зелёные ', fmtInt(metrics.green), "</span>",
      '<span class="chip warn">проверить ', fmtInt(metrics.yellow), "</span>",
      '<span class="chip danger">стоп ', fmtInt(metrics.red), "</span>",
      '<span class="chip ', metrics.blocked ? "danger" : "ok", '">нет входов ', fmtInt(metrics.blocked), "</span>",
      '<span class="chip ', metrics.belowMin ? "danger" : "ok", '">ниже MIN ', fmtInt(metrics.belowMin), "</span>",
      '<span class="chip">обновлено ', escapeHtml(formatDate(metrics.generatedAt)), "</span>",
      "</div>",
      '<div class="repricer-operator-actions" data-repricer-operator-actions></div>',
      '<button type="button" class="quick-chip repricer-advanced-toggle" data-repricer-advanced-toggle>', escapeHtml(advancedToggleText), '</button>'
    ].join("");
    if (panel.getAttribute("data-repricer-panel-html") !== panelHtml) {
      panel.innerHTML = panelHtml;
      panel.setAttribute("data-repricer-panel-html", panelHtml);
    }

    const anchor = host.querySelector(".section-title");
    if (anchor && panel.previousElementSibling !== anchor) {
      anchor.insertAdjacentElement("afterend", panel);
    } else if (!panel.isConnected || panel.parentElement !== host) {
      host.insertAdjacentElement("afterbegin", panel);
    }
    if (actionBar) {
      const target = panel.querySelector("[data-repricer-operator-actions]");
      if (target && actionBar.parentElement !== target) target.appendChild(actionBar);
    }
    updateSafeExportButtons(host, metrics);
  }

  function setButtonSafety(button, count, platformLabel) {
    if (!button) return;
    const enabled = count > 0;
    button.disabled = !enabled;
    button.title = enabled
      ? `Выгрузит ${count} зелёных строк ${platformLabel}.`
      : `Нет зелёных строк ${platformLabel}: проверьте стоп-лист или аудит.`;
    button.setAttribute("aria-disabled", enabled ? "false" : "true");
  }

  function updateSafeExportButtons(host, metrics) {
    setButtonSafety(host.querySelector('[data-repricer-export="template:wb"]'), metrics.wbSafe, "WB");
    setButtonSafety(host.querySelector('[data-repricer-export="template:ozon"]'), metrics.ozonSafe, "Ozon");
  }

  function tagAdvancedBlocks(host) {
    host.classList.add("repricer-simple-mode");
    host.querySelectorAll(".portal-view-guide, .repricer-guide-grid, .grid.cards, .repricer-settings-card").forEach(function (node) {
      node.classList.add("repricer-simple-advanced");
    });
    host.querySelectorAll(".filters.repricer-filters").forEach(function (node) {
      if (!node.closest(".repricer-side") && !node.closest("[data-repricer-operator-panel]")) {
        node.classList.add("repricer-simple-advanced");
      }
    });
    host.querySelectorAll(":scope > .quick-actions").forEach(function (node) {
      node.classList.add("repricer-simple-advanced");
    });
    host.querySelectorAll(":scope > .badge-stack").forEach(function (node) {
      node.classList.add("repricer-simple-advanced");
    });
    host.querySelectorAll(".card").forEach(function (card) {
      if (card.classList.contains("repricer-safety-card")) return;
      const text = String(card.textContent || "");
      const hasSectionHeading = Boolean(card.querySelector("h3"));
      if (hasSectionHeading || text.includes("Healthcheck") || text.includes("Что проверить в первую очередь") || text.includes("Перед выгрузкой в Excel")) {
        card.classList.add("repricer-simple-advanced");
      }
    });
    host.querySelectorAll(".muted.small").forEach(function (node) {
      const text = String(node.textContent || "");
      if (text.includes("Проверка дублей") || text.includes("По фильтрам найдено")) {
        node.classList.add("repricer-simple-advanced");
      }
    });
  }

  function applyOperatorMode() {
    if (applying) return;
    applying = true;
    try {
      const host = root();
      const hashActive = isRepricerHash();
      if (host?.dataset.repricerLayer === "advanced") {
        host.classList.remove("repricer-simple-mode", "repricer-boot-simple");
        setGlobalChrome(false);
        return;
      }
      if (host && hashActive) {
        host.classList.add("repricer-simple-mode", "repricer-boot-simple");
      }
      if (!host || !host.children.length) {
        setGlobalChrome(hashActive);
        return;
      }
      if (host.dataset.repricerNativeSimple === "1") {
        host.classList.add("repricer-simple-mode");
        setGlobalChrome(true);
        return;
      }
      const isRepricerActive = hashActive || String(appState()?.activeView || "") === "repricer" || host.classList.contains("active");
      setGlobalChrome(isRepricerActive);
      if (!isRepricerActive) return;
      host.classList.add("repricer-simple-mode");
      if (!host.dataset.repricerUserExpanded) {
        host.classList.remove("repricer-simple-expanded");
      }
      ensurePanel(host);
      tagAdvancedBlocks(host);
    } finally {
      window.setTimeout(function () {
        applying = false;
      }, 0);
    }
  }

  window.__ALTEA_REPRICER_OPERATOR_APPLY__ = applyOperatorMode;

  function schedule(delay = 0) {
    window.clearTimeout(timer);
    timer = window.setTimeout(function () {
      installObserver();
      applyOperatorMode();
    }, delay);
  }

  document.addEventListener("click", function (event) {
    const toggle = event.target && event.target.closest
      ? event.target.closest("[data-repricer-advanced-toggle]")
      : null;
    if (!toggle) return;
    const host = root();
    if (!host) return;
    host.classList.toggle("repricer-simple-expanded");
    host.dataset.repricerUserExpanded = host.classList.contains("repricer-simple-expanded") ? "1" : "";
    toggle.textContent = host.classList.contains("repricer-simple-expanded") ? "Скрыть настройки" : "Настройки";
    event.preventDefault();
  });

  function installObserver() {
    const host = root();
    if (!host || observer) return;
    observer = new MutationObserver(function () {
      if (applying) return;
      schedule(0);
    });
    observer.observe(host, { childList: true, subtree: true });
  }

  function wrapFunction(name) {
    const current = readBinding(name);
    if (typeof current !== "function" || current.__alteaRepricerOperatorWrapped) return;
    const wrapped = function () {
      const result = current.apply(this, arguments);
      applyOperatorMode();
      return result;
    };
    wrapped.__alteaRepricerOperatorWrapped = true;
    try {
      window[name] = wrapped;
    } catch {}
  }

  function installWrappers() {
    wrapFunction("renderRepricer");
    wrapFunction("rerenderCurrentView");
  }

  function boot() {
    installObserver();
    installWrappers();
    applyOperatorMode();
    [0, 80, 250, 600, 1200, 2500, 5000, 9000, 15000, 30000].forEach(function (delay) {
      window.setTimeout(function () {
        installObserver();
        installWrappers();
        applyOperatorMode();
      }, delay);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
  window.addEventListener("load", boot, { once: true });
  window.addEventListener("altea:viewchange", boot);
  window.addEventListener("hashchange", boot);
  window.addEventListener("pageshow", boot);
})();
