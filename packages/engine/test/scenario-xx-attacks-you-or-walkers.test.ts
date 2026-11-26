// "Whenever an opponent attacks you and/or one or more planeswalkers you control, draw a card." (Cunning Rhetoric's trigger; CR 508.1b, 508.6, 603.2c): once for each declaration in which
// a creature was declared as attacking the controller as a player or a planeswalker they control, however many creatures attack; not an attack on another player or by the controller.
// The card is the SYNTHETIC "Walker Watcher", written to the AST the parser lowers; the creatures and the planeswalker are fixtures.
import { describe, expect, test } from 'vitest';
import { validateCard } from '../src/index';
import { scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const WATCHER = 'SYNTHETIC Walker Watcher';
const WALKER = 'SYNTHETIC Vanilla Planeswalker';
const BEARS = 'Grizzly Bears';
const HAWK = "Healer's Hawk";
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

const watcher = singleFaceCard({
  name: WATCHER,
  manaCost: ['2', 'B'],
  types: ['enchantment'],
  colors: ['B'],
  colorIdentity: ['B'],
  oracleText:
    'Whenever an opponent attacks you and/or one or more planeswalkers you control, draw a card.',
  abilities: [
    {
      kind: 'triggered',
      trigger: {
        kind: 'attackBatch',
        who: 'opponent',
        atLeast: 1,
        attackedYouOrPlaneswalkers: true,
      },
      effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
    },
  ],
});

const table = (active = 1) => {
  const g = scenario({ seats: 3 })
    .seat(0)
    .define(watcher)
    .library(...LIBRARY)
    .battlefield(WATCHER, WALKER)
    .seat(1)
    .library(...LIBRARY)
    .battlefield(BEARS, HAWK)
    .seat(2)
    .library(...LIBRARY)
    .battlefield(BEARS)
    .at('precombatMain', { active })
    .build();
  g.advanceTo('declareAttackers', { attack: false });
  return g;
};

describe('the card is valid', () => {
  test('validateCard', () => {
    expect(validateCard(watcher)).toEqual([]);
  });

  const withTrigger = (trigger: unknown) =>
    validateCard({
      ...watcher,
      faces: [
        {
          ...watcher.faces[0],
          abilities: [
            {
              kind: 'triggered',
              trigger,
              effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
            },
          ],
        },
      ],
    } as unknown as typeof watcher);

  test('it does not go with attackedYou, and is about the attackers of another player', () => {
    for (const extra of [{ attackedYou: true }, { eachAttackedPlayer: true }, { who: 'you' }]) {
      const issues = withTrigger({
        kind: 'attackBatch',
        who: 'opponent',
        atLeast: 1,
        attackedYouOrPlaneswalkers: true,
        ...extra,
      });
      expect(issues.map((i) => i.message).join('\n')).toMatch(/attackedYouOrPlaneswalkers/);
    }
  });
});

describe('"Whenever an opponent attacks you and/or one or more planeswalkers you control"', () => {
  test('an attack on the controller triggers it once, whoever attacks (any opponent, CR 508.1b)', () => {
    const g = table();
    g.act(1).declareAttackers([
      { attacker: BEARS, target: { player: 0 } },
      { attacker: HAWK, target: { player: 0 } },
    ]);
    expect(g.state.stack).toHaveLength(1);
    g.passAll();
    expect(g.state.seats[0]?.hand).toHaveLength(1);
  });

  test('an attack on a planeswalker of the controller triggers it (CR 508.6)', () => {
    const g = table();
    g.act(1).declareAttackers([{ attacker: BEARS, target: WALKER }]);
    expect(g.state.stack).toHaveLength(1);
  });

  test('an attack on you and on your planeswalker at once is one declaration: one trigger (CR 603.2c)', () => {
    const g = table();
    g.act(1).declareAttackers([
      { attacker: BEARS, target: { player: 0 } },
      { attacker: HAWK, target: WALKER },
    ]);
    expect(g.state.stack).toHaveLength(1);
  });

  test('an attack on the third player does not trigger it', () => {
    const g = table();
    g.act(1).declareAttackers([{ attacker: BEARS, target: { player: 2 } }]);
    expect(g.state.stack).toHaveLength(0);
  });

  test('the controller attacking does not trigger it', () => {
    const g = scenario({ seats: 3 })
      .seat(0)
      .define(watcher)
      .library(...LIBRARY)
      .battlefield(WATCHER, BEARS)
      .seat(1)
      .library(...LIBRARY)
      .seat(2)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([{ attacker: BEARS, target: { player: 1 } }]);
    expect(g.state.stack).toHaveLength(0);
  });

  test('two opponents attacking in their own turns trigger it each time', () => {
    const g = table(2);
    g.act(2).declareAttackers([{ attacker: BEARS, target: { player: 0 } }]);
    expect(g.state.stack).toHaveLength(1);
  });
});
