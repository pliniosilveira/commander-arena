/** The card picker of chooseCards (search, discard) and the waiting status, rendered from real
 * games of the SYNTHETIC search deck. */
import type { GameView } from '@commander-arena/engine';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import type { AppStore } from '../src/store';
import { ActionBar } from '../src/ui/decisions/ActionBar';
import { waitingText } from '../src/ui/decisions/cards-picker';
import { DecisionLayer } from '../src/ui/decisions/DecisionLayer';
import { useInteraction } from '../src/ui/interaction';
import { StoreProvider } from '../src/ui/store-context';
import { anyDiscard, reachSearchStore } from './search-decks';

function ProbeBoard() {
  const i = useInteraction();
  return (
    <div data-testid="probe" data-clickable={i.clickable.size} data-dim={String(i.dimOthers)} />
  );
}

/** Server rendering reads zustand's initial state, so report the current one instead. */
function render(store: AppStore): string {
  const live: typeof store = { ...store, getInitialState: () => store.getState() };
  return renderToStaticMarkup(
    <StoreProvider store={live}>
      <DecisionLayer>
        <ProbeBoard />
      </DecisionLayer>
    </StoreProvider>,
  );
}

const htmlEscape = (text: string) => text.replace(/'/g, '&#x27;');

test('a search: one row per distinct card with count and text, the hint, and Find nothing', async () => {
  const reached = await reachSearchStore((d) => d.purpose === 'search' && d.max === 2);
  if (reached === null) throw new Error('no seed');
  const { store } = reached;
  const view = store.getState().snapshot?.view;
  const pending = view?.pending;
  if (view === undefined || pending?.kind !== 'chooseCards') throw new Error('wrong decision');
  const html = render(store);
  expect(html).toContain('aria-label="Cards to find"');
  expect(html).toContain('Search your library');
  expect(html).toContain('Choose up to 2 cards.');
  expect(html).toContain('The cards you find are revealed.');
  // The bar says the decision's own words.
  expect(html).toContain(htmlEscape(pending.prompt));
  // One row per distinct name, with a count for the copies and the type line.
  const names = new Map<string, number>();
  for (const c of view.pendingCards ?? []) names.set(c.name, (names.get(c.name) ?? 0) + 1);
  expect(html.match(/class="dec-pick"/g)).toHaveLength(names.size);
  const forests = names.get('Forest');
  if (forests !== undefined && forests > 1) expect(html).toContain(`Forest ×${forests}`);
  expect(html).toContain('Basic Land');
  expect(html).not.toContain('aria-pressed="true"');
  expect(html).toContain('0 of up to 2 chosen');
  expect(html).toMatch(/<button[^>]*data-dec-primary[^>]*>Find nothing<\/button>/);
  // The board is told every matching card is clickable, though none is on the board.
  expect(html).toContain(`data-clickable="${pending.legal.length}"`);
  expect(html).toContain('data-dim="false"');
  // Nobody is waiting on anybody.
  expect(html).not.toContain('is searching');
});

test('a discard: the legal cards of the hand are listed and the board dims', async () => {
  const reached = await reachSearchStore(anyDiscard);
  if (reached === null) throw new Error('no seed');
  const { store } = reached;
  const pending = store.getState().snapshot?.view.pending;
  if (pending?.kind !== 'chooseCards') throw new Error('wrong decision');
  const html = render(store);
  expect(html).toContain('aria-label="Cards to discard"');
  expect(html).toContain('Discard from your hand');
  expect(html).toContain('Choose a card.');
  expect(html).not.toContain('The cards you find are revealed.');
  expect(html).toContain('data-dim="true"');
  expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Discard<\/button>/);
  const hand = store.getState().snapshot?.view.seats[0]?.hand ?? [];
  const names = new Set(hand.filter((c) => pending.legal.includes(c.id)).map((c) => c.name));
  expect(html.match(/class="dec-pick"/g)).toHaveLength(names.size);
});

test('the other seat sees a status, never the cards', () => {
  const view = { waitingOn: { seat: 1, purpose: 'search', sourceName: 'Twin Fetch' } } as GameView;
  const text = waitingText(view);
  const html = (waiting: string | null) =>
    renderToStaticMarkup(
      <ActionBar
        bar={null}
        waiting={waiting}
        passing={false}
        passTurn={false}
        onCancelPassTurn={() => {}}
        fullControl={false}
        manualPay={false}
        onSeize={() => {}}
        onFullControl={() => {}}
        onManualPay={() => {}}
        undoDepth={0}
        onUndo={() => {}}
      />,
    );
  expect(html(null)).toContain('Waiting for the game.');
  const shown = html(text);
  expect(shown).toContain('Opponent is searching their library (Twin Fetch).');
  expect(shown).toContain('role="status"');
  expect(shown).not.toContain('dec-pick');
});
