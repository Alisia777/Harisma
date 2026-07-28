const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const css = [
  fs.readFileSync(path.join(root, 'portal-interface-optimization.css'), 'utf8'),
  fs.readFileSync(path.join(root, 'portal-interface-optimization-core.css'), 'utf8')
].join('\n');
const baseCss = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const shell = fs.readFileSync(path.join(root, 'portal-shell-customizer-v2.js'), 'utf8');
const presentation = fs.readFileSync(path.join(root, 'portal-premium-presentation.js'), 'utf8');

assert.match(css, /html\[data-sidebar="hidden"\][\s\S]*?\.altea-premium-shell-main\s*\{[\s\S]*?grid-template-rows:\s*0 minmax\(0, 1fr\)/);
assert.match(css, /html\[data-sidebar="hidden"\][\s\S]*?\.altea-premium-shell-topbar\s*\{[\s\S]*?opacity:\s*0;[\s\S]*?pointer-events:\s*none/);
assert.match(css, /@media \(max-width: 860px\)[\s\S]*?\.shell-premium-sidebar-toggle\s*\{[\s\S]*?display:\s*grid !important/);
assert.match(css, /:is\(#view-launches, #view-sku-contour\) \.sku-launch-v1-shell/);
assert.match(css, /:is\(#view-launches, #view-sku-contour\) :is\(\.sl-v1-filter-dock, \.sl-v1-filter-grid\)/);
assert.match(css, /:is\([\s\S]*?\.altea-filter-popover,[\s\S]*?\.altea-cell-detail-popover[\s\S]*?\)[\s\S]*?background:\s*var\(--portal-theme-surface-strong\) !important/);
assert.match(css, /\.altea-cell-detail-popover__grid dd\.altea-cell-detail-popover__value\s*\{[\s\S]*?color:\s*var\(--ok, var\(--shell-accent\)\) !important/);
assert.match(css, /\.altea-filter-popover__actions\s*\{[\s\S]*?var\(--shell-surface\) 34%/);
assert.match(css, /\.ceo-motion-v1\.ceo-drawer-back \.ceo-drawer\s*\{[\s\S]*?background:\s*var\(--portal-theme-surface-strong\) !important/);
assert.match(css, /\.ceo-motion-v1\.ceo-drawer-back :is\([\s\S]*?\.ceo-drawer h2,[\s\S]*?\.ceo-drawer-metric strong,[\s\S]*?\.ceo-drawer-row b[\s\S]*?color:\s*var\(--shell-text\) !important/);
assert.match(css, /\.ceo-motion-v1\.ceo-drawer-back \.ceo-drawer-search input\s*\{[\s\S]*?background:\s*var\(--portal-theme-control\) !important/);
assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?transition:\s*none !important/);
assert.match(css, /\.altea-premium-route-stage\.is-route-entering[\s\S]*?alteaInterfaceRouteIn 280ms/);
assert.match(css, /\.altea-premium-route-stage--legacy > \.view\.active\s*\{[\s\S]*?height:\s*auto !important;[\s\S]*?min-height:\s*0 !important;[\s\S]*?overflow:\s*visible !important/);
assert.match(baseCss, /\.pf-v1-cols col:nth-child\(1\)\s*\{width:300px\}/);
assert.match(baseCss, /\.pf-v1-cols col:nth-child\(2\)\s*\{width:170px\}/);
assert.match(baseCss, /\.pf-v1-cols col:nth-child\(3\)\s*\{width:230px\}/);
assert.match(baseCss, /table\.pf-v1-table\s*\{min-width:2666px;width:2666px;table-layout:fixed\}/);
assert.match(css, /\.pf-v1-table \.pf-v1-row td:first-child \.link-btn\s*\{[\s\S]*?color:\s*var\(--text\) !important/);
assert.match(css, /@media \(max-width: 860px\)[\s\S]*?table\.pf-v1-table\s*\{[\s\S]*?width:\s*2606px !important/);
assert.match(css, /@media \(max-width: 560px\)[\s\S]*?\.pf-v1-cols col:nth-child\(1\)\s*\{[\s\S]*?width:\s*210px !important/);
assert.match(css, /@media \(max-width: 560px\)[\s\S]*?\.pf-v1-table-card \.section-subhead\s*\{[\s\S]*?display:\s*grid !important/);

assert.match(shell, /'Показать панели · Alt\+M'/);
assert.match(shell, /'Скрыть панели · Alt\+M'/);
assert.match(shell, /root\.dataset\.chrome = state === 'hidden' \? 'hidden' : 'visible'/);
assert.match(shell, /premium\.classList\.toggle\('is-chrome-hidden', state === 'hidden'\)/);
assert.doesNotMatch(shell, /void\s+document\.body\.offsetWidth/);

assert.match(presentation, /stage\.__alteaRouteEnterTimer = window\.setTimeout/);
assert.doesNotMatch(presentation, /void\s+stage\.offsetWidth/);

for (const file of ['index.html', 'live-index.html', 'docs/index.html']) {
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  assert.match(html, /portal-interface-optimization\.css\?v=20260727planfacttable1/);
  assert.match(html, /portal-premium-presentation\.js\?v=20260728smartrepricer3/);
  assert.match(html, /portal-shell-customizer-v2\.js\?v=20260725chrome1/);
}

console.log('portal-interface-goal.selftest OK');
