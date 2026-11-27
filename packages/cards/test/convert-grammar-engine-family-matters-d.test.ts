// The Family Matters (Bloomburrow Commander) deck, group D: REAL cards of the golden corpus read through the grammar only and played in an engine scenario: "Then discard a card unless
// you attacked this turn" (Chart a Course, CR 508.1, 701.9, 608.2c), "Whenever an opponent casts a noncreature spell with mana value less than ~'s power" (Pollywog Prodigy, CR 601.2i,
// 202.3, 208.1, 702.100 Evolve), "put a shield counter on target noncommander creature you don't control. You gain control of that creature for as long as it has a shield counter on
// it" (Shield Broker, CR 122.1c, 611.2b, 613.1b) and "As long as you've cast a spell this turn, you may play cards from the top of your library" (Fortune Teller's Talent, CR 601.2i, 305.1, 601.3, 716).
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

/** The real card of the golden corpus, imported through the grammar only; it must read as supported. */
function real(name: string): CardDefinition {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  expect(validateCard(imported.definition), name).toEqual([]);
  return imported.definition;
}

const CHART = real('Chart a Course');
const POLLYWOG = real('Pollywog Prodigy');
const TALENT = real("Fortune Teller's Talent");
const BROKER = real('Shield Broker');

const BEARS = 'Grizzly Bears';
const LIBRARY = Array.from({ length: 8 }, () => 'Island');

describe('Chart a Course: "Draw two cards. Then discard a card unless you attacked this turn."', () => {
  const board = () =>
    scenario()
      .define(CHART)
      .seat(0)
      .library(...LIBRARY)
      .hand(CHART.name)
      .battlefield(BEARS, 'Island', 'Island')
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();

  test('no attack this turn: draws two and discards a card (CR 701.9)', () => {
    const g = board();
    g.act(0).cast(CHART.name, { pay: true });
    g.passAll();
    // Two cards drawn (the spell left the hand), then the discard is asked of the controller.
    g.expect.handSize(0, 2);
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards('Island[0]');
    g.expect.handSize(0, 1);
    g.expect.zone(CHART.name, 'graveyard', { seat: 0 });
    g.expect.invariants();
  });

  test('attacked this turn: draws two and does not discard (CR 508.1, 608.2c)', () => {
    const g = board();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack([BEARS]);
    g.advanceTo('postcombatMain');
    g.act(0).cast(CHART.name, { pay: true });
    g.passAll();
    g.expect.handSize(0, 2);
    expect(g.state.pending?.kind).not.toBe('chooseCards');
    g.expect.invariants();
  });

  test('an attack on an earlier turn does not count', () => {
    const g = board();
    g.act(0).cast(CHART.name, { pay: true });
    g.passAll();
    g.expect.pending('chooseCards', 0);
  });
});

describe('Pollywog Prodigy: "Whenever an opponent casts a noncreature spell with mana value less than this creature\'s power, draw a card."', () => {
  const board = (counters: number, extraHand: readonly string[] = []) =>
    scenario()
      .define(POLLYWOG)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(POLLYWOG.name, counters === 0 ? {} : { counters: { '+1/+1': counters } })
      .seat(1)
      .library(...LIBRARY)
      .hand('Lightning Bolt', ...extraHand)
      .pool('R')
      .at('precombatMain', { active: 1 })
      .build();

  test('power 2: a mana value 1 noncreature spell draws a card, and the draw is the controller’s', () => {
    const g = board(1);
    g.act(1).cast('Lightning Bolt', { pay: true, targets: [{ player: 0 }] });
    g.passAll();
    g.expect.handSize(0, 1);
    g.expect.handSize(1, 0);
    g.expect.invariants();
  });

  test('power 1: a mana value 1 spell is not below the power, no card', () => {
    const g = board(0);
    g.act(1).cast('Lightning Bolt', { pay: true, targets: [{ player: 0 }] });
    g.passAll();
    g.expect.handSize(0, 0);
  });

  test('the controller’s own spell never triggers it', () => {
    const g = scenario()
      .define(POLLYWOG)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(POLLYWOG.name, { counters: { '+1/+1': 2 } })
      .hand('Lightning Bolt')
      .pool('R')
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast('Lightning Bolt', { pay: true, targets: [{ player: 1 }] });
    g.passAll();
    g.expect.handSize(0, 0);
  });

  test('every opponent of a table counts, not one seat (3 seats)', () => {
    const g = scenario({ seats: 3 })
      .define(POLLYWOG)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(POLLYWOG.name, { counters: { '+1/+1': 1 } })
      .seat(1)
      .library(...LIBRARY)
      .seat(2)
      .library(...LIBRARY)
      .hand('Lightning Bolt')
      .pool('R')
      .at('precombatMain', { active: 2 })
      .build();
    g.act(2).cast('Lightning Bolt', { pay: true, targets: [{ player: 1 }] });
    g.passAll();
    g.expect.handSize(0, 1);
  });
});

