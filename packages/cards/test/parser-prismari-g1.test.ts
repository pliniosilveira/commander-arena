// The Prismari deck (issue 87), group 1 (D-638 to D-645): the lines of Brudiclad, Determined Iteration, Redoubled Stormsinger, Rionya, Rite of Replication, Twinflame, Muddle, Inspired
// Skypainter // Maestro's Gift and Dirgur Focusmage // Braingeyser. The first line of each block is the real Oracle text of the acceptance card read through the whole pipeline; the other
// lines are SYNTHETIC siblings and the near misses the grammar must not read (an instruction about "those tokens" with no tokens made before it, a duration or exception it does not
// know, another zone). The engine runs what is lowered in convert-grammar-engine-prismari-g1.test.ts.
import { describe, expect, test, vi } from 'vitest';

vi.mock('@commander-arena/engine', async (importOriginal) =>
  (await import('./blocked-features')).blockFeatures(
    await importOriginal<typeof import('@commander-arena/engine')>(),
  ),
);

import { read, readAll } from './parser-p5-helpers';

const NOT_READ = (text: string, type: Parameters<typeof read>[1] = 'creature') => {
  const parsed = read(text, type);
  expect(parsed.abilities, text).toEqual([]);
  expect(parsed.spell ?? null, text).toBeNull();
  expect(parsed.unparsed, text).toHaveLength(1);
};

const MOVED = { kind: 'moved' } as const;
const HASTE = { kind: 'keyword', keyword: { kind: 'haste' } } as const;
const AT_END = (action: 'sacrifice' | 'exile') =>
  ({
    kind: 'delayedTrigger',
    at: { step: 'endStep', whose: 'each' },
    effect: { kind: action, objects: MOVED },
  }) as const;
const COMBAT = { kind: 'step', step: 'beginCombat', whose: 'you' } as const;

describe('Determined Iteration: populate, the haste of the token, its sacrifice (CR 701.36, 603.7c)', () => {
  const REAL =
    'At the beginning of combat on your turn, populate. The token created this way gains haste. Sacrifice it at the beginning of the next end step.';

  test('the real line: populate, haste for good, a delayed sacrifice of the tokens made', () => {
    const parsed = readAll(REAL, 'enchantment');
    expect(parsed.abilities).toEqual([
      {
        kind: 'triggered',
        trigger: COMBAT,
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'populate' },
            {
              kind: 'grantKeyword',
              objects: MOVED,
              keyword: { kind: 'haste' },
              duration: 'permanent',
            },
            AT_END('sacrifice'),
          ],
        },
      },
    ]);
  });

  test('populate alone', () => {
    readAll('At the beginning of your upkeep, populate.', 'enchantment');
  });

  test('not read: the tokens of nothing ("They gain haste." after a life gain), another object', () => {
    NOT_READ(
      'At the beginning of combat on your turn, you gain 1 life. They gain haste.',
      'enchantment',
    );
    NOT_READ(
      'At the beginning of combat on your turn, populate. Sacrifice it at the beginning of your next end step.',
      'enchantment',
    );
    NOT_READ(
      'At the beginning of combat on your turn, destroy target creature. Sacrifice it at the beginning of the next end step.',
      'enchantment',
    );
    NOT_READ(
      'At the beginning of combat on your turn, populate twice. The token created this way gains haste.',
      'enchantment',
    );
  });
});

describe('Rite of Replication: kicker, a copy of target creature, five of those tokens instead (CR 702.33a, 707.2)', () => {
  const REAL =
    "Create a token that's a copy of target creature. If ~ was kicked, create five of those tokens instead.";
  const COPY = { kind: 'copyOf', object: { kind: 'target', id: 't1' } } as const;

  test('the real text: the copy, or five of them when kicked', () => {
    const parsed = readAll(REAL, 'sorcery');
    expect(parsed.spell?.effect).toEqual({
      kind: 'conditional',
      condition: { kind: 'kicked' },
      effect: { kind: 'createToken', token: COPY, count: 5 },
      else: { kind: 'createToken', token: COPY, count: 1 },
    });
  });

  test('"of those tokens" after a token that is not a copy is the same token (D-646: the token last made, copy or not)', () => {
    const parsed = readAll(
      'Create a 1/1 white Soldier creature token. If ~ was kicked, create five of those tokens instead.',
      'sorcery',
    );
    expect(parsed.spell?.effect).toMatchObject({
      kind: 'conditional',
      condition: { kind: 'kicked' },
      effect: { kind: 'createToken', count: 5 },
      else: { kind: 'createToken', count: 1 },
    });
  });

  test('not read: a count of one', () => {
    NOT_READ(
      "Create a token that's a copy of target creature. If ~ was kicked, create one of those tokens instead.",
      'sorcery',
    );
  });
});

