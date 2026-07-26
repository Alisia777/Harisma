#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const REPORT_NAME = 'portal_daily_close_preflight.json';
const DEFAULT_SUPABASE_URL = 'https://iyckwryrucqrxwlowxow.supabase.co';
const REQUIRED_SECRETS = [
  'ALTEA_WB_API_TOKEN',
  'ALTEA_WB_PROMOTION_TOKEN',
  'ALTEA_OZON_CLIENT_ID',
  'ALTEA_OZON_API_KEY',
  'ALTEA_YM_API_KEY',
  'SUPABASE_SERVICE_ROLE_KEY'
];
const REQUIRED_CONFIG = ['SUPABASE_URL'];
const OPTIONAL_SECRETS = [
  'ALTEA_YM_CAMPAIGN_ID',
  'ALTEA_YM_BUSINESS_ID'
];
const PRICE_WORKBOOK_SOURCE_ENV = [
  'ALTEA_SMART_PRICE_SHEET_URL',
  'ALTEA_SMART_PRICE_XLSX_URL',
  'ALTEA_SMART_PRICE_EXPORT_URL',
  'ALTEA_SMART_PRICE_INPUT_XLSX',
  'ALTEA_SMART_PRICE_XLSX_B64',
  'ALTEA_SMART_PRICE_XLSX_GZIP_B64',
  'ALTEA_GOOGLE_SERVICE_ACCOUNT_JSON',
  'GOOGLE_APPLICATION_CREDENTIALS_JSON',
  'GOOGLE_APPLICATION_CREDENTIALS'
];
const WB_SUBSTITUTION_SOURCE_ENV = [
  'ALTEA_WB_SUBSTITUTION_TRAFFIC_XLSX',
  'ALTEA_WB_SUBSTITUTION_TRAFFIC_XLSX_URL',
  'ALTEA_WB_SUBSTITUTION_TRAFFIC_XLSX_B64',
  'ALTEA_WB_SUBSTITUTION_TRAFFIC_XLSX_GZIP_B64'
];
const EXTRA_MARKETPLACE_SOURCE_GROUPS = [
  {
    platform: 'goldapple',
    requiredForPublish: false,
    sourceOptions: [
      {
        kind: 'workbook',
        requirements: [[
          'ALTEA_ZYA_SALES_XLSX',
          'ALTEA_ZYA_SALES_ZIP',
          'ALTEA_RETAIL_NETWORK_SALES_XLSX'
        ]]
      },
      {
        kind: 'api',
        requirements: [
          ['ALTEA_ZYA_API_TOKEN', 'ALTEA_ZYA_API_KEY', 'ALTEA_GOLDAPPLE_API_TOKEN', 'ALTEA_GOLDAPPLE_API_KEY'],
          ['ALTEA_ZYA_API_BASE_URL', 'ALTEA_GOLDAPPLE_API_BASE_URL'],
          ['ALTEA_ZYA_SALES_PATH', 'ALTEA_GOLDAPPLE_SALES_PATH']
        ]
      }
    ]
  },
  {
    platform: 'letu',
    requiredForPublish: false,
    sourceOptions: [
      {
        kind: 'workbook',
        requirements: [['ALTEA_LETUAL_LOCAL_EXPORT_XLSX', 'ALTEA_RETAIL_NETWORK_SALES_XLSX']]
      },
      {
        kind: 'api',
        requirements: [
          ['ALTEA_LETUAL_API_TOKEN'],
          ['ALTEA_LETUAL_API_BASE_URL'],
          ['ALTEA_LETUAL_SALES_PATH']
        ]
      }
    ]
  },
  {
    platform: 'megamarket',
    requiredForPublish: false,
    sourceOptions: [
      {
        kind: 'workbook',
        requirements: [['ALTEA_RETAIL_NETWORK_SALES_XLSX']]
      },
      {
        kind: 'api',
        requirements: [
          ['ALTEA_MEGAMARKET_API_TOKEN', 'ALTEA_MEGAMARKET_API_KEY'],
          ['ALTEA_MEGAMARKET_API_BASE_URL'],
          ['ALTEA_MEGAMARKET_SALES_PATH']
        ]
      }
    ]
  },
  {
    platform: 'samokat',
    requiredForPublish: false,
    sourceOptions: [
      {
        kind: 'api',
        requirements: [
          ['ALTEA_SAMOKAT_API_TOKEN', 'ALTEA_SAMOKAT_API_KEY'],
          ['ALTEA_SAMOKAT_API_BASE_URL'],
          ['ALTEA_SAMOKAT_SALES_PATH']
        ]
      }
    ]
  },
  {
    platform: 'magnit',
    requiredForPublish: false,
    sourceOptions: [
      {
        kind: 'workbook',
        requirements: [[
          'ALTEA_MAGNIT_SALES_XLSX',
          'ALTEA_MAGNIT_SALES_XLS',
          'ALTEA_MAGNIT_SALES_WORKBOOK',
          'ALTEA_MAGNIT_SALES_CSV',
          'ALTEA_RETAIL_NETWORK_SALES_XLSX'
        ]]
      },
      {
        kind: 'api',
        requirements: [
          ['ALTEA_MAGNIT_API_TOKEN', 'ALTEA_MAGNIT_API_KEY', 'ALTEA_MAGNIT_MARKET_API_TOKEN', 'ALTEA_MAGNIT_MARKET_API_KEY'],
          ['ALTEA_MAGNIT_API_BASE_URL', 'ALTEA_MAGNIT_MARKET_API_BASE_URL'],
          ['ALTEA_MAGNIT_SALES_PATH', 'ALTEA_MAGNIT_MARKET_SALES_PATH']
        ]
      }
    ]
  }
];

