// Station (CR 702.184, 721) read through the grammar and played in the engine. SYNTHETIC cards (names start with "SYNTHETIC"); the wording of each text is that of the real
// cards of the golden corpus (Evendo, Waking Haven; Uthros, Titanic Godcore; The Eternity Elevator; names replaced by ~) or a SYNTHETIC variant that changes a number or a
// filter only. No real card's text is claimed. The engine side is pinned in packages/engine/test/scenario-xx-station.test.ts.
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed, parseOnly } from './convert-grammar-helpers';
import { syntheticCard } from './convert-helpers';

const STATION_REMINDER =
  'Station (Tap another creature you control: Put charge counters equal to its power on this Planet. Station only as a sorcery.)';
const LIBRARY = Array.from({ length: 8 }, () => 'Plains');
const BIG = 'SYNTHETIC Vanilla 3/3';
const HUGE = 'SYNTHETIC Vanilla 5/5';

const planet = (name: string, symbol: string) =>
  parsed(
    name,
    'Land — Planet',
    `This land enters tapped.\n{T}: Add {G}.\n${STATION_REMINDER}\n${symbol}`,
  );

const ship = (name: string, symbol: string) =>
  parsed(
    name,
    'Legendary Artifact — Spacecraft',
    `{T}: Add {C}{C}{C}.\nStation (Tap another creature you control: Put charge counters equal to its power on this Spacecraft. Station only as a sorcery.)\n${symbol}`,
    { manaCost: '{5}' },
  );

const game = (...define: Parameters<ReturnType<typeof scenario>['define']>[0][]) => {
  let b = scenario()
    .seat(0)
    .library(...LIBRARY);
  for (const d of define) b = b.define(d);
  return b;
};

describe('Station reads as the keyword and a station level', () => {
  test('the keyword line with its reminder text, and "12+ | ..." as a level with the threshold', () => {
    const def = planet(
      'SYNTHETIC Parsed Planet',
      '12+ | {G}, {T}: Add {G} for each creature you control.',
    );
    const abilities = def.faces[0]?.abilities ?? [];
    expect(abilities.map((a) => a.kind)).toEqual([
      'replacement',
      'mana',
      'keyword',
      'stationLevel',
    ]);
    expect(abilities[2]).toEqual({ kind: 'keyword', keyword: { kind: 'station' } });
    expect(abilities[3]).toEqual({
      kind: 'stationLevel',
      threshold: 12,
      abilities: [
        {
          kind: 'mana',
          cost: [{ kind: 'mana', symbols: ['G'] }, { kind: 'tap' }],
          production: {
            kind: 'fixed',
            mana: ['G'],
            times: { kind: 'countOf', filter: { types: ['creature'], controller: 'you' } },
          },
        },
      ],
    });
  });

  test('"X mana of any one color, where X is the number of charge counters on ~" is a counted anyColorAmount production', () => {
    const def = ship(
      'SYNTHETIC Parsed Ship',
      '20+ | {T}: Add X mana of any one color, where X is the number of charge counters on ~.',
    );
    const level = def.faces[0]?.abilities[2];
    expect(level).toEqual({
      kind: 'stationLevel',
      threshold: 20,
      abilities: [
        {
          kind: 'mana',
          cost: [{ kind: 'tap' }],
          production: {
            kind: 'anyColorAmount',
            amount: { kind: 'countersOn', of: { kind: 'this' }, counter: 'charge' },
          },
        },
      ],
    });
  });
});

