// Stage P3 (D-063, D-077): the static abilities of Auras, Equipment and groups of permanents, the
// words the engine can grant, the creature types of CR 205.3m, and the segmenter's view of these
// lines. The keyword lines are in parser-p3.test.ts. Lines come from the backlog (numbers as
// printed) or say SYNTHETIC. Nothing here is a real card.
import { existsSync, readFileSync } from 'node:fs';
import {
  type CardDefinition,
  syntheticCard as engineSynthetic,
  type ObjectFilter,
  validateCard,
} from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import {
  ALL_RULES,
  buildRuleSet,
  compileLine,
  DEFAULT_RULES,
  DEFAULT_SPELL_RULES,
  parseFaceText,
  segment,
} from '../src/convert/parser/index';
import { GRANTABLE_KEYWORDS } from '../src/convert/parser/rules/keyword/vocabulary';
import { CREATURE_TYPES, creatureTypeOf } from '../src/convert/parser/rules/noun/creature-types';
import { parseOnly } from './convert-grammar-helpers';
import { syntheticCard } from './convert-helpers';
import { CR_PATH } from './cr-file';
import {
  ATTACHED,
  abilitiesOf,
  diagnosticOf,
  grant,
  HOST_CREATURE,
  OPTS,
  pt,
  stat,
} from './parser-p3-helpers';

const SET = buildRuleSet(ALL_RULES);