const SECRET_ALIASES = {
  SUPABASE_SERVICE_ROLE_KEY: ['ALTEA_SUPABASE_SERVICE_ROLE_KEY']
};

const CONFIG_ALIASES = {
  SUPABASE_URL: ['ALTEA_SUPABASE_URL']
};

const CONFIG_DEFAULTS = {
  SUPABASE_URL: DEFAULT_SUPABASE_URL
};

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      args[key] = next;
      index += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function utcNowIso() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function secretPresent(env, name) {
  return String(env[name] || '').trim().length > 0;
}

function resolveNamedValue(env, name, aliases = [], defaults = {}) {
  if (secretPresent(env, name)) return { present: true, source: name };
  for (const alias of aliases) {
    if (secretPresent(env, alias)) return { present: true, source: alias };
  }
  if (secretPresent(defaults, name)) return { present: true, source: 'default' };
  return { present: false, source: '' };
}

function buildPriceWorkbookSourceState(env = {}) {
  const presentSources = PRICE_WORKBOOK_SOURCE_ENV.filter((name) => secretPresent(env, name));
  return {
    requiredAnyOf: PRICE_WORKBOOK_SOURCE_ENV,
    present: presentSources.length > 0,
    presentSources,
    missingAnyOf: presentSources.length ? [] : PRICE_WORKBOOK_SOURCE_ENV
  };
}

function buildSourceOptionState(option = {}, env = {}) {
  const requirements = Array.isArray(option.requirements) ? option.requirements : [];
  const requirementStates = requirements.map((requiredAnyOf) => {
    const presentSources = requiredAnyOf.filter((name) => secretPresent(env, name));
    return {
      requiredAnyOf,
      present: presentSources.length > 0,
      presentSources,
      missingAnyOf: presentSources.length ? [] : requiredAnyOf
    };
  });
  return {
    kind: option.kind || 'source',
    present: requirementStates.length > 0 && requirementStates.every((item) => item.present),
    requirements: requirementStates
  };
}

