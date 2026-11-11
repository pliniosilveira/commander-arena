// Illegal combat declarations are rejected and leave the state exactly as it was.
// Pins: CR 508.1 (Declare Attackers Step), CR 509.1 (Declare Blockers Step) and CR 510.1e (Combat
// Damage Step): an illegal declaration or damage assignment makes the game return to the moment before
// it was made (CR 733 Handling Illegal Actions): here applyAction answers with an error, the state is
// untouched (same hash, same pending decision) and the player can answer again.
import { describe, expect, test } from 'vitest';
import type { Action, ObjectId, SeatId } from '../src/index';
import { scenario } from '../src/testing/index';

type G = ReturnType<ReturnType<typeof scenario>['build']>;

function refuse(g: G, seat: SeatId, action: Action, message: string | RegExp) {
  const hash = g.hash();
  const decision = g.state.pending?.id;
  const r = g.act(seat).try.action(action);
  expect(r.ok, JSON.stringify(action)).toBe(false);
  if (!r.ok) {
    if (typeof message === 'string') expect(r.error).toBe(message);
    else expect(r.error).toMatch(message);
  }
  g.expect.hash(hash);
  expect(g.state.pending?.id).toBe(decision);
}

const player = (seat: SeatId) => ({ kind: 'player' as const, seat });
const permanent = (object: ObjectId) => ({ kind: 'permanent' as const, object });

describe('declareAttackers', () => {
  function game() {
    const g = scenario()
      .seat(0)
      .battlefield('SYNTHETIC Vanilla 3/3', 'Grizzly Bears')
      .battlefield('SYNTHETIC Vanilla Planeswalker')
      .battlefield('Forest')
      .seat(1)
      .battlefield('Serra Angel')
      .battlefield('SYNTHETIC Vanilla Planeswalker')
      .battlefield('SYNTHETIC Vanilla Battle')
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    return g;
  }

  test('a creature declared twice', () => {
    const g = game();
    const a = g.id('SYNTHETIC Vanilla 3/3');
    refuse(
      g,
      0,
      {
        kind: 'declareAttackers',
        attacks: [
          { attacker: a, target: player(1) },
          { attacker: a, target: player(1) },
        ],
      },
      'A creature can attack only once',
    );
  });

  test('a creature the seat does not control, a land, a planeswalker', () => {
    const g = game();
    for (const id of [
      g.id({ name: 'Serra Angel', seat: 1 }),
      g.id('Forest'),
      g.id({ name: 'SYNTHETIC Vanilla Planeswalker', seat: 0 }),
    ]) {
      refuse(
        g,
        0,
        { kind: 'declareAttackers', attacks: [{ attacker: id, target: player(1) }] },
        'That creature cannot attack',
      );
    }
  });

  test('one legal and one illegal attacker: the whole declaration is refused', () => {
    const g = game();
    refuse(
      g,
      0,
      {
        kind: 'declareAttackers',
        attacks: [
          { attacker: g.id('SYNTHETIC Vanilla 3/3'), target: player(1) },
          { attacker: g.id('Forest'), target: player(1) },
        ],
      },
      'That creature cannot attack',
    );
    g.expect.tapped('SYNTHETIC Vanilla 3/3', false);
    g.expect.combat(null);
  });

  test('the attacker itself, a creature, an own planeswalker, a battle it protects, a missing object', () => {
    const g = game();
    const a = g.id('SYNTHETIC Vanilla 3/3');
    for (const target of [
      player(0),
      permanent(a),
      permanent(g.id('Serra Angel')),
      permanent(g.id({ name: 'SYNTHETIC Vanilla Planeswalker', seat: 0 })),
      permanent('o999' as ObjectId),
      { kind: 'player' as const, seat: 5 },
    ]) {
      refuse(
        g,
        0,
        { kind: 'declareAttackers', attacks: [{ attacker: a, target }] },
        'That cannot be attacked',
      );
    }
  });

  test('another kind of action for the decision, and the wrong seat', () => {
    const g = game();
    refuse(g, 0, { kind: 'pass' }, 'Declare attackers');
    refuse(g, 0, { kind: 'declareBlockers', blocks: [] }, 'Declare attackers');
    refuse(g, 0, { kind: 'assignDamage', assignments: [] }, 'Declare attackers');
    refuse(g, 1, { kind: 'declareAttackers', attacks: [] }, 'It is not your decision');
  });

  test('after the rejections the correct declaration still works', () => {
    const g = game();
    refuse(g, 0, { kind: 'pass' }, 'Declare attackers');
    g.act(0).attack('SYNTHETIC Vanilla 3/3', { name: 'SYNTHETIC Vanilla Planeswalker', seat: 1 });
    g.expect.combat({ attackers: ['SYNTHETIC Vanilla 3/3'] });
  });
});

