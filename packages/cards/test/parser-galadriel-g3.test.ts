// The Galadriel deck (issue 43), group 3: the lines of Mystic Speculation, Netherese Puzzle-Ward, Eyes Everywhere, Jace, Mirror Mage, Koma, Cosmos Serpent, Repulsive Mutation and Defend the Rider.
// The first lines of each block are the real Oracle text of the acceptance cards of the golden corpus read through the whole pipeline; the other lines are SYNTHETIC variants and the near
// misses the grammar must not read. The engine runs what is lowered in convert-grammar-engine-galadriel-g3.test.ts.
import { describe, expect, test, vi } from 'vitest';

vi.mock('@commander-arena/engine', async (importOriginal) =>
  (await import('./blocked-features')).blockFeatures(
    await importOriginal<typeof import('@commander-arena/engine')>(),
  ),
);

import { DECLARED_NEEDS, DEFAULT_RULES, parseFaceText } from '../src/convert/parser/index';
import { dropped, OPTS, readAll, read as readFace, withoutFeature } from './parser-p5-helpers';

const NOT_READ = (text: string, type: Parameters<typeof readFace>[1] = 'creature') => {
  const parsed = readFace(text, type);
  expect(parsed.spell, text).toBeNull();
  expect(parsed.abilities, text).toEqual([]);
  expect(parsed.unparsed, text).toHaveLength(1);
};

/** A planeswalker face: the loyalty abilities are read only on one. */
const walker = (text: string) =>
  parseFaceText(text, OPTS, 0, DEFAULT_RULES, [], ['planeswalker'], ['Jace']);

const T1 = { kind: 'target', id: 't1' } as const;
const THIS = { kind: 'this' } as const;
const YOU = { kind: 'you' } as const;

describe('"Buyback {2}" (CR 702.27a)', () => {
  test('the real line of Mystic Speculation', () => {
    expect(readAll('Buyback {2}', 'sorcery').abilities).toEqual([
      { kind: 'keyword', keyword: { kind: 'buyback', cost: [{ kind: 'mana', symbols: ['2'] }] } },
    ]);
  });

  test('another cost; the lines that are not buyback are not read', () => {
    expect(readAll('Buyback {1}{U}', 'sorcery').abilities).toMatchObject([
      { keyword: { kind: 'buyback', cost: [{ kind: 'mana', symbols: ['1', 'U'] }] } },
    ]);
    for (const line of [
      'Buyback',
      'Buyback {X}',
      'Buyback—Pay 2 life.',
      'Buyback {2}, buyback {1}',
      'Flying, buyback {2}',
      'buyback {2}.',
    ]) {
      NOT_READ(line, 'sorcery');
    }
  });

  test('the line names the feature the engine lacks (D-068)', () => {
    const missing = withoutFeature('keyword:buyback', 'Buyback {2}', 'sorcery');
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toContain('keyword:buyback');
    expect(DECLARED_NEEDS).toContain('keyword:buyback');
  });
});

