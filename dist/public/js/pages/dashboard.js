import { h, icon, mount, ago } from '../dom.js';
import { del, get } from '../api.js';
import { session } from '../state.js';
import { clanBadge, glyph } from '../art.js';
import { btn, busy, emptyState, errMsg, errorState, meter, pill, skeletons, toast } from '../ui.js';
import { roleLabel } from '../components.js';

const STATUS = /** @type {Record<string,[string,string]>} */ ({ pending: ['Pending', 'warn'], accepted: ['Accepted', 'good'], declined: ['Declined', 'muted'], cancelled: ['Cancelled', 'muted'] });

/** @param {import('../router.js').PageCtx} ctx */
export default function dashboard(ctx) {
  ctx.setTitle('Dashboard');
  const me = session.me;

  /* ----- profile checklist ----- */
  const checks = [
    ['Write a short bio', me.bio.length >= 10, '/settings'],
    ['Add your player tag', !!me.playerTag, '/settings?tab=game'],
    ['Set your Town Hall level', me.thLevel != null, '/settings?tab=game'],
    ['Add your trophies', me.trophies != null, '/settings?tab=game'],
    ['Pick a favourite unit', !!me.favoriteTroop, '/settings?tab=game'],
    ...(session.meta.cocApi ? [['Verify your account', me.verified, '/settings?tab=game']] : []),
  ];
  const done = checks.filter((c) => c[1]).length;
  const checklist = h('div', { class: 'card pad' }, h('h2', { class: 'display card-title' }, icon('check', 22), 'Profile strength'),
    h('p', { class: 'muted' }, `${done} of ${checks.length} steps complete`), meter(done, checks.length, 'Profile completion'),
    h('ul', { class: 'checklist' }, ...checks.map(([label, ok, href]) => h('li', { class: ok ? 'is-done' : '' }, icon(ok ? 'check' : 'plus', 16), ok ? h('span', null, label) : h('a', { href }, label)))),
    h('a', { class: 'link-arrow', href: `/u/${me.handle}` }, 'View public profile', icon('arrow', 16)));

  /* ----- clan ----- */
  const clanHost = h('div', { class: 'card pad' }, h('h2', { class: 'display card-title' }, icon('shield', 22), 'My clan'), ...skeletons(1, 'row'));
  async function loadClan() {
    if (!me.clan) {
      mount(clanHost, h('h2', { class: 'display card-title' }, icon('shield', 22), 'My clan'),
        emptyState({ icon: 'search', title: 'You are not in a clan', text: me.lookingForClan ? 'You are visible on the recruit board. You can also browse clans yourself.' : 'Browse clans that match your Town Hall, or found your own.', actions: [btn('Find a clan', { variant: 'primary', href: '/clans', icon: 'search' }), btn('Found a clan', { href: '/clans/new', icon: 'plus' })] }));
      return;
    }
    try {
      const r = await get(`/clans/${me.clan.slug}`);
      if (!ctx.alive()) return;
      mount(clanHost, h('h2', { class: 'display card-title' }, icon('shield', 22), 'My clan'),
        h('a', { class: 'mini-clan', href: `/clans/${r.clan.slug}` }, clanBadge(r.clan.emblem, r.clan.color, 64, ''), h('span', null, h('strong', null, r.clan.name), h('small', null, `${roleLabel(me.clan.role)} · ${r.clan.stats.members}/${r.clan.stats.capacity} members`)), icon('right', 18)),
        r.viewer.pendingCount > 0 ? h('p', { class: 'callout callout-warn' }, icon('inbox', 18), h('span', null, `${r.viewer.pendingCount} join ${r.viewer.pendingCount === 1 ? 'request is' : 'requests are'} waiting for review. `, h('a', { href: `/clans/${r.clan.slug}?tab=requests` }, 'Review now'))) : null);
    } catch (e) { if (ctx.alive()) mount(clanHost, h('h2', { class: 'display card-title' }, 'My clan'), errorState(e, loadClan)); }
  }

  /* ----- my requests ----- */
  const reqHost = h('div', { class: 'card pad' });
  async function loadRequests() {
    mount(reqHost, h('h2', { class: 'display card-title' }, icon('inbox', 22), 'My join requests'), ...skeletons(1, 'row'));
    try {
      const r = await get('/me/requests');
      if (!ctx.alive()) return;
      mount(reqHost, h('h2', { class: 'display card-title' }, icon('inbox', 22), 'My join requests'),
        r.items.length ? h('ul', { class: 'member-list' }, ...r.items.map((/** @type {any} */ q) => h('li', { class: 'member-row' },
          h('a', { class: 'member-main', href: `/clans/${q.clan?.slug ?? ''}` }, q.clan ? clanBadge(q.clan.emblem, q.clan.color, 40, '') : null, h('span', null, h('strong', null, q.clan?.name ?? 'Deleted clan'), h('small', null, `Sent ${ago(q.createdAt)}`))),
          pill(STATUS[q.status][0], STATUS[q.status][1]),
          q.status === 'pending' ? btn('Cancel', { variant: 'ghost', size: 'sm', onClick: (e) => busy(/** @type {HTMLElement} */ (e.currentTarget), async () => { try { await del(`/requests/${q.id}`); toast('Request cancelled.', 'success'); loadRequests(); } catch (ex) { toast(errMsg(ex), 'error'); } }) }) : null)))
          : emptyState({ icon: 'inbox', title: 'No requests yet', text: 'When you apply to an invite-only clan, the status shows up here.' }));
    } catch (e) { if (ctx.alive()) mount(reqHost, h('h2', { class: 'display card-title' }, 'My join requests'), errorState(e, loadRequests)); }
  }

  /* ----- next achievements ----- */
  const next = session.achievements.filter((a) => !a.earned).sort((a, b) => b.value / b.target - a.value / a.target).slice(0, 3);
  const earned = session.achievements.filter((a) => a.earned).length;
  const ach = h('div', { class: 'card pad' }, h('h2', { class: 'display card-title' }, icon('trophy', 22), 'Next achievements'), h('p', { class: 'muted' }, `${earned} of ${session.achievements.length} earned`),
    next.length ? h('ul', { class: 'next-list' }, ...next.map((a) => h('li', null, h('span', { class: `ach-medal ach-${a.tier}` }, glyph(a.icon, 22)), h('div', { class: 'grow' }, h('strong', null, a.title), h('small', null, a.description), meter(a.value, a.target, `${a.title} progress`)))))
      : h('p', null, 'You have earned every achievement. Legendary!'),
    h('a', { class: 'link-arrow', href: `/u/${me.handle}?tab=achievements` }, 'All achievements', icon('arrow', 16)));

  mount(ctx.root, h('section', { class: 'container page' },
    h('header', { class: 'page-head' }, h('p', { class: 'eyebrow' }, 'Dashboard'), h('h1', { class: 'display' }, `Welcome back, ${me.displayName}`),
      h('div', { class: 'cc-pills' }, me.rank ? pill(`${me.rank.label} rank`, 'gold', 'trophy') : null, me.thLevel ? pill(`Town Hall ${me.thLevel}`, '', 'tower') : null, me.verified ? pill('Verified', 'good', 'verified') : pill('Self-reported stats', 'muted'))),
    h('div', { class: 'dash-grid' }, h('div', { class: 'stack' }, clanHost, reqHost), h('div', { class: 'stack' }, checklist, ach))));
  loadClan(); loadRequests();
}
