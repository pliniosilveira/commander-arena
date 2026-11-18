// Parsed text is only worth something if the engine runs it as written. This test imports a SYNTHETIC card through the grammar (never through a fixture) with the
// real lines of Will of the Temur (golden corpus, acceptance card of issue 103): "Choose one. If you control a commander as you cast this spell, you may choose both
// instead.", "Create a token that's a copy of target permanent, except it's a 4/4 Dragon creature with flying in addition to its other types." and "Target player draws
// cards equal to the greatest mana value among permanents you control." (CR 700.2, 903.3d, 707.2, 707.9b, 707.9d, 111.4). The name starts with "SYNTHETIC" and no real
// card's definition is claimed.
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const WILL = parsed(
  'SYNTHETIC Parsed Will',
  'Sorcery',
  "Choose one. If you control a commander as you cast this spell, you may choose both instead.\n• Create a token that's a copy of target permanent, except it's a 4/4 Dragon creature with flying in addition to its other types.\n• Target player draws cards equal to the greatest mana value among permanents you control.",
  { manaCost: '{5}{U}', colors: ['U'] },
);
const NAME = WILL.name;
const FILLER = Array.from({ length: 10 }, () => 'Island');

const game = (build: (b: ReturnType<typeof scenario>) => ReturnType<typeof scenario>) =>
  build(
    scenario()
      .seat(0)
      .define(WILL)
      .hand(NAME)
      .battlefield('Island', { count: 6 })
      .battlefield('Serra Angel')
      .library(...FILLER),
  )
    .seat(1)
    .library(...FILLER)
    .build();

describe('the token copy: "except it\'s a 4/4 Dragon creature with flying in addition to its other types"', () => {
  test('the lowering is a createToken of a copy with the exceptions the text says', () => {
    expect(JSON.stringify(WILL.faces[0]?.spell)).toContain(
      '"addSubtypes":["Dragon"],"addTypes":["creature"]',
    );
  });

  test('a copy of a land is a 4/4 Dragon land creature with flying, not a land only', () => {
    const g = game((b) => b);
    g.act(0).cast(NAME, {
      modes: [0],
      targets: [{ name: 'Island', zone: 'battlefield', seat: 0, nth: 0 }],
      pay: true,
    });
    g.passAll();
    expect(g.find({ name: 'Island', zone: 'battlefield', seat: 0 })).toHaveLength(7);
    const token = { name: 'Island', zone: 'battlefield', seat: 0, nth: 6 } as const;
    g.expect.pt(token, 4, 4);
    g.expect.derived(token, {
      types: ['land', 'creature'],
      subtypes: ['Island', 'Dragon'],
      keywords: ['flying'],
    });
    g.expect.invariants();
  });

  test('a copy of a 2/2 is 4/4', () => {
    const g = game((b) => b.battlefield('Grizzly Bears'));
    g.act(0).cast(NAME, { modes: [0], targets: ['Grizzly Bears'], pay: true });
    g.passAll();
    g.expect.pt('Grizzly Bears[0]', 2, 2);
    g.expect.pt('Grizzly Bears[1]', 4, 4);
    g.expect.derived('Grizzly Bears[1]', { subtypes: ['Bear', 'Dragon'], keywords: ['flying'] });
  });
});

describe('"Target player draws cards equal to the greatest mana value among permanents you control."', () => {
  test('Serra Angel is mana value 5: the player draws five', () => {
    const g = game((b) => b);
    g.act(0).cast(NAME, { modes: [1], targets: [{ player: 0 }], pay: true });
    g.passAll();
    g.expect.handSize(0, 5);
  });
});

describe('"If you control a commander as you cast this spell, you may choose both instead."', () => {
  test('with a commander on the battlefield both modes run in order: the token first, then the draw', () => {
    const g = game((b) => b.battlefield('Isamaru, Hound of Konda', { commander: true }));
    g.act(0).cast(NAME);
    const d = g.state.pending;
    expect(d).toMatchObject({ kind: 'chooseModes', min: 1, max: 2 });
    g.act(0).chooseModes(0, 1);
    g.act(0).chooseTargets({ name: 'Serra Angel', seat: 0 }, { player: 0 });
    g.act(0).payAuto();
    g.passAll();
    g.expect.derived('Serra Angel[1]', { subtypes: ['Angel', 'Dragon'] });
    g.expect.pt('Serra Angel[1]', 4, 4);
    g.expect.handSize(0, 5);
  });

  test('without one the choice stays at one mode', () => {
    const g = game((b) => b);
    g.act(0).cast(NAME);
    expect(g.state.pending).toMatchObject({ kind: 'chooseModes', max: 1 });
  });
});
