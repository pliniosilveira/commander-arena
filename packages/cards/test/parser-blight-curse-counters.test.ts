// The Blight Curse deck, the "counter triggers" group (Lorwyn Eclipsed): triggers, conditions and static effects keyed on counters. The first line of each block is the real Oracle
// text of a card of the golden corpus; the other lines are SYNTHETIC siblings and the near misses the grammar must not read (a card is supported or unsupported, never half-read). The
// engine runs what is lowered in convert-grammar-engine-blight-curse-counters.test.ts and in the engine's scenario-xx-blight-curse-counters.test.ts.
import { describe, expect, test } from 'vitest';
import { parseOnly } from './convert-grammar-helpers';
import { syntheticCard } from './convert-helpers';
import { dropped, readAll } from './parser-p5-helpers';

const YOU = { kind: 'you' } as const;

/**
 * The card imported through the whole pipeline (the grammar, then the engine's `validateCard`): a text the grammar reads but the engine would run on the wrong object (a trigger about a
 * spell has no creature to read) is as unsupported as a text no rule reads.
 */
const unsupported = (text: string, typeLine = 'Enchantment') =>
  parseOnly(syntheticCard({ name: 'SYNTHETIC Probe', typeLine, oracleText: text })).support.status;
const CREATURE = { types: ['creature'] } as const;

describe('"Whenever a -1/-1 counter is put on a creature" (CR 122.6, 603.2): once for each counter', () => {
  test('the real text of Flourishing Defenses', () => {
    const [ability] = readAll(
      'Whenever a -1/-1 counter is put on a creature, you may create a 1/1 green Elf Warrior creature token.',
      'enchantment',
    ).abilities;
    expect(ability).toMatchObject({
      kind: 'triggered',
      trigger: { kind: 'countersAdded', what: CREATURE, counter: '-1/-1', by: 'any', each: true },
      optional: true,
    });
  });

  test('SYNTHETIC: any kind of counter, on a permanent of the controller', () => {
    const [ability] = readAll(
      'Whenever a counter is put on a creature you control, draw a card.',
      'enchantment',
    ).abilities;
    expect(ability).toMatchObject({
      trigger: {
        kind: 'countersAdded',
        what: { types: ['creature'], controller: 'you' },
        by: 'any',
        each: true,
      },
    });
    expect(JSON.stringify(ability)).not.toContain('"counter":');
  });

  test('"one or more" is once for the instance of putting: no `each`', () => {
    const [ability] = readAll(
      'Whenever one or more -1/-1 counters are put on a creature, draw a card.',
      'enchantment',
    ).abilities;
    expect(ability).toMatchObject({
      trigger: { kind: 'countersAdded', counter: '-1/-1', by: 'any' },
    });
    expect(JSON.stringify(ability)).not.toContain('"each"');
  });

  test.each([
    'Whenever a -1/-1 counters is put on a creature, draw a card.',
    'Whenever a -1/-1 counter is removed from a creature, draw a card.',
    'Whenever a -1/-1 counter is put on target creature, draw a card.',
    'Whenever you put a -1/-1 counter on a creature, draw a card.',
  ])('not read: %s', (text) => {
    expect(unsupported(text)).toBe('unsupported');
  });
});

