// Scenario 18 (SPEC 12): trigger ordering with "enters" triggers.
// Pins: CR 603.3b (Triggered Abilities): if several abilities have triggered since the last time a
// player received priority, each player, in APNAP order, puts the ones they control on the stack
// in the order they choose, so the active player's go on first and the nonactive player's are on
// top and resolve first; CR 603.2 and 603.6a (Enters-the-Battlefield Abilities): an enters ability
// triggers when the permanent enters, and is put on the stack the next time a player would receive
// priority (CR 117.5, 603.3); CR 405.5 (Stack): objects resolve last in, first out; CR 603.3b also
// leaves identical abilities of one player with no choice to make.
// Cards (SYNTHETIC, src/cards/fixtures unless noted): "SYNTHETIC Enters Draw Creature" ("When this
// creature enters, draw a card"), "SYNTHETIC Welcome Committee" ("Whenever another creature enters
// under your control, you gain 1 life"), and two watchers defined in this file that trigger on any
// creature entering, "SYNTHETIC Rival Watcher" (you gain 1 life) and "SYNTHETIC Rival Scribe" (you
// draw a card).
import { describe, expect, test } from 'vitest';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const CREATURE = 'SYNTHETIC Enters Draw Creature'; // enters: its controller draws
const COMMITTEE = 'SYNTHETIC Welcome Committee'; // another creature enters under your control: +1 life
const WATCHER = 'SYNTHETIC Rival Watcher';
const SCRIBE = 'SYNTHETIC Rival Scribe';

