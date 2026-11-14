// Split second (CR 702.61): "As long as this spell is on the stack, players can't cast other spells or
// activate abilities that aren't mana abilities." (D-104, D-110)
// Pins: CR 702.61a (no spells, no non-mana abilities, for either player, and so for the caster too), CR
// 702.61b (mana abilities and special actions are allowed; triggered abilities trigger and go on the stack as
// normal), CR 602.1 and 702.29 (Cycling is an activated ability), CR 702.34a (a flashback cast is a cast), CR
// 117.1 (a player may still pass), CR 608.2 (the spell resolves as any), CR 603.3 (the trigger waits on the
// stack above it). Legal actions and applyAction are checked together (`expect.illegal`). Cards are
// SYNTHETIC (src/cards/fixtures/synthetic-keywords.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { applyAction, getLegalActions } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';

const HUSH_BOLT = 'SYNTHETIC Hush Bolt'; // {1}{R} instant, split second, 3 damage to any target
const HUSH_GAIN = 'SYNTHETIC Hush Gain'; // {W} instant, split second, gain 3 life
const BOLT = 'Lightning Bolt';
const COUNTER = 'Counterspell';
const PINGER = 'SYNTHETIC Pinger'; // {T}: 1 damage to any target
const CYCLER = 'SYNTHETIC Cycling Bear';
const WATCHER = 'SYNTHETIC Spell Watcher'; // whenever you cast a spell: you gain 1 life
const ELVES = 'Llanowar Elves';

/** Seat 0 casts Hush Bolt at seat 1's face; seat 1 has everything a player might try in response. */
function hushed(): ScenarioGame {
  const g = scenario()
    .seat(0)
    .hand(HUSH_BOLT)
    .battlefield('Mountain', 'Mountain', WATCHER, PINGER)
    .seat(1)
    .hand(BOLT, COUNTER, CYCLER)
    .battlefield('Mountain', 'Island', 'Island', ELVES, PINGER)
    .graveyard('SYNTHETIC Flash Slay')
    .build();
  g.act(0).cast(HUSH_BOLT, { targets: [{ player: 1 }], pay: true });
  return g;
}

describe('CR 702.61a: nothing is cast and nothing is activated', () => {
  test('the opponent cannot respond with a spell, an ability, a cycling or a flashback', () => {
    const g = hushed();
    g.act(0).pass();
    expect(g.deciding).toBe(1);
    g.expect.illegal(1, { cast: BOLT });
    g.expect.illegal(1, { cast: COUNTER });
    g.expect.illegal(1, { cast: 'SYNTHETIC Flash Slay', alternative: 'flashback' });
    g.expect.illegal(1, { activate: PINGER });
    g.expect.illegal(1, { activate: CYCLER });
    const kinds = new Set(getLegalActions(g.state, 1).map((a) => a.kind));
    expect(kinds.has('castSpell')).toBe(false);
    expect(kinds.has('activate')).toBe(false);
    expect(kinds.has('pass')).toBe(true);
    expect(kinds.has('concede')).toBe(true);
  });

  test('the caster cannot respond to their own spell either', () => {
    const g = hushed();
    expect(g.deciding).toBe(0);
    g.expect.illegal(0, { activate: PINGER });
    const kinds = getLegalActions(g.state, 0).map((a) => a.kind);
    expect(kinds).not.toContain('castSpell');
    expect(kinds).not.toContain('activate');
  });

  test('the engine refuses them when sent anyway (applyAction)', () => {
    const g = hushed();
    g.act(0).pass();
    const bolt = g.id({ name: BOLT, zone: 'hand' });
    expect(applyAction(g.state, 1, { kind: 'castSpell', object: bolt }).ok).toBe(false);
    const pinger = g.id({ name: PINGER, zone: 'battlefield', seat: 1 });
    expect(applyAction(g.state, 1, { kind: 'activate', object: pinger, abilityIndex: 0 }).ok).toBe(
      false,
    );
  });

  test('passing is all a player may do, and the spell resolves', () => {
    const g = hushed();
    g.passAll();
    g.expect.life(1, 37);
    g.expect.stack([]);
  });

  test('once it has resolved, spells and abilities are allowed again', () => {
    const g = hushed();
    g.passAll();
    g.expect.legal(0, { activate: PINGER });
    g.act(0).activate(PINGER, { targets: [{ player: 1 }] });
    g.expect.stack([`${PINGER} (ability)`]);
    g.act(0).pass();
    g.expect.legal(1, { cast: BOLT });
  });
});

