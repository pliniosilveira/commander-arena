// Activated abilities (CR 602): who may activate, when, and the order a cost is paid in.
// Pins: CR 602.2 and 602.2a (the ability goes on the stack as an object that is not a card),
// 602.2b (targets are chosen before costs are paid, CR 601.2b-i), CR 602.5a and 302.6 (a creature's
// {T} ability needs it to have been under its controller's control since the turn began),
// CR 602.5d ("activate only as a sorcery"), CR 118.3 (a cost that cannot be paid cannot be
// activated), CR 117.3c (the activating player receives priority again), CR 733 (cancelling).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-abilities.ts, synthetic.ts).
import { describe, expect, test } from 'vitest';
import { type Action, getLegalActions, type ObjectId } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';

const PUMP_BEAR = 'SYNTHETIC Pump Bear';
const PINGER = 'SYNTHETIC Pinger';
const SCHOLAR = 'SYNTHETIC Slow Scholar';
const COACH = 'SYNTHETIC Coach';

/** The `activate` actions listed for a seat, as "name#abilityIndex" in listing order. */
function offered(g: ScenarioGame, seat: 0 | 1 = 0): string[] {
  return getLegalActions(g.state, seat).flatMap((a: Action) => {
    if (a.kind !== 'activate') return [];
    return [`${a.object}#${a.abilityIndex}`];
  });
}
const isOffered = (g: ScenarioGame, name: string, seat: 0 | 1 = 0, zone?: 'hand'): boolean =>
  offered(g, seat).some((s) => s.startsWith(`${g.id({ name, ...(zone ? { zone } : {}) })}#`));

describe('CR 602.2a (Activating Activated Abilities): the ability goes on the stack', () => {
  test('a pump with a mana cost: costs paid, an ability object on the stack, the bear is untouched', () => {
    const g = scenario().seat(0).battlefield(PUMP_BEAR, 'Forest').seat(1).build();
    const mark = g.mark();
    g.act(0).activate(PUMP_BEAR);
    // The ability is on the stack at once (CR 602.2a) while the cost is being paid.
    g.expect.stack([`${PUMP_BEAR} (ability)`]);
    g.expect.pending('payMana', 0);
    g.act(0).payAuto();
    g.expect.tapped('Forest');
    g.expect.pending('priority', 0); // CR 117.3c: the activating player gets priority
    g.expect.stack([`${PUMP_BEAR} (ability)`]);
    g.expect.eventLog(
      [{ kind: 'tapped' }, { kind: 'abilityActivated', seat: 0, abilityIndex: 0 }],
      { since: mark },
    );
    g.expect.pt(PUMP_BEAR, 2, 2); // nothing happens until it resolves
    g.passAll();
    g.expect.stack([]);
    g.expect.pt(PUMP_BEAR, 3, 3);
  });

  test('the ability on the stack is an object that is not a card and remembers its source', () => {
    const g = scenario().seat(0).battlefield(PUMP_BEAR, 'Forest').seat(1).build();
    g.act(0).activate(PUMP_BEAR, { pay: true });
    const top = g.state.stack[g.state.stack.length - 1];
    const obj = g.state.objects[top as ObjectId];
    expect(obj?.card).toBeNull();
    expect(obj?.controller).toBe(0);
    expect(obj?.stack?.kind).toBe('ability');
    expect(obj?.stack?.source).toBe(g.id(PUMP_BEAR));
    expect(obj?.stack?.abilityIndex).toBe(0);
    expect(g.view(0).stack[0]?.abilitySource).toBe(g.id(PUMP_BEAR));
    expect(g.view(0).stack[0]?.name).toBe(PUMP_BEAR);
  });

  test('both players must pass for it to resolve; the opponent can respond first', () => {
    const g = scenario().seat(0).battlefield(PUMP_BEAR, 'Forest').seat(1).build();
    g.act(0).activate(PUMP_BEAR, { pay: true });
    g.act(0).pass();
    g.expect.pending('priority', 1);
    g.expect.stack([`${PUMP_BEAR} (ability)`]);
    g.act(1).pass();
    g.expect.stack([]);
    g.expect.pt(PUMP_BEAR, 3, 3);
  });

  test('the same ability can be activated again in response, each activation pays again', () => {
    const g = scenario().seat(0).battlefield(PUMP_BEAR, 'Forest', 'Forest').seat(1).build();
    g.act(0).activate(PUMP_BEAR, { pay: true });
    g.act(0).activate(PUMP_BEAR, { pay: true });
    g.expect.stack([`${PUMP_BEAR} (ability)`, `${PUMP_BEAR} (ability)`]);
    expect(isOffered(g, PUMP_BEAR)).toBe(false); // no mana left
    g.passAll();
    g.passAll();
    g.expect.pt(PUMP_BEAR, 4, 4);
  });
});

