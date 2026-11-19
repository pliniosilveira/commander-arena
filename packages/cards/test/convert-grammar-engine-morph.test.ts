// Morph through the grammar and the engine (CR 702.37): SYNTHETIC cards are parsed from the real shapes of the lines ("Morph {B}", "Morph {3}{R}{R}{R}", beside "Flying" and "{T}:
// Untap target artifact or creature."), defined in an engine scenario and played through applyAction: cast face down for {3}, a face-down 2/2 with no abilities, turned face up for
// the morph cost. Names start with "SYNTHETIC"; no real card's text is claimed.
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;

const DRAGON = parsed(
  'SYNTHETIC Parsed Morph Dragon',
  'Creature — Dragon',
  'Flying, trample\nMorph {3}{R}{R}{R}',
  { manaCost: '{5}{R}{R}{R}', power: '6', toughness: '6', colors: ['R'] },
);
const WIZARD = parsed('SYNTHETIC Parsed Morph Wizard', 'Creature — Human Wizard', 'Morph {U}', {
  manaCost: '{1}{U}',
  power: '1',
  toughness: '2',
  colors: ['U'],
});

type Builder = ReturnType<typeof scenario>;

function game(place: (b: Builder) => Builder) {
  return place(scenario().seat(0).life(20))
    .library(...FILLER)
    .seat(1)
    .life(20)
    .library(...FILLER)
    .at('precombatMain', { active: 0, turn: 3 })
    .build();
}

describe('"Morph {cost}" runs as written', () => {
  test('the lowering is the morph alternative cost with the morph cost', () => {
    expect(DRAGON.faces[0]?.alternativeCosts).toEqual([
      { kind: 'morph', cost: [{ kind: 'mana', symbols: ['3', 'R', 'R', 'R'] }] },
    ]);
  });

  test('an eight-mana creature is cast face down for {3} (nine lands), then turned face up for the morph cost', () => {
    const g = game((b) =>
      b.define(DRAGON).hand(DRAGON.name).battlefield('Mountain', { count: 9 }).seat(0),
    );
    g.act(0).cast(DRAGON.name, { alternative: 'morph', pay: true });
    g.pass();
    g.pass();
    g.expect.pt(DRAGON.name, 2, 2);
    g.expect.derived(DRAGON.name, { keywords: [] });
    g.expect.legal(0, { turnFaceUp: DRAGON.name }); // {3}{R}{R}{R}: the six Mountains left
    g.act(0).turnFaceUp(DRAGON.name, { pay: true });
    g.expect.pt(DRAGON.name, 6, 6);
    g.expect.derived(DRAGON.name, { keywords: ['flying', 'trample'] });
    g.expect.invariants();
  });

  test('a one-mana morph cost is paid with one land', () => {
    const g = game((b) =>
      b
        .define(WIZARD)
        .battlefield(WIZARD.name, { faceDown: 'morph' })
        .battlefield('Island')
        .seat(0),
    );
    g.act(0).turnFaceUp(WIZARD.name, { pay: true });
    g.expect.pt(WIZARD.name, 1, 2);
    expect(g.object(WIZARD.name).faceDown).toBeUndefined();
  });
});
