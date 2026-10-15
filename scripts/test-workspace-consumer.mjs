import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';

const directory = (await readFile('/tmp/canva-workspace-consumer-path', 'utf8')).trim();
const consumerRequire = createRequire(join(directory, 'package.json'));
const { createServer } = await import(pathToFileURL(consumerRequire.resolve('vite')).href);
const server = await createServer({ root: directory, server: { host: '127.0.0.1', port: 0 } });
let browser;
try {
  await server.listen();
  const address = server.httpServer.address();
  assert(address && typeof address === 'object');
  const url = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(url);
  await page.locator('[data-canvas-root="true"]').waitFor();
  const status = page.getByTestId('status');
  const waitStatus = value => page.waitForFunction(text => document.querySelector('[data-testid="status"]').textContent.startsWith(text), value);
  const waitCount = count => page.waitForFunction(value => JSON.parse(document.querySelector('[data-testid="state"]').textContent).mediaCount === value, count);
  const click = name => page.getByRole('button', { name, exact: true }).click();
  const hostMetrics = await page.evaluate(() => ({
    font: getComputedStyle(document.documentElement).fontSize,
    margin: getComputedStyle(document.body).margin,
    heading: getComputedStyle(document.querySelector('h1')).fontSize,
    root: document.querySelector('.canva-banana-workspace').getBoundingClientRect().toJSON(),
    host: document.querySelector('[data-testid="editor-host"]').getBoundingClientRect().toJSON(),
  }));
  assert.equal(hostMetrics.font, '16px');
  assert.equal(hostMetrics.margin, '8px');
  assert.equal(hostMetrics.heading, '32px');
  assert(Math.abs(hostMetrics.root.width - (hostMetrics.host.width - 6)) < 1);
  assert.equal(hostMetrics.root.height, 680);
  await click('Checkpoint'); await waitStatus('checkpoint saved');
  await click('Load sample'); await waitCount(1);
  assert.equal(await page.getByRole('textbox', { name: 'Prompt input', exact: true }).inputValue(), 'Package consumer test shot');
  await click('Export first image'); await waitStatus('exported image/png');
  await click('Save snapshot'); await waitStatus('snapshot saved');
  await click('Restore checkpoint'); await waitCount(0);
  await click('Import saved snapshot'); await waitStatus('snapshot imported'); await waitCount(1);
  assert.equal(await page.getByRole('textbox', { name: 'Prompt input', exact: true }).inputValue(), 'Package consumer test shot');
  await page.getByRole('textbox', { name: 'Host input' }).fill('Host editing');
  await page.getByRole('textbox', { name: 'Host input' }).press('Backspace');
  await waitCount(1);
  await page.getByRole('combobox', { name: 'Select image edit model', exact: true }).click();
  assert(await page.locator('.canva-banana-portal [role="listbox"]').isVisible());
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 1024, height: 980 });
  const resized = await page.locator('.canva-banana-workspace').boundingBox();
  assert(resized.width < hostMetrics.root.width);
  await page.screenshot({ path: '/tmp/canva-library-consumer.png', fullPage: true });
  await click('Switch project'); await waitCount(0);
  assert.equal(await page.getByTestId('project').textContent(), 'Project b');
  await click('Restore checkpoint'); await waitStatus('error: Error: Checkpoint belongs');
  await click('Load sample'); await waitCount(1);
  await click('Switch project'); await waitCount(0);
  assert.equal(await page.getByTestId('project').textContent(), 'Project a');
  await click('Unmount editor');
  assert.equal(await page.locator('[data-canvas-root="true"]').count(), 0);
  await click('Mount editor'); await waitCount(0);
  await page.locator('[data-canvas-root="true"]').waitFor();
  assert.deepEqual(errors, []);
  assert.equal(JSON.parse(await page.getByTestId('state').textContent()).error, null);
  console.log('Independent browser acceptance passed: host styles, container resize, media/prompt load, first-image export, streaming snapshot round trip, checkpoint restore, portals, input isolation, project switching and remount.');
} finally {
  await browser?.close();
  await server.close();
}