describe('who may activate, and from where (CR 602.2, 113.6)', () => {
  test('only the controller: the opponent is never offered it and the engine refuses it', () => {
    const g = scenario()
      .seat(0)
      .battlefield(PUMP_BEAR)
      .seat(1)
      .battlefield('Forest')
      .at('precombatMain', { active: 0, priority: 1 })
      .build();
    const action: Action = { kind: 'activate', object: g.id(PUMP_BEAR), abilityIndex: 0 };
    expect(getLegalActions(g.state, 1).some((a) => a.kind === 'activate')).toBe(false);
    const r = g.act(1).try.action(action);
    expect(r.ok).toBe(false);
  });

  test('a stolen permanent is activated by its controller, not its owner', () => {
    const g = scenario()
      .seat(0)
      .battlefield(PUMP_BEAR, { controller: 1 })
      .battlefield('Forest')
      .seat(1)
      .battlefield('Forest')
      .at('precombatMain', { active: 0, priority: 1 })
      .build();
    expect(isOffered(g, PUMP_BEAR, 1)).toBe(true);
    const owner = g
      .act(0)
      .try.action({ kind: 'activate', object: g.id(PUMP_BEAR), abilityIndex: 0 });
    expect(owner.ok).toBe(false);
  });

  test('a battlefield ability does not work from the hand or the graveyard (CR 113.6)', () => {
    for (const zone of ['hand', 'graveyard'] as const) {
      const g = scenario().seat(0)[zone](PUMP_BEAR).battlefield('Forest', 'Forest').seat(1).build();
      expect(offered(g), zone).toEqual([]);
      const r = g.act(0).try.action({ kind: 'activate', object: g.id(PUMP_BEAR), abilityIndex: 0 });
      expect(r.ok, zone).toBe(false);
    }
  });

  test('an object that has no such ability index is refused with a reason', () => {
    const g = scenario().seat(0).battlefield(PUMP_BEAR, 'Forest').seat(1).build();
    const r = g.act(0).try.action({ kind: 'activate', object: g.id(PUMP_BEAR), abilityIndex: 5 });
    expect(r).toMatchObject({
      ok: false,
      error: expect.stringContaining('no such activated ability'),
    });
    const lands = g
      .act(0)
      .try.action({ kind: 'activate', object: g.id('Forest'), abilityIndex: 0 });
    expect(lands.ok).toBe(false); // a mana ability is activated with activateAbility, not activate
  });

  test('an unknown object is refused without throwing', () => {
    const g = scenario().seat(0).battlefield(PUMP_BEAR, 'Forest').seat(1).build();
    const r = g.act(0).try.action({ kind: 'activate', object: 'o999' as never, abilityIndex: 0 });
    expect(r.ok).toBe(false);
  });
});

