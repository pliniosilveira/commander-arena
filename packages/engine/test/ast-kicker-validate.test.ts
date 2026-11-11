// Validation of Kicker, Flashback and the `kicked` condition (CR 702.33, 702.34): the shape of
// their costs, the cards that may carry them, and the engine limits that make a card unsupported.
// Also the support registry entries. Cards are SYNTHETIC or defined here.
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import type { Ability, CardDefinition, Cost, Effect, SpellText } from '../src/index';
import {
  isFeatureSupported,
  isKnownFeature,
  SUPPORTED_FEATURES,
  SYNTHETIC_CARDS,
  validateCard,
  validateCardStructure,
} from '../src/index';

const mana = (...symbols: string[]): Cost => ({ kind: 'mana', symbols });
const kicker = (...cost: Cost[]): Ability => ({
  kind: 'keyword',
  keyword: { kind: 'kicker', cost },
});
const flashback = (...cost: Cost[]): Ability => ({
  kind: 'keyword',
  keyword: { kind: 'flashback', cost },
});
const KICKED = { kind: 'kicked' } as const;
const gain = (amount: number): Effect => ({ kind: 'gainLife', player: { kind: 'you' }, amount });
const T1 = { kind: 'target', id: 't1' } as const;
const TARGET = {
  id: 't1',
  what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
} as const;

const spell = (
  abilities: readonly Ability[],
  text: SpellText,
  types: CardDefinition['faces'][number]['types'] = ['sorcery'],
): CardDefinition =>
  singleFace({
    name: 'SYNTHETIC Test Card',
    manaCost: ['1'],
    types,
    colors: [],
    colorIdentity: [],
    oracleText: 'text',
    abilities,
    spell: text,
  });

const messages = (card: CardDefinition): string[] => validateCard(card).map((i) => i.message);
/** Only the structural rules, not what the engine can run. */
const structure = (card: CardDefinition): string[] =>
  validateCardStructure(card).map((i) => i.message);

describe('the synthetic cards of this slice are valid and runnable', () => {
  for (const name of Object.keys(SYNTHETIC_CARDS).filter((n) =>
    /Kicker|Flash (Slay|Study|Gain)|Kick Flash|Rally Cry/.test(n),
  )) {
    test(name, () => {
      expect(validateCard(SYNTHETIC_CARDS[name] as CardDefinition)).toEqual([]);
    });
  }
});

describe('the support registry', () => {
  test('lists what the engine runs', () => {
    for (const ref of [
      'keyword:kicker',
      'keyword:flashback',
      'effect:conditional',
      'condition:kicked',
    ] as const) {
      expect(isKnownFeature(ref), ref).toBe(true);
      expect(isFeatureSupported(ref), ref).toBe(true);
    }
    // D-121 added the named alternative costs after these two.
    expect(SUPPORTED_FEATURES.castAlternatives).toEqual(
      expect.arrayContaining(['flashback', 'free']),
    );
  });
});

