// The Niv-Mizzet deck (issue 25), three cards that need only the text parser (class T): the lines of `REAL` are the real Oracle text of Elixir of
// Immortality, Dragonologist and Thunderdrum Soloist (names replaced by ~, the corpus's golden.jsonl), each with the nodes the grammar produces for
// it. The engine plays them in convert-grammar-engine-niv-text.test.ts. Lines marked SYNTHETIC say the same things over other types and numbers.
import { describe, expect, test } from 'vitest';
import { dropped, type FaceType, readAll } from './parser-p5-helpers';

const THIS = { kind: 'this' } as const;
const YOU = { kind: 'you' } as const;

const abilitiesOf = (text: string, type: FaceType = 'creature', subtypes: readonly string[] = []) =>
  readAll(text, type, subtypes).abilities;

describe('Elixir of Immortality: "Shuffle ~ and your graveyard into their owner\'s library" (CR 701.24c, 701.24d, 404.1, 903.9a)', () => {
  const TEXT =
    "{2}, {T}: You gain 5 life. Shuffle ~ and your graveyard into their owner's library.";

  test('the real text reads: the artifact and the graveyard move to their owners libraries, then both libraries are shuffled', () => {
    expect(abilitiesOf(TEXT, 'artifact')).toEqual([
      {
        kind: 'activated',
        cost: [{ kind: 'mana', symbols: ['2'] }, { kind: 'tap' }],
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'gainLife', player: YOU, amount: 5 },
            { kind: 'moveToZone', objects: THIS, to: 'library' },
            {
              kind: 'moveToZone',
              objects: { kind: 'each', filter: { zone: 'graveyard', controller: 'you' } },
              to: 'library',
            },
            {
              kind: 'shuffle',
              player: { kind: 'all', of: [YOU, { kind: 'ownerOf', of: THIS }] },
            },
          ],
        },
      },
    ]);
  });

  test('SYNTHETIC: said as the effect of a spell or a triggered ability', () => {
    expect(
      readAll("Shuffle ~ and your graveyard into their owner's library.", 'instant').spell?.effect,
    ).toMatchObject({ kind: 'sequence' });
    expect(
      abilitiesOf(
        "When ~ enters, shuffle ~ and your graveyard into their owner's library.",
        'creature',
      ),
    ).toHaveLength(1);
  });

  test.each([
    '{2}, {T}: Shuffle ~ and your graveyard into their library.',
    '{2}, {T}: Shuffle ~ and your graveyard into your library.',
    "{2}, {T}: Shuffle ~ into their owner's library.",
    "{2}, {T}: Shuffle ~ and all graveyards into their owner's library.",
    "{2}, {T}: Shuffle ~ and target player's graveyard into their owner's library.",
    "{2}, {T}: Shuffle ~ and your hand into their owner's library.",
    '{2}, {T}: Shuffle ~ and your graveyard.',
  ])('SYNTHETIC, stays unread: %s', (text) => {
    expect(dropped(text, 'artifact')).toMatchObject({ reason: 'unrecognised' });
  });

  test('the older wording, "shuffle your graveyard into your library", reads as it did', () => {
    expect(abilitiesOf('{2}, {T}: Shuffle your graveyard into your library.', 'artifact')).toEqual([
      {
        kind: 'activated',
        cost: [{ kind: 'mana', symbols: ['2'] }, { kind: 'tap' }],
        effect: {
          kind: 'sequence',
          effects: [
            {
              kind: 'moveToZone',
              objects: { kind: 'each', filter: { zone: 'graveyard', controller: 'you' } },
              to: 'library',
            },
            { kind: 'shuffle', player: YOU },
          ],
        },
      },
    ]);
  });
});

describe('Dragonologist: "an instant, sorcery, or Dragon card" among the cards looked at (CR 401.2, 701.20a, 205.2a, 205.3)', () => {
  const LOOK = 'look at the top six cards of your library.';
  const REST = 'Put the rest on the bottom of your library in a random order.';
  const TEXT = `When ~ enters, ${LOOK} You may reveal an instant, sorcery, or Dragon card from among them and put it into your hand. ${REST}`;

  test('the real text reads: one card of three kinds, the rest on the bottom in a random order', () => {
    expect(abilitiesOf(TEXT)).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: THIS },
        effect: {
          kind: 'lookAtTop',
          count: 6,
          take: {
            filter: {
              anyOf: [{ types: ['instant'] }, { types: ['sorcery'] }, { subtypes: ['Dragon'] }],
            },
            max: 1,
          },
          rest: 'bottomRandom',
        },
      },
    ]);
  });

  test.each([
    ['an instant or Dragon card', [{ types: ['instant'] }, { subtypes: ['Dragon'] }]],
    [
      'a Dragon, instant, or sorcery card',
      [{ subtypes: ['Dragon'] }, { types: ['instant'] }, { types: ['sorcery'] }],
    ],
    [
      'a creature, land, or Elf card',
      [{ types: ['creature'] }, { types: ['land'] }, { subtypes: ['Elf'] }],
    ],
    ['an artifact or Wizard card', [{ types: ['artifact'] }, { subtypes: ['Wizard'] }]],
    [
      'a Dragon, Elf, or Wizard card',
      [{ subtypes: ['Dragon'] }, { subtypes: ['Elf'] }, { subtypes: ['Wizard'] }],
    ],
  ])('SYNTHETIC: %s', (taken, anyOf) => {
    const text = `When ~ enters, ${LOOK} You may reveal ${taken} from among them and put it into your hand. ${REST}`;
    expect(abilitiesOf(text)).toMatchObject([
      { effect: { kind: 'lookAtTop', take: { filter: { anyOf }, max: 1 } } },
    ]);
  });

  test.each([
    'a Dragon or Elf creature card',
    'an instant, sorcery, or sorcery card',
    'an instant, sorcery or Dragon card',
    'an instant, sorcery, or Dragons card',
    'an instant, sorcery, or dragon card',
    'an instant, sorcery, or Dragon',
    'an instant, or Dragon card',
    'an instant, sorcery, Dragon card',
    'an instant, sorcery, or Bogus card',
  ])('SYNTHETIC, stays unread: %s', (taken) => {
    const text = `When ~ enters, ${LOOK} You may reveal ${taken} from among them and put it into your hand. ${REST}`;
    expect(dropped(text, 'creature')).toMatchObject({ reason: 'unrecognised' });
  });

  test('the readings of one kind or one list of types are unchanged', () => {
    for (const [taken, filter] of [
      ['a creature or land card', { anyOf: [{ types: ['creature'] }, { types: ['land'] }] }],
      ['a Dragon card', { subtypes: ['Dragon'] }],
      ['an artifact card', { types: ['artifact'] }],
    ] as const) {
      const text = `When ~ enters, ${LOOK} You may reveal ${taken} from among them and put it into your hand. ${REST}`;
      expect(abilitiesOf(text)).toMatchObject([{ effect: { take: { filter, max: 1 } } }]);
    }
  });

  test('the static line of the card reads too: untapped Dragons you control have hexproof', () => {
    expect(abilitiesOf('Untapped Dragons you control have hexproof.')).toHaveLength(1);
  });
});

