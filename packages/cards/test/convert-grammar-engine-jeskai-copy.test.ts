// The Jeskai copy group (issue 100): the Oracle text of Narset's Reversal, Shiko and Narset, Unified and Adaptive Training Post goes through the grammar as a SYNTHETIC card
// with that text (the real cards are not in the golden corpus), is defined in an engine scenario and played through applyAction, so the nodes the parser writes are what the
// engine runs. Pins: CR 707.10 and 707.10c (the copy, new targets), CR 400.3 (the returned spell goes to its owner's hand), CR 115.1 (what a spell targets), CR 603.4 (the
// intervening "if" is read as the event happens and as the ability resolves), CR 122.1 (counters), CR 603.7 (the delayed trigger waits for the next cast).
import { validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const FILLER = Array.from({ length: 12 }, () => 'Island');
const BOLT = 'Lightning Bolt'; // {R}: 3 damage to any target
const BEARS = 'Grizzly Bears';

describe("Narset's Reversal (text as the card has it)", () => {
  const reversal = parsed(
    'SYNTHETIC Reversal Grammar',
    'Instant',
    "Copy target instant or sorcery spell, then return it to its owner's hand. You may choose new targets for the copy.",
    { manaCost: '{1}{U}{U}' },
  );

  test('the card is valid', () => {
    expect(validateCard(reversal)).toEqual([]);
  });

  test('the copy resolves with new targets and the original is in its owner hand', () => {
    const g = scenario()
      .define(reversal)
      .seat(0)
      .hand(BOLT, reversal.name)
      .battlefield('Mountain')
      .battlefield('Island', { count: 3 })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain')
      .build();
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.act(0).cast(reversal.name, { targets: [{ name: BOLT, zone: 'stack' }], pay: true });
    g.pass();
    g.pass();
    g.expect.pending('targets', 0);
    g.act(0).chooseTargets({ player: 0 });
    g.expect.stack([BOLT]);
    g.expect.zone(BOLT, 'hand', { seat: 0 });
    g.passAll();
    g.expect.life(0, 37);
    g.expect.life(1, 40);
    g.expect.invariants();
  });
});

describe('Shiko and Narset, Unified (the Flurry line)', () => {
  const shiko = parsed(
    'SYNTHETIC Flurry Grammar',
    'Creature — Human',
    "Flurry — Whenever you cast your second spell each turn, copy that spell if it targets a permanent or player, and you may choose new targets for the copy. If you don't copy a spell this way, draw a card.",
    { manaCost: '{2}{U}', power: '2', toughness: '2' },
  );
  const GAIN = 'SYNTHETIC Quiet Gain Grammar';
  const gain = parsed(GAIN, 'Instant', 'You gain 3 life.', { manaCost: '{U}' });

  const start = (hand: readonly string[]) =>
    scenario()
      .define(shiko)
      .define(gain)
      .seat(0)
      .hand(...hand)
      .battlefield(shiko.name)
      .battlefield('Island', { count: 3 })
      .battlefield('Mountain', { count: 2 })
      .library(...FILLER)
      .seat(1)
      .battlefield(BEARS)
      .library(...FILLER)
      .at('precombatMain')
      .build();

  test('the card is valid', () => {
    expect(validateCard(shiko)).toEqual([]);
  });

  test('the second spell, aimed at a player, is copied and nothing is drawn', () => {
    const g = start([GAIN, BOLT]);
    g.act(0).cast(GAIN, { pay: true });
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.pass();
    g.pass();
    g.expect.pending('targets', 0);
    g.act(0).chooseTargets({ player: 1 });
    g.passAll();
    g.expect.life(1, 34);
    g.expect.handSize(0, 0);
  });

  test('the second spell, aimed at a permanent, is copied', () => {
    const g = start([GAIN, BOLT]);
    g.act(0).cast(GAIN, { pay: true });
    g.act(0).cast(BOLT, { targets: [{ name: BEARS }], pay: true });
    g.pass();
    g.pass();
    g.expect.pending('targets', 0);
    g.act(0).chooseTargets({ player: 1 });
    g.passAll();
    g.expect.life(1, 37);
    g.expect.handSize(0, 0);
  });

  test('a second spell that targets nothing is not copied and its caster draws', () => {
    const g = start([BOLT, GAIN]);
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.act(0).cast(GAIN, { pay: true });
    g.pass();
    g.pass();
    g.expect.handSize(0, 1);
    g.expect.stack([GAIN, BOLT]);
  });
});

describe('Adaptive Training Post', () => {
  const post = parsed(
    'SYNTHETIC Training Grammar',
    'Artifact',
    'Whenever you cast an instant or sorcery spell, if ~ has fewer than three charge counters on it, put a charge counter on it.\nRemove three charge counters from ~: When you next cast an instant or sorcery spell this turn, copy it and you may choose new targets for the copy.',
    { manaCost: '{2}' },
  );

  const start = (hand: readonly string[], charge = 0) =>
    scenario()
      .define(post)
      .seat(0)
      .hand(...hand)
      .battlefield(post.name, { counters: charge === 0 ? {} : { charge } })
      .battlefield('Mountain', { count: 5 })
      .battlefield('Forest', { count: 2 })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain')
      .build();

  test('the card is valid', () => {
    expect(validateCard(post)).toEqual([]);
  });

  test('each instant or sorcery adds a charge counter, up to three', () => {
    const g = start([BOLT, BOLT, BOLT, BOLT]);
    for (let i = 0; i < 4; i += 1) {
      g.act(0).cast({ name: BOLT, zone: 'hand', nth: 0 }, { targets: [{ player: 1 }], pay: true });
      g.passAll();
      g.expect.counters(post.name, { charge: Math.min(i + 1, 3) });
    }
    g.expect.invariants();
  });

  test('a creature spell adds nothing', () => {
    const g = start([BEARS]);
    g.act(0).cast(BEARS, { pay: true });
    g.passAll();
    g.expect.counters(post.name, {});
  });

  test('the counter trigger does not trigger with three counters already on it (CR 603.4)', () => {
    const g = start([BOLT], 3);
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.expect.stack([BOLT]);
  });

  test('three counters buy a copy of the next instant or sorcery, with new targets, once', () => {
    const g = start([BOLT, BOLT], 3);
    g.act(0).activate(post.name);
    g.expect.counters(post.name, {});
    g.pass();
    g.pass();
    expect(g.state.delayedTriggers).toHaveLength(1);
    g.act(0).cast({ name: BOLT, zone: 'hand', nth: 0 }, { targets: [{ player: 1 }], pay: true });
    // The delayed trigger and the charge counter trigger (no counters are left) both wait for the controller.
    g.act(0).orderTriggers(0, 1);
    for (let i = 0; i < 6 && g.state.pending?.kind !== 'targets'; i += 1) g.pass();
    g.expect.pending('targets', 0);
    g.act(0).chooseTargets({ player: 0 });
    g.passAll();
    g.expect.counters(post.name, { charge: 1 });
    g.expect.life(0, 37);
    g.expect.life(1, 37);
    // The delayed trigger is used: the next Bolt is not copied.
    expect(g.state.delayedTriggers).toHaveLength(0);
    g.act(0).cast({ name: BOLT, zone: 'hand', nth: 0 }, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.life(1, 34);
  });

  test('with fewer than three counters the ability cannot be activated', () => {
    const g = start([BOLT], 2);
    expect(g.act(0).try.activate(post.name).ok).toBe(false);
  });
});
