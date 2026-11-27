// The reference `granter` (the permanent whose static ability gives the ability it is in, CR 113.6, 613.1f) and the amount `damageToThisThisTurn` (the damage the permanent of the
// ability was dealt this turn by sources the controller controlled as they dealt it, CR 120.3, 608.2h), validated and run on SYNTHETIC cards that carry no text of a real card.
// The real Grothama, All-Devouring is read and run in `packages/cards/test/convert-grammar-engine-animated-army-grothama.test.ts`.
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import {
  type Ability,
  type CardDefinition,
  type FeatureRef,
  isFeatureSupported,
  isKnownFeature,
  type ObjectId,
  type ObjectRef,
  validateCard,
} from '../src/index';
import { derive } from '../src/rules/derive';
import { scenario } from '../src/testing/index';

const LIB = Array.from({ length: 30 }, () => 'Plains');

const creature = (name: string, abilities: readonly Ability[]): CardDefinition =>
  singleFace({
    name,
    manaCost: ['2'],
    types: ['creature'],
    colors: [],
    colorIdentity: [],
    power: 3,
    toughness: 5,
    oracleText: 'SYNTHETIC test card.',
    abilities,
  });

/** "Other creatures have \"Whenever this creature attacks, you may have it fight [the granter].\"" */
const fightGranter = (against: ObjectRef): Extract<Ability, { kind: 'triggered' }> => ({
  kind: 'triggered',
  trigger: { kind: 'attacks', what: { kind: 'this' } },
  effect: { kind: 'fight', fighters: { kind: 'this' }, against },
  optional: true,
});
const grant = (against: ObjectRef): Ability => ({
  kind: 'static',
  static: {
    kind: 'grantAbility',
    subject: { kind: 'filter', filter: { types: ['creature'] }, other: true },
    ability: fightGranter(against),
  },
});
const GRANT = grant({ kind: 'granter' });

/** "When this creature leaves the battlefield, each player draws cards equal to the damage sources they controlled dealt to it this turn." */
const LEAVES: Ability = {
  kind: 'triggered',
  trigger: { kind: 'leavesBattlefield', what: { kind: 'this' } },
  effect: {
    kind: 'forEachPlayer',
    players: { kind: 'eachPlayer' },
    runsAs: 'each',
    effect: {
      kind: 'draw',
      player: { kind: 'you' },
      count: { kind: 'damageToThisThisTurn', by: 'you' },
    },
  },
};

const GRANTER = creature('SYNTHETIC Granter', [GRANT, LEAVES]);
const issues = (card: CardDefinition) => validateCard(card).map((i) => `${i.path}: ${i.message}`);

describe('the features', () => {
  test.each<FeatureRef>(['selector:granter', 'amount:damageToThisThisTurn'])(
    '%s is known and supported',
    (f) => {
      expect(isKnownFeature(f)).toBe(true);
      expect(isFeatureSupported(f)).toBe(true);
    },
  );
});

describe('validation', () => {
  test('the card with both is valid', () => {
    expect(issues(GRANTER)).toEqual([]);
  });

  test("'granter' outside the ability a static ability gives is refused", () => {
    const bad = creature('SYNTHETIC Bad Granter', [
      {
        kind: 'triggered',
        trigger: { kind: 'attacks', what: { kind: 'this' } },
        effect: { kind: 'fight', fighters: { kind: 'this' }, against: { kind: 'granter' } },
      },
    ]);
    expect(issues(bad).join('\n')).toContain("'granter' is only valid in the ability a static");
  });

  test('a card does not write the permanent the engine names', () => {
    const named = creature('SYNTHETIC Named Granter', [
      grant({ kind: 'granter', object: 'o1' as ObjectId }),
    ]);
    expect(issues(named).join('\n')).toContain('the engine names the permanent that grants');
  });

  test("'damageToThisThisTurn' is the amount of an ability of a permanent only", () => {
    const spell = singleFace({
      name: 'SYNTHETIC Bad Count',
      manaCost: ['1'],
      types: ['sorcery'],
      colors: [],
      colorIdentity: [],
      oracleText: 'SYNTHETIC test card.',
      spell: {
        effect: {
          kind: 'draw',
          player: { kind: 'you' },
          count: { kind: 'damageToThisThisTurn', by: 'you' },
        },
      },
    });
    expect(issues(spell).join('\n')).toContain('only valid in abilities of a permanent');
  });
});

describe('the granted ability names the permanent that gives it', () => {
  test('each instance has its own: two granters give two abilities, each with its own permanent', () => {
    const g = scenario()
      .seat(0)
      .define(GRANTER)
      .battlefield(GRANTER.name, GRANTER.name, 'Grizzly Bears')
      .seat(1)
      .at('precombatMain', { active: 0 })
      .build();
    const bears = derive(g.state, g.object('Grizzly Bears'));
    const granted = bears.abilities.filter((a) => a.kind === 'triggered');
    expect(granted.map((a) => JSON.stringify(a))).toEqual([
      expect.stringContaining('"kind":"granter","object":"o0"'),
      expect.stringContaining('"kind":"granter","object":"o1"'),
    ]);
  });

  test('the printed ability is not changed: the engine writes the permanent into a copy', () => {
    expect(JSON.stringify(GRANT)).not.toContain('"object"');
  });
});

describe('the damage a permanent was dealt this turn, by the controller of the source', () => {
  const table = (seats: 2 | 3) => {
    const b = scenario({ seats })
      .seat(0)
      .define(GRANTER)
      .battlefield(GRANTER.name)
      .library(...LIB)
      .seat(1)
      .battlefield('Mountain')
      .hand('Lightning Bolt')
      .library(...LIB);
    return (seats === 3 ? b.seat(2).library(...LIB) : b).at('precombatMain', { active: 1 }).build();
  };

  test('burn of the active player is recorded for that player only, however the permanent leaves later', () => {
    const g = table(3);
    g.act(1).cast('Lightning Bolt', { targets: [GRANTER.name], pay: true });
    g.passAll();
    expect(g.state.turnLog.damageToObjects?.[g.id(GRANTER.name)]).toEqual([0, 3, 0]);
  });
});
