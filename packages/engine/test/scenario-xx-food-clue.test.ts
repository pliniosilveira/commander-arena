// Food and Clue tokens (CR 111.10b, 111.10f): predefined tokens whose activated abilities run
// through the ordinary activation path (CR 602), with a sacrifice cost (CR 701.21).
// Pins: CR 111.10b (Food: "{2}, {T}, Sacrifice this token: You gain 3 life."), CR 111.10f (Clue:
// "{2}, Sacrifice this token: Draw a card."), CR 111.2 (the creator owns the token and controls
// it), CR 111.7 and 704.5d (a token that leaves the battlefield ceases to exist), CR 602.2a and
// 602.2b (costs are paid before the ability goes on the stack), CR 113.7a (the ability resolves
// whatever became of its source), CR 603.10a ("whenever you sacrifice" looks back at the permanent
// as it was). Cards are SYNTHETIC (src/cards/fixtures/synthetic-followups.ts, synthetic-triggers.ts).
import { describe, expect, test } from 'vitest';
import {
  applyAction,
  type GameObject,
  type GameState,
  getLegalActions,
  stateHash,
  TOKEN_PRESETS,
} from '../src/index';
import { activationRefusal } from '../src/rules/activate-legality';
import { derive } from '../src/rules/derive';
import { type ScenarioGame, scenario } from '../src/testing/index';

const FOOD_MAKER = 'SYNTHETIC Food Maker'; // {1}{G} sorcery: create a Food token
const CLUE_MAKER = 'SYNTHETIC Clue Maker'; // {1}{U} sorcery: create a Clue token
const FEAST_SCOUT = 'SYNTHETIC Feast Scout'; // creature: when it enters, create a Food token
const LIFEGAINER = 'SYNTHETIC Sacrifice Lifegainer'; // whenever a player sacrifices a permanent: gain 1
const CREATURE_WATCHER = 'SYNTHETIC Creature Sacrifice Watcher'; // ...you sacrifice a creature: gain 1
const READER = 'SYNTHETIC Sacrifice Reader'; // whenever a player sacrifices a permanent: draw
const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;

const activations = (g: ScenarioGame, seat: 0 | 1 = 0): string[] =>
  getLegalActions(g.state, seat).flatMap((a) =>
    a.kind === 'activate' ? [`${a.object}#${a.abilityIndex}`] : [],
  );
const offers = (g: ScenarioGame, name: string, seat: 0 | 1 = 0): boolean =>
  activations(g, seat).some((s) => s.startsWith(`${g.id(name)}#`));
const tokens = (g: ScenarioGame) => Object.values(g.state.objects).filter((o) => o.token !== null);

/** Seat 0 makes a Food token with a spell paid from the pool; two Forests stay untapped. */
const withFood = () => {
  const g = scenario()
    .seat(0)
    .hand(FOOD_MAKER)
    .battlefield('Forest', 'Forest')
    .pool('CG')
    .library(...FILLER)
    .seat(1)
    .build();
  g.act(0).cast(FOOD_MAKER, { pay: true });
  g.passAll();
  return g;
};

/** The same for a Clue. */
const withClue = () => {
  const g = scenario()
    .seat(0)
    .hand(CLUE_MAKER)
    .battlefield('Island', 'Island')
    .pool('CU')
    .library('Plains', 'Island', 'Swamp', 'Mountain', 'Forest', 'Plains')
    .seat(1)
    .build();
  g.act(0).cast(CLUE_MAKER, { pay: true });
  g.passAll();
  return g;
};

describe('the presets are the predefined tokens of CR 111.10', () => {
  test('Food is a colorless Food artifact token with {2}, {T}, Sacrifice this token: gain 3 life', () => {
    const food = TOKEN_PRESETS.Food;
    expect([food.name, food.types, food.subtypes, food.colors]).toEqual([
      'Food',
      ['artifact'],
      ['Food'],
      [],
    ]);
    expect(food.abilities).toEqual([
      {
        kind: 'activated',
        cost: [
          { kind: 'mana', symbols: ['2'] },
          { kind: 'tap' },
          { kind: 'sacrifice', what: { kind: 'this' } },
        ],
        effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 3 },
      },
    ]);
    expect(food.oracleText).toBe('{2}, {T}, Sacrifice this token: You gain 3 life.');
  });

  test('Clue is a colorless Clue artifact token with {2}, Sacrifice this token: draw a card', () => {
    const clue = TOKEN_PRESETS.Clue;
    expect([clue.name, clue.types, clue.subtypes, clue.colors]).toEqual([
      'Clue',
      ['artifact'],
      ['Clue'],
      [],
    ]);
    expect(clue.abilities).toEqual([
      {
        kind: 'activated',
        cost: [
          { kind: 'mana', symbols: ['2'] },
          { kind: 'sacrifice', what: { kind: 'this' } },
        ],
        effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
      },
    ]);
    expect(clue.oracleText).toBe('{2}, Sacrifice this token: Draw a card.');
  });
});

