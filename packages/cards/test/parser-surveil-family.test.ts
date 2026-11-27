// The surveil family of the Revenant Recon deck: the lines of Unshakable Tail, Whispering Snitch, Watcher of Hours, Dream Eater, Enhanced Surveillance and Eye of Duskmantle. The real lines are
// the Oracle text of the acceptance cards of the golden corpus read through the whole pipeline; the other lines are SYNTHETIC siblings and the near misses the grammar must not read. The engine
// runs what is lowered in convert-grammar-engine-surveil-family.test.ts.
import { describe, expect, test } from 'vitest';
import { type FaceType, readAll as readAllFace, read as readFace } from './parser-p5-helpers';

const read = (text: string, type: FaceType = 'creature') => readFace(text, type);
const readAll = (text: string, type: FaceType = 'creature') => readAllFace(text, type);

const NOT_READ = (text: string, type: FaceType = 'creature') => {
  const parsed = read(text, type);
  expect(parsed.abilities, text).toEqual([]);
  expect(parsed.unparsed, text).toHaveLength(1);
};

const SURVEIL_1 = { kind: 'surveil', count: 1 } as const;

describe('"When ~ enters and at the beginning of your upkeep, <effect>" (Unshakable Tail, CR 603.2c)', () => {
  test('the real line: one ability for each of the two events, sharing the effect', () => {
    expect(
      readAll('When ~ enters and at the beginning of your upkeep, surveil 1.').abilities,
    ).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        effect: SURVEIL_1,
      },
      { kind: 'triggered', trigger: { kind: 'upkeep', whose: 'you' }, effect: SURVEIL_1 },
    ]);
  });

  test('another effect reads the same way (SYNTHETIC)', () => {
    expect(
      readAll('When ~ enters and at the beginning of each upkeep, you gain 1 life.').abilities,
    ).toMatchObject([
      { trigger: { kind: 'entersBattlefield' } },
      { trigger: { kind: 'upkeep', whose: 'each' } },
    ]);
  });

  test.each([
    'When ~ enters and at the beginning of your end step, surveil 1.',
    'When ~ enters, and at the beginning of your upkeep, surveil 1.',
    'When ~ enters or at the beginning of your upkeep, surveil 1.',
    'When another creature enters and at the beginning of your upkeep, surveil 1.',
  ])('is not read: %s', (text) => NOT_READ(text));
});

describe('"Whenever you surveil for the first time each turn, ..." (Whispering Snitch, CR 603.2)', () => {
  test('the real line', () => {
    expect(
      readAll(
        'Whenever you surveil for the first time each turn, ~ deals 1 damage to each opponent and you gain 1 life.',
      ).abilities,
    ).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'surveils', who: 'you', firstEachTurn: true },
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'dealDamage', amount: 1, to: { kind: 'eachOpponent' } },
            { kind: 'gainLife', player: { kind: 'you' }, amount: 1 },
          ],
        },
      },
    ]);
  });

  test('without the ordinal it is the plain trigger, unchanged', () => {
    expect(readAll('Whenever you surveil, you gain 1 life.').abilities).toMatchObject([
      { trigger: { kind: 'surveils', who: 'you' } },
    ]);
    expect(readAll('Whenever you surveil, you gain 1 life.').abilities[0]).not.toHaveProperty(
      'trigger.firstEachTurn',
    );
  });

  test.each([
    'Whenever you scry or surveil for the first time each turn, you gain 1 life.',
    'Whenever an opponent surveils for the first time each turn, you gain 1 life.',
    'Whenever a player surveils for the first time each turn, you gain 1 life.',
    'Whenever you surveil for the first time, you gain 1 life.',
    'Whenever you surveil for the second time each turn, you gain 1 life.',
  ])('is not read: %s', (text) => NOT_READ(text));
});

describe('"Whenever you remove a time counter from this card while it’s exiled, ..." (Watcher of Hours, CR 702.62a)', () => {
  test('the real line, with "this card"', () => {
    expect(
      readAll('Whenever you remove a time counter from this card while it’s exiled, surveil 1.')
        .abilities,
    ).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'removesCounterWhileExiled', counter: 'time' },
        effect: SURVEIL_1,
      },
    ]);
  });

  test('with the name of the card it is the same', () => {
    expect(
      readAll("Whenever you remove a time counter from ~ while it's exiled, surveil 1.").abilities,
    ).toMatchObject([{ trigger: { kind: 'removesCounterWhileExiled', counter: 'time' } }]);
  });

  test.each([
    'Whenever you remove a time counter from this card, surveil 1.',
    "Whenever you remove a +1/+1 counter from this card while it's exiled, surveil 1.",
    "Whenever an opponent removes a time counter from this card while it's exiled, surveil 1.",
    "Whenever you remove a time counter from another card while it's exiled, surveil 1.",
    "Whenever you remove one or more time counters from this card while it's exiled, surveil 1.",
  ])('is not read: %s', (text) => NOT_READ(text));
});

