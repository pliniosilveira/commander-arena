// Stage P17 (M6): the keyword lines of the engine's keyword batch 1 (D-104, D-110; ENGINE_VERSION
// 17) and the count of kicks. Each line is read through the whole pipeline and compared with the
// engine AST it must produce; each near miss says where it stops or why it is dropped. The real lines
// are those of reports/template-replay.md (the owner's run): "Changeling", "Devoid", "Partner",
// "Exalted", "Annihilator 4", "Infect", "Wither", "Persist", "Undying", "Toxic 1", "Split second",
// "Basic landcycling {1}", "Islandcycling {1}", "Plainscycling {2}", "Multikicker {2}"; every other
// line is SYNTHETIC (the wordings of docs/MECHANICS.md, "Keyword batch 1") and no real card is
// claimed supported here. That the engine runs what is lowered is in
// convert-grammar-engine-p17.test.ts; that a missing engine feature is named is in
// parser-p17-needs.test.ts.
import { type Ability, GRANTABLE_KEYWORDS as ENGINE_GRANTABLE } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import {
  GRANTABLE_KEYWORDS,
  keywordKind,
  SIMPLE_KEYWORDS,
} from '../src/convert/parser/rules/keyword/vocabulary';
import { dropped, type FaceType, read, readAll, spellEffect } from './parser-p5-helpers';

const keyword = (k: object): Ability => ({ kind: 'keyword', keyword: k }) as Ability;
const abilities = (text: string, type: FaceType = 'creature') => readAll(text, type).abilities;
const mana = (...symbols: string[]) => ({ kind: 'mana', symbols }) as const;

describe('keywords without a parameter (CR 702)', () => {
  test.each([
    ['Changeling', 'changeling'],
    ['Devoid', 'devoid'],
    ['Partner', 'partner'],
    ['Exalted', 'exalted'],
    ['Persist', 'persist'],
    ['Undying', 'undying'],
    ['Infect', 'infect'],
    ['Wither', 'wither'],
    ['changeling', 'changeling'],
  ] as const)('%s', (text, kind) => {
    expect(abilities(text)).toEqual([keyword({ kind })]);
  });

  test('Split second (CR 702.61a) on an instant', () => {
    expect(abilities('Split second', 'instant')).toEqual([keyword({ kind: 'splitSecond' })]);
  });

  test('the reminder text in parentheses is stripped, as for every keyword', () => {
    expect(
      abilities(
        'Exalted (Whenever a creature you control attacks alone, that creature gets +1/+1 until end of turn.)',
      ),
    ).toEqual([keyword({ kind: 'exalted' })]);
    expect(abilities('Infect (SYNTHETIC reminder text.)')).toEqual([keyword({ kind: 'infect' })]);
    expect(abilities('Split second (SYNTHETIC reminder text.)', 'instant')).toEqual([
      keyword({ kind: 'splitSecond' }),
    ]);
  });

  test('alone and in comma and semicolon lists with other keywords', () => {
    expect(abilities('Flying, infect')).toEqual([
      keyword({ kind: 'flying' }),
      keyword({ kind: 'infect' }),
    ]);
    expect(abilities('Infect; wither')).toEqual([
      keyword({ kind: 'infect' }),
      keyword({ kind: 'wither' }),
    ]);
    expect(abilities('Flying, changeling, undying')).toEqual([
      keyword({ kind: 'flying' }),
      keyword({ kind: 'changeling' }),
      keyword({ kind: 'undying' }),
    ]);
    expect(abilities('Flying; exalted')).toEqual([
      keyword({ kind: 'flying' }),
      keyword({ kind: 'exalted' }),
    ]);
  });

  test.each([
    'Partner with SYNTHETIC Name',
    'Partner—Friends forever',
    'Partner—Character select',
    'Partner—Father & son',
    'Partner—Survivors',
    'Friends forever',
    'Doctor’s companion',
    'Persist {1}',
    'Infectious',
  ])('%s is not read (another ability, or not a keyword)', (text) => {
    expect(dropped(text, 'creature').reason).toBe('unrecognised');
  });
});

describe('keywords with a number: Toxic N and Annihilator N (CR 702.164a, 702.86a)', () => {
  test.each([
    ['Toxic 1', { kind: 'toxic', count: 1 }],
    ['Toxic 2', { kind: 'toxic', count: 2 }],
    ['Annihilator 2', { kind: 'annihilator', count: 2 }],
    ['Annihilator 4', { kind: 'annihilator', count: 4 }],
  ])('%s', (text, expected) => {
    expect(abilities(text)).toEqual([keyword(expected)]);
  });

  test('in a list', () => {
    expect(abilities('Trample, toxic 1')).toEqual([
      keyword({ kind: 'trample' }),
      keyword({ kind: 'toxic', count: 1 }),
    ]);
    expect(abilities('Haste, annihilator 3, ward {2}')).toEqual([
      keyword({ kind: 'haste' }),
      keyword({ kind: 'annihilator', count: 3 }),
      keyword({ kind: 'ward', cost: [mana('2')] }),
    ]);
  });

  test.each(['Toxic', 'Toxic 0', 'Toxic X', 'Toxic two', 'Annihilator', 'Annihilator 0'])(
    '%s is not read',
    (text) => {
      expect(dropped(text, 'creature').reason).toBe('unrecognised');
    },
  );
});

