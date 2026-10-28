// Frontend smoke test: runs the REAL browser code (router, pages, components) against a REAL server using a tiny fake DOM.
import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { startApp, signup, clanBody } from './helpers.js';
import { installFakeDom, el } from './fake-dom.js';

const app = await startApp();
after(() => app.close());

/* ----- seed data via the API ----- */
const leader = await signup(app.base, { handle: 'wolfking', displayName: 'Wolf King', profile: { thLevel: 16, trophies: 5200, bestTrophies: 5400, warStars: 640, favoriteTroop: 'Electro Dragon', bio: 'Leader of the Wolves. War every weekend.', lookingForClan: false, playerTag: '#2PP0LRQ' } });
await leader.c.post('/api/clans', clanBody({ name: 'Iron Wolves', minTh: 10, minTrophies: 2000, type: 'open', description: 'We war hard and farm harder.' }));
const invLeader = await signup(app.base, { handle: 'queenb', displayName: 'Queen B', profile: { thLevel: 15, trophies: 4100 } });
await invLeader.c.post('/api/clans', clanBody({ name: 'Silent Order', type: 'invite', minTh: 12, focus: 'cwl', color: 'elixir', emblem: 'crown', banner: 'night-siege' }));
await signup(app.base, { handle: 'scout', displayName: 'Scout', profile: { thLevel: 11, trophies: 2600, lookingForClan: true } });

/* ----- boot the real frontend ----- */
const dom = installFakeDom({ url: `${app.base}/` });
for (const [tag, attrs] of /** @type {const} */ ([['header', { id: 'site-header' }], ['main', { id: 'main', tabindex: '-1' }], ['nav', { id: 'bottom-nav' }], ['div', { id: 'toasts' }]])) {
  const e = el(tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); dom.body.appendChild(e);
}
/** @type {string[]} */ const consoleErrors = [];
console.error = (/** @type {any[]} */ ...a) => { consoleErrors.push(a.map(String).join(' ')); };

// A browser-like fetch: same-origin base URL + cookie jar.
let cookie = ''; let pending = 0; let offline = false;
const realFetch = globalThis.fetch;
globalThis.fetch = /** @type {any} */ (async (/** @type {string} */ url, /** @type {RequestInit} */ init = {}) => {
  pending++;
  try {
    if (offline) throw new TypeError('fetch failed');
    const headers = { ...(/** @type {any} */ (init.headers) || {}), ...(cookie ? { Cookie: cookie } : {}), Origin: app.base };
    const res = await realFetch(url.startsWith('/') ? app.base + url : url, { ...init, headers });
    for (const c of res.headers.getSetCookie?.() ?? []) { const pair = c.split(';')[0]; cookie = pair.endsWith('=') ? '' : pair; }
    return res;
  } finally { pending--; }
});

const sleep = (/** @type {number} */ ms) => new Promise((r) => setTimeout(r, ms));
async function settle() {
  let quiet = 0;
  for (let i = 0; i < 200 && quiet < 4; i++) { await sleep(20); const busy = pending > 0 || dom.body.querySelector('#main[aria-busy]'); quiet = busy ? 0 : quiet + 1; }
}
const main = () => /** @type {any} */ (dom.body.querySelector('#main'));
const text = () => main().textContent.replace(/\s+/g, ' ');
const header = () => /** @type {any} */ (dom.body.querySelector('#site-header')).textContent.replace(/\s+/g, ' ');
const toasts = () => dom.body.querySelector('#toasts').textContent.replace(/\s+/g, ' ');
/** @param {string} sel @param {any} [root] */ const $ = (sel, root = dom.body) => /** @type {any} */ (root.querySelector(sel));
/** @param {string} sel @param {any} [root] */ const $$ = (sel, root = dom.body) => /** @type {any[]} */ (root.querySelectorAll(sel));
/** @param {string} sel @param {string} t @param {any} [root] */
const byText = (sel, t, root = dom.body) => { const f = $$(sel, root).find((n) => n.textContent.replace(/\s+/g, ' ').trim().includes(t)); if (!f) throw new Error(`No <${sel}> with text “${t}”. Page text: ${text().slice(0, 400)}`); return f; };
/** @param {any} input @param {string} v */ const type = (input, v) => { input.value = v; input.dispatchEvent({ type: 'input', bubbles: true }); };
/** @param {any} select @param {string} v */ const choose = (select, v) => { select.value = v; select.dispatchEvent({ type: 'change', bubbles: true }); };
/** @param {string} href */ async function go(href) { const a = el('a'); a.setAttribute('href', href); dom.body.appendChild(a); a.click(); a.remove(); await settle(); }
const field = (/** @type {string} */ name, root = main()) => $(`[name=${name}]`, root);
/** @param {any} form */ async function submit(form) { form.requestSubmit(); await settle(); }

