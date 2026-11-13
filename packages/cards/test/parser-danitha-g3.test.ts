// The Danitha deck (issue 26), group 3 (D-1230 to D-1236 provisional): Kor Spiritdancer, Sage's Reverie, Winds of Rath, Ethereal Armor, Face of Divinity, Shield of the Oversoul,
// Shardmage's Rescue and Strong Back, the Auras and creatures whose text counts or checks the attachments of a permanent. The first test of each describe is the real Oracle text of the
// acceptance card of the golden corpus read through the whole pipeline; the other lines are SYNTHETIC siblings and the near misses the grammar must not read. The engine runs what is
// lowered in convert-grammar-engine-danitha-g3.test.ts.
import { describe, expect, test, vi } from 'vitest';

vi.mock('@commander-arena/engine', async (importOriginal) =>
  (await import('./blocked-features')).blockFeatures(
    await importOriginal<typeof import('@commander-arena/engine')>(),
  ),
);

import { DECLARED_NEEDS } from '../src/convert/parser/index';
import { BLOCKED } from './blocked-features';
import { read, readAll, withoutFeature } from './parser-p5-helpers';

const YOU = { kind: 'you' } as const;
const AURA = ['Aura'];
const ENCHANT = 'Enchant creature';
const HOST = { kind: 'attached', types: ['creature'] } as const;
const PLAIN_HOST = { kind: 'attached' } as const;
const SOURCE_AURAS = { kind: 'countOf', filter: { subtypes: ['Aura'], attachedTo: { kind: 'source' } } };
const ON_CREATURES = {
  subtypes: ['Aura'],
  controller: 'you',
  attachedTo: { kind: 'matching', filter: { types: ['creature'] } },
} as const;

/** The abilities of an Aura read completely, after its Enchant line. */
const aura = (line: string) => {
  const [, ...rest] = readAll(`${ENCHANT}\n${line}`, 'enchantment', AURA).abilities;
  return rest;
};
/** An ability of a creature read completely. */
const creature = (line: string) => readAll(line, 'creature').abilities;

/** A line that must be dropped whole, with the rest of the face still read (the Aura's Enchant line). */
const droppedAura = (line: string) => {
  const parsed = read(`${ENCHANT}\n${line}`, 'enchantment', AURA);
  expect(parsed.unparsed.length, line).toBe(1);
  expect(parsed.abilities.length, line).toBe(1);
};

describe('Kor Spiritdancer: "This creature gets +2/+2 for each Aura attached to it." (CR 303.4, 611.3a)', () => {
  const PT = (count: unknown, factor = 2) => ({
    kind: 'static',
    static: {
      kind: 'modifyPt',
      subject: { kind: 'this' },
      power: { kind: 'times', factor, of: count },
      toughness: { kind: 'times', factor, of: count },
    },
  });

  test('the real line: +2/+2 for each Aura attached to the creature itself', () => {
    expect(creature('This creature gets +2/+2 for each Aura attached to it.')).toEqual([
      PT(SOURCE_AURAS),
    ]);
  });

  test('+1/+1 is the count itself, an Equipment counts Equipment, "~" says the same (SYNTHETIC)', () => {
    expect(creature('~ gets +1/+1 for each Aura attached to it.')).toEqual([
      {
        kind: 'static',
        static: {
          kind: 'modifyPt',
          subject: { kind: 'this' },
          power: SOURCE_AURAS,
          toughness: SOURCE_AURAS,
        },
      },
    ]);
    expect(creature('~ gets +1/+0 for each Equipment attached to it.')).toMatchObject([
      {
        static: {
          power: { kind: 'countOf', filter: { subtypes: ['Equipment'], attachedTo: { kind: 'source' } } },
          toughness: 0,
        },
      },
    ]);
  });

  test('the Auras and Equipment attached to enchanted creature, counted for the host (SYNTHETIC)', () => {
    expect(
      aura('Enchanted creature gets +2/+2 for each Aura and Equipment attached to it.'),
    ).toMatchObject([
      {
        static: {
          kind: 'modifyPt',
          subject: HOST,
          power: {
            kind: 'times',
            factor: 2,
            of: {
              kind: 'countOf',
              filter: {
                attachedTo: { kind: 'host' },
                anyOf: [{ subtypes: ['Aura'] }, { subtypes: ['Equipment'] }],
              },
            },
          },
        },
      },
    ]);
  });

  test.each([
    // "it" of a group, or of an object the count does not know
    'Creatures you control get +1/+1 for each Aura attached to it.',
    'Other creatures you control get +1/+1 for each Aura attached to it.',
    // another thing attached to, another phrase
    '~ gets +1/+1 for each Aura attached to target creature.',
    '~ gets +1/+1 for each Aura attached to a creature.',
    '~ gets +1/+1 for each Aura attached to enchanted creature.',
    '~ gets +1/+1 for each Auras attached to it.',
    '~ gets +1/+1 for each Aura attached to them.',
    '~ gets +1/+1 for each Aura that is attached to it.',
    '~ gets +1/+1 for each attached Aura.',
    '~ gets +1/+1 for each Aura attached to it and each land you control.',
  ])('another wording is dropped, never half read (SYNTHETIC): %s', (line) => {
    const parsed = read(line, 'creature');
    expect(parsed.unparsed.length, line).toBe(1);
    expect(parsed.abilities.length, line).toBe(0);
  });

  test('the controller of the Auras is part of the count (SYNTHETIC)', () => {
    expect(creature('~ gets +1/+1 for each Aura you control attached to it.')).toMatchObject([
      {
        static: {
          power: {
            kind: 'countOf',
            filter: { subtypes: ['Aura'], controller: 'you', attachedTo: { kind: 'source' } },
          },
        },
      },
    ]);
  });

  test('a count of attachments is dropped by an effect that cannot bind "it" (SYNTHETIC)', () => {
    const parsed = read('When ~ enters, draw a card for each Aura attached to it.', 'creature');
    expect(parsed.unparsed.length).toBe(1);
  });

  test('the lowering names the engine feature it needs', () => {
    const missing = withoutFeature(
      'selector:attachedTo',
      '~ gets +2/+2 for each Aura attached to it.',
      'creature',
    );
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toContain('selector:attachedTo');
  });
});

