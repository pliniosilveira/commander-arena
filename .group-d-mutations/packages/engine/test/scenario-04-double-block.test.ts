// Scenario 4 (SPEC 12): double block. A 3/3 attacker blocked by two 2/2s may put all 3 damage on one
// blocker.
// Pins: CR 510.1c (Combat Damage Step): a blocked creature blocked by two or more creatures assigns
// its combat damage to them "divided as its controller chooses among them". Since the Foundations
// update there is no damage assignment order and no "lethal damage to the first blocker before the
// next" requirement; lethal damage matters only for trample (CR 702.19b), which is scenario 5.
// CR 510.1d: a blocking creature that blocks exactly one creature assigns all its damage to it.
// CR 510.1e: the total assignment is checked; an illegal one is refused and the game returns to the
// moment before it was made (CR 733), which here means the decision stays pending, nothing changed.
// CR 510.2: all combat damage is dealt simultaneously.
import { describe, expect, test } from 'vitest';
import {
  type Action,
  applyAction,
  type GameState,
  getLegalActions,
  legalActionsForDecision,
  stateHash,
} from '../src/index';
import { scenario } from '../src/testing/index';

const ATTACKER = 'SYNTHETIC Vanilla 3/3';
const TWO = 'SYNTHETIC Vanilla 2/2';

/** Seat 0's 3/3 attacks; seat 1 blocks with both 2/2s; the engine waits for seat 0's division. */
function doubleBlocked(extra?: (b: ReturnType<typeof scenario>) => void) {
  const b = scenario()
    .seat(0)
    .battlefield(ATTACKER)
    .library('Island', { count: 3 })
    .seat(1)
    .battlefield(TWO, { count: 2 });
  extra?.(b);
  const g = b.library('Island', { count: 3 }).at('precombatMain', { active: 0 }).build();
  g.advanceTo('declareAttackers');
  g.act(0).attack(ATTACKER);
  g.advanceTo('declareBlockers');
  g.act(1).declareBlockers([
    { blocker: `${TWO}[0]`, attacker: ATTACKER },
    { blocker: `${TWO}[1]`, attacker: ATTACKER },
  ]);
  g.passAll();
  return g;
}

