// The Abzan Armor deck, group D: the primitives the engine gained for it, validated and run. Flanking (CR 702.25) and its `becomesBlockedBy` trigger (CR 509.3d),
// "you own" (`ObjectFilter.ownedByYou`, CR 108.3), a counter put on the permanent as the cost of a mana ability (CR 118.3, 605.3) and +X/+Y counters of any kind (CR 122.1a),
// and a limit on who may block read from a subject that compares power (CR 509.1b, 613.11). Cards are defined here, with no name of a real card.
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import {
  type Ability,
  type CardDefinition,
  isFeatureSupported,
  isKnownFeature,
  validateCard,
} from '../src/index';
import { derive } from '../src/rules/derive';
import { scenario } from '../src/testing/index';

const LIB = Array.from({ length: 6 }, () => 'Plains');

function creature(
  name: string,
  abilities: readonly Ability[],
  extra: Partial<Parameters<typeof singleFace>[0]> = {},
): CardDefinition {
  return singleFace({
    name,
    manaCost: ['2'],
    types: ['creature'],
    colors: [],
    colorIdentity: [],
    power: 2,
    toughness: 2,
    oracleText: 'Test.',
    abilities,
    ...extra,
  });
}

const issues = (card: CardDefinition) => validateCard(card).map((i) => `${i.path}: ${i.message}`);

describe('the features are known and supported', () => {
  test.each([
    'trigger:becomesBlockedBy',
    'keyword:flanking',
    'selector:ownedByYou',
    'manaCost:putCounters',
  ])('%s', (ref) => {
    expect(isKnownFeature(ref as never), ref).toBe(true);
    expect(isFeatureSupported(ref as never), ref).toBe(true);
  });
});

describe('Flanking (CR 702.25a, 702.25b)', () => {
  const flanker = creature('SYNTHETIC Flanker', [
    { kind: 'keyword', keyword: { kind: 'flanking' } },
  ]);
  const twice = creature('SYNTHETIC Double Flanker', [
    { kind: 'keyword', keyword: { kind: 'flanking' } },
    { kind: 'keyword', keyword: { kind: 'flanking' } },
  ]);

  test('is valid and expands to a trigger for each instance', () => {
    expect(issues(flanker)).toEqual([]);
    const g = scenario()
      .define(flanker)
      .define(twice)
      .seat(0)
      .battlefield(flanker.name, twice.name)
      .build();
    const triggers = (name: string) =>
      derive(g.state, g.state.objects[g.id(name)] as never).abilities.filter(
        (a) => a.kind === 'triggered' && a.trigger.kind === 'becomesBlockedBy',
      );
    expect(triggers(flanker.name)).toHaveLength(1);
    expect(triggers(twice.name)).toHaveLength(2);
  });

  test('each blocker without flanking gets -1/-1 until end of turn, one trigger for each blocker', () => {
    const g = scenario()
      .define(flanker)
      .seat(0)
      .battlefield(flanker.name)
      .seat(1)
      .library(...LIB)
      .battlefield('Grizzly Bears', 'Giant Spider')
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack(flanker.name);
    g.advanceTo('declareBlockers');
    g.act(1).declareBlockers([
      { blocker: 'Grizzly Bears', attacker: flanker.name },
      { blocker: 'Giant Spider', attacker: flanker.name },
    ]);
    g.act(0).orderTriggers(0, 1);
    expect(g.state.stack).toHaveLength(2);
    g.passAll();
    g.expect.pt('Grizzly Bears', 1, 1);
    g.expect.pt('Giant Spider', 1, 3);
    // Until end of turn (CR 702.25a): gone with the turn.
    g.passAll();
    g.act(0).defaultDamage();
    g.advanceTo('end');
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.pt('Giant Spider', 2, 4);
  });

  test('two instances trigger twice for one blocker (CR 702.25b)', () => {
    const g = scenario()
      .define(twice)
      .seat(0)
      .battlefield(twice.name)
      .seat(1)
      .library(...LIB)
      .battlefield('Giant Spider')
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack(twice.name);
    g.advanceTo('declareBlockers');
    g.act(1).declareBlockers([{ blocker: 'Giant Spider', attacker: twice.name }]);
    expect(g.state.stack).toHaveLength(2);
    g.passAll();
    g.expect.pt('Giant Spider', 0, 2);
  });
});