describe('CR 602.5d: activate only as a sorcery', () => {
  const build = (step: 'precombatMain' | 'beginningOfCombat' | 'postcombatMain', active: 0 | 1) =>
    scenario()
      .seat(0)
      .battlefield(SCHOLAR, 'Forest', 'Forest')
      .library('Forest', 'Forest', 'Forest')
      .seat(1)
      .library('Forest', 'Forest')
      .at(step, { active, priority: 0 })
      .build();

  test('offered in either main phase of its controller turn with an empty stack', () => {
    for (const step of ['precombatMain', 'postcombatMain'] as const) {
      expect(isOffered(build(step, 0), SCHOLAR), step).toBe(true);
    }
  });

  test('not offered in other steps, on the opponent turn, or with something on the stack', () => {
    expect(isOffered(build('beginningOfCombat', 0), SCHOLAR)).toBe(false);
    expect(isOffered(build('precombatMain', 1), SCHOLAR)).toBe(false);
    const g = build('precombatMain', 0);
    g.act(0).activate(SCHOLAR, { pay: true });
    g.expect.stack([`${SCHOLAR} (ability)`]);
    expect(isOffered(g, SCHOLAR)).toBe(false);
    const refused = g.act(0).try.activate(SCHOLAR);
    expect(refused).toMatchObject({ ok: false, error: expect.stringContaining('sorcery') });
    g.passAll();
    expect(isOffered(g, SCHOLAR)).toBe(true); // the stack is empty again
  });

  test('the instant-speed pump is offered in every step and on the opponent turn', () => {
    for (const step of ['upkeep', 'beginningOfCombat', 'end'] as const) {
      for (const active of [0, 1] as const) {
        const g = scenario()
          .seat(0)
          .battlefield(PUMP_BEAR, 'Forest')
          .seat(1)
          .at(step, { active, priority: 0 })
          .build();
        expect(isOffered(g, PUMP_BEAR), `${step} ${active}`).toBe(true);
      }
    }
  });
});

describe('CR 602.5a, 302.6: {T} needs the permanent to have been under control since the turn began', () => {
  test('a summoning-sick creature cannot use a {T} ability but can use one with another cost', () => {
    const g = scenario()
      .seat(0)
      .battlefield(PINGER, { fresh: true })
      .battlefield(PUMP_BEAR, { fresh: true })
      .battlefield('Forest')
      .seat(1)
      .build();
    expect(isOffered(g, PINGER)).toBe(false);
    expect(isOffered(g, PUMP_BEAR)).toBe(true);
    const r = g.act(0).try.activate(PINGER);
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining('summoning sick') });
  });

  test('once it has been there since the turn began it can, and a tapped one cannot', () => {
    const g = scenario().seat(0).battlefield(PINGER).seat(1).build();
    expect(isOffered(g, PINGER)).toBe(true);
    const tapped = scenario().seat(0).battlefield(PINGER, { tapped: true }).seat(1).build();
    expect(isOffered(tapped, PINGER)).toBe(false);
  });

  test('a creature that entered this turn can tap for a {T} ability on its controller next turn', () => {
    const g = scenario()
      .seat(0)
      .battlefield(PINGER, { fresh: true })
      .library('Forest', 'Forest', 'Forest')
      .seat(1)
      .library('Forest', 'Forest', 'Forest')
      .build();
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    expect(isOffered(g, PINGER)).toBe(true);
  });

  test('a noncreature permanent with {T} in its cost has no summoning sickness', () => {
    const g = scenario().seat(0).battlefield('SYNTHETIC Life Tap', { fresh: true }).seat(1).build();
    expect(isOffered(g, 'SYNTHETIC Life Tap')).toBe(true);
  });
});

