// CR 509.1b: a creature with a must-block requirement blocks if able. Fixtures are SYNTHETIC.
import { describe, expect, test } from 'vitest';
import { getLegalActions } from '../src';
import type { Ability } from '../src/ast/types';
import { singleFace } from '../src/cards/fixtures/helpers';
import { scenario } from '../src/testing/index';

const MUST_BLOCK: Ability = {
  kind: 'static',
  static: { kind: 'restriction', subject: { kind: 'this' }, restriction: 'mustBlock' },
};
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
});
