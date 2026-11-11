// Stage P69 (D-252, D-253): the Bruna deck program (issue 5). The lines are the real Oracle text of the acceptance cards of the golden corpus, names replaced by ~,
// with the nodes the grammar produces; the other lines are SYNTHETIC siblings and the near misses the grammar must not read.
import { describe, expect, test } from 'vitest';
import { dropped, readAll } from './parser-p5-helpers';

const GRIFFIN = {
  kind: 'createToken',
  count: 1,
  token: {
    kind: 'custom',
    definition: expect.objectContaining({
      name: 'Griffin',
      power: 2,
      toughness: 2,
      colors: ['W'],
    }),
  },
};

describe('"if you gained N or more life this turn" (D-252)', () => {
  test('Griffin Aerie', () => {
    const parsed = readAll(
      'At the beginning of your end step, if you gained 3 or more life this turn, create a 2/2 white Griffin creature token with flying.',
      'enchantment',
    );
    expect(parsed.abilities).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'endStep', whose: 'you' },
        interveningIf: { kind: 'lifeGainedThisTurn', atLeast: 3 },
        effect: GRIFFIN,
      },
    ]);
  });

  test('the threshold is the number of the text (SYNTHETIC: 5)', () => {
    const parsed = readAll(
      'At the beginning of your end step, if you gained five or more life this turn, create a 2/2 white Griffin creature token with flying.',
      'enchantment',
    );
    expect(JSON.stringify(parsed.abilities)).toContain('"atLeast":5');
  });

  test('"an opponent gained" and "gained 3 life" are not read (SYNTHETIC)', () => {
    expect(
      dropped(
        'At the beginning of your end step, if an opponent gained 3 or more life this turn, create a 2/2 white Griffin creature token with flying.',
        'enchantment',
      ).reason,
    ).toBeDefined();
    expect(
      dropped(
        'At the beginning of your end step, if you gained 3 life this turn, create a 2/2 white Griffin creature token with flying.',
        'enchantment',
      ).reason,
    ).toBeDefined();
  });
});

describe('"Otherwise," after a conditional instruction (D-253)', () => {
  test('Cosmos Elixir', () => {
    const parsed = readAll(
      'At the beginning of your end step, draw a card if your life total is greater than your starting life total. Otherwise, you gain 2 life.',
      'artifact',
    );
    expect(parsed.abilities).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'endStep', whose: 'you' },
        effect: {
          kind: 'conditional',
          condition: {
            kind: 'lifeTotal',
            compare: { cmp: 'atLeast', value: 1 },
            aboveStarting: true,
          },
          effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
          else: { kind: 'gainLife', player: { kind: 'you' }, amount: 2 },
        },
      },
    ]);
  });

  test('an "Otherwise," with no conditional before it is not read (SYNTHETIC)', () => {
    expect(
      dropped(
        'At the beginning of your end step, draw a card. Otherwise, you gain 2 life.',
        'artifact',
      ).reason,
    ).toBeDefined();
  });
});

describe('"enters with a counter on it for each time it was kicked" (D-254)', () => {
  test('Everflowing Chalice', () => {
    const parsed = readAll(
      'Multikicker {2}\n~ enters with a charge counter on it for each time it was kicked.\n{T}: Add {C} for each charge counter on ~.',
      'artifact',
    );
    expect(parsed.abilities).toContainEqual({
      kind: 'replacement',
      replacement: {
        kind: 'entersWithCounters',
        counter: 'charge',
        count: { kind: 'timesKicked' },
      },
    });
  });

  test('two counters for each time is not read (SYNTHETIC)', () => {
    expect(
      dropped(
        'Multikicker {2}\n~ enters with two charge counters on it for each time it was kicked.',
        'artifact',
      ).reason,
    ).toBeDefined();
  });
});

