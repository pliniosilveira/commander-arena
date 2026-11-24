// "Change a target of target spell or ability to this creature" (CR 115.7b, Spellskite; the rule text was not available to check, so the numbers are cited as the
// code already cites them): one target of a spell or ability on the stack, of any number, becomes the source, only if the source is a legal target for that slot
// and not already a target of it; the controller of the effect picks which target when several can change. SYNTHETIC cards.
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import type { Effect } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { targetsDecision } from './pending-helpers';

const SKITE = 'SYNTHETIC Skite Imp'; // {U}: change a target of target spell or ability to this creature
const BEARS = 'Grizzly Bears';
const BOLT = 'Lightning Bolt';
const SPLIT = 'SYNTHETIC Split Bolt'; // creature target t1 and any other target t2
const NO_ARTIFACT = 'SYNTHETIC Clean Kill'; // destroy target nonartifact creature
const cleanKill = singleFace({
  name: NO_ARTIFACT,
  manaCost: ['B'],
  types: ['instant'],
  colors: ['B'],
  colorIdentity: ['B'],
  oracleText: 'SYNTHETIC: Destroy target nonartifact creature.',
  spell: {
    targets: [
      {
        id: 't1',
        what: {
          kind: 'object',
          filter: { zone: 'battlefield', types: ['creature'], notTypes: ['artifact'] },
        },
      },
    ],
    effect: { kind: 'destroy', objects: { kind: 'target', id: 't1' } },
  },
});

const changeToThis: Effect = {
  kind: 'changeTarget',
  object: { kind: 'target', id: 't1' },
  to: { kind: 'this' },
};
const skite = singleFace({
  name: SKITE,
  manaCost: ['2'],
  types: ['artifact', 'creature'],
  subtypes: ['Imp'],
  colors: [],
  colorIdentity: [],
  power: 0,
  toughness: 4,
  oracleText: 'SYNTHETIC: {U}: Change a target of target spell or ability to this creature.',
  abilities: [
    {
      kind: 'activated',
      cost: [{ kind: 'mana', symbols: ['U'] }],
      effect: changeToThis,
      targets: [{ id: 't1', what: { kind: 'object', filter: { zone: 'stack' } } }],
    },
  ],
});

const FILLER = Array.from({ length: 8 }, () => 'Plains');
const targetsOf = (g: ScenarioGame, name: string) =>
  g.find({ name, zone: 'stack' })[0]?.stack?.chosenTargets ?? [];

/** Every player passes until the top of the stack has resolved or a decision is waiting. */
function resolveTop(g: ScenarioGame): void {
  const size = g.state.stack.length;
  for (let i = 0; i < 8 && g.state.stack.length === size && g.state.pending?.kind === 'priority'; i++) {
    g.pass();
  }
}

function game(seats: 2 | 3 | 4) {
  let b = scenario({ seats })
    .seat(0)
    .define(skite)
    .define(cleanKill)
    .library(...FILLER)
    .hand(BOLT, SPLIT, NO_ARTIFACT)
    .battlefield('Mountain', { count: 4 })
    .battlefield('Swamp', { count: 3 })
    .battlefield(BEARS)
    .seat(1)
    .library(...FILLER)
    .battlefield(SKITE)
    .battlefield('Island', { count: 2 });
  if (seats > 2) {
    b = b
      .seat(2)
      .library(...FILLER)
      .battlefield(BEARS);
  }
  if (seats > 3) b = b.seat(3).library(...FILLER);
  return b.build();
}

describe('change a target of a spell or ability to the source (CR 115.7b)', () => {
  test('a spell with one target now targets the creature, and the spell resolves on it', () => {
    const g = game(2);
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.act(0).pass();
    g.act(1).activate(SKITE, { targets: [{ name: BOLT, zone: 'stack' }], pay: true });
    resolveTop(g);
    expect(targetsOf(g, BOLT)).toEqual([{ kind: 'object', id: g.id(SKITE), specId: 't1' }]);
    resolveTop(g);
    expect(g.find({ name: SKITE, zone: 'battlefield' })[0]?.damage).toBe(3);
    g.expect.invariants();
  });

  test('a slot the source is not a legal target of keeps its target', () => {
    const g = game(2);
    g.act(0).cast(NO_ARTIFACT, { targets: [BEARS], pay: true });
    g.act(0).pass();
    g.act(1).activate(SKITE, { targets: [{ name: NO_ARTIFACT, zone: 'stack' }], pay: true });
    resolveTop(g);
    expect(g.state.pending?.kind).toBe('priority');
    expect(targetsOf(g, NO_ARTIFACT)).toEqual([
      { kind: 'object', id: g.id({ name: BEARS, seat: 0 }), specId: 't1' },
    ]);
  });

  test('with two targets that it could replace, the controller of the ability chooses which', () => {
    const g = game(2);
    g.act(0).cast(SPLIT, { targets: [BEARS, { player: 1 }], pay: true });
    g.act(0).pass();
    g.act(1).activate(SKITE, { targets: [{ name: SPLIT, zone: 'stack' }], pay: true });
    resolveTop(g);
    const d = targetsDecision(g);
    expect(d.forChange).toBe(true);
    expect(d.seat).toBe(1);
    expect(d.specs[0]?.legal).toHaveLength(2);
    g.act(1).chooseTargets({ player: 1 });
    const now = targetsOf(g, SPLIT);
    expect(now[0]?.kind).toBe('object');
    expect(now[1]).toEqual({ kind: 'object', id: g.id(SKITE), specId: 't2' });
    g.expect.invariants();
  });

  test('a target that is the source already is not changed; the other one is, without asking', () => {
    const g = game(2);
    g.act(0).cast(SPLIT, { targets: [SKITE, { player: 1 }], pay: true });
    g.act(0).pass();
    g.act(1).activate(SKITE, { targets: [{ name: SPLIT, zone: 'stack' }], pay: true });
    resolveTop(g);
    expect(g.state.pending?.kind).toBe('priority');
    expect(targetsOf(g, SPLIT)).toEqual([
      { kind: 'object', id: g.id(SKITE), specId: 't1' },
      { kind: 'object', id: g.id(SKITE), specId: 't2' },
    ]);
  });

  test.each([3, 4] as const)(
    'at %i seats the player who controls the ability is the one who chooses',
    (seats) => {
      const g = game(seats);
      g.act(0).cast(SPLIT, { targets: [{ name: BEARS, seat: 2 }, { player: 2 }], pay: true });
      g.act(0).pass();
      g.act(1).activate(SKITE, { targets: [{ name: SPLIT, zone: 'stack' }], pay: true });
      resolveTop(g);
      const d = targetsDecision(g);
      expect(d.seat).toBe(1);
      expect(d.specs[0]?.legal).toHaveLength(2);
      g.act(1).chooseTargets({ player: 2 });
      expect(targetsOf(g, SPLIT)[1]).toEqual({ kind: 'object', id: g.id(SKITE), specId: 't2' });
      expect(targetsOf(g, SPLIT)[0]?.kind).toBe('object');
      g.expect.invariants();
    },
  );
});