before(async () => {
  await import('../public/js/main.js');
  await settle();
});

test('home: hero, real stats and live clans render without errors', async () => {
  assert.match(text(), /Find your clan\./);
  assert.match(text(), /Rule the war\./);
  assert.match(text(), /Iron Wolves/);
  assert.match(text(), /Silent Order/);
  assert.match(text(), /Players\s*\d/);
  assert.match(text(), /Top players/);
  assert.match(text(), /Wolf King/);
  assert.match(text(), /Scout/, 'recruit board lists players looking for a clan');
  assert.match(header(), /Sign in/);
  assert.match(header(), /Join free/);
  assert.equal(dom.body.querySelector('#bottom-nav').querySelectorAll('a').length, 4);
  assert.equal($$('h1', main()).length, 1, 'exactly one h1');
  assert.ok(!/demo/i.test(text()), 'no demo copy when there is no demo data');
  assert.deepEqual(consoleErrors, []);
});

test('auth guard redirects signed-out users and keeps the destination', async () => {
  await go('/settings');
  assert.equal(dom.loc.pathname, '/login');
  assert.equal(dom.loc.search, '?next=%2Fsettings');
  assert.match(text(), /Welcome back/);
});

test('clan discovery: filters, chips, URL sync, empty + reset', async () => {
  await go('/clans');
  assert.match(text(), /2 clans found/);
  assert.equal($$('.clan-card').length, 2);
  // search (debounced)
  type($('.search-input'), 'wolves'); await sleep(450); await settle();
  assert.match(text(), /1 clan found/);
  assert.equal($$('.clan-card').length, 1);
  assert.match(dom.loc.search, /q=wolves/);
  // type toggle -> chip
  byText('label', 'Open').querySelector('input').click(); await sleep(50); await settle();
  assert.ok($$('.chip').some((c) => c.textContent.includes('Open')), 'active chip is shown');
  // remove chip
  byText('.chip', 'Open').click(); await settle();
  assert.ok(!$$('.chip').some((c) => c.textContent.includes('Open')));
  // TH filter hides clans that need a higher Town Hall
  choose(field('th'), '5'); await settle();
  assert.match(text(), /No clans match these filters/);
  assert.match(dom.loc.search, /th=5/);
  // reset from the empty state
  byText('button', 'Clear all filters').click(); await settle();
  assert.match(text(), /2 clans found/);
  assert.equal(dom.loc.search.includes('th='), false);
  // sort + war select work
  choose(field('sort'), 'name'); await settle();
  assert.equal($$('.clan-card h3')[0].textContent.trim(), 'Iron Wolves');
  choose(field('war'), 'never'); await settle();
  assert.match(text(), /No clans match/);
  byText('button', 'Clear all filters').click(); await settle();
  // deep-linked filters are applied from the URL
  await go('/clans?type=invite');
  assert.equal($$('.clan-card').length, 1);
  assert.match(text(), /Silent Order/);
  assert.deepEqual(consoleErrors, []);
});

