// CR 509.1b: a creature with a must-block requirement blocks if able. Fixtures are SYNTHETIC.
import { describe, expect, test } from 'vitest';
import type { DeclareBlockersDecision, ObjectId } from '../src';
import { getLegalActions, legalActionsForDecision } from '../src';
import type { Ability } from '../src/ast/types';
import { singleFace } from '../src/cards/fixtures/helpers';
import { scenario } from '../src/testing/index';

const MUST_BLOCK: Ability = {
  kind: 'static',
  static: { kind: 'restriction', subject: { kind: 'this' }, restriction: 'mustBlock' },
};
const MUST_BE_BLOCKED: Ability = {
  kind: 'static',
  static: { kind: 'restriction', subject: { kind: 'this' }, restriction: 'mustBeBlocked' },
};
const MUST_BLOCK_MENACE: Ability = {
  kind: 'static',
  static: { kind: 'restriction', subject: { kind: 'this' }, restriction: 'mustBlock' },
};
const MENACE_MUST_BLOCKER = singleFace({
  name: 'SYNTHETIC Menace Must Blocker',
  manaCost: ['1', 'G'],
  types: ['creature'],
  colors: ['G'],
  colorIdentity: ['G'],
  power: 2,
  toughness: 2,
  oracleText: 'Menace',
  abilities: [MUST_BLOCK_MENACE, { kind: 'keyword', keyword: { kind: 'menace' } }],
});
const BLOCKER = singleFace({
  name: 'SYNTHETIC Must Block Bear',
  manaCost: ['1', 'G'],
  types: ['creature'],
  colors: ['G'],
  colorIdentity: ['G'],
  power: 2,
  toughness: 2,
  oracleText: 'test',
  abilities: [MUST_BLOCK],
});
const SECOND_BLOCKER = singleFace({
  name: 'SYNTHETIC Must Block Fox',
  manaCost: ['1', 'G'],
  types: ['creature'],
  colors: ['G'],
  colorIdentity: ['G'],
  power: 2,
  toughness: 2,
  oracleText: 'test',
  abilities: [MUST_BLOCK],
});
const MUST_BE_BLOCKED_ATTACKER = singleFace({
  name: 'SYNTHETIC Must Be Blocked Bear',
  manaCost: ['1', 'G'],
  types: ['creature'],
  colors: ['G'],
  colorIdentity: ['G'],
  power: 2,
  toughness: 2,
  oracleText: 'test',
  abilities: [MUST_BE_BLOCKED],
});
const POWER_FOUR_ATTACKER = singleFace({
  name: 'SYNTHETIC Must-Block Target 4/4',
  manaCost: ['2', 'G', 'G'],
  types: ['creature'],
  colors: ['G'],
  colorIdentity: ['G'],
  power: 4,
  toughness: 4,
  oracleText: '',
});