describe('what the grammar refuses, as a whole and flagged', () => {
  const read = (typeLine: string, text: string) =>
    parseOnly(syntheticCard({ name: 'SYNTHETIC Refused', typeLine, oracleText: text }));

  test('Station on a card that is not a Spacecraft or a Planet', () => {
    const r = read('Artifact', `{T}: Add {C}.\n${STATION_REMINDER}`);
    expect(r.support.status).toBe('unsupported');
  });

  test('a station symbol on a card that is not a station card', () => {
    const r = read('Artifact', '{T}: Add {C}.\n3+ | {T}: Add {C}{C}.');
    expect(r.support.status).toBe('unsupported');
  });

  test('a threshold of 0', () => {
    const r = read('Land — Planet', `${STATION_REMINDER}\n0+ | {T}: Add {G}.`);
    expect(r.support.status).toBe('unsupported');
  });

  // CR 721.2: the abilities printed in the striation of a station symbol are part of its static ability, and the text gives the symbol once, at the head of the striation.
  test('a line after a station symbol that carries no symbol is in the striation of that symbol: it is read at its threshold, never as an ability of every count', () => {
    const r = read('Land — Planet', `${STATION_REMINDER}\n3+ | {T}: Add {G}.\n{T}: Add {C}{C}.`);
    expect(r.support.status).toBe('supported');
    const abilities = r.definition.faces[0]?.abilities ?? [];
    const levels = abilities.filter((a) => a.kind === 'stationLevel');
    expect(levels).toHaveLength(1);
    const [level] = levels;
    if (level?.kind !== 'stationLevel') throw new Error('no station symbol');
    expect(level.threshold).toBe(3);
    expect(level.abilities.map((a) => a.kind)).toEqual(['mana', 'mana']);
    expect(abilities.some((a) => a.kind === 'mana')).toBe(false);
  });

  test('a line of a striation that is not read makes the card unsupported: the symbol is never left with half its abilities', () => {
    const r = read(
      'Land — Planet',
      `${STATION_REMINDER}\n3+ | {T}: Add {G}.\nFrobnicate the gizmo.`,
    );
    expect(r.support.status).toBe('unsupported');
    expect(r.support.unparsed.map((u) => u.text)).toEqual(['Frobnicate the gizmo.']);
  });

  test('a symbol after a striation of two lines starts its own striation', () => {
    const r = read(
      'Land — Planet',
      `${STATION_REMINDER}\n3+ | {T}: Add {G}.\n{T}: Add {C}{C}.\n8+ | {T}: Add {G}{G}{G}.`,
    );
    expect(r.support.status).toBe('supported');
    const levels = (r.definition.faces[0]?.abilities ?? []).flatMap((a) =>
      a.kind === 'stationLevel' ? [[a.threshold, a.abilities.length]] : [],
    );
    expect(levels).toEqual([
      [3, 2],
      [8, 1],
    ]);
  });

  test('"for each" mana of a choice of colors, and with a sacrifice cost: never read as one mana', () => {
    for (const text of [
      '{T}: Add {B} or {G} for each creature you control.',
      '{T}, Sacrifice a creature: Add {B} for each creature you control.',
    ]) {
      const r = read('Land', text);
      expect(r.support.status, text).toBe('unsupported');
    }
  });

  test('"Add X mana of any one color" in a spell, and without the sentence that defines X', () => {
    expect(read('Artifact', '{T}: Add X mana of any one color.').support.status).toBe(
      'unsupported',
    );
    const spell = parseOnly(
      syntheticCard({
        name: 'SYNTHETIC Refused Spell',
        manaCost: '{1}{G}',
        typeLine: 'Sorcery',
        oracleText: 'Add X mana of any one color, where X is the number of creatures you control.',
      }),
    );
    expect(spell.support.status).toBe('unsupported');
  });
});

describe('"for each" in a mana ability is counted as it resolves (it was read as one mana before)', () => {
  test('Everflowing-style: {T}: Add {C} for each charge counter on ~', () => {
    const def = parsed(
      'SYNTHETIC Parsed Chalice',
      'Artifact',
      '{T}: Add {C} for each charge counter on ~.',
      { manaCost: '{2}' },
    );
    const g = game(def)
      .battlefield(def.name, { counters: { charge: 3 } })
      .seat(1)
      .build();
    g.act(0).tapForMana(def.name);
    g.expect.pool(0, 'CCC');
  });
});

