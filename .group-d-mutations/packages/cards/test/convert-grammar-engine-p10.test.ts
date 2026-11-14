// Parsed text is only worth something if the engine runs it as written (stage P10). These tests
// import SYNTHETIC cards through the grammar (never through a fixture), define them in an engine
// scenario and play them through applyAction: scry and surveil as a spell, an enters trigger, an
// optional trigger and an activated ability, scry joined to a draw, "look at the top three cards
// of your library, then put them back in any order" and Brainstorm's sentence. Every card name
// starts with "SYNTHETIC"; the Oracle text is template text from the corpus
// (reports/template-replay.md, the real line of the shape) or marked SYNTHETIC where no real line
// has the shape. No real card's text is claimed.
import type { CardDefinition } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed, parseOnly } from './convert-grammar-helpers';
import { syntheticCard } from './convert-helpers';

const sorcery = (name: string, text: string, manaCost = '{1}{U}') =>
  parsed(name, 'Sorcery', text, { manaCost, colors: ['U'] });
const creature = (name: string, text: string, manaCost = '{1}{U}') =>
  parsed(name, 'Creature — Wizard', text, {
    manaCost,
    power: '1',
    toughness: '1',
    colors: ['U'],
  });

/** The names of a seat's library, top first. */
function library(g: ScenarioGame, seat: 0 | 1 = 0): string[] {
  return (g.state.seats[seat]?.library ?? []).map((id) => nameOf(g, id));
}
function graveyard(g: ScenarioGame): string[] {
  return (g.state.seats[0]?.graveyard ?? []).map((id) => nameOf(g, id));
}
function hand(g: ScenarioGame): string[] {
  return (g.state.seats[0]?.hand ?? []).map((id) => nameOf(g, id));
}
function nameOf(g: ScenarioGame, id: string): string {
  const obj = g.state.objects[id as keyof typeof g.state.objects];
  const card = obj?.card == null ? undefined : g.state.cards[obj.card];
  return card === undefined ? '?' : (g.state.definitions[card.definition]?.name ?? '?');
}

/** Seat 0 holds `def` in hand with two mana; its library is Island, Forest, Plains, Swamp, Mountain (a to e). */
function game(def: CardDefinition) {
  let b = scenario().define(def).seat(0).hand(def.name).pool('UC');
  for (const [name, label] of [
    ['Island', 'a'],
    ['Forest', 'b'],
    ['Plains', 'c'],
    ['Swamp', 'd'],
    ['Mountain', 'e'],
  ] as const) {
    b = b.library(name, { label });
  }
  return b.seat(1).library('Llanowar Elves').build();
}

/** Casts the spell and lets it resolve: both players pass once (CR 117.4). */
function castAndResolve(g: ScenarioGame, name: string): void {
  g.act(0).cast(name, { pay: true });
  g.pass();
  g.pass();
}

describe('"Scry 2." as a spell (CR 701.22a)', () => {
  const SCRY = sorcery('SYNTHETIC Parsed Scry', 'Scry 2.');

  test('the parsed spell is the engine scry', () => {
    expect(SCRY.faces[0]?.spell?.effect).toEqual({ kind: 'scry', count: 2 });
  });

  test('asks its controller for the top two cards; one stays on top, one goes to the bottom', () => {
    const g = game(SCRY);
    castAndResolve(g, SCRY.name);
    g.expect.pending('arrangeCards', 0);
    g.act(0).arrange({ top: ['b'], other: ['a'] });
    expect(library(g)).toEqual(['Forest', 'Plains', 'Swamp', 'Mountain', 'Island']);
    g.expect.pending('priority', 0);
    g.expect.invariants();
  });
});

describe('"Surveil 2." as a spell (CR 701.25a)', () => {
  const SURVEIL = sorcery('SYNTHETIC Parsed Surveil', 'Surveil 2.');

  test('one card stays on top and the other goes to the graveyard', () => {
    expect(SURVEIL.faces[0]?.spell?.effect).toEqual({ kind: 'surveil', count: 2 });
    const g = game(SURVEIL);
    castAndResolve(g, SURVEIL.name);
    g.expect.pending('arrangeCards', 0);
    g.act(0).arrange({ top: ['a'], other: ['b'] });
    expect(library(g)).toEqual(['Island', 'Plains', 'Swamp', 'Mountain']);
    expect(graveyard(g)).toContain('Forest');
    g.expect.invariants();
  });
});