describe('typecycling (CR 702.29e)', () => {
  test.each([
    ['Basic landcycling {1}', { types: ['land'], supertypes: ['basic'] }, mana('1')],
    ['Plainscycling {2}', { subtypes: ['Plains'] }, mana('2')],
    ['Islandcycling {1}', { subtypes: ['Island'] }, mana('1')],
    ['Swampcycling {2}', { subtypes: ['Swamp'] }, mana('2')],
    ['Mountaincycling {1}{R}', { subtypes: ['Mountain'] }, mana('1', 'R')],
    ['Forestcycling {2}', { subtypes: ['Forest'] }, mana('2')],
  ])('%s', (text, filter, cost) => {
    expect(abilities(text)).toEqual([keyword({ kind: 'typecycling', filter, cost: [cost] })]);
  });

  test('plain Cycling is still its own keyword', () => {
    expect(abilities('Cycling {2}')).toEqual([keyword({ kind: 'cycling', cost: [mana('2')] })]);
  });

  test.each([
    ['Landcycling {2}', 'Landcycling {2}'],
    ['Wizardcycling {2}', 'Wizardcycling {2}'],
    ['Basic landcycling', 'landcycling'],
    ['Islandcycling {X}', '{X}'],
    ['Islandcycling—Pay 2 life', 'Islandcycling—Pay 2 life'],
  ])('%s is not read', (text, stoppedAt) => {
    expect(dropped(text, 'creature')).toMatchObject({ reason: 'unrecognised' });
    expect(dropped(text, 'creature').stoppedAt).toContain(stoppedAt.split(' ')[0] ?? '');
  });
});

describe('Multikicker (CR 702.33c)', () => {
  test.each([
    ['Multikicker {2}', [mana('2')]],
    ['Multikicker {1}{G}', [mana('1', 'G')]],
  ])('%s', (text, cost) => {
    expect(abilities(text, 'sorcery')).toEqual([keyword({ kind: 'multikicker', cost })]);
  });

  test.each(['Multikicker—Pay 2 life', 'Multikicker {X}', 'Multikicker', 'Multikicker {W/U}'])(
    '%s is not read (the engine pays a cost of life, but no printed card is known to have one)',
    (text) => {
      expect(dropped(text, 'sorcery').reason).toBe('unrecognised');
    },
  );

  test('"Kicker {A} and/or {B}" is still read and refused', () => {
    expect(dropped('Kicker {W} and/or {B}', 'sorcery')).toMatchObject({
      reason: 'notRunnable',
      closestRule: 'keyword.kicker-and-or',
    });
  });
});