function buildExtraMarketplaceSourceStates(env = {}) {
  return EXTRA_MARKETPLACE_SOURCE_GROUPS.map((group) => {
    const optionStates = group.sourceOptions.map((option) => buildSourceOptionState(option, env));
    const requiredAnyOf = [...new Set(group.sourceOptions.flatMap((option) => option.requirements.flat()))];
    const presentSources = requiredAnyOf.filter((name) => secretPresent(env, name));
    return {
      platform: group.platform,
      requiredForPublish: group.requiredForPublish === true,
      requiredAnyOf,
      sourceOptions: optionStates,
      present: optionStates.some((item) => item.present),
      presentSources,
      presentOptionKinds: optionStates.filter((item) => item.present).map((item) => item.kind),
      missingAnyOf: optionStates.some((item) => item.present) ? [] : requiredAnyOf
    };
  });
}

function buildWbSubstitutionSourceState(env = {}) {
  const presentSources = WB_SUBSTITUTION_SOURCE_ENV.filter((name) => secretPresent(env, name));
  return {
    requiredForPublish: false,
    requiredAnyOf: WB_SUBSTITUTION_SOURCE_ENV,
    present: presentSources.length > 0,
    presentSources,
    missingAnyOf: presentSources.length ? [] : WB_SUBSTITUTION_SOURCE_ENV
  };
}

