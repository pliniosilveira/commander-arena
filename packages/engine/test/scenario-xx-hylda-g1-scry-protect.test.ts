// "Whenever you scry, tap up to X target nonland permanents, where X is the number of cards looked at while scrying this way" (D-513), "Whenever this creature attacks, for each opponent, tap
// up to one target creature that player controls" (D-512) and "Another target creature you control gains protection from the card type of your choice until end of turn" (D-514), group 1
// of the Hylda deck.
// Pins: CR 701.22 (scry; the cards looked at are those the library held, CR 701.22d), CR 603.3d (targets are chosen as the ability goes on the stack: up to X), CR 115.1 (up to one target
// for each opponent), CR 702.16a and 702.16b (protection from a card type: a source of that type cannot target it), CR 608.2d (the choice is made as the ability resolves).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-hylda-g1.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import type { ObjectId } from '../src/ids';
import { type PendingDecision, syntheticCard, validateCard } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';

const PILOT = 'SYNTHETIC Tide Pilot'; // attacks: scry 1; whenever you scry: tap up to X target nonland permanents
const DWARF = 'SYNTHETIC Hammer Dwarf'; // attacks: for each opponent, tap up to one target creature that player controls
const HALFLING = 'SYNTHETIC Citadel Halfling'; // {T}: another target creature you control gains protection from the card type of your choice
const SIGHT = 'SYNTHETIC Clear Sight'; // instant: scry 2
const BEARS = 'Grizzly Bears';
const SPIDER = 'Giant Spider';
const BOLT = 'Lightning Bolt';
const LIBRARY = Array.from({ length: 8 }, () => 'Island');

describe('the cards are valid', () => {
  test.each([PILOT, DWARF, HALFLING, SIGHT])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
});

/** The objects the engine offers as targets of the first slot of `card`, cast by `seat`. */
function legalTargetsOf(g: ScenarioGame, seat: 0 | 1, card: string): ObjectId[] {
  g.act(seat).cast(card);
  const d: PendingDecision | null = g.state.pending;
  if (d?.kind !== 'targets') return [];
  return (d.specs[0]?.legal ?? []).flatMap((t) => (t.kind === 'object' ? [t.id] : []));
}

const defs = () =>
  scenario()
    .define(syntheticCard(PILOT))
    .define(syntheticCard(DWARF))
    .define(syntheticCard(HALFLING))
    .define(syntheticCard(SIGHT));

describe('Elvish Mariner: "Whenever you scry, tap up to X target nonland permanents"', () => {
  const board = (library: readonly string[] = LIBRARY) =>
    defs()
      .seat(0)
      .library(...library)
      .hand(SIGHT)
      .battlefield('Island')
      .battlefield(PILOT)
      .battlefield(BEARS, { label: 'mine' })
      .seat(1)
      .library(...LIBRARY)
      .battlefield(SPIDER, { label: 'spider' })
      .battlefield('Forest', { label: 'forest' })
      .battlefield('Llanowar Elves', { label: 'elves' })
      .at('precombatMain', { active: 0 })
      .build();

  test('scry 2: up to two targets, nonland permanents of any player; a land is not one', () => {
    const g = board();
    g.act(0).cast(SIGHT, { pay: true });
    g.passAll();
    g.act(0).arrange({ top: ['Island[0]', 'Island[1]'] });
    const d = g.state.pending;
    if (d?.kind !== 'targets') throw new Error(`expected targets, got ${d?.kind}`);
    expect(d.specs).toHaveLength(1);
    expect(d.specs[0]?.min).toBe(0);
    expect(d.specs[0]?.max).toBe(2);
    expect(d.specs[0]?.legal).toHaveLength(4);
    g.act(0).chooseTargets('spider', 'elves');
    g.passAll();
    g.expect.tapped('spider');
    g.expect.tapped('elves');
    g.expect.tapped('mine', false);
    g.expect.invariants();
  });

  test('up to: no target at all is a legal choice, and the ability then does nothing', () => {
    const g = board();
    g.act(0).cast(SIGHT, { pay: true });
    g.passAll();
    g.act(0).arrange({ top: ['Island[0]'], other: ['Island[1]'] });
    // Two cards were looked at (one stays on top, one goes to the bottom): up to two targets.
    const d = g.state.pending;
    if (d?.kind !== 'targets') throw new Error(`expected targets, got ${d?.kind}`);
    expect(d.specs[0]?.max).toBe(2);
    g.act(0).chooseTargets();
    g.passAll();
    g.expect.tapped('spider', false);
  });

  test('a library of one card: X is the one card looked at', () => {
    const g = board(['Island']);
    g.act(0).cast(SIGHT, { pay: true });
    g.passAll();
    g.act(0).arrange({ top: ['Island[0]'] });
    const d = g.state.pending;
    if (d?.kind !== 'targets') throw new Error(`expected targets, got ${d?.kind}`);
    expect(d.specs[0]?.max).toBe(1);
  });

  test('an empty library: the scry looks at no card (CR 701.22d), X is 0 and the ability is not put on the stack', () => {
    const g = board([]);
    g.act(0).cast(SIGHT, { pay: true });
    g.passAll();
    g.expect.stack([]);
    g.expect.tapped('spider', false);
  });

  test("the creature's own attack trigger scries 1, so it taps up to one", () => {
    const g = board();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack(PILOT);
    g.passAll();
    g.act(0).arrange({ top: ['Island[0]'] });
    const d = g.state.pending;
    if (d?.kind !== 'targets') throw new Error(`expected targets, got ${d?.kind}`);
    expect(d.specs[0]?.max).toBe(1);
    g.act(0).chooseTargets('spider');
    g.passAll();
    g.expect.tapped('spider');
  });

  test('an opponent who scries does not trigger it', () => {
    const g = defs()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(PILOT)
      .seat(1)
      .library(...LIBRARY)
      .hand(SIGHT)
      .battlefield('Island')
      .battlefield(BEARS, { label: 'theirs' })
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).cast(SIGHT, { pay: true });
    g.passAll();
    g.act(1).arrange({ top: ['Island[0]', 'Island[1]'] });
    g.expect.stack([]);
    g.expect.tapped('theirs', false);
  });
});

