// "Copy target instant or sorcery spell, then return it to its owner's hand. You may choose new targets for the copy." (jeskai copy group, Narset's Reversal shape)
// Pins: CR 707.10 and 707.10c (the copy, with new targets), CR 400.3 (a spell that leaves the stack goes to its owner's hand), CR 608.2b (the target must
// still be a spell on the stack), CR 707.10a (a copy that is returned ceases to exist), CR 608.2n/608.2 (the returned spell does not resolve).
// Cards are SYNTHETIC (built here).
import { describe, expect, test } from 'vitest';
import type { ObjectFilter, TargetSpec } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const REVERSAL = 'SYNTHETIC Reversal Twin'; // {U}{U} instant: copy target instant or sorcery spell, then return it to its owner's hand
const BOLT = 'SYNTHETIC Copy Bolt'; // {R} instant: 2 damage to any target (synthetic-copies.ts)
const FILLER = Array.from({ length: 12 }, () => 'Plains');

const SPELL: ObjectFilter = {
  stackKind: 'spell',
  anyOf: [{ types: ['instant'] }, { types: ['sorcery'] }],
};
const TARGET: TargetSpec = { id: 't1', what: { kind: 'object', filter: SPELL } };
const T1 = { kind: 'target', id: 't1' } as const;

const reversal = singleFaceCard({
  name: REVERSAL,
  manaCost: ['U', 'U'],
  types: ['instant'],
  colors: ['U'],
  colorIdentity: ['U'],
  oracleText:
    "Copy target instant or sorcery spell, then return it to its owner's hand. You may choose new targets for the copy.",
  spell: {
    targets: [TARGET],
    effect: {
      kind: 'sequence',
      effects: [
        { kind: 'copySpell', spell: T1, newTargets: 'may' },
        { kind: 'moveToZone', objects: T1, to: 'hand' },
      ],
    },
  },
});

function game(): ScenarioGame {
  return scenario()
    .define(reversal)
    .seat(0)
    .life(20)
    .hand(BOLT, REVERSAL)
    .battlefield('Mountain')
    .battlefield('Island', { count: 2 })
    .library(...FILLER)
    .seat(1)
    .life(20)
    .library(...FILLER)
    .build();
}

const resolveTop = (g: ScenarioGame): void => {
  g.pass();
  g.pass();
};

describe('copy target instant or sorcery spell, then return it to its owner hand (CR 707.10, 400.3)', () => {
  test('the copy resolves, the original is back in the hand and never resolves', () => {
    const g = game();
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.act(0).cast(REVERSAL, { targets: [{ name: BOLT, zone: 'stack' }], pay: true });
    resolveTop(g);
    // The copy is on the stack and its controller is asked for new targets; the return waits for the answer.
    g.expect.pending('targets', 0);
    g.act(0).chooseTargets({ player: 1 });
    // The original left the stack for its owner's hand, so only the copy is there.
    expect(g.find({ name: BOLT, zone: 'hand' })).toHaveLength(1);
    expect(g.state.stack).toHaveLength(1);
    resolveTop(g);
    g.expect.life(1, 18); // the copy dealt 2, once
    expect(g.find({ name: BOLT, zone: 'graveyard' })).toHaveLength(0);
    expect(Object.values(g.state.objects).filter((o) => o.copyOf !== undefined)).toHaveLength(0);
    g.expect.invariants();
  });

  test('the copy may have a new target and the returned card can be cast again', () => {
    const g = game();
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.act(0).cast(REVERSAL, { targets: [{ name: BOLT, zone: 'stack' }], pay: true });
    resolveTop(g);
    g.act(0).chooseTargets({ player: 0 });
    resolveTop(g);
    g.expect.life(0, 18);
    g.expect.life(1, 20);
    expect(g.find({ name: BOLT, zone: 'hand' })).toHaveLength(1);
  });

  test('the target countered in response: Reversal has no legal target and does nothing (CR 608.2b)', () => {
    const g = scenario()
      .define(reversal)
      .seat(0)
      .life(20)
      .hand(BOLT, REVERSAL)
      .battlefield('Mountain')
      .battlefield('Island', { count: 2 })
      .library(...FILLER)
      .seat(1)
      .life(20)
      .hand('Counterspell')
      .battlefield('Island', { count: 2 })
      .library(...FILLER)
      .build();
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.act(0).cast(REVERSAL, { targets: [{ name: BOLT, zone: 'stack' }], pay: true });
    g.pass();
    g.act(1).cast('Counterspell', { targets: [{ name: BOLT, zone: 'stack' }], pay: true });
    resolveTop(g); // Counterspell counters Copy Bolt
    resolveTop(g); // Reversal: its only target is gone
    expect(g.find({ name: BOLT, zone: 'hand' })).toHaveLength(0);
    expect(g.state.stack).toHaveLength(0);
    g.expect.life(1, 20);
    g.expect.invariants();
  });
});