describe('kicker', () => {
  const kickedGain: SpellText = {
    effect: { kind: 'conditional', condition: KICKED, effect: gain(2), else: gain(1) },
  };

  test('a mana cost, a life cost or both are fine', () => {
    for (const cost of [
      [mana('2')],
      [{ kind: 'payLife', amount: 2 } as const],
      [mana('1'), { kind: 'payLife', amount: 1 } as const],
    ]) {
      expect(validateCard(spell([kicker(...cost)], kickedGain))).toEqual([]);
    }
  });

  test('other costs, X, an empty cost and a zero life cost are not', () => {
    expect(structure(spell([kicker({ kind: 'tap' })], kickedGain))).toEqual([
      'a kicker cost may be mana or life only',
    ]);
    expect(structure(spell([kicker(mana('X'))], kickedGain))).toEqual([
      'X in a kicker cost is not supported',
    ]);
    expect(structure(spell([kicker()], kickedGain))).toEqual([
      'cost list is empty (an ability with no cost must say {0}, CR 602.1)',
    ]);
    expect(structure(spell([kicker({ kind: 'payLife', amount: 0 })], kickedGain))).toContain(
      'life paid must be at least 1',
    );
  });

  test('the kicked condition needs a kicker (CR 702.33d): without one it would always be false', () => {
    const card = spell([], kickedGain);
    expect(validateCardStructure(card).map((i) => i.message)).toEqual([
      'the kicked condition needs a kicker ability (CR 702.33a, 702.33d)',
    ]);
    // A card of any other shape, an ability this time.
    const creature = singleFace({
      name: 'SYNTHETIC Test Creature',
      manaCost: ['1'],
      types: ['creature'],
      colors: [],
      colorIdentity: [],
      power: 1,
      toughness: 1,
      oracleText: 'text',
      abilities: [
        {
          kind: 'triggered',
          trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
          effect: { kind: 'conditional', condition: KICKED, effect: gain(1) },
        },
      ],
    });
    expect(validateCardStructure(creature)).toHaveLength(1);
  });

  test('a second kicker cost is not run (CR 702.33b); neither is Multikicker', () => {
    const two = spell([kicker(mana('1')), kicker(mana('2'))], kickedGain);
    expect(validateCardStructure(two)).toEqual([]);
    expect(messages(two)).toEqual([
      'more than one kicker or multikicker ability is not implemented by the engine yet',
    ]);
    expect(validateCard({ ...two, support: 'unsupported' })).toEqual([]);
    // D-110: Multikicker is run, but a card has one kicker ability or one multikicker, not both.
    const multi = (cost: ReturnType<typeof mana>) =>
      ({ kind: 'keyword', keyword: { kind: 'multikicker', cost: [cost] } }) as const;
    const both = spell([kicker(mana('1')), multi(mana('2'))], kickedGain);
    expect(messages(both)).toEqual([
      'more than one kicker or multikicker ability is not implemented by the engine yet',
    ]);
    expect(messages(spell([multi(mana('1'))], kickedGain))).toEqual([]);
  });

  test('a target that exists only if the spell was kicked is not asked for (CR 702.33g)', () => {
    const kickerOnly = spell([kicker(mana('2'))], {
      targets: [TARGET],
      effect: {
        kind: 'sequence',
        effects: [
          gain(1),
          {
            kind: 'conditional',
            condition: KICKED,
            effect: { kind: 'dealDamage', amount: 3, to: T1 },
          },
        ],
      },
    });
    expect(validateCardStructure(kickerOnly)).toEqual([]);
    // D-181: a slot that is used only in one case must say so (`ifKicked` or `unlessKicked`); an undeclared one is the engine asking a target the card does not need.
    expect(messages(kickerOnly)).toEqual([
      'target "t1" is used only if the spell was kicked (or only if it was not) but is not declared ifKicked or unlessKicked (CR 702.33g, 601.2c)',
    ]);
    // Used in both branches, or outside the conditional, the slot is needed either way.
    const bothBranches = spell([kicker(mana('2'))], {
      targets: [TARGET],
      effect: {
        kind: 'conditional',
        condition: KICKED,
        effect: { kind: 'dealDamage', amount: 4, to: T1 },
        else: { kind: 'dealDamage', amount: 2, to: T1 },
      },
    });
    expect(validateCard(bothBranches)).toEqual([]);
    // Also when the condition is wrapped: "if it was not kicked" guards the unkicked case only.
    const negated = spell([kicker(mana('2'))], {
      targets: [TARGET],
      effect: {
        kind: 'conditional',
        condition: { kind: 'not', term: KICKED },
        effect: { kind: 'dealDamage', amount: 2, to: T1 },
      },
    });
    expect(messages(negated)).toHaveLength(1);
  });

  describe('a target chosen only if the spell was kicked, or only if it was not (D-181, CR 702.33g, 601.2c)', () => {
    const ifKicked = { ...TARGET, ifKicked: true } as const;
    const unlessKicked = { ...TARGET, id: 't2', unlessKicked: true } as const;
    const T2 = { kind: 'target', id: 't2' } as const;
    const kickedOnly = (
      targets: NonNullable<SpellText['targets']>,
      effect: Effect,
      abilities = [kicker(mana('2'))],
    ) => spell(abilities, { targets, effect });
    const hit = (to: typeof T1 | typeof T2): Effect => ({ kind: 'dealDamage', amount: 3, to });

    test('declared and used only in the kicked branch: valid and run', () => {
      const card = kickedOnly([ifKicked], {
        kind: 'sequence',
        effects: [gain(1), { kind: 'conditional', condition: KICKED, effect: hit(T1) }],
      });
      expect(messages(card)).toEqual([]);
      expect(structure(card)).toEqual([]);
    });

    test('a kicked slot and an unkicked slot in the two branches of one conditional', () => {
      const card = kickedOnly([ifKicked, unlessKicked], {
        kind: 'conditional',
        condition: KICKED,
        effect: hit(T1),
        else: hit(T2),
      });
      expect(messages(card)).toEqual([]);
    });

    test('"not kicked" turns the branches around', () => {
      const card = kickedOnly([ifKicked], {
        kind: 'conditional',
        condition: { kind: 'not', term: KICKED },
        effect: gain(1),
        else: hit(T1),
      });
      expect(messages(card)).toEqual([]);
    });

    test('used where the spell may be unkicked: refused', () => {
      const outside = kickedOnly([ifKicked], hit(T1));
      expect(messages(outside)).toEqual([
        'target "t1" exists only if the spell was kicked (or only if it was not): use it only in the matching branch of a kicked conditional',
      ]);
      const wrongBranch = kickedOnly([ifKicked], {
        kind: 'conditional',
        condition: KICKED,
        effect: gain(1),
        else: hit(T1),
      });
      expect(messages(wrongBranch)).toHaveLength(1);
      const unkickedInKicked = kickedOnly([unlessKicked], {
        kind: 'conditional',
        condition: KICKED,
        effect: hit(T2),
        else: gain(1),
      });
      expect(messages(unkickedInKicked)).toHaveLength(1);
      // "if you control ..." says nothing sure about the kicker.
      const other = kickedOnly([ifKicked], {
        kind: 'conditional',
        condition: { kind: 'controlsAtLeast', filter: { types: ['creature'] }, count: 1 },
        effect: hit(T1),
      });
      expect(messages(other)).toHaveLength(1);
    });

    test('needs a kicker ability, and Kicker rather than Multikicker', () => {
      const effect: Effect = { kind: 'conditional', condition: KICKED, effect: hit(T1) };
      const none = spell([], { targets: [ifKicked], effect });
      expect(messages(none)).toContain(
        'a target chosen only if the spell was kicked needs a kicker ability (CR 702.33g)',
      );
      const multi = spell(
        [{ kind: 'keyword', keyword: { kind: 'multikicker', cost: [mana('1')] } }],
        { targets: [ifKicked], effect },
      );
      expect(messages(multi)).toContain(
        'a target chosen only if the spell was kicked is run with Kicker, not Multikicker (CR 702.33c, 702.33g)',
      );
    });

    test('not in a modal spell and not in an ability', () => {
      const modal = spell([kicker(mana('2'))], {
        effect: { kind: 'sequence', effects: [] },
        chooseModes: { min: 1, max: 1 },
        modes: [
          {
            text: 'Hit',
            targets: [ifKicked],
            effect: { kind: 'conditional', condition: KICKED, effect: hit(T1) },
          },
        ],
      });
      expect(messages(modal).some((m) => m.includes('modal spell'))).toBe(true);
      const ability = spell(
        [
          kicker(mana('2')),
          {
            kind: 'triggered',
            trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
            targets: [ifKicked],
            effect: hit(T1),
          },
        ],
        { effect: gain(1) },
        ['creature'],
      );
      expect(structure(ability).some((m) => m.includes("a spell's"))).toBe(true);
    });

    test('both flags on one slot, or a flag that is not true: refused', () => {
      const both = kickedOnly([{ ...TARGET, ifKicked: true, unlessKicked: true }], hit(T1));
      expect(structure(both).some((m) => m.includes('not both'))).toBe(true);
      const bad = kickedOnly([{ ...TARGET, ifKicked: false as unknown as true }], hit(T1));
      expect(structure(bad).some((m) => m.includes('ifKicked must be true'))).toBe(true);
    });
  });
});

