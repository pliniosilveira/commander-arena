// Scenario 2 (SPEC 12): a spell with two targets where one or both become illegal.
// Pins: CR 608.2b (Resolving Spells and Abilities): targets are checked again on resolution. An
// illegal target is not affected, the spell does the rest of its text for the legal ones, and if
// every target is illegal the spell doesn't resolve at all: it is removed from the stack and put
// into its owner's graveyard, so even the parts that don't target do not happen (the CR's example
// is Sorin's Thirst, whose life gain does not happen). CR 608.2c: the instructions are followed in
// written order, so "draw a card" still happens when one target is legal. CR 704.5g: lethal damage
// destroys a creature.
// The spell is SYNTHETIC (invented, defined in this file): "~ deals 2 damage to target creature and
// 2 damage to target creature. Draw a card." The responses are Lightning Bolts from the targets'
// controller, which kill a target the way "becomes an illegal target" usually happens.
import { describe, test } from 'vitest';
import { scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const SPELL = 'SYNTHETIC Twin Strike Draw';
const BOLT = 'Lightning Bolt';
const BEARS = 'Grizzly Bears'; // 2/2: dies to 2 damage
const WALL = 'SYNTHETIC Vanilla 3/3'; // survives 2 damage, so the damage is visible on it

const CREATURE = { zone: 'battlefield', types: ['creature'] } as const;
const twinStrikeDraw = singleFaceCard({
  name: SPELL,
  manaCost: ['1', 'R'],
  types: ['instant'],
  colors: ['R'],
  colorIdentity: ['R'],
  oracleText: 'Deals 2 damage to target creature and 2 damage to target creature. Draw a card.',
  spell: {
    targets: [
      { id: 't1', what: { kind: 'object', filter: CREATURE } },
      { id: 't2', what: { kind: 'object', filter: CREATURE } },
    ],
    effect: {
      kind: 'sequence',
      effects: [
        { kind: 'dealDamage', amount: 2, to: { kind: 'target', id: 't1' } },
        { kind: 'dealDamage', amount: 2, to: { kind: 'target', id: 't2' } },
        { kind: 'draw', player: { kind: 'you' }, count: 1 },
      ],
    },
  },
});

/**
 * Seat 0 casts the spell at the Wall (t1) and the Bears (t2) and passes; seat 1 (who owns both
 * and holds two Bolts) has priority with the spell on the stack.
 */
function spellOnTheStack() {
  const g = scenario()
    .seat(0)
    .hand(SPELL)
    .battlefield('Mountain', 'Mountain')
    .library('Forest', 'Island')
    .seat(1)
    .hand(BOLT, { label: 'boltA' })
    .hand(BOLT, { label: 'boltB' })
    .battlefield('Mountain', 'Mountain')
    .battlefield(WALL, BEARS)
    .define(twinStrikeDraw)
    .build();
  g.act(0).cast(SPELL, { targets: [WALL, BEARS], pay: true });
  g.act(0).pass();
  return g;
}

describe('SPEC scenario 2: partial fizzle (CR 608.2b)', () => {
  test('baseline: both targets legal, both are hit and the card is drawn', () => {
    const g = spellOnTheStack();
    g.act(1).pass();
    g.expect.damage(WALL, 2);
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.handSize(0, 1);
    g.expect.zone('Forest', 'hand', { seat: 0 });
    g.expect.zone(SPELL, 'graveyard', { seat: 0 });
    g.expect.noEvent({ kind: 'fizzled' });
  });

  test('one target becomes illegal (it dies in response): the spell still hits the other and draws', () => {
    const g = spellOnTheStack();
    g.act(1).cast('boltA', { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    // The Wall was a legal target and takes its 2 damage; the dead Bears take nothing more.
    g.expect.zone(WALL, 'battlefield', { seat: 1 });
    g.expect.damage(WALL, 2);
    // The untargeted part still happens.
    g.expect.handSize(0, 1);
    g.expect.zone('Forest', 'hand', { seat: 0 });
    g.expect.zone(SPELL, 'graveyard', { seat: 0 });
    g.expect.noEvent({ kind: 'fizzled', cardName: SPELL });
    g.expect.stack([]);
    g.expect.invariants();
  });

  test('the first target becomes illegal instead: the second is still hit and the card is drawn', () => {
    const g = spellOnTheStack();
    g.act(1).cast('boltA', { targets: [WALL], pay: true });
    g.passAll();
    // Bolt (3) killed the Wall in response; the spell kills the Bears and draws.
    g.expect.zone(WALL, 'graveyard', { seat: 1 });
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.handSize(0, 1);
    g.expect.noEvent({ kind: 'fizzled', cardName: SPELL });
  });

  test('both targets illegal: the spell does nothing, including the draw, and goes to the graveyard', () => {
    const g = spellOnTheStack();
    g.act(1).cast('boltA', { targets: [BEARS], pay: true });
    g.act(1).cast('boltB', { targets: [WALL], pay: true });
    g.expect.stack([BOLT, BOLT, SPELL]);
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.zone(WALL, 'graveyard', { seat: 1 });
    // The twin strike has no legal target left, so it doesn't resolve: no draw.
    g.expect.eventLog([{ kind: 'fizzled', cardName: SPELL }]);
    g.expect.handSize(0, 0);
    g.expect.librarySize(0, 2);
    g.expect.noEvent({ kind: 'cardDrawn' });
    g.expect.zone(SPELL, 'graveyard', { seat: 0 });
    g.expect.stack([]);
    g.expect.invariants();
  });
});
