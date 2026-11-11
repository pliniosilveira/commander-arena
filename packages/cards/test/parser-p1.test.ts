// Stage P1 (D-063): the phrase rules that reach the engine's mana, land, trigger, token, sacrifice
// and counter primitives from Oracle text. Each describe block is one family of rules, read through
// the whole pipeline (segment, read, bind, lower) and compared with the AST the engine fixtures
// spell out by hand. Lines come from the first corpus run (reports/backlog.md, numbers as printed)
// or from the golden corpus; a line that is not there says SYNTHETIC. Nothing here is a real card
// unless it says so.
import { existsSync, readFileSync } from 'node:fs';
import {
  type Ability,
  type Effect,
  syntheticCard as engineSynthetic,
  SUPPORTED_FEATURES,
} from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import {
  ABILITY_WORDS,
  ALL_RULES,
  buildRuleSet,
  compileLine,
  type FaceParse,
  normalizeOracleText,
  parseFaceText,
  stripAbilityWord,
} from '../src/convert/parser/index';
import {
  fromGoldenCard,
  type GoldenCard,
  importCard,
  matchAbility,
  parseGolden,
} from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';
import { syntheticCard } from './convert-helpers';
import { CR_PATH } from './cr-file';

const OPTS = { name: 'SYNTHETIC Card', legendary: false };

/** The abilities one line reads into; throws with the diagnostic when it does not. */
function abilities(text: string): readonly Ability[] {
  const m = matchAbility(text);
  if (!m.ok) throw new Error(`"${text}" stopped at "${m.stoppedAt}" (${m.closestRule})`);
  return m.abilities;
}

function face(text: string): FaceParse {
  return parseFaceText(text, OPTS, 0);
}

const tap = { kind: 'tap' } as const;
const YOU = { kind: 'you' } as const;
const THIS = { kind: 'this' } as const;

describe('mana abilities (CR 605.1a)', () => {
  test.each([
    ['{T}: Add {U} or {B}.', { kind: 'oneOf', colors: ['U', 'B'] }],
    ['{T}: Add {R}, {G}, or {W}.', { kind: 'oneOf', colors: ['R', 'G', 'W'] }],
    ['{T}: Add {C}.', { kind: 'fixed', mana: ['C'] }],
    ['{T}: Add {G}{G}.', { kind: 'fixed', mana: ['G', 'G'] }],
    ['{T}: Add one mana of any color.', { kind: 'anyColor' }],
    [
      "{T}: Add one mana of any color in your commander's color identity.",
      { kind: 'commanderIdentity' },
    ],
  ])('%s', (text, production) => {
    expect(abilities(text)).toEqual([{ kind: 'mana', cost: [tap], production }]);
  });

  test('a mana cost before the tap symbol is a cost of the mana ability, in text order', () => {
    expect(abilities('{1}, {T}: Add {U}{B}.')).toEqual([
      {
        kind: 'mana',
        cost: [{ kind: 'mana', symbols: ['1'] }, tap],
        production: { kind: 'fixed', mana: ['U', 'B'] },
      },
    ]);
    expect(abilities('{2}{G}, {T}: Add {R}, {G}, or {W}.')).toEqual([
      {
        kind: 'mana',
        cost: [{ kind: 'mana', symbols: ['2', 'G'] }, tap],
        production: { kind: 'oneOf', colors: ['R', 'G', 'W'] },
      },
    ]);
  });

  test('a rider that hurts or pays you is `also` (the pain lands)', () => {
    expect(abilities('{T}: Add {U} or {B}. ~ deals 1 damage to you.')).toEqual([
      {
        kind: 'mana',
        cost: [tap],
        production: { kind: 'oneOf', colors: ['U', 'B'] },
        also: [{ kind: 'dealDamage', amount: 1, to: YOU }],
      },
    ]);
    expect(abilities('{T}: Add {C}{C}. ~ deals 2 damage to you.')).toEqual([
      {
        kind: 'mana',
        cost: [tap],
        production: { kind: 'fixed', mana: ['C', 'C'] },
        also: [{ kind: 'dealDamage', amount: 2, to: YOU }],
      },
    ]);
    expect(abilities('{T}: Add {W}. You gain 1 life.')[0]).toMatchObject({
      also: [{ kind: 'gainLife', player: YOU, amount: 1 }],
    });
    expect(abilities('{T}: Add {B}{B}. You lose 2 life.')[0]).toMatchObject({
      also: [{ kind: 'loseLife', player: YOU, amount: 2 }],
    });
  });

  test('anything else after the mana makes it an ordinary activated ability, not read as a mana ability', () => {
    const result = compileLine('{T}: Add {U} or {B}. ~ deals 1 damage to target creature.', {
      rules: buildRuleSet(ALL_RULES),
      face: 'permanent',
    });
    expect(result).toMatchObject({
      ok: false,
      failure: { reason: 'notRunnable' },
    });
    // Two taps, or a tap with no mana, is not the shape either.
    for (const text of ['{T}, {T}: Add {G}.', '{1}: Add {G}.', '{T}: Add {G}. Draw a card.']) {
      expect(face(text).abilities, text).toEqual([]);
    }
  });

  test('what the engine cannot pay or produce stays unparsed, with the stop where it is', () => {
    // Stage P14 reads the filter lands, "could produce" and a life cost. Still out: one combination
    // written twice, a Phyrexian symbol (the planner pays hybrid, not that) and a spend restriction of no type.
    for (const [text, stoppedAt] of [
      ['{T}: Add {R}{W}, {W}{R}, or {R}{R}.', 'or {R}{R}.'],
      ['{G/P}, {T}: Add {G}{G}.', '{G/P}, {T}: Add {G}{G}.'],
      // Stage P33: "Spend this mana only to cast creature spells." is read; "spells" with no type says nothing the engine restricts by.
      [
        '{T}: Add {G}. Spend this mana only to cast spells.',
        'Spend this mana only to cast spells.',
      ],
    ] as const) {
      const parsed = face(text);
      expect(parsed.abilities, text).toEqual([]);
      expect(parsed.unparsed[0]?.stoppedAt, text).toBe(stoppedAt);
    }
  });
});

