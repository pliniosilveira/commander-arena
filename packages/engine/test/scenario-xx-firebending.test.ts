// Firebending N (CR 702.189a) and mana kept "until end of combat" (CR 500.5a, 106.4): the AST validation, the abilities `derive` expands the keyword into, and what the
// mana pool does as the steps of combat end. Cards are SYNTHETIC (defined here). The real cards are played in packages/cards/test/convert-grammar-engine-azula.test.ts.
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import {
  type Ability,
  type CardDefinition,
  isFeatureSupported,
  SUPPORTED_FEATURES,
  validateCard,
} from '../src/index';
import { derive } from '../src/rules/derive';
import { scenario } from '../src/testing/index';

const NAME = 'SYNTHETIC Test Firebender';

function creature(abilities: readonly Ability[]): CardDefinition {
  return singleFace({
    name: NAME,
    manaCost: ['1', 'R'],
    types: ['creature'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 2,
    toughness: 2,
    oracleText: 'Firebending.',
    abilities,
  });
}

const issues = (card: CardDefinition) => validateCard(card).map((i) => `${i.path}: ${i.message}`);
const firebending = (count: number): Ability => ({
  kind: 'keyword',
  keyword: { kind: 'firebending', count },
});

describe('the AST', () => {
  test('firebending is a supported keyword and the mana duration is a supported feature', () => {
    expect(SUPPORTED_FEATURES.keywordKinds).toContain('firebending');
    expect(isFeatureSupported('keyword:firebending')).toBe(true);
    expect(isFeatureSupported('selector:manaStaysThroughCombat')).toBe(true);
  });

  test('firebending needs a positive whole number', () => {
    for (const count of [0, -1, 1.5]) {
      expect(issues(creature([firebending(count)])).length, `${count}`).toBeGreaterThan(0);
    }
    expect(issues(creature([firebending(2)]))).toEqual([]);
  });

  test('a mana ability cannot keep its mana, and the two durations do not go together', () => {
    const trigger = (staysUntilEndOfTurn: boolean, staysUntilEndOfCombat: boolean): Ability => ({
      kind: 'triggered',
      trigger: { kind: 'attacks', what: { kind: 'this' } },
      effect: {
        kind: 'addMana',
        mana: {
          kind: 'fixed',
          mana: ['R'],
          ...(staysUntilEndOfTurn ? { staysUntilEndOfTurn: true as const } : {}),
          ...(staysUntilEndOfCombat ? { staysUntilEndOfCombat: true as const } : {}),
        },
      },
    });
    expect(issues(creature([trigger(false, true)]))).toEqual([]);
    expect(issues(creature([trigger(true, true)])).join()).toContain('not both');
    const manaAbility: Ability = {
      kind: 'mana',
      cost: [{ kind: 'tap' }],
      production: { kind: 'fixed', mana: ['R'], staysUntilEndOfCombat: true },
    };
    expect(issues(creature([manaAbility])).join()).toContain('empties');
  });
});

describe('derive expands the keyword into one trigger for each instance (CR 702.189a)', () => {
  test('firebending N: whenever this creature attacks, add N {R}, kept until end of combat', () => {
    const g = scenario()
      .define(creature([firebending(3), firebending(1)]))
      .seat(0)
      .battlefield(NAME)
      .library('Island')
      .seat(1)
      .library('Island')
      .at('precombatMain', { active: 0 })
      .build();
    const obj = g.state.objects[g.id(NAME)];
    if (obj === undefined) throw new Error('missing');
    const triggers = derive(g.state, obj).abilities.filter((a) => a.kind === 'triggered');
    expect(triggers).toHaveLength(2);
    expect(triggers[0]).toMatchObject({
      trigger: { kind: 'attacks', what: { kind: 'this' } },
      effect: {
        kind: 'addMana',
        mana: { kind: 'fixed', mana: ['R', 'R', 'R'], staysUntilEndOfCombat: true },
      },
    });
  });
});

describe('the mana pool as combat goes on (CR 500.5a)', () => {
  const game = (instances: readonly Ability[]) => {
    const g = scenario()
      .define(creature(instances))
      .seat(0)
      .battlefield(NAME)
      .library('Island')
      .seat(1)
      .library('Island')
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([{ attacker: NAME }]);
    // CR 603.3b: two instances trigger at once, so the controller orders them.
    if (instances.length > 1) g.act(0).orderTriggers(0, 1);
    g.passAll();
    return g;
  };

  test('two instances add their mana separately and both last until the end of combat', () => {
    const g = game([firebending(2), firebending(1)]);
    g.expect.pool(0, { R: 3 });
    g.advanceTo('combatDamage');
    g.expect.pool(0, { R: 3 });
    g.advanceTo('postcombatMain');
    g.expect.pool(0, {});
    g.expect.invariants();
  });
});