describe('"for each time it was kicked" (CR 702.33c, the engine\'s timesKicked)', () => {
  const kicks = { kind: 'timesKicked' } as const;
  const spell = (text: string) => {
    const parsed = readAll(text, 'sorcery').spell;
    if (parsed === undefined || parsed === null) throw new Error(`"${text}" has no spell text`);
    return parsed;
  };

  test('draw, gain and lose life in a spell, with "this spell" or ~', () => {
    expect(spell('Draw a card for each time this spell was kicked.').effect).toEqual({
      kind: 'draw',
      player: { kind: 'you' },
      count: kicks,
    });
    expect(spell('You gain 1 life for each time ~ was kicked.').effect).toEqual({
      kind: 'gainLife',
      player: { kind: 'you' },
      amount: kicks,
    });
    expect(spell('Each opponent loses 1 life for each time this spell was kicked.').effect).toEqual(
      { kind: 'loseLife', player: { kind: 'eachOpponent' }, amount: kicks },
    );
  });

  test('damage', () => {
    expect(
      spell('This spell deals 1 damage to any target for each time this spell was kicked.'),
    ).toEqual({
      targets: [{ id: 't1', what: { kind: 'anyTarget' } }],
      effect: { kind: 'dealDamage', amount: kicks, to: { kind: 'target', id: 't1' } },
    });
    expect(
      spell('This spell deals 1 damage to each opponent for each time this spell was kicked.')
        .effect,
    ).toEqual({ kind: 'dealDamage', amount: kicks, to: { kind: 'eachOpponent' } });
  });

  test('in an enters trigger "it" is the permanent: counters and tokens', () => {
    expect(
      abilities(
        'When this creature enters, put a +1/+1 counter on it for each time it was kicked.',
      ),
    ).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        effect: {
          kind: 'addCounters',
          objects: { kind: 'this' },
          counter: '+1/+1',
          count: kicks,
        },
      },
    ]);
    const [token] = abilities(
      'When this creature enters, create a Treasure token for each time it was kicked.',
    );
    expect(token).toMatchObject({
      kind: 'triggered',
      effect: { kind: 'createToken', count: kicks },
    });
  });

  test('"it" in a spell is not the spell (it may be a target): read and dropped', () => {
    expect(dropped('Draw a card for each time it was kicked.', 'sorcery')).toMatchObject({
      reason: 'notRunnable',
      closestRule: 'effect.draw',
    });
  });

  test('"it" in a trigger about another object is not the source either', () => {
    expect(
      dropped('Whenever a creature enters, draw a card for each time it was kicked.', 'creature'),
    ).toMatchObject({ reason: 'notRunnable' });
  });

  test('a quantity above one multiplies the kicks (stage P28, D-131): "two cards for each time"', () => {
    expect(spellEffect('Draw two cards for each time ~ was kicked.', 'sorcery')).toEqual({
      kind: 'draw',
      player: { kind: 'you' },
      count: { kind: 'multiple', factor: 2, of: { kind: 'timesKicked' } },
    });
  });

  test('a quantity above one multiplies the kicks for damage too (stage P28)', () => {
    expect(
      spellEffect('~ deals 2 damage to any target for each time ~ was kicked.', 'sorcery'),
    ).toMatchObject({
      kind: 'dealDamage',
      amount: { kind: 'multiple', factor: 2, of: { kind: 'timesKicked' } },
    });
  });

  test.each([
    '~ deals X damage to any target for each time ~ was kicked.',
    'Draw a card for each time that creature was kicked.',
  ])('%s is not read', (text) => {
    expect(dropped(text, 'sorcery').reason).toBe('unrecognised');
  });

  test('"enters with a counter for each time it was kicked" is a replacement with the count `timesKicked` (D-254)', () => {
    // The replacement's count is a number, X or the kicks (D-103, D-254); a trigger would put the counter on later.
    const parsed = read(
      'Multikicker {1}\n~ enters with a charge counter on it for each time it was kicked.',
      'artifact',
    );
    expect(parsed.unparsed).toEqual([]);
    expect(parsed.abilities).toContainEqual({
      kind: 'replacement',
      replacement: {
        kind: 'entersWithCounters',
        counter: 'charge',
        count: { kind: 'timesKicked' },
      },
    });
  });
});

describe('gains and grants of the words the engine can grant (CR 613.1f)', () => {
  test('infect and wither are grantable words, in the engine list and in the grammar', () => {
    const words = GRANTABLE_KEYWORDS.map(([word]) => word);
    expect(words).toContain('infect');
    expect(words).toContain('wither');
    expect(ENGINE_GRANTABLE).toContain('infect');
    expect(ENGINE_GRANTABLE).toContain('wither');
  });

  test('changeling, devoid, partner, persist, undying and split second are not grantable (exalted is, since D-149)', () => {
    expect(GRANTABLE_KEYWORDS.map(([w]) => w)).toContain('exalted');
    for (const word of ['changeling', 'devoid', 'partner', 'persist', 'undying', 'split second']) {
      expect(SIMPLE_KEYWORDS.map(([w]) => w)).toContain(word);
      expect(GRANTABLE_KEYWORDS.map(([w]) => w)).not.toContain(word);
      expect(keywordKind(word)).toBeDefined();
      expect(dropped(`Target creature gains ${word} until end of turn.`).reason).toBe(
        'unrecognised',
      );
    }
  });

  test('"Target creature gains infect until end of turn."', () => {
    expect(readAll('Target creature gains infect until end of turn.').spell?.effect).toEqual({
      kind: 'grantKeyword',
      objects: { kind: 'target', id: 't1' },
      keyword: { kind: 'infect' },
      duration: 'untilEndOfTurn',
    });
  });

  test('"gains flying and wither", a static grant and a token with infect', () => {
    expect(
      readAll('Target creature gains flying and wither until end of turn.').spell?.effect,
    ).toMatchObject({ kind: 'sequence' });
    expect(abilities('Creatures you control have infect.', 'enchantment')).toEqual([
      {
        kind: 'static',
        static: {
          kind: 'grantKeyword',
          subject: { kind: 'filter', filter: { types: ['creature'], controller: 'you' } },
          keyword: { kind: 'infect' },
        },
      },
    ]);
    expect(
      readAll('Create a 1/1 black Phyrexian Mite creature token with infect.', 'sorcery').spell
        ?.effect,
    ).toMatchObject({
      kind: 'createToken',
      token: { kind: 'custom', definition: { abilities: [keyword({ kind: 'infect' })] } },
    });
  });
});
