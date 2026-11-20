// Speed and the requirement of one combat (issue 144): Start your engines! (CR 702.179a), "Max speed — [ability]" (CR 702.178a: the ability as long as the speed is 4) and
// "That token attacks this combat if able" (CR 508.1d, 506.1). The lines are the real Oracle text of the issue (names replaced by ~) with the nodes the grammar produces; the near
// misses are SYNTHETIC.
import { describe, expect, test } from 'vitest';
import { dropped, readAll } from './parser-p5-helpers';

const MAX_SPEED = { kind: 'maxSpeed', player: { kind: 'you' } };

describe('Start your engines! (CR 702.179a)', () => {
  test('the keyword, with and without its reminder text', () => {
    expect(readAll('Start your engines!', 'creature').abilities).toEqual([
      { kind: 'keyword', keyword: { kind: 'startYourEngines' } },
    ]);
    expect(
      readAll(
        'Start your engines! (Your speed starts at 1. It increases once on each of your turns when an opponent loses life. Max speed is 4.)',
        'creature',
      ).abilities,
    ).toEqual([{ kind: 'keyword', keyword: { kind: 'startYourEngines' } }]);
  });

  test('without the exclamation mark, or with anything after it, it is not the keyword (SYNTHETIC)', () => {
    expect(dropped('Start your engines', 'creature').reason).toBeDefined();
    expect(dropped('Start your engines!, flying', 'creature').reason).toBeDefined();
  });
});

describe('"Max speed — [ability]" (CR 702.178a)', () => {
  test('a mana ability is limited to max speed', () => {
    expect(
      readAll('Max speed — {T}: Add {R} for each Goblin you control.', 'creature', ['Goblin'])
        .abilities,
    ).toEqual([
      {
        kind: 'mana',
        cost: [{ kind: 'tap' }],
        production: {
          kind: 'fixed',
          mana: ['R'],
          times: { kind: 'countOf', filter: { subtypes: ['Goblin'], controller: 'you' } },
        },
        activateOnlyIf: MAX_SPEED,
      },
    ]);
  });

  test('an activated ability and a static ability take the condition', () => {
    const activated = readAll('Max speed — {1}, {T}: Draw a card.', 'artifact').abilities;
    expect(activated).toEqual([
      {
        kind: 'activated',
        cost: [{ kind: 'mana', symbols: ['1'] }, { kind: 'tap' }],
        effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
        activateOnlyIf: MAX_SPEED,
      },
    ]);
    const granted = readAll('Max speed — Other Goblins you control have haste.', 'creature', [
      'Goblin',
    ]).abilities;
    expect(granted).toEqual([
      {
        kind: 'static',
        static: {
          kind: 'grantKeyword',
          subject: {
            kind: 'filter',
            filter: { subtypes: ['Goblin'], controller: 'you' },
            other: true,
          },
          keyword: { kind: 'haste' },
        },
        condition: MAX_SPEED,
      },
    ]);
  });

  test('the condition joins an activation restriction the ability already has', () => {
    const [ability] = readAll(
      "Max speed — {2}, {T}: Draw a card. Activate only if you have the city's blessing.",
      'artifact',
    ).abilities;
    expect(ability?.kind === 'activated' && ability.activateOnlyIf?.kind).toBe('and');
  });

  test('a triggered ability, a keyword or a spell with the label is not read: the engine has no condition for it', () => {
    expect(dropped('Max speed — Whenever ~ attacks, draw a card.', 'creature').reason).toBe(
      'notRunnable',
    );
    expect(dropped('Max speed — Flying', 'creature').reason).toBe('notRunnable');
  });

  test('the label is not a flavor word: a line that does not read stays unread (SYNTHETIC)', () => {
    expect(dropped('Max speed — Fly like the wind.', 'creature').reason).toBe('unrecognised');
  });
});

describe('"That token attacks this combat if able" (CR 508.1d, 506.1, 611.2a)', () => {
  const TOKEN = {
    kind: 'createToken',
    token: {
      kind: 'custom',
      definition: {
        name: 'Goblin',
        manaCost: null,
        supertypes: [],
        types: ['creature'],
        subtypes: ['Goblin'],
        colors: ['R'],
        power: 1,
        toughness: 1,
        loyalty: null,
        defense: null,
        oracleText: '',
        abilities: [],
      },
    },
    count: 1,
  };

  test('the token the sentence before made must attack, for the combat only', () => {
    expect(
      readAll(
        'At the beginning of combat on your turn, create a 1/1 red Goblin creature token. That token attacks this combat if able.',
        'creature',
      ).abilities,
    ).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'step', step: 'beginCombat', whose: 'you' },
        effect: {
          kind: 'sequence',
          effects: [
            TOKEN,
            {
              kind: 'restrict',
              objects: { kind: 'moved' },
              restriction: 'attacksEachCombat',
              duration: 'thisCombat',
            },
          ],
        },
      },
    ]);
  });

  test('"this turn" and "each combat" are other lines, and the sentence is not read when it names no token before it (SYNTHETIC)', () => {
    expect(
      dropped(
        'At the beginning of combat on your turn, create a 1/1 red Goblin creature token. That token attacks each combat if able.',
        'creature',
      ).reason,
    ).toBeDefined();
    expect(
      dropped(
        'At the beginning of combat on your turn, that token attacks this combat if able.',
        'creature',
      ).reason,
    ).toBeDefined();
  });
});