describe('"draw a card if you control that creature. If you don\'t control it, ..." (CR 603.10a, 608.2h)', () => {
  test('the real text of Auntie Ool: two conditional instructions on the creature the trigger is about', () => {
    const [ability] = readAll(
      "Whenever one or more -1/-1 counters are put on a creature, draw a card if you control that creature. If you don't control it, its controller loses 1 life.",
      'creature',
    ).abilities;
    expect(ability).toMatchObject({
      kind: 'triggered',
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'conditional', condition: { kind: 'subjectControlledByYou' } },
          {
            kind: 'conditional',
            condition: { kind: 'not', term: { kind: 'subjectControlledByYou' } },
          },
        ],
      },
    });
  });

  test('SYNTHETIC: a different instruction, and the same words in a death trigger', () => {
    const [ability] = readAll(
      'Whenever a creature dies, you gain 2 life if you control that creature.',
      'enchantment',
    ).abilities;
    expect(ability).toMatchObject({
      trigger: { kind: 'dies', what: CREATURE },
      effect: {
        kind: 'conditional',
        condition: { kind: 'subjectControlledByYou' },
        effect: { kind: 'gainLife', player: YOU, amount: 2 },
      },
    });
  });

  test.each([
    // No creature the trigger is about: a spell has no "that creature" to read.
    'Draw a card if you control that creature.',
    // A target is not the permanent the trigger is about.
    'Whenever you cast a spell, draw a card if you control that creature.',
    'Whenever a creature dies, draw a card if an opponent controls that creature.',
    'Whenever a creature dies, draw a card if you control that permanent.',
    'Whenever a creature dies, draw a card if you control it and it was blue.',
  ])('not read: %s', (text) => {
    expect(unsupported(text)).toBe('unsupported');
  });
});

describe('"if its toughness was less than 1" (CR 603.10a, 113.7a, 208.1)', () => {
  test('the real text of Massacre Girl: the intervening "if" of the death trigger', () => {
    const [ability] = readAll(
      'Whenever a creature an opponent controls dies, if its toughness was less than 1, draw a card.',
      'creature',
    ).abilities;
    expect(ability).toMatchObject({
      trigger: { kind: 'dies', what: { types: ['creature'], controller: 'opponent' } },
      interveningIf: {
        kind: 'subjectStat',
        stat: 'toughness',
        compare: { cmp: 'atMost', value: 0 },
      },
      effect: { kind: 'draw', player: YOU, count: 1 },
    });
  });

  test.each([
    ['its power was 3 or greater', 'power', { cmp: 'atLeast', value: 3 }],
    ['its power was greater than 3', 'power', { cmp: 'atLeast', value: 4 }],
    ['its toughness was 2 or less', 'toughness', { cmp: 'atMost', value: 2 }],
  ])('SYNTHETIC: %s', (words, stat, compare) => {
    const [ability] = readAll(
      `Whenever a creature dies, if ${words}, draw a card.`,
      'enchantment',
    ).abilities;
    expect(ability).toMatchObject({ interveningIf: { kind: 'subjectStat', stat, compare } });
  });

  test.each([
    // Another trigger than one about a permanent has no creature whose toughness it was.
    'At the beginning of your end step, if its toughness was less than 1, draw a card.',
    'Whenever a creature dies, if its toughness was less than one, draw a card.',
    'Whenever a creature dies, if its loyalty was less than 1, draw a card.',
    'Whenever a creature dies, draw a card if its toughness was less than 1.',
  ])('not read: %s', (text) => {
    expect(unsupported(text)).toBe('unsupported');
  });
});

describe('"if you put a counter on a creature this turn" (CR 122.6, 603.4)', () => {
  test('the real text of Lasting Tarfire', () => {
    const [ability] = readAll(
      'At the beginning of each end step, if you put a counter on a creature this turn, ~ deals 2 damage to each opponent.',
      'enchantment',
    ).abilities;
    expect(ability).toMatchObject({
      trigger: { kind: 'endStep', whose: 'each' },
      interveningIf: { kind: 'putCountersThisTurn', onType: 'creature' },
      effect: { kind: 'dealDamage', amount: 2, to: { kind: 'eachOpponent' } },
    });
  });

  test.each([
    ['you put a +1/+1 counter on a creature this turn', { counter: '+1/+1', onType: 'creature' }],
    ['you put a stun counter on a permanent this turn', { counter: 'stun' }],
    ['you put a counter on a permanent this turn', {}],
  ])('SYNTHETIC: %s', (words, rest) => {
    const [ability] = readAll(
      `At the beginning of your end step, if ${words}, draw a card.`,
      'enchantment',
    ).abilities;
    expect(ability).toMatchObject({
      interveningIf: { kind: 'putCountersThisTurn', ...rest },
    });
  });

  test.each([
    'At the beginning of each end step, if you put a counter on a land this turn, draw a card.',
    'At the beginning of each end step, if you put two counters on a creature this turn, draw a card.',
    'At the beginning of each end step, if an opponent put a counter on a creature this turn, draw a card.',
    'At the beginning of each end step, if you put a counter on a creature last turn, draw a card.',
  ])('not read: %s', (text) => {
    expect(unsupported(text)).toBe('unsupported');
  });
});

