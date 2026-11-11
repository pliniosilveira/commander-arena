/**
 * The arrangement dialog (scry, surveil, reorder) and the put-on-top picker, rendered from real
 * games of the hidden SYNTHETIC deck `synthetic-library` (D-091).
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { arrangePrompt } from '../src/ui/decisions/arrange';
import { DecisionLayer } from '../src/ui/decisions/DecisionLayer';
import { useInteraction } from '../src/ui/interaction';
import { StoreProvider } from '../src/ui/store-context';
import {
  arrangeOf,
  arranging,
  BRAINSTORM,
  type LibraryStore,
  putOnTopOf,
  puttingOnTop,
  REORDER,
  SEER,
  searchLibrary,
  startStore,
  WATCHER,
} from './library-decks';

vi.setConfig({ testTimeout: 120_000 });

function ProbeBoard() {
  const i = useInteraction();
  return <div data-testid="probe" data-clickable={i.clickable.size} />;
}

/** Server rendering reads zustand's initial state, so report the current one instead. */
const render = (store: LibraryStore): string =>
  renderToStaticMarkup(
    <StoreProvider store={{ ...store, getInitialState: () => store.getState() }}>
      <DecisionLayer>
        <ProbeBoard />
      </DecisionLayer>
    </StoreProvider>,
  );

async function reach(cast: string, accept: Parameters<typeof searchLibrary>[2]) {
  const reached = await searchLibrary(startStore('swamp-forest'), [cast], accept);
  if (reached === null) throw new Error('no seed reaches the situation');
  const { store } = reached.session as typeof reached.session & { store: LibraryStore };
  const view = store.getState().snapshot?.view;
  if (view === undefined) throw new Error('no view');
  return { store, view };
}

const htmlEscape = (text: string) => text.replace(/'/g, '&#x27;');

test('a scry: a dialog with the prompt, the cards in a Top and a Bottom pile, and Confirm only', async () => {
  const { store, view } = await reach(SEER, arranging('scry'));
  const d = arrangeOf(view);
  const html = render(store);
  expect(html).toContain('role="dialog"');
  expect(html).toContain(`aria-label="${arrangePrompt(d)}"`);
  expect(html).toContain('Scry 2: choose the cards to put on the bottom and the order.');
  expect(html).toContain('aria-label="Top pile"');
  expect(html).toContain('aria-label="Bottom pile"');
  expect(html).not.toContain('aria-label="Graveyard pile"');
  // Every card looked at is a card of the top pile, in order, with its place; the bottom is empty.
  const top = html.slice(html.indexOf('data-pile="top"'), html.indexOf('data-pile="other"'));
  for (const id of d.cards) expect(top).toContain(`data-arrange-card="${id}"`);
  expect(top.match(/data-arrange-card=/g)).toHaveLength(d.cards.length);
  expect(top).toContain('1st from top');
  expect(top).toContain('2nd from top');
  expect(html).toContain('dec-arrange-empty');
  for (const c of view.pendingCards ?? []) expect(html).toContain(htmlEscape(c.name));
  // The bar's second line, the Confirm button, no Cancel and no action bar behind the dialog.
  expect(html).toContain('2 on top, 0 on the bottom.');
  expect(html).toMatch(/<button[^>]*data-dec-primary[^>]*>Confirm<\/button>/);
  expect(html).not.toContain('>Cancel<');
  expect(html).not.toContain('aria-label="Actions"');
  // Each card has buttons to move it, and the first cannot go earlier.
  expect(html).toContain('Move ');
  expect(html).toMatch(/disabled=""[^>]*>←/);
});

test('a surveil: the second pile is the Graveyard', async () => {
  const { store, view } = await reach(WATCHER, arranging('surveil'));
  const html = render(store);
  expect(html).toContain('Surveil 2: choose the cards to put into your graveyard');
  expect(html).toContain('aria-label="Graveyard pile"');
  expect(html).not.toContain('aria-label="Bottom pile"');
  expect(html).toContain('2 on top, 0 into the graveyard.');
  expect(html).toContain('They enter your graveyard in this order');
  expect(arrangeOf(view).piles).toEqual(['top', 'graveyard']);
});

test('a reorder has only the Top pile and no button to send a card away', async () => {
  const { store, view } = await reach(REORDER, arranging('reorder'));
  const html = render(store);
  expect(html).toContain('Look at the top 3 cards: put them back in any order.');
  expect(html).toContain('aria-label="Top pile"');
  expect(html).not.toContain('Bottom pile');
  expect(html).not.toContain('Graveyard pile');
  expect(html).not.toContain('dec-arrange-flip');
  expect(html.match(/data-arrange-card=/g)).toHaveLength(arrangeOf(view).cards.length);
});

test('a put on top: the picker panel says the first pick ends on top, the bar has the prompt', async () => {
  const { store, view } = await reach(BRAINSTORM, puttingOnTop);
  const d = putOnTopOf(view);
  const html = render(store);
  expect(html).toContain('aria-label="Cards to put on top"');
  expect(html).toContain('Put on top of your library');
  expect(html).toContain('Choose 2 cards. The first you pick ends on top.');
  expect(html).toContain(htmlEscape(d.prompt));
  expect(html).toContain('0 of 2 chosen');
  expect(html).toMatch(/<button[^>]*disabled=""[^>]*data-dec-primary[^>]*>Put on top<\/button>/);
  // The hand is where the cards are: its cards are what the board may click.
  expect(html).toContain(`data-clickable="${d.legal.length}"`);
});