describe('Thunderdrum Soloist: "If five or more mana was spent to cast that spell, ... instead" (CR 601.2h, 707.10, 608.2c, 614.1a)', () => {
  const FIRST = 'Whenever you cast an instant or sorcery spell, ~ deals 1 damage to each opponent.';
  const TEXT = `${FIRST} If five or more mana was spent to cast that spell, ~ deals 3 damage to each opponent instead.`;
  const TRIGGER = {
    kind: 'castSpell',
    filter: { stackKind: 'spell', anyOf: [{ types: ['instant'] }, { types: ['sorcery'] }] },
    by: 'you',
  };
  const damage = (amount: number) => ({
    kind: 'dealDamage',
    amount,
    to: { kind: 'eachOpponent' },
  });

  test('the real text reads: three damage when five mana was spent, one damage otherwise', () => {
    expect(abilitiesOf(`Reach\nOpus — ${TEXT}`, 'creature', ['Dwarf', 'Bard'])).toEqual([
      { kind: 'keyword', keyword: { kind: 'reach' } },
      {
        kind: 'triggered',
        trigger: TRIGGER,
        effect: {
          kind: 'conditional',
          condition: { kind: 'manaSpentAtLeast', count: 5 },
          effect: damage(3),
          else: damage(1),
        },
      },
    ]);
  });

  test('SYNTHETIC: other numbers, and the number in digits', () => {
    const text = `${FIRST} If 7 or more mana was spent to cast that spell, ~ deals 5 damage to each opponent instead.`;
    expect(abilitiesOf(text)).toMatchObject([
      {
        effect: {
          kind: 'conditional',
          condition: { kind: 'manaSpentAtLeast', count: 7 },
          effect: damage(5),
          else: damage(1),
        },
      },
    ]);
  });

  test.each([
    `${FIRST} If five or fewer mana was spent to cast that spell, ~ deals 3 damage to each opponent instead.`,
    `${FIRST} If at most five mana was spent to cast that spell, ~ deals 3 damage to each opponent instead.`,
    `${FIRST} If five or more {R}{R} was spent to cast that spell, ~ deals 3 damage to each opponent instead.`,
    `${FIRST} If five or more mana was spent to cast this spell, ~ deals 3 damage to each opponent instead.`,
    `${FIRST} If five or more mana were spent to cast that spell, ~ deals 3 damage to each opponent instead.`,
    `${FIRST} If zero or more mana was spent to cast that spell, ~ deals 3 damage to each opponent instead.`,
    `${FIRST} If five or more mana was spent, ~ deals 3 damage to each opponent instead.`,
  ])('SYNTHETIC, stays unread: %s', (text) => {
    expect(dropped(text, 'creature')).toMatchObject({ reason: 'unrecognised' });
  });

  test('SYNTHETIC: without "instead" it is a second instruction that is followed only when the mana was spent (the damage adds up)', () => {
    const text = `${FIRST} If five or more mana was spent to cast that spell, ~ deals 3 damage to each opponent.`;
    expect(abilitiesOf(text)).toMatchObject([
      {
        effect: {
          kind: 'sequence',
          effects: [
            damage(1),
            { kind: 'conditional', condition: { kind: 'manaSpentAtLeast', count: 5 } },
          ],
        },
      },
    ]);
  });

  test('SYNTHETIC: the condition is lowered in the body of a cast trigger only: not in a spell, not in another trigger, not in "when you cast this spell"', () => {
    const cond = 'If five or more mana was spent to cast that spell, you gain 3 life instead.';
    expect(dropped(`Counter target spell. ${cond}`, 'instant')).toBeDefined();
    expect(
      dropped(
        `Whenever a creature enters under your control, you gain 1 life. ${cond}`,
        'creature',
      ),
    ).toBeDefined();
    expect(dropped(`When you cast this spell, you gain 1 life. ${cond}`, 'creature')).toBeDefined();
  });

  test('the older wording of the intervening "if" reads as it did', () => {
    expect(
      abilitiesOf(
        'Whenever you cast a noncreature spell, if at least four mana was spent to cast it, you gain 1 life.',
      ),
    ).toMatchObject([{ kind: 'triggered' }]);
  });
});
