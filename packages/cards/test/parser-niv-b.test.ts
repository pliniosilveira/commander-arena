// The Niv-Mizzet deck (issue 25), group B (D-295 to D-298): four cards that only needed the text parser. "Each of one or two targets" and "one or two
// target creatures" (a minimum of one target, CR 115.1, 601.2c), a modal header that widens the choice to two modes (CR 700.2, 700.2a), and "if its mana
// value was 3 or less" (CR 202.3, 608.2c, 113.7a). The lines are the real Oracle text of the acceptance cards of the golden corpus (Prismari Charm,
// Untimely Malfunction, Flame of Anor, Fading Hope), names replaced by ~, read through the whole pipeline; the other lines are SYNTHETIC siblings and
// the near misses the grammar must not read. The engine runs what is lowered in convert-grammar-engine-niv-b.test.ts.
import { describe, expect, test } from 'vitest';
import { dropped, read, readAll } from './parser-p5-helpers';

const T1 = { kind: 'target', id: 't1' } as const;
const YOU = { kind: 'you' } as const;
const CREATURE_SLOT = {
  id: 't1',
  what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
} as const;

const spellOf = (text: string, type: 'instant' | 'sorcery' = 'instant') => {
  const spell = readAll(text, type).spell;
  if (spell === null || spell === undefined) throw new Error(`"${text}" has no spell`);
  return spell;
};

describe('"each of one or two targets" (Prismari Charm, CR 115.1, 601.2c)', () => {
  test('the real bullet: one slot of any target with a minimum of one and a maximum of two', () => {
    expect(spellOf('~ deals 1 damage to each of one or two targets.')).toEqual({
      targets: [{ id: 't1', what: { kind: 'anyTarget' }, min: 1, max: 2 }],
      effect: { kind: 'dealDamage', amount: 1, to: T1 },
    });
  });

  test.each([
    ['~ deals 3 damage to each of one or two targets.', 3],
    ['~ deals 7 damage to each of one or two targets.', 7],
  ])('a sibling over another number (SYNTHETIC): %s', (text, amount) => {
    expect(spellOf(text, 'sorcery').effect).toEqual({ kind: 'dealDamage', amount, to: T1 });
  });

  test('after a sentence with a target of its own, the slot is still its own (SYNTHETIC)', () => {
    const spell = spellOf(
      'Target creature gets +1/+1 until end of turn. ~ deals 1 damage to each of one or two targets.',
    );
    expect(spell.targets).toEqual([
      { id: 't1', what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } } },
      { id: 't2', what: { kind: 'anyTarget' }, min: 1, max: 2 },
    ]);
  });

  test.each([
    '~ deals 1 damage to each of one or two other targets.',
    '~ deals 1 damage to one or two targets.',
    '~ deals 1 damage to each of one or three targets.',
    '~ deals 1 damage to each of one or two target.',
    '~ deals 1 damage to each of one or two targets you control.',
    '~ deals 1 damage to each of one or two creatures.',
  ])('another wording is dropped, never half read: %s', (text) => {
    expect(read(text, 'instant').spell).toBeNull();
    expect(dropped(text, 'instant').reason).toBe('unrecognised');
  });
});