describe('lands that enter tapped on a condition (CR 614.1c, 614.12)', () => {
  const unless = (condition: object) => [
    { kind: 'replacement', replacement: { kind: 'entersTapped', unless: condition } },
  ];

  test('"unless you control N or more basic lands" and "other lands" (check lands)', () => {
    expect(abilities('~ enters tapped unless you control two or more basic lands.')).toEqual(
      unless({
        kind: 'controlsAtLeast',
        filter: { types: ['land'], supertypes: ['basic'] },
        count: 2,
      }),
    );
    expect(abilities('~ enters tapped unless you control two or more other lands.')).toEqual(
      unless({ kind: 'controlsAtLeast', filter: { types: ['land'], other: true }, count: 2 }),
    );
  });

  test('"unless you have two or more opponents"', () => {
    expect(abilities('~ enters tapped unless you have two or more opponents.')).toEqual(
      unless({ kind: 'opponentsAtLeast', count: 2 }),
    );
  });

  test('"unless you control an Island or a Mountain" is one of two subtypes (CR 205.3i)', () => {
    expect(abilities('~ enters tapped unless you control an Island or a Mountain.')).toEqual(
      unless({
        kind: 'or',
        terms: [
          { kind: 'controlsAtLeast', filter: { subtypes: ['Island'] }, count: 1 },
          { kind: 'controlsAtLeast', filter: { subtypes: ['Mountain'] }, count: 1 },
        ],
      }),
    );
    expect(abilities('~ enters tapped unless you control a Forest.')).toEqual(
      unless({ kind: 'controlsAtLeast', filter: { subtypes: ['Forest'] }, count: 1 }),
    );
  });

  test('"two or fewer other lands" is not three or more (SYNTHETIC line of the fast-land wording)', () => {
    expect(abilities('~ enters tapped unless you control two or fewer other lands.')).toEqual(
      unless({
        kind: 'not',
        term: {
          kind: 'controlsAtLeast',
          filter: { types: ['land'], other: true },
          count: 3,
        },
      }),
    );
  });

  test('the pre-2024 "enters the battlefield tapped" reads the same', () => {
    expect(
      abilities('~ enters the battlefield tapped unless you control two or more basic lands.'),
    ).toEqual(abilities('~ enters tapped unless you control two or more basic lands.'));
  });

  test('a shock land pays life or enters tapped', () => {
    const expected = [
      {
        kind: 'replacement',
        replacement: { kind: 'entersTappedUnlessPays', cost: [{ kind: 'payLife', amount: 2 }] },
      },
    ];
    expect(abilities("As ~ enters, you may pay 2 life. If you don't, it enters tapped.")).toEqual(
      expected,
    );
    expect(abilities('As ~ enters, you may pay 2 life. If you don’t, it enters tapped.')).toEqual(
      expected,
    );
    expect(abilities("As ~ enters, you may pay 3 life. If you don't, it enters tapped.")).toEqual([
      {
        kind: 'replacement',
        replacement: { kind: 'entersTappedUnlessPays', cost: [{ kind: 'payLife', amount: 3 }] },
      },
    ]);
  });

  test('conditions and payments the engine cannot check stay unparsed and point at the word', () => {
    for (const [text, stoppedAt] of [
      ['~ enters tapped unless you control a creature with flying or reach.', 'or reach.'],
      ['~ enters tapped unless an opponent controls a land.', 'an opponent controls a land.'],
      [
        "As ~ enters, you may pay {2}. If you don't, it enters tapped.",
        "{2}. If you don't, it enters tapped.",
      ],
      [
        "As ~ enters, you may pay 0 life. If you don't, it enters tapped.",
        "0 life. If you don't, it enters tapped.",
      ],
    ] as const) {
      const parsed = face(text);
      expect(parsed.abilities, text).toEqual([]);
      expect(parsed.unparsed[0]?.reason, text).toBe('unrecognised');
      expect(parsed.unparsed[0]?.stoppedAt, text).toBe(stoppedAt);
    }
  });
});

