/**
 * The Gift question and the "sacrifice any number" choice rendered (D-135), in a real game of the hidden SYNTHETIC deck
 * `synthetic-zombies`: the dialog and the bar, the dock panel, and what the answers do.
 */
import type { GameView } from '@commander-arena/engine';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { DecisionLayer } from '../src/ui/decisions/DecisionLayer';
import { StoreProvider } from '../src/ui/store-context';
import { asksAnyNumber, asksGift, reachZombiesStore, type ZombiesStore } from './zombies-decks';

/** Server rendering reads zustand's initial state, so report the current one instead. */
const live = (store: ZombiesStore) => ({ ...store, getInitialState: () => store.getState() });

async function must(accept: (view: GameView) => boolean): Promise<ZombiesStore> {
  const store = await reachZombiesStore(accept, { seeds: 200 });
  if (store === null) throw new Error('no seed reaches the situation');
  return store;
}

const render = (store: ZombiesStore) =>
  renderToStaticMarkup(
    <StoreProvider store={live(store)}>
      <DecisionLayer>
        <div />
      </DecisionLayer>
    </StoreProvider>,
  );

test('the Gift question: a dialog that names the opponent, the card they draw, Gift, No gift and Cancel', async () => {
  const store = await must(asksGift('SYNTHETIC Gift Study'));
  const html = render(store);
  expect(html).toContain('aria-label="Gift"');
  expect(html).toContain('SYNTHETIC Gift Study');
  expect(html).toContain(
    'Promise Opponent a gift? If you do, they draw a card before the other effects of SYNTHETIC Gift Study.',
  );
  expect(html).toMatch(/<button[^>]*data-dec-primary[^>]*>Gift<\/button>/);
  expect(html).toContain('>No gift<');
  expect(html).toContain('>Cancel<');
  expect(html).not.toContain('Optional ability');
});

test('promising the gift makes the opponent draw and says so in the log', async () => {
  const store = await must(asksGift('SYNTHETIC Gift Study'));
  const hand = (view: GameView | undefined) => view?.seats[1]?.handCount ?? 0;
  const before = hand(store.getState().snapshot?.view);
  await store.getState().act({ kind: 'acceptOptional' });
  expect(store.getState().error).toBeNull();
  // Pay and let the spell resolve: the opponent draws one card more than they would have.
  for (let i = 0; i < 12 && (store.getState().snapshot?.view.stack.length ?? 0) >= 0; i += 1) {
    const view = store.getState().snapshot?.view;
    if (view?.pending === null || view === undefined) break;
    if (view.pending.kind === 'payMana') await store.getState().act({ kind: 'payAuto' });
    else if (view.pending.kind === 'priority' && view.stack.length > 0) {
      await store.getState().act({ kind: 'pass' });
    } else break;
  }
  const log = store.getState().log.map((l) => l.text);
  expect(
    log.some((t) => t.includes('You cast SYNTHETIC Gift Study, promising Opponent a gift.')),
  ).toBe(true);
  expect(hand(store.getState().snapshot?.view)).toBe(before + 1);
});

test('the sacrifice of any number: a panel that allows none, and a Confirm that works at once', async () => {
  const store = await must(asksAnyNumber);
  const html = render(store);
  expect(html).toContain(
    'Sacrifice any number of other permanents you control for SYNTHETIC Greedy God.',
  );
  expect(html).toContain('Permanents to sacrifice');
  expect(html).toContain('0 of up to');
  // Confirm is not disabled with nothing chosen.
  expect(html).toMatch(/<button(?![^>]*disabled)[^>]*data-dec-primary[^>]*>Confirm<\/button>/);
  await store.getState().act({ kind: 'choosePermanents', objects: [] });
  expect(store.getState().error).toBeNull();
  const log = store.getState().log.map((l) => l.text);
  expect(log.some((t) => t.includes('You choose to sacrifice nothing for'))).toBe(true);
});