describe("Sage's Reverie: \"draw a card for each Aura you control that's attached to a creature\" (CR 303.4, 608.2c)", () => {
  const COUNT = { kind: 'countOf', filter: ON_CREATURES };

  test('the real lines: the draw as the Aura enters, and the bonus of the creature', () => {
    const [trigger, bonus] = aura(
      "When ~ enters, draw a card for each Aura you control that's attached to a creature.\nEnchanted creature gets +1/+1 for each Aura you control that's attached to a creature.",
    );
    expect(trigger).toEqual({
      kind: 'triggered',
      trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
      effect: { kind: 'draw', player: YOU, count: COUNT },
    });
    expect(bonus).toEqual({
      kind: 'static',
      static: { kind: 'modifyPt', subject: HOST, power: COUNT, toughness: COUNT },
    });
  });

  test('the curly apostrophe of Oracle text reads the same (SYNTHETIC)', () => {
    expect(
      aura('When ~ enters, draw a card for each Aura you control that’s attached to a creature.')[0],
    ).toMatchObject({ effect: { count: COUNT } });
  });

  test('an instant draws the same count (SYNTHETIC)', () => {
    expect(
      readAll("Draw a card for each Aura you control that's attached to a creature.", 'instant').spell,
    ).toEqual({ effect: { kind: 'draw', player: YOU, count: COUNT } });
  });

  test('no controller, and the opponents (SYNTHETIC)', () => {
    const count = (filter: object) => ({ effect: { count: { kind: 'countOf', filter } } });
    expect(
      readAll("Draw a card for each Aura that's attached to a creature.", 'instant').spell,
    ).toMatchObject(count({ subtypes: ['Aura'], attachedTo: { kind: 'matching' } }));
    expect(
      readAll("Draw a card for each Aura your opponents control that's attached to a creature.", 'instant')
        .spell,
    ).toMatchObject(count({ subtypes: ['Aura'], controller: 'opponent' }));
  });

  test.each([
    "Draw a card for each Aura you control that's attached to a land.",
    "Draw a card for each Aura you control that's attached to target creature.",
    "Draw a card for each Aura you control that's attached to a creature you control.",
    "Draw a card for each Aura you control that's attached to an artifact.",
    "Draw a card for each Aura you control that's attached.",
    "Draw a card for each Aura you control that's attached to creature.",
    "Draw a card for each Auras you control that's attached to a creature.",
  ])('another wording is dropped, never half read (SYNTHETIC): %s', (line) => {
    const parsed = read(line, 'instant');
    expect(parsed.unparsed.length, line).toBe(1);
    expect(parsed.spell, line).toBeNull();
  });
});