describe('"You have no maximum hand size." (CR 402.2)', () => {
  test('is the static ability of the engine', () => {
    expect(abilities('You have no maximum hand size.')).toEqual([
      { kind: 'static', static: { kind: 'noMaximumHandSize' } },
    ]);
  });

  test('a condition, another subject or no period is not read', () => {
    for (const text of [
      'You have no maximum hand size as long as you control a Dragon.',
      'Each opponent has no maximum hand size.',
      'You have no maximum hand size',
    ]) {
      expect(face(text).abilities, text).toEqual([]);
    }
  });

  test('on an instant or sorcery the line is not a static ability', () => {
    const imported = importCard(
      syntheticCard({
        name: 'SYNTHETIC Odd',
        manaCost: '{1}',
        typeLine: 'Sorcery',
        oracleText: 'You have no maximum hand size.',
      }),
      undefined,
      NO_OVERRIDES,
    );
    expect(imported.support.status).toBe('unsupported');
  });
});

describe('triggers (CR 603)', () => {
  const triggered = (trigger: object, effect: Effect, extra: object = {}): Ability =>
    ({ kind: 'triggered', trigger, effect, ...extra }) as Ability;
  const draw: Effect = { kind: 'draw', player: YOU, count: 1 };

  test.each([
    ['When ~ enters, draw a card.', { kind: 'entersBattlefield', what: THIS }],
    ['When ~ enters the battlefield, draw a card.', { kind: 'entersBattlefield', what: THIS }],
    ['Whenever ~ attacks, draw a card.', { kind: 'attacks', what: THIS }],
    ['When ~ dies, draw a card.', { kind: 'dies', what: THIS }],
    ['Whenever ~ becomes tapped, draw a card.', { kind: 'becomesTapped', what: THIS }],
    ['At the beginning of your upkeep, draw a card.', { kind: 'upkeep', whose: 'you' }],
    ['At the beginning of each upkeep, draw a card.', { kind: 'upkeep', whose: 'each' }],
    ['At the beginning of your end step, draw a card.', { kind: 'endStep', whose: 'you' }],
    ['At the beginning of each end step, draw a card.', { kind: 'endStep', whose: 'each' }],
    ['Whenever a land you control enters, draw a card.', { kind: 'landfall' }],
    ['Whenever a land enters under your control, draw a card.', { kind: 'landfall' }],
    [
      'Whenever a land enters the battlefield under your control, draw a card.',
      { kind: 'landfall' },
    ],
    [
      'Whenever you sacrifice a permanent, draw a card.',
      { kind: 'permanentSacrificed', by: 'you' },
    ],
    [
      'Whenever you sacrifice a creature, draw a card.',
      { kind: 'permanentSacrificed', by: 'you', filter: { types: ['creature'] } },
    ],
  ])('%s', (text, trigger) => {
    expect(abilities(text)).toEqual([triggered(trigger, draw)]);
  });

  test('a subject that is a kind of object is an ObjectFilter, without a zone (SYNTHETIC lines)', () => {
    expect(abilities('Whenever another creature you control dies, draw a card.')).toEqual([
      triggered(
        { kind: 'dies', what: { types: ['creature'], other: true, controller: 'you' } },
        draw,
      ),
    ]);
    expect(abilities('Whenever a creature you control attacks, draw a card.')).toEqual([
      triggered({ kind: 'attacks', what: { types: ['creature'], controller: 'you' } }, draw),
    ]);
    expect(abilities('Whenever another creature enters, draw a card.')).toEqual([
      triggered({ kind: 'entersBattlefield', what: { types: ['creature'], other: true } }, draw),
    ]);
    expect(abilities('Whenever a creature an opponent controls dies, draw a card.')).toEqual([
      triggered({ kind: 'dies', what: { types: ['creature'], controller: 'opponent' } }, draw),
    ]);
  });

  test('one subject and two events are two abilities that share the body (CR 603.2c)', () => {
    const sacrifice: Effect = {
      kind: 'sacrifice',
      objects: { kind: 'choose', filter: { other: true } },
    };
    expect(abilities('Whenever ~ enters or attacks, sacrifice another permanent.')).toEqual([
      triggered({ kind: 'entersBattlefield', what: THIS }, sacrifice),
      triggered({ kind: 'attacks', what: THIS }, sacrifice),
    ]);
    expect(abilities('Whenever ~ attacks or dies, draw a card.')).toEqual([
      triggered({ kind: 'attacks', what: THIS }, draw),
      triggered({ kind: 'dies', what: THIS }, draw),
    ]);
  });

  test('"you may" makes the whole ability optional when it is the only instruction (CR 603.5)', () => {
    expect(abilities('When ~ dies, you may draw a card.')).toEqual([
      triggered({ kind: 'dies', what: THIS }, draw, { optional: true }),
    ]);
  });

  test('"you may" over several instructions is read but not run: the engine\'s "may" covers a whole effect', () => {
    const parsed = face('When ~ enters, you may draw a card and you gain 1 life.');
    expect(parsed.abilities).toEqual([]);
    expect(parsed.unparsed[0]).toMatchObject({ reason: 'notRunnable' });
    expect(parsed.unparsed[0]?.needs).toBeUndefined();
    // And a "you may" on a later sentence does not make the first one optional.
    expect(face('When ~ enters, draw a card. You may gain 1 life.').abilities).toEqual([]);
  });

  test('a body of several clauses is a sequence, in text order', () => {
    expect(abilities('Whenever ~ attacks, draw a card and you gain 2 life.')).toEqual([
      triggered(
        { kind: 'attacks', what: THIS },
        {
          kind: 'sequence',
          effects: [draw, { kind: 'gainLife', player: YOU, amount: 2 }],
        },
      ),
    ]);
    expect(abilities('Whenever ~ attacks, draw a card, then you gain 2 life.')).toEqual([
      triggered(
        { kind: 'attacks', what: THIS },
        { kind: 'sequence', effects: [draw, { kind: 'gainLife', player: YOU, amount: 2 }] },
      ),
    ]);
    expect(abilities('When ~ enters, draw a card. You gain 2 life.')).toEqual([
      triggered(
        { kind: 'entersBattlefield', what: THIS },
        { kind: 'sequence', effects: [draw, { kind: 'gainLife', player: YOU, amount: 2 }] },
      ),
    ]);
  });

  test('"At" goes with a step and nothing else, "Whenever" never with one (CR 603.2b)', () => {
    expect(face('At ~ enters, draw a card.').abilities).toEqual([]);
    expect(face('Whenever the beginning of your upkeep, draw a card.').abilities).toEqual([]);
  });

  test('the effects a trigger body needs', () => {
    expect(abilities('When ~ enters, you gain 1 life.')[0]).toMatchObject({
      effect: { kind: 'gainLife', player: YOU, amount: 1 },
    });
    expect(abilities('When ~ dies, create a Treasure token.')[0]).toMatchObject({
      effect: { kind: 'createToken', token: { kind: 'preset', preset: 'Treasure' }, count: 1 },
    });
    expect(abilities('Whenever ~ attacks, each opponent loses 1 life.')[0]).toMatchObject({
      effect: { kind: 'loseLife', player: { kind: 'eachOpponent' }, amount: 1 },
    });
    expect(abilities('Whenever ~ attacks, ~ deals 1 damage to each opponent.')[0]).toMatchObject({
      effect: { kind: 'dealDamage', amount: 1, to: { kind: 'eachOpponent' } },
    });
    expect(abilities('At the beginning of your end step, sacrifice ~.')[0]).toMatchObject({
      effect: { kind: 'sacrifice', objects: THIS },
    });
    expect(abilities('Whenever ~ attacks, put a +1/+1 counter on ~.')[0]).toMatchObject({
      effect: { kind: 'addCounters', objects: THIS, counter: '+1/+1', count: 1 },
    });
  });

  test('a trigger with a target is read and the engine runs it (CR 603.3d, D-089)', () => {
    const imported = importCard(
      syntheticCard({
        name: 'SYNTHETIC Aimer',
        manaCost: '{2}',
        typeLine: 'Creature — Bear',
        oracleText: 'When ~ enters, put a +1/+1 counter on target creature.',
        power: '1',
        toughness: '1',
      }),
      undefined,
      NO_OVERRIDES,
    );
    expect(imported.support.unparsed).toEqual([]);
    expect(imported.support.status).toBe('supported');
    expect(imported.definition.faces[0]?.abilities).toMatchObject([
      { kind: 'triggered', targets: [{ id: 't1' }] },
    ]);
  });

  test('what is not a trigger rule stays unparsed at the right word', () => {
    for (const [text, stoppedAt] of [
      ['When ~ enters, you may draw a card. Amass 1.', 'Amass 1.'],
      ['When ~ enters, amass 1.', 'amass 1.'],
      [
        'Whenever ~ deals damage to a player, draw a card.',
        'deals damage to a player, draw a card.',
      ],
      [
        'Whenever your opponents cast a spell, draw a card.',
        'Whenever your opponents cast a spell, draw a card.',
      ],
    ] as const) {
      const parsed = face(text);
      expect(parsed.abilities, text).toEqual([]);
      expect(parsed.unparsed[0]).toMatchObject({ reason: 'unrecognised', stoppedAt });
    }
  });

  test('an ability word in front is no part of the ability (CR 207.2c)', () => {
    const parsed = face('Landfall — Whenever a land you control enters, you gain 1 life.');
    expect(parsed.unparsed).toEqual([]);
    expect(parsed.abilities).toEqual([
      triggered({ kind: 'landfall' }, { kind: 'gainLife', player: YOU, amount: 1 }),
    ]);
  });
});

