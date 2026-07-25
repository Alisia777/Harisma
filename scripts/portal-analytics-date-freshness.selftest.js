#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const MODULE = 'portal-analytics-date-freshness-hotfix.js';

async function run() {
  const source = fs.readFileSync(path.join(ROOT, MODULE));
  const server = http.createServer((request, response) => {
    if (request.url === `/${MODULE}`) {
      response.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
      response.end(source);
      return;
    }
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end('<!doctype html><html><body></body></html>');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.evaluate(() => {
      window.changedDates = [];
      const targets = [
        { attribute: 'data-ceo-date-to' },
        { attribute: 'data-portal-exec-end' },
        { id: 'skuPlanFactDateTo' },
        { id: ['i', 'u', 'D', 'r', 'r', 'V3', 'DateTo'].join('') }
      ];
      targets.forEach((target, index) => {
        const input = document.createElement('input');
        input.type = 'date';
        if (target.id) input.id = target.id;
        if (target.attribute) input.setAttribute(target.attribute, '');
        input.value = '2026-07-22';
        input.max = '2026-07-23';
        input.addEventListener('change', () => { window.changedDates[index] = input.value; });
        document.body.appendChild(input);
      });
    });
    await page.addScriptTag({ url: `http://127.0.0.1:${server.address().port}/${MODULE}` });
    await page.waitForFunction(() => window.changedDates?.length === 4 && window.changedDates.every((value) => value === '2026-07-23'));
    assert.deepStrictEqual(await page.locator('input[type="date"]').evaluateAll((inputs) => inputs.map((input) => input.value)), [
      '2026-07-23',
      '2026-07-23',
      '2026-07-23',
      '2026-07-23'
    ]);

    await page.locator('input[type="date"]').first().fill('2026-07-16');
    await page.evaluate(() => {
      window.changedDates[0] = '';
      window.dispatchEvent(new Event('altea:datarefresh'));
    });
    await page.waitForTimeout(120);
    assert.strictEqual(await page.locator('input[type="date"]').first().inputValue(), '2026-07-16');
    console.log('portal-analytics-date-freshness selftest ok');
  } finally {
    await browser.close();
    server.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
