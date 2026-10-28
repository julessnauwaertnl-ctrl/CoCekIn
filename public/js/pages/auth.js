import { h, icon, mount } from '../dom.js';
import { post } from '../api.js';
import { session, setMe } from '../state.js';
import { navigate, safeNext } from '../router.js';
import { busy, errMsg, field, showFieldErrors, toast } from '../ui.js';
import { logo } from '../art.js';

/** @param {import('../router.js').PageCtx} ctx */
export default function auth(ctx) {
  const isRegister = ctx.path === '/register';
  ctx.setTitle(isRegister ? 'Create your profile' : 'Sign in');
  const next = safeNext(ctx.query.get('next'), isRegister ? '/settings?tab=game' : '/dashboard');
  if (session.me) { navigate(safeNext(ctx.query.get('next'), '/dashboard'), { replace: true }); return; }

  const fields = {
    email: field({ label: 'Email', name: 'email', type: 'email', required: true, autocomplete: 'email', maxlength: 254 }),
    ...(isRegister ? {
      displayName: field({ label: 'Display name', name: 'displayName', required: true, autocomplete: 'nickname', maxlength: 30, hint: 'Shown on your profile, e.g. your in-game name.' }),
      handle: field({ label: 'Username', name: 'handle', required: true, autocomplete: 'username', maxlength: 20, hint: '3–20 letters, numbers or underscores. Used in your profile link.' }),
    } : {}),
    password: field({ label: 'Password', name: 'password', type: 'password', required: true, autocomplete: isRegister ? 'new-password' : 'current-password', maxlength: 128, hint: isRegister ? 'At least 10 characters.' : undefined }),
  };
  const formError = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const submit = h('button', { class: 'btn btn-primary btn-lg btn-block', type: 'submit' }, isRegister ? 'Create my profile' : 'Sign in');
  const order = isRegister ? ['displayName', 'handle', 'email', 'password'] : ['email', 'password'];

  const form = h('form', { class: 'auth-form', novalidate: true, onsubmit: async (/** @type {Event} */ e) => {
    e.preventDefault();
    formError.hidden = true;
    const body = Object.fromEntries(Object.entries(fields).map(([k, f]) => [k, f.value]));
    // light client-side checks so the user gets instant feedback; the server re-validates everything
    let bad = false;
    for (const f of Object.values(fields)) f.setError(null);
    if (!body.email.trim()) { fields.email.setError('Enter your email address.'); bad = true; }
    if (!body.password) { fields.password.setError('Enter your password.'); bad = true; }
    if (bad) { /** @type {any} */ (Object.values(fields).find((f) => f.el.querySelector('[aria-invalid]'))?.input)?.focus(); return; }
    await busy(submit, async () => {
      try {
        const res = await post(isRegister ? '/auth/register' : '/auth/login', body);
        setMe(res);
        toast(isRegister ? `Welcome to CoCekIn, ${res.user.displayName}!` : `Welcome back, ${res.user.displayName}!`, 'success');
        navigate(next, { replace: true });
      } catch (err) {
        if (!showFieldErrors(/** @type {any} */ (fields), err)) { formError.textContent = errMsg(err); formError.hidden = false; }
      }
    });
  } }, ...order.map((k) => /** @type {any} */ (fields)[k].el), formError, submit);

  mount(ctx.root, h('section', { class: 'auth' },
    h('div', { class: 'auth-art' }, h('img', { src: '/assets/hero-sm.webp', alt: '', width: 900, height: 600, decoding: 'async' }), h('div', { class: 'auth-art-shade', 'aria-hidden': 'true' }),
      h('div', { class: 'auth-art-copy' }, h('h2', { class: 'display' }, isRegister ? 'Every great clan starts with one chief.' : 'Your clan is waiting.'),
        h('ul', null, h('li', null, icon('check', 18), 'Profile with covers, avatars and achievements'), h('li', null, icon('check', 18), 'Clan discovery that shows if you qualify'), h('li', null, icon('check', 18), 'Free, and your email stays private')))),
    h('div', { class: 'auth-panel' }, h('div', { class: 'card pad auth-card' },
      h('div', { class: 'auth-logo' }, logo(44)),
      h('h1', { class: 'display' }, isRegister ? 'Create your profile' : 'Welcome back'),
      h('p', { class: 'muted' }, isRegister ? 'Free forever. Takes under a minute.' : 'Sign in to manage your profile and clan.'),
      form,
      h('p', { class: 'auth-switch' }, isRegister ? 'Already have an account? ' : 'New to CoCekIn? ',
        h('a', { href: `${isRegister ? '/login' : '/register'}${ctx.query.get('next') ? `?next=${encodeURIComponent(ctx.query.get('next') || '')}` : ''}` }, isRegister ? 'Sign in' : 'Create a profile'))))));
  /** @type {any} */ (order[0] && /** @type {any} */ (fields)[order[0]].input).focus?.();
}