describe('Winds of Rath: "Destroy all creatures that aren\'t enchanted. They can\'t be regenerated." (CR 303.4, 701.8, 701.19c)', () => {
  const destroy = (text: string, regenerated = true) => ({
    targets: undefined,
    effect: {
      kind: 'destroy',
      objects: { kind: 'each', filter: { zone: 'battlefield', types: ['creature'], enchanted: false } },
      ...(regenerated ? { cantBeRegenerated: true } : {}),
    },
    text,
  });

  test('the real text: every creature with no Aura attached, and shields do not help', () => {
    const spell = readAll(
      "Destroy all creatures that aren't enchanted. They can't be regenerated.",
      'sorcery',
    ).spell;
    expect(spell).toMatchObject({ effect: destroy('').effect });
  });

  test('without the second sentence, and the other direction (SYNTHETIC)', () => {
    expect(
      readAll("Destroy all creatures that aren't enchanted.", 'sorcery').spell?.effect,
    ).toEqual(destroy('', false).effect);
    expect(readAll('Destroy all creatures that are enchanted.', 'sorcery').spell?.effect).toEqual({
      kind: 'destroy',
      objects: { kind: 'each', filter: { zone: 'battlefield', types: ['creature'], enchanted: true } },
    });
  });

  test('a controller, other types and "other" read, and other verbs take the group too (SYNTHETIC)', () => {
    expect(
      readAll("Destroy all creatures you control that aren't enchanted.", 'sorcery').spell?.effect,
    ).toMatchObject({
      objects: { filter: { types: ['creature'], controller: 'you', enchanted: false } },
    });
    expect(
      readAll("Destroy all nonland permanents that aren't enchanted.", 'sorcery').spell?.effect,
    ).toMatchObject({ objects: { filter: { notTypes: ['land'], enchanted: false } } });
    expect(
      readAll("Exile all creatures that aren't enchanted.", 'sorcery').spell?.effect,
    ).toMatchObject({ kind: 'exile', objects: { filter: { enchanted: false } } });
  });

  test.each([
    "Destroy all creatures that aren't enchanted or tapped.",
    "Destroy all creatures that aren't equipped.",
    "Destroy each creature that isn't enchanted.",
    "Destroy target creature that isn't enchanted.",
    'Destroy all unenchanted creatures.',
    'Destroy all enchanted creatures.',
    "Destroy all creatures that aren't enchanted by you.",
    "Destroy all creatures that aren't enchanted you control.",
  ])('another wording is dropped, never half read (SYNTHETIC): %s', (line) => {
    const parsed = read(line, 'sorcery');
    expect(parsed.unparsed.length, line).toBe(1);
    expect(parsed.spell, line).toBeNull();
  });
});

describe('Ethereal Armor: "Enchanted creature gets +1/+1 for each enchantment you control and has first strike." (CR 303.4, 611.3a, 702.7)', () => {
  const ENCHANTMENTS = { kind: 'countOf', filter: { types: ['enchantment'], controller: 'you' } };

  test('the real line: the bonus and the keyword are two static abilities of the same subject', () => {
    expect(
      aura('Enchanted creature gets +1/+1 for each enchantment you control and has first strike.'),
    ).toEqual([
      {
        kind: 'static',
        static: { kind: 'modifyPt', subject: HOST, power: ENCHANTMENTS, toughness: ENCHANTMENTS },
      },
      {
        kind: 'static',
        static: { kind: 'grantKeyword', subject: HOST, keyword: { kind: 'firstStrike' } },
      },
    ]);
  });

  test('a group has the keywords in the plural, and several keywords read (SYNTHETIC)', () => {
    expect(
      readAll(
        'Creatures you control get +1/+1 for each artifact you control and have flying.',
        'enchantment',
      ).abilities,
    ).toMatchObject([
      { static: { kind: 'modifyPt' } },
      { static: { kind: 'grantKeyword', keyword: { kind: 'flying' } } },
    ]);
    expect(
      aura('Enchanted creature gets +1/+1 for each land you control and has flying and trample.'),
    ).toHaveLength(3);
  });

  test.each([
    'Enchanted creature gets +1/+1 for each enchantment you control and have first strike.',
    'Creatures you control get +1/+1 for each artifact you control and has flying.',
    'Enchanted creature gets +1/+1 for each enchantment you control and gains first strike.',
    'Enchanted creature gets +1/+1 for each enchantment you control and has first strike until end of turn.',
    'Enchanted creature gets +1/+1 for each enchantment you control and has.',
    'Enchanted creature gets +1/+1 for each enchantment you control and has first strike and.',
    'Enchanted creature gets +1/+1 for each enchantment you control and can fly.',
  ])('another wording is dropped, never half read (SYNTHETIC): %s', (line) => {
    droppedAura(line);
  });
});

