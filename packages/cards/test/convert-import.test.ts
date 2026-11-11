import { FIXTURE_CARDS, validateCard, validateCardStructure } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { createFixtureRegistry, importCard, PARSER_VERSION } from '../src/index';
import {
  SYNTHETIC_FOREST,
  SYNTHETIC_KEYWORD_CREATURE,
  SYNTHETIC_MANA_DORK,
  SYNTHETIC_VANILLA,
  syntheticCard,
  syntheticFace,
} from './convert-helpers';

describe('supported cards', () => {
  test.each([
    ['vanilla creature', SYNTHETIC_VANILLA],
    ['keyword creature', SYNTHETIC_KEYWORD_CREATURE],
    ['basic land', SYNTHETIC_FOREST],
    ['mana dork', SYNTHETIC_MANA_DORK],
  ])('%s is supported and passes validateCard', (_label, stored) => {
    const imported = importCard(stored);
    expect(imported.support.reasons).toEqual([]);
    expect(imported.support.unparsed).toEqual([]);
    expect(imported.support.status).toBe('supported');
    expect(imported.definition.support).toBe('supported');
    expect(validateCard(imported.definition)).toEqual([]);
    expect(imported.support.parserVersion).toBe(PARSER_VERSION);
  });

  test('the vanilla creature has the converted characteristics and the Scryfall identity', () => {
    const { definition } = importCard(SYNTHETIC_VANILLA);
    expect(definition.oracleId).toBe(SYNTHETIC_VANILLA.oracleId);
    expect(definition.layout).toBe('normal');
    expect(definition.colorIdentity).toEqual(['G']);
    expect(definition.faces).toEqual([
      {
        name: 'SYNTHETIC Vanilla Bear',
        manaCost: ['1', 'G'],
        supertypes: [],
        types: ['creature'],
        subtypes: ['Bear'],
        colors: ['G'],
        power: 2,
        toughness: 2,
        loyalty: null,
        defense: null,
        oracleText: '',
        abilities: [],
        spell: null,
      },
    ]);
    expect(importCard(SYNTHETIC_VANILLA).support.source).toBe('parser');
  });

  test('the keyword creature gets one keyword ability per keyword, from the parser', () => {
    const imported = importCard(SYNTHETIC_KEYWORD_CREATURE);
    expect(imported.support.source).toBe('parser');
    expect(imported.definition.faces[0]?.abilities).toEqual([
      { kind: 'keyword', keyword: { kind: 'flying' } },
      { kind: 'keyword', keyword: { kind: 'vigilance' } },
    ]);
  });

  test('a basic land gets its intrinsic mana ability from its land type (CR 305.6)', () => {
    const face = importCard(SYNTHETIC_FOREST).definition.faces[0];
    expect(face?.manaCost).toBeNull();
    expect(face?.supertypes).toEqual(['basic']);
    expect(face?.abilities).toEqual([
      { kind: 'mana', cost: [{ kind: 'tap' }], production: { kind: 'fixed', mana: ['G'] } },
    ]);
  });

  test('a dual-type land gets one mana ability per basic land type, in type line order', () => {
    const card = importCard(
      syntheticCard(
        {
          name: 'SYNTHETIC Marsh',
          typeLine: 'Land — Swamp Mountain',
          oracleText: '({T}: Add {B} or {R}.)',
        },
        { colorIdentity: ['B', 'R'] },
      ),
    );
    expect(card.support.status).toBe('supported');
    expect(
      card.definition.faces[0]?.abilities.map((a) => a.kind === 'mana' && a.production),
    ).toEqual([
      { kind: 'fixed', mana: ['B'] },
      { kind: 'fixed', mana: ['R'] },
    ]);
  });

  test('a mana artifact and any-color land are supported by the parser', () => {
    const ring = importCard(
      syntheticCard(
        {
          name: 'SYNTHETIC Ring',
          manaCost: '{1}',
          typeLine: 'Artifact',
          oracleText: '{T}: Add {C}{C}.',
        },
        { colorIdentity: [] },
      ),
    );
    expect(ring.support.status).toBe('supported');
    const land = importCard(
      syntheticCard({
        name: 'SYNTHETIC Rainbow',
        typeLine: 'Land',
        oracleText: '{T}: Add one mana of any color.',
      }),
    );
    expect(land.support.status).toBe('supported');
    expect(validateCard(land.definition)).toEqual([]);
  });

  test('legendary cards: the short name in the text is normalized and does not block parsing', () => {
    const card = importCard(
      syntheticCard(
        {
          name: 'SYNTHETIC Hero, the Test',
          manaCost: '{W}',
          typeLine: 'Legendary Creature — Dog',
          oracleText: 'Flying (SYNTHETIC Hero can fly.)',
          power: '1',
          toughness: '1',
          colors: ['W'],
        },
        { colorIdentity: ['W'] },
      ),
    );
    expect(card.support.status).toBe('supported');
    expect(card.definition.faces[0]?.supertypes).toEqual(['legendary']);
  });
});

