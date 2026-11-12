// Parsed text is only worth something if the engine runs it as written (stage P97, D-971). These tests import SYNTHETIC cards through the grammar (never
// through a fixture), define them in an engine scenario and play them through applyAction: Miracle (CR 702.94a: the reveal as the first card of the turn is
// drawn, the trigger, the cast from the hand for the miracle cost with the {X} announced, CR 107.3a). The lines are the real ones of Entreat the Angels
// ("Create X 4/4 white Angel creature tokens with flying." and "Miracle {X}{W}{W}", golden corpus) and the template "Miracle {1}{R}" of
// reports/templates.json; every name starts with "SYNTHETIC" and no real card's text is claimed.
import { getView } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;

type Builder = ReturnType<typeof scenario>;

const ANGELS = parsed(
  'SYNTHETIC Parsed Miracle Angels',
  'Sorcery',
  'Create X 4/4 white Angel creature tokens with flying.\nMiracle {X}{W}{W}',
  { manaCost: '{X}{X}{W}{W}{W}', colors: ['W'] },
);
const BURN = parsed(
  'SYNTHETIC Parsed Miracle Burn',
  'Instant',
  '~ deals 3 damage to target creature.\nMiracle {R}',
  { manaCost: '{1}{R}', colors: ['R'] },
);

/** The draw step of seat 0's turn 3: `card` is on top of seat 0's library, `place` puts the rest on the table. */
function drawStep(card: string, place: (b: Builder) => Builder) {
  const g = place(scenario().seat(0).life(20).define(ANGELS).define(BURN))
    .library(card)
    .library(...FILLER)
    .seat(1)
    .life(20)
    .library(...FILLER)
    .at('upkeep', { active: 0, turn: 3 })
    .build();
  g.passAll();
  return g;
}

const resolveTop = (g: ReturnType<typeof drawStep>): void => {
  g.pass();
  g.pass();
};

describe('"Create X 4/4 white Angel creature tokens with flying." with "Miracle {X}{W}{W}" (Entreat the Angels)', () => {
  test('the lowering is an alternative cost of the face with its X, and the spell is an X spell', () => {
    expect(ANGELS.faces[0]?.alternativeCosts).toEqual([
      { kind: 'miracle', cost: [{ kind: 'mana', symbols: ['X', 'W', 'W'] }] },
    ]);
    expect(ANGELS.faces[0]?.abilities).toEqual([]);
    expect(ANGELS.faces[0]?.spell?.x).toBe(true);
  });

  test('drawn first in the draw step: reveal, trigger, cast for {X}{W}{W} with X announced, and X Angels with flying', () => {
    const g = drawStep(ANGELS.name, (b) => b.battlefield('Plains', { count: 6 }));
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.expect.stack([`${ANGELS.name} (ability)`]);
    resolveTop(g);
    const asked = g.state.pending;
    if (asked?.kind !== 'confirmOptional') throw new Error(`pending ${asked?.kind}`);
    expect(asked.purpose).toBe('miracle');
    expect(asked.cost).toEqual([{ kind: 'mana', symbols: ['X', 'W', 'W'] }]);
    g.act(0).accept();
    const x = g.state.pending;
    if (x?.kind !== 'chooseX') throw new Error(`pending ${x?.kind}`);
    expect(x.max).toBe(4); // six Plains: {X}{W}{W} leaves four for X
    g.act(0).chooseX(3);
    g.act(0).payAuto();
    g.expect.stack([ANGELS.name]);
    expect(g.state.battlefield.filter((id) => g.state.objects[id]?.tapped)).toHaveLength(5);
    resolveTop(g);
    const angels = g.find({ name: 'Angel', zone: 'battlefield' });
    expect(angels).toHaveLength(3);
    for (const angel of angels) {
      const view = getView(g.state, 0).battlefield.find((o) => o.id === angel.id);
      expect(view?.power).toBe(4);
      expect(view?.toughness).toBe(4);
      expect(view?.colors).toEqual(['W']);
      expect(view?.keywords).toContain('flying');
    }
    g.expect.invariants();
  });

  test('the card cast for its ordinary cost pays {X}{X}{W}{W}{W}: the X of the miracle cost is not the same cost', () => {
    const g = drawStep(ANGELS.name, (b) => b.battlefield('Plains', { count: 7 }));
    g.act(0).decline();
    g.advanceTo('precombatMain');
    g.act(0).cast(ANGELS.name);
    const x = g.state.pending;
    if (x?.kind !== 'chooseX') throw new Error(`pending ${x?.kind}`);
    expect(x.max).toBe(2); // 7 - 3 colored = 4 generic, two {X} so X up to 2
    g.act(0).chooseX(2);
    g.act(0).payAuto();
    resolveTop(g);
    expect(g.find({ name: 'Angel', zone: 'battlefield' })).toHaveLength(2);
  });

  test('declining the reveal keeps the card in the hand for a later ordinary cast', () => {
    const g = drawStep(ANGELS.name, (b) => b.battlefield('Plains', { count: 6 }));
    g.act(0).decline();
    g.expect.stack([]);
    g.expect.zone(ANGELS.name, 'hand', { seat: 0 });
    g.expect.noEvent({ kind: 'cardsRevealed' });
  });

  test('not the first card drawn this turn: no question (the card is drawn by a second draw)', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .define(ANGELS)
      .battlefield('Plains', { count: 6 })
      .library('Grizzly Bears')
      .library(ANGELS.name)
      .library(...FILLER)
      .seat(1)
      .life(20)
      .library(...FILLER)
      .at('upkeep', { active: 0, turn: 3 })
      .build();
    g.passAll();
    g.expect.pending('priority', 0);
    g.expect.noEvent({ kind: 'cardsRevealed' });
  });
});

describe('"Miracle {R}" on a spell with a target (the template of the backlog)', () => {
  test('the lowering is a miracle entry without X', () => {
    expect(BURN.faces[0]?.alternativeCosts).toEqual([
      { kind: 'miracle', cost: [{ kind: 'mana', symbols: ['R'] }] },
    ]);
  });

  test('revealed, cast for {R}, with the target chosen as it is cast', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .define(BURN)
      .battlefield('Mountain')
      .library(BURN.name)
      .library(...FILLER)
      .seat(1)
      .life(20)
      .battlefield('Grizzly Bears')
      .library(...FILLER)
      .at('upkeep', { active: 0, turn: 3 })
      .build();
    g.passAll();
    g.act(0).accept();
    resolveTop(g);
    g.act(0).accept();
    g.act(0).chooseTargets('Grizzly Bears');
    g.act(0).payAuto();
    g.expect.stack([BURN.name]);
    resolveTop(g);
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 1 });
  });
});
