// Repeatable modes (D-1000, CR 700.2d): the REAL card of the golden corpus read through the grammar only (no override) and played through applyAction:
// Fiery Confluence (issue 25), "Choose three. You may choose the same mode more than once." with "1 damage to each creature", "2 damage to each
// opponent" and "Destroy target artifact". The creatures and the artifact that stand in for the board are SYNTHETIC (named so) or real engine
// fixtures (Grizzly Bears, Giant Spider, Sol Ring).
import { readFileSync } from 'node:fs';
import type { CardDefinition, ChooseModesDecision, TargetsDecision } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parsed } from './convert-grammar-helpers';

const cards: readonly GoldenCard[] = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

function real(name: string): CardDefinition {
  const card = cards.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.reasons, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

const FIERY = real('Fiery Confluence');
const TRINKET = parsed('SYNTHETIC Trinket', 'Artifact', '', { manaCost: '{1}' });
const GOLEM = parsed('SYNTHETIC Iron Golem', 'Artifact Creature — Golem', '', {
  manaCost: '{3}',
  power: '1',
  toughness: '1',
});
const BEARS = 'Grizzly Bears'; // 2/2
const SPIDER = 'Giant Spider'; // 2/4
const SOL_RING = 'Sol Ring';
const LIBRARY = ['Forest', 'Swamp', 'Plains', 'Mountain', 'Island'] as const;

// The three bullets, in printed order.
const EACH_CREATURE = 0;
const EACH_OPPONENT = 1;
const DESTROY = 2;

const define = (...defs: readonly CardDefinition[]) =>
  defs.reduce((builder, def) => builder.define(def), scenario());

/** Seat 0 holds Fiery Confluence with {2}{R}{R}; seat 1 has what is named. */
const game = (...theirs: readonly string[]) =>
  define(FIERY, TRINKET, GOLEM)
    .seat(0)
    .hand(FIERY.name)
    .life(20)
    .pool('RRRR')
    .library(...LIBRARY)
    .seat(1)
    .life(20)
    .battlefield(...theirs)
    .library(...LIBRARY)
    .build();

const decision = <K extends 'targets' | 'chooseModes'>(g: ScenarioGame, kind: K) => {
  const d = g.state.pending;
  if (d?.kind !== kind) throw new Error(`expected ${kind}, got ${d?.kind}`);
  return d as K extends 'targets' ? TargetsDecision : ChooseModesDecision;
};

describe('Fiery Confluence: "Choose three. You may choose the same mode more than once." (CR 700.2d)', () => {
  test('the whole card reads: three modes, a repeatable choice of three, one target slot in the last mode', () => {
    const spell = FIERY.faces[0]?.spell;
    expect(spell?.chooseModes).toEqual({ min: 3, max: 3, repeatable: true });
    expect(spell?.modes).toHaveLength(3);
    expect(spell?.modes?.[EACH_CREATURE]?.targets).toBeUndefined();
    expect(spell?.modes?.[EACH_OPPONENT]?.targets).toBeUndefined();
    expect(spell?.modes?.[DESTROY]?.targets).toHaveLength(1);
  });

  test('with an artifact on the battlefield every multiset of three is a legal choice (ten of them)', () => {
    const g = game(SOL_RING);
    g.act(0).cast(FIERY.name);
    const d = decision(g, 'chooseModes');
    expect(d).toMatchObject({ min: 3, max: 3, repeatable: true });
    expect(d.sets).toHaveLength(10);
    expect(d.sets[0]).toEqual([0, 0, 0]);
    expect(d.sets.at(-1)).toEqual([2, 2, 2]);
    expect(d.modes.map((m) => m.legal)).toEqual([true, true, true]);
  });

  test('with no artifact the third mode cannot be chosen: four multisets of the other two', () => {
    const g = game(BEARS);
    g.act(0).cast(FIERY.name);
    const d = decision(g, 'chooseModes');
    expect(d.modes.map((m) => m.legal)).toEqual([true, true, false]);
    expect(d.sets).toEqual([
      [0, 0, 0],
      [0, 0, 1],
      [0, 1, 1],
      [1, 1, 1],
    ]);
  });

  test('the first mode three times: 3 damage to each creature, to both sides, and no target is asked', () => {
    const g = game(BEARS, SPIDER);
    g.act(0).cast(FIERY.name).modes(EACH_CREATURE, EACH_CREATURE, EACH_CREATURE).pay();
    g.passAll();
    // 3 damage: the 2/2 dies, the 2/4 does not.
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.damage(SPIDER, 3);
    g.expect.life(1, 20);
    g.expect.invariants();
  });

  test('the second mode three times: 6 damage to each opponent', () => {
    const g = game(BEARS);
    g.act(0).cast(FIERY.name).modes(EACH_OPPONENT, EACH_OPPONENT, EACH_OPPONENT).pay();
    g.passAll();
    g.expect.life(1, 14);
    g.expect.life(0, 20);
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
  });

  test('one of each: 1 damage to each creature, 2 to each opponent, the artifact destroyed (CR 608.2c, in printed order)', () => {
    const g = game(SOL_RING, BEARS);
    g.act(0).cast(FIERY.name).modes(DESTROY, EACH_OPPONENT, EACH_CREATURE);
    expect(decision(g, 'targets').specs.map((s) => s.specId)).toEqual(['t1']);
    g.act(0).chooseTargets(SOL_RING).payAuto();
    g.passAll();
    g.expect.zone(SOL_RING, 'graveyard', { seat: 1 });
    g.expect.damage(BEARS, 1);
    g.expect.life(1, 18);
  });

  test('"Destroy target artifact" three times: one slot for each, the same artifact for all three, destroyed once', () => {
    const g = game(SOL_RING);
    g.act(0).cast(FIERY.name).modes(DESTROY, DESTROY, DESTROY);
    const d = decision(g, 'targets');
    expect(d.specs.map((s) => ({ id: s.specId, instance: s.instance }))).toEqual([
      { id: 't1', instance: undefined },
      { id: 't1#2', instance: 1 },
      { id: 't1#3', instance: 2 },
    ]);
    g.act(0).chooseTargets(SOL_RING, SOL_RING, SOL_RING).payAuto();
    g.passAll();
    g.expect.zone(SOL_RING, 'graveyard', { seat: 1 });
    g.expect.invariants();
  });

  test('"Destroy target artifact" three times over three artifacts: a different one for each', () => {
    const g = game(SOL_RING, TRINKET.name, GOLEM.name);
    g.act(0).cast(FIERY.name).modes(DESTROY, DESTROY, DESTROY);
    g.act(0).chooseTargets(SOL_RING, TRINKET.name, GOLEM.name).payAuto();
    g.passAll();
    g.expect.zone(SOL_RING, 'graveyard', { seat: 1 });
    g.expect.zone(TRINKET.name, 'graveyard', { seat: 1 });
    g.expect.zone(GOLEM.name, 'graveyard', { seat: 1 });
  });

  test('an artifact creature: 1 damage to each creature kills the 1/1 golem, the later destroy has no target and does nothing', () => {
    const g = game(GOLEM.name, SPIDER);
    g.act(0).cast(FIERY.name).modes(EACH_CREATURE, DESTROY, DESTROY);
    g.act(0).chooseTargets(GOLEM.name, GOLEM.name).payAuto();
    g.passAll();
    g.expect.zone(GOLEM.name, 'graveyard', { seat: 1 });
    g.expect.damage(SPIDER, 1);
    g.expect.invariants();
  });
});