describe('Rionya, Fire Dancer: X copies of another target creature, X from the spells cast this turn (CR 601.2i)', () => {
  const REAL =
    "At the beginning of combat on your turn, create X tokens that are copies of another target creature you control, where X is one plus the number of instant and sorcery spells you've cast this turn. They gain haste. Exile them at the beginning of the next end step.";

  test('the real line', () => {
    const parsed = readAll(REAL);
    expect(parsed.abilities).toEqual([
      {
        kind: 'triggered',
        trigger: COMBAT,
        targets: [
          {
            id: 't1',
            what: {
              kind: 'object',
              filter: { zone: 'battlefield', types: ['creature'], other: true, controller: 'you' },
            },
          },
        ],
        effect: {
          kind: 'sequence',
          effects: [
            {
              kind: 'createToken',
              token: { kind: 'copyOf', object: { kind: 'target', id: 't1' } },
              count: {
                kind: 'sum',
                of: [1, { kind: 'spellsCastThisTurn', ofTypes: ['instant', 'sorcery'] }],
              },
            },
            {
              kind: 'grantKeyword',
              objects: MOVED,
              keyword: { kind: 'haste' },
              duration: 'permanent',
            },
            AT_END('exile'),
          ],
        },
      },
    ]);
  });

  test("the count of spells: all the spells you've cast this turn, and the plain number of them", () => {
    const all = readAll(
      "At the beginning of combat on your turn, create X tokens that are copies of ~, where X is the number of spells you've cast this turn.",
    );
    expect(JSON.stringify(all.abilities)).toContain('"spellsCastThisTurn"');
    expect(JSON.stringify(all.abilities)).not.toContain('ofTypes');
  });

  test('not read: a count without X, a copy of several, "they" with no tokens before', () => {
    NOT_READ(
      "At the beginning of combat on your turn, create X tokens that are copies of two target creatures you control, where X is the number of spells you've cast this turn.",
    );
    NOT_READ(
      'At the beginning of combat on your turn, draw a card. Exile them at the beginning of the next end step.',
    );
  });
});

describe('Twinflame: strive, any number of targets, a copy of each with haste, exiled at the end step (CR 601.2f, 707.9b)', () => {
  const STRIVE = '~ costs {2}{R} more to cast for each target beyond the first.';
  const REAL =
    "Choose any number of target creatures you control. For each of them, create a token that's a copy of that creature, except it has haste. Exile those tokens at the beginning of the next end step.";

  test('the strive line is a static ability of the spell', () => {
    const parsed = readAll(STRIVE, 'sorcery');
    expect(parsed.abilities).toEqual([
      {
        kind: 'static',
        static: { kind: 'costPerExtraTarget', cost: [{ kind: 'mana', symbols: ['2', 'R'] }] },
      },
    ]);
  });

  test('the real text: a slot of any number of targets, a copy of each with haste, a delayed exile', () => {
    const parsed = readAll(REAL, 'sorcery');
    expect(parsed.spell).toEqual({
      targets: [
        {
          id: 't1',
          what: {
            kind: 'object',
            filter: { zone: 'battlefield', types: ['creature'], controller: 'you' },
          },
          anyNumber: true,
        },
        // (the shape below is the single slot of the text)
      ].slice(0, 1),
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'createCopies', objects: { kind: 'target', id: 't1' }, abilities: [HASTE] },
          AT_END('exile'),
        ],
      },
    });
  });

  test('not read: another exception, none, "less", a creature spell (strive is the cost of an instant or a sorcery)', () => {
    NOT_READ(
      "Choose any number of target creatures you control. For each of them, create a token that's a copy of that creature, except it has flying.",
      'sorcery',
    );
    NOT_READ(
      "Choose any number of target creatures you control. For each of them, create a token that's a copy of that creature.",
      'sorcery',
    );
    NOT_READ('~ costs {2}{R} less to cast for each target beyond the first.', 'sorcery');
    NOT_READ('~ costs {2}{R} more to cast for each target beyond the second.', 'sorcery');
  });
});