describe('static.attached: what an Aura or Equipment gives (CR 604.4, 613.4c, 613.1f)', () => {
  test.each([
    ['Equipped creature gets +1/+1.', 'Equipment', [pt(1, 1)]],
    ['Equipped creature gets +1/-1.', 'Equipment', [pt(1, -1)]],
    ['Enchanted creature gets -3/-3.', 'Aura', [pt(-3, -3)]],
    ['Enchanted creature gets +0/+3.', 'Aura', [pt(0, 3)]],
    ['Enchanted permanent gets +1/+1.', 'Aura', [pt(1, 1, ATTACHED)]],
    ['Equipped creature has haste and shroud.', 'Equipment', [grant('haste'), grant('shroud')]],
    ['Enchanted creature has hexproof.', 'Aura', [grant('hexproof')]],
    ['Enchanted creature gets +2/+2 and has flying.', 'Aura', [pt(2, 2), grant('flying')]],
    [
      'Equipped creature gets +1/+1 and has trample and vigilance.',
      'Equipment',
      [pt(1, 1), grant('trample'), grant('vigilance')],
    ],
    [
      'Equipped creature has flying, trample, and vigilance.',
      'Equipment',
      [grant('flying'), grant('trample'), grant('vigilance')],
    ],
  ] as const)('%s', (text, kind, expected) => {
    expect(abilitiesOf(text, kind)).toEqual(expected);
  });

  test('"gets" and "has" split a statement into one engine ability per effect, in text order', () => {
    const abilities = abilitiesOf(
      'Equipped creature gets +1/+1 and has first strike.',
      'Equipment',
    );
    expect(abilities.map((a) => (a.kind === 'static' ? a.static.kind : a.kind))).toEqual([
      'modifyPt',
      'grantKeyword',
    ]);
  });

  test('an "attached" subject needs the Aura or Equipment it is about (CR 303.4b, 301.5a)', () => {
    for (const [text, kind] of [
      ['Equipped creature gets +1/+1.', 'Other'],
      ['Enchanted creature gets +1/+1.', 'Other'],
      ['Enchanted creature gets +1/+1.', 'Equipment'],
      ['Equipped creature gets +1/+1.', 'Aura'],
    ] as const) {
      expect(diagnosticOf(text, kind), text).toMatchObject({
        reason: 'notRunnable',
        text,
        closestRule: 'noun.attached-permanent',
        recognised: ['static.attached', 'noun.attached-permanent'],
      });
    }
  });

  test('the same line imports as unsupported on a creature, as supported on an Equipment', () => {
    const line = 'Equipped creature gets +1/+1.\nEquip {2}';
    const equipment = parseOnly(
      syntheticCard({
        name: 'SYNTHETIC Parsed Sword',
        manaCost: '{2}',
        typeLine: 'Artifact — Equipment',
        oracleText: line,
      }),
    );
    expect(equipment.support.status).toBe('supported');
    const artifact = parseOnly(
      syntheticCard({
        name: 'SYNTHETIC Parsed Rock',
        manaCost: '{2}',
        typeLine: 'Artifact',
        oracleText: line,
      }),
    );
    expect(artifact.support.status).toBe('unsupported');
    expect(artifact.support.unparsed.map((u) => u.text)).toEqual(['Equipped creature gets +1/+1.']);
  });

  // This test pinned "a granted ability in quotes is an engine gap" with "{T}: Add {G}." until the
  // engine learned to give a mana ability (D-099, `static:grantAbility`); that line is read and run
  // now (parser-p14.test.ts). The engine gives no other kind of ability, so any other quoted text is
  // read as a grant and dropped whole, naming no engine feature (it is the kind that is refused).
  test('a granted ability in quotes that is not a mana ability is read and dropped, never run', () => {
    expect(diagnosticOf('Equipped creature has "{T}: Draw a card."', 'Equipment')).toMatchObject({
      reason: 'notRunnable',
      closestRule: 'static.attached',
    });
    expect(
      diagnosticOf('Equipped creature has "{T}: Draw a card."', 'Equipment'),
    ).not.toHaveProperty('needs');
  });

  test('"can\'t be blocked" is a restriction the engine runs since D-094 (stage P12)', () => {
    expect(abilitiesOf("Enchanted creature can't be blocked.", 'Aura')).toEqual([
      stat({ kind: 'restriction', subject: HOST_CREATURE, restriction: 'cantBeBlocked' }),
    ]);
  });

  test.each([
    ["Enchanted creature can't attack or block alone.", 'alone.'],
    ['Enchanted creature has ward {2}.', 'ward {2}.'],
    ['Enchanted creature has flash.', 'flash.'],
    ['Enchanted creature gets +1/+1 and loses flying.', 'and loses flying.'],
    ['Enchanted creature gets +1/+1 until end of turn.', 'until end of turn.'],
    ['Enchanted creature gets +X/+X.', '+X/+X.'],
  ] as const)('"%s" stays unparsed at "%s"', (text, stoppedAt) => {
    expect(diagnosticOf(text, 'Aura')).toMatchObject({
      reason: 'unrecognised',
      stoppedAt,
    });
  });
});