describe('creating and eating Food (CR 111.10b)', () => {
  test('a spell makes a Food: an untapped colorless artifact token its caster owns and controls', () => {
    const g = withFood();
    g.expect.zone('Food', 'battlefield', { seat: 0, count: 1 });
    const food = g.object('Food');
    expect([food.owner, food.controller, food.tapped, food.card]).toEqual([0, 0, false, null]);
    const d = derive(g.state, food);
    expect([d.types, d.subtypes, d.colors]).toEqual([['artifact'], ['Food'], []]);
    g.expect.eventLog([{ kind: 'tokenCreated', seat: 0, name: 'Food' }]);
    g.expect.invariants();
  });

  test('a creature entering makes one too (the trigger goes through createToken)', () => {
    const g = scenario().seat(0).hand(FEAST_SCOUT).pool('CG').seat(1).build();
    g.act(0).cast(FEAST_SCOUT, { pay: true });
    g.passAll();
    g.expect.zone('Food', 'battlefield', { seat: 0, count: 1 });
  });

  test('eating it pays {2} and {T} and the sacrifice first; the life comes when it resolves', () => {
    const g = withFood();
    g.expect.life(0, 40);
    const food = g.id('Food');
    const mark = g.mark();
    g.act(0).activate('Food', { pay: true });
    // CR 602.2a, 602.2b: the costs are paid and the source is gone before anything resolves.
    g.expect.tapped({ name: 'Forest', nth: 0 });
    g.expect.tapped({ name: 'Forest', nth: 1 });
    g.expect.noObject('Food');
    g.expect.stack(['Food (ability)']);
    g.expect.life(0, 40);
    // {T} first, then the mana, then the sacrifice (D-075).
    g.expect.eventLog(
      [
        { kind: 'tapped', object: food },
        { kind: 'tapped' },
        { kind: 'tapped' },
        { kind: 'sacrificed', permanent: food, controller: 0 },
        { kind: 'abilityActivated', source: food },
      ],
      { since: mark },
    );
    g.passAll();
    g.expect.life(0, 43);
    g.expect.stack([]);
    g.expect.invariants();
  });

  test('the token ceases to exist: it is in no graveyard (CR 111.7, 704.5d)', () => {
    const g = withFood();
    g.act(0).activate('Food', { pay: true });
    g.passAll();
    expect(tokens(g)).toHaveLength(0);
    expect(g.state.seats[0]?.graveyard).toHaveLength(1); // the sorcery only
  });

  test('it is not offered with one mana, nor to the opponent', () => {
    const g = scenario().seat(0).hand(FOOD_MAKER).battlefield('Forest').pool('CG').seat(1).build();
    g.act(0).cast(FOOD_MAKER, { pay: true });
    g.passAll();
    expect(offers(g, 'Food')).toBe(false);
    g.expect.illegal(0, { activate: 'Food' });
    // With two mana it is offered to its controller and still not to the opponent.
    const two = withFood();
    expect(offers(two, 'Food')).toBe(true);
    two.act(0).pass();
    expect(offers(two, 'Food', 1)).toBe(false);
  });

  test('a tapped Food cannot pay its own {T}', () => {
    const g = withFood();
    const food = g.object('Food');
    const tapped = {
      ...g.state,
      objects: { ...g.state.objects, [food.id]: { ...food, tapped: true } },
    } as GameState;
    expect(activationRefusal(g.state, 0, food, 0)).toBeNull();
    expect(activationRefusal(tapped, 0, tapped.objects[food.id] as GameObject, 0)).toMatch(
      /already tapped/,
    );
  });

  test('two Foods are eaten one at a time, each paying its own {2}', () => {
    const g = scenario()
      .seat(0)
      .hand(FOOD_MAKER, { count: 2 })
      .battlefield('Forest', 'Forest', 'Forest', 'Forest')
      .pool('CGCG')
      .seat(1)
      .build();
    g.act(0).cast({ name: FOOD_MAKER, nth: 0 }, { pay: true });
    g.passAll();
    g.act(0).cast(FOOD_MAKER, { pay: true });
    g.passAll();
    g.expect.zone('Food', 'battlefield', { seat: 0, count: 2 });
    g.act(0).activate({ name: 'Food', nth: 0 }, { pay: true });
    g.passAll();
    g.expect.zone('Food', 'battlefield', { seat: 0, count: 1 });
    g.act(0).activate('Food', { pay: true });
    g.passAll();
    g.expect.life(0, 46);
    g.expect.noObject('Food');
  });

  test('every legal action is accepted by applyAction while a Food waits', () => {
    const g = withFood();
    for (const action of getLegalActions(g.state, 0)) {
      expect(applyAction(g.state, 0, action).ok, JSON.stringify(action)).toBe(true);
    }
  });
});