describe('declareBlockers', () => {
  function game() {
    const g = scenario()
      .seat(0)
      .battlefield('Serra Angel', 'SYNTHETIC Menace 2/2', 'SYNTHETIC Vanilla 3/3')
      .battlefield('Grizzly Bears')
      .seat(1)
      .battlefield('SYNTHETIC Vanilla 2/2')
      .battlefield('SYNTHETIC Vanilla 5/5', { tapped: true })
      .battlefield('SYNTHETIC Vanilla 1/1')
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack(['Serra Angel', 'SYNTHETIC Menace 2/2', 'SYNTHETIC Vanilla 3/3']);
    g.advanceTo('declareBlockers');
    return g;
  }

  test('a blocker that is tapped, belongs to the attacker, or blocks a flier without flying or reach', () => {
    const g = game();
    const three = g.id('SYNTHETIC Vanilla 3/3');
    refuse(
      g,
      1,
      {
        kind: 'declareBlockers',
        blocks: [{ blocker: g.id('SYNTHETIC Vanilla 5/5'), attacker: three }],
      },
      'That creature cannot block',
    );
    refuse(
      g,
      1,
      { kind: 'declareBlockers', blocks: [{ blocker: g.id('Grizzly Bears'), attacker: three }] },
      'That creature cannot block',
    );
    refuse(
      g,
      1,
      {
        kind: 'declareBlockers',
        blocks: [{ blocker: g.id('SYNTHETIC Vanilla 2/2'), attacker: g.id('Serra Angel') }],
      },
      'That creature cannot block that attacker',
    );
  });

  test('blocking a creature that is not attacking, or something that is not a creature', () => {
    const g = game();
    refuse(
      g,
      1,
      {
        kind: 'declareBlockers',
        blocks: [{ blocker: g.id('SYNTHETIC Vanilla 2/2'), attacker: g.id('Grizzly Bears') }],
      },
      'That creature cannot block that attacker',
    );
    refuse(
      g,
      1,
      {
        kind: 'declareBlockers',
        blocks: [{ blocker: g.id('SYNTHETIC Vanilla 2/2'), attacker: 'o999' as ObjectId }],
      },
      'That creature cannot block that attacker',
    );
  });

  test('one creature blocking twice, and a menace creature blocked once', () => {
    const g = game();
    const small = g.id('SYNTHETIC Vanilla 2/2');
    refuse(
      g,
      1,
      {
        kind: 'declareBlockers',
        blocks: [
          { blocker: small, attacker: g.id('SYNTHETIC Vanilla 3/3') },
          { blocker: small, attacker: g.id('SYNTHETIC Menace 2/2') },
        ],
      },
      'A creature can block only one attacker',
    );
    refuse(
      g,
      1,
      {
        kind: 'declareBlockers',
        blocks: [{ blocker: small, attacker: g.id('SYNTHETIC Menace 2/2') }],
      },
      'A creature with menace needs two or more blockers',
    );
  });

  test('another kind of action, and the wrong seat', () => {
    const g = game();
    refuse(g, 1, { kind: 'pass' }, 'Declare blockers');
    refuse(g, 1, { kind: 'declareAttackers', attacks: [] }, 'Declare blockers');
    refuse(g, 0, { kind: 'declareBlockers', blocks: [] }, 'It is not your decision');
  });

  test('after the rejections the legal block works', () => {
    const g = game();
    refuse(g, 1, { kind: 'pass' }, 'Declare blockers');
    g.act(1).declareBlockers([
      { blocker: 'SYNTHETIC Vanilla 2/2', attacker: 'SYNTHETIC Vanilla 3/3' },
    ]);
    g.expect.combat({ blocked: ['SYNTHETIC Vanilla 3/3'] });
  });
});