describe('static.permanents: what a group of permanents gets and has (CR 611.3a)', () => {
  const group = (filter: ObjectFilter, other = false) =>
    ({ kind: 'filter', filter, ...(other ? { other: true } : {}) }) as const;
  const gets = (subject: ReturnType<typeof group>, power: number, toughness: number) =>
    stat({ kind: 'modifyPt', subject, power, toughness });
  const has = (
    subject: ReturnType<typeof group>,
    kind: 'vigilance' | 'trample' | 'haste' | 'lifelink',
  ) => stat({ kind: 'grantKeyword', subject, keyword: { kind } });
  const MINE: ObjectFilter = { types: ['creature'], controller: 'you' };

  test.each([
    ['Creatures you control get +1/+1.', [gets(group(MINE), 1, 1)]],
    ['Other creatures you control get +1/+1.', [gets(group(MINE, true), 1, 1)]],
    ['Creatures you control have vigilance.', [has(group(MINE), 'vigilance')]],
    ['Creatures you control have haste.', [has(group(MINE), 'haste')]],
    ['Other creatures you control have trample.', [has(group(MINE, true), 'trample')]],
    [
      'Creatures your opponents control get -1/-1.',
      [gets(group({ types: ['creature'], controller: 'opponent' }), -1, -1)],
    ],
    [
      'Other Elves you control get +1/+1.',
      [gets(group({ subtypes: ['Elf'], controller: 'you' }, true), 1, 1)],
    ],
    [
      'Other Elf creatures you control get +1/+1.',
      [gets(group({ types: ['creature'], subtypes: ['Elf'], controller: 'you' }, true), 1, 1)],
    ],
    [
      'Legendary creatures you control get +1/+1.',
      [gets(group({ ...MINE, supertypes: ['legendary'] }), 1, 1)],
    ],
    [
      'Other artifact creatures you control get +1/+1.',
      [gets(group({ types: ['artifact', 'creature'], controller: 'you' }, true), 1, 1)],
    ],
    [
      'Creatures you control get +1/+1 and have lifelink.',
      [gets(group(MINE), 1, 1), has(group(MINE), 'lifelink')],
    ],
  ] as const)('%s', (text, expected) => {
    expect(abilitiesOf(text)).toEqual(expected);
  });

  test('"other" is on the subject and not in the filter, as the engine fixtures write it', () => {
    const [ability] = abilitiesOf('Other creatures you control get +1/+1.');
    expect(ability).toMatchObject({
      static: { subject: { other: true, filter: { types: ['creature'], controller: 'you' } } },
    });
    expect(JSON.stringify(ability)).not.toContain('"other":true,"types"');
  });

  test('a statement about a group needs no Aura or Equipment', () => {
    expect(abilitiesOf('Creatures you control get +1/+1.', 'Aura')).toHaveLength(1);
    expect(abilitiesOf('Creatures you control get +1/+1.', 'Equipment')).toHaveLength(1);
  });

  test.each([
    ['Creatures you control have flash.', 'flash.'],
    ['Creatures you control gets +1/+1.', 'gets +1/+1.'],
    ['Creatures you control get +1/+1 until end of turn.', 'until end of turn.'],
    ['Creatures you control have flying and flying.', '.'],
  ] as const)('"%s" stays unparsed at "%s"', (text, stoppedAt) => {
    expect(diagnosticOf(text)).toMatchObject({ reason: 'unrecognised', stoppedAt });
  });

  test.each(['Other Elvs you control get +1/+1.', 'Other Tokens you control get +1/+1.'])(
    '"%s" is not read: a capitalized word is a creature type only after "other"',
    (text) => {
      expect(diagnosticOf(text)).toMatchObject({ reason: 'unrecognised', closestRule: 'none' });
    },
  );

  // Pinned "a granted ability in quotes names the engine gap" with a mana ability, which the engine
  // runs since D-099 (parser-p14.test.ts). An activated ability given to a group runs since stage P36 (D-178); a granted mana ability with a
  // rider the engine's mana ability cannot carry is still refused.
  test('a granted ability in quotes that the engine cannot give is read and dropped whole', () => {
    expect(
      diagnosticOf('Lands you control have "{T}: Add one mana of any color. Draw a card."'),
    ).toMatchObject({ reason: 'notRunnable', closestRule: 'static.permanents' });
  });

  test('a line that merely starts like a group is not blamed on the group rule', () => {
    // SYNTHETIC: "Basic landfall {1}" begins as "Basic lands you control ..." would: nothing was
    // read. (The test used "Basic landcycling {1}" until stage P17 made it a keyword the grammar reads.)
    expect(diagnosticOf('Basic landfall {1}')).toMatchObject({
      closestRule: 'none',
      stoppedAt: 'Basic landfall {1}',
    });
  });
});

