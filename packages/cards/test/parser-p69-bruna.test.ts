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

describe('"sacrifice it unless you return an untapped Plains you control to its owner\'s hand" (D-258)', () => {
  const OFFER = {
    kind: 'may',
    effect: {
      kind: 'moveToZone',
      objects: {
        kind: 'choose',
        filter: { subtypes: ['Plains'], controller: 'you', tapped: false },
      },
      to: 'hand',
    },
  };
  const IF_NOT = {
    kind: 'conditional',
    condition: { kind: 'not', term: { kind: 'didPrevious' } },
    effect: { kind: 'sacrifice', objects: { kind: 'this' } },
  };

  test('Karoo: the offer, then the sacrifice when it was not made', () => {
    const parsed = readAll(
      "~ enters tapped.\nWhen ~ enters, sacrifice it unless you return an untapped Plains you control to its owner's hand.\n{T}: Add {C}{W}.",
      'land',
    );
    expect(parsed.abilities).toEqual([
      { kind: 'replacement', replacement: { kind: 'entersTapped' } },
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        effect: { kind: 'sequence', effects: [OFFER, IF_NOT] },
      },
      { kind: 'mana', cost: [{ kind: 'tap' }], production: { kind: 'fixed', mana: ['C', 'W'] } },
    ]);
  });

  test('the land type and "untapped" are the text\'s (SYNTHETIC: a Forest, no "untapped")', () => {
    const parsed = readAll(
      "When ~ enters, sacrifice it unless you return a Forest you control to its owner's hand.",
      'land',
    );
    const text = JSON.stringify(parsed.abilities);
    expect(text).toContain('"subtypes":["Forest"]');
    expect(text).not.toContain('"tapped"');
  });

  test('other wordings are not read (SYNTHETIC)', () => {
    for (const line of [
      "When ~ enters, sacrifice it unless you return a land to its owner's hand.",
      "When ~ enters, sacrifice it unless you return ~ to its owner's hand.",
      "When ~ enters, sacrifice it unless an opponent returns a land you control to its owner's hand.",
      'When ~ enters, sacrifice it unless you return an untapped Plains you control to your hand.',
    ]) {
      expect(dropped(line, 'land').reason, line).toBeDefined();
    }
  });
});
