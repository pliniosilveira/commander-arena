// Most Wanted deck, group 4 (Mistmeadow Skulk, Rankle, Misfortune Teller, Massacre Girl): the Oracle text of each card read through the grammar only (SYNTHETIC names,
// the real text) and played through applyAction. Pins: CR 702.16a (protection from a quality: a mana value), 702.16b (targeting), 702.16e (damage), 702.16f (blocking),
// CR 202.3 and 202.3e (the mana value of a spell counts its X). Stand-ins are the engine's real fixtures.
import type { GameState, ObjectId } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parseOnly, parsed, spellCard } from './convert-grammar-helpers';

const SKULK = parsed(
  'SYNTHETIC Mistmeadow Skulk',
  'Creature — Kithkin Rogue',
  'Lifelink, protection from mana value 3 or greater',
  { manaCost: '{2}{W}', power: '3', toughness: '1', colors: ['W'] },
);

const targetsOf = (state: GameState): ObjectId[] => {
  const d = state.pending;
  if (d?.kind !== 'targets') throw new Error(`expected targets, got ${d?.kind}`);
  return (d.specs[0]?.legal ?? []).flatMap((t) => (t.kind === 'object' ? [t.id] : []));
};

describe('Mistmeadow Skulk: lifelink, protection from mana value 3 or greater', () => {
  test('reads as lifelink and a protection from a mana value', () => {
    const keywords = (SKULK.faces[0]?.abilities ?? []).flatMap((a) =>
      a.kind === 'keyword' ? [JSON.stringify(a.keyword)] : [],
    );
    expect(keywords).toEqual([
      '{"kind":"lifelink"}',
      '{"kind":"protection","from":"manaValue","cmp":"atLeast","value":3}',
    ]);
  });

  const board = () =>
    scenario()
      .define(SKULK)
      .seat(0)
      .hand('Murder', 'Lightning Bolt')
      .battlefield('Swamp', 'Swamp', 'Swamp', 'Mountain')
      .battlefield('Grizzly Bears')
      .seat(1)
      .battlefield(SKULK.name)
      .at('precombatMain');

  test('a spell with mana value 3 (Murder) can not target it, one with mana value 1 (Lightning Bolt) can (CR 702.16b)', () => {
    const g = board().build();
    g.act(0).cast('Murder');
    expect(targetsOf(g.state)).not.toContain(g.id(SKULK.name));
    expect(targetsOf(g.state)).toContain(g.id('Grizzly Bears'));
    const h = board().build();
    h.act(0).cast('Lightning Bolt');
    expect(targetsOf(h.state)).toContain(h.id(SKULK.name));
  });

  test('damage from a source with mana value 1 is dealt', () => {
    const g = board().build();
    g.act(0).cast('Lightning Bolt', { targets: [SKULK.name], pay: true });
    g.passAll();
    g.expect.zone(SKULK.name, 'graveyard', { seat: 1 });
    g.expect.invariants();
  });

  test('a creature with mana value 3 or more can not block it (CR 702.16f); a cheaper one can', () => {
    const g = scenario()
      .define(SKULK)
      .seat(0)
      .battlefield(SKULK.name)
      .seat(1)
      .battlefield('Serra Angel', 'Grizzly Bears')
      .at('precombatMain')
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack(SKULK.name);
    g.advanceTo('declareBlockers');
    expect(
      g.act(1).try.action({
        kind: 'declareBlockers',
        blocks: [{ blocker: g.id('Serra Angel'), attacker: g.id(SKULK.name) }],
      }).ok,
    ).toBe(false);
    g.act(1).declareBlockers([{ blocker: 'Grizzly Bears', attacker: SKULK.name }]);
  });

  test('combat damage from a creature with mana value 3 or more is prevented (CR 702.16e)', () => {
    const g = scenario()
      .define(SKULK)
      .seat(0)
      .battlefield(SKULK.name)
      .seat(1)
      .battlefield('Giant Spider')
      .at('precombatMain', { active: 1, turn: 2 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(1).attack('Giant Spider');
    g.advanceTo('declareBlockers');
    g.act(0).declareBlockers([{ blocker: SKULK.name, attacker: 'Giant Spider' }]);
    g.passAll();
    g.expect.zone(SKULK.name, 'battlefield', { seat: 0 });
    expect(g.object(SKULK.name).damage).toBe(0);
    g.expect.invariants();
  });
});

const RANKLE = parsed(
  'SYNTHETIC Rankle, Master of Pranks',
  'Legendary Creature — Faerie Rogue',
  'Flying, haste\nWhenever ~ deals combat damage to a player, choose any number —\n• Each player discards a card.\n• Each player loses 1 life and draws a card.\n• Each player sacrifices a creature of their choice.',
  { manaCost: '{2}{B}{B}', power: '3', toughness: '3', colors: ['B'] },
);

describe('Rankle: whenever it deals combat damage to a player, choose any number of three modes', () => {
  test('reads as a modal triggered ability that chooses none, some or all of its three modes (CR 700.2b)', () => {
    const trigger = (RANKLE.faces[0]?.abilities ?? []).find((a) => a.kind === 'triggered');
    if (trigger?.kind !== 'triggered') throw new Error('no triggered ability');
    expect(trigger.modes?.length).toBe(3);
    expect(trigger.chooseModes).toEqual({ min: 0, max: 3 });
  });

  test('a spell that chooses any number of modes is not read: it could choose none (CR 700.2a)', () => {
    const spell = parseOnly(
      spellCard(
        'SYNTHETIC Any Number',
        'Choose any number —\n• Each player discards a card.\n• Each player loses 1 life and draws a card.',
      ),
    );
    expect(spell.support.status).toBe('unsupported');
  });

  const LIB = Array.from({ length: 10 }, () => 'Plains');
  const game = () =>
    scenario({ seats: 3 })
      .define(RANKLE)
      .seat(0)
      .library(...LIB)
      .hand('Island', 'Plains')
      .battlefield(RANKLE.name, 'Llanowar Elves')
      .seat(1)
      .library(...LIB)
      .hand('Forest', 'Swamp')
      .battlefield('Grizzly Bears', 'Giant Spider')
      .seat(2)
      .library(...LIB)
      .hand('Mountain', 'Forest')
      .battlefield('Serra Angel')
      .at('precombatMain', { active: 0, turn: 1 })
      .build();

  const hit = (g: ReturnType<typeof game>) => {
    g.advanceTo('declareAttackers');
    g.act(0).attack(RANKLE.name, { player: 1 });
    g.advanceTo('declareBlockers');
    g.act(1).noBlocks();
    g.passAll();
  };

  test('the controller is asked for the modes as the trigger goes on the stack; none removes it (CR 700.2b)', () => {
    const g = game();
    hit(g);
    g.expect.pending('chooseModes', 0);
    g.act(0).chooseModes();
    g.passAll();
    g.expect.life(1, 37);
    expect(g.state.seats[1]?.hand.length).toBe(2);
    g.expect.invariants();
  });

  /** Answers every pending decision of the kind with its first legal choice and returns the seats asked, in order. */
  const answerAll = (g: ReturnType<typeof game>, kind: 'chooseCards' | 'choosePermanent') => {
    const asked: number[] = [];
    for (let i = 0; i < 10 && g.state.pending?.kind === kind; i++) {
      const d = g.state.pending;
      if (d?.kind !== 'chooseCards' && d?.kind !== 'choosePermanent') break;
      asked.push(d.seat);
      const pick = d.legal[0];
      if (pick === undefined) break;
      const answer =
        kind === 'chooseCards'
          ? ({ kind: 'chooseCards', objects: [pick] } as const)
          : ({ kind: 'choosePermanents', objects: [pick] } as const);
      expect(g.act(d.seat).try.action(answer).ok).toBe(true);
    }
    return asked;
  };

  test('discard mode: each player discards a card, the active player choosing first, then the others in turn order (CR 101.4)', () => {
    const g = game();
    hit(g);
    g.act(0).chooseModes(0);
    g.passAll();
    const asked = answerAll(g, 'chooseCards');
    expect(asked.join()).toBe('0,1,2');
    for (const seat of [0, 1, 2]) expect(g.state.seats[seat]?.hand.length).toBe(1);
    g.expect.invariants();
  });

  test('life and draw mode: each player loses 1 life and draws a card, the damaged player too', () => {
    const g = game();
    hit(g);
    g.act(0).chooseModes(1);
    g.passAll();
    // Seat 1 was dealt 3 combat damage first.
    g.expect.life(0, 39);
    g.expect.life(1, 36);
    g.expect.life(2, 39);
    expect(g.state.seats.map((x) => x.hand.length)).toEqual([3, 3, 3]);
    g.expect.invariants();
  });

  test('sacrifice mode: each player sacrifices a creature of their choice, a player with one has no choice', () => {
    const g = game();
    hit(g);
    g.act(0).chooseModes(2);
    g.passAll();
    const asked = answerAll(g, 'choosePermanent');
    // Seat 0 (Rankle, Llanowar Elves) and seat 1 (Grizzly Bears, Giant Spider) choose; seat 2 has one creature.
    expect(asked.join()).toBe('0,1');
    for (const seat of [0, 1, 2]) {
      const creatures = g.state.battlefield.filter((id) => {
        const o = g.state.objects[id];
        return o !== undefined && o.owner === seat;
      });
      expect(creatures.length).toBe(seat === 0 ? 1 : seat === 1 ? 1 : 0);
    }
    g.expect.invariants();
  });

  test('all three modes are performed in printed order (discard, then life and draw, then sacrifice)', () => {
    const g = game();
    hit(g);
    g.act(0).chooseModes(0, 1, 2);
    g.passAll();
    answerAll(g, 'chooseCards');
    // The discard is done before the draw: each player discarded from two cards, then drew one.
    expect(g.state.seats.map((x) => x.hand.length)).toEqual([2, 2, 2]);
    expect(g.state.seats.map((x) => x.graveyard.length)).toEqual([1, 1, 1]);
    g.expect.life(0, 39);
    g.expect.life(2, 39);
    answerAll(g, 'choosePermanent');
    g.expect.invariants();
  });
});