describe('"one or two target creatures can\'t block this turn" (Untimely Malfunction, CR 509.1b, 611.2a)', () => {
  test('the real bullet: a slot of creatures with a minimum of one and a maximum of two', () => {
    expect(spellOf("One or two target creatures can't block this turn.")).toEqual({
      targets: [{ ...CREATURE_SLOT, min: 1, max: 2 }],
      effect: {
        kind: 'restrict',
        objects: T1,
        restriction: 'cantBlock',
        duration: 'untilEndOfTurn',
      },
    });
  });

  test.each([
    ["One or two target creatures can't be blocked this turn.", 'cantBeBlocked'],
    ['One or two target creatures attack this turn if able.', 'attacksEachCombat'],
    ['One or two target creatures must be blocked this turn if able.', 'mustBeBlocked'],
    ["Up to two target creatures can't block this turn.", 'cantBlock'],
    ["Up to three target creatures can't be blocked this turn.", 'cantBeBlocked'],
    ['Up to two target creatures attack this turn if able.', 'attacksEachCombat'],
  ])('the siblings, in the plural, say the same restriction (SYNTHETIC): %s', (text, kind) => {
    const spell = spellOf(text);
    expect(spell.effect).toMatchObject({ kind: 'restrict', objects: T1, restriction: kind });
    expect(spell.targets).toHaveLength(1);
  });

  test('"up to two" has no minimum, "one or two" has one', () => {
    expect(spellOf("Up to two target creatures can't block this turn.").targets).toEqual([
      { ...CREATURE_SLOT, min: 0, max: 2 },
    ]);
    expect(spellOf("One or two target creatures can't block this turn.").targets).toEqual([
      { ...CREATURE_SLOT, min: 1, max: 2 },
    ]);
  });

  test('a target creature of an opponent keeps its controller in the slot (SYNTHETIC)', () => {
    expect(
      spellOf("One or two target creatures you don't control can't block this turn.").targets,
    ).toEqual([
      {
        id: 't1',
        what: {
          kind: 'object',
          filter: { zone: 'battlefield', types: ['creature'], controller: 'opponent' },
        },
        min: 1,
        max: 2,
      },
    ]);
  });

  test('the singular forms read as before', () => {
    expect(spellOf("Target creature can't block this turn.").targets).toEqual([CREATURE_SLOT]);
    expect(spellOf("Up to one target creature can't block this turn.").targets).toEqual([
      { ...CREATURE_SLOT, min: 0, max: 1 },
    ]);
  });

  test.each([
    // The singular verb with several creatures, and the plural verb with one.
    'One or two target creatures attacks this turn if able.',
    'Target creature attack this turn if able.',
    // Other restrictions, other creatures, other objects.
    "One or two target creatures can't attack this turn.",
    "One or two target permanents can't block this turn.",
    "One or two target creatures or planeswalkers can't block this turn.",
    "One or two target creatures can't block.",
    "One or two target creatures can't block this turn except by creatures with flying.",
    "One or three target creatures can't block this turn.",
    "One or two creatures can't block this turn.",
    // The exact count stays unread (no card needs it yet; ROADMAP).
    "Two target creatures can't block this turn.",
    "Up to that many target creatures can't block this turn.",
  ])('the near miss is dropped: %s', (text) => {
    expect(read(text, 'instant').spell).toBeNull();
    expect(dropped(text, 'instant').reason).toBe('unrecognised');
  });
});

describe('"Choose one. If you control a Wizard as you cast ~, you may choose two instead." (Flame of Anor, CR 700.2, 700.2a)', () => {
  const HEADER = 'Choose one. If you control a Wizard as you cast ~, you may choose two instead.';
  const BULLETS =
    '\n• Target player draws two cards.\n• Destroy target artifact.\n• ~ deals 5 damage to target creature.';

  test('the real header: one mode, or two while the controller controls a Wizard as the spell is cast', () => {
    const spell = spellOf(`${HEADER}${BULLETS}`);
    expect(spell.modes).toHaveLength(3);
    expect(spell.chooseModes).toEqual({
      min: 1,
      max: 1,
      maxIf: {
        condition: { kind: 'controlsAtLeast', filter: { subtypes: ['Wizard'] }, count: 1 },
        max: 2,
      },
    });
  });

  test('the widened maximum is two, not the number of modes (four bullets, SYNTHETIC)', () => {
    const spell = spellOf(`${HEADER}\n• Draw a card.\n• You gain 3 life.\n• Scry 1.\n• Surveil 1.`);
    expect(spell.modes).toHaveLength(4);
    expect(spell.chooseModes).toMatchObject({ min: 1, max: 1, maxIf: { max: 2 } });
  });

  test('two bullets: choosing two is choosing both (SYNTHETIC)', () => {
    const spell = spellOf(`${HEADER}\n• Draw a card.\n• You gain 3 life.`);
    expect(spell.chooseModes).toMatchObject({ min: 1, max: 1, maxIf: { max: 2 } });
  });

  test('another subtype and another permanent type read the same way (SYNTHETIC)', () => {
    expect(
      spellOf(
        'Choose one. If you control an artifact as you cast ~, you may choose two instead.\n• Draw a card.\n• You gain 3 life.\n• Scry 1.',
      ).chooseModes,
    ).toMatchObject({ max: 1, maxIf: { max: 2 } });
    expect(
      spellOf(
        'Choose one. If you control a Dragon as you cast ~, you may choose two instead.\n• Draw a card.\n• You gain 3 life.\n• Scry 1.',
      ).chooseModes,
    ).toMatchObject({
      maxIf: { condition: { filter: { subtypes: ['Dragon'] } }, max: 2 },
    });
  });

  test('the commander wording is untouched: both modes of two', () => {
    expect(
      spellOf(
        'Choose one. If you control a commander as you cast ~, you may choose both instead.\n• Draw a card.\n• You gain 3 life.',
      ).chooseModes,
    ).toEqual({
      min: 1,
      max: 1,
      maxIf: { condition: { kind: 'controlCommander' }, max: 2 },
    });
  });

  test.each([
    'Choose one. If you control a Wizard, you may choose two instead.',
    'Choose one. If you control a Wizard as you cast ~, you may choose two instead',
    'Choose one. If you control a Wizard as you cast ~, you may choose both instead.',
    'Choose one. If you control a Wizard as you cast ~, you may choose three instead.',
    'Choose one. If you control a Wizard as you cast ~, you may choose all instead.',
    'Choose one. If an opponent controls a Wizard as you cast ~, you may choose two instead.',
    'Choose one. If you control two Wizards as you cast ~, you may choose two instead.',
    'Choose two. If you control a Wizard as you cast ~, you may choose two instead.',
    'Choose one. If you control a Banana as you cast ~, you may choose two instead.',
  ])('another wording is not read: %s', (header) => {
    const text = `${header}${BULLETS}`;
    expect(read(text, 'instant').spell).toBeNull();
    expect(dropped(text, 'instant').reason).toBe('unrecognised');
  });
});

