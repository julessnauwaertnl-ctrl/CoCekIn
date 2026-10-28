import { h, icon, mount, ago } from '../dom.js';
import { del, patch, post } from '../api.js';
import { session, setMe } from '../state.js';
import { navigate } from '../router.js';
import { avatar, cover } from '../art.js';
import { btn, busy, confirmDialog, errMsg, field, picker, showFieldErrors, tabs, toast, toggle } from '../ui.js';
import { AVATARS, COVERS, LANGUAGES, MAX_TH, TROOPS } from '../../../shared/game.js';

/** @param {any} f @param {(v:string)=>any} conv */
const val = (f, conv) => (f.value === '' ? null : conv(f.value));

/** @param {import('../router.js').PageCtx} ctx */
export default function settings(ctx) {
  ctx.setTitle('Settings');
  const u = () => session.me;

  /** Build a card containing a form with standard submit/busy/error handling. @param {string} title @param {string} subtitle @param {any[]} body @param {(btn:HTMLElement)=>Promise<void>} onSave @param {Record<string,any>} fields */
  function formCard(title, subtitle, body, onSave, fields, saveLabel = 'Save changes') {
    const err = h('p', { class: 'form-error', role: 'alert', hidden: true });
    const save = h('button', { class: 'btn btn-primary', type: 'submit' }, icon('check', 18), h('span', null, saveLabel));
    const form = h('form', { class: 'card pad', novalidate: true, onsubmit: async (/** @type {Event} */ e) => {
      e.preventDefault(); err.hidden = true;
      await busy(save, async () => { try { await onSave(save); } catch (ex) { if (!showFieldErrors(fields, ex)) { err.textContent = errMsg(ex); err.hidden = false; } } });
    } }, h('h2', { class: 'display card-title' }, title), subtitle ? h('p', { class: 'muted' }, subtitle) : null, ...body, err, h('div', { class: 'form-actions' }, save));
    return form;
  }

  /** @param {HTMLElement} panel */
  function profileTab(panel) {
    const me = u();
    const f = {
      displayName: field({ label: 'Display name', name: 'displayName', value: me.displayName, required: true, maxlength: 30 }),
      bio: field({ label: 'Bio', name: 'bio', type: 'textarea', value: me.bio, rows: 4, maxlength: 280, hint: 'Up to 280 characters. Playstyle, availability, favourite attack.' }),
      language: field({ label: 'Language', name: 'language', type: 'select', value: me.language, options: LANGUAGES.map((l) => ({ value: l.key, label: l.label })) }),
    };
    const lfc = toggle({ label: 'I am looking for a clan', hint: 'Shows you on the recruit board so leaders can find you.', checked: me.lookingForClan });
    const email = h('p', { class: 'muted small' }, icon('lock', 14), ` Signed in as ${me.email}. Your email is never shown publicly.`);
    mount(panel, formCard('Profile', 'This is how other players see you.', [f.displayName.el, f.bio.el, f.language.el, lfc.el, email], async () => {
      setMe(await patch('/me', { displayName: f.displayName.value, bio: f.bio.value, language: f.language.value, lookingForClan: lfc.input.checked }));
      toast('Profile saved.', 'success');
    }, f));
  }

  /** @param {HTMLElement} panel */
  function gameTab(panel) {
    const me = u();
    const locked = me.verified && me.statsSource === 'api';
    const f = {
      playerTag: field({ label: 'Player tag', name: 'playerTag', value: me.playerTag ?? '', placeholder: '#2PP0LRQ', maxlength: 14, autocomplete: 'off', hint: 'Found on your in-game profile. Changing it removes verification.' }),
      thLevel: field({ label: 'Town Hall level', name: 'thLevel', type: 'select', value: me.thLevel == null ? '' : String(me.thLevel), disabled: locked,
        options: [{ value: '', label: 'Not set' }, ...Array.from({ length: MAX_TH }, (_, i) => ({ value: String(MAX_TH - i), label: `Town Hall ${MAX_TH - i}` }))] }),
      trophies: field({ label: 'Trophies', name: 'trophies', type: 'number', value: me.trophies, inputmode: 'numeric', min: 0, max: 10000, disabled: locked }),
      bestTrophies: field({ label: 'Best trophies', name: 'bestTrophies', type: 'number', value: me.bestTrophies, inputmode: 'numeric', min: 0, max: 10000, disabled: locked }),
      warStars: field({ label: 'War stars', name: 'warStars', type: 'number', value: me.warStars, inputmode: 'numeric', min: 0, max: 100000, disabled: locked }),
      donations: field({ label: 'Donations', name: 'donations', type: 'number', value: me.donations, inputmode: 'numeric', min: 0, disabled: locked }),
      favoriteTroop: field({ label: 'Favourite unit', name: 'favoriteTroop', type: 'select', value: me.favoriteTroop ?? '', options: [{ value: '', label: 'Not set' }, ...TROOPS.map((t) => ({ value: t, label: t }))] }),
    };
    const note = locked
      ? h('p', { class: 'callout callout-good' }, icon('verified', 18), h('span', null, `Verified account. Stats sync from the official API${me.statsSyncedAt ? ` (last synced ${ago(me.statsSyncedAt)})` : ''} and cannot be edited by hand.`))
      : h('p', { class: 'callout' }, icon('info', 18), h('span', null, 'These stats are shown as self-reported. Verify your account below to get a verified badge with synced stats.'));
    const stats = formCard('Game stats', 'Used for clan requirements, your profile and achievements.', [note, f.playerTag.el, h('div', { class: 'form-row' }, f.thLevel.el, f.trophies.el), h('div', { class: 'form-row' }, f.bestTrophies.el, f.warStars.el, f.donations.el), f.favoriteTroop.el], async () => {
      /** @type {Record<string, any>} */ const body = { playerTag: f.playerTag.value.trim() || null, favoriteTroop: f.favoriteTroop.value || null };
      if (!locked) Object.assign(body, { thLevel: val(f.thLevel, Number), trophies: val(f.trophies, Number), bestTrophies: val(f.bestTrophies, Number), warStars: val(f.warStars, Number), donations: val(f.donations, Number) });
      setMe(await patch('/me', body));
      toast('Game stats saved.', 'success');
      if (ctx.alive()) gameTab(panel);
    }, f);

    /* verification */
    /** @type {HTMLElement} */ let verifyCard;
    if (!session.meta.cocApi) {
      verifyCard = h('div', { class: 'card pad' }, h('h2', { class: 'display card-title' }, icon('verified', 22), 'Verify your account'),
        h('p', { class: 'muted' }, 'Account verification is not enabled on this server yet. The site owner needs to add a Clash of Clans API key. Until then, stats are shown as self-reported.'));
    } else if (me.verified) {
      const sync = btn('Sync now', { variant: 'secondary', icon: 'refresh', onClick: (e) => busy(/** @type {HTMLElement} */ (e.currentTarget), async () => { try { setMe(await post('/me/sync')); toast('Stats synced from the game.', 'success'); gameTab(panel); } catch (ex) { toast(errMsg(ex), 'error'); } }) });
      verifyCard = h('div', { class: 'card pad' }, h('h2', { class: 'display card-title' }, icon('verified', 22), 'Account verified'),
        h('p', null, `${me.playerTag} is linked to your account.`), sync);
    } else {
      const vf = { playerTag: field({ label: 'Player tag', name: 'playerTag', value: me.playerTag ?? '', required: true, placeholder: '#2PP0LRQ', maxlength: 14 }), apiToken: field({ label: 'API token', name: 'apiToken', type: 'password', required: true, autocomplete: 'off', maxlength: 64, hint: 'One-time token from the game. It is only used to confirm ownership and is never stored.' }) };
      verifyCard = formCard('Verify your account', 'Prove you own the village and unlock a verified badge with automatically synced stats.', [
        h('ol', { class: 'steps' }, h('li', null, 'Open Clash of Clans → Settings → More Settings.'), h('li', null, 'Tap “Show” next to API Token and copy it.'), h('li', null, 'Paste your player tag and the token below.')),
        vf.playerTag.el, vf.apiToken.el], async () => {
        setMe(await post('/me/verify', { playerTag: vf.playerTag.value, apiToken: vf.apiToken.value }));
        toast('Account verified. Welcome, Chief!', 'success');
        gameTab(panel);
      }, vf, 'Verify account');
    }
    mount(panel, h('div', { class: 'stack' }, stats, verifyCard));
  }

  /** @param {HTMLElement} panel */
  function appearanceTab(panel) {
    const me = u();
    const previewAv = h('div', { class: 'ap-avatar' }, avatar(me.avatar, 96, ''));
    const previewCover = h('div', { class: 'ap-cover' }, cover(me.cover));
    const avPick = picker({ legend: 'Avatar', name: 'avatar', value: me.avatar, cls: 'picker-avatars', onChange: (v) => mount(previewAv, avatar(v, 96, '')),
      options: AVATARS.map((a) => ({ value: a, label: a.replace('-', ' '), face: () => avatar(a, 44, '') })) });
    const coverPick = picker({ legend: 'Cover', name: 'cover', value: me.cover, cls: 'picker-covers', onChange: (v) => mount(previewCover, cover(v)),
      options: COVERS.map((c) => ({ value: c.key, label: c.label, face: () => h('span', { class: 'cover-thumb' }, cover(c.key), h('small', null, c.label)) })) });
    mount(panel, formCard('Appearance', 'Pick the avatar and cover that represent your village.', [
      h('div', { class: 'appearance-preview', 'aria-hidden': 'true' }, previewCover, previewAv), avPick.el, coverPick.el], async () => {
      setMe(await patch('/me', { avatar: avPick.value, cover: coverPick.value }));
      toast('Appearance saved.', 'success');
    }, {}));
  }

  /** @param {HTMLElement} panel */
  function securityTab(panel) {
    const f = {
      currentPassword: field({ label: 'Current password', name: 'currentPassword', type: 'password', required: true, autocomplete: 'current-password', maxlength: 128 }),
      newPassword: field({ label: 'New password', name: 'newPassword', type: 'password', required: true, autocomplete: 'new-password', maxlength: 128, hint: 'At least 10 characters. Other devices will be signed out.' }),
    };
    const pw = formCard('Change password', '', [f.currentPassword.el, f.newPassword.el], async () => {
      await post('/me/password', { currentPassword: f.currentPassword.value, newPassword: f.newPassword.value });
      f.currentPassword.input.value = ''; f.newPassword.input.value = '';
      toast('Password updated. Other devices were signed out.', 'success');
    }, f, 'Update password');

    const dp = field({ label: 'Your password', name: 'password', type: 'password', required: true, autocomplete: 'current-password', maxlength: 128 });
    const dangerBtn = btn('Delete my account', { variant: 'danger', icon: 'trash', onClick: async (e) => {
      const b = /** @type {HTMLElement} */ (e.currentTarget);
      dp.setError(null);
      if (!dp.value) { dp.setError('Enter your password to continue.'); dp.input.focus(); return; }
      const ok = await confirmDialog({ title: 'Delete your account?', body: 'Your profile, join requests and sessions will be permanently deleted. If you lead a clan on your own, it is deleted too.', confirmLabel: 'Delete forever', danger: true });
      if (!ok) return;
      await busy(b, async () => {
        try { await del('/me', { password: dp.value }); setMe(null); toast('Your account was deleted.', 'success'); navigate('/'); } catch (ex) { if (!showFieldErrors({ password: dp }, ex)) toast(errMsg(ex), 'error'); }
      });
    } });
    mount(panel, h('div', { class: 'stack' }, pw, h('div', { class: 'card pad danger-zone' }, h('h2', { class: 'display card-title' }, icon('alert', 22), 'Delete account'),
      h('p', null, 'This cannot be undone. If you lead a clan with other members you must transfer leadership first.'), dp.el, dangerBtn)));
  }

  const t = tabs({ label: 'Settings sections', active: ctx.query.get('tab') || 'profile',
    items: [{ id: 'profile', label: 'Profile', icon: 'user' }, { id: 'game', label: 'Game stats', icon: 'tower' }, { id: 'appearance', label: 'Appearance', icon: 'eye' }, { id: 'security', label: 'Security', icon: 'lock' }],
    onChange: (id) => ctx.setQuery({ tab: id === 'profile' ? '' : id }),
    render: (id, panel) => ({ profile: profileTab, game: gameTab, appearance: appearanceTab, security: securityTab }[/** @type {'profile'} */ (id)])(panel) });
  mount(ctx.root, h('section', { class: 'container page' },
    h('header', { class: 'page-head' }, h('p', { class: 'eyebrow' }, 'Account'), h('h1', { class: 'display' }, 'Settings'),
      h('p', { class: 'lead' }, h('a', { href: `/u/${u().handle}` }, 'View my public profile'))),
    t.list, t.panel));
}
