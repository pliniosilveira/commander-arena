// A copy of a spell that divides damage keeps the original division (D-149, polish of D-129 and D-145).
// Pins: CR 707.10 (a copy copies all decisions made for the spell, the division of 601.2d among them), CR 707.10c (the player may leave any
// number of targets unchanged and the new ones must be legal), CR 115.7f (when changing targets of a spell that divides something, the
// original division can't be changed: a new target takes the share of the one it replaces, the others keep theirs), CR 601.2d (each target
// still gets at least one). Cards are SYNTHETIC (src/cards/fixtures/synthetic-divide.ts, synthetic-copies.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { type ChosenTarget, legalActionsForDecision } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { targetsDecision } from './pending-helpers';

const TWIN = 'SYNTHETIC Twin Spell'; // {U}{U}: copy target instant or sorcery spell, new targets may be chosen
const EXACT = 'SYNTHETIC Exact Twin'; // {U}: copy target instant or sorcery spell, same targets
const VOLLEY = 'SYNTHETIC Arc Volley'; // {1}{R} instant: 3 damage divided among one, two or three targets
const V22 = 'SYNTHETIC Vanilla 2/2';
const V33 = 'SYNTHETIC Vanilla 3/3';
const V55 = 'SYNTHETIC Vanilla 5/5';
const FILLER = Array.from({ length: 8 }, () => 'Plains');

/** Seat 0 casts the Volley at `a` (2) and `b` (1) and then the copier with `copier`, which has resolved when this returns. */
const copied = (copier: string) => {
  const g = scenario()
    .seat(0)
    .library(...FILLER)
    .hand(VOLLEY, copier)
    .battlefield('Mountain', 'Island', 'Island', 'Island', 'Island')
    .seat(1)
    .library(...FILLER)
    .battlefield(V55, { label: 'a' })
    .battlefield(V55, { label: 'b' })
    .battlefield(V22, { label: 'c' })
    .battlefield(V33, { label: 'd' })
    .build();
  g.act(0).cast(VOLLEY, { targets: ['a', 'b'], divide: [2, 1], pay: true });
  g.act(0).cast(copier, { targets: [{ name: VOLLEY, zone: 'stack' }], pay: true });
  g.pass();
  g.pass();
  return g;
};

const objectTarget = (g: ScenarioGame, label: string): ChosenTarget => ({
  kind: 'object',
  id: g.id(label),
  specId: 't1',
});

/** The shares of the copy on the stack, by target label. */
const sharesOfCopy = (
  g: ScenarioGame,
  labels: readonly string[],
): Record<string, number | undefined> => {
  const copy = Object.values(g.state.objects).find((o) => o.copyOf !== undefined);
  const out: Record<string, number | undefined> = {};
  for (const label of labels) {
    const t = copy?.stack?.chosenTargets.find((x) => x.kind === 'object' && x.id === g.id(label));
    out[label] = t?.share;
  }
  return out;
};

describe('a copy with the same targets', () => {
  test('keeps the division: the shares are those of the original', () => {
    const g = copied(EXACT);
    g.expect.stack([VOLLEY, VOLLEY]);
    expect(sharesOfCopy(g, ['a', 'b'])).toEqual({ a: 2, b: 1 });
  });
});

describe('a copy with new targets (CR 707.10c, 115.7f)', () => {
  test('the question holds as many targets as the original had, and no division to announce', () => {
    const g = copied(TWIN);
    const d = targetsDecision(g);
    expect(d.forCopy).toBe(true);
    const spec = d.specs[0];
    expect(spec?.min).toBe(2);
    expect(spec?.max).toBe(2);
    expect(spec?.divide).toBeUndefined();
    expect(spec?.keepsDivision).toBe(true);
    expect(d.current?.map((t) => t.kind === 'object' && t.share)).toEqual([2, 1]);
  });

  test('every target left as it is keeps its own share', () => {
    const g = copied(TWIN);
    g.act(0).chooseTargets('a', 'b');
    expect(sharesOfCopy(g, ['a', 'b'])).toEqual({ a: 2, b: 1 });
  });

  test('the same targets in the other order keep their own shares, not the order they are named in', () => {
    const g = copied(TWIN);
    g.act(0).chooseTargets('b', 'a');
    expect(sharesOfCopy(g, ['a', 'b'])).toEqual({ a: 2, b: 1 });
  });

  test('a new target takes the share of the one it replaces', () => {
    const g = copied(TWIN);
    g.act(0).chooseTargets('c', 'b');
    expect(sharesOfCopy(g, ['a', 'b', 'c'])).toEqual({ a: undefined, b: 1, c: 2 });
    g.expect.stack([VOLLEY, VOLLEY]);
  });

  test('two new targets take the shares of the two they replace, in the order they were named', () => {
    const g = copied(TWIN);
    g.act(0).chooseTargets('d', 'c');
    // The original targets in order are a (2) and b (1): the first new target takes a's share, the second b's.
    expect(sharesOfCopy(g, ['c', 'd'])).toEqual({ c: 1, d: 2 });
  });

  test('the copy deals the damage it was divided into', () => {
    const g = copied(TWIN);
    g.act(0).chooseTargets('c', 'b');
    g.pass();
    g.pass(); // the copy resolves: 2 damage to the 2/2, 1 to the 5/5
    g.expect.zone(V22, 'graveyard', { seat: 1 });
    g.expect.damage('b', 1);
    g.expect.damage('a', 0);
  });

  test('a different number of targets is refused: the division cannot change', () => {
    const g = copied(TWIN);
    expect(g.act(0).try.action({ kind: 'chooseTargets', targets: [objectTarget(g, 'c')] }).ok).toBe(
      false,
    );
    expect(
      g.act(0).try.action({
        kind: 'chooseTargets',
        targets: [objectTarget(g, 'a'), objectTarget(g, 'b'), objectTarget(g, 'c')],
      }).ok,
    ).toBe(false);
    g.expect.pending('targets', 0);
  });

  test('a share in the answer is refused: nothing is announced for a copy', () => {
    const g = copied(TWIN);
    const withShares: ChosenTarget[] = [
      { ...objectTarget(g, 'c'), share: 2 },
      { ...objectTarget(g, 'b'), share: 1 },
    ];
    expect(g.act(0).try.action({ kind: 'chooseTargets', targets: withShares }).ok).toBe(false);
  });

  test('the actions the engine lists are all accepted, and none has a share', () => {
    const g = copied(TWIN);
    const d = targetsDecision(g);
    const listed = legalActionsForDecision(d).filter((a) => a.kind === 'chooseTargets');
    expect(listed.length).toBeGreaterThan(1);
    for (const action of listed) {
      if (action.kind !== 'chooseTargets') continue;
      expect(action.targets.every((t) => t.share === undefined)).toBe(true);
      expect(action.targets).toHaveLength(2);
    }
  });

  test('a target that became illegal may stay (CR 707.10c) and keeps its share', () => {
    const g = copied(TWIN);
    g.act(0).chooseTargets('a', 'd');
    expect(sharesOfCopy(g, ['a', 'd'])).toEqual({ a: 2, d: 1 });
    g.expect.invariants();
  });
});
