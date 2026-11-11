import { describe, expect, test } from 'vitest';
import { validateCard, validateCardStructure } from '../src/ast/validate';
import type { CardDefinition } from '../src/cards/definition';
import {
  deckOf,
  FIXTURE_CARDS,
  fixtureCard,
  SYNTHETIC_CARDS,
  syntheticCard,
} from '../src/cards/fixtures/index';
import { BASIC_LAND_TYPES, COLORS, type Color } from '../src/characteristics';

function face(card: CardDefinition) {
  const f = card.faces[0];
  if (f === undefined) throw new Error(`${card.name} has no face`);
  return f;
}

interface Facts {
  readonly cost: string[] | null;
  readonly supertypes?: string[];
  readonly types: string[];
  readonly subtypes?: string[];
  readonly pt?: [number, number];
  readonly colors: Color[];
  readonly identity: Color[];
  readonly text: string;
}

/** What the real printed cards say. Written from the cards, not computed from the fixtures. */
const FACTS: Record<string, Facts> = {
  Plains: {
    cost: null,
    supertypes: ['basic'],
    types: ['land'],
    subtypes: ['Plains'],
    colors: [],
    identity: ['W'],
    text: '({T}: Add {W}.)',
  },
  Island: {
    cost: null,
    supertypes: ['basic'],
    types: ['land'],
    subtypes: ['Island'],
    colors: [],
    identity: ['U'],
    text: '({T}: Add {U}.)',
  },
  Swamp: {
    cost: null,
    supertypes: ['basic'],
    types: ['land'],
    subtypes: ['Swamp'],
    colors: [],
    identity: ['B'],
    text: '({T}: Add {B}.)',
  },
  Mountain: {
    cost: null,
    supertypes: ['basic'],
    types: ['land'],
    subtypes: ['Mountain'],
    colors: [],
    identity: ['R'],
    text: '({T}: Add {R}.)',
  },
  Forest: {
    cost: null,
    supertypes: ['basic'],
    types: ['land'],
    subtypes: ['Forest'],
    colors: [],
    identity: ['G'],
    text: '({T}: Add {G}.)',
  },
  'Grizzly Bears': {
    cost: ['1', 'G'],
    types: ['creature'],
    subtypes: ['Bear'],
    pt: [2, 2],
    colors: ['G'],
    identity: ['G'],
    text: '',
  },
  'Llanowar Elves': {
    cost: ['G'],
    types: ['creature'],
    subtypes: ['Elf', 'Druid'],
    pt: [1, 1],
    colors: ['G'],
    identity: ['G'],
    text: '{T}: Add {G}.',
  },
  'Sol Ring': {
    cost: ['1'],
    types: ['artifact'],
    colors: [],
    identity: [],
    text: '{T}: Add {C}{C}.',
  },
  'Lightning Bolt': {
    cost: ['R'],
    types: ['instant'],
    colors: ['R'],
    identity: ['R'],
    text: 'Lightning Bolt deals 3 damage to any target.',
  },
  Murder: {
    cost: ['1', 'B', 'B'],
    types: ['instant'],
    colors: ['B'],
    identity: ['B'],
    text: 'Destroy target creature.',
  },
  Unsummon: {
    cost: ['U'],
    types: ['instant'],
    colors: ['U'],
    identity: ['U'],
    text: "Return target creature to its owner's hand.",
  },
  Counterspell: {
    cost: ['U', 'U'],
    types: ['instant'],
    colors: ['U'],
    identity: ['U'],
    text: 'Counter target spell.',
  },
  Divination: {
    cost: ['2', 'U'],
    types: ['sorcery'],
    colors: ['U'],
    identity: ['U'],
    text: 'Draw two cards.',
  },
  "Angel's Mercy": {
    cost: ['2', 'W', 'W'],
    types: ['instant'],
    colors: ['W'],
    identity: ['W'],
    text: 'You gain 7 life.',
  },
  'Command Tower': {
    cost: null,
    types: ['land'],
    colors: [],
    identity: [],
    text: "{T}: Add one mana of any color in your commander's color identity.",
  },
  'Isamaru, Hound of Konda': {
    cost: ['W'],
    supertypes: ['legendary'],
    types: ['creature'],
    subtypes: ['Dog'],
    pt: [2, 2],
    colors: ['W'],
    identity: ['W'],
    text: '',
  },
  'Yargle, Glutton of Urborg': {
    cost: ['3', 'B'],
    supertypes: ['legendary'],
    types: ['creature'],
    subtypes: ['Frog', 'Beast'],
    pt: [9, 3],
    colors: ['B'],
    identity: ['B'],
    text: '',
  },
  'Serra Angel': {
    cost: ['3', 'W', 'W'],
    types: ['creature'],
    subtypes: ['Angel'],
    pt: [4, 4],
    colors: ['W'],
    identity: ['W'],
    text: 'Flying, vigilance',
  },
  'Typhoid Rats': {
    cost: ['B'],
    types: ['creature'],
    subtypes: ['Rat'],
    pt: [1, 1],
    colors: ['B'],
    identity: ['B'],
    text: 'Deathtouch',
  },
  'Giant Spider': {
    cost: ['3', 'G'],
    types: ['creature'],
    subtypes: ['Spider'],
    pt: [2, 4],
    colors: ['G'],
    identity: ['G'],
    text: 'Reach',
  },
  'Youthful Knight': {
    cost: ['1', 'W'],
    types: ['creature'],
    subtypes: ['Human', 'Knight'],
    pt: [2, 1],
    colors: ['W'],
    identity: ['W'],
    text: 'First strike',
  },
  'Fencing Ace': {
    cost: ['1', 'W'],
    types: ['creature'],
    subtypes: ['Human', 'Soldier'],
    pt: [1, 1],
    colors: ['W'],
    identity: ['W'],
    text: 'Double strike',
  },
  'Wall of Stone': {
    cost: ['1', 'R', 'R'],
    types: ['creature'],
    subtypes: ['Wall'],
    pt: [0, 8],
    colors: ['R'],
    identity: ['R'],
    text: 'Defender',
  },
  'Raging Goblin': {
    cost: ['R'],
    types: ['creature'],
    subtypes: ['Goblin', 'Berserker'],
    pt: [1, 1],
    colors: ['R'],
    identity: ['R'],
    text: 'Haste',
  },
  "Healer's Hawk": {
    cost: ['W'],
    types: ['creature'],
    subtypes: ['Bird'],
    pt: [1, 1],
    colors: ['W'],
    identity: ['W'],
    text: 'Flying, lifelink',
  },
};