describe('"can\'t attack or block" of a group (CR 508.1a, 509.1a)', () => {
  const restrictions = (text: string) =>
    readAll(text, 'enchantment')
      .abilities.flatMap((a) =>
        a.kind === 'static' && a.static.kind === 'restriction' ? [a.static.restriction] : [],
      )
      .sort();

  test('the real text of Kulrath Knight: two restrictions for the creatures of the opponents that have counters', () => {
    const face = readAll(
      "Creatures your opponents control with counters on them can't attack or block.",
      'creature',
    );
    expect(face.abilities).toEqual([
      {
        kind: 'static',
        static: {
          kind: 'restriction',
          subject: {
            kind: 'filter',
            filter: { types: ['creature'], controller: 'opponent', hasCounter: true },
          },
          restriction: 'cantAttack',
        },
      },
      {
        kind: 'static',
        static: {
          kind: 'restriction',
          subject: {
            kind: 'filter',
            filter: { types: ['creature'], controller: 'opponent', hasCounter: true },
          },
          restriction: 'cantBlock',
        },
      },
    ]);
  });

  test('SYNTHETIC: one restriction alone', () => {
    expect(restrictions("Creatures you control can't attack.")).toEqual(['cantAttack']);
    expect(restrictions("Creatures your opponents control can't block.")).toEqual(['cantBlock']);
  });

  test.each([
    "Creatures your opponents control can't attack or block alone.",
    "Creatures your opponents control can't attack or block unless you pay {1}.",
    "Creatures your opponents control can't attack or blocks.",
  ])('not read: %s', (text) => {
    expect(unsupported(text)).toBe('unsupported');
  });
});

describe('"put that card onto the battlefield under your control" (CR 400.7, 603.10a, 110.2a)', () => {
  test('the real text of The Reaper: the card the creature became, an optional instruction done once each turn', () => {
    const [ability] = readAll(
      'Whenever a creature an opponent controls with a -1/-1 counter on it dies, you may put that card onto the battlefield under your control. Do this only once each turn.',
      'creature',
    ).abilities;
    expect(ability).toMatchObject({
      trigger: {
        kind: 'dies',
        what: { types: ['creature'], controller: 'opponent', hasCounter: '-1/-1' },
      },
      effect: {
        kind: 'moveToZone',
        objects: { kind: 'triggerCard' },
        to: 'battlefield',
        controller: 'you',
      },
      optional: true,
      doOnlyOnceEachTurn: true,
    });
  });

  test('SYNTHETIC: tapped, and the owner control', () => {
    const [ability] = readAll(
      "Whenever a creature you control dies, put that card onto the battlefield tapped under its owner's control.",
      'enchantment',
    ).abilities;
    expect(ability).toMatchObject({
      effect: {
        kind: 'moveToZone',
        objects: { kind: 'triggerCard' },
        to: 'battlefield',
        tapped: true,
        controller: 'owner',
      },
    });
  });

  test.each([
    // The words name a card no trigger about a permanent that died has.
    'Put that card onto the battlefield under your control.',
    'Whenever you cast a spell, put that card onto the battlefield under your control.',
    'Whenever a creature dies, put that card into your hand.',
    'Whenever a creature dies, put those cards onto the battlefield.',
  ])('not read: %s', (text) => {
    expect(unsupported(text)).toBe('unsupported');
  });
});

