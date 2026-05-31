#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const WB_FEEDBACKS_API_BASE_URL = 'https://feedbacks-api.wildberries.ru';
const WB_FEEDBACKS_DOCS_URL = 'https://dev.wildberries.ru/en/docs/openapi/user-communication';
const DEFAULT_OUTPUT_FILE = 'wb_feedbacks_summary.json';
const MOSCOW_OFFSET = '+03:00';

function parseArgs(argv) {
  const args = { command: 'sync' };
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--') && index === 2) {
      args.command = token;
      continue;
    }
    if (token === '--dry-run') {
      args.dryRun = true;
      continue;
    }
    if (token === '--mirror-local-fallback') {
      args.mirrorLocalFallback = true;
      continue;
    }
    const [rawKey, inlineValue] = token.split('=');
    if (!rawKey.startsWith('--')) continue;
    const key = rawKey.replace(/^--/, '');
    const nextValue = inlineValue !== undefined ? inlineValue : argv[index + 1];
    if (inlineValue === undefined) index += 1;
    args[key] = nextValue;
  }
  return args;
}

function readJson(filePath, fallback = null) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_error) {
    return fallback;
  }
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function numberOrZero(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round(value, digits = 4) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const factor = 10 ** digits;
  return Math.round(numeric * factor) / factor;
}

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase();
}

