// Stage P29 (D-134): the creature types of CR 205.3m are one table (the engine's `CREATURE_TYPES`, generated from the Comprehensive
// Rules text), and every rule that reads a group of creatures reads it for every type of that table, in the singular and in
// every plural form, not for a type that a card of the corpus names. This file proves it by looping over ALL of the table: each
// type reads in the singular and in each plural form; no two types share a form; and a lord, the subject of a trigger, a grant to
// a group and a cost that taps a group read for each type, with the same rule. The plural forms come from the ending rules of
// `regularPlurals`; the few that no ending rule gives (`IRREGULAR_PLURALS`, English usage, unverified against a real Oracle
// text) and the types that are their own plural (`INVARIANT_TYPES`) are the only places a type is named, and a test holds each
// of them to what it claims. The reports of the repository (`reports/`, the 1000 most weighted shapes of the owner's run, the
// decks and the backlog) show 13 plural forms, all regular: the tests check each against the table.
import { readFileSync } from 'node:fs';
import { CREATURE_TYPES as TABLE } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import {
  CREATURE_TYPES,
  creatureTypeOf,
  INVARIANT_TYPES,
  IRREGULAR_PLURALS,
  MULTIWORD_FORMS,
  readCreatureType,
  regularPlurals,
  TYPE_LEADING_WORDS,
} from '../src/convert/parser/rules/noun/creature-types';
import { dropped, type FaceType, readAll } from './parser-p5-helpers';

/** Every plural form of a type that the grammar reads. */
const pluralsOf = (type: string): string[] => [
  ...regularPlurals(type),
  ...(IRREGULAR_PLURALS[type] ?? []),
  ...(INVARIANT_TYPES.has(type) ? [type] : []),
];

/** The form a card would use first: an irregular plural, the type itself when it is its own plural, else the regular one. */
const naturalPlural = (type: string): string =>
  IRREGULAR_PLURALS[type]?.[0] ??
  (INVARIANT_TYPES.has(type) ? type : (regularPlurals(type)[0] ?? type));

describe('the table', () => {
  test("is the engine's, generated from CR 205.3m, and has the two-word type", () => {
    expect(TABLE.length).toBeGreaterThan(300);
    expect(new Set(TABLE).size).toBe(TABLE.length);
    expect(CREATURE_TYPES.size).toBe(TABLE.length);
    expect(TABLE).toContain('Time Lord');
    expect(MULTIWORD_FORMS).toEqual(expect.arrayContaining(['Time Lord', 'Time Lords']));
  });

  test.each(TABLE.map((type) => [type] as const))(
    '%s reads in the singular and in every plural form',
    (type) => {
      const singular = readCreatureType(type);
      expect(singular?.type).toBe(type);
      // Its own plural when listed as invariant, a singular otherwise.
      expect(singular?.plural).toBe(INVARIANT_TYPES.has(type) ? null : false);
      for (const form of pluralsOf(type)) {
        const found = readCreatureType(form);
        expect(found?.type, `${form} of ${type}`).toBe(type);
        expect(found?.plural === true || found?.plural === null, `${form} is a plural`).toBe(true);
      }
      // The typographic and the plain apostrophe are the same letter.
      expect(creatureTypeOf(type.replaceAll('’', "'"))).toBe(type);
    },
  );

  test('no plural form is the form of another type, and none is another type', () => {
    const owners = new Map<string, string[]>();
    for (const type of TABLE) {
      for (const form of pluralsOf(type)) {
        owners.set(form, [...(owners.get(form) ?? []), type]);
      }
    }
    const shared = [...owners].filter(([, types]) => new Set(types).size > 1);
    expect(shared).toEqual([]);
    const asTypes = [...owners].filter(
      ([form, [type]]) => CREATURE_TYPES.has(form) && form !== type,
    );
    expect(asTypes).toEqual([]);
  });

  test('the irregular plurals name types of the table and forms no ending rule gives', () => {
    for (const [type, forms] of Object.entries(IRREGULAR_PLURALS)) {
      expect(CREATURE_TYPES.has(type), type).toBe(true);
      for (const form of forms) {
        expect(regularPlurals(type), `${form} is regular`).not.toContain(form);
        expect(form, `${form} is the type itself`).not.toBe(type);
      }
    }
  });

  test('the types that are their own plural are types of the table', () => {
    for (const type of INVARIANT_TYPES) expect(CREATURE_TYPES.has(type), type).toBe(true);
  });

  test('what a word that is no type or plural of one reads as', () => {
    for (const word of [
      'Elvs',
      'Tokens',
      'Creatures',
      'Legendary',
      'Mousse',
      'Wolfs2',
      'Zombiess',
      'Elfes',
    ]) {
      expect(creatureTypeOf(word), word).toBeUndefined();
    }
  });

  test('the leading words of the dispatch come from the table', () => {
    expect(TYPE_LEADING_WORDS).toEqual(
      expect.arrayContaining(['zombies', 'zombie', 'time', 'elves', 'mice']),
    );
    for (const type of TABLE) {
      const first = (type.split(' ')[0] ?? '').toLowerCase();
      expect(TYPE_LEADING_WORDS, type).toContain(first);
    }
  });
});

