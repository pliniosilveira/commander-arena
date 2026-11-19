// Issue 89 (Silverquill Influence), goad (D-639): the keyword action and the designation, an effect ("Goad target creature.") and a static ability of an Aura ("Enchanted
// creature ... is goaded.").
// Pins: CR 701.15a (a goad lasts until the next turn of the controller of the spell or ability), CR 701.15b (a goaded creature attacks each combat if able and attacks a
// player other than the goader if able; goaded is a designation, not an ability), CR 701.15c (several players may goad one creature), CR 701.15d (goading it again by the
// same player has no effect), CR 508.1d (a requirement that can be obeyed is), CR 611.3a and 613.1f (a static ability applies only while its source does).
// Cards: SYNTHETIC cards of this file, Grizzly Bears, Serra Angel and the basic lands.
import { describe, expect, test } from 'vitest';
import { attackCandidates, requiredAttackers } from '../src/rules/combat-legality';
import { derive } from '../src/rules/derive';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const BEARS = 'Grizzly Bears';
const ANGEL = 'Serra Angel';
const GOAD = 'SYNTHETIC Goad Spell'; // Instant. Goad target creature.
const AURA = 'SYNTHETIC Goad Aura'; // Enchant creature. Enchanted creature gets +1/+1 and is goaded.
const PURGE = 'SYNTHETIC Purge'; // Instant. Destroy target enchantment.

const T1 = { kind: 'target', id: 't1' } as const;
const CREATURE = { zone: 'battlefield', types: ['creature'] } as const;

const goadSpell = singleFaceCard({
  name: GOAD,
  manaCost: ['R'],
  types: ['instant'],
  colors: ['R'],
  colorIdentity: ['R'],
  oracleText: 'Goad target creature.',
  spell: {
    targets: [{ id: 't1', what: { kind: 'object', filter: CREATURE } }],
    effect: { kind: 'goad', objects: T1 },
  },
});

const goadAura = singleFaceCard({
  name: AURA,
  manaCost: ['1', 'R'],
  types: ['enchantment'],
  subtypes: ['Aura'],
  colors: ['R'],
  colorIdentity: ['R'],
  oracleText: 'Enchant creature\nEnchanted creature gets +1/+1 and is goaded.',
  abilities: [
    { kind: 'keyword', keyword: { kind: 'enchant', filter: { types: ['creature'] } } },
    {
      kind: 'static',
      static: {
        kind: 'modifyPt',
        subject: { kind: 'attached', types: ['creature'] },
        power: 1,
        toughness: 1,
      },
    },
    { kind: 'static', static: { kind: 'goaded', subject: { kind: 'attached' } } },
  ],
});

const purge = singleFaceCard({
  name: PURGE,
  manaCost: ['W'],
  types: ['instant'],
  colors: ['W'],
  colorIdentity: ['W'],
  oracleText: 'Destroy target enchantment.',
  spell: {
    targets: [
      {
        id: 't1',
        what: { kind: 'object', filter: { zone: 'battlefield', types: ['enchantment'] } },
      },
    ],
    effect: { kind: 'destroy', objects: T1 },
  },
});

/** Seat 0 holds `hand`, seat 1 has Bears and Serra Angel; it is seat 0's precombat main phase. */
function board(hand: readonly string[]): ScenarioGame {
  return scenario()
    .seat(0)
    .define(goadSpell)
    .define(goadAura)
    .define(purge)
    .hand(...hand)
    .battlefield('Mountain', 'Mountain', 'Mountain', 'Plains')
    .library('Plains', 'Plains', 'Plains')
    .seat(1)
    .battlefield(BEARS, ANGEL)
    .library('Plains', 'Plains', 'Plains')
    .at('precombatMain')
    .build();
}

const resolve = (g: ScenarioGame) => g.passAll();

/** Seat 1's declare-attackers decision on their next turn. */
function opponentAttacks(g: ScenarioGame) {
  g.advanceTo('precombatMain', { turn: 'next' });
  g.advanceTo('declareAttackers', { attack: false });
  const d = g.state.pending;
  if (d?.kind !== 'declareAttackers') throw new Error(`expected declareAttackers, got ${d?.kind}`);
  return d;
}

