const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'portal-interface-optimization.css'), 'utf8');
const shell = fs.readFileSync(path.join(root, 'portal-shell-customizer-v2.js'), 'utf8');
const presentation = fs.readFileSync(path.join(root, 'portal-premium-presentation.js'), 'utf8');

assert.match(css, /html\[data-sidebar="hidden"\][\s\S]*?\.altea-premium-shell-main\s*\{[\s\S]*?grid-template-rows:\s*0 minmax\(0, 1fr\)/);
assert.match(css, /html\[data-sidebar="hidden"\][\s\S]*?\.altea-premium-shell-topbar\s*\{[\s\S]*?opacity:\s*0;[\s\S]*?pointer-events:\s*none/);
assert.match(css, /@media \(max-width: 860px\)[\s\S]*?\.shell-premium-sidebar-toggle\s*\{[\s\S]*?display:\s*grid !important/);
assert.match(css, /:is\(#view-launches, #view-sku-contour\) \.sku-launch-v1-shell/);
assert.match(css, /:is\(#view-launches, #view-sku-contour\) :is\(\.sl-v1-filter-dock, \.sl-v1-filter-grid\)/);
assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?transition:\s*none !important/);
assert.match(css, /\.altea-premium-route-stage\.is-route-entering[\s\S]*?alteaInterfaceRouteIn 280ms/);

assert.match(shell, /'Показать панели · Alt\+M'/);
assert.match(shell, /'Скрыть панели · Alt\+M'/);
assert.match(shell, /root\.dataset\.chrome = state === 'hidden' \? 'hidden' : 'visible'/);
assert.match(shell, /premium\.classList\.toggle\('is-chrome-hidden', state === 'hidden'\)/);
assert.doesNotMatch(shell, /void\s+document\.body\.offsetWidth/);

assert.match(presentation, /stage\.__alteaRouteEnterTimer = window\.setTimeout/);
assert.doesNotMatch(presentation, /void\s+stage\.offsetWidth/);

for (const file of ['index.html', 'live-index.html', 'docs/index.html']) {
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  assert.match(html, /portal-interface-optimization\.css\?v=20260726layout7/);
  assert.match(html, /portal-premium-presentation\.js\?v=20260725repricerchrome1/);
  assert.match(html, /portal-shell-customizer-v2\.js\?v=20260725chrome1/);
}

console.log('portal-interface-goal.selftest OK');