describe('"Draw a card, then scry 1.": the draw happens first (CR 608.2c)', () => {
  const CANTRIP = sorcery('SYNTHETIC Parsed Cantrip', 'Draw a card, then scry 1.');

  test('the scry looks at the card under the one drawn', () => {
    expect(CANTRIP.faces[0]?.spell?.effect).toEqual({
      kind: 'sequence',
      effects: [
        { kind: 'draw', player: { kind: 'you' }, count: 1 },
        { kind: 'scry', count: 1 },
      ],
    });
    const g = game(CANTRIP);
    castAndResolve(g, CANTRIP.name);
    expect(hand(g)).toEqual(['Island']);
    g.expect.pending('arrangeCards', 0);
    g.act(0).arrange({ top: [], other: ['b'] });
    expect(library(g)).toEqual(['Plains', 'Swamp', 'Mountain', 'Forest']);
  });

  test('"Scry 2, then draw a card." scries first and draws what the scry left on top', () => {
    const REVERSE = sorcery('SYNTHETIC Parsed Reverse Cantrip', 'Scry 2, then draw a card.');
    const g = game(REVERSE);
    castAndResolve(g, REVERSE.name);
    g.act(0).arrange({ top: ['b'], other: ['a'] });
    expect(hand(g)).toEqual(['Forest']);
    expect(library(g)).toEqual(['Plains', 'Swamp', 'Mountain', 'Island']);
  });
});

describe('"When ~ enters, scry 1." and "surveil 1."', () => {
  test('the trigger goes on the stack, then its controller arranges', () => {
    const SEER = creature('SYNTHETIC Parsed Seer', 'When ~ enters, scry 1.');
    const g = game(SEER);
    castAndResolve(g, SEER.name);
    g.expect.stack([`${SEER.name} (ability)`]);
    g.pass();
    g.pass();
    g.expect.pending('arrangeCards', 0);
    g.act(0).arrange({ top: [], other: ['a'] });
    expect(library(g)).toEqual(['Forest', 'Plains', 'Swamp', 'Mountain', 'Island']);
    g.expect.invariants();
  });

  test('surveil 1 sends the card to the graveyard when told to', () => {
    const WATCHER = creature('SYNTHETIC Parsed Watcher', 'When ~ enters, surveil 1.');
    const g = game(WATCHER);
    castAndResolve(g, WATCHER.name);
    g.pass();
    g.pass();
    g.expect.pending('arrangeCards', 0);
    g.act(0).arrange({ top: [], other: ['a'] });
    expect(library(g)).toEqual(['Forest', 'Plains', 'Swamp', 'Mountain']);
    expect(graveyard(g)).toContain('Island');
  });

  test('"you may scry 1": the controller is asked first; declining leaves the library alone (CR 603.5)', () => {
    const MAYBE = creature('SYNTHETIC Parsed Maybe Seer', 'When ~ enters, you may scry 1.');
    expect(MAYBE.faces[0]?.abilities).toMatchObject([{ kind: 'triggered', optional: true }]);
    const play = (answer: 'accept' | 'decline') => {
      const g = game(MAYBE);
      castAndResolve(g, MAYBE.name);
      g.pass();
      g.pass();
      g.expect.pending('confirmOptional', 0);
      g.act(0)[answer]();
      return g;
    };
    const declined = play('decline');
    declined.expect.pending('priority', 0);
    expect(library(declined)).toEqual(['Island', 'Forest', 'Plains', 'Swamp', 'Mountain']);
    const accepted = play('accept');
    accepted.expect.pending('arrangeCards', 0);
    accepted.act(0).arrange({ top: [], other: ['a'] });
    expect(library(accepted)).toEqual(['Forest', 'Plains', 'Swamp', 'Mountain', 'Island']);
  });
});

describe('an activated scry', () => {
  test('"{1}{U}, {T}: Scry 2." pays, taps and arranges', () => {
    const SCRYER = creature('SYNTHETIC Parsed Scryer', '{1}{U}, {T}: Scry 2.');
    const b = scenario()
      .define(SCRYER)
      .seat(0)
      .battlefield(SCRYER.name, 'Island', 'Island')
      .library('Island', { label: 'a' })
      .library('Forest', { label: 'b' })
      .library('Plains', { label: 'c' })
      .seat(1)
      .library('Llanowar Elves')
      .build();
    b.act(0).activate(SCRYER.name, { pay: true });
    b.pass();
    b.pass();
    b.expect.pending('arrangeCards', 0);
    b.act(0).arrange({ top: ['b', 'a'], other: [] });
    expect(library(b)).toEqual(['Forest', 'Island', 'Plains']);
  });
});

