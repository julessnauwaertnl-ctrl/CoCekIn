// Entity components shared by several pages so clans/players look identical everywhere.
import { h, icon, num } from './dom.js';
import { avatar, clanBadge } from './art.js';
import { pill, meter } from './ui.js';
import { CLAN_ROLES, CLAN_TYPES, FOCUSES, LANGUAGES, WAR_FREQUENCIES } from '../../shared/game.js';

/** @param {readonly {key:string,label:string}[]} list @param {string|null|undefined} key */
export const labelOf = (list, key) => list.find((x) => x.key === key)?.label ?? key ?? '';
export const roleLabel = (/** @type {string|null|undefined} */ r) => CLAN_ROLES.find((x) => x.key === r)?.label ?? '';
export const typeLabel = (/** @type {string} */ t) => labelOf(CLAN_TYPES, t);
export const warLabel = (/** @type {string} */ t) => labelOf(WAR_FREQUENCIES, t);
export const focusLabel = (/** @type {string} */ t) => labelOf(FOCUSES, t);
export const langLabel = (/** @type {string} */ t) => labelOf(LANGUAGES, t);

/** @param {string} type */
export const typePill = (type) => pill(typeLabel(type), type === 'open' ? 'good' : type === 'invite' ? 'warn' : 'muted', type === 'closed' ? 'lock' : type === 'open' ? 'users' : 'inbox');

/** @param {{allowed:boolean, reason:string|null, message:string|null}|null|undefined} fit */
export function fitPill(fit) {
  if (!fit) return null;
  if (fit.allowed) return pill('You qualify', 'good', 'check');
  if (['member', 'in_other_clan', 'signed_out'].includes(String(fit.reason))) return null;
  if (fit.reason === 'full') return pill('Full', 'muted');
  if (fit.reason === 'closed') return null;
  return pill(fit.message?.replace(/\s*\(.*\)\.?$/, '').replace(/\.$/, '') || 'Requirements not met', 'warn', 'alert');
}

/** @param {any} user @param {{size?:number}} [o] */
export const playerAvatar = (user, o = {}) => avatar(user.avatar, o.size || 44, `${user.displayName}'s avatar`);

/** @param {any} c */
export function clanCard(c) {
  const full = c.stats.members >= c.stats.capacity;
  const reqs = [c.minTh > 1 ? `TH ${c.minTh}+` : null, c.minTrophies > 0 ? `${num(c.minTrophies)}+ trophies` : null].filter(Boolean);
  return h('article', { class: 'card clan-card' },
    h('div', { class: 'cc-head' },
      clanBadge(c.emblem, c.color, 56, ''),
      h('div', { class: 'cc-title' },
        h('h3', null, h('a', { href: `/clans/${c.slug}`, class: 'stretched' }, c.name)),
        h('div', { class: 'cc-sub' }, c.tag ? h('span', { class: 'mono' }, c.tag) : null, c.isDemo ? pill('Demo', 'muted') : null))),
    h('p', { class: 'cc-desc' }, c.description || 'No description yet.'),
    h('div', { class: 'cc-pills' }, typePill(c.type), pill(langLabel(c.language), '', 'globe'), pill(focusLabel(c.focus), '', 'sword'), fitPill(c.fit)),
    h('dl', { class: 'cc-stats' },
      h('div', null, h('dt', null, 'Members'), h('dd', null, `${c.stats.members}/${c.stats.capacity}`, meter(c.stats.members, c.stats.capacity, 'Clan capacity'))),
      h('div', null, h('dt', null, 'Avg. TH'), h('dd', null, c.stats.avgTh ?? '—')),
      h('div', null, h('dt', null, 'Trophies'), h('dd', null, num(c.stats.totalTrophies))),
      h('div', null, h('dt', null, 'Wars'), h('dd', null, warLabel(c.warFrequency)))),
    h('div', { class: 'cc-foot' },
      h('span', { class: 'cc-req' }, icon('tower', 16), reqs.length ? reqs.join(' · ') : 'Everyone welcome'),
      full ? pill('Full', 'muted') : h('span', { class: 'cc-go' }, 'View clan', icon('arrow', 16))));
}

/** @param {any} p */
export function playerCard(p) {
  return h('article', { class: 'card player-card' },
    h('div', { class: 'pc-head' }, playerAvatar(p, { size: 56 }),
      h('div', { class: 'pc-title' },
        h('h3', null, h('a', { href: `/u/${p.handle}`, class: 'stretched' }, p.displayName), p.verified ? h('span', { class: 'verified', title: 'Verified with the official game API' }, icon('verified', 16), h('span', { class: 'sr-only' }, 'Verified')) : null),
        h('div', { class: 'cc-sub' }, `@${p.handle}`, p.isDemo ? pill('Demo', 'muted') : null))),
    h('dl', { class: 'cc-stats' },
      h('div', null, h('dt', null, 'Town Hall'), h('dd', null, p.thLevel ?? '—')),
      h('div', null, h('dt', null, 'Trophies'), h('dd', null, num(p.trophies))),
      h('div', null, h('dt', null, 'War stars'), h('dd', null, num(p.warStars))),
      h('div', null, h('dt', null, 'Rank'), h('dd', null, p.rank?.label ?? '—'))),
    h('div', { class: 'cc-pills' },
      p.clan ? pill(p.clan.name, '', 'shield') : p.lookingForClan ? pill('Looking for a clan', 'good', 'search') : pill('No clan', 'muted'),
      pill(langLabel(p.language), '', 'globe')));
}

/** A small heading used above sections. @param {string} eyebrow @param {string} title @param {string} [sub] */
export const sectionHead = (eyebrow, title, sub) => h('header', { class: 'section-head' },
  h('p', { class: 'eyebrow' }, eyebrow), h('h2', { class: 'display' }, title), sub ? h('p', { class: 'lead' }, sub) : null);
