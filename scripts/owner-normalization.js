const OBSOLETE_OWNER_NAMES = new Set([
  'Кирилл',
  'Олеся',
  'Светлана'
]);

const OWNER_ALIASES = new Map([
  ['александр', 'Питайкин Артём'],
  ['александр озон', 'Питайкин Артём'],
  ['артем', 'Питайкин Артём'],
  ['артём', 'Питайкин Артём'],
  ['питайкин артем', 'Питайкин Артём'],
  ['питайкин артём', 'Питайкин Артём'],
  ['дария', 'Молодякова Дария'],
  ['дарья', 'Молодякова Дария'],
  ['даша', 'Молодякова Дария'],
  ['молодякова дария', 'Молодякова Дария'],
  ['молодякова дарья', 'Молодякова Дария'],
  ['анна', 'Анна Пирогова'],
  ['анна пирогова', 'Анна Пирогова'],
  ['пирогова анна', 'Анна Пирогова'],
  ['екатерина', 'Екатерина Доможирова'],
  ['екатерина доброжирова', 'Екатерина Доможирова'],
  ['екатерина доможирова', 'Екатерина Доможирова'],
  ['доможирова екатерина', 'Екатерина Доможирова'],
  ['доброжирова екатерина', 'Екатерина Доможирова'],
  ['мария', 'Мария Васильева'],
  ['мария васильева', 'Мария Васильева'],
  ['мария васильевна', 'Мария Васильева'],
  ['васильева мария', 'Мария Васильева'],
  ['максим', 'Максим Лапыгин'],
  ['лапыгин максим', 'Максим Лапыгин'],
  ['максим лапыгин', 'Максим Лапыгин']
]);

function normalizeOwnerText(value = '') {
  return String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeOwnerKey(value = '') {
  return normalizeOwnerText(value).toLowerCase().replace(/ё/g, 'е');
}

function isObsoleteOwnerName(value = '') {
  return OBSOLETE_OWNER_NAMES.has(normalizeOwnerText(value));
}

function canonicalOwnerName(value = '', options = {}) {
  const text = normalizeOwnerText(value);
  if (!text) return '';
  const canonical = OWNER_ALIASES.get(normalizeOwnerKey(text)) || text;
  if (!isObsoleteOwnerName(canonical)) return canonical;

  const fallback = options.fallback ? canonicalOwnerName(options.fallback) : '';
  return fallback && !isObsoleteOwnerName(fallback) ? fallback : '';
}

function canonicalOwnerForPlatform(value = '', _platformKey = '', fallbackOwner = '') {
  return canonicalOwnerName(value, { fallback: fallbackOwner });
}

module.exports = {
  canonicalOwnerName,
  canonicalOwnerForPlatform,
  isObsoleteOwnerName,
  normalizeOwnerText
};
