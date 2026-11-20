// "At the beginning of your end step, you may sacrifice an artifact, creature, enchantment, land, or planeswalker. If you do, each opponent may sacrifice a permanent of their
// choice that shares a card type with it. For each opponent who doesn't, that player loses 2 life and you draw a card." (the Braids, Arisen Nightmare shape).
// Pins: CR 701.21a (a player sacrifices only a permanent they control, and nothing happens if they have none), CR 608.2d (the optional choices are made as the ability
// resolves), CR 205.2a (a card type is a word of the type line: a permanent with several card types shares with any of them), CR 113.7a (the sacrificed permanent is read as it last
// was on the battlefield), CR 608.2c ("if you do" reads what the offer did). The cards are SYNTHETIC (src/cards/fixtures/synthetic-braids.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import type { ScenarioGame } from '../src/testing/index';
import { confirmOptionalDecision } from './pending-helpers';
import { twoSeatGame } from './two-seat-helpers';

const BRAIDS = 'SYNTHETIC Braids Nightmare';
const GOLEM = 'SYNTHETIC Braids Golem'; // an artifact creature
const BEARS = 'Grizzly Bears';
const SOL_RING = 'Sol Ring'; // an artifact
const MOUNTAIN = 'Mountain';
const FOREST = 'Forest';

/** Braids on seat 0's side, `mine` and `theirs` the other permanents, at the beginning of seat 0's end step with the trigger resolved. */
const atEndStep = (mine: readonly string[], theirs: readonly string[]): ScenarioGame => {
  const g = twoSeatGame(
    (b) => b.battlefield(BRAIDS).battlefield(...mine),
    (b) => b.battlefield(...theirs),
  );
  g.advanceTo('end');
  g.passAll();
  return g;
};

/** The ids of the permanents of `seat` named, sorted, to compare with the permanents a decision offers. */
const idsOf = (g: ScenarioGame, seat: 0 | 1, names: readonly string[]) =>
  names.map((name) => g.id({ name, zone: 'battlefield', seat })).sort();
const offered = (g: ScenarioGame) => {
  const d = g.state.pending;
  if (d?.kind !== 'choosePermanent') throw new Error('no choice is pending');
  return [...d.legal].sort();
};

const life = (g: ScenarioGame, seat: 0 | 1) => g.state.seats[seat]?.life;

/** Seat 0 accepts the offer and chooses `what` to sacrifice (Braids itself is a creature, so there are always two or more candidates). */
const sacrifice = (g: ScenarioGame, what: string): void => {
  g.act(0).accept();
  g.act(0).choosePermanents(what);
};

describe('the card is valid', () => {
  test(BRAIDS, () => {
    expect(validateCard(syntheticCard(BRAIDS))).toEqual([]);
  });

  test("'sacrificed' is refused where no sacrifice came before it", () => {
    const card = syntheticCard(BRAIDS);
    const face = card.faces[0];
    if (face === undefined) throw new Error('no face');
    const bad = {
      ...card,
      faces: [
        {
          ...face,
          abilities: [
            {
              kind: 'triggered',
              trigger: { kind: 'endStep', whose: 'you' },
              effect: {
                kind: 'sacrifice',
                objects: { kind: 'choose', filter: { sharesCardTypeWith: 'sacrificed' } },
              },
            },
          ],
        },
      ],
    } as typeof card;
    expect(
      validateCard(bad)
        .map((m) => m.message)
        .join(' | '),
    ).toMatch(/follows another sacrifice/);
  });
});

describe('you decline the sacrifice', () => {
  test('nothing happens: the opponent is not asked, loses no life and you draw nothing', () => {
    const g = atEndStep([MOUNTAIN], [FOREST]);
    expect(confirmOptionalDecision(g).seat).toBe(0);
    g.act(0).decline();
    expect(g.state.pending?.kind).toBe('priority');
    expect(g.state.stack).toEqual([]);
    g.expect.zone(MOUNTAIN, 'battlefield', { seat: 0 });
    g.expect.zone(FOREST, 'battlefield', { seat: 1 });
    expect(life(g, 1)).toBe(20);
    g.expect.handSize(0, 0);
    g.expect.invariants();
  });
});

