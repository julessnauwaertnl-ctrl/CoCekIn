import { h, icon, mount, num, dateLabel, ago } from '../dom.js';
import { ApiError, del, get, patch, post } from '../api.js';
import { refreshMe, session } from '../state.js';
import { navigate } from '../router.js';
import { clanBadge, cover } from '../art.js';
import { btn, busy, confirmDialog, copyText, emptyState, errMsg, errorState, meter, pill, skeletons, statTile, tabs, toast } from '../ui.js';
import { fitPill, focusLabel, langLabel, playerAvatar, roleLabel, typePill, warLabel } from '../components.js';
import { clanForm } from './clan-form.js';
import { CLAN_ROLES } from '../../../shared/game.js';

const rank = (/** @type {string|null|undefined} */ r) => CLAN_ROLES.find((x) => x.key === r)?.rank ?? 0;

/** @param {import('../router.js').PageCtx} ctx */
export default async function clanPage(ctx) {
  const slug = ctx.params.slug;
  ctx.setTitle('Clan');
  let activeTab = ctx.query.get('tab') || 'overview';
  /** @type {any} */ let data = null;

  const host = h('div', null);
  mount(ctx.root, host);

  async function load(showSkeleton = false) {
    if (showSkeleton) mount(host, h('section', { class: 'container page' }, ...skeletons(2)));
    try {
      const fresh = await get(`/clans/${encodeURIComponent(slug)}`);
      if (!ctx.alive()) return;
      data = fresh;
      paint();
    } catch (e) {
      if (!ctx.alive()) return;
      if (e instanceof ApiError && e.status === 404) {
        ctx.setTitle('Clan not found');
        mount(host, h('section', { class: 'container page-state' }, emptyState({ icon: 'shield', title: 'That clan does not exist', text: 'It may have been renamed or disbanded.', actions: [btn('Browse clans', { variant: 'primary', href: '/clans' })] })));
      } else { ctx.setTitle('Something went wrong'); mount(host, h('section', { class: 'container page-state' }, errorState(e, () => load(true)))); }
    }
  }

  /** Run a mutation with a busy button, toast, and reload. @param {HTMLElement} button @param {() => Promise<any>} fn @param {string} okMsg @param {boolean} [refreshSession] */
  async function act(button, fn, okMsg, refreshSession = false) {
    await busy(button, async () => {
      try { await fn(); if (okMsg) toast(okMsg, 'success'); if (refreshSession) await refreshMe(); await load(); } catch (e) { toast(errMsg(e), 'error'); }
    });
  }

  function paint() {
    const { clan, members, viewer } = data;
    const me = session.me;
    ctx.setTitle(clan.name);
    const role = viewer.role;
    const myRank = rank(role);

    /* ----- actions ----- */
    /** @type {any[]} */ const actions = [];
    if (role) {
      if (role === 'leader') actions.push(pill('You lead this clan', 'gold', 'crown'));
      else actions.push(btn('Leave clan', { variant: 'ghost', icon: 'logout', onClick: async (e) => {
        const ok = await confirmDialog({ title: `Leave ${clan.name}?`, body: 'You can rejoin later if the clan is still recruiting and you meet the requirements.', confirmLabel: 'Leave clan', danger: true });
        if (ok) act(/** @type {HTMLElement} */ (e.currentTarget), () => post(`/clans/${slug}/leave`), `You left ${clan.name}.`, true);
      } }));
    } else if (viewer.pendingRequest) {
      actions.push(pill('Request pending', 'warn', 'clock'), btn('Cancel request', { variant: 'ghost', onClick: (e) => act(/** @type {HTMLElement} */ (e.currentTarget), () => del(`/requests/${viewer.pendingRequest.id}`), 'Request cancelled.') }));
    } else if (viewer.join.reason === 'signed_out') {
      actions.push(btn('Sign in to join', { variant: 'primary', size: 'lg', href: `/login?next=${encodeURIComponent(`/clans/${slug}`)}`, icon: 'user' }));
    } else if (viewer.join.allowed) {
      actions.push(clan.type === 'open'
        ? btn('Join clan', { variant: 'primary', size: 'lg', icon: 'plus', onClick: (e) => act(/** @type {HTMLElement} */ (e.currentTarget), () => post(`/clans/${slug}/join`), `Welcome to ${clan.name}!`, true) })
        : btn('Request to join', { variant: 'primary', size: 'lg', icon: 'inbox', onClick: async (e) => {
          const btnEl = /** @type {HTMLElement} */ (e.currentTarget);
          const msg = await confirmDialog({ title: `Request to join ${clan.name}`, body: 'Tell the leaders a bit about yourself. This is optional.', confirmLabel: 'Send request', textarea: { label: 'Message (optional)', maxlength: 200, hint: 'Activity, war availability, why this clan?' } });
          if (msg !== '') act(btnEl, () => post(`/clans/${slug}/join`, { message: String(msg).trim() }), 'Request sent. You will see the result on your dashboard.');
        } }));
    } else {
      actions.push(h('div', { class: 'cant-join' }, pill(viewer.join.message || 'You cannot join this clan.', 'warn', 'alert'),
        ['th_unknown', 'trophies_unknown', 'th_too_low', 'trophies_too_low'].includes(viewer.join.reason) ? h('a', { class: 'link-arrow', href: '/settings?tab=game' }, 'Update my stats', icon('arrow', 16)) : null));
    }

    /* ----- header ----- */
    const header = h('header', { class: 'clan-hero' },
      h('div', { class: 'clan-cover' }, cover(clan.banner), h('div', { class: 'profile-cover-shade', 'aria-hidden': 'true' })),
      h('div', { class: 'container clan-head' },
        h('div', { class: 'clan-badge' }, clanBadge(clan.emblem, clan.color, 120, `${clan.name} badge`)),
        h('div', { class: 'profile-id' },
          h('h1', { class: 'display' }, clan.name),
          h('div', { class: 'cc-pills' }, typePill(clan.type), pill(langLabel(clan.language), '', 'globe'), pill(warLabel(clan.warFrequency), '', 'sword'), pill(focusLabel(clan.focus), '', 'flame'),
            clan.tag ? h('button', { class: 'pill pill-btn mono', type: 'button', 'aria-label': `Copy clan tag ${clan.tag}`, onclick: () => copyText(clan.tag) }, icon('copy', 14), clan.tag) : null,
            clan.isDemo ? pill('Demo clan', 'muted') : null)),
        h('div', { class: 'profile-actions' }, ...actions)));

    /* ----- stats ----- */
    const st = clan.stats;
    const statsRow = h('div', { class: 'container' }, h('div', { class: 'stat-grid stat-grid-5' },
      h('div', { class: 'stat-tile' }, h('div', { class: 'stat-ico' }, icon('users', 22)), h('div', { class: 'grow' }, h('div', { class: 'stat-val display' }, `${st.members}/${st.capacity}`), h('div', { class: 'stat-label' }, 'Members'), meter(st.members, st.capacity, 'Clan capacity'))),
      statTile('tower', 'Average Town Hall', st.avgTh ?? '—'), statTile('trophy', 'Total trophies', num(st.totalTrophies)), statTile('star', 'Total war stars', num(st.totalWarStars)),
      statTile('lock', 'Requirements', clan.minTh > 1 || clan.minTrophies > 0 ? `TH ${clan.minTh}+` : 'None', clan.minTrophies > 0 ? `${num(clan.minTrophies)}+ trophies` : undefined)));

    /* ----- tabs ----- */
    const items = [{ id: 'overview', label: 'Overview', icon: 'info' }, { id: 'members', label: `Members (${members.length})`, icon: 'users' }];
    if (viewer.canEdit) items.push({ id: 'requests', label: 'Requests', icon: 'inbox', badge: viewer.pendingCount || undefined }, { id: 'settings', label: 'Settings', icon: 'sliders' });
    if (!items.some((i) => i.id === activeTab)) activeTab = 'overview';
    /** @type {ReturnType<typeof tabs>} */
    // eslint-disable-next-line prefer-const
    let t;
    t = tabs({ label: 'Clan sections', active: activeTab, items, onChange: (id) => { activeTab = id; ctx.setQuery({ tab: id === 'overview' ? '' : id }); },
      render: (id, panel) => { if (id === 'overview') overview(panel); else if (id === 'members') membersTab(panel); else if (id === 'requests') requestsTab(panel); else settingsTab(panel); } });
    mount(host, header, statsRow, h('section', { class: 'container profile-body' }, t.list, t.panel));

    /* ----- tab renderers (close over data) ----- */
    /** @param {HTMLElement} panel */
    function overview(panel) {
      mount(panel, h('div', { class: 'profile-grid' },
        h('div', { class: 'stack' },
          h('div', { class: 'card pad' }, h('h2', { class: 'display card-title' }, icon('info', 22), 'About this clan'), clan.description ? h('p', { class: 'bio' }, clan.description) : h('p', { class: 'muted' }, 'This clan has not written a description yet.')),
          h('div', { class: 'card pad' }, h('h2', { class: 'display card-title' }, icon('sword', 22), 'Play style'),
            h('dl', { class: 'kv' }, h('div', null, h('dt', null, 'Clan wars'), h('dd', null, warLabel(clan.warFrequency))), h('div', null, h('dt', null, 'Focus'), h('dd', null, focusLabel(clan.focus))), h('div', null, h('dt', null, 'Main language'), h('dd', null, langLabel(clan.language))))),
          h('div', { class: 'card pad' }, h('div', { class: 'ach-summary' }, h('h2', { class: 'display card-title' }, icon('trophy', 22), 'Top members'),
            h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => t.select('members') }, 'See all')),
            h('ol', { class: 'leader-list' }, ...[...members].filter((/** @type {any} */ m) => m.trophies != null).sort((/** @type {any} */ a, /** @type {any} */ b) => b.trophies - a.trophies).slice(0, 5).map((/** @type {any} */ m, /** @type {number} */ i) => h('li', null,
              h('a', { href: `/u/${m.handle}`, class: 'leader-row' }, h('span', { class: 'leader-pos display' }, i + 1), playerAvatar(m, { size: 40 }),
                h('span', { class: 'leader-main' }, h('strong', null, m.displayName), h('small', null, `TH ${m.thLevel ?? '—'} · ${roleLabel(m.clan?.role)}`)), h('span', { class: 'leader-score' }, icon('trophy', 16), num(m.trophies)))))),
            members.some((/** @type {any} */ m) => m.trophies != null) ? null : h('p', { class: 'muted' }, 'Members have not added their trophies yet.'))),
        h('div', { class: 'stack' },
          h('div', { class: 'card pad' }, h('h2', { class: 'display card-title' }, icon('lock', 22), 'Requirements'),
            h('dl', { class: 'kv' }, h('div', null, h('dt', null, 'Town Hall'), h('dd', null, clan.minTh > 1 ? `${clan.minTh}+` : 'Any')), h('div', null, h('dt', null, 'Trophies'), h('dd', null, clan.minTrophies > 0 ? `${num(clan.minTrophies)}+` : 'Any')),
              h('div', null, h('dt', null, 'Joining'), h('dd', null, clan.type === 'open' ? 'Instant' : clan.type === 'invite' ? 'By request' : 'Closed'))),
            viewer.join.reason !== 'signed_out' && !role ? h('div', { class: 'cc-pills' }, fitPill({ allowed: viewer.join.allowed, reason: viewer.join.reason, message: viewer.join.message })) : null),
          clan.leader ? h('div', { class: 'card pad' }, h('h2', { class: 'display card-title' }, icon('crown', 22), 'Leader'),
            h('a', { class: 'mini-clan', href: `/u/${clan.leader.handle}` }, ...(() => { const m = members.find((/** @type {any} */ x) => x.handle === clan.leader.handle); return [m ? playerAvatar(m, { size: 48 }) : null, h('span', null, h('strong', null, clan.leader.displayName), h('small', null, `@${clan.leader.handle}`)), icon('right', 18)]; })())) : null,
          h('p', { class: 'muted small' }, `Founded ${dateLabel(clan.createdAt)}`))));
    }

    /** @param {HTMLElement} panel */
    function membersTab(panel) {
      mount(panel, h('div', { class: 'card pad' }, h('h2', { class: 'display card-title' }, icon('users', 22), 'Members'),
        h('ul', { class: 'member-list' }, ...members.map((/** @type {any} */ m, /** @type {number} */ i) => memberRow(m, i)))));
    }

    /** @param {any} m @param {number} i */
    function memberRow(m, i) {
      const mine = me?.handle === m.handle;
      const mRank = rank(m.clan?.role);
      const canKick = myRank >= 3 && myRank > mRank && !mine;
      const canRole = myRank === 4 && !mine;
      const roleSel = canRole ? h('select', { class: 'inline-select', 'aria-label': `Role for ${m.displayName}`, value: m.clan.role === 'leader' ? '' : m.clan.role,
        onchange: (/** @type {Event} */ e) => { const el = /** @type {HTMLSelectElement} */ (e.target); act(el, () => post(`/clans/${slug}/members/${m.handle}/role`, { role: el.value }), `${m.displayName} is now ${roleLabel(el.value)}.`); } },
        ...['member', 'elder', 'coleader'].map((r) => h('option', { value: r }, roleLabel(r)))) : null;
      return h('li', { class: 'member-row' },
        h('span', { class: 'member-pos' }, i + 1),
        h('a', { class: 'member-main', href: `/u/${m.handle}` }, playerAvatar(m, { size: 44 }), h('span', null, h('strong', null, m.displayName, mine ? h('span', { class: 'you' }, ' (you)') : null, m.verified ? h('span', { class: 'verified' }, icon('verified', 14), h('span', { class: 'sr-only' }, 'Verified')) : null), h('small', null, `@${m.handle}`))),
        h('span', { class: 'member-meta' }, pill(roleLabel(m.clan?.role), m.clan?.role === 'leader' ? 'gold' : m.clan?.role === 'coleader' ? 'good' : m.clan?.role === 'elder' ? 'warn' : 'muted'),
          h('span', { class: 'member-stat' }, icon('tower', 14), m.thLevel ?? '—'), h('span', { class: 'member-stat' }, icon('trophy', 14), num(m.trophies))),
        canRole || canKick ? h('span', { class: 'member-actions' }, roleSel,
          canRole ? btn('Make leader', { variant: 'ghost', size: 'sm', onClick: async (e) => { const b = /** @type {HTMLElement} */ (e.currentTarget);
            if (await confirmDialog({ title: `Make ${m.displayName} the leader?`, body: 'You will become a co-leader. Only the new leader can undo this.', confirmLabel: 'Transfer leadership', danger: true })) act(b, () => post(`/clans/${slug}/transfer`, { handle: m.handle }), `${m.displayName} now leads ${clan.name}.`, true); } }) : null,
          canKick ? btn('Remove', { variant: 'ghost', size: 'sm', icon: 'trash', label: `Remove ${m.displayName}`, onClick: async (e) => { const b = /** @type {HTMLElement} */ (e.currentTarget);
            if (await confirmDialog({ title: `Remove ${m.displayName}?`, body: 'They will be taken out of the clan and can apply again later.', confirmLabel: 'Remove member', danger: true })) act(b, () => del(`/clans/${slug}/members/${m.handle}`), `${m.displayName} was removed.`); } }) : null) : null);
    }

    /** @param {HTMLElement} panel */
    async function requestsTab(panel) {
      mount(panel, h('div', { class: 'card pad' }, ...skeletons(2, 'row')));
      try {
        const r = await get(`/clans/${slug}/requests`);
        if (!ctx.alive()) return;
        mount(panel, h('div', { class: 'card pad' }, h('h2', { class: 'display card-title' }, icon('inbox', 22), 'Join requests'),
          r.items.length ? h('ul', { class: 'member-list' }, ...r.items.map((/** @type {any} */ q) => h('li', { class: 'member-row request-row' },
            h('a', { class: 'member-main', href: `/u/${q.applicant.handle}` }, playerAvatar(q.applicant, { size: 44 }), h('span', null, h('strong', null, q.applicant.displayName), h('small', null, `TH ${q.applicant.thLevel ?? '—'} · ${num(q.applicant.trophies)} trophies · ${ago(q.createdAt)}`))),
            q.meetsRequirements ? pill('Meets requirements', 'good', 'check') : pill('Below requirements', 'warn', 'alert'),
            q.message ? h('p', { class: 'request-msg' }, `“${q.message}”`) : null,
            h('span', { class: 'member-actions' },
              btn('Decline', { variant: 'ghost', size: 'sm', onClick: (e) => act(/** @type {HTMLElement} */ (e.currentTarget), () => post(`/clans/${slug}/requests/${q.id}/decline`), 'Request declined.') }),
              btn('Accept', { variant: 'primary', size: 'sm', icon: 'check', onClick: (e) => act(/** @type {HTMLElement} */ (e.currentTarget), () => post(`/clans/${slug}/requests/${q.id}/accept`), `${q.applicant.displayName} joined the clan.`) })))))
            : emptyState({ icon: 'inbox', title: 'No pending requests', text: clan.type === 'invite' ? 'New applications will show up here.' : 'Your clan is not set to invite-only, so players join instantly. Switch it in Settings to review applicants first.' })));
      } catch (e) { if (ctx.alive()) mount(panel, errorState(e, () => requestsTab(panel))); }
    }

    /** @param {HTMLElement} panel */
    function settingsTab(panel) {
      const form = clanForm({ ...clan, tag: clan.tag ?? '' });
      const formError = h('p', { class: 'form-error', role: 'alert', hidden: true });
      const save = h('button', { class: 'btn btn-primary', type: 'submit' }, icon('check', 18), h('span', null, 'Save changes'));
      const formEl = h('form', { class: 'card pad', novalidate: true, onsubmit: async (/** @type {Event} */ e) => {
        e.preventDefault(); formError.hidden = true;
        await busy(save, async () => {
          try { await patch(`/clans/${slug}`, form.values()); toast('Clan settings saved.', 'success'); await load(); }
          catch (err) { if (!form.errors(err)) { formError.textContent = errMsg(err); formError.hidden = false; } }
        });
      } }, form.el, formError, h('div', { class: 'form-actions' }, save));
      /** @type {any[]} */ const kids = [formEl];
      if (viewer.isLeader) {
        kids.push(h('div', { class: 'card pad danger-zone' }, h('h2', { class: 'display card-title' }, icon('alert', 22), 'Danger zone'),
          h('p', null, 'Deleting a clan removes it for everyone. Members are released and can join other clans. This cannot be undone.'),
          btn('Delete clan', { variant: 'danger', icon: 'trash', onClick: async (e) => {
            const b = /** @type {HTMLElement} */ (e.currentTarget);
            const typed = await confirmDialog({ title: `Delete ${clan.name}?`, body: 'This permanently deletes the clan.', confirmLabel: 'Delete clan', danger: true, typeToConfirm: clan.name });
            if (typed) await busy(b, async () => { try { await del(`/clans/${slug}`, { confirmName: String(typed) }); await refreshMe(); toast('Clan deleted.', 'success'); navigate('/clans'); } catch (err) { toast(errMsg(err), 'error'); } });
          } })));
      }
      mount(panel, h('div', { class: 'stack' }, ...kids));
    }
  }

  await load(true);
}