describe('Redoubled Stormsinger: for each creature token that entered this turn, a tapped and attacking copy (CR 508.4)', () => {
  const REAL =
    "Whenever ~ attacks, for each creature token you control that entered this turn, create a tapped and attacking token that's a copy of that token. At the beginning of the next end step, sacrifice those tokens.";

  test('the real line', () => {
    const parsed = readAll(REAL);
    expect(parsed.abilities).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'attacks', what: { kind: 'this' } },
        effect: {
          kind: 'sequence',
          effects: [
            {
              kind: 'createCopies',
              objects: {
                kind: 'each',
                filter: {
                  types: ['creature'],
                  token: true,
                  controller: 'you',
                  enteredThisTurn: true,
                },
              },
              tapped: true,
            },
            { kind: 'enterAttacking', objects: MOVED },
            AT_END('sacrifice'),
          ],
        },
      },
    ]);
  });

  test('not read: "sacrifice those tokens" with no tokens made, copies that are not attacking', () => {
    NOT_READ(
      'Whenever ~ attacks, you gain 1 life. At the beginning of the next end step, sacrifice those tokens.',
    );
    NOT_READ(
      "Whenever ~ attacks, for each creature token you control that entered this turn, create a token that's a copy of that token.",
    );
  });
});

describe('Brudiclad: each other token becomes a copy of the token chosen (CR 707.2, 611.2a)', () => {
  const REAL =
    'At the beginning of combat on your turn, create a 2/1 blue Phyrexian Myr artifact creature token. Then you may choose a token you control. If you do, each other token you control becomes a copy of that token.';

  test('the real line: the Myr, the choice of a token, the others become copies of it for good', () => {
    const parsed = readAll(REAL);
    const [ability] = parsed.abilities;
    expect(ability).toMatchObject({ kind: 'triggered', trigger: COMBAT });
    const effects = (ability as unknown as { effect: { effects: { kind: string }[] } }).effect
      .effects;
    expect(effects.map((e) => e.kind)).toEqual(['createToken', 'chooseObjects', 'becomeCopy']);
    expect(effects[1]).toEqual({
      kind: 'chooseObjects',
      id: 'token',
      filter: { token: true, controller: 'you' },
      count: 1,
    });
    expect(effects[2]).toEqual({
      kind: 'becomeCopy',
      objects: {
        kind: 'each',
        filter: { token: true, controller: 'you' },
        except: { kind: 'chosen', id: 'token' },
      },
      of: { kind: 'chosen', id: 'token' },
      duration: 'permanent',
    });
  });

  test('the static ability of the card: creature tokens you control have haste', () => {
    const parsed = readAll('Creature tokens you control have haste.', 'creature');
    expect(parsed.abilities).toEqual([
      {
        kind: 'static',
        static: {
          kind: 'grantKeyword',
          subject: {
            kind: 'filter',
            filter: { types: ['creature'], token: true, controller: 'you' },
          },
          keyword: { kind: 'haste' },
        },
      },
    ]);
  });

  test('not read: the choice with no "If you do", a duration, a copy of another thing', () => {
    NOT_READ('At the beginning of combat on your turn, you may choose a token you control.');
    NOT_READ(
      'At the beginning of combat on your turn, you may choose a token you control. Draw a card.',
    );
    NOT_READ(
      'At the beginning of combat on your turn, you may choose a token you control. If you do, each other token you control becomes a copy of that token until end of turn.',
    );
  });
});

