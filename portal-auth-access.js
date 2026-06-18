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
      readonly: {
        views: ['dashboard']
      }
    },

    users: {
      // Start employees with readonly access, then assign a role or exact views.
      'm.v.pekhova@qeep.life': { role: 'readonly', name: '\u041c\u0430\u0440\u0438\u044f \u041f\u0435\u0445\u043e\u0432\u0430' },
      'm.a.vasilyeva@qeep.life': { role: 'readonly' },
      'm.a.lapygin@qeep.life': { role: 'readonly' },
      'a.v.sporov@qeep.life': { role: 'readonly' },
      'd.v.molodyakova@qeep.life': { role: 'readonly' },
      'd.a.pitaykin@qeep.life': { role: 'readonly' },
      'm.a.pavlenko@qeep.life': { role: 'readonly' },
      'a.v.pirogova@qeep.life': { role: 'readonly' },
      'e.a.domozhirova@qeep.life': { role: 'readonly' },
      's.s.artyukhin@qeep.life': { role: 'readonly' },
      'k.labin@qeep.life': { role: 'readonly' },
      'a.zarovskaya@qeep.life': { role: 'readonly' },
      'v.klimov@qeep.life': { role: 'readonly' },
      'e.sai@qeep.life': { role: 'readonly' }
    }
  };
})();