describe('CR 510.1c: a double-blocked attacker divides its damage as its controller chooses', () => {
  test('there is no damage assignment order: after the blocks, priority, then one division', () => {
    const g = scenario()
      .seat(0)
      .battlefield(ATTACKER)
      .seat(1)
      .battlefield(TWO, { count: 2 })
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack(ATTACKER);
    g.advanceTo('declareBlockers');
    g.act(1).declareBlockers([
      { blocker: `${TWO}[0]`, attacker: ATTACKER },
      { blocker: `${TWO}[1]`, attacker: ATTACKER },
    ]);
    // CR 509.2: the active player gets priority in the declare blockers step; no ordering decision.
    g.expect.step('declareBlockers');
    g.expect.pending('priority', 0);
    g.passAll();
    g.expect.step('combatDamage');
    g.expect.pending('assignDamage', 0);
  });

  test('all 3 damage on one blocker is legal; that blocker dies, the other is untouched', () => {
    const g = doubleBlocked();
    g.act(0).assignDamage([{ from: ATTACKER, to: `${TWO}[0]`, amount: 3 }]);
    g.expect.zone(TWO, 'graveyard', { seat: 1, count: 1 });
    g.expect.damage({ name: TWO, zone: 'battlefield' }, 0);
    // Both blockers dealt their 2 damage to the attacker at the same time: 4 damage, it dies too.
    g.expect.zone(ATTACKER, 'graveyard', { seat: 0 });
  });

  test('all 3 damage on the second blocker is just as legal', () => {
    const g = doubleBlocked();
    g.act(0).assignDamage([{ from: ATTACKER, to: `${TWO}[1]`, amount: 3 }]);
    g.expect.zone(TWO, 'graveyard', { count: 1 });
    g.expect.damage({ name: TWO, zone: 'battlefield' }, 0);
  });

  test.each([
    [3, 0, 1],
    [2, 1, 1],
    [1, 2, 1],
    [0, 3, 1],
  ])('the division %i and %i is accepted and kills %i blocker', (first, second, deaths) => {
    const g = doubleBlocked();
    g.act(0).assignDamage([
      { from: ATTACKER, to: `${TWO}[0]`, amount: first },
      { from: ATTACKER, to: `${TWO}[1]`, amount: second },
    ]);
    g.expect.zone(TWO, 'graveyard', { count: deaths });
    // Damage marked on the survivor is what it was dealt.
    const survivor = g.find({ name: TWO, zone: 'battlefield' })[0];
    expect(survivor?.damage).toBe(first >= 2 ? second : first);
  });

  test('a division that kills neither blocker is also legal (1 and 2 is not forced to be lethal first)', () => {
    // CR 510.1c has no lethal-first requirement without trample.
    const g = doubleBlocked();
    g.act(0).assignDamage([
      { from: ATTACKER, to: `${TWO}[0]`, amount: 1 },
      { from: ATTACKER, to: `${TWO}[1]`, amount: 2 },
    ]);
    g.expect.zone(TWO, 'graveyard', { count: 1 });
  });

  test('no lethal damage is needed for a blocker first: all damage on a big blocker, none on the small one', () => {
    const g = scenario()
      .seat(0)
      .battlefield(ATTACKER)
      .seat(1)
      .battlefield('SYNTHETIC Vanilla 1/1')
      .battlefield('SYNTHETIC Vanilla 5/5')
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack(ATTACKER);
    g.advanceTo('declareBlockers');
    g.act(1).declareBlockers([
      { blocker: 'SYNTHETIC Vanilla 1/1', attacker: ATTACKER },
      { blocker: 'SYNTHETIC Vanilla 5/5', attacker: ATTACKER },
    ]);
    g.passAll();
    // The old rules would force lethal damage (1) onto the 1/1 first; the current rules do not.
    g.act(0).assignDamage([{ from: ATTACKER, to: 'SYNTHETIC Vanilla 5/5', amount: 3 }]);
    g.expect.damage('SYNTHETIC Vanilla 5/5', 3);
    g.expect.zone('SYNTHETIC Vanilla 1/1', 'battlefield', { seat: 1 });
    g.expect.damage('SYNTHETIC Vanilla 1/1', 0);
  });

  test('damage already marked is irrelevant too: all damage on a blocker that is already lethally damaged', () => {
    const g = doubleBlocked((b) => b.battlefield(TWO));
    // (An extra, non-blocking 2/2 exists only to check the decision ignores non-blockers.)
    const d = g.state.pending;
    expect(d?.kind).toBe('assignDamage');
    if (d?.kind !== 'assignDamage') return;
    expect(d.choices).toHaveLength(1);
    expect(d.choices[0]?.blockers).toHaveLength(2);
  });

  test('the decision describes the choice: power 3, no trample, two blockers with lethal 2 each', () => {
    const g = doubleBlocked();
    const d = g.state.pending;
    if (d?.kind !== 'assignDamage') throw new Error('expected assignDamage');
    expect(d.step).toBe('regular');
    expect(d.choices).toHaveLength(1);
    const choice = d.choices[0];
    expect(choice?.power).toBe(3);
    expect(choice?.trample).toBe(false);
    expect(choice?.deathtouch).toBe(false);
    expect(choice?.tramplesOver).toBeNull();
    expect(choice?.blockers.map((b) => b.lethal)).toEqual([2, 2]);
  });
});