describe('a duration makes it an effect, not a static ability (CR 611.2a, 611.3)', () => {
  const spellEffect = (text: string) => {
    const parsed = parseFaceText(text, OPTS, 0, DEFAULT_RULES, DEFAULT_SPELL_RULES, ['instant']);
    if (parsed.unparsed.length > 0) throw new Error(JSON.stringify(parsed.unparsed));
    return parsed.spell?.effect;
  };

  test('"Target creature gets +N/+N until end of turn." lowers as before', () => {
    expect(spellEffect('Target creature gets +2/+2 until end of turn.')).toEqual({
      kind: 'modifyPt',
      objects: { kind: 'target', id: 't1' },
      power: 2,
      toughness: 2,
      duration: 'untilEndOfTurn',
    });
  });

  test('"Creatures you control get +N/+N until end of turn." is still the spell effect', () => {
    expect(spellEffect('Creatures you control get +1/+1 until end of turn.')).toEqual({
      kind: 'modifyPt',
      objects: {
        kind: 'each',
        filter: { zone: 'battlefield', types: ['creature'], controller: 'you' },
      },
      power: 1,
      toughness: 1,
      duration: 'untilEndOfTurn',
    });
  });

  test('the same words on a permanent are not a static ability', () => {
    expect(diagnosticOf('Creatures you control get +1/+1 until end of turn.')).toMatchObject({
      stoppedAt: 'until end of turn.',
    });
  });

  test('an activated pump keeps its meaning', () => {
    const [ability] = abilitiesOf('{1}: ~ gets +1/+1 until end of turn.');
    expect(ability).toMatchObject({ kind: 'activated' });
  });
});

describe('the words the engine can grant are the words the grammar grants', () => {
  // Riot (D-186) is given to a group as it enters, not to an attached permanent: its own test is below.
  test.each(GRANTABLE_KEYWORDS.map(([word]) => word).filter((word) => word !== 'riot'))(
    '"Equipped creature has %s." validates',
    (word) => {
      const imported = parseOnly(
        syntheticCard({
          name: `SYNTHETIC Granting ${word}`,
          manaCost: '{1}',
          typeLine: 'Artifact — Equipment',
          oracleText: `Equipped creature has ${word}.\nEquip {1}`,
        }),
      );
      expect(imported.support.unparsed).toEqual([]);
      expect(imported.support.reasons).toEqual([]);
      expect(validateCard(imported.definition as CardDefinition)).toEqual([]);
    },
  );

  test('riot is given to a group of permanents, which the engine runs; an attached permanent has no choice to make, so the engine refuses it', () => {
    const group = parseOnly(
      syntheticCard({
        name: 'SYNTHETIC Granting riot',
        manaCost: '{1}{R}',
        typeLine: 'Enchantment',
        oracleText: 'Nontoken creatures you control have riot.',
      }),
    );
    expect(group.support.unparsed).toEqual([]);
    expect(validateCard(group.definition as CardDefinition)).toEqual([]);
    const attached = parseOnly(
      syntheticCard({
        name: 'SYNTHETIC Granting riot to a host',
        manaCost: '{1}',
        typeLine: 'Artifact — Equipment',
        oracleText: 'Equipped creature has riot.\nEquip {1}',
      }),
    );
    expect(validateCard(attached.definition as CardDefinition).map((i) => i.message)).toContain(
      'riot is given to a group of permanents, as they enter',
    );
  });

  test('flash is not grantable, and the engine agrees', () => {
    expect(GRANTABLE_KEYWORDS.map(([word]) => word)).not.toContain('flash');
    const card = engineSynthetic('SYNTHETIC Wing Boots');
    const withFlash: CardDefinition = {
      ...card,
      faces: card.faces.map((f) => ({
        ...f,
        abilities: [
          {
            kind: 'static',
            static: { kind: 'grantKeyword', subject: ATTACHED, keyword: { kind: 'flash' } },
          },
        ],
      })),
    };
    expect(
      validateCard(withFlash)
        .map((i) => i.message)
        .join('\n'),
    ).toContain('cannot grant flash');
  });
});

// The Comprehensive Rules are Wizards' text and are not committed (D-246): these checks run where `pnpm rules:fetch` has put the file, and skip elsewhere.

