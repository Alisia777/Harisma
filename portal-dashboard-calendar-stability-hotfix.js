(function () {
  if (window.__ALTEA_DASHBOARD_CALENDAR_STABILITY_20260508A__) return;
  window.__ALTEA_DASHBOARD_CALENDAR_STABILITY_20260508A__ = true;

  var ROOT_SELECTOR = "#view-dashboard";
  var DATE_INPUT_SELECTOR = ".portal-exec-date-input[type='date'], [data-portal-exec-start], [data-portal-exec-end]";

  function asElement(target) {
    return target && target.nodeType === 1 ? target : null;
  }

  function stopCalendarEvent(event) {
    if (!event) return;
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === "function") {
      event.stopImmediatePropagation();
    }
  }

  function dashboardRootFor(node) {
    return node && node.closest && (
      node.closest("[data-portal-dashboard-executive-root]") ||
      node.closest(ROOT_SELECTOR)
    ) || document.getElementById("view-dashboard") || document;
  }

  function inputForTrigger(trigger) {
    if (!trigger) return null;
    var root = dashboardRootFor(trigger);
    var side = String(trigger.dataset.portalExecOpenDate || "").toLowerCase();
    var selector = side === "end" ? "[data-portal-exec-end]" : "[data-portal-exec-start]";
    return root.querySelector(selector);
  }

  function openNativeDatePicker(input) {
    if (!input || input.disabled || input.readOnly) return;
    try {
      input.focus({ preventScroll: true });
    } catch (_) {
      try { input.focus(); } catch (_) {}
    }
    if (typeof input.showPicker === "function") {
      try {
        input.showPicker();
      } catch (_) {}
    }
  }

  function handleClick(event) {
    var target = asElement(event.target);
    if (!target) return;

    var trigger = target.closest(ROOT_SELECTOR + " [data-portal-exec-open-date]");
    if (trigger) {
      var triggerInput = inputForTrigger(trigger);
      stopCalendarEvent(event);
      openNativeDatePicker(triggerInput);
      return;
    }

    var input = target.closest(ROOT_SELECTOR + " " + DATE_INPUT_SELECTOR);
    if (!input) return;
    if (typeof input.showPicker === "function") {
      stopCalendarEvent(event);
      openNativeDatePicker(input);
      return;
    }
    event.stopPropagation();
  }

  function handleKeydown(event) {
    if (!event || (event.key !== "Enter" && event.key !== " ")) return;
    var target = asElement(event.target);
    if (!target) return;
    var trigger = target.closest(ROOT_SELECTOR + " [data-portal-exec-open-date]");
    var input = trigger
      ? inputForTrigger(trigger)
      : target.closest(ROOT_SELECTOR + " " + DATE_INPUT_SELECTOR);
    if (!input) return;
    stopCalendarEvent(event);
    openNativeDatePicker(input);
  }

  document.addEventListener("click", handleClick, true);
  document.addEventListener("keydown", handleKeydown, true);
})();
