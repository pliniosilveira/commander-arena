// getLegalActions and legalActionsForDecision for the three combat decisions agree with applyAction:
// every action listed is accepted (and leaves a consistent state), the other seat has none, and the
// lists hold what the decision says they hold. Pins: CR 508.1, 509.1, 510.1 (what may be declared or
// assigned) and SPEC 4.2 (the AI and the UI list legal answers from the decision).
import { describe, expect, test } from 'vitest';
import {
  type Action,
  applyAction,
  checkInvariants,
  type GameState,
  getLegalActions,
  legalActionsForDecision,
} from '../src/index';
import { scenario } from '../src/testing/index';

type G = ReturnType<ReturnType<typeof scenario>['build']>;

/** Every listed action is accepted and yields a consistent state; the engine and decision lists agree. */
function expectAllListedAccepted(g: G): Action[] {
  const state: GameState = g.state;
  const d = state.pending;
  if (d === null) throw new Error('no decision');
  const listed = getLegalActions(state, d.seat);
  expect(listed.length).toBeGreaterThan(0);
  expect(legalActionsForDecision(d)).toEqual(listed);
  expect(getLegalActions(state, (d.seat + 1) % 2)).toEqual([]);
  // No action is listed twice.
  expect(new Set(listed.map((a) => JSON.stringify(a))).size).toBe(listed.length);
  for (const a of listed) {
    if (a.kind === 'concede') continue;
    const r = applyAction(state, d.seat, a);
    expect(r.ok, JSON.stringify(a)).toBe(true);
    if (r.ok) expect(checkInvariants(r.state), JSON.stringify(a)).toEqual([]);
  }
  return listed;
}

describe('declareAttackers', () => {
  function game() {
    const g = scenario()
      .seat(0)
      .battlefield('Grizzly Bears', 'Serra Angel', 'Wall of Stone')
      .battlefield('Raging Goblin', { fresh: true })
      .battlefield('Youthful Knight', { fresh: true })
      .seat(1)
      .battlefield('SYNTHETIC Vanilla Planeswalker')
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    return g;
  }

  test('everything listed is accepted', () => {
    expectAllListedAccepted(game());
  });

  test('the list holds no attack, each candidate alone at each target, and everyone at each shared target', () => {
    const g = game();
    const listed = getLegalActions(g.state, 0).filter(
      (a): a is Extract<Action, { kind: 'declareAttackers' }> => a.kind === 'declareAttackers',
    );
    const pw = g.id('SYNTHETIC Vanilla Planeswalker');
    expect(listed.some((a) => a.attacks.length === 0)).toBe(true);
    // Candidates: Bears, Angel and Raging Goblin (haste); the Wall and the sick Knight are not.
    const alone = listed.filter((a) => a.attacks.length === 1);
    expect(alone).toHaveLength(3 * 2);
    const everyone = listed.filter((a) => a.attacks.length === 3);
    expect(everyone).toHaveLength(2);
    expect(everyone.map((a) => JSON.stringify(a.attacks[0]?.target)).sort()).toEqual(
      [
        JSON.stringify({ kind: 'player', seat: 1 }),
        JSON.stringify({ kind: 'permanent', object: pw }),
      ].sort(),
    );
    const attackers = new Set(alone.map((a) => a.attacks[0]?.attacker));
    expect(attackers).toEqual(
      new Set([g.id('Grizzly Bears'), g.id('Serra Angel'), g.id('Raging Goblin')]),
    );
    expect(attackers.has(g.id('Wall of Stone'))).toBe(false);
    expect(attackers.has(g.id('Youthful Knight'))).toBe(false);
  });

  test('with a battle and a planeswalker the targets are listed in the same way and still accepted', () => {
    const g = scenario()
      .seat(0)
      .battlefield('Grizzly Bears')
      .battlefield('SYNTHETIC Vanilla Battle')
      .seat(1)
      .battlefield('SYNTHETIC Vanilla Planeswalker')
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    const listed = expectAllListedAccepted(g);
    expect(listed.filter((a) => a.kind === 'declareAttackers')).toHaveLength(1 + 3);
  });
});