describe('partial parses are unsupported, never partial', () => {
  const card = syntheticCard(
    {
      name: 'SYNTHETIC Mixed',
      manaCost: '{1}{G}',
      typeLine: 'Creature — Elf',
      oracleText: 'Flying\nWhenever your opponents cast a spell, draw a card.',
      power: '1',
      toughness: '1',
      colors: ['G'],
    },
    { colorIdentity: ['G'] },
  );

  test('the good ability is kept, the bad one is dropped and reported', () => {
    const imported = importCard(card);
    expect(imported.support.status).toBe('unsupported');
    expect(imported.definition.support).toBe('unsupported');
    expect(imported.definition.faces[0]?.abilities).toEqual([
      { kind: 'keyword', keyword: { kind: 'flying' } },
    ]);
    expect(imported.support.unparsed).toMatchObject([
      {
        face: 0,
        ability: 1,
        text: 'Whenever your opponents cast a spell, draw a card.',
        stoppedAt: 'Whenever your opponents cast a spell, draw a card.',
        closestRule: 'none',
        reason: 'unrecognised',
        slot: 'trigger',
      },
    ]);
    expect(imported.support.reasons).toEqual([]);
  });

  test('keywords with parameters stay unparsed with the right position', () => {
    const imported = importCard(
      syntheticCard({
        name: 'SYNTHETIC Warded',
        manaCost: '{2}',
        typeLine: 'Creature — Wall',
        oracleText: 'Flying, ward—Discard a card.',
        power: '1',
        toughness: '1',
      }),
    );
    expect(imported.support.status).toBe('unsupported');
    expect(imported.support.unparsed[0]).toMatchObject({
      text: 'Flying, ward—Discard a card.',
      stoppedAt: 'ward—Discard a card.',
      closestRule: 'keyword.line',
    });
    expect(imported.definition.faces[0]?.abilities).toEqual([]);
  });

  test('an instant whose text is not understood gets no spell effect and one clean reason', () => {
    const imported = importCard(
      syntheticCard(
        {
          name: 'SYNTHETIC Growth',
          manaCost: '{G}',
          typeLine: 'Instant',
          oracleText: 'Target creature gets +3/+3 until your next turn.',
          colors: ['G'],
        },
        { colorIdentity: ['G'] },
      ),
    );
    expect(imported.support.status).toBe('unsupported');
    expect(imported.definition.faces[0]?.spell).toBeNull();
    expect(imported.support.unparsed).toHaveLength(1);
    expect(imported.support.unparsed[0]?.text).toBe(
      'Target creature gets +3/+3 until your next turn.',
    );
    expect(imported.support.reasons).toEqual([]);
  });

  test('an instant with no text is unsupported through engine validation', () => {
    const imported = importCard(
      syntheticCard({ name: 'SYNTHETIC Blank', manaCost: '{U}', typeLine: 'Instant' }),
    );
    expect(imported.support.status).toBe('unsupported');
    expect(imported.support.reasons).toEqual([
      'faces[0].spell: an instant or sorcery must have spell text with an effect',
    ]);
  });

  test('an unsupported definition keeps a well-formed structure the engine can load', () => {
    const imported = importCard(card);
    expect(validateCardStructure(imported.definition)).toEqual([]);
  });
});

