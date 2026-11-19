// The fallback of a refused answer: every legal action is tried, in the order of `preferredActions`
// (real plays, then `cancel`, then `concede`), until the engine accepts one. A fallback that tried only
// the first left a game stuck when that one was refused too (a payment the engine listed and then could
// not take: `payAuto` and a game stopped at turn 25).
import type { Action } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { expect, test } from 'vitest';
import { firstAcceptedAction } from '../src/legal';

function targetsDecision() {
  const g = scenario()
    .seat(0)
    .hand('Murder')
    .battlefield('Swamp', 'Swamp', 'Swamp')
    .library('Swamp', { count: 4 })
    .seat(1)
    .battlefield('Grizzly Bears')
    .library('Swamp', { count: 4 })
    .at('precombatMain', { active: 0 })
    .build();
  g.act(0).cast('Murder');
  const pending = g.state.pending;
  if (pending === null) throw new Error('nothing pending');
  return pending;
}

test('the first action that is accepted is taken, after the refused ones', () => {
  const decision = targetsDecision();
  const tried: Action[] = [];
  const result = firstAcceptedAction(decision, (a) => {
    tried.push(a);
    return a.kind === 'cancel' ? 'accepted' : null;
  });
  expect(result?.action.kind).toBe('cancel');
  expect(result?.value).toBe('accepted');
  // Real plays came first, then the cancel; nothing after the accepted one was tried.
  expect(tried[tried.length - 1]?.kind).toBe('cancel');
});

test('null when every legal action is refused', () => {
  expect(firstAcceptedAction(targetsDecision(), () => null)).toBeNull();
});