describe('the trigger becomesBlockedBy is validated', () => {
  const triggered = (trigger: unknown, effect: unknown): CardDefinition =>
    creature('SYNTHETIC Bad Flanker', [
      { kind: 'triggered', trigger, effect } as unknown as Ability,
    ]);
  const effect = { kind: 'gainLife', player: { kind: 'you' }, amount: 1 };

  test('needs a filter of the blocker with no zone or combat', () => {
    const base = { kind: 'becomesBlockedBy', what: { kind: 'this' } };
    expect(issues(triggered({ ...base, by: { types: ['creature'] } }, effect))).toEqual([]);
    expect(issues(triggered({ ...base, by: { zone: 'graveyard' } }, effect)).join()).toMatch(
      /no zone, owner, stackKind or combat/,
    );
    expect(issues(triggered({ ...base, by: { blocking: true } }, effect)).join()).toMatch(
      /no zone, owner, stackKind or combat/,
    );
  });

  test('"the blocking creature" (triggerSources) is read only after it', () => {
    const modify = {
      kind: 'modifyPt',
      objects: { kind: 'triggerSources' },
      power: -1,
      toughness: -1,
      duration: 'untilEndOfTurn',
    };
    const by = { types: ['creature'] };
    expect(
      issues(triggered({ kind: 'becomesBlockedBy', what: { kind: 'this' }, by }, modify)),
    ).toEqual([]);
    expect(
      issues(triggered({ kind: 'becomesBlocked', what: { kind: 'this' } }, modify)).join(),
    ).toMatch(/triggerSources/);
  });
});

describe('"you own" (ObjectFilter.ownedByYou, CR 108.3)', () => {
  const zapper = creature(
    'SYNTHETIC Own Zapper',
    [
      {
        kind: 'activated',
        cost: [{ kind: 'tap' }],
        targets: [
          { id: 'p', what: { kind: 'object', filter: { zone: 'battlefield', ownedByYou: true } } },
        ],
        effect: { kind: 'destroy', objects: { kind: 'target', id: 'p' } },
      } as unknown as Ability,
    ],
    { power: 1, toughness: 1 },
  );

  test('is valid, and true only', () => {
    expect(issues(zapper)).toEqual([]);
    const bad = JSON.parse(
      JSON.stringify(zapper).replace('"ownedByYou":true', '"ownedByYou":false'),
    );
    expect(issues(bad).join()).toMatch(/ownedByYou must be true/);
  });

  const build = () =>
    scenario({ seats: 3 })
      .define(zapper)
      .seat(0)
      .library(...LIB)
      .battlefield(zapper.name)
      .battlefield('Sol Ring', { controller: 1 })
      .seat(1)
      .library(...LIB)
      .battlefield('Command Tower')
      .seat(2)
      .library(...LIB)
      .battlefield('Grizzly Bears', { controller: 0 })
      .at('precombatMain', { active: 0 })
      .build();

  // Sol Ring is owned by seat 0 and controlled by seat 1: the Zapper may target it. Command Tower (seat 1's) and Grizzly Bears (seat 2's, under seat 0's control) it may not.
  test('a permanent an opponent controls but its owner owns is a target', () => {
    const g = build();
    g.act(0).activate(zapper.name, { targets: ['Sol Ring'] });
    g.passAll();
    g.expect.zone('Sol Ring', 'graveyard');
  });
  test.each(['Command Tower', 'Grizzly Bears'])('%s, owned by another player, is not', (name) => {
    expect(() =>
      build()
        .act(0)
        .activate(zapper.name, { targets: [name] }),
    ).toThrow();
  });
});

describe('a counter put on the permanent as the cost of a mana ability (CR 118.3, 605.3, 122.1)', () => {
  const root = (toughness: number) =>
    creature(
      'SYNTHETIC Root Wall',
      [
        {
          kind: 'mana',
          cost: [{ kind: 'putCounters', counter: '-0/-1', count: 1 }],
          production: { kind: 'fixed', mana: ['G'] },
          oncePerTurn: true,
        } as unknown as Ability,
      ],
      { power: 0, toughness },
    );

  test('is valid', () => {
    expect(issues(root(3))).toEqual([]);
  });

  test('a -0/-1 counter takes 1 off the toughness and nothing off the power (CR 122.1a)', () => {
    const wall = root(3);
    const g = scenario()
      .define(wall)
      .seat(0)
      .battlefield(wall.name, { counters: { '-0/-1': 2 } })
      .build();
    g.expect.pt(wall.name, 0, 1);
  });

  test('+X/+Y counters of any size are added, and a -1/-1 counter still takes 1 off both', () => {
    const wall = root(3);
    const g = scenario()
      .define(wall)
      .seat(0)
      .battlefield(wall.name, { counters: { '+1/+1': 2, '-1/-1': 1, '+2/+0': 1 } })
      .build();
    g.expect.pt(wall.name, 3, 4);
  });
});