describe('assignDamage', () => {
  function game() {
    const g = scenario()
      .seat(0)
      .battlefield('SYNTHETIC Trampler 4/4')
      .seat(1)
      .battlefield('SYNTHETIC Vanilla 2/2', 'SYNTHETIC Vanilla 1/1')
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack('SYNTHETIC Trampler 4/4');
    g.advanceTo('declareBlockers');
    g.act(1).declareBlockers([
      { blocker: 'SYNTHETIC Vanilla 2/2', attacker: 'SYNTHETIC Trampler 4/4' },
      { blocker: 'SYNTHETIC Vanilla 1/1', attacker: 'SYNTHETIC Trampler 4/4' },
    ]);
    g.passAll();
    g.expect.pending('assignDamage', 0);
    return g;
  }

  const to = (id: ObjectId) => ({ kind: 'object' as const, id });

  test('the total is wrong, an amount is negative or fractional', () => {
    const g = game();
    const t = g.id('SYNTHETIC Trampler 4/4');
    const two = g.id('SYNTHETIC Vanilla 2/2');
    const one = g.id('SYNTHETIC Vanilla 1/1');
    refuse(
      g,
      0,
      { kind: 'assignDamage', assignments: [] },
      'Assign exactly 4 damage from each creature',
    );
    refuse(
      g,
      0,
      { kind: 'assignDamage', assignments: [{ source: t, to: to(two), amount: 5 }] },
      'Assign exactly 4 damage from each creature',
    );
    refuse(
      g,
      0,
      {
        kind: 'assignDamage',
        assignments: [
          { source: t, to: to(two), amount: 2.5 },
          { source: t, to: to(one), amount: 1.5 },
        ],
      },
      'Damage must be a whole number',
    );
    refuse(
      g,
      0,
      {
        kind: 'assignDamage',
        assignments: [
          { source: t, to: to(two), amount: 5 },
          { source: t, to: to(one), amount: -1 },
        ],
      },
      'Damage must be a whole number',
    );
  });

  test('damage to something that is not a blocker or the attacked player', () => {
    const g = game();
    const t = g.id('SYNTHETIC Trampler 4/4');
    const two = g.id('SYNTHETIC Vanilla 2/2');
    const one = g.id('SYNTHETIC Vanilla 1/1');
    refuse(
      g,
      0,
      {
        kind: 'assignDamage',
        assignments: [
          { source: t, to: to(two), amount: 2 },
          { source: t, to: to(one), amount: 1 },
          { source: t, to: player(0), amount: 1 },
        ],
      },
      /Damage can only go to the blockers/,
    );
    refuse(
      g,
      0,
      { kind: 'assignDamage', assignments: [{ source: t, to: to(t), amount: 4 }] },
      /Damage can only go to the blockers/,
    );
  });

  test('lethal damage to every blocker is required before the player gets any', () => {
    const g = game();
    const t = g.id('SYNTHETIC Trampler 4/4');
    refuse(
      g,
      0,
      {
        kind: 'assignDamage',
        assignments: [
          { source: t, to: to(g.id('SYNTHETIC Vanilla 2/2')), amount: 2 },
          { source: t, to: player(1), amount: 2 },
        ],
      },
      'Assign lethal damage to every blocker before trampling over',
    );
  });

  test('a creature with no choice, an unknown source, another kind of action, the wrong seat', () => {
    const g = game();
    const t = g.id('SYNTHETIC Trampler 4/4');
    const two = g.id('SYNTHETIC Vanilla 2/2');
    refuse(
      g,
      0,
      {
        kind: 'assignDamage',
        assignments: [
          { source: t, to: to(two), amount: 4 },
          { source: two, to: to(t), amount: 2 },
        ],
      },
      'That creature has no choice to make',
    );
    refuse(
      g,
      0,
      {
        kind: 'assignDamage',
        assignments: [{ source: 'o999' as ObjectId, to: to(two), amount: 1 }],
      },
      'That creature has no choice to make',
    );
    refuse(g, 0, { kind: 'pass' }, 'Assign combat damage');
    refuse(g, 1, { kind: 'assignDamage', assignments: [] }, 'It is not your decision');
  });

  test('after the rejections a legal division is accepted', () => {
    const g = game();
    refuse(g, 0, { kind: 'pass' }, 'Assign combat damage');
    g.act(0).assignDamage([
      { from: 'SYNTHETIC Trampler 4/4', to: 'SYNTHETIC Vanilla 2/2', amount: 2 },
      { from: 'SYNTHETIC Trampler 4/4', to: 'SYNTHETIC Vanilla 1/1', amount: 1 },
      { from: 'SYNTHETIC Trampler 4/4', to: { player: 1 }, amount: 1 },
    ]);
    g.expect.life(1, 39);
  });
});