describe('tokens, sacrifice and counters as effects', () => {
  const only = (text: string): Effect => {
    const effect = parseFaceText(text, OPTS, 0, undefined, [{ id: 'spell.effect' }]).spell?.effect;
    if (effect === undefined) throw new Error(`"${text}" is not read as spell text`);
    return effect;
  };

  test('predefined tokens (CR 111.10): Treasure and Food run, Map is reported with what is missing', () => {
    expect(only('Create a Treasure token.')).toEqual({
      kind: 'createToken',
      token: { kind: 'preset', preset: 'Treasure' },
      count: 1,
    });
    expect(only('Create two Treasure tokens.')).toMatchObject({ count: 2 });
    const food = compileLine('Create a Food token.', {
      rules: buildRuleSet(ALL_RULES),
      face: 'spell',
    });
    // Food runs since the engine's activated abilities (D-075) and its preset was enabled.
    expect(food).toMatchObject({ ok: true });
    const map = compileLine('Create a Map token.', {
      rules: buildRuleSet(ALL_RULES),
      face: 'spell',
    });
    expect(map).toMatchObject({ failure: { reason: 'notRunnable', needs: ['token:Map'] } });
  });

  test('an inline creature token has power, toughness, colors and creature types, no abilities', () => {
    expect(only('Create a 1/1 white Soldier creature token.')).toEqual({
      kind: 'createToken',
      token: {
        kind: 'custom',
        definition: {
          name: 'Soldier',
          manaCost: null,
          supertypes: [],
          types: ['creature'],
          subtypes: ['Soldier'],
          colors: ['W'],
          power: 1,
          toughness: 1,
          loyalty: null,
          defense: null,
          oracleText: '',
          abilities: [],
        },
      },
      count: 1,
    });
    expect(only('Create three 2/2 black Zombie creature tokens.')).toMatchObject({
      count: 3,
      token: { definition: { colors: ['B'], subtypes: ['Zombie'], power: 2, toughness: 2 } },
    });
    expect(only('Create a 1/1 colorless Servo artifact creature token.')).toMatchObject({
      token: { definition: { colors: [], types: ['artifact', 'creature'], subtypes: ['Servo'] } },
    });
    expect(only('Create two 1/1 white and blue Elf Warrior creature tokens.')).toMatchObject({
      token: {
        definition: { name: 'Elf Warrior', colors: ['W', 'U'], subtypes: ['Elf', 'Warrior'] },
      },
    });
  });

  test('a token with an ability that has no keyword here is not created without it', () => {
    const parsed = parseFaceText(
      'Create a 1/1 white Soldier creature token with changeling.',
      OPTS,
      0,
      undefined,
      [{ id: 'spell.effect' }],
    );
    expect(parsed.spell).toBeNull();
    expect(parsed.unparsed[0]).toMatchObject({ stoppedAt: 'with changeling.', slot: 'token' });
  });

  test('sacrifice: ~ is `this`, a kind is a choice among your permanents, a count is two or more', () => {
    expect(only('Sacrifice a creature.')).toEqual({
      kind: 'sacrifice',
      objects: { kind: 'choose', filter: { types: ['creature'] } },
    });
    expect(only('Sacrifice two lands.')).toEqual({
      kind: 'sacrifice',
      objects: { kind: 'choose', filter: { types: ['land'] }, count: 2 },
    });
    expect(only('Sacrifice another nonland permanent.')).toEqual({
      kind: 'sacrifice',
      objects: { kind: 'choose', filter: { notTypes: ['land'], other: true } },
    });
    for (const text of [
      'Sacrifice target creature.',
      'Sacrifice a creature an opponent controls.',
    ]) {
      expect(face(text).abilities, text).toEqual([]);
    }
  });

  test('counters: on ~, on a target, on each of a kind', () => {
    expect(only('Put two +1/+1 counters on each creature you control.')).toEqual({
      kind: 'addCounters',
      objects: {
        kind: 'each',
        filter: { zone: 'battlefield', types: ['creature'], controller: 'you' },
      },
      counter: '+1/+1',
      count: 2,
    });
    expect(only('Put a -1/-1 counter on target creature.')).toMatchObject({
      kind: 'addCounters',
      counter: '-1/-1',
      objects: { kind: 'target', id: 't1' },
    });
  });
});