/** Keyword abilities of the pure keyword creatures, written from the Oracle text. */
const KEYWORDS: Record<string, string[]> = {
  'Serra Angel': ['flying', 'vigilance'],
  'Typhoid Rats': ['deathtouch'],
  'Giant Spider': ['reach'],
  'Youthful Knight': ['firstStrike'],
  'Fencing Ace': ['doubleStrike'],
  'Wall of Stone': ['defender'],
  'Raging Goblin': ['haste'],
  "Healer's Hawk": ['flying', 'lifelink'],
};

/** Independent derivation of CR 105.2 colors from a mana cost. */
function colorsFromCost(cost: readonly string[] | null): Color[] {
  const found = new Set<Color>();
  for (const symbol of cost ?? []) {
    for (const part of symbol.split('/')) {
      if ((COLORS as readonly string[]).includes(part)) found.add(part as Color);
    }
  }
  return COLORS.filter((c) => found.has(c));
}

/** Independent derivation of CR 903.4 color identity for the simple fixtures. */
function identityOf(card: CardDefinition): Color[] {
  const found = new Set<Color>();
  for (const f of card.faces) {
    for (const c of colorsFromCost(f.manaCost)) found.add(c);
    // CR 903.4c: reminder text is ignored, but CR 305.6 gives basic land types an intrinsic
    // mana ability, so a basic land type contributes its color.
    const withoutReminder = f.oracleText.replace(/\([^)]*\)/g, '');
    for (const m of withoutReminder.matchAll(/\{([^}]+)\}/g)) {
      for (const c of colorsFromCost([m[1] ?? ''])) found.add(c);
    }
    if (f.types.includes('land')) {
      for (const sub of f.subtypes) {
        const color = BASIC_LAND_TYPES[sub];
        if (color !== undefined) found.add(color);
      }
    }
  }
  return COLORS.filter((c) => found.has(c));
}