describe('"Creature spells of the chosen type cost {2} less to cast" (D-255)', () => {
  test("Urza's Incubator: no controller, so every player's spells", () => {
    const parsed = readAll(
      'As ~ enters, choose a creature type.\nCreature spells of the chosen type cost {2} less to cast.',
      'artifact',
    );
    expect(parsed.abilities).toContainEqual({
      kind: 'static',
      static: {
        kind: 'costReduction',
        spells: expect.objectContaining({ types: ['creature'], chosenType: true }),
        amount: 2,
      },
    });
    const reduction = parsed.abilities.find(
      (a) => a.kind === 'static' && a.static.kind === 'costReduction',
    );
    expect(JSON.stringify(reduction)).not.toContain('"controller"');
  });

  test('"you cast" keeps the controller (the older rule)', () => {
    const parsed = readAll(
      'As ~ enters, choose a creature type.\nCreature spells of the chosen type you cast cost {2} less to cast.',
      'artifact',
    );
    expect(JSON.stringify(parsed.abilities)).toContain('"controller":"you"');
  });

  test('without "of the chosen type" the line is not read (SYNTHETIC)', () => {
    expect(dropped('Creature spells cost {2} less to cast.', 'artifact').reason).toBeDefined();
  });
});

describe('"if that player controls more creatures than you" at the beginning of an opponent\'s step (Keeper of the Accord)', () => {
  const KEEPER_TEXT =
    "At the beginning of each opponent's end step, if that player controls more creatures than you, create a 1/1 white Soldier creature token.\nAt the beginning of each opponent's end step, if that player controls more lands than you, you may search your library for a basic Plains card, put it onto the battlefield tapped, then shuffle.";

  test('Keeper of the Accord: the player of the step is the player of the condition', () => {
    const parsed = readAll(KEEPER_TEXT, 'creature');
    expect(parsed.abilities).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'step', step: 'endStep', whose: 'opponent' },
        interveningIf: { kind: 'triggerPlayerHasMore', stat: 'creatures' },
        effect: {
          kind: 'createToken',
          count: 1,
          token: {
            kind: 'custom',
            definition: expect.objectContaining({
              name: 'Soldier',
              power: 1,
              toughness: 1,
              colors: ['W'],
            }),
          },
        },
      },
      {
        kind: 'triggered',
        trigger: { kind: 'step', step: 'endStep', whose: 'opponent' },
        interveningIf: { kind: 'triggerPlayerHasMore', stat: 'lands' },
        optional: true,
        effect: {
          kind: 'search',
          player: { kind: 'you' },
          filter: { supertypes: ['basic'], subtypes: ['Plains'] },
          max: 1,
          destinations: [{ zone: 'battlefield', tapped: true, count: 1 }],
          reveal: false,
          shuffle: true,
        },
      },
    ]);
  });

  test("an opponent's upkeep reads the same (SYNTHETIC)", () => {
    const parsed = readAll(
      "At the beginning of each opponent's upkeep, if that player controls more lands than you, that player loses 1 life.",
      'enchantment',
    );
    expect(parsed.abilities).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'step', step: 'upkeep', whose: 'opponent' },
        interveningIf: { kind: 'triggerPlayerHasMore', stat: 'lands' },
        effect: { kind: 'loseLife', player: { kind: 'triggerPlayer' }, amount: 1 },
      },
    ]);
  });

  test('each player\'s upkeep: the active player is "that player" (SYNTHETIC)', () => {
    const parsed = readAll(
      "At the beginning of each player's upkeep, if that player controls more creatures than you, that player loses 1 life.",
      'enchantment',
    );
    expect(JSON.stringify(parsed.abilities)).toContain('"triggerPlayerHasMore"');
  });

  test("a trigger about a permanent keeps the controller of that permanent (Archaeomancer's Map)", () => {
    const parsed = readAll(
      'Whenever a land an opponent controls enters, if that player controls more lands than you, you may put a land card from your hand onto the battlefield.',
      'artifact',
    );
    expect(JSON.stringify(parsed.abilities)).toContain('"subjectControllerHasMore"');
    expect(JSON.stringify(parsed.abilities)).not.toContain('"triggerPlayerHasMore"');
  });

  test('"that player" of your own step is you, which is no comparison: not read (SYNTHETIC)', () => {
    expect(
      dropped(
        'At the beginning of your end step, if that player controls more creatures than you, create a 1/1 white Soldier creature token.',
        'enchantment',
      ).reason,
    ).toBeDefined();
  });

  test('another count, "at least as many" and "an opponent controls" are not read (SYNTHETIC)', () => {
    for (const condition of [
      'that player controls more cards than you',
      'that player controls at least as many creatures as you',
    ]) {
      expect(
        dropped(
          `At the beginning of each opponent's end step, if ${condition}, create a 1/1 white Soldier creature token.`,
          'enchantment',
        ).reason,
      ).toBeDefined();
    }
  });
});
