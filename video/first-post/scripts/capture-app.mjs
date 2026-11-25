// Captures the real Zarqa web app at phone size, driven step by step against a mocked API,
// for the launch video's phone screens. Needs the web dev server on :5173 and Playwright's
// Chromium (from web/node_modules). Run: node scripts/capture-app.mjs
import {createRequire} from 'node:module';
import {mkdirSync, readFileSync} from 'node:fs';

const require = createRequire(new URL('../../../web/package.json', import.meta.url));
const {chromium} = require('playwright');

const BASE = 'http://localhost:5173';
const OUT = new URL('../public/app/', import.meta.url);
mkdirSync(OUT, {recursive: true});

const campus = JSON.parse(readFileSync(new URL('../../../benchmark/data/campus/locations.json', import.meta.url), 'utf8'));
const places = Object.entries(campus)
	.filter(([k]) => !k.startsWith('_'))
	.map(([name, aliases]) => ({name, aliases}));

const me = {id: 'demo', email: 'student@gutech.edu.om', firstName: 'Salma', isAdmin: false, matchAlerts: true, showFirstName: true};
const now = new Date();
const iso = (h) => new Date(now.getTime() - h * 3600e3).toISOString();
const report = (o) => ({
	category: '',
	categoryKey: null,
	description: '',
	locationName: null,
	eventDate: null,
	eventTime: null,
	status: 'Open',
	isSensitive: false,
	photoIds: [],
	matchId: null,
	conversationId: null,
	dropAtRsa: false,
	dropCode: null,
	rsaReceived: false,
	pickupMatchId: null,
	...o,
});
const glasses = report({id: 'r-glasses', kind: 'lost', title: 'Black glasses', categoryKey: 'glasses', locationName: 'GU1 Library', locationText: 'GU1 Library', pill: 'Searching', createdAt: iso(0.05)});
const calculator = report({id: 'r-calc', kind: 'found', title: 'Calculator', categoryKey: 'electronics', locationName: 'GU2', locationText: 'GU2', pill: 'Bring to RSA', dropAtRsa: true, dropCode: 'K7P-4QM', createdAt: iso(0.02)});
const listings = [
	calculator,
	glasses,
	report({id: 'r1', kind: 'found', title: 'Pink wallet', locationText: 'Ground Canteen', pill: 'Possible match', matchId: 'm1', createdAt: iso(3)}),
	report({id: 'r2', kind: 'lost', title: 'Type-C charger', locationText: 'Temporary parking', pill: 'Chatting', createdAt: iso(20)}),
	report({id: 'r3', kind: 'found', title: 'Blue water bottle', locationText: 'GU2', pill: 'At the RSA', dropAtRsa: true, rsaReceived: true, createdAt: iso(26)}),
	report({id: 'r4', kind: 'lost', title: 'iPad pencil', locationText: 'GU2', pill: 'Returned', status: 'Returned', createdAt: iso(50)}),
];

const browser = await chromium.launch();
const page = await browser.newPage({viewport: {width: 390, height: 844}, deviceScaleFactor: 3, serviceWorkers: 'block'});
await page.addInitScript(() => localStorage.clear());
let mine = [glasses];
await page.route('**/api/**', (route) => {
	const url = new URL(route.request().url());
	const p = url.pathname.replace(/^\/api/, '');
	const method = route.request().method();
	if (p === '/me') return route.fulfill({json: me});
	if (p === '/me/stats') return route.fulfill({json: {posts: 6, gotBack: 2, helpedReturn: 3}});
	if (p === '/home') return route.fulfill({json: {active: mine.length, matchesWaiting: 0, unreadChats: 0, postsLeft: 9}});
	if (p === '/locations') return route.fulfill({json: places});
	if (p === '/reports' && method === 'POST') return route.fulfill({json: next});
	if (p === '/reports/mine') return route.fulfill({json: mine});
	if (p.startsWith('/reports/')) return route.fulfill({json: mine.find((r) => p.endsWith(r.id)) ?? calculator});
	return route.fulfill({json: []});
});
let next = glasses;

const shot = async (name) => {
	await page.waitForTimeout(250);
	await page.screenshot({path: new URL(`${name}.png`, OUT).pathname.replace(/^\/([A-Z]:)/, '$1')});
	console.log('captured', name);
};
const typeIn = async (selector, text, name, steps) => {
	const el = page.locator(selector);
	await el.click();
	for (let i = 1; i <= steps; i++) {
		await el.fill(text.slice(0, Math.round((text.length * i) / steps)));
		await shot(`${name}-${i}`);
	}
};

// Lost: what, where, post, then My reports.
await page.goto(`${BASE}/`);
await page.getByText('I lost something').waitFor();
await shot('lost-0');
await page.locator('#item-text').scrollIntoViewIfNeeded();
await page.evaluate(() => window.scrollBy(0, 160));
await shot('lost-1');
await typeIn('#item-text', 'Black glasses in a brown case', 'lost-type', 6);
const where = page.getByRole('combobox');
await where.click();
await where.fill('Libr');
await shot('lost-where-1');
await page.getByRole('option').first().click();
await shot('lost-where-2');
await page.getByRole('button', {name: 'Find my stuff'}).scrollIntoViewIfNeeded();
await shot('lost-post');
await page.getByRole('button', {name: 'Find my stuff'}).click();
await page.waitForURL('**/reports');
await shot('lost-posted');

// Found: switch mode, what, where, drop at RSA, post, then the drop-off code.
mine = [calculator, glasses];
next = calculator;
await page.goto(`${BASE}/`);
await page.getByText('I found something').click();
await shot('found-0');
await page.locator('#item-text').scrollIntoViewIfNeeded();
await page.evaluate(() => window.scrollBy(0, 160));
await typeIn('#item-text', 'Calculator next to an orange notebook', 'found-type', 6);
const where2 = page.getByRole('combobox');
await where2.click();
await where2.fill('GU2');
await shot('found-where-1');
await page.getByRole('option').first().click();
const rsa = page.getByRole('switch', {name: "I'll drop it at the RSA desk"});
await rsa.scrollIntoViewIfNeeded();
await rsa.click();
await shot('found-rsa');
await page.getByRole('button', {name: 'Post found item'}).click();
await page.waitForURL('**/reports/**');
await shot('found-posted');

// A full campus: My reports with a realistic mix.
mine = listings;
await page.goto(`${BASE}/reports`);
await page.getByText('Pink wallet').waitFor();
await shot('listings');

await browser.close();