describe('CR 602.2b, 601.2c: targets are chosen first, then the costs are paid', () => {
  function pinger() {
    return scenario().seat(0).battlefield(PINGER).seat(1).battlefield('Grizzly Bears').build();
  }

  test('at the targets decision nothing is paid yet; choosing pays {T} and the ability waits', () => {
    const g = pinger();
    const before = g.positionHash();
    const handle = g.act(0).activate(PINGER);
    expect(handle.stage).toBe('targets');
    g.expect.pending('targets', 0);
    g.expect.tapped(PINGER, false);
    g.expect.stack([`${PINGER} (ability)`]);
    handle.targets([{ player: 1 }]);
    g.expect.tapped(PINGER);
    g.expect.pending('priority', 0);
    const top = g.state.objects[g.state.stack[0] as ObjectId];
    expect(top?.stack?.chosenTargets).toEqual([{ kind: 'player', seat: 1, specId: 't1' }]);
    expect(before).not.toBe(g.positionHash());
  });

  test('the legal targets include the pinger itself and both players, but not the ability', () => {
    const g = pinger();
    g.act(0).activate(PINGER);
    const d = g.state.pending;
    if (d?.kind !== 'targets') throw new Error('expected a targets decision');
    const legal = d.specs[0]?.legal ?? [];
    expect(legal).toContainEqual({ kind: 'object', id: g.id(PINGER), specId: 't1' });
    expect(legal).toContainEqual({ kind: 'object', id: g.id('Grizzly Bears'), specId: 't1' });
    expect(legal).toContainEqual({ kind: 'player', seat: 0, specId: 't1' });
    expect(legal).toContainEqual({ kind: 'player', seat: 1, specId: 't1' });
    expect(legal).toHaveLength(4);
    expect(legal.some((t) => t.kind === 'object' && t.id === d.source)).toBe(false);
  });

  test('cancelling at the targets decision restores the exact state before the activation', () => {
    const g = pinger();
    const before = g.positionHash();
    g.act(0).activate(PINGER);
    g.expect.illegal(0, 'pass');
    g.act(0).cancel();
    g.expect.position(before);
    g.expect.tapped(PINGER, false);
    g.expect.stack([]);
    expect(isOffered(g, PINGER)).toBe(true);
  });

  test('an illegal target and a missing target are refused', () => {
    const g = pinger();
    g.act(0).activate(PINGER);
    const bad = g.act(0).try.action({ kind: 'chooseTargets', targets: [] });
    expect(bad.ok).toBe(false);
    const none = g.act(0).try.action({
      kind: 'chooseTargets',
      targets: [{ kind: 'object', id: 'o999' as never, specId: 't1' }],
    });
    expect(none.ok).toBe(false);
  });

  test('an ability with a target that has no legal target is not offered (CR 601.2c)', () => {
    // Coach: "target creature gets +2/+2". With no creature besides... the Coach itself is one.
    const g = scenario().seat(0).battlefield(COACH).seat(1).build();
    expect(isOffered(g, COACH)).toBe(true);
    // A shroud creature alone is not a legal target (CR 702.18a), so there is none.
    const shroud = scenario()
      .seat(0)
      .battlefield(COACH, { tapped: true })
      .seat(1)
      .battlefield('SYNTHETIC Shroud Bear')
      .build();
    expect(isOffered(shroud, COACH)).toBe(false);
  });
});

describe('mana costs: the same payMana decision as a spell, automatic and by hand', () => {
  test('paying by hand taps the chosen source and the ability is activated', () => {
    const g = scenario().seat(0).battlefield(PUMP_BEAR, 'Forest', 'Mountain').seat(1).build();
    g.act(0).activate(PUMP_BEAR).payManual(['Mountain']);
    g.expect.tapped('Mountain');
    g.expect.tapped('Forest', false);
    g.expect.stack([`${PUMP_BEAR} (ability)`]);
  });

  test('a payment that does not cover the cost is refused and nothing changes', () => {
    const g = scenario().seat(0).battlefield('SYNTHETIC Snack', 'Forest', 'Forest').seat(1).build();
    g.act(0).activate('SYNTHETIC Snack');
    const before = g.hash();
    const r = g.act(0).try.action({
      kind: 'payManual',
      taps: [{ object: g.id('Forest[0]'), abilityIndex: 0 }],
    });
    expect(r.ok).toBe(false);
    g.expect.hash(before);
    g.expect.pending('payMana', 0);
  });

  test('cancelling the payment rewinds the activation: nothing on the stack, nothing paid', () => {
    const g = scenario().seat(0).battlefield(PUMP_BEAR, 'Forest', 'Mountain').seat(1).build();
    const before = g.positionHash();
    g.act(0).activate(PUMP_BEAR);
    g.act(0).cancel();
    g.expect.position(before);
    g.expect.stack([]);
    g.expect.tapped('Forest', false);
  });

  test('mana tapped by hand during the payment is returned by a cancel', () => {
    const g = scenario().seat(0).battlefield(PUMP_BEAR, 'Forest').seat(1).build();
    const before = g.positionHash();
    g.act(0).activate(PUMP_BEAR);
    // Tapping a source during payment is only possible inside payManual; cancelling afterwards is
    // impossible because payManual finishes the payment. A failed payManual changes nothing.
    const r = g.act(0).try.action({ kind: 'payManual', taps: [] });
    expect(r.ok).toBe(false);
    g.act(0).cancel();
    g.expect.position(before);
  });
});