describe('"Roll a d4. Scry X, where X is the result." and "Whenever you roll a die\'s highest natural result" (CR 706.1a, 706.2)', () => {
  test('the real line of the Focus Beam: the scry reads the result of the roll', () => {
    expect(
      readAll(
        'Focus Beam — At the beginning of your upkeep, roll a d4. Scry X, where X is the result.',
        'enchantment',
      ).abilities,
    ).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'upkeep', whose: 'you' },
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'rollDie', sides: 4 },
            { kind: 'scry', count: { kind: 'dieResult' } },
          ],
        },
      },
    ]);
  });

  test('another number of sides and another effect that reads the result (SYNTHETIC)', () => {
    expect(
      readAll(
        'At the beginning of your upkeep, roll a d6. You gain X life, where X is the result.',
        'enchantment',
      ).abilities,
    ).toMatchObject([
      {
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'rollDie', sides: 6 },
            { kind: 'gainLife', amount: { kind: 'dieResult' } },
          ],
        },
      },
    ]);
  });

  test('a result with no roll before it in the text is not read', () => {
    NOT_READ('At the beginning of your upkeep, scry X, where X is the result.', 'enchantment');
    NOT_READ(
      'At the beginning of your upkeep, scry X, where X is the result. Roll a d4.',
      'enchantment',
    );
  });

  test('the real trigger of the Perfect Illumination', () => {
    expect(
      readAll(
        "Perfect Illumination — Whenever you roll a die's highest natural result, draw a card.",
        'enchantment',
      ).abilities,
    ).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'rollsHighest', who: 'you' },
        effect: { kind: 'draw', player: YOU, count: 1 },
      },
    ]);
  });

  test('an opponent and a player, with the verb of a third person (SYNTHETIC); the near misses are not read', () => {
    expect(
      readAll(
        'Whenever an opponent rolls a die’s highest natural result, you gain 1 life.',
        'enchantment',
      ).abilities,
    ).toMatchObject([{ trigger: { kind: 'rollsHighest', who: 'opponent' } }]);
    expect(
      readAll(
        'Whenever a player rolls a die’s highest natural result, you gain 1 life.',
        'enchantment',
      ).abilities,
    ).toMatchObject([{ trigger: { kind: 'rollsHighest', who: 'any' } }]);
    for (const line of [
      'Whenever you roll a die, draw a card.',
      'Whenever you roll a die’s lowest natural result, draw a card.',
      'Whenever you roll a die’s highest result, draw a card.',
      'Whenever you rolled a die’s highest natural result, draw a card.',
      'Whenever an opponent roll a die’s highest natural result, draw a card.',
      'Whenever you roll one or more dice, draw a card.',
    ]) {
      NOT_READ(line, 'enchantment');
    }
  });

  test('the lines name the features the engine lacks (D-068)', () => {
    const roll = 'At the beginning of your upkeep, roll a d4. Scry X, where X is the result.';
    for (const [feature, line] of [
      ['amount:dieResult', roll],
      ['trigger:rollsHighest', 'Whenever you roll a die’s highest natural result, draw a card.'],
    ] as const) {
      const missing = withoutFeature(feature, line, 'enchantment');
      expect(missing, line).toMatchObject({ reason: 'notRunnable' });
      expect(missing.needs).toContain(feature);
      expect(DECLARED_NEEDS).toContain(feature);
    }
  });
});

describe('"Exchange control of ~ and target nonland permanent." (CR 701.12)', () => {
  const ABILITY =
    '{5}{U}: Exchange control of ~ and target nonland permanent. Activate only as a sorcery.';

  test('the real ability of Eyes Everywhere: the permanent itself and one target, at sorcery speed', () => {
    expect(readAll(ABILITY, 'enchantment').abilities).toEqual([
      {
        kind: 'activated',
        cost: [{ kind: 'mana', symbols: ['5', 'U'] }],
        targets: [
          {
            id: 't1',
            what: { kind: 'object', filter: { zone: 'battlefield', notTypes: ['land'] } },
          },
        ],
        effect: { kind: 'exchangeControl', first: THIS, second: T1 },
        timing: 'sorcery',
      },
    ]);
  });

  test('a spell with the same words and another kind of target (SYNTHETIC)', () => {
    // A spell has no permanent of its own: `~` cannot be exchanged, so the engine refuses it and the line stays unread.
    NOT_READ('Exchange control of ~ and target creature.', 'sorcery');
    expect(
      readAll('{2}, {T}: Exchange control of ~ and target creature.', 'artifact').abilities,
    ).toMatchObject([{ effect: { kind: 'exchangeControl', first: THIS, second: T1 } }]);
  });

  test('the near misses are not read', () => {
    for (const line of [
      '{5}{U}: Exchange control of target creature and target creature.',
      '{5}{U}: Exchange control of two target creatures.',
      '{5}{U}: Exchange control of ~.',
      '{5}{U}: Exchange control of ~ and target creatures.',
      '{5}{U}: Exchange control of ~ and up to one target creature.',
      '{5}{U}: Exchange control of ~ and target player.',
      '{5}{U}: Exchange control of ~ and target creature until end of turn.',
    ]) {
      NOT_READ(line, 'enchantment');
    }
  });

  test('the line names the feature the engine lacks (D-068)', () => {
    const missing = withoutFeature('effect:exchangeControl', ABILITY, 'enchantment');
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toContain('effect:exchangeControl');
    expect(DECLARED_NEEDS).toContain('effect:exchangeControl');
  });
});