describe('CR 510.1e: an illegal division is refused, the decision stays, nothing changes', () => {
  function refused(
    g: ReturnType<typeof doubleBlocked>,
    assignments: Parameters<typeof g.act>[0] extends never
      ? never
      : Parameters<ReturnType<typeof g.act>['assignDamage']>[0],
    message: RegExp,
  ) {
    const before = g.hash();
    const r = g.act(0).try.assignDamage(assignments);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(message);
    g.expect.hash(before);
    g.expect.pending('assignDamage', 0);
  }

  test('too little damage assigned', () => {
    const g = doubleBlocked();
    refused(g, [{ from: ATTACKER, to: `${TWO}[0]`, amount: 2 }], /Assign exactly 3 damage/);
    refused(g, [], /Assign exactly 3 damage/);
  });

  test('too much damage assigned', () => {
    const g = doubleBlocked();
    refused(
      g,
      [
        { from: ATTACKER, to: `${TWO}[0]`, amount: 2 },
        { from: ATTACKER, to: `${TWO}[1]`, amount: 2 },
      ],
      /Assign exactly 3 damage/,
    );
  });

  test('damage to the defending player (no trample)', () => {
    const g = doubleBlocked();
    refused(
      g,
      [
        { from: ATTACKER, to: `${TWO}[0]`, amount: 2 },
        { from: ATTACKER, to: { player: 1 }, amount: 1 },
      ],
      /Damage can only go to the blockers/,
    );
  });

  test('damage to a creature that is not blocking it', () => {
    const g = doubleBlocked((b) => b.battlefield('Grizzly Bears'));
    refused(
      g,
      [
        { from: ATTACKER, to: `${TWO}[0]`, amount: 2 },
        { from: ATTACKER, to: 'Grizzly Bears', amount: 1 },
      ],
      /Damage can only go to the blockers/,
    );
  });

  test('damage to the attacker itself or to a creature of its own side', () => {
    const g = doubleBlocked((b) => b.seat(0).battlefield('Grizzly Bears'));
    refused(
      g,
      [
        { from: ATTACKER, to: ATTACKER, amount: 1 },
        { from: ATTACKER, to: `${TWO}[0]`, amount: 2 },
      ],
      /Damage can only go to the blockers/,
    );
    refused(
      g,
      [{ from: ATTACKER, to: { name: 'Grizzly Bears', seat: 0 }, amount: 3 }],
      /Damage can only go to the blockers/,
    );
  });

  test('a negative amount cannot make up the total', () => {
    const g = doubleBlocked();
    const attacker = g.id(ATTACKER);
    const blocker = g.id(`${TWO}[0]`);
    const before = g.hash();
    const r = g.act(0).try.action({
      kind: 'assignDamage',
      assignments: [
        { source: attacker, to: { kind: 'object', id: blocker }, amount: 4 },
        { source: attacker, to: { kind: 'object', id: blocker }, amount: -1 },
      ],
    });
    expect(r.ok).toBe(false);
    g.expect.hash(before);
  });

  test('a creature with no choice to make cannot be given an assignment', () => {
    const g = doubleBlocked();
    const blocker = g.id(`${TWO}[0]`);
    const attacker = g.id(ATTACKER);
    const before = g.hash();
    const r = g.act(0).try.action({
      kind: 'assignDamage',
      assignments: [
        { source: attacker, to: { kind: 'object', id: blocker }, amount: 3 },
        { source: blocker, to: { kind: 'object', id: attacker }, amount: 2 },
      ],
    });
    expect(r).toEqual({ ok: false, error: 'That creature has no choice to make' });
    g.expect.hash(before);
  });

  test('the wrong seat cannot answer, and another kind of action is refused', () => {
    const g = doubleBlocked();
    const before = g.hash();
    expect(g.act(1).try.assignDamage([])).toEqual({ ok: false, error: 'It is not your decision' });
    expect(g.act(0).try.pass()).toEqual({ ok: false, error: 'Assign combat damage' });
    g.expect.hash(before);
  });
});

describe('legal actions for the division agree with applyAction', () => {
  test('everything listed is accepted, and the list holds the engine default (CR 510.1c)', () => {
    const g = doubleBlocked();
    const listed: Action[] = getLegalActions(g.state, 0);
    expect(listed.length).toBeGreaterThan(0);
    for (const a of listed) {
      if (a.kind === 'concede') continue;
      expect(applyAction(g.state, 0, a).ok, JSON.stringify(a)).toBe(true);
    }
    const d = g.state.pending;
    if (d === null) throw new Error('no decision');
    expect(legalActionsForDecision(d)).toEqual(listed);
    expect(getLegalActions(g.state, 1)).toEqual([]);
  });

  test('damage is dealt at once: both blockers and the attacker are damaged by the same action', () => {
    const g = doubleBlocked();
    const before: GameState = g.state;
    const r = applyAction(before, 0, {
      kind: 'assignDamage',
      assignments: [
        { source: g.id(ATTACKER), to: { kind: 'object', id: g.id(`${TWO}[0]`) }, amount: 3 },
      ],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const events = r.events.filter((e) => e.kind === 'damageDealt');
    expect(events.map((e) => (e.kind === 'damageDealt' ? e.amount : 0)).sort()).toEqual([2, 2, 3]);
    // The input state was not modified (applyAction is pure).
    expect(stateHash(before)).toBe(stateHash(g.state));
  });
});