describe('real card fixtures', () => {
  test('the fixture set is exactly the cards the task lists', () => {
    expect(Object.keys(FIXTURE_CARDS).sort()).toEqual(Object.keys(FACTS).sort());
  });

  test('every fixture validates, is supported and has a null oracleId', () => {
    for (const card of Object.values(FIXTURE_CARDS)) {
      expect(validateCard(card), card.name).toEqual([]);
      expect(card.support, card.name).toBe('supported');
      expect(card.oracleId, card.name).toBeNull();
      expect(card.layout, card.name).toBe('normal');
    }
  });

  test('record keys equal card names and face names', () => {
    for (const [key, card] of Object.entries(FIXTURE_CARDS)) {
      expect(card.name).toBe(key);
      // A card with several faces is named by its faces joined with " // " (Scryfall's convention).
      expect(
        card.faces.length === 1
          ? face(card).name
          : `SYNTHETIC ${card.faces.map((f) => f.name).join(' // ')}`,
      ).toBe(key);
    }
  });

  for (const [name, facts] of Object.entries(FACTS)) {
    test(`${name} matches the printed card`, () => {
      const card = fixtureCard(name);
      const f = face(card);
      expect(f.manaCost).toEqual(facts.cost);
      expect(f.supertypes).toEqual(facts.supertypes ?? []);
      expect(f.types).toEqual(facts.types);
      expect(f.subtypes).toEqual(facts.subtypes ?? []);
      expect([f.power, f.toughness]).toEqual(facts.pt ?? [null, null]);
      expect(f.colors).toEqual(facts.colors);
      expect(card.colorIdentity).toEqual(facts.identity);
      expect(f.oracleText).toBe(facts.text);
    });

    test(`${name} colors and color identity follow CR 105.2 and 903.4`, () => {
      const card = fixtureCard(name);
      expect(face(card).colors).toEqual(colorsFromCost(face(card).manaCost));
      expect(card.colorIdentity).toEqual(identityOf(card));
    });
  }

  test('keyword creatures carry exactly the keywords of their Oracle text, as keyword abilities', () => {
    for (const [name, keywords] of Object.entries(KEYWORDS)) {
      expect(face(fixtureCard(name)).abilities, name).toEqual(
        keywords.map((kind) => ({ kind: 'keyword', keyword: { kind } })),
      );
    }
  });

  test('basic lands have one tap mana ability for their color (CR 305.6, 605.1a)', () => {
    const lands: [string, Color][] = [
      ['Plains', 'W'],
      ['Island', 'U'],
      ['Swamp', 'B'],
      ['Mountain', 'R'],
      ['Forest', 'G'],
    ];
    for (const [name, color] of lands) {
      expect(face(fixtureCard(name)).abilities).toEqual([
        { kind: 'mana', cost: [{ kind: 'tap' }], production: { kind: 'fixed', mana: [color] } },
      ]);
    }
  });

  test('mana abilities are the mana kind (CR 605.1a)', () => {
    for (const name of ['Llanowar Elves', 'Sol Ring', 'Command Tower']) {
      const abilities = face(fixtureCard(name)).abilities;
      expect(abilities, name).toHaveLength(1);
      expect(abilities[0]?.kind, name).toBe('mana');
    }
  });

  test('Sol Ring makes two colorless and Llanowar Elves one green', () => {
    expect(face(fixtureCard('Sol Ring')).abilities[0]).toMatchObject({
      production: { kind: 'fixed', mana: ['C', 'C'] },
    });
    expect(face(fixtureCard('Llanowar Elves')).abilities[0]).toMatchObject({
      production: { kind: 'fixed', mana: ['G'] },
    });
  });

  test("Command Tower produces by commander's color identity", () => {
    expect(face(fixtureCard('Command Tower')).abilities[0]).toEqual({
      kind: 'mana',
      cost: [{ kind: 'tap' }],
      production: { kind: 'commanderIdentity' },
    });
  });

  test('the two legendary commanders have different color identities', () => {
    const a = fixtureCard('Isamaru, Hound of Konda');
    const b = fixtureCard('Yargle, Glutton of Urborg');
    expect(a.colorIdentity).not.toEqual(b.colorIdentity);
  });

  test('spell effects match the Oracle text', () => {
    expect(face(fixtureCard('Lightning Bolt')).spell?.effect).toEqual({
      kind: 'dealDamage',
      amount: 3,
      to: { kind: 'target', id: 't1' },
    });
    expect(face(fixtureCard('Lightning Bolt')).spell?.targets).toEqual([
      { id: 't1', what: { kind: 'anyTarget' } },
    ]);
    expect(face(fixtureCard('Murder')).spell?.effect).toEqual({
      kind: 'destroy',
      objects: { kind: 'target', id: 't1' },
    });
    expect(face(fixtureCard('Unsummon')).spell?.effect).toEqual({
      kind: 'moveToZone',
      objects: { kind: 'target', id: 't1' },
      to: 'hand',
    });
    expect(face(fixtureCard('Counterspell')).spell?.effect).toEqual({
      kind: 'counter',
      objects: { kind: 'target', id: 't1' },
    });
    expect(face(fixtureCard('Divination')).spell?.effect).toEqual({
      kind: 'draw',
      player: { kind: 'you' },
      count: 2,
    });
    expect(face(fixtureCard("Angel's Mercy")).spell?.effect).toEqual({
      kind: 'gainLife',
      player: { kind: 'you' },
      amount: 7,
    });
  });

  test('fixtureCard throws on an unknown name, including inherited keys', () => {
    expect(() => fixtureCard('Black Lotus')).toThrow('Unknown fixture card');
    expect(() => fixtureCard('toString')).toThrow('Unknown fixture card');
  });
});