const anyCreatureEnters = { kind: 'entersBattlefield', what: { types: ['creature'] } } as const;
const watcher = (name: string, effect: 'gainLife' | 'draw') =>
  singleFaceCard({
    name,
    manaCost: ['1', 'W'],
    types: ['enchantment'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText:
      effect === 'gainLife'
        ? 'Whenever a creature enters, you gain 1 life.'
        : 'Whenever a creature enters, draw a card.',
    abilities: [
      {
        kind: 'triggered',
        trigger: anyCreatureEnters,
        effect:
          effect === 'gainLife'
            ? { kind: 'gainLife', player: { kind: 'you' }, amount: 1 }
            : { kind: 'draw', player: { kind: 'you' }, count: 1 },
      },
    ],
  });

const FILLER = ['Plains', 'Plains', 'Plains', 'Plains'] as const;

/** Seat 0 casts the creature; it resolves, and the enters triggers are about to be ordered. */
function cast(g: ScenarioGame) {
  g.act(0).cast(CREATURE, { pay: true });
  g.pass();
  g.pass();
  return g;
}

describe('SPEC scenario 18: your own enters triggers go on the stack in the order you choose', () => {
  const build = () =>
    scenario()
      .seat(0)
      .hand(CREATURE)
      .battlefield('Island', 'Island', COMMITTEE)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .build();

  test('two different abilities trigger at once: the player is asked for the order', () => {
    const g = cast(build());
    g.expect.pending('orderTriggers', 0);
    const d = g.state.pending;
    if (d?.kind !== 'orderTriggers') throw new Error('expected orderTriggers');
    expect(d.triggers.map((t) => t.sourceName).sort()).toEqual([CREATURE, COMMITTEE]);
    // Nothing is on the stack yet and nobody has had priority: the choice comes first.
    g.expect.stack([]);
  });

  test('the first one named goes on the stack first, so it resolves last', () => {
    const g = cast(build());
    g.act(0).orderTriggers(CREATURE, COMMITTEE);
    g.expect.stack([`${COMMITTEE} (ability)`, `${CREATURE} (ability)`]);
    const mark = g.mark();
    g.passAll();
    // The committee's life gain resolved first, the creature's draw second.
    g.expect.eventLog(
      [
        { kind: 'lifeChanged', seat: 0 },
        { kind: 'cardDrawn', seat: 0 },
      ],
      {
        since: mark,
      },
    );
    g.expect.life(0, 41);
    g.expect.handSize(0, 1);
  });

  test('the opposite order puts the other one on top, and it resolves first', () => {
    const g = cast(build());
    g.act(0).orderTriggers(COMMITTEE, CREATURE);
    g.expect.stack([`${CREATURE} (ability)`, `${COMMITTEE} (ability)`]);
    const mark = g.mark();
    g.passAll();
    g.expect.eventLog(
      [
        { kind: 'cardDrawn', seat: 0 },
        { kind: 'lifeChanged', seat: 0 },
      ],
      {
        since: mark,
      },
    );
    g.expect.life(0, 41);
    g.expect.handSize(0, 1);
  });

  test('the order can also be given by index in the decision', () => {
    const g = cast(build());
    const d = g.state.pending;
    if (d?.kind !== 'orderTriggers') throw new Error('expected orderTriggers');
    const first = d.triggers.findIndex((t) => t.sourceName === COMMITTEE);
    const second = d.triggers.findIndex((t) => t.sourceName === CREATURE);
    g.act(0).orderTriggers(first, second);
    g.expect.stack([`${CREATURE} (ability)`, `${COMMITTEE} (ability)`]);
  });
});

describe('SPEC scenario 18: both players have triggers (CR 603.3b)', () => {
  const build = () =>
    scenario()
      .seat(0)
      .hand(CREATURE)
      .battlefield('Island', 'Island', COMMITTEE)
      .library(...FILLER)
      .seat(1)
      .battlefield(WATCHER, SCRIBE)
      .library(...FILLER)
      .define(watcher(WATCHER, 'gainLife'))
      .define(watcher(SCRIBE, 'draw'))
      .build();

  test('the active player orders first, then the other player orders their own', () => {
    const g = cast(build());
    g.expect.pending('orderTriggers', 0);
    g.act(0).orderTriggers(CREATURE, COMMITTEE);
    g.expect.pending('orderTriggers', 1);
    g.act(1).orderTriggers(WATCHER, SCRIBE);
    g.expect.stack([
      `${SCRIBE} (ability)`,
      `${WATCHER} (ability)`,
      `${COMMITTEE} (ability)`,
      `${CREATURE} (ability)`,
    ]);
    g.expect.invariants();
  });

  test("the active player's triggers go on the stack first, so the other player's resolve first", () => {
    const g = cast(build());
    g.act(0).orderTriggers(CREATURE, COMMITTEE);
    g.act(1).orderTriggers(WATCHER, SCRIBE);
    const mark = g.mark();
    g.passAll();
    // Seat 1's two abilities resolve first (the scribe on top, then the watcher), then seat 0's
    // (the committee, then the creature, the order seat 0 chose).
    g.expect.eventLog(
      [
        { kind: 'cardDrawn', seat: 1 },
        { kind: 'lifeChanged', seat: 1 },
        { kind: 'lifeChanged', seat: 0 },
        { kind: 'cardDrawn', seat: 0 },
      ],
      { since: mark },
    );
    g.expect.life(0, 41);
    g.expect.life(1, 41);
    g.expect.handSize(0, 1);
    g.expect.handSize(1, 1);
    g.expect.stack([]);
  });

  test("the order each player chooses is theirs alone: reversing seat 1's order reverses only seat 1's resolution", () => {
    const g = cast(build());
    g.act(0).orderTriggers(CREATURE, COMMITTEE);
    g.act(1).orderTriggers(SCRIBE, WATCHER);
    g.expect.stack([
      `${WATCHER} (ability)`,
      `${SCRIBE} (ability)`,
      `${COMMITTEE} (ability)`,
      `${CREATURE} (ability)`,
    ]);
    const mark = g.mark();
    g.passAll();
    g.expect.eventLog(
      [
        { kind: 'lifeChanged', seat: 1 },
        { kind: 'cardDrawn', seat: 1 },
        { kind: 'lifeChanged', seat: 0 },
        { kind: 'cardDrawn', seat: 0 },
      ],
      { since: mark },
    );
  });

  test('only the player with two different abilities is asked: a lone trigger needs no order', () => {
    const g = scenario()
      .seat(0)
      .hand(CREATURE)
      .battlefield('Island', 'Island')
      .library(...FILLER)
      .seat(1)
      .battlefield(WATCHER)
      .library(...FILLER)
      .define(watcher(WATCHER, 'gainLife'))
      .build();
    cast(g);
    // Seat 0 has one trigger (the creature's own), seat 1 has one: no decision, both on the stack
    // in APNAP order, seat 1's on top.
    g.expect.stack([`${WATCHER} (ability)`, `${CREATURE} (ability)`]);
    g.expect.pending('priority', 0);
  });
});
