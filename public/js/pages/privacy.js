import { h, mount } from '../dom.js';

/** @param {import('../router.js').PageCtx} ctx */
export default function privacy(ctx) {
  ctx.setTitle('Privacy & fan-content notice');
  mount(ctx.root, h('section', { class: 'container prose' },
    h('h1', { class: 'display' }, 'Privacy & fan-content notice'),
    h('h2', { class: 'display' }, 'What we store'),
    h('ul', null,
      h('li', null, 'Your email address and a salted scrypt hash of your password. We never store your password itself.'),
      h('li', null, 'The profile details you choose to add: display name, bio, player tag, game stats, language and appearance.'),
      h('li', null, 'Clan memberships and join requests.'),
      h('li', null, 'A session record (hashed token, creation and expiry time, browser name) so you stay signed in.')),
    h('h2', { class: 'display' }, 'What other people can see'),
    h('p', null, 'Your public profile shows your display name, username, bio, game stats and clan. Your email address is never shown to other users.'),
    h('h2', { class: 'display' }, 'Cookies'),
    h('p', null, 'CoCekIn sets one strictly necessary cookie to keep you signed in. There is no advertising or third-party tracking.'),
    h('h2', { class: 'display' }, 'Verification tokens'),
    h('p', null, 'If you verify your account, the one-time API token from the game settings is sent to Supercell’s API to confirm ownership and is never stored by CoCekIn.'),
    h('h2', { class: 'display' }, 'Deleting your data'),
    h('p', null, 'You can delete your account at any time in Settings → Security. This removes your profile, sessions and join requests.'),
    h('h2', { class: 'display' }, 'Fan-content notice'),
    h('p', null, 'This content is not affiliated with, endorsed, sponsored, or specifically approved by Supercell and Supercell is not responsible for it. For more information see Supercell’s Fan Content Policy: ',
      h('a', { href: 'https://supercell.com/en/fan-content-policy/', target: '_blank', rel: 'noopener noreferrer' }, 'supercell.com/en/fan-content-policy'), '. Clash of Clans is a trademark of Supercell. All artwork on CoCekIn is original.')));
}
