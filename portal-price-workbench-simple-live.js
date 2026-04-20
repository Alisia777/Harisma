(function () {
  if (window.__ALTEA_PRICE_SIMPLE_RENDERER_20260420B__) return;
  window.__ALTEA_PRICE_SIMPLE_RENDERER_20260420B__ = true;

  var DATA_URL = "data/smart_price_workbench.json";
  var VIEW_ID = "view-prices";
  var STYLE_ID = "altea-price-simple-style";
  var STORAGE_KEYS = [
    "brand-portal-price-workbench-v20260419-entries",
    "portal_price_workbench_entries"
  ];

  var state = {
    loading: false,
    loaded: false,
    error: "",
    rows: [],
    market: "wb",
    search: "",
    selectedKey: "",
    dateFrom: "",
    dateTo: ""
  };

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function num(value) {
    if (value === null || value === undefined || value === "") return null;
    var parsed = Number(String(value).replace(/\s+/g, "").replace(",", ".").replace("%", ""));
    return Number.isFinite(parsed) ? parsed : null;
  }

  function pct(value) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return "\u2014";
    return (Number(value) * 100).toFixed(1) + "%";
  }

  function money(value) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return "\u2014";
    return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(Number(value)) + " \u20bd";
  }

  function days(value) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return "\u2014";
    return Number(value).toFixed(1) + " \u0434\u043d.";
  }

  function intf(value) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return "\u2014";
    return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(Number(value));
  }

  function norm(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/[^a-z\u0430-\u044f0-9_-]+/gi, "");
  }

  function latestDate(rows) {
    var dates = [];
    rows.forEach(function (row) {
      (row.timeline || []).forEach(function (item) {
        if (item && item.date) dates.push(item.date);
      });
    });
    dates.sort();
    return dates[dates.length - 1] || "";
  }

  function shiftDate(value, daysDelta) {
    if (!value) return "";
    var date = new Date(value + "T00:00:00");
    date.setDate(date.getDate() + daysDelta);
    return date.toISOString().slice(0, 10);
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = [
      "#view-prices{padding:24px 28px 36px;min-height:520px;}",
      ".pw-shell{display:grid;gap:16px;}",
      ".pw-card,.pw-modal-box{background:rgba(21,17,12,.80);border:1px solid rgba(214,175,85,.16);border-radius:22px;box-shadow:0 18px 50px rgba(0,0,0,.24);}",
      ".pw-card{padding:18px 20px;}",
      ".pw-title{font-size:32px;line-height:1.05;font-weight:800;color:#f4ead6;}",
      ".pw-sub{font-size:14px;line-height:1.55;color:#d8c6a3;max-width:980px;margin-top:8px;}",
      ".pw-grid{display:grid;grid-template-columns:1.2fr 1fr;gap:14px;}",
      ".pw-label{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#bda57a;}",
      ".pw-chip-row{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;}",
      ".pw-chip{border:1px solid rgba(214,175,85,.24);background:rgba(214,175,85,.06);color:#f3e3bf;border-radius:999px;padding:8px 12px;font-size:13px;cursor:pointer;}",
      ".pw-chip.active{background:linear-gradient(135deg,#c49a37,#f2d48d);color:#23180b;border-color:transparent;}",
      ".pw-grid2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:12px;}",
      ".pw-grid2 input,.pw-search{width:100%;box-sizing:border-box;border-radius:14px;border:1px solid rgba(214,175,85,.18);background:rgba(9,7,5,.78);color:#f7ead1;padding:12px 14px;}",
      ".pw-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;}",
      ".pw-stat strong{display:block;margin-top:8px;font-size:28px;color:#fff0cf;}",
      ".pw-stat small{display:block;margin-top:6px;color:#cdb892;line-height:1.45;}",
      ".pw-table-wrap{overflow:auto;}",
      ".pw-table{width:100%;border-collapse:collapse;min-width:1180px;}",
      ".pw-table th{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#bda57a;text-align:left;padding:0 14px 10px;}",
      ".pw-table td{padding:14px;border-top:1px solid rgba(214,175,85,.1);vertical-align:top;color:#f4ead6;}",
      ".pw-row{cursor:pointer;transition:background .18s ease;}",
      ".pw-row:hover{background:rgba(214,175,85,.05);}",
      ".pw-sku{font-weight:700;color:#fff0cf;}",
      ".pw-note{margin-top:4px;color:#bda57a;font-size:12px;line-height:1.35;max-width:460px;}",
      ".pw-badge{display:inline-flex;padding:4px 8px;border-radius:999px;border:1px solid rgba(214,175,85,.26);background:rgba(214,175,85,.08);color:#f3dfb6;font-size:12px;line-height:1.2;}",
      ".pw-danger{color:#ffb7b7;}",
      ".pw-empty{padding:32px 10px;color:#cdb892;text-align:center;}",
      ".pw-error{padding:22px;color:#ffb7b7;background:rgba(120,28,28,.18);border:1px solid rgba(255,120,120,.22);border-radius:18px;}",
      ".pw-modal{position:fixed;inset:0;background:rgba(7,5,4,.78);backdrop-filter:blur(8px);display:none;align-items:center;justify-content:center;padding:24px;z-index:1000;}",
      ".pw-modal.open{display:flex;}",
      ".pw-modal-box{width:min(1180px,96vw);max-height:92vh;overflow:auto;padding:22px;display:grid;gap:18px;}",
      ".pw-modal-head{display:flex;justify-content:space-between;align-items:flex-start;gap:18px;}",
      ".pw-modal-head h3{margin:0;font-size:30px;line-height:1.08;color:#fff0cf;}",
      ".pw-close{border:1px solid rgba(214,175,85,.25);background:rgba(214,175,85,.06);color:#f4e4bf;border-radius:999px;padding:10px 14px;cursor:pointer;}",
      ".pw-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;}",
      ".pw-mini{background:rgba(9,7,5,.74);border:1px solid rgba(214,175,85,.12);border-radius:18px;padding:14px 16px;}",
      ".pw-mini strong{display:block;margin-top:8px;font-size:24px;color:#fff0cf;}",
      ".pw-mini small{display:block;margin-top:6px;color:#cdb892;line-height:1.4;}",
      ".pw-history-wrap{overflow:auto;}",
      ".pw-history{width:100%;border-collapse:collapse;min-width:760px;}",
      ".pw-history th,.pw-history td{padding:10px 12px;border-top:1px solid rgba(214,175,85,.1);text-align:left;}",
      ".pw-history th{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#bda57a;}",
      "@media (max-width:1080px){.pw-grid,.pw-stats,.pw-kpis{grid-template-columns:1fr 1fr;}}",
      "@media (max-width:720px){#view-prices{padding:18px 14px 28px;}.pw-grid,.pw-stats,.pw-kpis,.pw-grid2{grid-template-columns:1fr;}.pw-title{font-size:28px;}}"
    ].join("");
    document.head.appendChild(style);
  }

  function readManualMap() {
    var map = Object.create(null);
    STORAGE_KEYS.forEach(function (key) {
      try {
        var raw = JSON.parse(localStorage.getItem(key) || "null");
        if (!raw) return;
        var list = Array.isArray(raw) ? raw : Object.values(raw);
        list.forEach(function (item) {
          var id = norm(item && (item.articleKey || item.article || item.sku || item.key));
          if (!id) return;
          map[id] = Object.assign(map[id] || {}, item);
        });
      } catch (error) {
        console.warn("[price-simple] localStorage", key, error);
      }
    });
    return map;
  }

  function buildRow(source, market, manualMap) {
    var timeline = Array.isArray(source.monthly) ? source.monthly : Array.isArray(source.daily) ? source.daily : [];
    var row = {
      market: market,
      articleKey: source.articleKey || source.article || source.sku || "",
      name: source.name || source.title || source.articleKey || "\u0411\u0435\u0437 \u043d\u0430\u0437\u0432\u0430\u043d\u0438\u044f",
      owner: source.owner || "\u2014",
      status: source.status || "\u2014",
      allowedMarginPct: num(source.allowedMarginPct),
      marginTotalPct: num(source.marginTotalPct != null ? source.marginTotalPct : source.avgMargin7dPct),
      turnoverDays: num(source.turnoverCurrentDays != null ? source.turnoverCurrentDays : source.currentTurnoverDays),
      currentFillPrice: num(source.currentFillPrice != null ? source.currentFillPrice : source.currentPrice),
      currentClientPrice: num(source.currentClientPrice),
      currentSppPct: num(source.currentSppPct),
      requiredPriceForMargin: num(source.requiredPriceForMargin),
      historyNote: source.historyNote || "",
      timeline: timeline
    };
    var manual = manualMap[norm(row.articleKey)];
    if (manual) {
      if (manual.owner) row.owner = manual.owner;
      if (manual.comment) row.comment = manual.comment;
      if (manual.reason) row.reason = manual.reason;
      if (manual.allowedMarginManualPct != null) {
        var override = num(manual.allowedMarginManualPct);
        row.allowedMarginPct = override != null ? (override > 1 ? override / 100 : override) : row.allowedMarginPct;
      }
    }
    return row;
  }

  async function loadData() {
    if (state.loading || state.loaded) return;
    state.loading = true;
    renderPriceWorkbench();
    try {
      var response = await fetch(DATA_URL, { cache: "no-store" });
      if (!response.ok) throw new Error("Failed to load " + DATA_URL);
      var payload = await response.json();
      var manualMap = readManualMap();
      var rows = [];
      Object.keys(payload.platforms || {}).forEach(function (market) {
        ((payload.platforms[market] || {}).rows || []).forEach(function (item) {
          rows.push(buildRow(item, market, manualMap));
        });
      });
      state.rows = rows;
      state.loaded = true;
      var last = latestDate(rows);
      if (last) {
        state.dateTo = last;
        state.dateFrom = shiftDate(last, -6);
      }
    } catch (error) {
      state.error = error && error.message ? error.message : "\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044c \u0432\u043a\u043b\u0430\u0434\u043a\u0443 \u0426\u0435\u043d\u044b.";
    } finally {
      state.loading = false;
      renderPriceWorkbench();
    }
  }

  function visibleRows() {
    var search = String(state.search || "").trim().toLowerCase();
    return state.rows.filter(function (row) {
      if (state.market !== "all" && row.market !== state.market) return false;
      if (search) {
        var hay = [row.articleKey, row.name, row.owner, row.status, row.comment, row.reason].join(" ").toLowerCase();
        if (hay.indexOf(search) === -1) return false;
      }
      return true;
    });
  }

  function rangeSlice(row) {
    return (row.timeline || []).filter(function (item) {
      if (!item || !item.date) return false;
      if (state.dateFrom && item.date < state.dateFrom) return false;
      if (state.dateTo && item.date > state.dateTo) return false;
      return true;
    });
  }

  function stats(rows) {
    function mean(list) {
      return list.length ? list.reduce(function (acc, value) { return acc + value; }, 0) / list.length : null;
    }
    var price = [];
    var margin = [];
    var turnover = [];
    var below = 0;
    rows.forEach(function (row) {
      if (row.currentFillPrice != null) price.push(row.currentFillPrice);
      if (row.marginTotalPct != null) margin.push(row.marginTotalPct);
      if (row.turnoverDays != null) turnover.push(row.turnoverDays);
      if (row.allowedMarginPct != null && row.marginTotalPct != null && row.marginTotalPct < row.allowedMarginPct) below += 1;
    });
    return {
      count: rows.length,
      avgPrice: mean(price),
      avgMargin: mean(margin),
      avgTurnover: mean(turnover),
      belowAllowed: below
    };
  }

  function findRow(key) {
    var wanted = norm(key);
    return state.rows.find(function (row) { return norm(row.articleKey) === wanted; }) || null;
  }

  function renderTable(rows) {
    if (!rows.length) return '<div class="pw-empty">\u041f\u043e \u0432\u044b\u0431\u0440\u0430\u043d\u043d\u044b\u043c \u0444\u0438\u043b\u044c\u0442\u0440\u0430\u043c \u043f\u043e\u043a\u0430 \u043d\u0435\u0442 \u0441\u0442\u0440\u043e\u043a.</div>';
    var sorted = rows.slice().sort(function (a, b) {
      var dangerA = a.allowedMarginPct != null && a.marginTotalPct != null && a.marginTotalPct < a.allowedMarginPct ? 1 : 0;
      var dangerB = b.allowedMarginPct != null && b.marginTotalPct != null && b.marginTotalPct < b.allowedMarginPct ? 1 : 0;
      if (dangerA !== dangerB) return dangerB - dangerA;
      return (b.currentFillPrice || 0) - (a.currentFillPrice || 0);
    });
    return [
      '<div class="pw-table-wrap"><table class="pw-table"><thead><tr>',
      '<th>\u0410\u0440\u0442\u0438\u043a\u0443\u043b</th><th>Owner</th><th>\u0421\u0442\u0430\u0442\u0443\u0441</th><th>\u0426\u0435\u043d\u0430 MP</th><th>\u0426\u0435\u043d\u0430 \u043a\u043b\u0438\u0435\u043d\u0442\u0430</th><th>\u0421\u041f\u041f</th><th>\u0414\u043e\u043f\u0443\u0441\u0442\u0438\u043c\u0430\u044f 3\u043c</th><th>\u041c\u0430\u0440\u0436\u0430</th><th>\u041e\u0431\u043e\u0440\u0430\u0447\u0438\u0432\u0430\u0435\u043c\u043e\u0441\u0442\u044c</th>',
      '</tr></thead><tbody>',
      sorted.map(function (row) {
        var danger = row.allowedMarginPct != null && row.marginTotalPct != null && row.marginTotalPct < row.allowedMarginPct;
        return [
          '<tr class="pw-row" data-open-price="', esc(row.articleKey), '">',
          '<td><div class="pw-sku">', esc(row.articleKey), '</div><div class="pw-note">', esc(row.name), '</div></td>',
          '<td>', esc(row.owner || "\u2014"), '</td>',
          '<td><span class="pw-badge">', esc(row.status || "\u2014"), '</span></td>',
          '<td>', money(row.currentFillPrice), '</td>',
          '<td>', money(row.currentClientPrice), '</td>',
          '<td>', pct(row.currentSppPct), '</td>',
          '<td>', pct(row.allowedMarginPct), '</td>',
          '<td class="', danger ? 'pw-danger' : '', '">', pct(row.marginTotalPct), '</td>',
          '<td>', days(row.turnoverDays), '</td>',
          '</tr>'
        ].join("");
      }).join(""),
      '</tbody></table></div>'
    ].join("");
  }

  function renderHistory(row) {
    var items = rangeSlice(row).slice(-14);
    if (!items.length) {
      return '<div class="pw-empty">\u0412\u043d\u0443\u0442\u0440\u0438 \u0432\u044b\u0431\u0440\u0430\u043d\u043d\u043e\u0433\u043e \u043f\u0435\u0440\u0438\u043e\u0434\u0430 \u043d\u0435\u0442 \u043e\u043f\u0443\u0431\u043b\u0438\u043a\u043e\u0432\u0430\u043d\u043d\u044b\u0445 \u0434\u043d\u0435\u0432\u043d\u044b\u0445 \u0442\u043e\u0447\u0435\u043a.</div>';
    }
    return [
      '<div class="pw-history-wrap"><table class="pw-history"><thead><tr>',
      '<th>\u0414\u0430\u0442\u0430</th><th>\u0426\u0435\u043d\u0430 MP</th><th>\u0421\u041f\u041f</th><th>\u041e\u0431\u043e\u0440\u0430\u0447\u0438\u0432\u0430\u0435\u043c\u043e\u0441\u0442\u044c</th><th>\u0417\u0430\u043a\u0430\u0437\u044b</th><th>\u0412\u044b\u0440\u0443\u0447\u043a\u0430</th>',
      '</tr></thead><tbody>',
      items.map(function (item) {
        return [
          '<tr><td>', esc(item.date || ""), '</td>',
          '<td>', money(num(item.price)), '</td>',
          '<td>', pct(num(item.sppPct)), '</td>',
          '<td>', days(num(item.turnoverDays)), '</td>',
          '<td>', intf(num(item.ordersUnits)), '</td>',
          '<td>', money(num(item.revenue)), '</td></tr>'
        ].join("");
      }).join(""),
      '</tbody></table></div>'
    ].join("");
  }

  function renderModal(row) {
    if (!row) return "";
    return [
      '<div class="pw-modal ', state.selectedKey ? 'open' : '', '" id="priceSimpleModal">',
      '<div class="pw-modal-box">',
      '<div class="pw-modal-head">',
      '<div><h3>', esc(row.articleKey), '</h3><div class="pw-sub">', esc(row.name), '</div></div>',
      '<button class="pw-close" type="button" data-close-price-modal>\u0417\u0430\u043a\u0440\u044b\u0442\u044c</button>',
      '</div>',
      '<div class="pw-kpis">',
      '<div class="pw-mini"><span class="pw-label">\u0426\u0435\u043d\u0430 MP</span><strong>', money(row.currentFillPrice), '</strong><small>\u0422\u0435\u043a\u0443\u0449\u0430\u044f \u0446\u0435\u043d\u0430 \u043f\u0440\u043e\u0434\u0430\u0432\u0446\u0430.</small></div>',
      '<div class="pw-mini"><span class="pw-label">\u0426\u0435\u043d\u0430 \u043a\u043b\u0438\u0435\u043d\u0442\u0430</span><strong>', money(row.currentClientPrice), '</strong><small>\u0422\u0435\u043a\u0443\u0449\u0438\u0439 \u043a\u043b\u0438\u0435\u043d\u0442\u0441\u043a\u0438\u0439 \u043a\u043e\u043d\u0442\u0443\u0440.</small></div>',
      '<div class="pw-mini"><span class="pw-label">\u0414\u043e\u043f\u0443\u0441\u0442\u0438\u043c\u0430\u044f \u043c\u0430\u0440\u0436\u0430 3\u043c</span><strong>', pct(row.allowedMarginPct), '</strong><small>\u0411\u0435\u0440\u0435\u043c \u0438\u0437 smart/workbench \u0441\u043b\u043e\u044f \u0431\u0435\u0437 \u043f\u0440\u0438\u0432\u044f\u0437\u043a\u0438 \u043a \u043d\u043e\u043c\u0435\u0440\u0443 \u0441\u0442\u0440\u043e\u043a\u0438.</small></div>',
      '<div class="pw-mini"><span class="pw-label">\u0422\u0435\u043a\u0443\u0449\u0430\u044f \u043c\u0430\u0440\u0436\u0430</span><strong>', pct(row.marginTotalPct), '</strong><small>\u041e\u043f\u0435\u0440\u0430\u0446\u0438\u043e\u043d\u043d\u044b\u0439 \u0443\u0440\u043e\u0432\u0435\u043d\u044c \u043f\u043e \u043f\u043e\u0437\u0438\u0446\u0438\u0438.</small></div>',
      '<div class="pw-mini"><span class="pw-label">\u041e\u0431\u043e\u0440\u0430\u0447\u0438\u0432\u0430\u0435\u043c\u043e\u0441\u0442\u044c</span><strong>', days(row.turnoverDays), '</strong><small>\u0422\u0435\u043a\u0443\u0449\u0435\u0435 \u0437\u043d\u0430\u0447\u0435\u043d\u0438\u0435 \u043f\u043e \u043f\u043e\u0437\u0438\u0446\u0438\u0438.</small></div>',
      '<div class="pw-mini"><span class="pw-label">Owner</span><strong>', esc(row.owner || "\u2014"), '</strong><small>\u0420\u0443\u0447\u043d\u043e\u0435 \u043f\u043e\u043b\u0435 \u043d\u0435 \u043f\u0435\u0440\u0435\u0442\u0438\u0440\u0430\u0435\u043c.</small></div>',
      '<div class="pw-mini"><span class="pw-label">\u0421\u0442\u0430\u0442\u0443\u0441 \u0442\u043e\u0432\u0430\u0440\u0430</span><strong>', esc(row.status || "\u2014"), '</strong><small>\u0421\u0442\u0430\u0442\u0443\u0441 \u0441\u0442\u0440\u043e\u043a\u0438 \u043f\u043e \u0442\u0435\u043a\u0443\u0449\u0435\u043c\u0443 \u0438\u0441\u0442\u043e\u0447\u043d\u0438\u043a\u0443.</small></div>',
      '<div class="pw-mini"><span class="pw-label">\u0426\u0435\u043d\u0430 \u043f\u043e \u043c\u0430\u0440\u0436\u0435</span><strong>', money(row.requiredPriceForMargin), '</strong><small>\u0415\u0441\u043b\u0438 \u0437\u043d\u0430\u0447\u0435\u043d\u0438\u0435 \u043f\u0440\u0438\u0435\u0445\u0430\u043b\u043e \u0432 smart-\u0441\u043b\u043e\u0435.</small></div>',
      '</div>',
      '<div class="pw-card">',
      '<div class="pw-label">\u0418\u0441\u0442\u043e\u0440\u0438\u044f \u043f\u0435\u0440\u0438\u043e\u0434\u0430</div>',
      '<div class="pw-note">', esc(row.historyNote || "\u041f\u043e\u043a\u0430\u0437\u044b\u0432\u0430\u0435\u043c \u043f\u043e\u0441\u043b\u0435\u0434\u043d\u0438\u0435 14 \u0442\u043e\u0447\u0435\u043a \u0432\u043d\u0443\u0442\u0440\u0438 \u0432\u044b\u0431\u0440\u0430\u043d\u043d\u043e\u0433\u043e \u0434\u0438\u0430\u043f\u0430\u0437\u043e\u043d\u0430."), '</div>',
      renderHistory(row),
      '</div>',
      '</div></div>'
    ].join("");
  }

  function renderRoot() {
    var root = document.getElementById(VIEW_ID);
    if (!root) return;
    ensureStyles();
    var rows = visibleRows();
    var summary = stats(rows);
    var selected = state.selectedKey ? findRow(state.selectedKey) : null;
    root.innerHTML = [
      '<div class="pw-shell">',
      '<section class="pw-card">',
      '<div class="pw-title">\u0426\u0435\u043d\u044b</div>',
      '<div class="pw-sub">\u0410\u0432\u0430\u0440\u0438\u0439\u043d\u044b\u0439 \u043f\u0440\u044f\u043c\u043e\u0439 \u0440\u0435\u043d\u0434\u0435\u0440 \u0432\u043a\u043b\u0430\u0434\u043a\u0438. \u041f\u043e\u0434\u043d\u044f\u043b\u0430 \u0435\u0433\u043e, \u0447\u0442\u043e\u0431\u044b \u044d\u043a\u0440\u0430\u043d \u043f\u0435\u0440\u0435\u0441\u0442\u0430\u043b \u0431\u044b\u0442\u044c \u043f\u0443\u0441\u0442\u044b\u043c \u0438 \u043c\u043e\u0436\u043d\u043e \u0431\u044b\u043b\u043e \u0440\u0430\u0431\u043e\u0442\u0430\u0442\u044c \u0441 \u0446\u0435\u043d\u043e\u0439, \u043c\u0430\u0440\u0436\u043e\u0439, \u0441\u0442\u0430\u0442\u0443\u0441\u043e\u043c \u0442\u043e\u0432\u0430\u0440\u0430 \u0438 \u043a\u0430\u0440\u0442\u043e\u0447\u043a\u043e\u0439 \u0430\u0440\u0442\u0438\u043a\u0443\u043b\u0430, \u043f\u043e\u043a\u0430 \u043e\u0441\u043d\u043e\u0432\u043d\u043e\u0439 bundle \u043d\u0435 \u0432\u043e\u0441\u0441\u0442\u0430\u043d\u043e\u0432\u043b\u0435\u043d.</div>',
      state.error ? '<div class="pw-error">' + esc(state.error) + '</div>' : '',
      '<div class="pw-grid" style="margin-top:14px;">',
      '<div class="pw-card">',
      '<div class="pw-label">\u041f\u043b\u043e\u0449\u0430\u0434\u043a\u0430 \u0438 \u043f\u0435\u0440\u0438\u043e\u0434</div>',
      '<div class="pw-chip-row">',
      ['all','wb','ozon','ym'].map(function (market) {
        var labels = { all: '\u0412\u0441\u0435', wb: 'WB', ozon: 'Ozon', ym: '\u042f.\u041c\u0430\u0440\u043a\u0435\u0442' };
        return '<button type="button" class="pw-chip ' + (state.market === market ? 'active' : '') + '" data-price-market="' + market + '">' + labels[market] + '</button>';
      }).join(""),
      '</div>',
      '<div class="pw-chip-row">',
      '<button type="button" class="pw-chip" data-price-preset="7">7 \u0434\u043d\u0435\u0439</button>',
      '<button type="button" class="pw-chip" data-price-preset="14">14 \u0434\u043d\u0435\u0439</button>',
      '<button type="button" class="pw-chip" data-price-preset="30">30 \u0434\u043d\u0435\u0439</button>',
      '</div>',
      '<div class="pw-grid2">',
      '<input type="date" id="pwFrom" value="', esc(state.dateFrom), '">',
      '<input type="date" id="pwTo" value="', esc(state.dateTo), '">',
      '</div></div>',
      '<div class="pw-card">',
      '<div class="pw-label">\u041f\u043e\u0438\u0441\u043a</div>',
      '<input class="pw-search" id="pwSearch" placeholder="\u0410\u0440\u0442\u0438\u043a\u0443\u043b, owner, \u0441\u0442\u0430\u0442\u0443\u0441" value="', esc(state.search), '">',
      '<div class="pw-note">\u0418\u0441\u0442\u043e\u0447\u043d\u0438\u043a: ', esc(DATA_URL), '</div>',
      '</div></div>',
      '</section>',
      '<section class="pw-stats">',
      '<div class="pw-card pw-stat"><span class="pw-label">SKU \u0432 \u0440\u0430\u0431\u043e\u0442\u0435</span><strong>', intf(summary.count), '</strong><small>\u041f\u043e \u0442\u0435\u043a\u0443\u0449\u0435\u0439 \u043f\u043b\u043e\u0449\u0430\u0434\u043a\u0435 \u0438 \u0444\u0438\u043b\u044c\u0442\u0440\u0430\u043c.</small></div>',
      '<div class="pw-card pw-stat"><span class="pw-label">\u0421\u0440\u0435\u0434\u043d\u044f\u044f \u0446\u0435\u043d\u0430 MP</span><strong>', money(summary.avgPrice), '</strong><small>\u0422\u0435\u043a\u0443\u0449\u0430\u044f \u0441\u0440\u0435\u0434\u043d\u044f\u044f \u0446\u0435\u043d\u0430 \u043f\u043e \u0432\u044b\u0431\u0440\u0430\u043d\u043d\u044b\u043c \u0441\u0442\u0440\u043e\u043a\u0430\u043c.</small></div>',
      '<div class="pw-card pw-stat"><span class="pw-label">\u0421\u0440\u0435\u0434\u043d\u044f\u044f \u043c\u0430\u0440\u0436\u0430</span><strong>', pct(summary.avgMargin), '</strong><small>\u0422\u0435\u043a\u0443\u0449\u0438\u0439 \u0441\u0440\u0435\u0434\u043d\u0438\u0439 \u0443\u0440\u043e\u0432\u0435\u043d\u044c \u043f\u043e \u043f\u043e\u0437\u0438\u0446\u0438\u0438.</small></div>',
      '<div class="pw-card pw-stat"><span class="pw-label">\u041d\u0438\u0436\u0435 \u0434\u043e\u043f\u0443\u0441\u0442\u0438\u043c\u043e\u0439</span><strong>', intf(summary.belowAllowed), '</strong><small>\u0421\u0440\u0430\u0432\u043d\u0435\u043d\u0438\u0435 \u0442\u0435\u043a\u0443\u0449\u0435\u0439 \u043c\u0430\u0440\u0436\u0438 \u0441 \u0434\u043e\u043f\u0443\u0441\u0442\u0438\u043c\u043e\u0439 3\u043c.</small></div>',
      '</section>',
      '<section class="pw-card">',
      '<div class="pw-label">\u0422\u0430\u0431\u043b\u0438\u0446\u0430</div>',
      state.loading && !state.loaded ? '<div class="pw-empty">\u0417\u0430\u0433\u0440\u0443\u0436\u0430\u044e \u0434\u0430\u043d\u043d\u044b\u0435 \u0432\u043a\u043b\u0430\u0434\u043a\u0438 \u0426\u0435\u043d\u044b...</div>' : renderTable(rows),
      '</section>',
      renderModal(selected),
      '</div>'
    ].join("");

    root.querySelectorAll("[data-price-market]").forEach(function (button) {
      button.addEventListener("click", function () {
        state.market = button.getAttribute("data-price-market");
        renderPriceWorkbench();
      });
    });
    root.querySelectorAll("[data-price-preset]").forEach(function (button) {
      button.addEventListener("click", function () {
        var daysCount = Number(button.getAttribute("data-price-preset"));
        if (!state.dateTo) return;
        state.dateFrom = shiftDate(state.dateTo, -(daysCount - 1));
        renderPriceWorkbench();
      });
    });
    var fromInput = document.getElementById("pwFrom");
    var toInput = document.getElementById("pwTo");
    var searchInput = document.getElementById("pwSearch");
    if (fromInput) fromInput.addEventListener("change", function () { state.dateFrom = fromInput.value; renderPriceWorkbench(); });
    if (toInput) toInput.addEventListener("change", function () { state.dateTo = toInput.value; renderPriceWorkbench(); });
    if (searchInput) searchInput.addEventListener("input", function () { state.search = searchInput.value; renderPriceWorkbench(); });
    root.querySelectorAll("[data-open-price]").forEach(function (rowNode) {
      rowNode.addEventListener("click", function () {
        state.selectedKey = rowNode.getAttribute("data-open-price");
        renderPriceWorkbench();
      });
    });
    var modal = document.getElementById("priceSimpleModal");
    if (modal) {
      modal.addEventListener("click", function (event) {
        if (event.target === modal || event.target.closest("[data-close-price-modal]")) {
          state.selectedKey = "";
          renderPriceWorkbench();
        }
      });
    }
  }

  function renderPriceWorkbench() {
    renderRoot();
  }

  window.renderPriceWorkbench = renderPriceWorkbench;

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && state.selectedKey) {
      state.selectedKey = "";
      renderPriceWorkbench();
    }
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      renderPriceWorkbench();
      loadData();
    }, { once: true });
  } else {
    renderPriceWorkbench();
    loadData();
  }
})();