describe('Hammers of Moradin: "for each opponent, tap up to one target creature that player controls"', () => {
  const board = () =>
    defs()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(DWARF)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(SPIDER, { label: 'spider' })
      .battlefield(BEARS, { label: 'bears' })
      .at('precombatMain', { active: 0 })
      .build();

  test('one target for the opponent: it is tapped', () => {
    const g = board();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack(DWARF);
    const d = g.state.pending;
    if (d?.kind !== 'targets') throw new Error(`expected targets, got ${d?.kind}`);
    expect(d.specs[0]?.min).toBe(0);
    expect(d.specs[0]?.max).toBe(1);
    g.act(0).chooseTargets('spider');
    g.passAll();
    g.expect.tapped('spider');
    g.expect.tapped('bears', false);
    g.expect.invariants();
  });

  test('up to one: none is allowed', () => {
    const g = board();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack(DWARF);
    g.act(0).chooseTargets();
    g.passAll();
    g.expect.tapped('spider', false);
    g.expect.tapped('bears', false);
  });

  test('the slot takes at most one target for each opponent (one opponent: one target), and offers the creatures of that opponent only', () => {
    const g = defs()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(DWARF)
      .battlefield(BEARS, { label: 'mine' })
      .seat(1)
      .library(...LIBRARY)
      .battlefield(SPIDER, { label: 'spider' })
      .battlefield(BEARS, { label: 'bears' })
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack(DWARF);
    const d = g.state.pending;
    if (d?.kind !== 'targets') throw new Error(`expected targets, got ${d?.kind}`);
    expect(d.specs[0]?.onePerGroup).toBe(true);
    expect(d.specs[0]?.legal).toHaveLength(2);
  });
});

describe('Pippin: "{T}: Another target creature you control gains protection from the card type of your choice until end of turn."', () => {
  const board = () =>
    defs()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(HALFLING)
      .battlefield(BEARS, { label: 'mine' })
      .seat(1)
      .library(...LIBRARY)
      .hand(BOLT)
      .battlefield('Mountain')
      .battlefield(SPIDER, { label: 'spider' })
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('the controller chooses one of the nine card types as the ability resolves, and the creature gains protection from it', () => {
    const g = board();
    g.act(0).activate(HALFLING, { targets: ['mine'] });
    g.expect.stack([`${HALFLING} (ability)`]);
    g.passAll();
    const d = g.state.pending;
    if (d?.kind !== 'chooseOption') throw new Error(`expected chooseOption, got ${d?.kind}`);
    expect(d.purpose).toBe('protectionCardType');
    expect(d.options).toEqual([
      'artifact',
      'battle',
      'creature',
      'enchantment',
      'instant',
      'kindred',
      'land',
      'planeswalker',
      'sorcery',
    ]);
    expect(d.protects).toHaveLength(1);
    g.act(0).chooseOption('instant');
    g.expect.tapped(HALFLING);
    g.expect.invariants();
  });

  test('protection from instants: a Lightning Bolt cannot target it (CR 702.16b)', () => {
    const g = board();
    g.act(0).activate(HALFLING, { targets: ['mine'] });
    g.passAll();
    g.act(0).chooseOption('instant');
    g.act(0).pass();
    const legal = legalTargetsOf(g, 1, BOLT);
    // The Halfling is a legal target; the creature the ability protects is not (and a player is).
    expect(legal).toContain(g.find({ name: HALFLING })[0]?.id);
    expect(legal).not.toContain(g.find({ name: BEARS, seat: 0 })[0]?.id);
  });

  test('protection from creatures: a creature cannot block it (CR 702.16f)', () => {
    const g = board();
    g.act(0).activate(HALFLING, { targets: ['mine'] });
    g.passAll();
    g.act(0).chooseOption('creature');
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack('mine');
    // The Spider (a creature) has no legal block: no blockers are asked, and the Bears' damage goes through.
    g.advanceTo('postcombatMain');
    g.expect.life(1, 38);
    g.expect.invariants();
  });

  test('another creature: the Halfling itself is not a legal target', () => {
    const g = board();
    const r = g.act(0).try.activate(HALFLING);
    expect(r.ok).toBe(true);
    const d = g.state.pending;
    if (d?.kind !== 'targets') throw new Error(`expected targets, got ${d?.kind}`);
    expect(d.specs[0]?.legal).toHaveLength(1);
  });
});