describe('Jace, Mirror Mage: the copy and the 0 ability (CR 707.9b, 701.20a, 122.1)', () => {
  const COPY =
    "When ~ enters, if ~ was kicked, create a token that's a copy of ~, except it's not legendary and its starting loyalty is 1.";

  test('the real enters trigger of Jace: a copy that is not legendary and starts with loyalty 1', () => {
    expect(walker(COPY).unparsed).toEqual([]);
    expect(walker(COPY).abilities).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: THIS },
        interveningIf: { kind: 'kicked' },
        effect: {
          kind: 'createToken',
          token: { kind: 'copyOf', object: THIS, notLegendary: true, startingLoyalty: 1 },
          count: 1,
        },
      },
    ]);
  });

  test('"not legendary" alone, and another starting loyalty (SYNTHETIC)', () => {
    expect(
      readAll(
        'When ~ enters, create a token that’s a copy of ~, except it’s not legendary.',
        'creature',
      ).abilities,
    ).toMatchObject([
      {
        effect: {
          token: { kind: 'copyOf', notLegendary: true },
        },
      },
    ]);
    const loyal = walker(
      'When ~ enters, create a token that’s a copy of ~, except it’s not legendary and its starting loyalty is 3.',
    );
    expect(loyal.abilities).toMatchObject([
      { effect: { token: { notLegendary: true, startingLoyalty: 3 } } },
    ]);
  });

  test('the near misses are not read', () => {
    for (const line of [
      'When ~ enters, create a token that’s a copy of ~, except its starting loyalty is 1.',
      'When ~ enters, create a token that’s a copy of ~, except it’s not legendary and its starting loyalty is one.',
      'When ~ enters, create a token that’s a copy of ~, except it’s not legendary and has haste.',
      'When ~ enters, create a token that’s a copy of ~, except it’s legendary.',
      'When ~ enters, create two tokens that are copies of ~, except they’re not legendary.',
      'When ~ enters, create a tapped token that’s a copy of ~, except it’s not legendary.',
    ]) {
      NOT_READ(line, 'creature');
    }
  });

  const ZERO =
    "0: Draw a card and reveal it. Remove a number of loyalty counters equal to that card's mana value from ~.";

  test('the real 0 ability: the card is drawn and revealed and Jace loses loyalty equal to its mana value', () => {
    expect(walker(ZERO).unparsed).toEqual([]);
    expect(walker(ZERO).abilities).toEqual([
      {
        kind: 'activated',
        cost: [{ kind: 'loyalty', change: 0 }],
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'draw', player: YOU, count: 1, reveal: true },
            {
              kind: 'removeCounters',
              objects: THIS,
              counter: 'loyalty',
              count: { kind: 'manaValueOf', of: { kind: 'moved' } },
            },
          ],
        },
      },
    ]);
  });

  test('the sentences are one instruction: apart they are not read', () => {
    NOT_READ('Draw a card and reveal it.', 'instant');
    NOT_READ(
      "Remove a number of loyalty counters equal to that card's mana value from ~.",
      'instant',
    );
  });

  test('the near misses of the 0 ability are not read', () => {
    for (const line of [
      '0: Draw two cards and reveal them. Remove a number of loyalty counters equal to that card’s mana value from ~.',
      '0: Draw a card. Remove a number of loyalty counters equal to that card’s mana value from ~.',
      '0: Draw a card and reveal it. Remove a number of loyalty counters equal to its mana value from ~.',
      '0: Draw a card and reveal it. Remove a number of loyalty counters equal to that card’s power from ~.',
      '0: Draw a card and reveal it. Remove a number of loyalty counters equal to that card’s mana value from target planeswalker.',
      '0: Draw a card and reveal it. Remove two loyalty counters from ~.',
    ]) {
      const parsed = walker(line);
      expect(parsed.abilities, line).toEqual([]);
      expect(parsed.unparsed.length, line).toBeGreaterThan(0);
    }
  });

  test('the lines name the features the engine lacks (D-068)', () => {
    for (const feature of ['effect:removeCounters', 'selector:moved', 'token:copyExceptions']) {
      expect(DECLARED_NEEDS, feature).toContain(feature);
    }
    for (const feature of ['effect:removeCounters', 'selector:moved']) {
      const blocked = withoutFeature(feature, ZERO.replace(/^0: /, '{T}: '), 'artifact');
      expect(blocked, feature).toMatchObject({ reason: 'notRunnable' });
      expect(blocked.needs, feature).toContain(feature);
    }
    const copy = withoutFeature(
      'token:copyExceptions',
      'When ~ enters, create a token that’s a copy of ~, except it’s not legendary.',
      'creature',
    );
    expect(copy).toMatchObject({ reason: 'notRunnable' });
    expect(copy.needs).toContain('token:copyExceptions');
  });
});