test('players directory + public profile', async () => {
  await go('/players');
  assert.match(text(), /3 players found/);
  byText('label', 'Looking for a clan').querySelector('input').click(); await settle();
  assert.match(text(), /1 player found/);
  assert.match(text(), /Scout/);
  await go('/u/wolfking');
  assert.match(text(), /Wolf King/);
  assert.match(text(), /@wolfking/);
  assert.match(text(), /Town Hall 16/);
  assert.match(text(), /Legend rank/);
  assert.match(text(), /self-reported/i, 'stats are labelled honestly');
  assert.match(text(), /Electro Dragon|Iron Wolves/);
  assert.ok($('.profile-cover svg'), 'cover art is rendered');
  assert.ok($('.profile-avatar svg'), 'avatar is rendered');
  // achievements tab (keyboard + click)
  byText('.tab', 'Achievements').click(); await settle();
  assert.match(text(), /of 14 earned/);
  assert.match(text(), /Trophy Hunter/);
  assert.equal($$('.ach.is-earned').length > 0, true);
  assert.equal(dom.loc.search, '?tab=achievements');
  const list = $('.tabs'); const before = $$('.tab', list).findIndex((t) => t.getAttribute('aria-selected') === 'true');
  list.dispatchEvent({ type: 'keydown', key: 'ArrowLeft', bubbles: true });
  assert.notEqual($$('.tab', list).findIndex((t) => t.getAttribute('aria-selected') === 'true'), before, 'arrow keys move between tabs');
  await go('/u/doesnotexist');
  assert.match(text(), /No player with that username/);
  assert.deepEqual(consoleErrors, []);
});

test('clan page as a guest', async () => {
  await go('/clans/iron-wolves');
  assert.match(text(), /Iron Wolves/);
  assert.match(text(), /Sign in to join/);
  assert.match(text(), /1\/50/);
  assert.match(text(), /TH 10\+/);
  byText('.tab', 'Members').click(); await settle();
  assert.match(text(), /Wolf King/);
  assert.match(text(), /Leader/);
  assert.equal($$('.tab').some((t) => t.textContent.includes('Settings')), false, 'guests do not see management tabs');
  await go('/clans/nope');
  assert.match(text(), /That clan does not exist/);
  assert.deepEqual(consoleErrors, []);
});

test('register -> onboarding -> save stats -> appearance', async () => {
  await go('/register');
  assert.match(text(), /Create your profile/);
  // client-side + server validation
  await submit($('form', main()));
  assert.match(text(), /Enter your email address/);
  type(field('displayName'), 'Newbie'); type(field('handle'), 'newbie_1'); type(field('email'), 'newbie@example.com'); type(field('password'), 'short');
  await submit($('form', main()));
  assert.match(text(), /Password must be 10/);
  type(field('password'), 'correct-horse-battery');
  await submit($('form', main()));
  assert.equal(dom.loc.pathname, '/settings');
  assert.match(toasts(), /Welcome to CoCekIn, Newbie/);
  assert.match(header(), /Newbie/);
  assert.doesNotMatch(header(), /Sign in/);
  // game tab
  assert.match(text(), /Game stats/);
  choose(field('thLevel'), '12'); type(field('trophies'), '2500'); type(field('bestTrophies'), '2600'); type(field('warStars'), '90');
  choose(field('favoriteTroop'), 'Yeti'); type(field('playerTag'), '#2pp0lrq');
  await submit($$('form', main())[0]);
  assert.match(toasts(), /Game stats saved/);
  assert.match(text(), /not enabled on this server/, 'verification states clearly that it needs configuration');
  // validation error from the server is shown on the right field
  type(field('trophies'), '99999'); await submit($$('form', main())[0]);
  assert.match(text(), /between 0 and 10000/);
  type(field('trophies'), '2500');
  // appearance
  byText('.tab', 'Appearance').click(); await settle();
  $$('input[name=avatar]')[7].click(); $$('input[name=cover]')[2].click();
  await submit($('form', main()));
  assert.match(toasts(), /Appearance saved/);
  // profile tab: bio + looking for clan
  byText('.tab', 'Profile').click(); await settle();
  type(field('bio'), 'Just started pushing for legend league!');
  byText('label', 'I am looking for a clan').querySelector('input').click();
  await submit($('form', main()));
  assert.match(toasts(), /Profile saved/);
  assert.deepEqual(consoleErrors, []);
});

test('dashboard reflects profile strength and clan state', async () => {
  await go('/dashboard');
  assert.match(text(), /Welcome back, Newbie/);
  assert.match(text(), /Profile strength/);
  assert.match(text(), /You are not in a clan/);
  assert.match(text(), /Self-reported stats/);
  assert.match(text(), /Next achievements/);
  assert.deepEqual(consoleErrors, []);
});