function compactText(value, maxLength = 360) {
  const text = normalizeText(value).replace(/\s+/g, ' ');
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trim()}...`;
}

function todayIso() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isoDate(value) {
  if (!value) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const raw = String(value).trim();
  const direct = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (direct) return `${direct[1]}-${direct[2]}-${direct[3]}`;
  const stamp = Date.parse(raw);
  return Number.isFinite(stamp) ? new Date(stamp).toISOString().slice(0, 10) : '';
}

function addDays(dateKey, delta) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

function monthStart(dateKey) {
  return `${String(dateKey || todayIso()).slice(0, 7)}-01`;
}

function toUnixStart(dateKey) {
  return Math.floor(Date.parse(`${dateKey}T00:00:00${MOSCOW_OFFSET}`) / 1000);
}

function toUnixEnd(dateKey) {
  return Math.floor(Date.parse(`${dateKey}T23:59:59${MOSCOW_OFFSET}`) / 1000);
}

function average(sum, count) {
  return count > 0 ? round(sum / count, 3) : null;
}

function buildSkuLookups(skus) {
  const byArticle = new Map();
  const byArticleKey = new Map();
  const byNmId = new Map();
  for (const sku of Array.isArray(skus) ? skus : []) {
    const article = normalizeKey(sku?.article);
    const articleKey = normalizeKey(sku?.articleKey);
    const nmCandidates = [
      sku?.nmId,
      sku?.nmID,
      sku?.wbNmId,
      sku?.wb?.nmId,
      sku?.wb?.nmID,
      sku?.article
    ];
    if (article) byArticle.set(article, sku);
    if (articleKey) byArticleKey.set(articleKey, sku);
    for (const candidate of nmCandidates) {
      const nmId = String(Math.trunc(numberOrZero(candidate)));
      if (nmId && nmId !== '0') byNmId.set(nmId, sku);
    }
  }
  return { byArticle, byArticleKey, byNmId };
}

function matchSku(productDetails = {}, lookups) {
  const supplierArticle = normalizeKey(productDetails?.supplierArticle);
  const nmId = String(Math.trunc(numberOrZero(productDetails?.nmId || productDetails?.nmID)));
  return lookups.byArticleKey.get(supplierArticle)
    || lookups.byArticle.get(supplierArticle)
    || lookups.byNmId.get(nmId)
    || null;
}

function resolveOptions(args) {
  const baseDataDir = path.resolve(args['base-data-dir'] || path.join(process.cwd(), 'data'));
  const inputDir = path.resolve(args['input-dir'] || baseDataDir);
  const outputDir = path.resolve(args['output-dir'] || inputDir);
  const mirrorDataDir = path.resolve(args['mirror-data-dir'] || process.env.ALTEA_PORTAL_FALLBACK_DIR || baseDataDir);
  const to = isoDate(args.to || args['date-to'] || todayIso());
  const defaultDays = Number.isFinite(Number(args.days)) ? Number(args.days) : 30;
  const from = isoDate(args.from || args['date-from'] || addDays(to, -Math.max(1, defaultDays) + 1));
  const take = Math.min(Math.max(1, Number(args.take) || 5000), 5000);
  return {
    command: args.command || 'sync',
    dryRun: Boolean(args.dryRun),
    token: args.token
      || process.env.ALTEA_WB_FEEDBACKS_TOKEN
      || process.env.ALTEA_WB_PROMOTION_TOKEN
      || process.env.ALTEA_WB_API_TOKEN
      || '',
    apiBaseUrl: String(args['api-base-url'] || process.env.ALTEA_WB_FEEDBACKS_API_BASE_URL || WB_FEEDBACKS_API_BASE_URL).replace(/\/+$/, ''),
    baseDataDir,
    inputDir,
    outputDir,
    mirrorDataDir,
    mirrorLocalFallback: Boolean(args.mirrorLocalFallback),
    from,
    to,
    monthKey: String(to).slice(0, 7),
    currentMonthFrom: monthStart(to),
    last7From: addDays(to, -6),
    take,
    maxFeedbacks: Number.isFinite(Number(args['max-feedbacks'])) ? Number(args['max-feedbacks']) : 50000,
    maxQuestions: Number.isFinite(Number(args['max-questions'])) ? Number(args['max-questions']) : 20000,
    requestDelayMs: Number.isFinite(Number(args['request-delay-ms'])) ? Number(args['request-delay-ms']) : 420,
    docsUrl: WB_FEEDBACKS_DOCS_URL
  };
}

async function sleep(ms) {
  if (!ms) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function wbRequest(options, apiPath, requestOptions = {}, attempt = 0) {
  const url = new URL(`${options.apiBaseUrl}${apiPath}`);
  Object.entries(requestOptions.query || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  });
  const method = requestOptions.method || 'GET';
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: options.token,
      Accept: 'application/json',
      'Content-Type': 'application/json; charset=utf-8'
    },
    body: requestOptions.body === undefined ? undefined : JSON.stringify(requestOptions.body)
  });
  const text = await response.text();
  if (!response.ok) {
    if (response.status === 429 && attempt < 5) {
      const retryAfter = Number(response.headers.get('retry-after'));
      const delayMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : Math.max(2000, options.requestDelayMs * 4);
      await sleep(delayMs);
      return wbRequest(options, apiPath, requestOptions, attempt + 1);
    }
    throw new Error(`WB API ${method} ${apiPath} failed: HTTP ${response.status} ${text.slice(0, 500)}`);
  }
  if (!text.trim()) return null;
  return JSON.parse(text);
}

async function safeWbRequest(options, apiPath, requestOptions, diagnostics, label) {
  try {
    const payload = await wbRequest(options, apiPath, requestOptions);
    await sleep(options.requestDelayMs);
    return payload;
  } catch (error) {
    diagnostics.warnings.push(`${label}: ${error.message}`);
    await sleep(options.requestDelayMs);
    return null;
  }
}

function extractList(payload, kind) {
  const listKey = kind === 'feedbacks' ? 'feedbacks' : 'questions';
  if (Array.isArray(payload?.data?.[listKey])) return payload.data[listKey];
  if (Array.isArray(payload?.[listKey])) return payload[listKey];
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload)) return payload;
  return [];
}

async function fetchPagedList(options, diagnostics, kind, isAnswered) {
  const apiPath = kind === 'feedbacks' ? '/api/v1/feedbacks' : '/api/v1/questions';
  const limit = kind === 'feedbacks' ? options.maxFeedbacks : options.maxQuestions;
  const maxSkip = kind === 'feedbacks' ? 199990 : 10000;
  const rows = [];
  let skip = 0;
  while (rows.length < limit && skip <= maxSkip) {
    const take = Math.min(options.take, limit - rows.length);
    const payload = await safeWbRequest(options, apiPath, {
      query: {
        isAnswered,
        take,
        skip,
        order: 'dateDesc',
        dateFrom: toUnixStart(options.from),
        dateTo: toUnixEnd(options.to)
      }
    }, diagnostics, `${kind} ${isAnswered ? 'answered' : 'unanswered'} skip=${skip}`);
    const pageRows = extractList(payload, kind).map((row) => ({
      ...row,
      __isAnsweredQuery: Boolean(isAnswered)
    }));
    rows.push(...pageRows);
    diagnostics.requests += 1;
    if (pageRows.length < take) break;
    skip += take;
  }
  if (rows.length >= limit) diagnostics.warnings.push(`${kind} ${isAnswered ? 'answered' : 'unanswered'} truncated at ${limit} rows`);
  return rows;
}

async function fetchCounts(options, diagnostics) {
  const counts = {
    feedbacksUnansweredNow: null,
    feedbacksUnansweredToday: null,
    feedbacksAnsweredWindow: null,
    feedbacksUnansweredWindow: null,
    questionsAnsweredWindow: null,
    questionsUnansweredWindow: null,
    sellerRating: null
  };
  const unanswered = await safeWbRequest(options, '/api/v1/feedbacks/count-unanswered', {}, diagnostics, 'feedbacks unanswered count');
  if (unanswered?.data) {
    counts.feedbacksUnansweredNow = numberOrNull(unanswered.data.countUnanswered);
    counts.feedbacksUnansweredToday = numberOrNull(unanswered.data.countUnansweredToday);
  }
  for (const [target, apiPath, isAnswered] of [
    ['feedbacksAnsweredWindow', '/api/v1/feedbacks/count', true],
    ['feedbacksUnansweredWindow', '/api/v1/feedbacks/count', false],
    ['questionsAnsweredWindow', '/api/v1/questions/count', true],
    ['questionsUnansweredWindow', '/api/v1/questions/count', false]
  ]) {
    const payload = await safeWbRequest(options, apiPath, {
      query: {
        isAnswered,
        dateFrom: toUnixStart(options.from),
        dateTo: toUnixEnd(options.to)
      }
    }, diagnostics, `${target} count`);
    counts[target] = numberOrNull(payload?.data);
  }
  const rating = await safeWbRequest(options, '/api/common/v1/rating', {}, diagnostics, 'seller rating');
  if (rating && typeof rating === 'object' && !rating.error) {
    counts.sellerRating = {
      valuation: numberOrNull(rating.valuation),
      feedbackCount: numberOrNull(rating.feedbackCount)
    };
  }
  return counts;
}

function normalizeFeedback(row, lookups) {
  const details = row?.productDetails || {};
  const sku = matchSku(details, lookups);
  const valuation = numberOrNull(row?.productValuation);
  const answered = row?.__isAnsweredQuery !== undefined ? Boolean(row.__isAnsweredQuery) : Boolean(row?.answer);
  const supplierFeedbackValuation = numberOrNull(row?.supplierFeedbackValuation);
  const supplierProductValuation = numberOrNull(row?.supplierProductValuation);
  const reviewPoints = Math.max(0, numberOrZero(supplierFeedbackValuation));
  return {
    id: normalizeText(row?.id),
    createdDate: normalizeText(row?.createdDate),
    date: isoDate(row?.createdDate),
    answered,
    state: normalizeText(row?.state),
    wasViewed: Boolean(row?.wasViewed),
    nmId: numberOrNull(details?.nmId || details?.nmID),
    supplierArticle: normalizeText(details?.supplierArticle),
    articleKey: normalizeText(sku?.articleKey || sku?.article || details?.supplierArticle),
    productName: normalizeText(details?.productName || sku?.name),
    brandName: normalizeText(details?.brandName || sku?.brand),
    valuation,
    isLowRating: valuation !== null && valuation <= 3,
    textSnippet: compactText([row?.text, row?.pros, row?.cons].filter(Boolean).join(' ')),
    hasText: Boolean(normalizeText(row?.text || row?.pros || row?.cons)),
    tags: Array.isArray(row?.bables) ? row.bables.map(normalizeText).filter(Boolean) : [],
    orderStatus: normalizeText(row?.orderStatus),
    photoCount: Array.isArray(row?.photoLinks) ? row.photoLinks.length : 0,
    hasVideo: Boolean(row?.video),
    supplierFeedbackValuation,
    supplierProductValuation,
    reviewPoints,
    hasReviewPoints: reviewPoints > 0
  };
}

function normalizeQuestion(row, lookups) {
  const details = row?.productDetails || {};
  const sku = matchSku(details, lookups);
  const answered = row?.__isAnsweredQuery !== undefined ? Boolean(row.__isAnsweredQuery) : Boolean(row?.answer);
  return {
    id: normalizeText(row?.id),
    createdDate: normalizeText(row?.createdDate),
    date: isoDate(row?.createdDate),
    answered,
    state: normalizeText(row?.state),
    wasViewed: Boolean(row?.wasViewed),
    isWarned: Boolean(row?.isWarned),
    nmId: numberOrNull(details?.nmId || details?.nmID),
    supplierArticle: normalizeText(details?.supplierArticle),
    articleKey: normalizeText(sku?.articleKey || sku?.article || details?.supplierArticle),
    productName: normalizeText(details?.productName || sku?.name),
    brandName: normalizeText(details?.brandName || sku?.brand),
    textSnippet: compactText(row?.text)
  };
}

function emptyCardBucket(item = {}) {
  return {
    nmId: item.nmId ?? null,
    supplierArticle: item.supplierArticle || '',
    articleKey: item.articleKey || item.supplierArticle || '',
    productName: item.productName || '',
    brandName: item.brandName || '',
    portalRating: item.portalRating ?? null,
    portalReviews: item.portalReviews ?? null,
    feedbackCount: 0,
    answeredFeedbackCount: 0,
    unansweredFeedbackCount: 0,
    lowRatingCount: 0,
    reviewPoints: 0,
    reviewPointsFeedbackCount: 0,
    ratingCount: 0,
    ratingSum: 0,
    monthFeedbackCount: 0,
    monthReviewPoints: 0,
    monthReviewPointsFeedbackCount: 0,
    monthRatingCount: 0,
    monthRatingSum: 0,
    last7FeedbackCount: 0,
    last7ReviewPoints: 0,
    last7ReviewPointsFeedbackCount: 0,
    last7RatingCount: 0,
    last7RatingSum: 0,
    questionCount: 0,
    answeredQuestionCount: 0,
    unansweredQuestionCount: 0,
    lastFeedbackDate: '',
    lastQuestionDate: '',
    tagCounts: new Map()
  };
}

function skuPortalMeta(item, skusByArticle) {
  const key = normalizeKey(item.articleKey || item.supplierArticle);
  const sku = skusByArticle.get(key) || null;
  return {
    portalRating: numberOrNull(sku?.rating),
    portalReviews: numberOrNull(sku?.reviews),
    productName: item.productName || normalizeText(sku?.name),
    brandName: item.brandName || normalizeText(sku?.brand),
    articleKey: item.articleKey || normalizeText(sku?.articleKey || sku?.article)
  };
}

function cardIdentityKey(item = {}) {
  const nmId = numberOrNull(item.nmId || item.nmID);
  if (nmId !== null) return `nm:${Math.trunc(nmId)}`;
  const articleKey = normalizeKey(item.articleKey || item.supplierArticle);
  return articleKey ? `article:${articleKey}` : '';
}

function buildCards(feedbacks, questions, skus, options, previousSnapshot) {
  const skusByArticle = new Map();
  for (const sku of Array.isArray(skus) ? skus : []) {
    const articleKey = normalizeKey(sku?.articleKey);
    const article = normalizeKey(sku?.article);
    if (articleKey) skusByArticle.set(articleKey, sku);
    if (article) skusByArticle.set(article, sku);
  }
  const buckets = new Map();
  const cardKey = (item) => String(item.nmId || normalizeKey(item.articleKey || item.supplierArticle));
  const ensure = (item) => {
    const key = cardKey(item);
    if (!key || key === '0') return null;
    const portalMeta = skuPortalMeta(item, skusByArticle);
    if (!buckets.has(key)) {
      buckets.set(key, emptyCardBucket({ ...item, ...portalMeta }));
    } else {
      const bucket = buckets.get(key);
      if (!bucket.articleKey && portalMeta.articleKey) bucket.articleKey = portalMeta.articleKey;
      if (!bucket.productName && portalMeta.productName) bucket.productName = portalMeta.productName;
      if (!bucket.brandName && portalMeta.brandName) bucket.brandName = portalMeta.brandName;
      if (bucket.portalRating === null && portalMeta.portalRating !== null) bucket.portalRating = portalMeta.portalRating;
      if (bucket.portalReviews === null && portalMeta.portalReviews !== null) bucket.portalReviews = portalMeta.portalReviews;
    }
    return buckets.get(key);
  };

  for (const feedback of feedbacks) {
    const bucket = ensure(feedback);
    if (!bucket) continue;
    bucket.feedbackCount += 1;
    if (feedback.answered) bucket.answeredFeedbackCount += 1;
    else bucket.unansweredFeedbackCount += 1;
    if (feedback.isLowRating) bucket.lowRatingCount += 1;
    if (feedback.reviewPoints > 0) {
      bucket.reviewPoints += feedback.reviewPoints;
      bucket.reviewPointsFeedbackCount += 1;
    }
    if (feedback.valuation !== null) {
      bucket.ratingCount += 1;
      bucket.ratingSum += feedback.valuation;
    }
    if (feedback.date >= options.currentMonthFrom) {
      bucket.monthFeedbackCount += 1;
      if (feedback.reviewPoints > 0) {
        bucket.monthReviewPoints += feedback.reviewPoints;
        bucket.monthReviewPointsFeedbackCount += 1;
      }
      if (feedback.valuation !== null) {
        bucket.monthRatingCount += 1;
        bucket.monthRatingSum += feedback.valuation;
      }
    }
    if (feedback.date >= options.last7From) {
      bucket.last7FeedbackCount += 1;
      if (feedback.reviewPoints > 0) {
        bucket.last7ReviewPoints += feedback.reviewPoints;
        bucket.last7ReviewPointsFeedbackCount += 1;
      }
      if (feedback.valuation !== null) {
        bucket.last7RatingCount += 1;
        bucket.last7RatingSum += feedback.valuation;
      }
    }
    if (feedback.date > bucket.lastFeedbackDate) bucket.lastFeedbackDate = feedback.date;
    for (const tag of feedback.tags || []) {
      bucket.tagCounts.set(tag, (bucket.tagCounts.get(tag) || 0) + 1);
    }
  }

  for (const question of questions) {
    const bucket = ensure(question);
    if (!bucket) continue;
    bucket.questionCount += 1;
    if (question.answered) bucket.answeredQuestionCount += 1;
    else bucket.unansweredQuestionCount += 1;
    if (question.date > bucket.lastQuestionDate) bucket.lastQuestionDate = question.date;
  }

  const previousCards = new Map((previousSnapshot?.cards || []).map((card) => [String(card.nmId || normalizeKey(card.articleKey)), card]));
  return [...buckets.values()].map((bucket) => {
    const avgRating = average(bucket.ratingSum, bucket.ratingCount);
    const previous = previousCards.get(String(bucket.nmId || normalizeKey(bucket.articleKey))) || null;
    const previousAvgRating = numberOrNull(previous?.avgRating);
    const topTags = [...bucket.tagCounts.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], 'ru'))
      .slice(0, 5)
      .map(([tag, count]) => ({ tag, count }));
    return {
      nmId: bucket.nmId,
      articleKey: bucket.articleKey,
      supplierArticle: bucket.supplierArticle,
      productName: bucket.productName,
      brandName: bucket.brandName,
      portalRating: bucket.portalRating,
      portalReviews: bucket.portalReviews,
      avgRating,
      ratingDeltaVsPortal: avgRating !== null && bucket.portalRating !== null ? round(avgRating - bucket.portalRating, 3) : null,
      previousAvgRating,
      ratingDeltaVsPrevious: avgRating !== null && previousAvgRating !== null ? round(avgRating - previousAvgRating, 3) : null,
      ratingFeedbackCount: bucket.ratingCount,
      monthAvgRating: average(bucket.monthRatingSum, bucket.monthRatingCount),
      last7AvgRating: average(bucket.last7RatingSum, bucket.last7RatingCount),
      feedbackCount: bucket.feedbackCount,
      monthFeedbackCount: bucket.monthFeedbackCount,
      last7FeedbackCount: bucket.last7FeedbackCount,
      answeredFeedbackCount: bucket.answeredFeedbackCount,
      unansweredFeedbackCount: bucket.unansweredFeedbackCount,
      lowRatingCount: bucket.lowRatingCount,
      reviewPoints: round(bucket.reviewPoints, 2),
      reviewPointsFeedbackCount: bucket.reviewPointsFeedbackCount,
      monthReviewPoints: round(bucket.monthReviewPoints, 2),
      monthReviewPointsFeedbackCount: bucket.monthReviewPointsFeedbackCount,
      last7ReviewPoints: round(bucket.last7ReviewPoints, 2),
      last7ReviewPointsFeedbackCount: bucket.last7ReviewPointsFeedbackCount,
      questionCount: bucket.questionCount,
      answeredQuestionCount: bucket.answeredQuestionCount,
      unansweredQuestionCount: bucket.unansweredQuestionCount,
      lastFeedbackDate: bucket.lastFeedbackDate,
      lastQuestionDate: bucket.lastQuestionDate,
      topTags
    };
  }).sort((left, right) => {
    const leftRisk = (left.unansweredFeedbackCount * 5) + (left.unansweredQuestionCount * 4) + (left.lowRatingCount * 3) - numberOrZero(left.ratingDeltaVsPrevious);
    const rightRisk = (right.unansweredFeedbackCount * 5) + (right.unansweredQuestionCount * 4) + (right.lowRatingCount * 3) - numberOrZero(right.ratingDeltaVsPrevious);
    return rightRisk - leftRisk || numberOrZero(right.feedbackCount) - numberOrZero(left.feedbackCount);
  });
}

function buildDaily(feedbacks, questions, options) {
  const buckets = new Map();
  const ensure = (date) => {
    if (!buckets.has(date)) {
      buckets.set(date, {
        date,
        feedbacks: 0,
        answeredFeedbacks: 0,
        unansweredFeedbacks: 0,
        lowRatingFeedbacks: 0,
        reviewPoints: 0,
        reviewPointsFeedbacks: 0,
        ratingSum: 0,
        ratingCount: 0,
        questions: 0,
        answeredQuestions: 0,
        unansweredQuestions: 0
      });
    }
    return buckets.get(date);
  };
  let cursor = options.from;
  while (cursor <= options.to) {
    ensure(cursor);
    cursor = addDays(cursor, 1);
  }
  for (const feedback of feedbacks) {
    const bucket = ensure(feedback.date);
    bucket.feedbacks += 1;
    if (feedback.answered) bucket.answeredFeedbacks += 1;
    else bucket.unansweredFeedbacks += 1;
    if (feedback.isLowRating) bucket.lowRatingFeedbacks += 1;
    if (feedback.reviewPoints > 0) {
      bucket.reviewPoints += feedback.reviewPoints;
      bucket.reviewPointsFeedbacks += 1;
    }
    if (feedback.valuation !== null) {
      bucket.ratingSum += feedback.valuation;
      bucket.ratingCount += 1;
    }
  }
  for (const question of questions) {
    const bucket = ensure(question.date);
    bucket.questions += 1;
    if (question.answered) bucket.answeredQuestions += 1;
    else bucket.unansweredQuestions += 1;
  }
  return [...buckets.values()].sort((left, right) => left.date.localeCompare(right.date)).map((bucket) => ({
    date: bucket.date,
    feedbacks: bucket.feedbacks,
    answeredFeedbacks: bucket.answeredFeedbacks,
    unansweredFeedbacks: bucket.unansweredFeedbacks,
    lowRatingFeedbacks: bucket.lowRatingFeedbacks,
    reviewPoints: round(bucket.reviewPoints, 2),
    reviewPointsFeedbacks: bucket.reviewPointsFeedbacks,
    avgRating: average(bucket.ratingSum, bucket.ratingCount),
    questions: bucket.questions,
    answeredQuestions: bucket.answeredQuestions,
    unansweredQuestions: bucket.unansweredQuestions
  }));
}

function buildCardRatingDynamics(feedbacks, cards, options) {
  const dates = [];
  let cursor = options.from;
  while (cursor <= options.to) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
  }

  const cardMetaByKey = new Map();
  for (const card of Array.isArray(cards) ? cards : []) {
    const key = cardIdentityKey(card);
    if (key) cardMetaByKey.set(key, card);
  }

  const buckets = new Map();
  const ensureBucket = (item) => {
    const key = cardIdentityKey(item);
    if (!key) return null;
    if (!buckets.has(key)) {
      const meta = cardMetaByKey.get(key) || item || {};
      buckets.set(key, {
        key,
        nmId: meta.nmId ?? item?.nmId ?? null,
        articleKey: meta.articleKey || item?.articleKey || '',
        supplierArticle: meta.supplierArticle || item?.supplierArticle || '',
        productName: meta.productName || item?.productName || '',
        brandName: meta.brandName || item?.brandName || '',
        portalRating: meta.portalRating ?? null,
        portalReviews: meta.portalReviews ?? null,
        feedbackCount: 0,
        ratingCount: 0,
        ratingSum: 0,
        lowRatingCount: 0,
        reviewPoints: 0,
        reviewPointsFeedbackCount: 0,
        byDate: new Map()
      });
    }
    return buckets.get(key);
  };
  const ensureDay = (bucket, date) => {
    if (!bucket.byDate.has(date)) {
      bucket.byDate.set(date, {
        date,
        feedbacks: 0,
        ratingFeedbacks: 0,
        ratingSum: 0,
        lowRatingFeedbacks: 0,
        reviewPoints: 0,
        reviewPointsFeedbacks: 0
      });
    }
    return bucket.byDate.get(date);
  };

  for (const feedback of Array.isArray(feedbacks) ? feedbacks : []) {
    if (!feedback?.date || feedback.date < options.from || feedback.date > options.to) continue;
    const bucket = ensureBucket(feedback);
    if (!bucket) continue;
    const day = ensureDay(bucket, feedback.date);
    bucket.feedbackCount += 1;
    day.feedbacks += 1;
    if (feedback.valuation !== null) {
      bucket.ratingCount += 1;
      bucket.ratingSum += feedback.valuation;
      day.ratingFeedbacks += 1;
      day.ratingSum += feedback.valuation;
    }
    if (feedback.isLowRating) {
      bucket.lowRatingCount += 1;
      day.lowRatingFeedbacks += 1;
    }
    if (feedback.reviewPoints > 0) {
      bucket.reviewPoints += feedback.reviewPoints;
      bucket.reviewPointsFeedbackCount += 1;
      day.reviewPoints += feedback.reviewPoints;
      day.reviewPointsFeedbacks += 1;
    }
  }

  const rows = [...buckets.values()].map((bucket) => {
    let runningRatingSum = 0;
    let runningRatingCount = 0;
    let firstDate = '';
    let firstRating = null;
    let latestDate = '';
    let latestRating = null;
    const history = dates.map((date) => {
      const day = bucket.byDate.get(date) || {
        date,
        feedbacks: 0,
        ratingFeedbacks: 0,
        ratingSum: 0,
        lowRatingFeedbacks: 0,
        reviewPoints: 0,
        reviewPointsFeedbacks: 0
      };
      if (day.ratingFeedbacks > 0) {
        runningRatingSum += day.ratingSum;
        runningRatingCount += day.ratingFeedbacks;
      }
      const cumulativeAvgRating = average(runningRatingSum, runningRatingCount);
      if (cumulativeAvgRating !== null && firstRating === null) {
        firstDate = date;
        firstRating = cumulativeAvgRating;
      }
      if (cumulativeAvgRating !== null) {
        latestDate = date;
        latestRating = cumulativeAvgRating;
      }
      return {
        date,
        avgRating: average(day.ratingSum, day.ratingFeedbacks),
        cumulativeAvgRating,
        feedbacks: day.feedbacks,
        ratingFeedbacks: day.ratingFeedbacks,
        lowRatingFeedbacks: day.lowRatingFeedbacks,
        reviewPoints: round(day.reviewPoints, 2),
        reviewPointsFeedbacks: day.reviewPointsFeedbacks
      };
    });
    const last7StartPoint = history.find((point) => point.date >= options.last7From && point.cumulativeAvgRating !== null) || null;
    return {
      nmId: bucket.nmId,
      articleKey: bucket.articleKey,
      supplierArticle: bucket.supplierArticle,
      productName: bucket.productName,
      brandName: bucket.brandName,
      portalRating: bucket.portalRating,
      portalReviews: bucket.portalReviews,
      firstDate,
      latestDate,
      firstRating,
      latestRating,
      ratingDelta: firstRating !== null && latestRating !== null ? round(latestRating - firstRating, 3) : null,
      last7RatingDelta: latestRating !== null && last7StartPoint?.cumulativeAvgRating !== null ? round(latestRating - last7StartPoint.cumulativeAvgRating, 3) : null,
      feedbackCount: bucket.feedbackCount,
      ratingCount: bucket.ratingCount,
      lowRatingCount: bucket.lowRatingCount,
      reviewPoints: round(bucket.reviewPoints, 2),
      reviewPointsFeedbackCount: bucket.reviewPointsFeedbackCount,
      history
    };
  }).filter((row) => row.feedbackCount > 0 || row.ratingCount > 0);

  const sortedRows = rows.sort((left, right) => {
    const leftDelta = numberOrZero(left.ratingDelta);
    const rightDelta = numberOrZero(right.ratingDelta);
    const leftRisk = (leftDelta < 0 ? Math.abs(leftDelta) * 100 : 0)
      + numberOrZero(left.lowRatingCount) * 2
      + numberOrZero(left.feedbackCount) / 1000;
    const rightRisk = (rightDelta < 0 ? Math.abs(rightDelta) * 100 : 0)
      + numberOrZero(right.lowRatingCount) * 2
      + numberOrZero(right.feedbackCount) / 1000;
    return rightRisk - leftRisk || numberOrZero(right.feedbackCount) - numberOrZero(left.feedbackCount);
  });
  const threshold = 0.005;
  const cardsWithGrowth = sortedRows.filter((row) => numberOrZero(row.ratingDelta) > threshold).length;
  const cardsWithDrop = sortedRows.filter((row) => numberOrZero(row.ratingDelta) < -threshold).length;
  const compactRow = (row) => ({
    nmId: row.nmId,
    articleKey: row.articleKey,
    supplierArticle: row.supplierArticle,
    productName: row.productName,
    firstDate: row.firstDate,
    latestDate: row.latestDate,
    firstRating: row.firstRating,
    latestRating: row.latestRating,
    ratingDelta: row.ratingDelta,
    last7RatingDelta: row.last7RatingDelta,
    feedbackCount: row.feedbackCount,
    ratingCount: row.ratingCount,
    lowRatingCount: row.lowRatingCount,
    reviewPoints: row.reviewPoints,
    reviewPointsFeedbackCount: row.reviewPointsFeedbackCount
  });

  return {
    source: 'wb-feedbacks-api-productValuation',
    basis: 'cumulative_card_rating_by_feedback_createdDate',
    dates,
    historyDays: dates.length,
    cardsObserved: sortedRows.length,
    cardsWithGrowth,
    cardsWithDrop,
    cardsFlat: Math.max(0, sortedRows.length - cardsWithGrowth - cardsWithDrop),
    topDrops: sortedRows
      .filter((row) => numberOrZero(row.ratingDelta) < -threshold)
      .sort((left, right) => numberOrZero(left.ratingDelta) - numberOrZero(right.ratingDelta))
      .slice(0, 20)
      .map(compactRow),
    topGrowth: sortedRows
      .filter((row) => numberOrZero(row.ratingDelta) > threshold)
      .sort((left, right) => numberOrZero(right.ratingDelta) - numberOrZero(left.ratingDelta))
      .slice(0, 20)
      .map(compactRow),
    matrix: sortedRows.slice(0, 300)
  };
}

function summarizeRows(rows, predicate = () => true) {
  const selected = rows.filter(predicate);
  const ratingRows = selected.filter((row) => row.valuation !== null);
  return {
    count: selected.length,
    answered: selected.filter((row) => row.answered).length,
    unanswered: selected.filter((row) => !row.answered).length,
    lowRating: selected.filter((row) => row.isLowRating).length,
    reviewPoints: round(selected.reduce((sum, row) => sum + numberOrZero(row.reviewPoints), 0), 2),
    reviewPointsFeedbacks: selected.filter((row) => numberOrZero(row.reviewPoints) > 0).length,
    avgRating: average(ratingRows.reduce((sum, row) => sum + row.valuation, 0), ratingRows.length)
  };
}

function summarizeQuestions(rows, predicate = () => true) {
  const selected = rows.filter(predicate);
  return {
    count: selected.length,
    answered: selected.filter((row) => row.answered).length,
    unanswered: selected.filter((row) => !row.answered).length
  };
}

function latestPreviousSnapshot(previousPayload, to) {
  const history = Array.isArray(previousPayload?.history) ? previousPayload.history : [];
  return history
    .filter((entry) => normalizeText(entry?.date) && normalizeText(entry.date) < to)
    .sort((left, right) => String(right.date).localeCompare(String(left.date)))[0] || null;
}

function buildSnapshotRatingHistory(history, cards) {
  const dates = [...new Set((Array.isArray(history) ? history : [])
    .map((entry) => normalizeText(entry?.date))
    .filter(Boolean))]
    .sort((left, right) => left.localeCompare(right));
  if (!dates.length) {
    return {
      source: 'portal-daily-snapshots',
      dates: [],
      historyDays: 0,
      cardsObserved: 0,
      matrix: []
    };
  }

  const cardMetaByKey = new Map();
  for (const card of Array.isArray(cards) ? cards : []) {
    const key = cardIdentityKey(card);
    if (key) cardMetaByKey.set(key, card);
  }

  const rowsByKey = new Map();
  const ensureRow = (card) => {
    const key = cardIdentityKey(card);
    if (!key) return null;
    if (!rowsByKey.has(key)) {
      const meta = cardMetaByKey.get(key) || card || {};
      rowsByKey.set(key, {
        nmId: meta.nmId ?? card?.nmId ?? null,
        articleKey: meta.articleKey || card?.articleKey || '',
        supplierArticle: meta.supplierArticle || card?.supplierArticle || '',
        productName: meta.productName || card?.productName || '',
        brandName: meta.brandName || card?.brandName || '',
        points: new Map()
      });
    }
    return rowsByKey.get(key);
  };

  for (const entry of Array.isArray(history) ? history : []) {
    const date = normalizeText(entry?.date);
    if (!date) continue;
    for (const card of Array.isArray(entry?.cards) ? entry.cards : []) {
      const row = ensureRow(card);
      const avgRating = numberOrNull(card?.avgRating);
      if (!row || avgRating === null) continue;
      row.points.set(date, {
        date,
        avgRating,
        feedbackCount: numberOrZero(card?.feedbackCount),
        lowRatingCount: numberOrZero(card?.lowRatingCount),
        reviewPoints: round(numberOrZero(card?.reviewPoints), 2)
      });
    }
  }

  const matrix = [...rowsByKey.values()].map((row) => {
    const series = dates.map((date) => row.points.get(date) || {
      date,
      avgRating: null,
      feedbackCount: 0,
      lowRatingCount: 0,
      reviewPoints: 0
    });
    const first = series.find((point) => point.avgRating !== null) || null;
    const latest = series.slice().reverse().find((point) => point.avgRating !== null) || null;
    return {
      nmId: row.nmId,
      articleKey: row.articleKey,
      supplierArticle: row.supplierArticle,
      productName: row.productName,
      brandName: row.brandName,
      firstDate: first?.date || '',
      latestDate: latest?.date || '',
      firstRating: first?.avgRating ?? null,
      latestRating: latest?.avgRating ?? null,
      ratingDelta: first && latest ? round(latest.avgRating - first.avgRating, 3) : null,
      history: series
    };
  }).filter((row) => row.firstRating !== null).sort((left, right) => {
    return numberOrZero(left.ratingDelta) - numberOrZero(right.ratingDelta);
  });

  return {
    source: 'portal-daily-snapshots',
    dates,
    historyDays: dates.length,
    cardsObserved: matrix.length,
    matrix
  };
}

function buildHistory(previousPayload, payload, options) {
  const history = Array.isArray(previousPayload?.history) ? previousPayload.history : [];
  const entry = {
    date: options.to,
    generatedAt: payload.generatedAt,
    window: payload.window,
    feedbacks: payload.summary.feedbacks.count,
    unansweredFeedbacks: payload.summary.feedbacks.unanswered,
    lowRatingFeedbacks: payload.summary.feedbacks.lowRating,
    reviewPoints: payload.summary.feedbacks.reviewPoints,
    reviewPointsFeedbacks: payload.summary.feedbacks.reviewPointsFeedbacks,
    avgRating: payload.summary.feedbacks.avgRating,
    questions: payload.summary.questions.count,
    unansweredQuestions: payload.summary.questions.unanswered,
    cards: payload.cards.slice(0, 500).map((card) => ({
      nmId: card.nmId,
      articleKey: card.articleKey,
      avgRating: card.avgRating,
      ratingTrendDelta: card.ratingTrend?.ratingDelta ?? null,
      ratingTrendLatestRating: card.ratingTrend?.latestRating ?? null,
      feedbackCount: card.feedbackCount,
      lowRatingCount: card.lowRatingCount,
      reviewPoints: card.reviewPoints,
      reviewPointsFeedbackCount: card.reviewPointsFeedbackCount,
      unansweredFeedbackCount: card.unansweredFeedbackCount,
      questionCount: card.questionCount,
      unansweredQuestionCount: card.unansweredQuestionCount,
      lastFeedbackDate: card.lastFeedbackDate
    }))
  };
  return [
    ...history.filter((item) => item?.date !== options.to),
    entry
  ].sort((left, right) => String(left.date).localeCompare(String(right.date))).slice(-120);
}

async function buildPayload(options) {
  if (!options.token) {
    throw new Error('ALTEA_WB_FEEDBACKS_TOKEN is not set. Save the WB Feedbacks and Questions token in the user environment.');
  }
  const diagnostics = { requests: 0, warnings: [] };
  const skus = readJson(path.join(options.inputDir, 'skus.json'), readJson(path.join(options.baseDataDir, 'skus.json'), []));
  const previousPayload = readJson(path.join(options.baseDataDir, DEFAULT_OUTPUT_FILE), readJson(path.join(options.inputDir, DEFAULT_OUTPUT_FILE), {}));
  const previousSnapshot = latestPreviousSnapshot(previousPayload, options.to);
  const lookups = buildSkuLookups(skus);
  const counts = await fetchCounts(options, diagnostics);
  const feedbackRows = [
    ...await fetchPagedList(options, diagnostics, 'feedbacks', false),
    ...await fetchPagedList(options, diagnostics, 'feedbacks', true)
  ];
  const questionRows = [
    ...await fetchPagedList(options, diagnostics, 'questions', false),
    ...await fetchPagedList(options, diagnostics, 'questions', true)
  ];
  const feedbacks = feedbackRows.map((row) => normalizeFeedback(row, lookups)).filter((row) => row.id);
  const questions = questionRows.map((row) => normalizeQuestion(row, lookups)).filter((row) => row.id);
  let cards = buildCards(feedbacks, questions, skus, options, previousSnapshot);
  const ratingDynamics = buildCardRatingDynamics(feedbacks, cards, options);
  const ratingRowsByKey = new Map((ratingDynamics.matrix || []).map((row) => [cardIdentityKey(row), row]));
  cards = cards.map((card) => {
    const ratingRow = ratingRowsByKey.get(cardIdentityKey(card));
    if (!ratingRow) {
      return {
        ...card,
        ratingHistory: [],
        ratingTrend: {
          firstDate: '',
          latestDate: '',
          firstRating: null,
          latestRating: null,
          ratingDelta: null,
          last7RatingDelta: null
        }
      };
    }
    return {
      ...card,
      ratingFeedbackCount: ratingRow.ratingCount,
      ratingHistory: ratingRow.history,
      ratingTrend: {
        firstDate: ratingRow.firstDate,
        latestDate: ratingRow.latestDate,
        firstRating: ratingRow.firstRating,
        latestRating: ratingRow.latestRating,
        ratingDelta: ratingRow.ratingDelta,
        last7RatingDelta: ratingRow.last7RatingDelta
      }
    };
  });
  const daily = buildDaily(feedbacks, questions, options);
  const reviewPointsDaily = daily.map((item) => ({
    date: item.date,
    spend: item.reviewPoints,
    points: item.reviewPoints,
    feedbacks: item.reviewPointsFeedbacks
  })).filter((item) => numberOrZero(item.spend) > 0 || numberOrZero(item.feedbacks) > 0);
  const monthPredicate = (row) => row.date >= options.currentMonthFrom && row.date <= options.to;
  const last7Predicate = (row) => row.date >= options.last7From && row.date <= options.to;
  const payload = {
    generatedAt: new Date().toISOString(),
    source: 'wb-feedbacks-api',
    docsUrl: options.docsUrl,
    window: {
      from: options.from,
      to: options.to,
      days: Math.max(1, Math.round((Date.parse(`${options.to}T00:00:00Z`) - Date.parse(`${options.from}T00:00:00Z`)) / 86400000) + 1),
      dateFromUnix: toUnixStart(options.from),
      dateToUnix: toUnixEnd(options.to)
    },
    currentMonth: {
      monthKey: options.monthKey,
      from: options.currentMonthFrom,
      feedbacks: summarizeRows(feedbacks, monthPredicate),
      questions: summarizeQuestions(questions, monthPredicate)
    },
    last7Days: {
      from: options.last7From,
      to: options.to,
      feedbacks: summarizeRows(feedbacks, last7Predicate),
      questions: summarizeQuestions(questions, last7Predicate)
    },
    summary: {
      feedbacks: summarizeRows(feedbacks),
      questions: summarizeQuestions(questions),
      counters: counts,
      cardsWithFeedbacks: cards.filter((card) => card.feedbackCount > 0).length,
      cardsWithQuestions: cards.filter((card) => card.questionCount > 0).length,
      cardsWithLowRating: cards.filter((card) => card.lowRatingCount > 0).length,
      cardsWithRatingDrop: cards.filter((card) => numberOrZero(card.ratingDeltaVsPrevious) < 0).length
    },
    reviewsForPoints: {
      label: 'Отзывы за баллы',
      sourceStatus: 'wb_feedbacks_api_supplierFeedbackValuation',
      apiAvailable: reviewPointsDaily.length > 0,
      spend: round(reviewPointsDaily.reduce((sum, item) => sum + numberOrZero(item.spend), 0), 2),
      points: round(reviewPointsDaily.reduce((sum, item) => sum + numberOrZero(item.points), 0), 2),
      feedbacks: reviewPointsDaily.reduce((sum, item) => sum + numberOrZero(item.feedbacks), 0),
      orders: null,
      daily: reviewPointsDaily,
      note: 'Filled from WB Feedbacks API field supplierFeedbackValuation. The portal treats these values as points/rub-equivalent for the IU/DRR channel.'
    },
    ratingDynamics,
    daily,
    cards,
    recentFeedbacks: feedbacks
      .slice()
      .sort((left, right) => String(right.createdDate).localeCompare(String(left.createdDate)))
      .slice(0, 80),
    recentQuestions: questions
      .slice()
      .sort((left, right) => String(right.createdDate).localeCompare(String(left.createdDate)))
      .slice(0, 80),
    diagnostics: {
      ...diagnostics,
      feedbackRows: feedbackRows.length,
      questionRows: questionRows.length,
      matchedCards: cards.filter((card) => card.articleKey).length,
      previousSnapshotDate: previousSnapshot?.date || ''
    }
  };
  payload.history = buildHistory(previousPayload, payload, options);
  payload.ratingDynamics.snapshot = buildSnapshotRatingHistory(payload.history, payload.cards);
  return payload;
}

async function main() {
  const options = resolveOptions(parseArgs(process.argv));
  if (options.command !== 'sync') {
    throw new Error(`Unsupported command: ${options.command}`);
  }
  const payload = await buildPayload(options);
  const outputPath = path.join(options.outputDir, DEFAULT_OUTPUT_FILE);
  writeJson(outputPath, payload);
  if (options.mirrorLocalFallback) {
    writeJson(path.join(options.mirrorDataDir, DEFAULT_OUTPUT_FILE), payload);
  }
  console.log(JSON.stringify({
    outputPath,
    mirrored: options.mirrorLocalFallback ? path.join(options.mirrorDataDir, DEFAULT_OUTPUT_FILE) : '',
    generatedAt: payload.generatedAt,
    window: payload.window,
    feedbacks: payload.summary.feedbacks.count,
    questions: payload.summary.questions.count,
    cards: payload.cards.length,
    unansweredFeedbacksNow: payload.summary.counters.feedbacksUnansweredNow,
    reviewsForPoints: payload.reviewsForPoints.sourceStatus,
    ratingDrops: payload.ratingDynamics.cardsWithDrop,
    ratingGrowth: payload.ratingDynamics.cardsWithGrowth,
    warnings: payload.diagnostics.warnings
  }, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