describe('"Tap target permanent. Its activated abilities can\'t be activated this turn." (CR 602.5, 605.1a)', () => {
  const MODAL =
    "Sacrifice another Serpent: Choose one —\n• Tap target permanent. Its activated abilities can't be activated this turn.\n• ~ gains indestructible until end of turn.";

  test('the real ability of Koma: two modes, the first taps and stops the abilities of the target', () => {
    const { abilities } = readAll(MODAL, 'creature', ['Serpent']);
    expect(abilities).toMatchObject([
      {
        kind: 'activated',
        cost: [{ kind: 'sacrifice', what: { subtypes: ['Serpent'], other: true } }],
        chooseModes: { min: 1, max: 1 },
        modes: [
          {
            targets: [{ id: 't1', what: { kind: 'object', filter: { zone: 'battlefield' } } }],
            effect: {
              kind: 'sequence',
              effects: [
                { kind: 'tap', objects: T1 },
                {
                  kind: 'restrict',
                  objects: T1,
                  restriction: 'cantActivateAbilities',
                  duration: 'untilEndOfTurn',
                },
              ],
            },
          },
          {
            effect: {
              kind: 'grantKeyword',
              objects: THIS,
              keyword: { kind: 'indestructible' },
              duration: 'untilEndOfTurn',
            },
          },
        ],
      },
    ]);
  });

  test('as the text of a spell, with another kind of permanent (SYNTHETIC)', () => {
    expect(
      readAll(
        "Tap target creature. Its activated abilities can't be activated this turn.",
        'instant',
      ).spell,
    ).toEqual({
      targets: [
        {
          id: 't1',
          what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
        },
      ],
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'tap', objects: T1 },
          {
            kind: 'restrict',
            objects: T1,
            restriction: 'cantActivateAbilities',
            duration: 'untilEndOfTurn',
          },
        ],
      },
    });
  });

  test('the near misses are not read', () => {
    for (const line of [
      "Its activated abilities can't be activated this turn.",
      "Tap target permanent. Its activated abilities can't be activated.",
      "Tap target permanent. Its activated abilities can't be activated until end of turn.",
      "Tap target permanent. Its triggered abilities can't be activated this turn.",
      "Tap target permanent. Their activated abilities can't be activated this turn.",
      "Tap target permanent. Target creature's activated abilities can't be activated this turn.",
      "Tap target permanent. Its activated abilities can't be activated this turn and it can't attack.",
    ]) {
      NOT_READ(line, 'instant');
    }
  });

  test('the line names the feature the engine lacks (D-068)', () => {
    const missing = withoutFeature(
      'effect:restrict',
      "Tap target permanent. Its activated abilities can't be activated this turn.",
      'instant',
    );
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toContain('effect:restrict');
  });
});