describe('Face of Divinity: "As long as another Aura is attached to enchanted creature, it has first strike and lifelink." (CR 303.4, 611.3a, 613.8)', () => {
  const OTHER_AURAS = {
    kind: 'amountIs',
    amount: {
      kind: 'countOf',
      filter: { subtypes: ['Aura'], other: true, attachedTo: { kind: 'host' } },
    },
    compare: { cmp: 'atLeast', value: 1 },
  };

  test('the real line: each keyword is its own static ability with the condition, for the enchanted creature', () => {
    expect(
      aura('As long as another Aura is attached to enchanted creature, it has first strike and lifelink.'),
    ).toEqual([
      {
        kind: 'static',
        static: { kind: 'grantKeyword', subject: PLAIN_HOST, keyword: { kind: 'firstStrike' } },
        condition: OTHER_AURAS,
      },
      {
        kind: 'static',
        static: { kind: 'grantKeyword', subject: PLAIN_HOST, keyword: { kind: 'lifelink' } },
        condition: OTHER_AURAS,
      },
    ]);
  });

  test('"it" may get a bonus too, and the enchanted creature may be named again (SYNTHETIC)', () => {
    expect(aura('As long as another Aura is attached to enchanted creature, it gets +1/+1.')).toEqual([
      {
        kind: 'static',
        static: { kind: 'modifyPt', subject: PLAIN_HOST, power: 1, toughness: 1 },
        condition: OTHER_AURAS,
      },
    ]);
    expect(
      aura('As long as another Aura is attached to enchanted creature, enchanted creature has flying.'),
    ).toMatchObject([{ static: { subject: HOST, keyword: { kind: 'flying' } }, condition: OTHER_AURAS }]);
  });

  test('an Equipment says it with "equipped" (SYNTHETIC)', () => {
    expect(
      readAll(
        'As long as another Equipment is attached to equipped creature, it has trample.',
        'artifact',
        ['Equipment'],
      ).abilities,
    ).toMatchObject([
      {
        static: { kind: 'grantKeyword', subject: PLAIN_HOST, keyword: { kind: 'trample' } },
        condition: { kind: 'amountIs', amount: { filter: { subtypes: ['Equipment'], other: true } } },
      },
    ]);
  });

  test.each([
    'As long as an Aura is attached to enchanted creature, it has first strike.',
    'As long as another Aura is attached to enchanted creature it has first strike.',
    'As long as another Aura is attached to enchanted creature, it has first strike',
    'As long as another Equipment is attached to enchanted creature, it has first strike.',
    'As long as another Aura is attached to equipped creature, it has first strike.',
    'As long as another Aura or Equipment is attached to enchanted creature, it has first strike.',
    "As long as another Aura isn't attached to enchanted creature, it has first strike.",
    'As long as two or more other Auras are attached to enchanted creature, it has first strike.',
    'As long as another Aura is attached to ~, it has first strike.',
    'As long as another Aura is attached to enchanted land, it has first strike.',
  ])('another wording is dropped, never half read (SYNTHETIC): %s', (line) => {
    droppedAura(line);
  });

  test('"it" means the enchanted creature only after a condition about it (SYNTHETIC)', () => {
    droppedAura('As long as you control a Zombie, it has first strike.');
    droppedAura('As long as ~ entered this turn, it has first strike.');
  });
});