describe('layouts', () => {
  const front = syntheticFace({
    name: 'SYNTHETIC Front',
    manaCost: '{1}{U}',
    typeLine: 'Creature — Human',
    oracleText: 'Flying',
    power: '1',
    toughness: '1',
    colors: ['U'],
  });
  const back = syntheticFace({
    name: 'SYNTHETIC Back',
    typeLine: 'Creature — Horror',
    oracleText: 'Flying',
    power: '3',
    toughness: '3',
    colors: ['U'],
  });

  test('a transform card converts both faces and is supported when both read', () => {
    const imported = importCard(
      syntheticCard(
        {},
        { name: 'SYNTHETIC Front // SYNTHETIC Back', layout: 'transform', faces: [front, back] },
      ),
    );
    expect(imported.definition.layout).toBe('transform');
    expect(imported.definition.faces.map((f) => f.name)).toEqual([
      'SYNTHETIC Front',
      'SYNTHETIC Back',
    ]);
    expect(imported.definition.faces.every((f) => f.abilities.length === 1)).toBe(true);
    expect(imported.support.status).toBe('supported');
    expect(imported.support.reasons).toEqual([]);
    expect(imported.support.unparsed).toEqual([]);
  });

  test('diagnostics of a second face carry that face index', () => {
    const imported = importCard(
      syntheticCard(
        {},
        {
          name: 'SYNTHETIC Front // SYNTHETIC Back',
          layout: 'modal_dfc',
          faces: [front, { ...back, oracleText: 'Banding' }],
        },
      ),
    );
    expect(imported.support.unparsed).toMatchObject([
      { face: 1, ability: 0, stoppedAt: 'Banding' },
    ]);
  });

  test('a layout the engine does not model becomes a normal definition from face 0', () => {
    const imported = importCard(
      syntheticCard({}, { name: 'SYNTHETIC Flipper', layout: 'flip', faces: [front, back] }),
    );
    expect(imported.definition.layout).toBe('normal');
    expect(imported.definition.faces).toHaveLength(1);
    expect(imported.definition.faces[0]?.name).toBe('SYNTHETIC Front');
    expect(imported.support.status).toBe('unsupported');
    expect(imported.support.reasons).toEqual(['layout "flip" is not supported']);
  });

  test('a known layout with the wrong face count falls back to face 0', () => {
    const imported = importCard(syntheticCard({}, { layout: 'split', faces: [front] }));
    expect(imported.definition.layout).toBe('normal');
    expect(imported.support.reasons).toEqual(['layout "split" needs 2 face(s), found 1']);
  });

  test('an otherwise perfect card in a layout the engine does not model is still unsupported', () => {
    const imported = importCard(
      syntheticCard({ ...front, typeLine: 'Creature — Human' }, { layout: 'leveler' }),
    );
    expect(imported.support.status).toBe('unsupported');
  });
});

