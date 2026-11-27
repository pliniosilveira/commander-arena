// "Creature spells you cast this turn can't be countered." (`spellsCantBeCounteredThisTurn`, Domri, Anarch of Bolas): an effect that, until the end of the turn, keeps the spells a
// filter names from being countered. Pins: CR 101.2 (a "can't" effect takes precedence over one that directs something to happen), CR 701.6a (to counter a spell is to cancel it),
// CR 611.2a (a continuous effect from a resolving spell or ability lasts for the duration it states), the rulings of the card (the effect applies to every creature spell cast that
// turn, not only one; a spell that counters can still target it and its other effects still happen). Cards are SYNTHETIC but for the real Counterspell, Grizzly Bears, Lightning Bolt
// and basic lands.
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import { type CardDefinition, validateCard } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';

const WARD = 'SYNTHETIC Creature Ward'; // {G} sorcery
const COUNTERSPELL = 'Counterspell';
const BEARS = 'Grizzly Bears';
const BOLT = 'Lightning Bolt';
const ELVES = 'Llanowar Elves';

const ward: CardDefinition = singleFace({
  name: WARD,
  manaCost: ['G'],
  types: ['sorcery'],
  colors: ['G'],
  colorIdentity: ['G'],
  oracleText: "SYNTHETIC: creature spells you cast this turn can't be countered.",
  abilities: [],
  spell: {
    effect: {
      kind: 'spellsCantBeCounteredThisTurn',
      spells: { types: ['creature'], controller: 'you' },
    },
  },
});

const resolveTop = (g: ScenarioGame) => g.pass().pass();

/** Seat 0 has the Ward and two Bears in hand and the mana for all; seat 1 holds Counterspells. */
const build = () =>
  scenario()
    .define(ward)
    .seat(0)
    .hand(WARD, BEARS, ELVES, BOLT)
    .battlefield('Forest', 'Forest', 'Forest', 'Forest', 'Forest', 'Mountain')
    .seat(1)
    .hand(COUNTERSPELL, COUNTERSPELL, COUNTERSPELL)
    .battlefield('Island', 'Island', 'Island', 'Island')
    .at('precombatMain', { active: 0 })
    .build();

/** Seat 0 casts and resolves the Ward. */
const warded = () => {
  const g = build();
  g.act(0).cast(WARD, { pay: true });
  resolveTop(g);
  return g;
};

describe('the card is valid', () => {
  test('the SYNTHETIC card passes validateCard', () => {
    expect(validateCard(ward)).toEqual([]);
  });
});

describe("CR 101.2, 611.2a: creature spells you cast this turn can't be countered", () => {
  test('without the effect Counterspell counters the creature spell', () => {
    const g = build();
    g.act(0).cast(BEARS, { pay: true });
    g.act(0).pass();
    g.act(1).cast('Counterspell[0]', { targets: [{ name: BEARS, zone: 'stack' }], pay: true });
    resolveTop(g);
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
  });

  test('after it resolved the creature spell is not countered, and Counterspell still resolved', () => {
    const g = warded();
    g.act(0).cast(BEARS, { pay: true });
    g.act(0).pass();
    g.act(1).cast('Counterspell[0]', { targets: [{ name: BEARS, zone: 'stack' }], pay: true });
    resolveTop(g);
    g.expect.zone(COUNTERSPELL, 'graveyard', { seat: 1 });
    g.expect.stack([BEARS]);
    g.expect.noEvent({ kind: 'countered' });
    resolveTop(g);
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
  });

  test('every creature spell that turn is covered, not only the first one', () => {
    const g = warded();
    for (const creature of [BEARS, ELVES]) {
      g.act(0).cast(creature, { pay: true });
      g.act(0).pass();
      g.act(1).cast('Counterspell[0]', { targets: [{ name: creature, zone: 'stack' }], pay: true });
      resolveTop(g);
      resolveTop(g);
    }
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.zone(ELVES, 'battlefield', { seat: 0 });
    g.expect.noEvent({ kind: 'countered' });
  });

  test('a spell that is not a creature spell can still be countered', () => {
    const g = warded();
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.act(0).pass();
    g.act(1).cast('Counterspell[0]', { targets: [{ name: BOLT, zone: 'stack' }], pay: true });
    resolveTop(g);
    g.expect.zone(BOLT, 'graveyard', { seat: 0 });
    g.expect.eventLog([{ kind: 'countered' }]);
  });

  test('it ends with the turn (CR 611.2a): the next turn is built without it', () => {
    const g = warded();
    expect(g.state.turn.uncounterableSpells).toHaveLength(1);
    g.advanceTo('upkeep', { turn: 'next' });
    expect(g.state.turn.uncounterableSpells).toBeUndefined();
  });
});