describe('"If its mana value was 3 or less, scry 1." (Fading Hope, CR 202.3, 608.2c, 113.7a)', () => {
  const BOUNCE = "Return target creature to its owner's hand.";
  const BOUNCED = { kind: 'moveToZone', objects: T1, to: 'hand' } as const;

  test("the real text: the creature goes to its owner's hand, then a conditional scry on what it was", () => {
    expect(spellOf(`${BOUNCE} If its mana value was 3 or less, scry 1.`)).toEqual({
      targets: [CREATURE_SLOT],
      effect: {
        kind: 'sequence',
        effects: [
          BOUNCED,
          {
            kind: 'conditional',
            condition: {
              kind: 'objectMatches',
              of: T1,
              filter: { manaValue: { cmp: 'atMost', value: 3 } },
            },
            effect: { kind: 'scry', count: 1 },
          },
        ],
      },
    });
  });

  test.each([
    ['its mana value was 3 or less', { cmp: 'atMost', value: 3 }],
    ['its mana value is 3 or less', { cmp: 'atMost', value: 3 }],
    ['its mana value was 4 or greater', { cmp: 'atLeast', value: 4 }],
    ['its mana value was 0', { cmp: 'equal', value: 0 }],
    ['its mana value was 2', { cmp: 'equal', value: 2 }],
  ])('%s: the comparison of the condition (SYNTHETIC siblings)', (words, compare) => {
    const effects = (
      spellOf(`${BOUNCE} If ${words}, you gain 2 life.`).effect as {
        effects: readonly { condition?: unknown }[];
      }
    ).effects;
    expect(effects[1]?.condition).toEqual({
      kind: 'objectMatches',
      of: T1,
      filter: { manaValue: compare },
    });
  });

  test('the condition is read after another verb and over another effect (SYNTHETIC)', () => {
    const effect = spellOf(
      'Exile target creature. If its mana value was 3 or less, draw a card.',
    ).effect;
    expect(effect).toMatchObject({
      kind: 'sequence',
      effects: [
        { kind: 'exile' },
        {
          kind: 'conditional',
          condition: { kind: 'objectMatches', of: T1, filter: { manaValue: { cmp: 'atMost' } } },
          effect: { kind: 'draw', player: YOU, count: 1 },
        },
      ],
    });
  });

  test.each([
    `${BOUNCE} If its mana value was 3 or less`,
    `${BOUNCE} If its mana value was three or less, scry 1.`,
    `${BOUNCE} If its mana value was X or less, scry 1.`,
    `${BOUNCE} If its mana value was 3 or fewer, scry 1.`,
    `${BOUNCE} If its mana value was 3 or less or it was a land, scry 1.`,
    `${BOUNCE} If its power was 3 or less, scry 1.`,
    `${BOUNCE} If its mana value was 3 or less and you control a Wizard, scry 1.`,
    `${BOUNCE} If their mana value was 3 or less, scry 1.`,
    `${BOUNCE} If mana value was 3 or less, scry 1.`,
  ])('the near miss is dropped: %s', (text) => {
    expect(read(text, 'instant').spell).toBeNull();
    expect(dropped(text, 'instant')).toBeDefined();
  });

  test('"its mana value" with nothing before it to name is not read (SYNTHETIC)', () => {
    expect(read('If its mana value was 3 or less, scry 1.', 'instant').spell).toBeNull();
  });
});