describe('"Counter up to one target spell unless its controller pays mana equal to ..." (CR 118.12a, 608.2c)', () => {
  const SPELL =
    'Put X +1/+1 counters on target creature you control. Then counter up to one target spell unless its controller pays mana equal to the greatest power among creatures you control.';
  const POWER = {
    kind: 'aggregate',
    how: 'greatest',
    stat: 'power',
    filter: { types: ['creature'], controller: 'you' },
  };

  test('the real text of Repulsive Mutation: two targets, the second optional, the counters first', () => {
    expect(readAll(SPELL, 'instant').spell).toEqual({
      targets: [
        {
          id: 't1',
          what: {
            kind: 'object',
            filter: { zone: 'battlefield', types: ['creature'], controller: 'you' },
          },
        },
        {
          id: 't2',
          what: { kind: 'object', filter: { zone: 'stack', stackKind: 'spell' } },
          min: 0,
          max: 1,
        },
      ],
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'addCounters', objects: T1, counter: '+1/+1', count: { kind: 'x' } },
          {
            kind: 'counterUnlessPays',
            objects: { kind: 'target', id: 't2' },
            cost: [],
            genericAmount: POWER,
          },
        ],
      },
      x: true,
    });
  });

  test('a plain counter with the same payment, and another amount (SYNTHETIC)', () => {
    expect(
      readAll(
        'Counter target spell unless its controller pays mana equal to the greatest power among creatures you control.',
        'instant',
      ).spell,
    ).toMatchObject({
      targets: [
        { id: 't1', what: { kind: 'object', filter: { zone: 'stack', stackKind: 'spell' } } },
      ],
      effect: { kind: 'counterUnlessPays', cost: [], genericAmount: POWER },
    });
    expect(
      readAll(
        'Counter target spell unless its controller pays mana equal to the number of creatures you control.',
        'instant',
      ).spell,
    ).toMatchObject({
      effect: {
        kind: 'counterUnlessPays',
        genericAmount: { kind: 'countOf', filter: { types: ['creature'], controller: 'you' } },
      },
    });
  });

  test('"up to one target spell" takes the same phrases as "target spell"', () => {
    expect(
      readAll(
        'Counter up to one target noncreature spell unless its controller pays mana equal to the greatest power among creatures you control.',
        'instant',
      ).spell,
    ).toMatchObject({
      targets: [
        {
          id: 't1',
          what: {
            kind: 'object',
            filter: { zone: 'stack', stackKind: 'spell', notTypes: ['creature'] },
          },
          min: 0,
          max: 1,
        },
      ],
    });
  });

  test('the near misses are not read', () => {
    for (const line of [
      'Counter target spell unless its controller pays mana.',
      'Counter target spell unless its controller pays mana equal to 3.',
      'Counter target spell unless that player pays mana equal to the greatest power among creatures you control.',
      'Counter target spell unless you pay mana equal to the greatest power among creatures you control.',
      'Counter target spell unless its controller pays life equal to the greatest power among creatures you control.',
      'Counter up to two target spells unless its controller pays mana equal to the greatest power among creatures you control.',
      'Counter target spell or ability unless its controller pays mana equal to the greatest power among creatures you control.',
    ]) {
      NOT_READ(line, 'instant');
    }
  });

  test('the older "unless its controller pays {3}" and "up to one target" are read as before', () => {
    expect(
      readAll('Counter target spell unless its controller pays {3}.', 'instant').spell,
    ).toMatchObject({
      effect: { kind: 'counterUnlessPays', cost: [{ kind: 'mana', symbols: ['3'] }] },
    });
    NOT_READ('Counter up to one target spell unless its controller pays {3}.', 'instant');
  });

  test('the engine feature of the amount is named when it is missing (D-068)', () => {
    const missing = withoutFeature('amount:aggregate', SPELL, 'instant');
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toContain('amount:aggregate');
    expect(dropped(SPELL.replace('Put X', 'Draw X'), 'instant')).toBeDefined();
  });
});