describe('creature types come from the list in CR 205.3m', () => {
  test.skipIf(!existsSync(CR_PATH))(
    'the list is exactly the one in the Comprehensive Rules text',
    () => {
      const cr = readFileSync(CR_PATH, 'utf8');
      const line = cr.split('\n').find((l) => l.startsWith('205.3m ')) ?? '';
      const listed = /one word long: (.*)\.$/.exec(line)?.[1] ?? '';
      const words = listed.replace(/, and /, ', ').split(', ');
      expect(words.length).toBeGreaterThan(300);
      // The table is the engine's, generated from the same text: the one-word types of the rule and "Time Lord" (CR 205.3m:
      // the one type of two words, listed apart).
      expect([...CREATURE_TYPES].sort()).toEqual([...words, 'Time Lord'].sort());
    },
  );

  test.each([
    ['Elves', 'Elf'],
    ['Elf', 'Elf'],
    ['Wolves', 'Wolf'],
    ['Dwarves', 'Dwarf'],
    ['Werewolves', 'Werewolf'],
    ['Zombies', 'Zombie'],
    ['Harpies', 'Harpy'],
    ['Allies', 'Ally'],
    ['Foxes', 'Fox'],
    ['Goblins', 'Goblin'],
    ['Merfolk', 'Merfolk'],
    ['Faeries', 'Faerie'],
    ['Mice', 'Mouse'],
    ['Pegasi', 'Pegasus'],
    ['Time Lords', 'Time Lord'],
  ])('%s is the creature type %s', (word, type) => {
    expect(creatureTypeOf(word)).toBe(type);
  });

  test.each(['Mousse', 'Tokens', 'Creatures', 'Legendary', 'Elvs'])(
    '%s is not read as a creature type',
    (word) => {
      expect(creatureTypeOf(word)).toBeUndefined();
    },
  );
});

describe('the pipeline reports what it read and what it needs', () => {
  test('a statement on the right face lowers and says which rule built it', () => {
    const result = compileLine('Equipped creature gets +1/+1.', {
      rules: SET,
      face: 'permanent',
      faceTypes: ['artifact'],
      faceSubtypes: ['Equipment'],
    });
    expect(result).toMatchObject({ ok: true, kind: 'abilities', ruleId: 'static.attached' });
  });

  test('an enchant keyword is built by its own rule', () => {
    const result = compileLine('Enchant creature', {
      rules: SET,
      face: 'permanent',
      faceTypes: ['enchantment'],
      faceSubtypes: ['Aura'],
    });
    expect(result).toMatchObject({ ok: true, ruleId: 'keyword.enchant' });
  });
});

describe('the segmenter leaves a static statement as a line of its own', () => {
  test.each([
    'Enchant creature',
    'Equip {1}',
    'Equip—Pay 2 life',
    'Enchanted creature gets +1/+1 and has flying.',
    'Creatures you control get +1/+1.',
    'Equipped creature has "{T}: Add {G}."',
    'Lands you control have "{T}: Add one mana of any color."',
  ])('"%s" is one `other` line with no cost and no trigger', (text) => {
    const skeleton = segment(text, 'permanent');
    expect(skeleton.head).toBe('other');
    expect(skeleton.costs).toEqual([]);
    expect(skeleton.trigger).toBeUndefined();
  });

  test('a colon inside the quotes of a granted ability does not make a cost', () => {
    expect(segment('Equipped creature has "{T}: Add {G}."', 'permanent').head).toBe('other');
  });

  test('each statement of a face is its own ability, indexed by line', () => {
    const parsed = parseFaceText(
      'Equipped creature gets +1/+1.\nEquipped creature has flying.\nEquip {1}',
      OPTS,
      0,
      DEFAULT_RULES,
      [],
      ['artifact'],
      ['Equipment'],
    );
    expect(parsed.lines).toEqual([
      'Equipped creature gets +1/+1.',
      'Equipped creature has flying.',
      'Equip {1}',
    ]);
    expect(parsed.abilities).toHaveLength(3);
  });
});