describe('fixtures act as the first overrides', () => {
  test('a fixture is used when its text matches, with the Scryfall oracle id', () => {
    const imported = importCard(SYNTHETIC_MANA_DORK);
    expect(imported.support.source).toBe('fixture');
    expect(imported.support.status).toBe('supported');
    expect(imported.definition.oracleId).toBe('synthetic-oracle-llanowar-elves');
    expect(imported.definition.faces[0]?.abilities).toEqual(
      FIXTURE_CARDS['Llanowar Elves']?.faces[0]?.abilities,
    );
  });

  test('the basic land fixtures match real reminder-text-only Oracle text', () => {
    const imported = importCard(
      syntheticCard(
        {
          name: 'Forest',
          typeLine: 'Basic Land — Forest',
          oracleText: '({T}: Add {G}.)',
        },
        { colorIdentity: ['G'], oracleId: 'synthetic-oracle-forest' },
      ),
    );
    expect(imported.support.source).toBe('fixture');
    expect(imported.support.status).toBe('supported');
  });

  test('the fixture is matched by exact normalized name (curly apostrophe, extra spaces)', () => {
    const imported = importCard(
      syntheticCard(
        {
          name: 'Healer’s  Hawk',
          manaCost: '{W}',
          typeLine: 'Creature — Bird',
          oracleText: 'Flying, lifelink',
          power: '1',
          toughness: '1',
          colors: ['W'],
        },
        { colorIdentity: ['W'] },
      ),
    );
    expect(imported.support.source).toBe('fixture');
  });

  test('a fixture whose text differs is not used and the mismatch is reported', () => {
    const imported = importCard(
      syntheticCard(
        { ...SYNTHETIC_MANA_DORK.faces[0], oracleText: '{T}: Add {G}{G}.' },
        { colorIdentity: ['G'], oracleId: 'synthetic-oracle-llanowar-elves' },
      ),
    );
    expect(imported.support.source).toBe('parser');
    expect(imported.support.status).toBe('unsupported');
    expect(imported.support.reasons).toContain('fixture mismatch: Llanowar Elves');
    expect(imported.support.reasons).toContain('fixture differs from Scryfall in: oracle text');
    // The parser result is still produced from the real text, not from the fixture.
    expect(imported.definition.faces[0]?.abilities).toEqual([
      { kind: 'mana', cost: [{ kind: 'tap' }], production: { kind: 'fixed', mana: ['G', 'G'] } },
    ]);
  });

  test('a fixture whose printed characteristics differ is a mismatch too', () => {
    const imported = importCard(
      syntheticCard(
        { ...SYNTHETIC_MANA_DORK.faces[0], power: '2' },
        { colorIdentity: ['G'], oracleId: 'synthetic-oracle-llanowar-elves' },
      ),
    );
    expect(imported.support.status).toBe('unsupported');
    expect(imported.support.reasons).toContain('fixture mismatch: Llanowar Elves');
    expect(imported.support.reasons.join('\n')).toContain('power, toughness, loyalty or defense');
  });

  test('reminder text differences do not count as a mismatch', () => {
    const imported = importCard(
      syntheticCard(
        { ...SYNTHETIC_MANA_DORK.faces[0], oracleText: '{T}: Add {G}. (SYNTHETIC reminder.)' },
        { colorIdentity: ['G'], oracleId: 'synthetic-oracle-llanowar-elves' },
      ),
    );
    expect(imported.support.source).toBe('fixture');
    expect(imported.definition.faces[0]?.oracleText).toBe('{T}: Add {G}. (SYNTHETIC reminder.)');
  });

  test('an override registry can be injected, and it is consulted before the parser', () => {
    const registry = createFixtureRegistry({});
    const imported = importCard(SYNTHETIC_MANA_DORK, PARSER_VERSION, registry);
    expect(imported.support.source).toBe('parser');
    expect(imported.support.status).toBe('supported');
  });

  test('importCard uses the parser version it is given', () => {
    expect(importCard(SYNTHETIC_VANILLA, 42).support.parserVersion).toBe(42);
  });
});

describe('every engine fixture survives a round trip through the converter', () => {
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  test.each(Object.values(FIXTURE_CARDS).map((f) => [f.name, f] as const))(
    '%s',
    (_name, fixture) => {
      const face = fixture.faces[0];
      if (face === undefined) throw new Error('fixture without a face');
      const typeLine = `${[...face.supertypes, ...face.types].map(cap).join(' ')}${
        face.subtypes.length > 0 ? ` — ${face.subtypes.join(' ')}` : ''
      }`;
      const stored = syntheticCard(
        {
          name: fixture.name,
          manaCost: face.manaCost === null ? '' : face.manaCost.map((s) => `{${s}}`).join(''),
          typeLine,
          oracleText: face.oracleText,
          power: face.power === null ? null : String(face.power),
          toughness: face.toughness === null ? null : String(face.toughness),
          colors: [...face.colors],
        },
        { colorIdentity: [...fixture.colorIdentity], oracleId: `synthetic-oracle-${fixture.name}` },
      );
      const imported = importCard(stored);
      expect(imported.support.reasons).toEqual([]);
      expect(imported.support.source).toBe('fixture');
      expect(imported.support.status).toBe('supported');
      expect(imported.definition.oracleId).toBe(stored.oracleId);
      expect(validateCard(imported.definition)).toEqual([]);
      // The fixture and the grammar agree wherever the grammar can read the text.
      const viaParser = importCard(stored, PARSER_VERSION, createFixtureRegistry({}));
      if (viaParser.support.status === 'supported') {
        expect(viaParser.definition.faces).toEqual(imported.definition.faces);
      }
    },
  );
});