describe('Korvold, Fae-Cursed King reads as the engine fixture of the same text (acceptance)', () => {
  const golden: GoldenCard | undefined = parseGolden(
    readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
  ).find((card) => card.name.startsWith('Korvold'));

  test('the golden entry has the Oracle text of the card', () => {
    expect(golden?.faces[0]?.oracleText).toBe(
      'Flying\nWhenever Korvold enters or attacks, sacrifice another permanent.\nWhenever you sacrifice a permanent, put a +1/+1 counter on Korvold and draw a card.',
    );
  });

  test('is supported, and its abilities are exactly those of SYNTHETIC Sacrifice Dragon', () => {
    if (golden === undefined) throw new Error('no Korvold in the golden corpus');
    const imported = importCard(fromGoldenCard(golden), undefined, NO_OVERRIDES);
    expect(imported.support).toMatchObject({ status: 'supported', unparsed: [], reasons: [] });
    const dragon = engineSynthetic('SYNTHETIC Sacrifice Dragon');
    expect(imported.definition.faces[0]?.abilities).toEqual(dragon.faces[0]?.abilities);
  });
});

// The Comprehensive Rules are Wizards' text and are not committed (D-246): these checks run where `pnpm rules:fetch` has put the file, and skip elsewhere.

describe('ability words are stripped by the table of CR 207.2c', () => {
  test.skipIf(!existsSync(CR_PATH))(
    'the table is exactly the list in the Comprehensive Rules text',
    () => {
      const cr = readFileSync(CR_PATH, 'utf8');
      const line = cr.split('\n').find((l) => l.startsWith('207.2c '));
      const listed = /The ability words are (.*)\.$/.exec(line ?? '')?.[1] ?? '';
      const words = listed.replace(/, and /, ', ').split(', ');
      expect([...ABILITY_WORDS].sort()).toEqual([...words].sort());
    },
  );

  test('a leading "Word — " goes, a word anywhere else stays', () => {
    expect(stripAbilityWord('Landfall — Whenever a land you control enters, draw a card.')).toBe(
      'Whenever a land you control enters, draw a card.',
    );
    expect(stripAbilityWord('Council’s dilemma — Starting with you, each player votes.')).toBe(
      'Starting with you, each player votes.',
    );
    expect(stripAbilityWord("Council's dilemma — Starting with you, each player votes.")).toBe(
      'Starting with you, each player votes.',
    );
    expect(stripAbilityWord('Landfall')).toBe('Landfall');
    expect(stripAbilityWord('Whenever a land enters, landfall — draw.')).toBe(
      'Whenever a land enters, landfall — draw.',
    );
    expect(stripAbilityWord('Flying — not an ability word')).toBe('Flying — not an ability word');
  });

  test('normalization strips it per line, after the name and the reminder text', () => {
    expect(
      normalizeOracleText(
        'Flying\nLandfall — Whenever a land you control enters, SYNTHETIC Card gains flying. (Reminder.)',
        OPTS,
      ),
    ).toBe('Flying\nWhenever a land you control enters, ~ gains flying.');
  });
});

describe('the engine features the new lowerings name', () => {
  test('are all declared, and the ones the grammar leans on are runnable today', () => {
    for (const [dimension, value] of [
      ['manaProductionKinds', 'oneOf'],
      ['manaAbilityCostKinds', 'mana'],
      ['manaAbilityAlsoKinds', 'dealDamage'],
      ['replacementKinds', 'entersTappedUnlessPays'],
      ['staticKinds', 'noMaximumHandSize'],
      ['triggerKinds', 'permanentSacrificed'],
      ['sacrificeSelectors', 'choose'],
      ['tokenKinds', 'Treasure'],
      ['conditionKinds', 'controlsAtLeast'],
    ] as const) {
      expect(SUPPORTED_FEATURES[dimension] as readonly string[], dimension).toContain(value);
    }
  });
});