describe('the three cards of the golden corpus play in the engine', () => {
  test('Planet: charge it with a 3/3 and a 5/5, then {G}, {T} adds a {G} for each creature (12+ shown with a SYNTHETIC lower threshold)', () => {
    const def = planet(
      'SYNTHETIC Parsed Planet',
      '3+ | {G}, {T}: Add {G} for each creature you control.',
    );
    const g = game(def).battlefield(def.name, BIG, HUGE, 'Forest').seat(1).build();
    g.act(0).activate(def.name); // the first activated ability that is not a mana ability: Station
    g.act(0).choosePermanents(HUGE);
    g.passAll();
    g.expect.counters(def.name, { charge: 5 });
    g.act(0).tapForMana('Forest');
    g.act(0).tapForMana(def.name, { ability: 3 }); // replacement, mana, keyword, the level's mana, Station
    g.expect.pool(0, 'GG'); // {G} paid; one {G} for each of the two creatures (the tapped one counts)
  });

  test('Spacecraft: with the threshold met it makes as many mana of one color as it has charge counters', () => {
    const def = ship(
      'SYNTHETIC Parsed Ship',
      '4+ | {T}: Add X mana of any one color, where X is the number of charge counters on ~.',
    );
    const g = game(def)
      .battlefield(def.name, { counters: { charge: 6 } })
      .seat(1)
      .build();
    g.act(0).tapForMana(def.name, { ability: 2, color: 'B' });
    g.expect.pool(0, 'BBBBBB');
  });
});

describe('CR 721.2b, 721.2c: the power and toughness box of a station card is the creature its symbol makes', () => {
  const boxed = (reminderThreshold: string, symbol: string, power = '3', toughness = '4') =>
    parseOnly(
      syntheticCard({
        name: 'SYNTHETIC Boxed Ship',
        typeLine: 'Artifact — Spacecraft',
        manaCost: '{3}',
        power,
        toughness,
        oracleText: `Station (Tap another creature you control: Put charge counters equal to its power on this Spacecraft. Station only as a sorcery. It's an artifact creature at ${reminderThreshold}.)\n${symbol}`,
      }),
    );

  test('the symbol holds the creature type and the base power and toughness, and the card has none of its own', () => {
    const imported = boxed('4+', '4+ | Flying');
    expect(imported.support.status).toBe('supported');
    const face = imported.definition.faces[0];
    expect(face?.power).toBeNull();
    expect(face?.toughness).toBeNull();
    expect(face?.abilities.at(-1)).toEqual({
      kind: 'stationLevel',
      threshold: 4,
      abilities: [
        { kind: 'keyword', keyword: { kind: 'flying' } },
        {
          kind: 'static',
          static: {
            kind: 'setTypes',
            subject: { kind: 'this' },
            additive: true,
            types: ['creature'],
          },
        },
        {
          kind: 'static',
          static: { kind: 'setPt', subject: { kind: 'this' }, power: 3, toughness: 4 },
        },
      ],
    });
  });

  test('in a game it is a plain artifact below the threshold and a 3/4 artifact creature from it', () => {
    const def = boxed('4+', '4+ | Flying').definition;
    const below = game(def)
      .battlefield(def.name, { counters: { charge: 3 } })
      .seat(1)
      .build();
    below.expect.derived(def.name, { types: ['artifact'], keywords: ['station'] });
    const at = game(def)
      .battlefield(def.name, { counters: { charge: 4 } })
      .seat(1)
      .build();
    at.expect.pt(def.name, 3, 4);
    at.expect.derived(def.name, {
      types: ['artifact', 'creature'],
      keywords: ['station', 'flying'],
    });
  });

  test.each([
    // a box whose reminder text names no symbol, or two
    [
      'no threshold in the reminder text',
      'Station (Tap another creature you control: Put charge counters equal to its power on this Spacecraft. Station only as a sorcery.)\n4+ | Flying',
    ],
    // the threshold of the reminder text is not one of the symbols
    [
      'a symbol other than the one the reminder names',
      "Station (Tap another creature you control: Put charge counters equal to its power on this Spacecraft. Station only as a sorcery. It's an artifact creature at 7+.)\n4+ | Flying",
    ],
  ])('never half read: %s is unsupported', (_why, text) => {
    const imported = parseOnly(
      syntheticCard({
        name: 'SYNTHETIC Unplaced Box Ship',
        typeLine: 'Artifact — Spacecraft',
        manaCost: '{3}',
        power: '3',
        toughness: '4',
        oracleText: text,
      }),
    );
    expect(imported.support.status).toBe('unsupported');
    expect(imported.support.reasons.join(' ')).toContain('CR 721.2b');
  });

  test('a power or toughness that is not a number is unsupported', () => {
    expect(boxed('4+', '4+ | Flying', '*', '4').support.status).toBe('unsupported');
  });
});
