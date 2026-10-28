import { h, icon, mount, num, ago, dateLabel } from '../dom.js';
import { get, ApiError } from '../api.js';
import { session } from '../state.js';
import { avatar, clanBadge, cover, glyph } from '../art.js';
import { btn, copyText, emptyState, errorState, meter, pill, skeletons, statTile, tabs } from '../ui.js';
import { langLabel, roleLabel } from '../components.js';

/** @param {any} a */
function achievementCard(a) {
  return h('li', { class: `ach ach-${a.tier}${a.earned ? ' is-earned' : ' is-locked'}` },
    h('div', { class: 'ach-medal' }, glyph(a.icon, 28)),
    h('div', { class: 'ach-body' },
      h('h4', null, a.title, a.earned ? h('span', { class: 'sr-only' }, ' (earned)') : h('span', { class: 'sr-only' }, ' (locked)')),
      h('p', null, a.description),
      a.earned ? h('span', { class: 'ach-done' }, icon('check', 14), 'Earned') : h('div', { class: 'ach-progress' }, meter(a.value, a.target, `${a.title} progress`), h('small', null, `${num(a.value)} / ${num(a.target)}`))));
}

/** @param {import('../router.js').PageCtx} ctx */
export default async function profile(ctx) {
  const handle = ctx.params.handle;
  ctx.setTitle('Player profile');
  mount(ctx.root, h('section', { class: 'container page' }, ...skeletons(1)));
  /** @type {{user:any, achievements:any[]}} */ let data;
  try { data = await get(`/players/${encodeURIComponent(handle)}`); } catch (e) {
    if (!ctx.alive()) return;
    ctx.setTitle(e instanceof ApiError && e.status === 404 ? 'Player not found' : 'Something went wrong');
    mount(ctx.root, h('section', { class: 'container page-state' }, e instanceof ApiError && e.status === 404
      ? emptyState({ icon: 'user', title: 'No player with that username', text: `We couldn't find @${handle}.`, actions: [btn('Browse players', { variant: 'primary', href: '/players' })] })
      : errorState(e, () => ctx.root.isConnected && profile(ctx))));
    return;
  }
  if (!ctx.alive()) return;
  const u = data.user;
  const isSelf = session.me?.handle === u.handle;
  ctx.setTitle(`${u.displayName} (@${u.handle})`);
  const earned = data.achievements.filter((a) => a.earned);
  const hasStats = u.thLevel != null || u.trophies != null || u.warStars != null;

  const sourceNote = u.verified
    ? h('p', { class: 'source-note is-verified' }, icon('verified', 16), `Verified with the official game API${u.statsSyncedAt ? ` · synced ${ago(u.statsSyncedAt)}` : ''}`)
    : h('p', { class: 'source-note' }, icon('info', 16), 'Stats are self-reported by the player and not verified.');

  const header = h('header', { class: 'profile-hero' },
    h('div', { class: 'profile-cover' }, cover(u.cover), h('div', { class: 'profile-cover-shade', 'aria-hidden': 'true' })),
    h('div', { class: 'container profile-head' },
      h('div', { class: 'profile-avatar' }, avatar(u.avatar, 132, `${u.displayName}'s avatar`)),
      h('div', { class: 'profile-id' },
        h('h1', { class: 'display' }, u.displayName, u.verified ? h('span', { class: 'verified', title: 'Verified with the official game API' }, icon('verified', 26), h('span', { class: 'sr-only' }, 'Verified account')) : null),
        h('p', { class: 'profile-handle' }, `@${u.handle}`),
        h('div', { class: 'cc-pills' },
          u.rank ? pill(`${u.rank.label} rank`, 'gold', 'trophy') : null,
          u.thLevel ? pill(`Town Hall ${u.thLevel}`, '', 'tower') : null,
          u.lookingForClan && !u.clan ? pill('Looking for a clan', 'good', 'search') : null,
          u.isDemo ? pill('Demo profile', 'muted') : null,
          u.playerTag ? h('button', { class: 'pill pill-btn mono', type: 'button', 'aria-label': `Copy player tag ${u.playerTag}`, onclick: () => copyText(u.playerTag) }, icon('copy', 14), u.playerTag) : null)),
      h('div', { class: 'profile-actions' },
        isSelf ? [btn('Edit profile', { variant: 'primary', icon: 'edit', href: '/settings' }), btn('Dashboard', { href: '/dashboard' })]
          : u.clan ? btn('View clan', { href: `/clans/${u.clan.slug}`, icon: 'shield' }) : null)));

  const stats = h('div', { class: 'card pad' },
    h('h2', { class: 'display card-title' }, icon('bolt', 22), 'Village stats'),
    hasStats
      ? h('div', { class: 'stat-grid' },
        statTile('tower', 'Town Hall', u.thLevel ?? '—'), statTile('trophy', 'Trophies', num(u.trophies), u.bestTrophies != null ? `Best ${num(u.bestTrophies)}` : undefined),
        statTile('star', 'War stars', num(u.warStars)), statTile('heart', 'Donations', num(u.donations)))
      : h('p', { class: 'muted' }, isSelf ? 'You have not added any stats yet.' : 'This player has not added any stats yet.'),
    hasStats ? sourceNote : null,
    isSelf && !hasStats ? btn('Add your stats', { variant: 'primary', href: '/settings?tab=game', icon: 'plus' }) : null);

  const about = h('div', { class: 'card pad' }, h('h2', { class: 'display card-title' }, icon('user', 22), 'About'),
    u.bio ? h('p', { class: 'bio' }, u.bio) : h('p', { class: 'muted' }, isSelf ? 'Tell people about your playstyle in Settings.' : 'This player has not written a bio yet.'));

  const clanCard = h('div', { class: 'card pad' }, h('h2', { class: 'display card-title' }, icon('shield', 22), 'Clan'),
    u.clan ? h('a', { class: 'mini-clan', href: `/clans/${u.clan.slug}` }, clanBadge(u.clan.emblem, u.clan.color, 56, ''), h('span', null, h('strong', null, u.clan.name), h('small', null, roleLabel(u.clan.role))), icon('right', 18))
      : h('p', { class: 'muted' }, u.lookingForClan ? 'Currently looking for a clan.' : 'Not in a clan.'),
    !u.clan && isSelf ? btn('Find a clan', { variant: 'primary', href: '/clans', icon: 'search' }) : null);

  const details = h('div', { class: 'card pad' }, h('h2', { class: 'display card-title' }, icon('info', 22), 'Details'),
    h('dl', { class: 'kv' },
      h('div', null, h('dt', null, 'Favourite unit'), h('dd', null, u.favoriteTroop || '—')),
      h('div', null, h('dt', null, 'Language'), h('dd', null, langLabel(u.language))),
      h('div', null, h('dt', null, 'Member since'), h('dd', null, dateLabel(u.joinedAt)))));

  /** @type {ReturnType<typeof tabs>} */ let t;
  /** @param {string} id @param {HTMLElement} panel */
  const renderTab = (id, panel) => {
    if (id === 'achievements') {
      mount(panel, h('div', { class: 'card pad' },
        h('div', { class: 'ach-summary' }, h('h2', { class: 'display card-title' }, icon('trophy', 22), 'Achievements'),
          h('p', { class: 'muted' }, `${earned.length} of ${data.achievements.length} earned`)),
        meter(earned.length, data.achievements.length, 'Achievements earned'),
        h('ul', { class: 'ach-grid' }, ...[...data.achievements].sort((a, b) => Number(b.earned) - Number(a.earned)).map(achievementCard))));
      return;
    }
    mount(panel, h('div', { class: 'profile-grid' },
      h('div', { class: 'stack' }, about, stats,
        h('div', { class: 'card pad' }, h('div', { class: 'ach-summary' }, h('h2', { class: 'display card-title' }, icon('trophy', 22), 'Latest achievements'),
          h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => t.select('achievements') }, 'See all')),
          earned.length ? h('ul', { class: 'ach-grid ach-compact' }, ...earned.slice(0, 4).map(achievementCard)) : h('p', { class: 'muted' }, isSelf ? 'Complete your profile or join a clan to earn your first achievement.' : 'No achievements earned yet.'))),
      h('div', { class: 'stack' }, clanCard, details)));
  };
  t = tabs({ label: 'Profile sections', active: ctx.query.get('tab') || 'overview', items: [{ id: 'overview', label: 'Overview', icon: 'user' }, { id: 'achievements', label: 'Achievements', icon: 'trophy', badge: undefined }],
    render: renderTab, onChange: (id) => ctx.setQuery({ tab: id === 'overview' ? '' : id }) });
  mount(ctx.root, header, h('section', { class: 'container profile-body' }, t.list, t.panel));
}
