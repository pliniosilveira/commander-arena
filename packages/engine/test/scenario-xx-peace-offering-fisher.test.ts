// The Peace Offering deck (issue 112), group F: "If you would create a Fish token, create a 3/3 blue Shark creature token instead." (`tokensInstead` in `swap` mode) and "Look at
// the top card of your library. You may reveal it if it's a land card. Create a 1/1 blue Fish creature token if you revealed it this way." (`lookAtTop` with `take.to` `reveal`).
// Pins: CR 614.1a (an "instead" effect replaces the creation), CR 614.5 and 616.1f (each replacement applies once, and the next one sees what the first made: a Fish becomes a
// Shark, then the Shark an Octopus), the Fisher's Talent ruling of 2024-07-26 (what the instruction said about the token, tapped, still applies), CR 111.2 (only the tokens the
// controller of the replacement creates), CR 701.20a and 701.20b (a card revealed is shown to everyone and stays where it is), CR 608.2c ("if you revealed it this way").
// The cards are SYNTHETIC (src/cards/fixtures/synthetic-peace-offering-fisher.ts, and the Soldiers of synthetic-hashaton-g3.ts) or real basic lands and creatures.
import { describe, expect, test } from 'vitest';
import { applyAction, syntheticCard, validateCard } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { chooseCardsDecision } from './pending-helpers';
import { kinds } from './scry-helpers';

const SHARK_TIDE = 'SYNTHETIC Shark Tide';
const OCTOPUS_TIDE = 'SYNTHETIC Octopus Tide';
const FISH_CALL = 'SYNTHETIC Fish Call'; // two tapped 1/1 Fish
const SHARK_CALL = 'SYNTHETIC Shark Call'; // a 3/3 Shark
const GLIMPSE = 'SYNTHETIC Land Glimpse';
const MUSTER = 'SYNTHETIC Muster Call'; // two tapped 1/1 Soldiers
const LIB = Array.from({ length: 6 }, () => 'Island');

const tokens = (g: ScenarioGame, name: string, seat: number = 0) =>
  g.state.battlefield
    .map((id) => g.state.objects[id])
    .filter((o) => o?.token?.characteristics.name === name && o.controller === seat);

const ALL = [SHARK_TIDE, OCTOPUS_TIDE, FISH_CALL, SHARK_CALL, GLIMPSE];

