#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { runBuild, resolveOptions } = require('./build-predictive-risk-layer');

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function makeDaily(startDate, values) {
  const start = Date.parse(`${startDate}T00:00:00Z`);
  return values.map((value, index) => ({
    date: new Date(start + index * 86400000).toISOString().slice(0, 10),
    views: value.views || 0,
    clicks: value.clicks || 0,
    ordersUnits: value.ordersUnits || 0,
    revenue: value.revenue || 0,
    ordersRevenue: value.ordersRevenue || value.revenue || 0,
    price: value.price || 0
  }));
}

function writeBaseFixture(dir) {
  const previousViews = Array.from({ length: 7 }, () => ({ views: 1000, clicks: 120, ordersUnits: 20, revenue: 20000, price: 1000 }));
  const recentViews = Array.from({ length: 7 }, () => ({ views: 610, clicks: 80, ordersUnits: 18, revenue: 18000, price: 1000 }));
  const smallBasePrevious = Array.from({ length: 7 }, () => ({ views: 10, clicks: 1, ordersUnits: 0, revenue: 0, price: 1000 }));
  const smallBaseRecent = Array.from({ length: 7 }, () => ({ views: 0, clicks: 0, ordersUnits: 0, revenue: 0, price: 1000 }));

  writeJson(path.join(dir, 'skus.json'), [
    {
      articleKey: 'retiderm_50ml',
      name: 'Retiderm 50 ml',
      owner: { name: 'Максим', byPlatform: { wb: 'Мария', ozon: 'Даша', ym: 'Анна' } }
    },
    {
      articleKey: 'small_base_10ml',
      name: 'Small base',
      owner: { name: 'Максим', byPlatform: { wb: 'Мария' } }
    }
  ]);

  writeJson(path.join(dir, 'platform_trends.json'), {
    generatedAt: '2026-06-30T08:00:00.000Z',
    latestMarketplaceDate: '2026-06-29',
    platforms: [],
    extraMarketplace: {
      asOfDate: '2026-06-29',
      platforms: {
        wb: {
          articles: [
            {
              platformKey: 'wb',
              articleKey: 'retiderm_50ml',
              name: 'Retiderm 50 ml',
              owner: 'Мария',
              daily: makeDaily('2026-06-16', [...previousViews, ...recentViews])
            },
            {
              platformKey: 'wb',
              articleKey: 'small_base_10ml',
              name: 'Small base',
              owner: 'Мария',
              daily: makeDaily('2026-06-16', [...smallBasePrevious, ...smallBaseRecent])
            }
          ]
        }
      }
    }
  });

  writeJson(path.join(dir, 'ads_summary.json'), {
    generatedAt: '2026-06-30T08:00:00.000Z',
    asOfDate: '2026-06-29',
    itemSeries: []
  });

  writeJson(path.join(dir, 'iu_drr_summary.json'), {
    generatedAt: '2026-06-30T08:00:00.000Z',
    asOfDate: '2026-06-29',
    kpis: {
      monthKey: '2026-06',
      daysInPlan: 30,
      daysInSummary: 20,
      iuRevenueWbPlan: 1000000,
      iuRevenueWbFactToDate: 900000,
      iuRevenueOzonPlan: 1000000,
      iuRevenueOzonFactToDate: 900000,
      iuRevenueYandexPlan: 1000000,
      iuRevenueYandexFactToDate: 500000
    }
  });

  writeJson(path.join(dir, 'oos_control.json'), {
    generatedAt: '2026-06-30T08:00:00.000Z',
    dataFreshness: { dataDate: '2026-06-29' },
    summary: { dataDate: '2026-06-29' },
    rows: [
      {
        platform: 'wb',
        articleKey: 'retiderm_50ml',
        name: 'Retiderm 50 ml',
        owner: 'Мария',
        turnoverDays: 12,
        revenueAtRiskDay: 120000,
        status: 'risk',
        severity: 'high',
        place: 'all',
        recommendation: 'Проверить поставку retiderm_50ml.'
      }
    ]
  });

  writeJson(path.join(dir, 'smart_price_overlay.json'), {
    generatedAt: '2026-06-30T08:00:00.000Z',
    asOfDate: '2026-06-29',
    platforms: {
      wb: {
        rows: [{ articleKey: 'retiderm_50ml', owner: 'Мария', currentClientPrice: 1000, currentPrice: 1000 }]
      },
      ozon: {
        rows: [{ articleKey: 'retiderm_50ml', owner: 'Даша', currentClientPrice: 850, currentPrice: 850 }]
      }
    }
  });

  writeJson(path.join(dir, 'wb_sales_funnel_report.json'), { generatedAt: '2026-06-30T08:00:00.000Z', period: { to: '2026-06-29' }, items: [] });
  writeJson(path.join(dir, 'order_procurement.json'), { generatedAt: '2026-06-30T08:00:00.000Z', window: { to: '2026-06-29' }, rows: [] });
  writeJson(path.join(dir, 'order_procurement_wb.json'), { generatedAt: '2026-06-30T08:00:00.000Z', window: { to: '2026-06-29' }, rows: [] });
  writeJson(path.join(dir, 'order_procurement_ozon.json'), { generatedAt: '2026-06-30T08:00:00.000Z', window: { to: '2026-06-29' }, rows: [] });
  writeJson(path.join(dir, 'smart_price_workbench.json'), { generatedAt: '2026-06-30T08:00:00.000Z', platforms: {} });
  writeJson(path.join(dir, 'product_leaderboard.json'), { generatedAt: '2026-06-30T08:00:00.000Z', items: [] });
  writeJson(path.join(dir, 'product_leaderboard_history.json'), []);
  writeJson(path.join(dir, 'wb_feedbacks_summary.json'), { generatedAt: '2026-06-30T08:00:00.000Z', asOfDate: '2026-06-29' });
  writeJson(path.join(dir, 'ozon_feedbacks_summary.json'), { generatedAt: '2026-06-30T08:00:00.000Z', asOfDate: '2026-06-29' });
  writeJson(path.join(dir, 'sku_matrix.json'), { items: [] });
  writeJson(path.join(dir, 'launches.json'), []);
}