describe('"~ saddles Mounts and crews Vehicles as though its power were 2 greater." and the Pilot token (CR 702.122a, 702.171a)', () => {
  const PILOT =
    'Create a 1/1 colorless Pilot creature token with "~ saddles Mounts and crews Vehicles as though its power were 2 greater."';

  test('the real token of Defend the Rider: a 1/1 colorless Pilot with the bonus as its own static ability', () => {
    expect(readAll(PILOT, 'instant').spell).toEqual({
      effect: {
        kind: 'createToken',
        token: {
          kind: 'custom',
          definition: {
            name: 'Pilot',
            manaCost: null,
            supertypes: [],
            types: ['creature'],
            subtypes: ['Pilot'],
            colors: [],
            power: 1,
            toughness: 1,
            loyalty: null,
            defense: null,
            oracleText:
              'This creature saddles Mounts and crews Vehicles as though its power were 2 greater.',
            abilities: [{ kind: 'static', static: { kind: 'crewSaddleBonus', amount: 2 } }],
          },
        },
        count: 1,
      },
    });
  });

  test('on a creature of its own, with another number (SYNTHETIC)', () => {
    expect(
      readAll('~ saddles Mounts and crews Vehicles as though its power were 3 greater.', 'creature')
        .abilities,
    ).toEqual([{ kind: 'static', static: { kind: 'crewSaddleBonus', amount: 3 } }]);
  });

  test('the first mode of Defend the Rider, and the two modes together', () => {
    const real = readAll(
      `Choose one —\n• Target permanent you control gains hexproof and indestructible until end of turn.\n• ${PILOT}`,
      'instant',
    );
    expect(real.spell?.chooseModes).toEqual({ min: 1, max: 1 });
    expect(real.spell?.modes).toHaveLength(2);
    expect(JSON.stringify(real.spell?.modes?.[1])).toContain('crewSaddleBonus');
  });

  test('another static ability of a token and the near misses are not read', () => {
    for (const line of [
      'Create a 1/1 colorless Pilot creature token with "Creatures you control get +1/+1."',
      'Create a 1/1 colorless Pilot creature token with "~ crews Vehicles as though its power were 2 greater."',
      'Create a 1/1 colorless Pilot creature token with "~ saddles Mounts and crews Vehicles as though its power were two greater."',
      'Create a 1/1 colorless Pilot creature token with "~ saddles Mounts and crews Vehicles as though its power were 2 less."',
      '~ saddles Mounts and crews Vehicles as though its power were 2 greater until end of turn.',
      'Creatures you control saddle Mounts and crew Vehicles as though their power were 2 greater.',
    ]) {
      const type = line.startsWith('Create') ? 'instant' : 'creature';
      const parsed = readFace(line, type);
      expect(
        parsed.spell?.effect?.kind === 'createToken' &&
          JSON.stringify(parsed.spell).includes('crewSaddleBonus'),
        line,
      ).toBe(false);
      expect(
        parsed.abilities.some((a) => JSON.stringify(a).includes('crewSaddleBonus')),
        line,
      ).toBe(false);
    }
  });

  test('the engine feature is named when it is missing (D-068)', () => {
    const missing = withoutFeature(
      'static:crewSaddleBonus',
      '~ saddles Mounts and crews Vehicles as though its power were 2 greater.',
      'creature',
    );
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toContain('static:crewSaddleBonus');
    expect(DECLARED_NEEDS).toContain('static:crewSaddleBonus');
  });
});