describe('must block if able (CR 509.1b)', () => {
  test('requires an available blocker to be declared', () => {
    const g = scenario()
      .define(BLOCKER)
      .seat(0)
      .battlefield('Grizzly Bears')
      .seat(1)
      .battlefield(BLOCKER.name)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack('Grizzly Bears');
    g.advanceTo('declareBlockers');
    g.passAll();
    expect(g.act(1).try.declareBlockers([])).toEqual({
      ok: false,
      error: 'A creature that must block if able must block',
    });
    expect(getLegalActions(g.state, 1)).not.toContainEqual({ kind: 'declareBlockers', blocks: [] });
    g.act(1).declareBlockers([{ blocker: BLOCKER.name, attacker: 'Grizzly Bears' }]);
    g.expect.invariants();
  });

  test('does not require a creature that cannot block any attacker', () => {
    const g = scenario()
      .define(BLOCKER)
      .seat(0)
      .battlefield('SYNTHETIC Flier 1/1')
      .seat(1)
      .battlefield(BLOCKER.name)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack('SYNTHETIC Flier 1/1');
    g.advanceTo('postcombatMain');
    g.expect.life(1, 39);
    g.expect.invariants();
  });

  test('maximizes must-block and must-be-blocked requirements together', () => {
    const g = scenario()
      .define(BLOCKER)
      .define(MUST_BE_BLOCKED_ATTACKER)
      .seat(0)
      .battlefield(MUST_BE_BLOCKED_ATTACKER.name, 'Grizzly Bears')
      .seat(1)
      .battlefield(BLOCKER.name, 'Grizzly Bears')
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack([MUST_BE_BLOCKED_ATTACKER.name, 'Grizzly Bears']);
    g.advanceTo('declareBlockers');
    expect(
      g.act(1).try.declareBlockers([{ blocker: BLOCKER.name, attacker: 'Grizzly Bears' }]),
    ).toMatchObject({ ok: false });
    g.act(1).declareBlockers([
      { blocker: BLOCKER.name, attacker: 'Grizzly Bears' },
      { blocker: 'Grizzly Bears', attacker: MUST_BE_BLOCKED_ATTACKER.name },
    ]);
    g.expect.invariants();
  });

  test('a must-block creature can use a supporting blocker against menace', () => {
    const g = scenario()
      .define(MENACE_MUST_BLOCKER)
      .seat(0)
      .battlefield('SYNTHETIC Menace 2/2')
      .seat(1)
      .battlefield(MENACE_MUST_BLOCKER.name, 'Grizzly Bears')
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack('SYNTHETIC Menace 2/2');
    g.advanceTo('declareBlockers');

    const attacker = g.id('SYNTHETIC Menace 2/2');
    const mustBlocker = g.id(MENACE_MUST_BLOCKER.name);
    const bears = g.id('Grizzly Bears');
    const legal = getLegalActions(g.state, 1);
    expect(legal).toContainEqual({
      kind: 'declareBlockers',
      blocks: [
        { blocker: mustBlocker, attacker },
        { blocker: bears, attacker },
      ],
    });
    expect(g.act(1).try.declareBlockers([])).toMatchObject({ ok: false });
    expect(
      g.act(1).try.declareBlockers([
        { blocker: MENACE_MUST_BLOCKER.name, attacker: 'SYNTHETIC Menace 2/2' },
        { blocker: 'Grizzly Bears', attacker: 'SYNTHETIC Menace 2/2' },
      ]),
    ).toMatchObject({ ok: true });
  });

  test('only legal assignments count when a blocker restriction caps blocks at one', () => {
    const g = scenario()
      .define(BLOCKER)
      .define(SECOND_BLOCKER)
      .define(POWER_FOUR_ATTACKER)
      .seat(0)
      .battlefield('SYNTHETIC Banner of the Lone Duel', POWER_FOUR_ATTACKER.name)
      .seat(1)
      .battlefield(BLOCKER.name, SECOND_BLOCKER.name)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack(POWER_FOUR_ATTACKER.name);
    g.advanceTo('declareBlockers');
    const blockers = [g.id(BLOCKER.name), g.id(SECOND_BLOCKER.name)];
    const firstBlocker = blockers[0];
    if (firstBlocker === undefined) throw new Error('expected a must-block creature');
    const attacker = g.id(POWER_FOUR_ATTACKER.name);
    expect(g.act(1).try.declareBlockers([])).toMatchObject({ ok: false });
    expect(g.act(1).try.declareBlockers([{ blocker: firstBlocker, attacker }])).toMatchObject({
      ok: true,
    });
    expect(
      g.act(1).try.declareBlockers(blockers.map((blocker) => ({ blocker, attacker }))),
    ).toMatchObject({ ok: false });
  });

  test('memoizes equivalent assignment states when many mandatory blockers compete for capped attacks', () => {
    const attackers = Array.from({ length: 9 }, (_, index) => `attacker-${index}` as ObjectId);
    const blockers = Array.from({ length: 10 }, (_, index) => `blocker-${index}` as ObjectId);
    const decision = {
      kind: 'declareBlockers',
      seat: 1,
      attackers: attackers.map((attacker) => ({
        attacker,
        target: { kind: 'player', seat: 1 },
        minBlockers: 1,
        maxBlockers: 1,
      })),
      candidates: blockers.map((blocker) => ({
        blocker,
        canBlock: attackers,
        mustBlock: true,
      })),
    } as unknown as DeclareBlockersDecision;
    const actions = legalActionsForDecision(decision);
    const declaration = actions.find((action) => action.kind === 'declareBlockers');
    expect(declaration?.kind === 'declareBlockers' ? declaration.blocks : []).toHaveLength(9);
  });
});
