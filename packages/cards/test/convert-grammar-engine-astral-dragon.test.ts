// Parsed text is only worth something if the engine runs it as written. This test imports a SYNTHETIC card through the grammar (never through a fixture) with the real
// lines of Astral Dragon (golden corpus, acceptance card of issue 167): "Flying" and "Project Image — When this creature enters, create two tokens that are copies of target
// noncreature permanent, except they're 3/3 Dragon creatures in addition to their other types, and they have flying." (CR 707.9b, 707.9d, 111.4). The name starts with
// "SYNTHETIC" and no real card's definition is claimed.
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const DRAGON = parsed(
  'SYNTHETIC Parsed Astral Dragon',
  'Creature — Dragon',
  "Flying\nProject Image — When this creature enters, create two tokens that are copies of target noncreature permanent, except they're 3/3 Dragon creatures in addition to their other types, and they have flying.",
  { manaCost: '{1}', colors: ['U'], power: '4', toughness: '4' },
);
const NAME = DRAGON.name;
const FILLER = Array.from({ length: 8 }, () => 'Island');

const game = (opponent: (b: ReturnType<typeof scenario>) => ReturnType<typeof scenario>) =>
  opponent(
    scenario()
      .seat(0)
      .define(DRAGON)
      .hand(NAME)
      .battlefield('Island', { count: 2 })
      .library(...FILLER)
      .seat(1),
  )
    .library(...FILLER)
    .build();

describe('"create two tokens that are copies of target noncreature permanent, except they\'re 3/3 Dragon creatures in addition to their other types, and they have flying"', () => {
  test('the lowering is a createToken of two copies with the exceptions the text says', () => {
    const text = JSON.stringify(DRAGON.faces[0]?.abilities);
    expect(text).toContain('"addSubtypes":["Dragon"],"addTypes":["creature"]');
    expect(text).toContain('"setPt":{"power":3,"toughness":3}');
  });

  test('two copies of a land are 3/3 Dragon land creatures with flying', () => {
    const g = game((b) => b);
    g.act(0).cast(NAME, { pay: true });
    g.passAll();
    g.act(0).chooseTargets({ name: 'Island', zone: 'battlefield', seat: 0, nth: 0 });
    g.passAll();
    expect(g.find({ name: 'Island', zone: 'battlefield', seat: 0 })).toHaveLength(4);
    for (const nth of [2, 3]) {
      const token = { name: 'Island', zone: 'battlefield', seat: 0, nth } as const;
      g.expect.pt(token, 3, 3);
      g.expect.derived(token, {
        types: ['land', 'creature'],
        subtypes: ['Island', 'Dragon'],
        keywords: ['flying'],
      });
    }
    g.expect.invariants();
  });

  test('a creature is not a legal target', () => {
    const g = game((b) => b.battlefield('Grizzly Bears'));
    g.act(0).cast(NAME, { pay: true });
    g.passAll();
    expect(JSON.stringify(g.state.pending)).not.toContain('Grizzly Bears');
  });
});