describe('the reports of the repository: the plural forms of real Oracle texts', () => {
  const root = new URL('../../../reports/', import.meta.url);
  // The Oracle lines of the 1000 most weighted shapes (`example`) and the decks' blockers; card names are left out.
  const templates = JSON.parse(readFileSync(new URL('templates.json', root), 'utf8')) as {
    templates: { example: string; template: string }[];
  };
  const text = [
    ...templates.templates.flatMap((t) => [t.example, t.template]),
    ...readFileSync(new URL('decks.md', root), 'utf8')
      .split('\n')
      .filter((line) => line.startsWith('| ')),
  ].join('\n');
  const words = new Set(text.match(/[A-Z][\p{L}’'-]*/gu) ?? []);

  test('every capitalized word of those lines that is a plural form of a type reads as that type', () => {
    const attested: string[] = [];
    for (const type of TABLE) {
      for (const form of regularPlurals(type)) {
        if (!words.has(form) || CREATURE_TYPES.has(form)) continue;
        attested.push(form);
        expect(readCreatureType(form), form).toEqual({ type, plural: true });
      }
    }
    // The repository's reports show these regular plurals. ("Skeletons" was among them in the reports of parser version 33; the
    // owner's refresh after stage P29 no longer lists a blocker that names it, because the lords over it read since. "Dragons"
    // was among them until the decks report of parser version 39 showed every deck fully supported: its table no longer carries
    // a blocked card's Oracle text, so no line of the reports names it.)
    expect(attested).toEqual(
      expect.arrayContaining(['Zombies', 'Orcs', 'Birds', 'Frogs', 'Humans']),
    );
  });

  test('an irregular plural or an invariant type that the lines show reads as its type', () => {
    // The lines show none of the irregular plurals: they are English usage, unverified against Oracle text until one appears
    // (docs/ROADMAP.md, "Parser stage P29 known limitations"). Should a run show one, it must read.
    for (const [type, forms] of Object.entries(IRREGULAR_PLURALS)) {
      for (const form of forms) {
        if (words.has(form)) expect(readCreatureType(form)?.type, form).toBe(type);
      }
    }
    for (const type of INVARIANT_TYPES) {
      if (words.has(type)) expect(readCreatureType(type)?.plural, type).toBe(null);
    }
  });
});

/** The first ability of a permanent line, which must read. */
const abilities = (text: string, type: FaceType = 'creature') => readAll(text, type).abilities;

describe('one rule for every type: a lord, a trigger subject, a grant to a group, a cost', () => {
  test.each(TABLE.map((type) => [type] as const))('%s', (type) => {
    const plural = naturalPlural(type);
    // A lord over every permanent of the type but the source: "Other <plural> you control get +1/+1".
    for (const form of pluralsOf(type)) {
      expect(abilities(`Other ${form} you control get +1/+1.`), form).toEqual([
        {
          kind: 'static',
          static: {
            kind: 'modifyPt',
            subject: {
              kind: 'filter',
              filter: { subtypes: [type], controller: 'you' },
              other: true,
            },
            power: 1,
            toughness: 1,
          },
        },
      ]);
    }
    // The same lord in the words "other <type> creatures" of every controller.
    expect(abilities(`Other ${type} creatures get +1/+1.`)).toEqual([
      {
        kind: 'static',
        static: {
          kind: 'modifyPt',
          subject: {
            kind: 'filter',
            filter: { types: ['creature'], subtypes: [type] },
            other: true,
          },
          power: 1,
          toughness: 1,
        },
      },
    ]);
    // A group that has a keyword, with no "other".
    expect(abilities(`${plural} you control have trample.`)).toEqual([
      {
        kind: 'static',
        static: {
          kind: 'grantKeyword',
          subject: { kind: 'filter', filter: { subtypes: [type], controller: 'you' } },
          keyword: { kind: 'trample' },
        },
      },
    ]);
    // The subject of a trigger: one permanent of the type, in the singular.
    expect(
      abilities(`Whenever another nontoken ${type} you control dies, you gain 1 life.`),
    ).toMatchObject([
      {
        kind: 'triggered',
        trigger: {
          kind: 'dies',
          what: { subtypes: [type], token: false, other: true, controller: 'you' },
        },
      },
    ]);
    // A grant to a group until end of turn, of every controller.
    expect(
      readAll(`All ${plural} gain menace until end of turn.`, 'sorcery').spell?.effect,
    ).toEqual({
      kind: 'grantKeyword',
      objects: { kind: 'each', filter: { zone: 'battlefield', subtypes: [type] } },
      keyword: { kind: 'menace' },
      duration: 'untilEndOfTurn',
    });
    // A cost that taps a group of the type.
    expect(abilities(`Tap two untapped ${plural} you control: Draw a card.`)).toMatchObject([
      {
        cost: [
          { kind: 'tapPermanents', filter: { subtypes: [type], controller: 'you' }, count: 2 },
        ],
      },
    ]);
  });
});

describe('five types and "chosen type", for each of the rules (the owner\'s requirement)', () => {
  /** A regular plural, an f-to-ves plural, an invariant, an irregular plural and a type of two words, and Zombie. */
  const SAMPLE = ['Zombie', 'Goblin', 'Wolf', 'Merfolk', 'Mouse', 'Time Lord'] as const;

  test('the sample has the kinds the owner asked for', () => {
    expect(SAMPLE.map((type) => naturalPlural(type))).toEqual([
      'Zombies',
      'Goblins',
      'Wolves',
      'Merfolk',
      'Mice',
      'Time Lords',
    ]);
    expect(SAMPLE.filter((type) => type.includes(' '))).toEqual(['Time Lord']);
  });

  test.each(SAMPLE.map((type) => [type] as const))(
    '%s: lord, trigger subject, group grant',
    (type) => {
      const plural = naturalPlural(type);
      const filter = { subtypes: [type], controller: 'you' };
      expect(abilities(`Other ${plural} you control get +2/+2 and have vigilance.`)).toMatchObject([
        { static: { kind: 'modifyPt', subject: { kind: 'filter', filter, other: true } } },
        { static: { kind: 'grantKeyword', subject: { kind: 'filter', filter, other: true } } },
      ]);
      expect(abilities(`Whenever a ${type} you control enters, draw a card.`)).toMatchObject([
        { trigger: { kind: 'entersBattlefield', what: filter } },
      ]);
      expect(abilities(`{1}: ${plural} you control get +1/+1 until end of turn.`)).toMatchObject([
        {
          effect: {
            kind: 'modifyPt',
            objects: { kind: 'each', filter: { zone: 'battlefield', ...filter } },
          },
        },
      ]);
    },
  );

  test('"of the chosen type": the lord, the trigger subject and the grant', () => {
    const chosen = { types: ['creature'], controller: 'you', chosenType: true };
    expect(
      abilities('Other creatures you control of the chosen type get +1/+1.', 'enchantment'),
    ).toMatchObject([{ static: { subject: { kind: 'filter', filter: chosen, other: true } } }]);
    expect(
      abilities(
        'Whenever another creature you control of the chosen type dies, draw a card.',
        'enchantment',
      ),
    ).toMatchObject([{ trigger: { kind: 'dies', what: { ...chosen, other: true } } }]);
    expect(
      readAll('Creatures you control of the chosen type gain menace until end of turn.', 'instant')
        .spell?.effect,
    ).toMatchObject({
      kind: 'grantKeyword',
      objects: { kind: 'each', filter: { zone: 'battlefield', ...chosen } },
    });
  });

  test('a word that is not a type of the table stops every rule at the same place', () => {
    for (const text of [
      'Other Banana creatures get +1/+1.',
      'Other Bananas you control get +1/+1.',
      'Bananas you control have trample.',
    ]) {
      expect(dropped(text, 'creature').reason, text).toBe('unrecognised');
    }
  });
});
