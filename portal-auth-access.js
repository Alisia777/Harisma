(function () {
  'use strict';

  (function enforceCanonicalHttps() {
    var location = window.location || {};
    var protocol = String(location.protocol || '').toLowerCase();
    var hostname = String(location.hostname || '').toLowerCase();
    var host = String(location.host || '').replace(/^\s+|\s+$/g, '');
    var local = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '::1';
    window.__ALTEA_CANONICAL_HTTPS_REDIRECT__ = true;
    if (protocol !== 'http:' || local || !host) return;
    var target = 'https://' + host + String(location.pathname || '/') + String(location.search || '') + String(location.hash || '');
    try {
      window.location.replace(target);
    } catch (_) {
      try { window.location.href = target; } catch (__) {}
    }
  }());

  var ALL_VIEWS = [
    'dashboard',
    'data-health',
    'control',
    'executive',
    'sku-plan-fact',
    'repricer',
    'prices',
    'order',
    'oos-control',
    'sku-contour',
    'skus',
    'launches',
    'iu-drr',
    'wb-rating',
    'product-leaderboard',
    'meetings',
    'documents',
    'designers'
  ];

  var EMPLOYEE_VIEWS = [
    'dashboard',
    'data-health',
    'control',
    'executive',
    'sku-plan-fact',
    'repricer',
    'prices',
    'order',
    'oos-control',
    'sku-contour',
    'launches',
    'iu-drr',
    'wb-rating',
    'product-leaderboard',
    'meetings',
    'documents'
  ];

  window.ALTEA_PORTAL_ACCESS_RULES = window.ALTEA_PORTAL_ACCESS_RULES || {
    version: '2026-07-21-designers-roles-history-macos-https',
    allViews: ALL_VIEWS,

    // Unknown authenticated users see only the dashboard until they are assigned below
    // or through Supabase user/app metadata.
    defaultViews: ['dashboard'],
    enforceUserAllowlist: true,

    roles: {
      owner: { views: '*' },
      director: {
        views: ['dashboard', 'executive', 'control', 'documents', 'designers', 'sku-plan-fact', 'prices', 'order', 'product-leaderboard', 'iu-drr', 'wb-rating']
      },
      marketplace: {
        views: ['dashboard', 'documents', 'sku-plan-fact', 'repricer', 'prices', 'order', 'oos-control', 'iu-drr', 'wb-rating']
      },
      product: {
        views: ['dashboard', 'data-health', 'documents', 'designers', 'sku-contour', 'launches', 'product-leaderboard', 'wb-rating']
      },
      designer: {
        views: ['dashboard', 'control', 'documents', 'designers', 'data-health', 'sku-contour', 'launches', 'product-leaderboard', 'wb-rating']
      },
      operations: {
        views: ['dashboard', 'control', 'documents', 'order', 'oos-control', 'sku-plan-fact']
      },
      employee: {
        views: EMPLOYEE_VIEWS
      },
      guest: {
        // Existing demo surfaces stay available, while restricted workspaces
        // such as Designers are never inherited through owner/admin access.
        views: EMPLOYEE_VIEWS
      },
      readonly: {
        views: ['dashboard']
      }
    },

    users: {
      // Employees can see the portal workspace; exact tab sets can still be narrowed per user.
      'm.v.pekhova@qeep.life': { role: 'employee', name: '\u041c\u0430\u0440\u0438\u044f \u041f\u0435\u0445\u043e\u0432\u0430' },
      'm.a.vasilyeva@qeep.life': { role: 'employee' },
      'm.a.lapygin@qeep.life': { role: 'employee' },
      'a.v.sporov@qeep.life': { role: 'employee' },
      'd.v.molodyakova@qeep.life': { role: 'employee' },
      'd.a.pitaykin@qeep.life': { role: 'employee' },
      'm.a.pavlenko@qeep.life': { role: 'employee' },
      'a.v.pirogova@qeep.life': { role: 'employee' },
      'e.a.domozhirova@qeep.life': { role: 'employee' },
      's.s.artyukhin@qeep.life': { role: 'owner' },
      'a.a.ivanova@ya.qeep.life': { role: 'owner' },
      'guest@qeep.life': { role: 'guest', name: '\u0413\u043e\u0441\u0442\u0435\u0432\u043e\u0439 \u0432\u0445\u043e\u0434' },
      'k.labin@qeep.life': { role: 'employee' },
      'a.zarovskaya@qeep.life': { role: 'employee' },
      'v.klimov@qeep.life': { role: 'employee' },
      'e.sai@qeep.life': { role: 'employee' },
      'v.a.papaev@qeep.life': { role: 'employee' },
      'v.sviridova@qeep.life': { role: 'employee' },
      'a.v.grigoreva@qeep.life': { role: 'employee' },
      's.v.stal@ya.qeep.life': { role: 'employee' },
      's.v.stal@qeep.life': { role: 'employee' },
      'g.a.drozdova@qeep.life': { role: 'employee' },
      'e.v.trofimov@qeep.life': { role: 'employee' },
      'd.d.shkurskiy@qeep.life': { role: 'owner' },
      'd.d.shkurskiy@ya.qeep.life': { role: 'owner' },
      's.a.volodichev@ya.qeep.life': { role: 'owner' },
      's.v.voropaev@ya.qeep.life': { role: 'owner', name: '\u0412\u043e\u0440\u043e\u043f\u0430\u0435\u0432 \u0421\u0435\u0440\u0433\u0435\u0439 \u041a\u0410\u041c \u0424\u0421' },
      'a.a.korepanova@ya.qeep.life': { role: 'owner' },
      'e.a.smirnova@ya.qeep.life': { role: 'owner' },
      'a.e.slyshkin@qeep.life': { role: 'owner' },
      'a.s.bulygin@qeep.life': { role: 'employee' },
      'e.s.sinyagina@qeep.life': { role: 'employee' }
    }
  };
})();