describe('Muddle, the Ever-Changing: a copy of up to one nonlegendary creature until end of turn, except it has myriad (CR 707.9b)', () => {
  const REAL =
    'Whenever you cast an instant or sorcery spell, ~ becomes a copy of up to one target nonlegendary creature you control until end of turn, except it has myriad.';

  test('the real line', () => {
    const parsed = readAll(REAL);
    expect(parsed.abilities).toEqual([
      {
        kind: 'triggered',
        trigger: {
          kind: 'castSpell',
          filter: { stackKind: 'spell', anyOf: [{ types: ['instant'] }, { types: ['sorcery'] }] },
          by: 'you',
        },
        targets: [
          {
            id: 't1',
            what: {
              kind: 'object',
              filter: {
                zone: 'battlefield',
                types: ['creature'],
                notSupertypes: ['legendary'],
                controller: 'you',
              },
            },
            min: 0,
            max: 1,
          },
        ],
        effect: {
          kind: 'becomeCopy',
          objects: { kind: 'this' },
          of: { kind: 'target', id: 't1' },
          duration: 'untilEndOfTurn',
          abilities: [{ kind: 'keyword', keyword: { kind: 'myriad' } }],
        },
      },
    ]);
  });

  test('not read: another duration, no exception, an exception that is not a keyword', () => {
    NOT_READ(
      'Whenever you cast an instant or sorcery spell, ~ becomes a copy of up to one target nonlegendary creature you control until your next turn, except it has myriad.',
    );
    NOT_READ(
      'Whenever you cast an instant or sorcery spell, ~ becomes a copy of up to one target nonlegendary creature you control until end of turn.',
    );
    NOT_READ(
      'Whenever you cast an instant or sorcery spell, ~ becomes a copy of up to one target nonlegendary creature you control until end of turn, except its name is ~.',
    );
  });
});

describe("Inspired Skypainter // Maestro's Gift: two events, one effect; a copy that gains haste (CR 603.2c, 722.3a)", () => {
  const REAL =
    'When ~ enters and whenever one or more creature tokens you control deal combat damage to a player, ~ becomes prepared.';

  test('the real line is two triggered abilities that prepare the permanent', () => {
    const parsed = readAll(REAL);
    expect(parsed.abilities).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        effect: { kind: 'prepare', objects: { kind: 'this' } },
      },
      {
        kind: 'triggered',
        trigger: {
          kind: 'combatDamageBatch',
          what: { types: ['creature'], token: true, controller: 'you' },
          to: 'player',
        },
        effect: { kind: 'prepare', objects: { kind: 'this' } },
      },
    ]);
  });

  test('the batch trigger alone', () => {
    const parsed = readAll(
      'Whenever one or more creature tokens you control deal combat damage to a player, you gain 1 life.',
    );
    expect(parsed.abilities).toHaveLength(1);
  });

  test('not read: the player damaged is an opponent', () => {
    NOT_READ(
      'Whenever one or more creature tokens you control deal combat damage to an opponent, ~ becomes prepared.',
    );
  });

  test("Maestro's Gift: that token is the token the copy made, and it gains haste until end of turn", () => {
    const parsed = readAll(
      "Create a token that's a copy of target creature you control. That token gains haste until end of turn.",
      'sorcery',
    );
    expect(parsed.spell?.effect).toEqual({
      kind: 'sequence',
      effects: [
        {
          kind: 'createToken',
          token: { kind: 'copyOf', object: { kind: 'target', id: 't1' } },
          count: 1,
        },
        {
          kind: 'grantKeyword',
          objects: MOVED,
          keyword: { kind: 'haste' },
          duration: 'untilEndOfTurn',
        },
      ],
    });
  });
});

describe('Dirgur Focusmage // Braingeyser: a spell cast from your hand (CR 601.2a, 601.2i)', () => {
  const REAL =
    'Whenever you cast an instant or sorcery spell with mana value 5 or greater from your hand, ~ becomes prepared.';

  test('the real line', () => {
    const parsed = readAll(REAL);
    expect(parsed.abilities).toEqual([
      {
        kind: 'triggered',
        trigger: {
          kind: 'castSpell',
          filter: {
            stackKind: 'spell',
            castFromHand: true,
            manaValue: { cmp: 'atLeast', value: 5 },
            anyOf: [{ types: ['instant'] }, { types: ['sorcery'] }],
          },
          by: 'you',
        },
        effect: { kind: 'prepare', objects: { kind: 'this' } },
      },
    ]);
  });

  test('not read: another zone, an opponent', () => {
    NOT_READ(
      'Whenever you cast an instant or sorcery spell with mana value 5 or greater from your graveyard, ~ becomes prepared.',
    );
    NOT_READ(
      'Whenever an opponent casts an instant or sorcery spell from your hand, ~ becomes prepared.',
    );
  });
});

describe("Volcanic Torrent (the same count): X is the number of spells you've cast this turn", () => {
  test('read as the engine’s count of the controller’s spells, itself included', () => {
    const parsed = readAll(
      "~ deals X damage to each creature and planeswalker your opponents control, where X is the number of spells you've cast this turn.",
      'sorcery',
    );
    expect(JSON.stringify(parsed.spell)).toContain('{"kind":"spellsCastThisTurn"}');
  });
});
