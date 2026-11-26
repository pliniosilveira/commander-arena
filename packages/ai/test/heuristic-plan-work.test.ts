// The work of a planning (issue 653): the counter counts the views and engine actions of the turn planner,
// and keeps them for the planning, so a step taken again on the same state costs no engine call and gives the
// same result, up to a bound of what it keeps.
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { Work } from '../src/heuristic-budget';
import { KEEP, PlanCounter } from '../src/heuristic-plan-work';

const position = () =>
  scenario()
    .seat(0)
    .hand('Mountain')
    .battlefield('Forest')
    .library('Island', { count: 5 })
    .seat(1)
    .library('Island', { count: 5 })
    .at('precombatMain', { active: 0 })
    .build();

describe('PlanCounter', () => {
  test('the same action on the same state is applied once and gives the same result', () => {
    const g = position();
    const work = new PlanCounter(new Work());
    const first = work.apply(g.state, 0, { kind: 'pass' });
    const again = work.apply(g.state, 0, { kind: 'pass' });
    expect(again).toBe(first);
    expect(work.applies).toBe(1);
    // Another action, or the same one on another state, is applied anew.
    work.apply(g.state, 0, { kind: 'playLand', object: g.id('Mountain') });
    expect(work.applies).toBe(2);
    if (!first.ok) throw new Error('pass refused');
    work.apply(first.state, 1, { kind: 'pass' });
    expect(work.applies).toBe(3);
  });

  test("what it builds is counted in the decision's work; what it kept costs nothing", () => {
    const g = position();
    const engine = new Work();
    const work = new PlanCounter(engine);
    work.apply(g.state, 0, { kind: 'pass' });
    work.view(g.state, 0);
    expect(engine.calls).toBe(2);
    const units = engine.units;
    work.apply(g.state, 0, { kind: 'pass' });
    work.view(g.state, 0);
    expect(engine.calls).toBe(2);
    expect(engine.units).toBe(units);
  });

  test('a state is viewed once for each seat', () => {
    const g = position();
    const work = new PlanCounter(new Work());
    const view = work.view(g.state, 0);
    expect(work.view(g.state, 0)).toBe(view);
    expect(work.views).toBe(1);
    expect(work.view(g.state, 1).viewer).toBe(1);
    expect(work.views).toBe(2);
  });

  test('past KEEP results and views a planning keeps nothing more, and still finds what it kept', () => {
    const g = position();
    const work = new PlanCounter(new Work());
    const kept = work.apply(g.state, 0, { kind: 'pass' });
    const keptView = work.view(g.state, 0);
    // As if the planning had built KEEP of each already.
    work.applies = KEEP;
    work.views = KEEP;
    const land = { kind: 'playLand', object: g.id('Mountain') } as const;
    const first = work.apply(g.state, 0, land);
    expect(work.apply(g.state, 0, land)).not.toBe(first);
    expect(work.applies).toBe(KEEP + 2);
    work.view(g.state, 1);
    work.view(g.state, 1);
    expect(work.views).toBe(KEEP + 2);
    expect(work.apply(g.state, 0, { kind: 'pass' })).toBe(kept);
    expect(work.view(g.state, 0)).toBe(keptView);
    expect(work.applies).toBe(KEEP + 2);
    expect(work.views).toBe(KEEP + 2);
  });

  test('a refused action is kept too, and the record says what was built', () => {
    const g = position();
    const work = new PlanCounter(new Work());
    const refused = work.apply(g.state, 1, { kind: 'pass' });
    expect(refused.ok).toBe(false);
    expect(work.apply(g.state, 1, { kind: 'pass' })).toBe(refused);
    work.steps = 2;
    work.playOuts = 1;
    work.stop('work');
    work.stop('clock');
    work.stop('work');
    expect(work.done(false, 3)).toEqual({
      planned: false,
      playOuts: 1,
      steps: 2,
      views: 0,
      applies: 1,
      cut: 'clock',
      ms: 3,
    });
  });
});