describe('Fortune Teller\'s Talent level 2: "As long as you\'ve cast a spell this turn, you may play cards from the top of your library."', () => {
  const board = () =>
    scenario()
      .define(TALENT)
      .seat(0)
      .library('Island', 'Lightning Bolt', 'Island', 'Island')
      .hand('Lightning Bolt')
      .battlefield(TALENT.name, { level: 2 })
      .pool('R')
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
  const top = { name: 'Island', zone: 'library', seat: 0, nth: 0 } as const;

  test('before any spell is cast this turn the top card cannot be played', () => {
    const g = board();
    g.expect.illegal(0, { playLand: top });
  });

  test('after a spell is cast this turn, a land of the top of the library may be played (CR 305.1)', () => {
    const g = board();
    g.act(0).cast('Lightning Bolt', { pay: true, targets: [{ player: 1 }] });
    g.passAll();
    g.expect.legal(0, { playLand: top });
    g.act(0).playLand(top);
    g.expect.zone('Island', 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('after a spell is cast this turn, a spell of the top of the library may be cast (CR 601.3)', () => {
    const g = scenario()
      .define(TALENT)
      .seat(0)
      .library('Lightning Bolt', 'Island', 'Island')
      .hand('Lightning Bolt')
      .battlefield(TALENT.name, { level: 2 })
      .pool('RR')
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    const bolt = { name: 'Lightning Bolt', zone: 'library', seat: 0, nth: 0 } as const;
    g.expect.illegal(0, { cast: bolt });
    g.act(0).cast(
      { name: 'Lightning Bolt', zone: 'hand', seat: 0, nth: 0 },
      {
        pay: true,
        targets: [{ player: 1 }],
      },
    );
    g.passAll();
    g.expect.legal(0, { cast: bolt });
    g.act(0).cast(bolt, { pay: true, targets: [{ player: 1 }] });
    g.passAll();
    g.expect.life(1, 34);
  });

  test('level 1 only: the permission is not there yet', () => {
    const g = scenario()
      .define(TALENT)
      .seat(0)
      .library('Island', 'Island')
      .hand('Lightning Bolt')
      .battlefield(TALENT.name, { level: 1 })
      .pool('R')
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast('Lightning Bolt', { pay: true, targets: [{ player: 1 }] });
    g.passAll();
    g.expect.illegal(0, { playLand: top });
  });
});

describe('Shield Broker: "put a shield counter on target noncommander creature you don\'t control. You gain control of that creature for as long as it has a shield counter on it."', () => {
  const ANGEL = 'Serra Angel';
  type Placement = {
    name: string;
    options?: { commander?: boolean; counters?: Record<string, number> };
  };
  /** Seat 0 holds the Broker and five Islands; seat 1 has a Mountain, a Lightning Bolt and the permanents `theirs` names; seat 2 (a table of three) has `third`. */
  const board = (theirs: readonly Placement[], third: readonly Placement[] | null = null) => {
    let b = scenario({ seats: third === null ? 2 : 3 })
      .define(BROKER)
      .seat(0)
      .library(...LIBRARY)
      .hand(BROKER.name)
      .battlefield('Island', 'Island', 'Island', 'Island', 'Island')
      .seat(1)
      .library(...LIBRARY)
      .hand('Lightning Bolt')
      .battlefield('Mountain');
    for (const t of theirs) b = b.battlefield(t.name, t.options);
    if (third !== null) {
      b = b.seat(2).library(...LIBRARY);
      for (const t of third) b = b.battlefield(t.name, t.options);
    }
    return b.at('precombatMain', { active: 0 }).build();
  };
  type Game = ReturnType<typeof board>;
  /** Casts the Broker and lets it and its enters trigger resolve; the one legal target is chosen by the engine (there is nothing to choose between). */
  const steal = (g: Game) => {
    g.act(0).cast(BROKER.name, { pay: true });
    g.passAll();
    g.passAll();
  };

  test('the creature gets a shield counter and is controlled by the Broker’s controller (CR 613.1b)', () => {
    const g = board([{ name: BEARS }]);
    steal(g);
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.counters(BEARS, { shield: 1 });
    g.expect.invariants();
  });

  test('damage to it is prevented, the shield counter is removed and the creature goes back (CR 122.1c, 611.2b)', () => {
    const g = board([{ name: BEARS }]);
    steal(g);
    g.act(0).pass();
    g.act(1).cast('Lightning Bolt', { pay: true, targets: [BEARS] });
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
    g.expect.counters(BEARS, {});
    g.expect.damage(BEARS, 0);
    g.expect.invariants();
  });

  test('with a shield counter already on it there are two: one is removed and control stays (CR 611.2b)', () => {
    const g = board([{ name: BEARS, options: { counters: { shield: 1 } } }]);
    steal(g);
    g.expect.counters(BEARS, { shield: 2 });
    g.act(0).pass();
    g.act(1).cast('Lightning Bolt', { pay: true, targets: [BEARS] });
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.counters(BEARS, { shield: 1 });
  });

  test('a commander is not a legal target (noncommander)', () => {
    const g = board([{ name: ANGEL, options: { commander: true } }, { name: BEARS }]);
    steal(g);
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.zone(ANGEL, 'battlefield', { seat: 1 });
  });

  test('a creature of seat 2 of a table of three is taken and goes back to that seat, not to seat 1 (CR 108.3, 613.1b)', () => {
    const g = board([], [{ name: BEARS }]);
    steal(g);
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.act(0).pass();
    g.act(1).cast('Lightning Bolt', { pay: true, targets: [BEARS] });
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 2 });
    g.expect.counters(BEARS, {});
    g.expect.invariants();
  });
});