test('discovery tells a signed-in player whether they qualify; joining works end to end', async () => {
  await go('/clans');
  const wolves = $$('.clan-card').find((c) => c.textContent.includes('Iron Wolves'));
  assert.match(wolves.textContent, /You qualify/);
  await go('/clans?qualify=1');
  assert.equal($$('.clan-card').length, 2, 'Newbie (TH12, 2,500 trophies) qualifies for both clans');
  await go('/clans?th=11');
  assert.equal($$('.clan-card').length, 1, 'TH11 only fits Iron Wolves');
  assert.match(text(), /Iron Wolves/);
  await go('/clans/iron-wolves');
  byText('button', 'Join clan').click(); await settle();
  assert.match(toasts(), /Welcome to Iron Wolves/);
  assert.match(text(), /Leave clan/);
  assert.match(text(), /2\/50/);
  assert.match(header(), /Newbie/);
  byText('.tab', 'Members').click(); await settle();
  assert.match(text(), /Newbie/);
  assert.equal($$('select.inline-select').length, 0, 'plain members get no management controls');
  // leave via confirm dialog
  byText('button', 'Leave clan').click(); await sleep(10);
  assert.ok($('dialog'), 'confirmation dialog opened');
  byText('button', 'Leave clan', $('dialog')).click(); await settle();
  assert.match(toasts(), /You left Iron Wolves/);
  assert.match(text(), /Join clan/);
  assert.deepEqual(consoleErrors, []);
});

test('invite flow: request with message, then leader reviews it', async () => {
  await go('/clans/silent-order');
  byText('button', 'Request to join').click(); await sleep(10);
  assert.ok($('dialog textarea'), 'message dialog');
  type($('dialog textarea'), 'TH12, active daily.');
  byText('button', 'Send request', $('dialog')).click(); await settle();
  assert.match(toasts(), /Request sent/);
  assert.match(text(), /Request pending/);
  await go('/dashboard');
  assert.match(text(), /Silent Order/);
  assert.match(text(), /Pending/);
  // sign out through the user menu
  byText('button', 'Sign out', $('#site-header')).click(); await settle();
  assert.equal(dom.loc.pathname, '/');
  assert.match(header(), /Sign in/);
  // the leader signs in via the real login form
  await go('/login');
  type(field('email'), 'queenb@example.com'); type(field('password'), 'correct-horse-battery');
  await submit($('form', main()));
  assert.equal(dom.loc.pathname, '/dashboard');
  assert.match(text(), /1 join request is waiting for review/);
  await go('/clans/silent-order?tab=requests');
  assert.match(text(), /Newbie/);
  assert.match(text(), /TH12, active daily\./);
  byText('button', 'Accept', main()).click(); await settle();
  assert.match(toasts(), /Newbie joined the clan/);
  assert.match(text(), /No pending requests/);
  byText('.tab', 'Members').click(); await settle();
  assert.equal($$('select.inline-select').length, 1, 'leader can manage the new member');
  assert.ok(byText('button', 'Remove'));
  assert.deepEqual(consoleErrors, []);
});

test('clan settings tab: edit saves; create-clan flow; failed validation is inline', async () => {
  await go('/clans/silent-order?tab=settings');
  assert.match(text(), /Danger zone/);
  type(field('description'), 'Updated by the leader.');
  await submit($('form', main()));
  assert.match(toasts(), /Clan settings saved/);
  // Members of other clans cannot found a clan
  await go('/clans/new');
  assert.match(text(), /already in a clan/);
  // sign in as a clanless leader-to-be
  await signup(app.base, { handle: 'founder', displayName: 'Founder' });
  byText('button', 'Sign out', $('#site-header')).click(); await settle();
  await go('/login');
  type(field('email'), 'founder@example.com'); type(field('password'), 'correct-horse-battery'); await submit($('form', main()));
  await go('/clans/new');
  assert.match(text(), /Live preview/);
  assert.match(text(), /Your clan name/);
  type(field('name'), 'x'); await submit($('form', main()));
  assert.match(text(), /at least 3 characters/);
  type(field('name'), 'Dragon Riders'); assert.match(text(), /Dragon Riders/, 'live preview updates');
  choose(field('type'), 'invite');
  $$('input[name=type]')[1].click();
  $$('input[name=emblem]')[3].click();
  await submit($('form', main()));
  assert.equal(dom.loc.pathname, '/clans/dragon-riders');
  assert.match(toasts(), /Dragon Riders is founded/);
  assert.match(text(), /You lead this clan/);
  assert.match(text(), /Invite only/);
  // leader deletes it (typed confirmation)
  byText('.tab', 'Settings').click(); await settle();
  byText('button', 'Delete clan').click(); await sleep(10);
  const dlg = $('dialog');
  byText('button', 'Delete clan', dlg).click(); await sleep(10);
  assert.ok($('dialog'), 'dialog stays open when confirmation text is missing');
  type($('input', dlg), 'dragon riders');
  byText('button', 'Delete clan', dlg).click(); await settle();
  assert.equal(dom.loc.pathname, '/clans');
  assert.match(toasts(), /Clan deleted/);
  assert.deepEqual(consoleErrors, []);
});