describe('the cards are valid', () => {
  test.each(ALL)('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });

  test('a swap names the token it makes', () => {
    const card = syntheticCard(SHARK_TIDE);
    const face = card.faces[0];
    if (face === undefined) throw new Error('no face');
    const withRule = (rule: Record<string, unknown>) =>
      ({
        ...card,
        faces: [
          {
            ...face,
            abilities: [{ kind: 'replacement', replacement: { kind: 'tokensInstead', ...rule } }],
          },
        ],
      }) as never;
    expect(
      validateCard(withRule({ what: { token: true, subtypes: ['Fish'] }, mode: 'swap' })),
    ).not.toEqual([]);
  });

  test('a card only revealed is one card, and every card looked at stays on top', () => {
    const card = syntheticCard(GLIMPSE);
    const face = card.faces[0];
    if (face === undefined) throw new Error('no face');
    const withLook = (look: Record<string, unknown>) =>
      ({
        ...card,
        faces: [{ ...face, spell: { targets: [], effect: { kind: 'lookAtTop', ...look } } }],
      }) as never;
    const take = { filter: { types: ['land'] }, max: 1, to: 'reveal' };
    expect(validateCard(withLook({ count: 1, take, rest: 'top' }))).toEqual([]);
    expect(validateCard(withLook({ count: 1, take, rest: 'bottomRandom' }))).not.toEqual([]);
    expect(
      validateCard(withLook({ count: 1, take: { ...take, max: 2 }, rest: 'top' })),
    ).not.toEqual([]);
    expect(
      validateCard(withLook({ count: 1, take: { ...take, hidden: true }, rest: 'top' })),
    ).not.toEqual([]);
  });
});

describe('a token swapped as it is created (CR 614.1a)', () => {
  const board = (mine: readonly string[], theirs: readonly string[] = [], spell = FISH_CALL) =>
    scenario({ seats: 3 })
      .seat(0)
      .library(...LIB)
      .hand(spell)
      .battlefield('Island', 'Plains', 'Plains')
      .battlefield(...mine)
      .seat(1)
      .library(...LIB)
      .battlefield(...theirs)
      .seat(2)
      .library(...LIB)
      .at('precombatMain', { active: 0 })
      .build();

  const cast = (g: ScenarioGame, spell = FISH_CALL) => {
    g.act(0).cast(spell, { pay: true });
    g.passAll();
    return g;
  };

  test('without a replacement: two tapped Fish (the baseline)', () => {
    const g = cast(board([]));
    expect(tokens(g, 'Fish')).toHaveLength(2);
  });

  test('each Fish becomes a 3/3 blue Shark, and what the spell said about it still applies: tapped (the ruling)', () => {
    const g = cast(board([SHARK_TIDE]));
    expect(tokens(g, 'Fish')).toHaveLength(0);
    const sharks = tokens(g, 'Shark');
    expect(sharks).toHaveLength(2);
    for (const shark of sharks) expect(shark?.tapped).toBe(true);
    g.expect.pt({ name: 'Shark', zone: 'battlefield', nth: 0 }, 3, 3);
    g.expect.derived(
      { name: 'Shark', zone: 'battlefield', nth: 0 },
      { colors: ['U'], subtypes: ['Shark'] },
    );
    g.expect.invariants();
  });

  test('with both: a Fish becomes a Shark and the Shark an 8/8 Octopus, and nobody is asked (CR 616.1f)', () => {
    const g = cast(board([OCTOPUS_TIDE, SHARK_TIDE]));
    g.expect.pending('priority', 0);
    expect(tokens(g, 'Fish')).toHaveLength(0);
    expect(tokens(g, 'Shark')).toHaveLength(0);
    const octopi = tokens(g, 'Octopus');
    expect(octopi).toHaveLength(2);
    for (const octopus of octopi) expect(octopus?.tapped).toBe(true);
    g.expect.pt({ name: 'Octopus', zone: 'battlefield', nth: 0 }, 8, 8);
    g.expect.invariants();
  });

  test('the Shark replacement alone leaves a Fish a Fish, and turns a Shark of another effect into an Octopus', () => {
    const fish = cast(board([OCTOPUS_TIDE]));
    expect(tokens(fish, 'Fish')).toHaveLength(2);
    expect(tokens(fish, 'Octopus')).toHaveLength(0);
    const shark = cast(board([OCTOPUS_TIDE], [], SHARK_CALL), SHARK_CALL);
    expect(tokens(shark, 'Shark')).toHaveLength(0);
    expect(tokens(shark, 'Octopus')).toHaveLength(1);
  });

  test('another kind of token is not replaced', () => {
    const g = cast(board([SHARK_TIDE, OCTOPUS_TIDE], [], MUSTER), MUSTER);
    expect(tokens(g, 'Soldier')).toHaveLength(2);
    expect(tokens(g, 'Shark')).toHaveLength(0);
  });

  test("an opponent's replacement does not change the Fish I create (CR 111.2), with three players", () => {
    const g = cast(board([], [SHARK_TIDE]));
    expect(tokens(g, 'Fish')).toHaveLength(2);
    expect(tokens(g, 'Shark', 1)).toHaveLength(0);
  });
});

describe('look at the top card, reveal it if it is a land card (CR 701.20a, 701.20b, 608.2c)', () => {
  const board = (top: string, mine: readonly string[] = []) =>
    scenario({ seats: 3 })
      .seat(0)
      .library(top, { label: 'top' })
      .library(...LIB)
      .hand(GLIMPSE)
      .battlefield('Island')
      .battlefield(...mine)
      .seat(1)
      .library(...LIB)
      .seat(2)
      .library(...LIB)
      .at('precombatMain', { active: 0 })
      .build();

  const cast = (g: ScenarioGame) => {
    g.act(0).cast(GLIMPSE, { pay: true });
    g.passAll();
    return g;
  };

  test('a land on top: the player may reveal it; revealed, it stays on top, a Fish is made, and it is the card drawn', () => {
    const g = cast(board('Forest'));
    const d = chooseCardsDecision(g);
    expect(d.purpose).toBe('lookTake');
    expect(d.legal).toEqual([g.id('top')]);
    expect(d.min).toBe(0);
    expect(d.max).toBe(1);
    expect(d.reveal).toBe(true);
    expect(d.prompt).toContain('You may reveal a card that matches');
    const mark = g.mark();
    g.act(0).chooseCards('top');
    expect(kinds(g.eventsSince(mark))).toContain('cardsRevealed');
    expect(tokens(g, 'Fish')).toHaveLength(1);
    g.expect.zone('Forest', 'hand', { seat: 0, count: 1 });
    g.expect.invariants();
  });

  test('a land not revealed: no Fish, nothing is shown, and the land is still drawn', () => {
    const g = cast(board('Forest'));
    const mark = g.mark();
    g.act(0).chooseCards();
    expect(kinds(g.eventsSince(mark))).not.toContain('cardsRevealed');
    expect(tokens(g, 'Fish')).toHaveLength(0);
    g.expect.zone('Forest', 'hand', { seat: 0, count: 1 });
  });

  test('a nonland card on top: nobody is asked, nothing is revealed, no Fish, and the card is drawn', () => {
    const g = scenario({ seats: 3 })
      .seat(0)
      .library('Grizzly Bears', { label: 'top' })
      .library(...LIB)
      .hand(GLIMPSE)
      .battlefield('Island')
      .seat(1)
      .library(...LIB)
      .seat(2)
      .library(...LIB)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(GLIMPSE, { pay: true });
    const mark = g.mark();
    g.passAll();
    expect(kinds(g.eventsSince(mark))).not.toContain('cardsRevealed');
    expect(tokens(g, 'Fish')).toHaveLength(0);
    g.expect.zone('Grizzly Bears', 'hand', { seat: 0, count: 1 });
  });

  test('the answer must be the land looked at, or none', () => {
    const g = cast(board('Forest'));
    const before = g.hash();
    const other = g.state.seats[0]?.library[1];
    if (other === undefined) throw new Error('no second card');
    expect(applyAction(g.state, 0, { kind: 'chooseCards', objects: [other] }).ok).toBe(false);
    expect(g.hash()).toBe(before);
  });

  test('the Fish it makes is swapped too: a Shark with the Shark replacement', () => {
    const g = cast(board('Forest', [SHARK_TIDE]));
    g.act(0).chooseCards('top');
    expect(tokens(g, 'Fish')).toHaveLength(0);
    expect(tokens(g, 'Shark')).toHaveLength(1);
  });
});