function build(dir) {
  return runBuild(resolveOptions({
    'input-dir': dir,
    'base-data-dir': dir,
    'output-dir': dir,
    now: '2026-06-30T10:00:00.000Z'
  }));
}

function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'predictive-risk-selftest-'));
  try {
    writeBaseFixture(dir);
    const first = build(dir);
    const risks = first.snapshot.risks;

    const viewsRisk = risks.find((risk) => risk.rule === 'demand_slowdown_early_warning' && risk.articleKey === 'retiderm_50ml' && risk.forecast?.metric === 'views');
    assert(viewsRisk, 'detects 39% views drop');
    assert(viewsRisk.riskScore >= 60, 'views drop becomes high risk');
    assert(first.autoTaskSignals.signals.some((signal) => signal.predictiveRiskId === viewsRisk.id), 'high views risk creates auto task signal');

    assert(!risks.some((risk) => risk.articleKey === 'small_base_10ml' && risk.rule === 'demand_slowdown_early_warning'), 'small previous base is suppressed');
    assert(viewsRisk.drivers.some((driver) => driver.key === 'stockout_forecast_risk'), 'coupled OOS/stock risk is attached');

    const iuRisk = risks.find((risk) => risk.rule === 'forecast_iu_miss_risk' && risk.platform === 'ya');
    assert(iuRisk && iuRisk.riskScore >= 80, 'creates critical IU miss forecast risk');

    const stockRisk = risks.find((risk) => risk.rule === 'stockout_forecast_risk' && risk.articleKey === 'retiderm_50ml');
    assert(stockRisk && stockRisk.riskScore >= 60, 'creates stockout forecast risk for turnoverDays <= 14');

    const priceRisk = risks.find((risk) => risk.rule === 'price_position_risk' && risk.articleKey === 'retiderm_50ml');
    assert(priceRisk, 'creates price position risk when Ozon is cheaper than WB');

    const signal = first.autoTaskSignals.signals.find((item) => item.predictiveRiskId === viewsRisk.id);
    assert(signal.reason.includes('Прогноз:'), 'task text contains forecast section');
    assert(signal.reason.includes('Критерий закрытия:'), 'task text contains close criteria');
    const contractFields = ['whatChanged', 'baseline', 'current', 'deltaPct', 'forecast', 'probableCause', 'confidence', 'recommendedAction', 'closeCriteria', 'deadline'];
    first.autoTaskSignals.signals
      .filter((item) => ['critical', 'high'].includes(item.priority))
      .forEach((item) => {
        contractFields.forEach((field) => {
          assert(item[field] !== undefined && item[field] !== null && item[field] !== '', `high/critical task has ${field}`);
        });
      });
    assert(!first.autoTaskSignals.signals.some((item) => /codex/i.test(String(item.owner || ''))), 'Codex/Codex QA never becomes owner');
    assert(first.autoTaskSignals.signals.length <= risks.length, 'risk count compresses into a limited task count');

    const second = build(dir);
    const secondSignal = second.autoTaskSignals.signals.find((item) => item.predictiveRiskId === viewsRisk.id);
    assert(secondSignal && secondSignal.autoCode === signal.autoCode, 'autoCode is stable across builds');

    const ads = JSON.parse(fs.readFileSync(path.join(dir, 'ads_summary.json'), 'utf8'));
    ads.asOfDate = '2026-06-27';
    writeJson(path.join(dir, 'ads_summary.json'), ads);
    const stale = build(dir);
    assert(stale.snapshot.risks.some((risk) => risk.rule === 'data_freshness_predictive_blocker' && risk.subRule === 'stale_layer'), 'creates data freshness blocker when source is stale');
    assert(stale.autoTaskSignals.signals.some((item) => item.type === 'data_quality'), 'stale source creates data-quality task');
    assert(!stale.autoTaskSignals.signals.some((item) => item.type !== 'data_quality'), 'stale source does not create business tasks');

    const staleCritical = stale.snapshot.risks.find((risk) => risk.priority === 'critical');
    assert(staleCritical, 'critical risk remains visible in risk snapshot even when business tasks are suppressed');

    console.log('[predictive-risk:selftest] ok');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

if (require.main === module) main();