describe('Shield of the Oversoul: "As long as enchanted creature is green, it gets +1/+1 and has indestructible." (CR 303.4b, 105.2, 611.3a, 613.8)', () => {
  const GREEN = {
    kind: 'objectMatches',
    of: { kind: 'attached' },
    filter: { types: ['creature'], colors: ['G'] },
  };

  test('the real lines: the bonus and the keyword of a green creature, of a white creature', () => {
    expect(
      aura(
        'As long as enchanted creature is green, it gets +1/+1 and has indestructible.\nAs long as enchanted creature is white, it gets +1/+1 and has flying.',
      ),
    ).toEqual([
      {
        kind: 'static',
        static: { kind: 'modifyPt', subject: PLAIN_HOST, power: 1, toughness: 1 },
        condition: GREEN,
      },
      {
        kind: 'static',
        static: { kind: 'grantKeyword', subject: PLAIN_HOST, keyword: { kind: 'indestructible' } },
        condition: GREEN,
      },
      {
        kind: 'static',
        static: { kind: 'modifyPt', subject: PLAIN_HOST, power: 1, toughness: 1 },
        condition: { ...GREEN, filter: { types: ['creature'], colors: ['W'] } },
      },
      {
        kind: 'static',
        static: { kind: 'grantKeyword', subject: PLAIN_HOST, keyword: { kind: 'flying' } },
        condition: { ...GREEN, filter: { types: ['creature'], colors: ['W'] } },
      },
    ]);
  });

  test.each([
    ['white', 'W'],
    ['blue', 'U'],
    ['black', 'B'],
    ['red', 'R'],
    ['green', 'G'],
  ])('%s is a color of the table (SYNTHETIC siblings)', (word, letter) => {
    expect(aura(`As long as enchanted creature is ${word}, it has flying.`)).toMatchObject([
      { condition: { kind: 'objectMatches', filter: { colors: [letter] } } },
    ]);
  });

  test('an Equipment says "equipped creature is" (SYNTHETIC)', () => {
    expect(
      readAll('As long as equipped creature is red, it has haste.', 'artifact', ['Equipment'])
        .abilities,
    ).toMatchObject([{ condition: { kind: 'objectMatches', filter: { colors: ['R'] } } }]);
  });

  test.each([
    'As long as enchanted creature is red or white, it gets +1/+1.',
    'As long as enchanted creature is green and white, it gets +1/+1.',
    "As long as enchanted creature isn't green, it gets +1/+1.",
    'As long as enchanted creature is colorless, it gets +1/+1.',
    'As long as enchanted creature is a Zombie, it gets +1/+1.',
    'As long as enchanted creature is purple, it gets +1/+1.',
    'As long as enchanted land is green, it gets +1/+1.',
    'As long as enchanted creature is green it gets +1/+1.',
    'As long as equipped creature is green, it gets +1/+1.',
  ])('another wording is dropped, never half read (SYNTHETIC): %s', (line) => {
    droppedAura(line);
  });
});

describe("Shardmage's Rescue: \"As long as this Aura entered this turn, enchanted creature has hexproof.\" (CR 400.7, 611.3a, 702.11)", () => {
  const ENTERED = { kind: 'thisEnteredThisTurn' };

  test('the real line: the grant of the enchanted creature while the Aura itself entered this turn', () => {
    expect(aura('As long as this Aura entered this turn, enchanted creature has hexproof.')).toEqual([
      {
        kind: 'static',
        static: { kind: 'grantKeyword', subject: HOST, keyword: { kind: 'hexproof' } },
        condition: ENTERED,
      },
    ]);
  });

  test('"entered the battlefield this turn" and a bonus read the same (SYNTHETIC)', () => {
    expect(
      aura('As long as this Aura entered the battlefield this turn, enchanted creature gets +2/+2.'),
    ).toMatchObject([
      { static: { kind: 'modifyPt', subject: HOST, power: 2, toughness: 2 }, condition: ENTERED },
    ]);
  });

  test('a creature that has the condition on itself reads the same, for itself (SYNTHETIC)', () => {
    expect(creature('As long as this creature entered this turn, ~ has haste.')).toMatchObject([
      { static: { kind: 'grantKeyword', subject: { kind: 'this' } }, condition: ENTERED },
    ]);
  });

  test.each([
    "As long as this Aura didn't enter this turn, enchanted creature has hexproof.",
    'As long as this Aura entered last turn, enchanted creature has hexproof.',
    'As long as this Aura entered this turn under your control, enchanted creature has hexproof.',
    'As long as this Aura entered this turn enchanted creature has hexproof.',
    'As long as a creature entered this turn, enchanted creature has hexproof.',
    'As long as it entered this turn, enchanted creature has hexproof.',
    'As long as this Aura entered, enchanted creature has hexproof.',
  ])('another wording is dropped, never half read (SYNTHETIC): %s', (line) => {
    droppedAura(line);
  });

  test('the lowering names the engine feature it needs', () => {
    const missing = withoutFeature(
      'condition:thisEnteredThisTurn',
      `${ENCHANT}\nAs long as this Aura entered this turn, enchanted creature has hexproof.`,
      'enchantment',
      AURA,
    );
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toContain('condition:thisEnteredThisTurn');
  });
});