describe('you sacrifice a land', () => {
  test('the opponent sacrifices a land too: nobody loses life, you draw nothing', () => {
    const g = atEndStep([MOUNTAIN], [FOREST]);
    sacrifice(g, MOUNTAIN);
    expect(confirmOptionalDecision(g).seat).toBe(1);
    g.act(1).accept();
    g.expect.zone(MOUNTAIN, 'graveyard', { seat: 0 });
    g.expect.zone(FOREST, 'graveyard', { seat: 1 });
    expect(life(g, 1)).toBe(20);
    g.expect.handSize(0, 0);
    g.expect.invariants();
  });

  test('the opponent declines: they lose 2 life and you draw a card', () => {
    const g = atEndStep([MOUNTAIN], [FOREST]);
    sacrifice(g, MOUNTAIN);
    g.act(1).decline();
    g.expect.zone(MOUNTAIN, 'graveyard', { seat: 0 });
    g.expect.zone(FOREST, 'battlefield', { seat: 1 });
    expect(life(g, 1)).toBe(18);
    expect(life(g, 0)).toBe(20);
    g.expect.handSize(0, 1);
    g.expect.invariants();
  });

  test('the opponent has no land: they are not asked, and lose 2 life while you draw a card', () => {
    const g = atEndStep([MOUNTAIN], [BEARS, SOL_RING]);
    sacrifice(g, MOUNTAIN);
    // CR 701.21a: nothing shares a card type with the land, so the opponent cannot sacrifice and "doesn't".
    expect(g.state.pending?.kind).toBe('priority');
    g.expect.zone(MOUNTAIN, 'graveyard', { seat: 0 });
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
    g.expect.zone(SOL_RING, 'battlefield', { seat: 1 });
    expect(life(g, 1)).toBe(18);
    g.expect.handSize(0, 1);
    g.expect.invariants();
  });

  test('a permanent that does not share a card type cannot be sacrificed: the choice is only among lands', () => {
    const g = atEndStep([MOUNTAIN], [BEARS, FOREST, 'Swamp']);
    sacrifice(g, MOUNTAIN);
    g.act(1).accept();
    expect(offered(g)).toEqual(idsOf(g, 1, [FOREST, 'Swamp']));
    g.act(1).choosePermanents('Swamp');
    g.expect.zone('Swamp', 'graveyard', { seat: 1 });
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
    expect(life(g, 1)).toBe(20);
    g.expect.invariants();
  });
});

describe('you sacrifice a permanent with two card types (CR 205.2a)', () => {
  test('the opponent may sacrifice an artifact', () => {
    const g = atEndStep([GOLEM], [BEARS, SOL_RING, FOREST]);
    sacrifice(g, GOLEM);
    g.act(1).accept();
    // The creature and the artifact share a card type with the artifact creature; the land does not.
    expect(offered(g)).toEqual(idsOf(g, 1, [BEARS, SOL_RING]));
    g.act(1).choosePermanents(SOL_RING);
    g.expect.zone(GOLEM, 'graveyard', { seat: 0 });
    g.expect.zone(SOL_RING, 'graveyard', { seat: 1 });
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
    expect(life(g, 1)).toBe(20);
    g.expect.handSize(0, 0);
    g.expect.invariants();
  });

  test('or a creature', () => {
    const g = atEndStep([GOLEM], [BEARS, SOL_RING, FOREST]);
    sacrifice(g, GOLEM);
    g.act(1).accept();
    g.act(1).choosePermanents(BEARS);
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.zone(SOL_RING, 'battlefield', { seat: 1 });
    expect(life(g, 1)).toBe(20);
    g.expect.invariants();
  });

  test('with only a land, the opponent has nothing that shares a type and loses 2 life', () => {
    const g = atEndStep([GOLEM], [FOREST]);
    sacrifice(g, GOLEM);
    expect(g.state.pending?.kind).toBe('priority');
    expect(life(g, 1)).toBe(18);
    g.expect.handSize(0, 1);
  });
});

describe('what you may sacrifice', () => {
  test('you choose among all the permanents of the five kinds', () => {
    const g = atEndStep([GOLEM, MOUNTAIN], [FOREST]);
    g.act(0).accept();
    expect(g.state.pending).toMatchObject({ kind: 'choosePermanent', seat: 0 });
    // Braids itself is a creature and may be sacrificed.
    expect(offered(g)).toEqual(idsOf(g, 0, [BRAIDS, GOLEM, MOUNTAIN]));
    g.act(0).choosePermanents(MOUNTAIN);
    g.act(1).accept();
    g.expect.zone(FOREST, 'graveyard', { seat: 1 });
  });
});