describe('synthetic fixtures', () => {
  test('fixtures contain no SYNTHETIC names, synthetic cards all have one', () => {
    for (const name of Object.keys(FIXTURE_CARDS))
      expect(name.startsWith('SYNTHETIC ')).toBe(false);
    for (const [key, card] of Object.entries(SYNTHETIC_CARDS)) {
      expect(key.startsWith('SYNTHETIC ')).toBe(true);
      expect(card.name).toBe(key);
      // A card with several faces is named by its faces joined with " // " (Scryfall's convention).
      expect(
        card.faces.length === 1
          ? face(card).name
          : `SYNTHETIC ${card.faces.map((f) => f.name).join(' // ')}`,
      ).toBe(key);
    }
    for (const name of Object.keys(SYNTHETIC_CARDS)) expect(name in FIXTURE_CARDS).toBe(false);
  });

  test('every synthetic card is structurally valid and has a null oracleId', () => {
    for (const card of Object.values(SYNTHETIC_CARDS)) {
      expect(validateCardStructure(card), card.name).toEqual([]);
      expect(card.oracleId, card.name).toBeNull();
    }
  });

  test('synthetic cards that use features the engine does not run yet are rejected as supported, each for its own reason', () => {
    // These exist to exercise the validator. They become executable as their milestones land
    // (SUPPORTED_FEATURES), at which point this list shrinks and the move is deliberate. The
    // reason is pinned so a card cannot start being rejected (or stop) for a different feature.
    // Modal spells became executable with D-114, so the list is empty.
    const reasons: Record<string, string> = {};
    const rejected = Object.values(SYNTHETIC_CARDS).filter((card) => validateCard(card).length > 0);
    expect(rejected.map((card) => card.name).sort()).toEqual(Object.keys(reasons).sort());
    for (const card of rejected) {
      const messages = validateCard(card).map((i) => i.message);
      expect(messages, card.name).toEqual([expect.stringContaining(reasons[card.name] as string)]);
    }
  });

  test('the combat keyword synthetics, including SYNTHETIC Flying Lifelinker, are executable', () => {
    for (const name of [
      'SYNTHETIC Flying Lifelinker',
      'SYNTHETIC Menace 2/2',
      'SYNTHETIC Trampler 4/4',
      'SYNTHETIC Deathtouch Trampler 4/4',
      'SYNTHETIC First Striker 2/2',
      'SYNTHETIC Double Strike Lifelink 3/3',
      'SYNTHETIC Indestructible 2/2',
      'SYNTHETIC Flier 1/1',
      'SYNTHETIC Hasty Mana Elf',
      'SYNTHETIC Lifelink Bolt',
      'SYNTHETIC Vanilla Planeswalker',
      'SYNTHETIC Vanilla Battle',
    ]) {
      expect(validateCard(syntheticCard(name)), name).toEqual([]);
    }
  });

  test('the combat synthetics have the stats and keywords their names say', () => {
    const keywords = (name: string) =>
      face(syntheticCard(name)).abilities.flatMap((a) =>
        a.kind === 'keyword' ? [a.keyword.kind] : [],
      );
    const table: [string, [number, number], string[]][] = [
      ['SYNTHETIC Menace 2/2', [2, 2], ['menace']],
      ['SYNTHETIC Trampler 4/4', [4, 4], ['trample']],
      ['SYNTHETIC Deathtouch Trampler 4/4', [4, 4], ['deathtouch', 'trample']],
      ['SYNTHETIC Vanilla 1/1', [1, 1], []],
      ['SYNTHETIC Vanilla 2/2', [2, 2], []],
      ['SYNTHETIC Vanilla 3/3', [3, 3], []],
      ['SYNTHETIC Vanilla 5/5', [5, 5], []],
      ['SYNTHETIC First Striker 2/2', [2, 2], ['firstStrike']],
      ['SYNTHETIC Double Strike Lifelink 3/3', [3, 3], ['doubleStrike', 'lifelink']],
      ['SYNTHETIC Indestructible 2/2', [2, 2], ['indestructible']],
      ['SYNTHETIC Flier 1/1', [1, 1], ['flying']],
      ['SYNTHETIC Hasty Mana Elf', [1, 1], ['haste']],
    ];
    for (const [name, pt, kws] of table) {
      const f = face(syntheticCard(name));
      expect(f.types, name).toEqual(['creature']);
      expect([f.power, f.toughness], name).toEqual(pt);
      expect(keywords(name), name).toEqual(kws);
    }
  });

  test('the vanilla planeswalker has loyalty 4 and the vanilla battle defense 5, with no abilities', () => {
    const pw = face(syntheticCard('SYNTHETIC Vanilla Planeswalker'));
    expect(pw.types).toEqual(['planeswalker']);
    expect([pw.loyalty, pw.defense, pw.abilities]).toEqual([4, null, []]);
    const battle = face(syntheticCard('SYNTHETIC Vanilla Battle'));
    expect(battle.types).toEqual(['battle']);
    expect(battle.subtypes).not.toContain('Siege');
    expect([battle.loyalty, battle.defense, battle.abilities]).toEqual([null, 5, []]);
  });

  test('synthetic colors and identity are consistent with their costs', () => {
    for (const card of Object.values(SYNTHETIC_CARDS)) {
      for (const f of card.faces) {
        // A back face has no mana cost of its own: its color is printed as an indicator.
        if (f.manaCost !== null || card.faces.length === 1) {
          // Devoid (CR 702.114a) is colorless whatever its mana cost says (CR 202.2).
          const devoid = f.abilities.some(
            (a) => a.kind === 'keyword' && a.keyword.kind === 'devoid',
          );
          expect(f.colors, f.name).toEqual(devoid ? [] : colorsFromCost(f.manaCost));
        }
      }
      expect(card.colorIdentity, card.name).toEqual(identityOf(card));
    }
  });

  test('the requested cards exist with the requested behavior', () => {
    const dg = face(syntheticCard('SYNTHETIC Draw Three Gain Five'));
    expect(dg.manaCost).toEqual(['2', 'U']);
    expect(dg.types).toEqual(['sorcery']);
    expect(dg.spell?.effect).toEqual({
      kind: 'sequence',
      effects: [
        { kind: 'draw', player: { kind: 'you' }, count: 3 },
        { kind: 'gainLife', player: { kind: 'you' }, amount: 5 },
      ],
    });
    expect(face(syntheticCard('SYNTHETIC Bolt Two')).spell?.effect).toEqual({
      kind: 'sequence',
      effects: [
        { kind: 'dealDamage', amount: 2, to: { kind: 'eachOpponent' } },
        { kind: 'gainLife', player: { kind: 'you' }, amount: 2 },
      ],
    });
  });

  test('syntheticCard throws on an unknown name and on a real card name', () => {
    expect(() => syntheticCard('SYNTHETIC Nothing')).toThrow('Unknown synthetic card');
    expect(() => syntheticCard('Plains')).toThrow('Unknown synthetic card');
  });
});

describe('deckOf', () => {
  test('repeats cards by count, in order', () => {
    const deck = deckOf([
      ['Plains', 3],
      ['Lightning Bolt', 2],
    ]);
    expect(deck.map((c) => c.name)).toEqual([
      'Plains',
      'Plains',
      'Plains',
      'Lightning Bolt',
      'Lightning Bolt',
    ]);
    expect(deck[0]).toBe(fixtureCard('Plains'));
  });

  test('resolves SYNTHETIC names and accepts zero counts', () => {
    const deck = deckOf([
      ['SYNTHETIC Bolt Two', 1],
      ['Forest', 0],
    ]);
    expect(deck).toEqual([syntheticCard('SYNTHETIC Bolt Two')]);
  });

  test('throws on unknown names and bad counts', () => {
    expect(() => deckOf([['Black Lotus', 1]])).toThrow('Unknown fixture card');
    expect(() => deckOf([['Plains', -1]])).toThrow('Invalid count');
    expect(() => deckOf([['Plains', 1.5]])).toThrow('Invalid count');
  });
});