function buildReport({ env = process.env, cutoffDate = '', revisionFrom = '', generatedAt = utcNowIso() } = {}) {
  const secretStates = REQUIRED_SECRETS.map((name) => ({
    name,
    ...resolveNamedValue(env, name, SECRET_ALIASES[name] || [])
  }));
  const configStates = REQUIRED_CONFIG.map((name) => ({
    name,
    ...resolveNamedValue(env, name, CONFIG_ALIASES[name] || [], CONFIG_DEFAULTS)
  }));
  const optionalSecretStates = OPTIONAL_SECRETS.map((name) => ({
    name,
    present: secretPresent(env, name),
    source: secretPresent(env, name) ? name : ''
  }));
  const missingSecrets = secretStates.filter((item) => !item.present).map((item) => item.name);
  const missingConfig = configStates.filter((item) => !item.present).map((item) => item.name);
  const optionalMissingSecrets = optionalSecretStates.filter((item) => !item.present).map((item) => item.name);
  const priceWorkbookSource = buildPriceWorkbookSourceState(env);
  const extraMarketplaceSources = buildExtraMarketplaceSourceStates(env);
  const missingExtraMarketplaceSources = extraMarketplaceSources.filter((item) => !item.present).map((item) => item.platform);
  const blockingExtraMarketplaceSources = extraMarketplaceSources
    .filter((item) => !item.present && item.requiredForPublish)
    .map((item) => item.platform);
  const wbSubstitutionSource = buildWbSubstitutionSourceState(env);
  const blockingReasons = [];
  if (missingSecrets.length) blockingReasons.push(`Missing required daily close secrets: ${missingSecrets.join(', ')}`);
  if (missingConfig.length) blockingReasons.push(`Missing required daily close config: ${missingConfig.join(', ')}`);
  if (!priceWorkbookSource.present) {
    blockingReasons.push(`Missing smart price workbook CI source: configure one of ${PRICE_WORKBOOK_SOURCE_ENV.join(', ')}`);
  }
  extraMarketplaceSources.filter((item) => !item.present && item.requiredForPublish).forEach((item) => {
    blockingReasons.push(`Missing ${item.platform} daily source: configure one of ${item.requiredAnyOf.join(', ')}`);
  });
  const sourceWarnings = extraMarketplaceSources
    .filter((item) => !item.present && !item.requiredForPublish)
    .map((item) => `Missing ${item.platform} daily source; existing facts will be preserved and marked stale until a complete source is configured`);
  if (!wbSubstitutionSource.present) {
    sourceWarnings.push('Missing WB substitution traffic refresh source; the last verified workbook will be preserved and freshness will remain visible');
  }
  const publishAllowed = blockingReasons.length === 0;
  const status = publishAllowed ? (sourceWarnings.length ? 'warning' : 'ok') : 'blocked';
  return {
    schema: 'portal-daily-close-preflight-v2',
    generatedAt,
    status,
    publish: {
      allowed: publishAllowed,
      blockingReasons
    },
    cutoffDate,
    revisionFrom,
    requiredSecrets: REQUIRED_SECRETS,
    requiredConfig: REQUIRED_CONFIG,
    optionalSecrets: OPTIONAL_SECRETS,
    presentSecretCount: secretStates.filter((item) => item.present).length,
    presentConfigCount: configStates.filter((item) => item.present).length,
    missingSecrets,
    missingConfig,
    optionalMissingSecrets,
    priceWorkbookSource,
    extraMarketplaceSources,
    missingExtraMarketplaceSources,
    blockingExtraMarketplaceSources,
    wbSubstitutionSource,
    sourceWarnings,
    resolvedSources: {
      secrets: Object.fromEntries(secretStates.map((item) => [item.name, item.source])),
      config: Object.fromEntries(configStates.map((item) => [item.name, item.source])),
      optionalSecrets: Object.fromEntries(optionalSecretStates.map((item) => [item.name, item.source]))
    },
    notes: [
      ...(optionalMissingSecrets.length
        ? ['Yandex Market campaign/business ids are optional: runtime discovers campaigns through ALTEA_YM_API_KEY when explicit ids are absent.']
        : []),
      ...(missingExtraMarketplaceSources.length
        ? ['Optional external marketplaces never borrow another platform source: missing channels preserve their last verified facts and remain explicitly stale.']
        : [])
    ]
  };
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function printBlockedReport(report, reportPath) {
  console.error('Daily close preflight blocked:');
  report.publish.blockingReasons.forEach((reason) => console.error(`- ${reason}`));
  if (report.missingSecrets.length) {
    console.error('Missing required daily close secrets:');
    report.missingSecrets.forEach((name) => console.error(`- ${name}`));
  }
  if (report.missingConfig.length) {
    console.error('Missing required daily close config:');
    report.missingConfig.forEach((name) => console.error(`- ${name}`));
  }
  if (!report.priceWorkbookSource.present) {
    console.error('Missing smart price workbook CI source. Configure one of:');
    report.priceWorkbookSource.requiredAnyOf.forEach((name) => console.error(`- ${name}`));
  }
  if (report.missingExtraMarketplaceSources.length) {
    console.error('Missing extra marketplace sources:');
    report.extraMarketplaceSources.filter((item) => !item.present).forEach((item) => {
      console.error(`- ${item.platform}: ${item.requiredAnyOf.join(', ')}`);
    });
  }
  console.error(`Preflight report: ${reportPath}`);
}

function main(argv = process.argv.slice(2), env = process.env) {
  const args = parseArgs(argv);
  const outputDir = path.resolve(String(args['output-dir'] || '.portal-truth-output'));
  const report = buildReport({
    env,
    cutoffDate: String(args['cutoff-date'] || ''),
    revisionFrom: String(args['revision-from'] || '')
  });
  const reportPath = path.join(outputDir, REPORT_NAME);
  writeJson(reportPath, report);

  if (report.publish.allowed !== true) {
    printBlockedReport(report, reportPath);
    return 1;
  }

  if (report.sourceWarnings.length) {
    console.warn('Daily close preflight passed with non-blocking source warnings:');
    report.sourceWarnings.forEach((warning) => console.warn(`- ${warning}`));
  }
  console.log(`Daily close secret preflight passed. Report: ${reportPath}`);
  return 0;
}

module.exports = {
  DEFAULT_SUPABASE_URL,
  OPTIONAL_SECRETS,
  EXTRA_MARKETPLACE_SOURCE_GROUPS,
  PRICE_WORKBOOK_SOURCE_ENV,
  WB_SUBSTITUTION_SOURCE_ENV,
  REQUIRED_CONFIG,
  REPORT_NAME,
  REQUIRED_SECRETS,
  buildExtraMarketplaceSourceStates,
  buildPriceWorkbookSourceState,
  buildSourceOptionState,
  buildReport,
  buildWbSubstitutionSourceState,
  main,
  parseArgs,
  printBlockedReport
};

if (require.main === module) {
  process.exitCode = main();
}
