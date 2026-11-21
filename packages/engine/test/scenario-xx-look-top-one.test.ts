// "Look at the top three cards of your library. Put one of them on top of your library and the rest on the bottom of your library in any order." (Cream of the Crop shape)
// and "Reveal the top five cards of your library. Put a land card from among them onto the battlefield and the rest into your graveyard." (Cavalier of Thorns shape).
// Pins: CR 401.2 (a library's order is hidden), CR 401.4 (the owner arranges cards put into a library at the same time), CR 701.20a (a card put on top is not revealed; every
// card of a reveal is shown), CR 608.2c (a card that must be put is put whenever one matches). The `lookAtTop` effect with `take.to: 'top'`, and with `revealAll` and `take.min`.
// All cards are SYNTHETIC (src/cards/fixtures/synthetic-library.ts) or basic lands.
import { describe, expect, test } from 'vitest';
import { applyAction } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { chooseCardsDecision } from './pending-helpers';
import { arrangeDecision, graveyardNames, kinds, libraryNames } from './scry-helpers';

const TOP = 'SYNTHETIC Top One Like';
const LAND = 'SYNTHETIC Reveal One Land Like';

function game(spell: string, names: readonly string[]): ScenarioGame {
  let b = scenario().seat(0).hand(spell).pool('UCC');
  names.forEach((name, i) => {
    b = b.library(name, { label: String.fromCharCode(97 + i) });
  });
  return b.seat(1).library('Llanowar Elves').build();
}

function cast(g: ScenarioGame, spell: string): ScenarioGame {
  g.act(0).cast(spell, { pay: true });
  g.pass();
  return g.pass();
}

describe('one card of those looked at stays on top, the rest go to the bottom', () => {
  const start = () => cast(game(TOP, ['Island', 'Forest', 'Plains', 'Mountain', 'Swamp']), TOP);

  test('asks for exactly one of the top three, unrevealed', () => {
    const g = start();
    const d = chooseCardsDecision(g);
    expect(d.purpose).toBe('lookTake');
    expect(d.min).toBe(1);
    expect(d.max).toBe(1);
    expect(d.reveal).toBe(false);
    expect(d.legal).toEqual(['a', 'b', 'c'].map((l) => g.id(l)));
    expect(d.prompt).toContain('Put one of them on top of your library');
  });

  test('the card chosen is the top card once the other two are on the bottom in the order given', () => {
    const g = start();
    const mark = g.mark();
    g.act(0).chooseCards('b');
    const d = arrangeDecision(g);
    expect(d.purpose).toBe('bottom');
    expect(d.cards).toEqual(['a', 'c'].map((l) => g.id(l)));
    g.act(0).arrange({ top: [], other: ['c', 'a'] });
    expect(libraryNames(g)).toEqual(['Forest', 'Mountain', 'Swamp', 'Plains', 'Island']);
    expect(kinds(g.eventsSince(mark))).not.toContain('cardsRevealed');
    g.expect.invariants();
  });

  test('the answer must be exactly one of the cards looked at', () => {
    const g = start();
    const before = g.hash();
    for (const objects of [[], [g.id('a'), g.id('b')], [g.id('d')]]) {
      expect(applyAction(g.state, 0, { kind: 'chooseCards', objects }).ok).toBe(false);
    }
    expect(g.hash()).toBe(before);
  });

  test('with a library of one card nobody is asked and the card stays on top', () => {
    const g = cast(game(TOP, ['Island']), TOP);
    g.expect.pending('priority', 0);
    expect(libraryNames(g)).toEqual(['Island']);
    g.expect.invariants();
  });
});

describe('reveal the top, a land card from among them must be put onto the battlefield', () => {
  const start = (names: readonly string[]) => cast(game(LAND, names), LAND);

  test('the whole top is revealed, a land card is asked for and nothing may be declined', () => {
    const g = start(['Grizzly Bears', 'Forest', 'Island', 'Llanowar Elves', 'Plains']);
    const d = chooseCardsDecision(g);
    expect(d.min).toBe(1);
    expect(d.max).toBe(1);
    expect(d.legal).toEqual(['b', 'c', 'e'].map((l) => g.id(l)));
    expect(d.prompt).toContain('Put a card that matches from among them onto the battlefield');
    expect(applyAction(g.state, 0, { kind: 'chooseCards', objects: [] }).ok).toBe(false);
  });

  test('the land enters untapped and the rest go into the graveyard', () => {
    const g = start(['Grizzly Bears', 'Forest', 'Island', 'Llanowar Elves', 'Plains']);
    g.act(0).chooseCards('c');
    const lands = g.state.battlefield.filter((id) => g.state.objects[id]?.controller === 0);
    expect(lands.map((id) => g.state.objects[id]?.tapped)).toEqual([false]);
    expect(lands).toContain(g.id('c'));
    expect(graveyardNames(g).sort()).toEqual(
      [LAND, 'Forest', 'Grizzly Bears', 'Llanowar Elves', 'Plains'].sort(),
    );
    expect(libraryNames(g)).toEqual([]);
    g.expect.invariants();
  });

  test('with no land among them everything goes into the graveyard and nobody is asked', () => {
    const g = start(['Grizzly Bears', 'Llanowar Elves']);
    g.expect.pending('priority', 0);
    expect(graveyardNames(g).sort()).toEqual([LAND, 'Grizzly Bears', 'Llanowar Elves'].sort());
    g.expect.invariants();
  });
});