describe('CR 701.15a-b: "Goad target creature."', () => {
  const goaded = () => {
    const g = board([GOAD]);
    g.act(0).cast(GOAD, { targets: [BEARS], pay: true });
    resolve(g);
    return g;
  };

  test("the goaded creature must attack on its controller's next turn, and the other creature need not", () => {
    const g = goaded();
    const d = opponentAttacks(g);
    expect([...d.mustAttack]).toEqual([g.id(BEARS)]);
    expect(g.act(1).try.declareAttackers([]).ok).toBe(false);
    expect(g.act(1).try.declareAttackers([{ attacker: ANGEL }]).ok).toBe(false);
    expect(g.act(1).try.declareAttackers([{ attacker: BEARS }]).ok).toBe(true);
  });

  test('goaded is a designation of the permanent, not an ability: it has no ability it did not have', () => {
    const g = goaded();
    const bears = g.object(g.id(BEARS));
    expect(derive(g.state, bears).abilities).toEqual([]);
  });

  test('it ends as the next turn of the goader begins (CR 701.15a)', () => {
    const g = goaded();
    g.advanceTo('precombatMain', { turn: 'next' });
    expect(g.state.continuousEffects).toHaveLength(1);
    g.advanceTo('precombatMain', { turn: 'next' });
    expect(g.state.turn.activeSeat).toBe(0);
    expect(g.state.continuousEffects).toHaveLength(0);
  });

  test('goaded again by the same player has no effect: one requirement (CR 701.15d)', () => {
    const g = board([GOAD, GOAD]);
    g.act(0).cast('SYNTHETIC Goad Spell[0]', { targets: [BEARS], pay: true });
    resolve(g);
    g.act(0).cast('SYNTHETIC Goad Spell[0]', { targets: [BEARS], pay: true });
    resolve(g);
    expect(g.state.continuousEffects).toHaveLength(1);
  });

  test('"a player other than the goader": with a third player the goaded creature may attack only that player (CR 701.15b)', () => {
    const g = goaded();
    const with3 = {
      ...g.state,
      seats: [...g.state.seats, { ...g.state.seats[1], id: 2 }] as typeof g.state.seats,
    };
    const bears = g.id(BEARS);
    const candidates = attackCandidates({ ...with3, turn: { ...with3.turn, activeSeat: 1 } }, 1);
    expect(candidates.find((c) => c.attacker === bears)?.targets).toEqual([
      { kind: 'player', seat: 2 },
    ]);
  });

  test('with two players the only player it can attack is the goader, so it attacks them (CR 701.15b: "if able")', () => {
    const g = goaded();
    const bears = g.id(BEARS);
    opponentAttacks(g);
    const candidates = attackCandidates(g.state, 1);
    expect(candidates.find((c) => c.attacker === bears)?.targets).toEqual([
      { kind: 'player', seat: 0 },
    ]);
  });

  test('a creature that cannot attack is not required to (CR 508.1d): a tapped goaded creature stays home', () => {
    const g = goaded();
    const bears = g.id(BEARS);
    const object = g.state.objects[bears];
    if (object === undefined) throw new Error('no Bears');
    const state = {
      ...g.state,
      objects: { ...g.state.objects, [bears]: { ...object, tapped: true } },
      turn: { ...g.state.turn, activeSeat: 1 },
    };
    expect(requiredAttackers(state, attackCandidates(state, 1))).not.toContain(bears);
    const untapped = { ...g.state, turn: { ...g.state.turn, activeSeat: 1 } };
    expect(requiredAttackers(untapped, attackCandidates(untapped, 1))).toContain(bears);
  });
});

describe('CR 701.15b with CR 611.3a: an Aura that says "is goaded"', () => {
  const enchanted = () => {
    const g = board([AURA, PURGE]);
    g.act(0).cast(AURA, { targets: [BEARS], pay: true });
    resolve(g);
    return g;
  };

  test("the enchanted creature must attack on its controller's turn, and no continuous effect was made (it is a static ability)", () => {
    const g = enchanted();
    expect(g.state.continuousEffects).toHaveLength(0);
    const d = opponentAttacks(g);
    expect([...d.mustAttack]).toEqual([g.id(BEARS)]);
  });

  test("it is goaded by the Aura's controller, not by the creature's: it attacks a player other than seat 0", () => {
    const g = enchanted();
    const bears = g.id(BEARS);
    const with3 = {
      ...g.state,
      seats: [...g.state.seats, { ...g.state.seats[1], id: 2 }] as typeof g.state.seats,
    };
    const candidates = attackCandidates({ ...with3, turn: { ...with3.turn, activeSeat: 1 } }, 1);
    expect(candidates.find((c) => c.attacker === bears)?.targets).toEqual([
      { kind: 'player', seat: 2 },
    ]);
  });

  test('it lasts as long as the Aura does, however many turns pass, and ends when the Aura leaves', () => {
    const g = enchanted();
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    const d = (() => {
      g.advanceTo('declareAttackers', { attack: false });
      const p = g.state.pending;
      if (p?.kind !== 'declareAttackers') throw new Error('expected declareAttackers');
      return p;
    })();
    expect([...d.mustAttack]).toEqual([g.id(BEARS)]);
  });

  test('when the Aura is destroyed the creature is no longer required to attack', () => {
    const g = enchanted();
    g.act(0).cast(PURGE, { targets: [AURA], pay: true });
    resolve(g);
    g.expect.zone(AURA, 'graveyard', { seat: 0 });
    const d = opponentAttacks(g);
    expect([...d.mustAttack]).toEqual([]);
  });

  test('an Aura that lost all its abilities gives nothing (CR 613.1f)', () => {
    const g = enchanted();
    const aura = g.id(AURA);
    const bears = g.id(BEARS);
    const base = { ...g.state, turn: { ...g.state.turn, activeSeat: 1 } };
    expect(requiredAttackers(base, attackCandidates(base, 1))).toContain(bears);
    const state = {
      ...base,
      continuousEffects: [
        ...base.continuousEffects,
        {
          id: 'ce-test',
          timestamp: 999,
          objects: [aura],
          until: 'permanent' as const,
          change: { kind: 'loseAllAbilities' as const },
        },
      ],
    };
    expect(requiredAttackers(state, attackCandidates(state, 1))).not.toContain(bears);
  });
});
