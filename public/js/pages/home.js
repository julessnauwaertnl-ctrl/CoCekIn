import { h, icon, mount, num } from '../dom.js';
import { get } from '../api.js';
import { session } from '../state.js';
import { btn, emptyState, errorState, pill, skeletons } from '../ui.js';
import { clanCard, playerAvatar, sectionHead, typePill } from '../components.js';
import { clanBadge } from '../art.js';

/** @param {import('../router.js').PageCtx} ctx */
/**
 * Load data into a container with skeleton -> content | error(+retry).
 * @template T @param {HTMLElement} el @param {() => Promise<T>} fetcher @param {(r:T)=>any[]} render @param {() => any[]} skel
 */
function loader(el, fetcher, render, skel) {
  const run = () => {
    mount(el, ...skel());
    return fetcher().then((r) => { mount(el, ...render(r)); }).catch((e) => { mount(el, errorState(e, run)); });
  };
  return run();
}

/** Reuse an already-started request for the first call, then refetch on retries. @template T @param {Promise<T>} first @param {() => Promise<T>} again */
function reuse(first, again) { let used = false; return () => { if (used) return again(); used = true; return first; }; }

export default function home(ctx) {
  ctx.setTitle('');
  const me = session.me;

  /* ----- data (each block loads and fails independently) ----- */
  const stats = get('/stats');
  const FEATURED = '/clans?sort=match&slots=1&type=open,invite&pageSize=6';
  const featured = get(FEATURED);
  const recruits = get('/players?lfc=1&sort=trophies&pageSize=4');

  /* ----- hero ----- */
  const statList = h('ul', { class: 'hero-stats', 'aria-label': 'Community statistics' });
  const livePanel = h('aside', { class: 'hero-panel glass', 'aria-labelledby': 'live-title' });
  mount(livePanel, h('h2', { id: 'live-title', class: 'panel-title' }, icon('shield', 18), 'Recruiting right now'), ...skeletons(2, 'row'));

  stats.then((st) => {
    const items = [['Players', st.players], ['Clans', st.clans], ['Open clans', st.openClans], ['Looking for a clan', st.lookingForClan]];
    mount(statList, ...items.map(([label, v]) => h('li', null, h('strong', { class: 'display' }, num(/** @type {number} */ (v))), h('span', null, label))),
      st.demo.players + st.demo.clans > 0 ? h('li', { class: 'demo-note' }, `Includes ${st.demo.players} demo players and ${st.demo.clans} demo clans.`) : null);
  }).catch(() => mount(statList, h('li', { class: 'demo-note' }, 'Live stats are unavailable right now.')));

  featured.then((r) => {
    mount(livePanel, h('h2', { id: 'live-title', class: 'panel-title' }, icon('shield', 18), 'Recruiting right now'),
      r.items.length
        ? h('ul', { class: 'live-list' }, ...r.items.slice(0, 3).map((c) => h('li', null,
          h('a', { href: `/clans/${c.slug}`, class: 'live-item' }, clanBadge(c.emblem, c.color, 40, ''),
            h('span', { class: 'live-main' }, h('strong', null, c.name), h('small', null, `${c.stats.members}/${c.stats.capacity} members${c.minTh > 1 ? ` · TH ${c.minTh}+` : ''}`)), typePill(c.type)))))
        : h('div', { class: 'live-empty' }, h('p', null, 'No clans are recruiting yet.'), btn('Found the first clan', { variant: 'primary', size: 'sm', href: me ? '/clans/new' : '/register' })));
  }).catch(() => mount(livePanel, h('h2', { id: 'live-title', class: 'panel-title' }, 'Recruiting right now'), h('p', { class: 'muted' }, 'Could not load clans.')));

  const hero = h('section', { class: 'hero' },
    h('picture', null, h('source', { media: '(max-width: 720px)', srcset: '/assets/hero-sm.webp' }),
      h('img', { class: 'hero-img', src: '/assets/hero.webp', alt: '', width: 1920, height: 1280, fetchpriority: 'high', decoding: 'async' })),
    h('div', { class: 'hero-shade', 'aria-hidden': 'true' }),
    h('div', { class: 'container hero-inner' },
      h('div', { class: 'hero-copy' },
        h('p', { class: 'eyebrow eyebrow-glow' }, icon('sword', 16), 'Built for Clash of Clans players'),
        h('h1', { class: 'display hero-title' }, 'Find your clan.', h('span', null, 'Rule the war.')),
        h('p', { class: 'hero-lead' }, 'CoCekIn is the check-in point for Clash of Clans: showcase your village on a profile that looks the part, then discover clans that match your Town Hall, language and war style.'),
        h('div', { class: 'hero-cta' },
          btn('Find a clan', { variant: 'primary', size: 'lg', href: '/clans', icon: 'search' }),
          me ? btn('Open my dashboard', { variant: 'secondary', size: 'lg', href: '/dashboard' }) : btn('Create your profile', { variant: 'secondary', size: 'lg', href: '/register' })),
        statList),
      livePanel));

  /* ----- how it works ----- */
  const steps = h('section', { class: 'container section' },
    sectionHead('How it works', 'From lone chief to clan legend', 'Three steps. No spreadsheets, no guessing.'),
    h('div', { class: 'grid-3' },
      ...[
        ['user', 'Build your profile', 'Pick an avatar and cover, add your Town Hall, trophies and war stars, and unlock achievements as you grow.', '/register', 'Create profile'],
        ['search', 'Discover clans that fit', 'Filter by Town Hall, language, war frequency and focus. We show instantly whether you qualify.', '/clans', 'Browse clans'],
        ['crown', 'Run your own clan', 'Found a clan, set requirements, review join requests and manage roles from one place.', me ? '/clans/new' : '/register', 'Found a clan'],
      ].map(([ic, t, d, href, label], i) => h('article', { class: 'card feature' },
        h('div', { class: 'feature-ico' }, icon(ic, 28)), h('span', { class: 'feature-step' }, `0${i + 1}`),
        h('h3', { class: 'display' }, t), h('p', null, d), h('a', { class: 'link-arrow', href }, label, icon('arrow', 16))))));

  /* ----- featured clans ----- */
  const clanGrid = h('div', { class: 'grid-cards' });
  loader(clanGrid, reuse(featured, () => get(FEATURED)), (r) => (r.items.length ? r.items.map(clanCard)
    : [h('div', { class: 'span-all' }, emptyState({ icon: 'shield', title: 'No clans are recruiting yet', text: 'Be the first to found one. It takes under a minute.', actions: [btn('Found a clan', { variant: 'primary', href: me ? '/clans/new' : '/register', icon: 'plus' })] }))]), () => skeletons(3));
  const clansSection = h('section', { class: 'container section' },
    h('div', { class: 'section-row' }, sectionHead('Recruiting now', 'Clans with open spots'), btn('See all clans', { variant: 'ghost', href: '/clans', icon: 'arrow' })), clanGrid);

  /* ----- leaderboard + recruit board ----- */
  const topList = h('ol', { class: 'leader-list' });
  loader(topList, () => get('/players?sort=trophies&pageSize=5'), (r) => {
    const ranked = r.items.filter((/** @type {any} */ p) => p.trophies != null);
    return ranked.length ? ranked.map((/** @type {any} */ p, /** @type {number} */ i) => h('li', null, h('a', { href: `/u/${p.handle}`, class: 'leader-row' },
      h('span', { class: 'leader-pos display' }, i + 1), playerAvatar(p, { size: 40 }),
      h('span', { class: 'leader-main' }, h('strong', null, p.displayName), h('small', null, `TH ${p.thLevel ?? '—'}${p.clan ? ` · ${p.clan.name}` : ''}`)),
      h('span', { class: 'leader-score' }, icon('trophy', 16), num(p.trophies)))))
      : [h('li', null, emptyState({ icon: 'trophy', title: 'No ranked players yet', text: 'Add your trophies on your profile to appear here.' }))];
  }, () => skeletons(3, 'row'));

  const recruitList = h('ul', { class: 'leader-list' });
  loader(recruitList, reuse(recruits, () => get('/players?lfc=1&sort=trophies&pageSize=4')), (r) => (r.items.length
    ? r.items.map((/** @type {any} */ p) => h('li', null, h('a', { href: `/u/${p.handle}`, class: 'leader-row' }, playerAvatar(p, { size: 40 }),
      h('span', { class: 'leader-main' }, h('strong', null, p.displayName), h('small', null, `TH ${p.thLevel ?? '—'} · ${num(p.trophies)} trophies`)), pill('Recruitable', 'good'))))
    : [h('li', null, emptyState({ icon: 'users', title: 'Nobody is looking right now', text: 'Players can flag themselves as looking for a clan in their settings.' }))]), () => skeletons(2, 'row'));

  const boards = h('section', { class: 'container section' },
    h('div', { class: 'grid-2' },
      h('div', { class: 'card pad' }, h('h2', { class: 'display card-title' }, icon('trophy', 22), 'Top players'), topList, h('a', { class: 'link-arrow', href: '/players' }, 'Browse all players', icon('arrow', 16))),
      h('div', { class: 'card pad' }, h('h2', { class: 'display card-title' }, icon('search', 22), 'Looking for a clan'), h('p', { class: 'muted' }, 'Leaders: these players have asked to be recruited.'), recruitList,
        h('a', { class: 'link-arrow', href: '/players?lfc=1' }, 'See all recruits', icon('arrow', 16)))));

  /* ----- honesty section ----- */
  const trust = h('section', { class: 'container section' },
    h('div', { class: 'card trust' },
      h('div', null, sectionHead('Honest by design', 'Every number says where it came from'),
        h('p', null, 'Stats on CoCekIn are either self-reported or verified. Verified accounts prove ownership with the one-time token from the in-game settings, then sync straight from the official Clash of Clans API. You will always see which kind you are looking at.')),
      h('ul', { class: 'trust-list' },
        h('li', null, icon('check', 20), h('span', null, h('strong', null, 'Self-reported'), ' stats are labelled as such.')),
        h('li', null, icon('verified', 20), h('span', null, h('strong', null, 'Verified'), ' accounts show a badge and cannot be edited by hand.')),
        h('li', null, icon('lock', 20), h('span', null, h('strong', null, 'Your email'), ' is never shown on your public profile.')))));

  /* ----- CTA ----- */
  const cta = h('section', { class: 'container section' },
    h('div', { class: 'cta-band' },
      h('img', { src: '/assets/join.webp', alt: '', loading: 'lazy', width: 800, height: 450 }),
      h('div', { class: 'cta-shade', 'aria-hidden': 'true' }),
      h('div', { class: 'cta-copy' }, h('h2', { class: 'display' }, 'Your clan is waiting at the gates.'), h('p', null, 'Create a free profile in under a minute.'),
        me ? btn('Find a clan', { variant: 'primary', size: 'lg', href: '/clans' }) : btn('Join CoCekIn free', { variant: 'primary', size: 'lg', href: '/register' }))));

  mount(ctx.root, hero, steps, clansSection, boards, trust, cta);
}