describe('creating and cracking a Clue (CR 111.10f)', () => {
  test('a spell makes a Clue; cracking it pays {2} and a sacrifice (no {T}) and draws a card', () => {
    const g = withClue();
    const d = derive(g.state, g.object('Clue'));
    expect([d.types, d.subtypes, d.colors]).toEqual([['artifact'], ['Clue'], []]);
    g.expect.handSize(0, 0);
    g.act(0).activate('Clue', { pay: true });
    g.expect.noObject('Clue');
    g.expect.tapped({ name: 'Island', zone: 'battlefield', nth: 0 });
    g.expect.tapped({ name: 'Island', zone: 'battlefield', nth: 1 });
    g.expect.stack(['Clue (ability)']);
    g.expect.handSize(0, 0);
    g.passAll();
    g.expect.handSize(0, 1);
    g.expect.librarySize(0, 5);
    expect(tokens(g)).toHaveLength(0);
    g.expect.invariants();
  });

  test('a Clue has no {T} in its cost: it can be cracked even when tapped', () => {
    const g = withClue();
    const clue = g.object('Clue');
    const tapped = {
      ...g.state,
      objects: { ...g.state.objects, [clue.id]: { ...clue, tapped: true } },
    } as GameState;
    expect(activationRefusal(tapped, 0, tapped.objects[clue.id] as GameObject, 0)).toBeNull();
  });

  test('cracking it in response to a spell still draws (CR 113.7a: the source is already gone)', () => {
    const g = scenario()
      .seat(0)
      .hand(CLUE_MAKER)
      .battlefield('Island', 'Island')
      .pool('CU')
      .library('Plains', 'Island', 'Swamp', 'Mountain', 'Forest', 'Plains')
      .seat(1)
      .hand('Lightning Bolt')
      .battlefield('Mountain')
      .build();
    g.act(0).cast(CLUE_MAKER, { pay: true });
    g.passAll();
    g.act(0).pass();
    g.act(1).cast('Lightning Bolt', { targets: [{ player: 0 }], pay: true });
    g.act(1).pass();
    g.act(0).activate('Clue', { pay: true });
    g.expect.stack(['Clue (ability)', 'Lightning Bolt']);
    g.passAll();
    g.expect.handSize(0, 1);
    g.expect.life(0, 37);
  });
});

describe('"whenever you sacrifice" sees the token sacrificed as a cost (CR 701.21, 603.10a)', () => {
  const build = (...watchers: string[]) => {
    const g = scenario()
      .seat(0)
      .hand(FOOD_MAKER)
      .battlefield(...watchers)
      .battlefield('Forest', 'Forest')
      .pool('CG')
      .library(...FILLER)
      .seat(1)
      .build();
    g.act(0).cast(FOOD_MAKER, { pay: true });
    g.passAll();
    return g;
  };

  test('a watcher of any permanent triggers when Food is sacrificed, and resolves before the Food', () => {
    const g = build(LIFEGAINER);
    g.act(0).activate('Food', { pay: true });
    g.expect.stack([`${LIFEGAINER} (ability)`, 'Food (ability)']);
    g.passAll();
    g.expect.life(0, 44); // 1 from the watcher, 3 from the Food
  });

  test('a watcher of creatures does not: the Food was an artifact when it was sacrificed', () => {
    const g = build(CREATURE_WATCHER);
    g.act(0).activate('Food', { pay: true });
    g.expect.stack(['Food (ability)']);
    g.passAll();
    g.expect.life(0, 43);
  });

  test('a Clue sacrificed makes a drawing watcher draw as well', () => {
    const g = scenario()
      .seat(0)
      .hand(CLUE_MAKER)
      .battlefield(READER, 'Island', 'Island')
      .pool('CU')
      .library('Plains', 'Island', 'Swamp', 'Mountain', 'Forest', 'Plains')
      .seat(1)
      .build();
    g.act(0).cast(CLUE_MAKER, { pay: true });
    g.passAll();
    g.act(0).activate('Clue', { pay: true });
    g.passAll();
    g.expect.handSize(0, 2); // the Reader's card and the Clue's
  });
});

describe('determinism', () => {
  test('the action log of a Food eaten replays to the same state', () => {
    const build = () =>
      scenario()
        .seat(0)
        .hand(FOOD_MAKER)
        .battlefield(LIFEGAINER, 'Forest', 'Forest')
        .pool('CG')
        .library(...FILLER)
        .seat(1)
        .build();
    const g = build();
    g.act(0).cast(FOOD_MAKER, { pay: true });
    g.passAll();
    g.act(0).activate('Food', { pay: true });
    g.passAll();
    let state: GameState = build().state;
    for (const { seat, action } of g.log) {
      const r = applyAction(state, seat, action);
      if (!r.ok) throw new Error(`replay rejected ${JSON.stringify(action)}: ${r.error}`);
      state = r.state;
    }
    expect(stateHash(state)).toBe(stateHash(g.state));
  });
});