describe('"another target permanent card with mana value less than or equal to the number of counters on that creature" (CR 202.3, 122.1, 603.10a)', () => {
  test("the real text of Puca's Covenant", () => {
    const [ability] = readAll(
      'Whenever a creature you control with a counter on it dies, you may return another target permanent card with mana value less than or equal to the number of counters on that creature from your graveyard to your hand. Do this only once each turn.',
      'enchantment',
    ).abilities;
    expect(ability).toMatchObject({
      trigger: {
        kind: 'dies',
        what: { types: ['creature'], controller: 'you', hasCounter: true },
      },
      targets: [
        {
          what: {
            kind: 'object',
            filter: {
              zone: 'graveyard',
              notTriggerCard: true,
              manaValueAtMost: { kind: 'countersOn', of: { kind: 'triggerSubject' } },
            },
          },
        },
      ],
      effect: { kind: 'moveToZone', to: 'hand' },
      optional: true,
      doOnlyOnceEachTurn: true,
    });
  });

  test('without "another" the creature card itself is a target too: no `notTriggerCard`', () => {
    const [ability] = readAll(
      'Whenever a creature you control dies, return target creature card with mana value less than or equal to the number of counters on that creature from your graveyard to your hand.',
      'enchantment',
    ).abilities;
    expect(JSON.stringify(ability)).not.toContain('notTriggerCard');
    expect(JSON.stringify(ability)).toContain('"kind":"countersOn"');
  });

  test.each([
    // The counters of a permanent that is not the one the trigger is about, a kind named, or a number the engine does not read.
    'Whenever you cast a spell, return target creature card with mana value less than or equal to the number of counters on that creature from your graveyard to your hand.',
    'Whenever a creature you control dies, return target creature card with mana value less than or equal to the number of counters on target creature from your graveyard to your hand.',
    'Whenever a creature you control dies, return target creature card with mana value less than or equal to the number of +1/+1 counters on that creature from your graveyard to your hand.',
  ])('not read: %s', (text) => {
    expect(unsupported(text)).toBe('unsupported');
  });
});

describe('"its owner draws that many cards and each other player loses that much life" (CR 603.10a, 122.1, 102.1)', () => {
  test('the real text of the death trigger of Oft-Nabbed Goat', () => {
    const [ability] = readAll(
      'When ~ dies, if it had one or more -1/-1 counters on it, its owner draws that many cards and each other player loses that much life.',
      'creature',
    ).abilities;
    expect(ability).toMatchObject({
      trigger: { kind: 'dies', what: { kind: 'this' } },
      interveningIf: { kind: 'sourceHasCounter', counter: '-1/-1' },
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'draw', player: { kind: 'ownerOf' } },
          { kind: 'loseLife', player: { kind: 'eachPlayerExcept' } },
        ],
      },
    });
  });

  test('"each other player" after "you" stays "each opponent"', () => {
    const [ability] = readAll(
      'When ~ dies, you draw a card and each other player loses 1 life.',
      'creature',
    ).abilities;
    expect(ability).toMatchObject({
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'draw', player: YOU },
          { kind: 'loseLife', player: { kind: 'eachOpponent' } },
        ],
      },
    });
  });

  test.each([
    // A number the counters do not give: no "one or more" said, a kind of counter left out, or a trigger about another creature.
    'When ~ dies, if it had counters on it, its owner draws that many cards.',
    'When ~ dies, if it had one or more counters on it, its owner draws that many cards.',
    'Whenever a creature dies, if it had one or more -1/-1 counters on it, its owner draws that many cards.',
    'When ~ dies, its owner draws that many cards.',
  ])('not read: %s', (text) => {
    expect(dropped(text, 'creature')).toBeDefined();
  });
});
