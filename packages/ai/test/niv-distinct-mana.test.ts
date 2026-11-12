// The AI and "{T}: Add two mana of different colors" (D-319, CR 106.1b): both agents pay with `payAuto`, so the payment planner of the engine decides what
// the source makes. A {W}{U} spell is paid by the one artifact; a {G}{G} spell is not castable with it alone, so no agent is ever offered it. The card is
// SYNTHETIC (engine fixtures `synthetic-niv-primitives.ts`).
import { applyAction, getLegalActions } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { HeuristicAgent } from '../src/index';
import { answer } from './casual-helpers';
import { askHeuristic } from './heuristic-helpers';

const VESSEL = 'SYNTHETIC Prism Vessel';
const SIP = 'SYNTHETIC Azorius Sip'; // {W}{U}
const PAIR = 'SYNTHETIC Green Pair'; // {G}{G}
const LIBRARY = Array.from({ length: 8 }, () => 'Plains');

const build = (spell: string) =>
  scenario()
    .seat(0)
    .library(...LIBRARY)
    .hand(spell)
    .battlefield(VESSEL)
    .seat(1)
    .library(...LIBRARY)
    .at('precombatMain')
    .build();

describe('paying a {W}{U} spell with the artifact', () => {
  test('the casual agent answers the payment with payAuto, which the engine accepts and taps the artifact', async () => {
    const g = build(SIP);
    g.act(0).cast(SIP);
    g.expect.pending('payMana', 0);
    const a = await answer(g);
    expect(a).toEqual({ kind: 'payAuto' });
    expect(applyAction(g.state, 0, a).ok).toBe(true);
    g.choose(0, a);
    g.expect.tapped(VESSEL);
    g.expect.zone(SIP, 'stack');
  });

  test('the heuristic agent does the same', async () => {
    const g = build(SIP);
    g.act(0).cast(SIP);
    g.expect.pending('payMana', 0);
    const a = await askHeuristic(g, new HeuristicAgent({ seed: 1 }));
    expect(a).toEqual({ kind: 'payAuto' });
    g.choose(0, a);
    g.expect.tapped(VESSEL);
  });
});

describe('a {G}{G} spell with only the artifact', () => {
  test('it is not among the legal actions, so no agent can choose it', () => {
    const g = build(PAIR);
    const casts = getLegalActions(g.state, 0).filter((a) => a.kind === 'castSpell');
    expect(casts).toEqual([]);
    // The control: the {W}{U} spell is castable with the same artifact.
    const control = build(SIP);
    expect(getLegalActions(control.state, 0).some((a) => a.kind === 'castSpell')).toBe(true);
  });
});