describe('"Surveil N. When you do, ..." (Dream Eater, CR 701.25a, 603.12)', () => {
  const RETURN = {
    kind: 'reflexive',
    targets: [
      {
        id: 't1',
        what: {
          kind: 'object',
          filter: { zone: 'battlefield', notTypes: ['land'], controller: 'opponent' },
        },
      },
    ],
    effect: {
      kind: 'may',
      effect: { kind: 'moveToZone', objects: { kind: 'target', id: 't1' }, to: 'hand' },
    },
  };

  test('the real line: a reflexive ability, with the offer inside it and its own target', () => {
    expect(
      readAll(
        "When ~ enters, surveil 4. When you do, you may return target nonland permanent an opponent controls to its owner's hand.",
      ).abilities,
    ).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        effect: { kind: 'sequence', effects: [{ kind: 'surveil', count: 4 }, RETURN] },
      },
    ]);
  });

  test('without the offer, the effect is the plain one (SYNTHETIC)', () => {
    expect(
      readAll('When ~ enters, surveil 2. When you do, you gain 1 life.').abilities,
    ).toMatchObject([
      {
        effect: {
          effects: [
            { kind: 'surveil', count: 2 },
            { kind: 'reflexive', effect: { kind: 'gainLife', amount: 1 } },
          ],
        },
      },
    ]);
  });

  test.each([
    // The offer is read only after a surveil: after an instruction this reading does not know, the reflexive ability stays unread.
    'When ~ enters, scry 2. When you do, you may return target nonland permanent an opponent controls to its owner’s hand.',
    // Two instructions in the reflexive ability.
    'When ~ enters, surveil 2. When you do, you may draw a card and you gain 1 life.',
  ])('is not read: %s', (text) => NOT_READ(text));
});

describe('"You may look at an additional two cards each time you surveil." (Enhanced Surveillance, CR 701.25a)', () => {
  test('the real line', () => {
    expect(
      readAll('You may look at an additional two cards each time you surveil.', 'enchantment')
        .abilities,
    ).toEqual([{ kind: 'static', static: { kind: 'surveilLookAdditional', count: 2 } }]);
  });

  test('one card, three cards (SYNTHETIC)', () => {
    expect(
      readAll('You may look at an additional card each time you surveil.', 'enchantment').abilities,
    ).toEqual([{ kind: 'static', static: { kind: 'surveilLookAdditional', count: 1 } }]);
    expect(
      readAll('You may look at an additional three cards each time you surveil.', 'enchantment')
        .abilities,
    ).toEqual([{ kind: 'static', static: { kind: 'surveilLookAdditional', count: 3 } }]);
  });

  test.each([
    'You may look at an additional two cards each time you scry.',
    'You may look at an additional two cards each time an opponent surveils.',
    'You may look at an additional 2 cards each time you surveil.',
  ])('is not read: %s', (text) => NOT_READ(text, 'enchantment'));
});

describe('"You may play lands and cast spells from among cards in your graveyard you’ve surveilled this turn. ..." (Eye of Duskmantle, CR 701.25a, 118.9)', () => {
  const REAL =
    'You may play lands and cast spells from among cards in your graveyard you’ve surveilled this turn. If you cast a spell this way, you pay life equal to its mana value rather than paying its mana cost.';

  test('the real two sentences are one static ability', () => {
    expect(readAll(REAL).abilities).toEqual([
      { kind: 'static', static: { kind: 'playSurveiledFromGraveyard' } },
    ]);
  });

  test.each([
    'You may play lands and cast spells from among cards in your graveyard you’ve surveilled this turn.',
    'You may play lands and cast spells from among cards in your graveyard you’ve surveilled. If you cast a spell this way, you pay life equal to its mana value rather than paying its mana cost.',
    'You may play lands and cast spells from among cards in a graveyard you’ve surveilled this turn. If you cast a spell this way, you pay life equal to its mana value rather than paying its mana cost.',
  ])('is not read: %s', (text) => NOT_READ(text));
});
