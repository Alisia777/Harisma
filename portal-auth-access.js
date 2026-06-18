(function () {
  'use strict';

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
    'launch-control',
    'iu-drr',
    'wb-rating',
    'product-leaderboard',
    'meetings',
    'documents'
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
    'launch-control',
    'iu-drr',
    'wb-rating',
    'product-leaderboard',
    'meetings',
    'documents'
  ];

  window.ALTEA_PORTAL_ACCESS_RULES = window.ALTEA_PORTAL_ACCESS_RULES || {
    version: '2026-06-18',
    allViews: ALL_VIEWS,

    // Unknown authenticated users see only the dashboard until they are assigned below
    // or through Supabase user/app metadata.
    defaultViews: ['dashboard'],
    enforceUserAllowlist: true,

    roles: {
      owner: { views: '*' },
      director: {
        views: ['dashboard', 'executive', 'control', 'sku-plan-fact', 'prices', 'order', 'product-leaderboard', 'iu-drr', 'wb-rating']
      },
      marketplace: {
        views: ['dashboard', 'sku-plan-fact', 'repricer', 'prices', 'order', 'oos-control', 'iu-drr', 'wb-rating']
      },
      product: {
        views: ['dashboard', 'data-health', 'sku-contour', 'launches', 'launch-control', 'product-leaderboard', 'wb-rating']
      },
      operations: {
        views: ['dashboard', 'control', 'order', 'oos-control', 'sku-plan-fact']
      },
      employee: {
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
      'k.labin@qeep.life': { role: 'employee' },
      'a.zarovskaya@qeep.life': { role: 'employee' },
      'v.klimov@qeep.life': { role: 'employee' },
      'e.sai@qeep.life': { role: 'employee' }
    }
  };
})();
