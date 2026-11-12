/**
 * The two piles questions drawn (D-971, CR 700.3), from real engine views built with the scenario DSL and the SYNTHETIC pile spell: the dock panel of the player who separates
 * (the revealed cards, which are in a library and come only in `pendingCards`, a preview of the two piles) and the modal of the player who chooses (both piles with their
 * cards and a button for each). The cards are SYNTHETIC (`SYNTHETIC Pile Reading`) or real fixtures.
 */
import { getView } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test, vi } from 'vitest';

// The picker hovers cards through the store, which a render over no store does not have: no hover here.
vi.mock('../src/ui/decisions/hover', () => ({ useHoverProps: () => () => ({}) }));

import { CardPickerPanel } from '../src/ui/decisions/CardPickerPanel';
import { PilesDialog } from '../src/ui/decisions/PilesDialog';
import { initialUi } from '../src/ui/decisions/ui-state';

const READING = 'SYNTHETIC Pile Reading';
const TOP = ['Grizzly Bears', 'Giant Spider', 'Serra Angel', 'Lightning Bolt', 'Sol Ring'];

/** Seat 0 cast the spell; seat 1 is asked which cards form pile 1. */
function separating() {
  const b = scenario().seat(0).hand(READING).battlefield('Island', 'Island', 'Island', 'Island');
  for (const name of TOP) b.library(name);
  const g = b.seat(1).library('Island', 'Island').at('precombatMain').build();
  g.act(0).cast(READING, { pay: true });
  g.passAll();
  return g;
}

describe('the dock panel of the player who separates', () => {
  test('lists the five revealed cards and says what clicking does', () => {
    const g = separating();
    const view = getView(g.state, 1);
    const d = view.pending;
    if (d?.kind !== 'chooseCards') throw new Error('no chooseCards decision');
    const html = renderToStaticMarkup(
      <CardPickerPanel decision={d} view={view} ui={initialUi(d)} update={() => {}} />,
    );
    for (const name of TOP) expect(html).toContain(name);
    expect(html).toContain('aria-label="Cards to separate into two piles"');
    expect(html).toContain('Separate the revealed cards into two piles (SYNTHETIC Pile Reading)');
    expect(html).toContain('Click the cards of pile 1; the other cards are pile 2.');
    // Nothing clicked yet: pile 1 is empty and pile 2 holds the five cards.
    expect(html).toMatch(/Pile 1: no cards\. Pile 2: Grizzly Bears, Giant Spider/);
  });

  test('the player who waits sees no card, only what the opponent does', () => {
    const g = separating();
    const view = getView(g.state, 0);
    expect(view.pendingCards).toBeUndefined();
    expect(view.waitingOn?.purpose).toBe('separate');
  });
});

describe('the modal of the player who chooses', () => {
  test('shows both piles with their cards and one button for each', () => {
    const g = separating();
    g.act(1).chooseCards({ name: 'Giant Spider', seat: 0 }, { name: 'Sol Ring', seat: 0 });
    const view = getView(g.state, 0);
    const d = view.pending;
    if (d?.kind !== 'chooseOption') throw new Error('no chooseOption decision');
    const html = renderToStaticMarkup(<PilesDialog d={d} view={view} act={() => {}} />);
    expect(html).toContain('Pick a pile to put into your hand');
    expect(html).toContain('The other pile goes into your graveyard.');
    expect(html).toContain('aria-label="Pile 1 (2 cards)"');
    expect(html).toContain('aria-label="Pile 2 (3 cards)"');
    for (const name of TOP) expect(html).toContain(name);
    expect(html).toContain('data-option="pile1"');
    expect(html).toContain('data-option="pile2"');
  });
});