describe('flashback', () => {
  const draw: SpellText = { effect: { kind: 'draw', player: { kind: 'you' }, count: 1 } };

  test('a mana cost on an instant or a sorcery is fine', () => {
    expect(validateCard(spell([flashback(mana('2', 'U'))], draw))).toEqual([]);
    expect(validateCard(spell([flashback(mana('2', 'U'))], draw, ['instant']))).toEqual([]);
  });

  test('only a mana cost: life, X and an empty cost are not', () => {
    expect(structure(spell([flashback({ kind: 'payLife', amount: 2 })], draw))).toEqual([
      'a flashback cost may be mana only',
    ]);
    expect(structure(spell([flashback(mana('X'))], draw))).toEqual([
      'X in a flashback cost is not supported',
    ]);
    expect(structure(spell([flashback()], draw))).toHaveLength(1);
  });

  test('not on a permanent (CR 702.34a)', () => {
    const creature = singleFace({
      name: 'SYNTHETIC Test Creature',
      manaCost: ['1'],
      types: ['creature'],
      colors: [],
      colorIdentity: [],
      power: 1,
      toughness: 1,
      oracleText: 'text',
      abilities: [flashback(mana('2'))],
    });
    expect(validateCardStructure(creature).map((i) => i.message)).toEqual([
      'flashback is on an instant or a sorcery (CR 702.34a)',
    ]);
  });

  test('a second flashback is not run: two alternative costs would need a choice (CR 118.9a)', () => {
    const two = spell([flashback(mana('2')), flashback(mana('3'))], draw);
    expect(messages(two)).toEqual([
      'more than one flashback ability is not implemented by the engine yet',
    ]);
  });
});
