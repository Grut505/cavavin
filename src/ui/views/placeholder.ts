import { pageHeader } from '../components/page-header';
import { h } from '../dom';
import { fr } from '../strings.fr';

export function placeholderView(title: string): HTMLElement {
  return h(
    'main',
    { class: 'view' },
    pageHeader({ title }),
    h('div', { class: 'card muted' }, fr.soon),
  );
}