test('unknown routes show a friendly 404 and the privacy page renders', async () => {
  await go('/this/does/not/exist');
  assert.match(text(), /not on the map/);
  await go('/privacy');
  assert.match(text(), /Fan-content notice/);
  assert.match(text(), /not affiliated with/);
  assert.deepEqual(consoleErrors, []);
});

test('error state offers a working retry; mobile filter sheet opens and closes', async () => {
  offline = true;
  await go('/clans');
  assert.match(text(), /You seem to be offline/);
  assert.match(text(), /Could not load clans/);
  offline = false;
  byText('button', 'Try again').click(); await settle();
  assert.equal($$('.clan-card').length > 0, true, 'retry recovers');
  const sheet = $('#filters'); const open = byText('button', 'Filters', main());
  open.click();
  assert.equal(sheet.classList.contains('is-open'), true);
  assert.equal(open.getAttribute('aria-expanded'), 'true');
  assert.equal(dom.body.classList.contains('no-scroll'), true);
  document.dispatchEvent(/** @type {any} */ ({ type: 'keydown', key: 'Escape', bubbles: true }));
  assert.equal(sheet.classList.contains('is-open'), false, 'Escape closes the sheet');
  assert.equal(dom.body.classList.contains('no-scroll'), false);
  assert.equal(document.activeElement, open, 'focus returns to the trigger');
  assert.deepEqual(consoleErrors.filter((e) => !/fetch failed|network/i.test(e)), []);
});

test('leader can manage members from the UI (role change, remove) and the header menu works', async () => {
  // fresh member joins Silent Order via API, then queenb (leader, still signed in from the previous test) manages them
  byText('button', 'Sign out', $('#site-header')).click(); await settle();
  await go('/login');
  type(field('email'), 'queenb@example.com'); type(field('password'), 'correct-horse-battery'); await submit($('form', main()));
  const extra = await signup(app.base, { handle: 'recruit1', displayName: 'Recruit One', profile: { thLevel: 13, trophies: 3000 } });
  assert.equal((await extra.c.post('/api/clans/silent-order/join', {})).status, 201);
  await go('/clans/silent-order?tab=requests');
  byText('button', 'Accept', main()).click(); await settle();
  byText('.tab', 'Members').click(); await settle();
  const rows = $$('.member-row').filter((r) => r.textContent.includes('Recruit One'));
  assert.equal(rows.length, 1);
  const sel = $('select.inline-select', rows[0]);
  choose(sel, 'elder'); await settle();
  assert.match(toasts(), /Recruit One is now Elder/);
  byText('button', 'Remove', main()).click(); await sleep(10);
  byText('button', 'Remove member', $('dialog')).click(); await settle();
  assert.match(toasts(), /Recruit One was removed/);
  assert.equal($$('.member-row').some((r) => r.textContent.includes('Recruit One')), false);
  // header user menu: opens, lists links, Escape closes
  const trigger = $('.user-trigger');
  trigger.click();
  assert.equal(trigger.getAttribute('aria-expanded'), 'true');
  assert.equal($$('#user-menu a').length, 3);
  $('.user-menu-wrap').dispatchEvent({ type: 'keydown', key: 'Escape', bubbles: true });
  assert.equal(trigger.getAttribute('aria-expanded'), 'false');
  assert.deepEqual(consoleErrors.filter((e) => !/fetch failed|network/i.test(e)), []);
});
