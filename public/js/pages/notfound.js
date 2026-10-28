import { h, mount } from '../dom.js';
import { btn } from '../ui.js';

/** @param {import('../router.js').PageCtx} ctx */
export default function notFound(ctx) {
  ctx.setTitle('Page not found');
  mount(ctx.root, h('section', { class: 'container page-state' }, h('div', { class: 'state-card' },
    h('p', { class: 'eyebrow' }, 'Error 404'),
    h('h1', { class: 'display' }, 'This village is not on the map'),
    h('p', null, 'The page you are looking for does not exist or has moved.'),
    h('div', { class: 'state-actions' }, btn('Back to home', { variant: 'primary', href: '/' }), btn('Browse clans', { href: '/clans' })))));
}