describe('Strong Back: Equip abilities and Aura spells that target enchanted creature cost {3} less (CR 601.2f, 602.2b, 702.6a, 118.7a)', () => {
  const EQUIP = {
    kind: 'static',
    static: {
      kind: 'abilityCostReduction',
      abilities: 'equip',
      targeting: { hostOfSource: true },
      amount: 3,
    },
  };
  const AURA_SPELLS = {
    kind: 'static',
    static: {
      kind: 'costReduction',
      spells: { subtypes: ['Aura'], controller: 'you', targetsObject: { hostOfSource: true } },
      amount: 3,
    },
  };

  test('the real lines: the two reductions and the bonus for each Aura and Equipment attached', () => {
    expect(
      aura(
        'Equip abilities you activate that target enchanted creature cost {3} less to activate.\nAura spells you cast that target enchanted creature cost {3} less to cast.\nEnchanted creature gets +2/+2 for each Aura and Equipment attached to it.',
      ),
    ).toMatchObject([EQUIP, AURA_SPELLS, { static: { kind: 'modifyPt', subject: HOST } }]);
  });

  test('another amount, and Aura or Equipment spells (SYNTHETIC siblings)', () => {
    expect(
      aura('Equip abilities you activate that target enchanted creature cost {1} less to activate.'),
    ).toMatchObject([{ static: { amount: 1 } }]);
    expect(
      aura(
        'Aura and Equipment spells you cast that target enchanted creature cost {2} less to cast.',
      ),
    ).toMatchObject([
      {
        static: {
          kind: 'costReduction',
          spells: {
            anyOf: [{ subtypes: ['Aura'] }, { subtypes: ['Equipment'] }],
            targetsObject: { hostOfSource: true },
          },
          amount: 2,
        },
      },
    ]);
  });

  test.each([
    'Equip abilities you activate that target enchanted creature cost {X} less to activate.',
    'Equip abilities you activate that target enchanted creature cost {W} less to activate.',
    'Equip abilities you activate that target enchanted creature cost {3} more to activate.',
    'Equip abilities you activate that target equipped creature cost {3} less to activate.',
    'Equip abilities you activate cost {3} less to activate.',
    'Equip abilities your opponents activate that target enchanted creature cost {3} less to activate.',
    'Crew abilities you activate that target enchanted creature cost {3} less to activate.',
    'Abilities you activate that target enchanted creature cost {3} less to activate.',
    'Aura spells you cast that target equipped creature cost {3} less to cast.',
    'Aura spells you cast that target a creature cost {3} less to cast.',
    'Aura spells that target enchanted creature cost {3} less to cast.',
    'Aura spells you cast that target enchanted creature cost {3} more to cast.',
    'Aura spells you cast that target enchanted creature cost {W} less to cast.',
  ])('another wording is dropped, never half read (SYNTHETIC): %s', (line) => {
    droppedAura(line);
  });

  test('only an Aura has an enchanted creature: the same lines on a creature are dropped (SYNTHETIC)', () => {
    for (const line of [
      'Equip abilities you activate that target enchanted creature cost {3} less to activate.',
      'Aura spells you cast that target enchanted creature cost {3} less to cast.',
    ]) {
      const parsed = read(line, 'creature');
      expect(parsed.unparsed.length, line).toBe(1);
      expect(parsed.abilities.length, line).toBe(0);
    }
  });

  test('the lowering names the engine features it needs', () => {
    for (const [feature, line] of [
      [
        'static:abilityCostReduction',
        'Equip abilities you activate that target enchanted creature cost {3} less to activate.',
      ],
      [
        'selector:hostOfSource',
        'Aura spells you cast that target enchanted creature cost {3} less to cast.',
      ],
    ] as const) {
      const missing = withoutFeature(feature, `${ENCHANT}\n${line}`, 'enchantment', AURA);
      expect(missing, line).toMatchObject({ reason: 'notRunnable' });
      expect(missing.needs, line).toContain(feature);
    }
  });
});

describe('the features the lowerings declare', () => {
  test('every feature the group needs is one the engine lists, and blocking each one stops the card that needs it', () => {
    const wanted = [
      'selector:attachedTo',
      'selector:enchanted',
      'selector:hostOfSource',
      'static:abilityCostReduction',
      'condition:thisEnteredThisTurn',
    ] as const;
    for (const feature of wanted) {
      expect(DECLARED_NEEDS, feature).toContain(feature);
      expect(BLOCKED, feature).toBeDefined();
    }
  });
});