describe('CR 702.61b: what split second does not stop', () => {
  test('mana abilities may be activated, and special actions need no stack anyway', () => {
    const g = hushed();
    g.act(0).pass();
    const mana = getLegalActions(g.state, 1).filter((a) => a.kind === 'activateAbility');
    expect(mana.length).toBeGreaterThan(0);
    g.act(1).tapForMana('Mountain');
    g.expect.pool(1, 'R');
    // Mana in the pool does not let a spell be cast.
    g.expect.illegal(1, { cast: BOLT });
  });

  test('triggered abilities trigger and are put on the stack as normal (CR 603.3)', () => {
    const g = hushed();
    // The Watcher's "whenever you cast a spell" went on the stack above Hush Bolt.
    g.expect.stack([`${WATCHER} (ability)`, HUSH_BOLT]);
    // The split second spell is still there: nothing can be cast while its trigger waits.
    g.expect.illegal(0, { activate: PINGER });
    g.act(0).pass();
    g.act(1).pass();
    g.expect.life(0, 41); // the trigger resolved first
    g.expect.stack([HUSH_BOLT]);
    g.expect.illegal(1, { cast: BOLT });
    g.act(0).pass();
    g.act(1).pass();
    g.expect.life(1, 37);
  });

  test('a creature dying to it triggers its dies ability while split second is on the stack', () => {
    const g = scenario()
      .seat(0)
      .hand(HUSH_BOLT)
      .battlefield('Mountain', 'Mountain')
      .seat(1)
      .battlefield('SYNTHETIC Dies Treasure Creature')
      .hand(BOLT)
      .battlefield('Mountain')
      .build();
    g.act(0).cast(HUSH_BOLT, { targets: ['SYNTHETIC Dies Treasure Creature'], pay: true });
    g.passAll();
    g.expect.zone('SYNTHETIC Dies Treasure Creature', 'graveyard', { seat: 1 });
  });
});

describe('split second under other spells', () => {
  test('cast in response to a spell: the first caster cannot answer it', () => {
    const g = scenario()
      .seat(0)
      .hand(BOLT, COUNTER)
      .battlefield('Mountain', 'Island', 'Island')
      .seat(1)
      .hand(HUSH_GAIN)
      .battlefield('Plains')
      .build();
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.act(0).pass();
    g.act(1).cast(HUSH_GAIN, { pay: true });
    g.act(1).pass();
    // Seat 0 holds Counterspell and two untapped Islands... but a split second spell is on the stack.
    g.expect.illegal(0, { cast: COUNTER });
    g.act(0).pass();
    g.expect.life(1, 43);
    g.expect.stack([BOLT]);
    // With it gone, the Bolt can be answered again.
    g.expect.legal(0, { cast: COUNTER });
  });

  test('the legal actions never offer what applyAction would refuse, during the whole sequence', () => {
    const g = hushed();
    for (let i = 0; i < 4 && g.state.stack.length > 0; i += 1) {
      const d = g.state.pending;
      if (d === null) break;
      for (const a of getLegalActions(g.state, d.seat)) {
        if (a.kind === 'concede') continue;
        expect(applyAction(g.state, d.seat, a).ok, JSON.stringify(a)).toBe(true);
      }
      g.act(d.seat).pass();
    }
  });
});