describe('"Look at the top three cards of your library, then put them back in any order."', () => {
  const REORDER = sorcery(
    'SYNTHETIC Parsed Reorder',
    'Look at the top three cards of your library, then put them back in any order.',
  );

  test('the parsed spell is the engine reorder, and the order chosen is the order from the top', () => {
    expect(REORDER.faces[0]?.spell?.effect).toEqual({ kind: 'lookAndReorder', count: 3 });
    const g = game(REORDER);
    const mark = g.mark();
    castAndResolve(g, REORDER.name);
    g.expect.pending('arrangeCards', 0);
    g.act(0).arrange({ top: ['c', 'a', 'b'] });
    expect(library(g)).toEqual(['Plains', 'Island', 'Forest', 'Swamp', 'Mountain']);
    // It is not a scry: nothing for "whenever you scry" to see.
    expect(g.eventsSince(mark).map((e) => e.kind)).not.toContain('scried');
    g.expect.invariants();
  });

  test('"You may shuffle." after it is read, so the card is supported (stage P63, D-216)', () => {
    const imported = parseOnly(
      syntheticCard({
        name: 'SYNTHETIC Parsed Reorder Shuffle',
        typeLine: 'Sorcery',
        manaCost: '{1}{U}',
        oracleText:
          'Look at the top three cards of your library, then put them back in any order. You may shuffle.',
      }),
    );
    expect(imported.support.status).toBe('supported');
  });
});

describe("Brainstorm's sentence: draw three, then put two cards from your hand on top", () => {
  const BRAINSTORM = parsed(
    'SYNTHETIC Parsed Brainstorm',
    'Instant',
    'Draw three cards, then put two cards from your hand on top of your library in any order.',
    { manaCost: '{U}', colors: ['U'] },
  );

  const board = () =>
    scenario()
      .define(BRAINSTORM)
      .seat(0)
      .hand(BRAINSTORM.name)
      .hand('Plains', { label: 'h1' })
      .pool('U')
      .library('Forest', { label: 'a' })
      .library('Swamp', { label: 'b' })
      .library('Mountain', { label: 'c' })
      .library('Grizzly Bears', { label: 'd' })
      .library('Llanowar Elves', { label: 'e' })
      .seat(1)
      .library('Serra Angel')
      .build();

  test('the parsed spell is a draw and a put from the hand', () => {
    expect(BRAINSTORM.faces[0]?.spell?.effect).toEqual({
      kind: 'sequence',
      effects: [
        { kind: 'draw', player: { kind: 'you' }, count: 3 },
        { kind: 'putFromHandOnTop', count: 2 },
      ],
    });
  });

  test('draws three, asks for two cards of the hand, and the first chosen ends up on top', () => {
    const g = board();
    castAndResolve(g, BRAINSTORM.name);
    expect(hand(g)).toHaveLength(4);
    g.expect.pending('chooseCards', 0);
    // Put Swamp, then Plains: Swamp is on top, Plains under it.
    g.act(0).chooseCards('b', 'h1');
    expect(library(g)).toEqual(['Swamp', 'Plains', 'Grizzly Bears', 'Llanowar Elves']);
    expect(hand(g).sort()).toEqual(['Forest', 'Mountain']);
    g.expect.pending('priority', 0);
    g.expect.invariants();
  });

  test('"Put a card from your hand on top of your library." puts one card back', () => {
    const PUT = sorcery(
      'SYNTHETIC Parsed Put Back',
      'Draw two cards, then put a card from your hand on top of your library.',
    );
    const g = scenario()
      .define(PUT)
      .seat(0)
      .hand(PUT.name)
      .pool('UC')
      .library('Forest', { label: 'a' })
      .library('Swamp', { label: 'b' })
      .library('Mountain', { label: 'c' })
      .seat(1)
      .library('Serra Angel')
      .build();
    castAndResolve(g, PUT.name);
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards('a');
    expect(library(g)).toEqual(['Forest', 'Mountain']);
    expect(hand(g)).toEqual(['Swamp']);
  });
});