describe('declareBlockers', () => {
  function game() {
    const g = scenario()
      .seat(0)
      .battlefield('Serra Angel', 'SYNTHETIC Menace 2/2', 'SYNTHETIC Vanilla 3/3')
      .seat(1)
      .battlefield('Giant Spider', 'Grizzly Bears', 'SYNTHETIC Flier 1/1')
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack(['Serra Angel', 'SYNTHETIC Menace 2/2', 'SYNTHETIC Vanilla 3/3']);
    g.advanceTo('declareBlockers');
    return g;
  }

  test('everything listed is accepted', () => {
    expectAllListedAccepted(game());
  });

  test('the list holds no block and every legal single block, none of a menace creature or of a flier by a ground creature', () => {
    const g = game();
    const listed = getLegalActions(g.state, 1).filter(
      (a): a is Extract<Action, { kind: 'declareBlockers' }> => a.kind === 'declareBlockers',
    );
    expect(listed.some((a) => a.blocks.length === 0)).toBe(true);
    const singles = listed
      .filter((a) => a.blocks.length === 1)
      .map((a) => `${a.blocks[0]?.blocker}>${a.blocks[0]?.attacker}`)
      .sort();
    const angel = g.id('Serra Angel');
    const three = g.id('SYNTHETIC Vanilla 3/3');
    const spider = g.id('Giant Spider');
    const bears = g.id('Grizzly Bears');
    const flier = g.id('SYNTHETIC Flier 1/1');
    expect(singles).toEqual(
      [
        `${spider}>${angel}`,
        `${spider}>${three}`,
        `${flier}>${angel}`,
        `${flier}>${three}`,
        `${bears}>${three}`,
      ].sort(),
    );
  });

  test('a decision with a single menace attacker lists only "no block"', () => {
    const g = scenario()
      .seat(0)
      .battlefield('SYNTHETIC Menace 2/2')
      .seat(1)
      .battlefield('Grizzly Bears')
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack('SYNTHETIC Menace 2/2');
    g.advanceTo('declareBlockers');
    const listed = expectAllListedAccepted(g);
    expect(listed.filter((a) => a.kind === 'declareBlockers')).toEqual([
      { kind: 'declareBlockers', blocks: [] },
    ]);
  });
});

describe('assignDamage', () => {
  function twoDoubleBlocks() {
    const g = scenario()
      .seat(0)
      .battlefield('SYNTHETIC Trampler 4/4', 'SYNTHETIC Deathtouch Trampler 4/4')
      .seat(1)
      .battlefield('SYNTHETIC Vanilla 2/2', { count: 2 })
      .battlefield('SYNTHETIC Vanilla 5/5')
      .battlefield('SYNTHETIC Vanilla 1/1')
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack(['SYNTHETIC Trampler 4/4', 'SYNTHETIC Deathtouch Trampler 4/4']);
    g.advanceTo('declareBlockers');
    g.act(1).declareBlockers([
      { blocker: 'SYNTHETIC Vanilla 2/2[0]', attacker: 'SYNTHETIC Trampler 4/4' },
      { blocker: 'SYNTHETIC Vanilla 2/2[1]', attacker: 'SYNTHETIC Trampler 4/4' },
      { blocker: 'SYNTHETIC Vanilla 5/5', attacker: 'SYNTHETIC Deathtouch Trampler 4/4' },
      { blocker: 'SYNTHETIC Vanilla 1/1', attacker: 'SYNTHETIC Deathtouch Trampler 4/4' },
    ]);
    g.passAll();
    return g;
  }

  test('with two attackers choosing at once, the listed default division is accepted', () => {
    const g = twoDoubleBlocks();
    g.expect.pending('assignDamage', 0);
    const listed = expectAllListedAccepted(g);
    const division = listed.find((a) => a.kind === 'assignDamage');
    expect(division).toBeDefined();
    if (division?.kind !== 'assignDamage') return;
    // Trampler: 2 and 2 on the blockers, nothing left. Deathtouch trampler: 1 and 1, 2 to the player.
    const total = (source: string) =>
      division.assignments
        .filter((a) => a.source === g.id(source))
        .reduce((n, a) => n + a.amount, 0);
    expect(total('SYNTHETIC Trampler 4/4')).toBe(4);
    expect(total('SYNTHETIC Deathtouch Trampler 4/4')).toBe(4);
    expect(division.assignments.filter((a) => a.to.kind === 'player').map((a) => a.amount)).toEqual(
      [2],
    );
  });

  test('the first-strike step lists its own default', () => {
    const g = scenario()
      .seat(0)
      .battlefield('SYNTHETIC First Striker 2/2')
      .seat(1)
      .battlefield('SYNTHETIC Vanilla 2/2', { count: 2 })
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack('SYNTHETIC First Striker 2/2');
    g.advanceTo('declareBlockers');
    g.act(1).declareBlockers([
      { blocker: 'SYNTHETIC Vanilla 2/2[0]', attacker: 'SYNTHETIC First Striker 2/2' },
      { blocker: 'SYNTHETIC Vanilla 2/2[1]', attacker: 'SYNTHETIC First Striker 2/2' },
    ]);
    g.passAll();
    g.expect.step('firstStrikeDamage');
    g.expect.pending('assignDamage', 0);
    const d = g.state.pending;
    if (d?.kind !== 'assignDamage') throw new Error('expected assignDamage');
    expect(d.step).toBe('firstStrike');
    expectAllListedAccepted(g);
  });
});
