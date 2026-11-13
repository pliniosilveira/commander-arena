// The Danitha deck (issue 26), group 5 (D-1253 provisional): "You may cast this spell as though it had flash if it targets a commander." (Timely Ward).
// Pins: CR 601.3b (the caster may begin to cast the spell as though it had flash when the choice of targets could make the condition true), CR 601.3d (a spell that has flash only
// if conditions are met may be cast with flash when they are), CR 113.6d (the permission is the spell's own ability: it works in the hand), CR 601.2c (the targets are chosen
// as the spell is cast), CR 702.8a (flash: the timing of an instant), CR 303.4a (an Aura spell's target is defined by its enchant ability), CR 903.3 (a commander is a card
// a player designated), CR 733 (a cancelled cast restores the state).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-danitha-g5.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { isFeatureSupported, syntheticCard, validateCard } from '../src/index';
import { castTiming } from '../src/rules/legality';
import { scenario } from '../src/testing/index';
import { targetsDecision } from './pending-helpers';

const WARD = 'SYNTHETIC Warding Aura';
const CROWD = 'SYNTHETIC Crowd Aura';
const BEARS = 'Grizzly Bears';
const COMMANDER = 'Isamaru, Hound of Konda';
const LIBRARY = Array.from({ length: 8 }, () => 'Plains');

/** Seat 0 holds the Aura and three Plains; seat 1 has a commander and a plain creature on the battlefield, and seat 0 a plain creature too. */
function board(options: { readonly active: 0 | 1; readonly step?: 'precombatMain' | 'upkeep' }) {
  return scenario()
    .define(syntheticCard(WARD))
    .define(syntheticCard(CROWD))
    .seat(0)
    .library(...LIBRARY)
    .hand(WARD)
    .battlefield('Plains', { count: 3 })
    .battlefield(BEARS, { label: 'mine' })
    .seat(1)
    .library(...LIBRARY)
    .battlefield(COMMANDER, { commander: true, label: 'theirCommander' })
    .battlefield('Llanowar Elves', { label: 'theirElves' })
    .at(options.step ?? 'precombatMain', { active: options.active, priority: 0 })
    .build();
}

describe('the cards are valid', () => {
  test.each([WARD, CROWD])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
    expect(isFeatureSupported('static:castAsThoughFlash')).toBe(true);
  });
});

describe('"You may cast this spell as though it had flash if it targets a commander" (CR 601.3b, 601.3d)', () => {
  test('on the opponent’s turn the Aura is castable, and only commanders are offered as the target', () => {
    const g = board({ active: 1 });
    g.expect.legal(0, { cast: WARD });
    g.act(0).cast(WARD);
    g.expect.pending('targets', 0);
    const d = targetsDecision(g);
    const slot = d.specs[0];
    expect(slot?.legal).toEqual([
      { kind: 'object', id: g.id('theirCommander'), specId: slot?.specId },
    ]);
  });

  test('on the opponent’s turn with no commander on the battlefield the Aura cannot be cast', () => {
    const g = scenario()
      .define(syntheticCard(WARD))
      .seat(0)
      .library(...LIBRARY)
      .hand(WARD)
      .battlefield('Plains', { count: 3 })
      .battlefield(BEARS)
      .seat(1)
      .library(...LIBRARY)
      .battlefield('Llanowar Elves')
      .at('precombatMain', { active: 1, priority: 0 })
      .build();
    g.expect.illegal(0, { cast: WARD });
  });

  test('a commander of the caster’s own is one too ("a commander", not "your commander")', () => {
    const g = scenario()
      .define(syntheticCard(WARD))
      .seat(0)
      .library(...LIBRARY)
      .hand(WARD)
      .battlefield('Plains', { count: 3 })
      .battlefield(COMMANDER, { commander: true, label: 'mine' })
      .battlefield(BEARS)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 1, priority: 0 })
      .build();
    g.act(0).cast(WARD);
    const slot = targetsDecision(g).specs[0];
    expect(slot?.legal.map((t) => (t.kind === 'object' ? t.id : null))).toEqual([g.id('mine')]);
  });

  test('the Aura enchants the commander and gives it indestructible', () => {
    const g = board({ active: 1 });
    g.act(0).cast(WARD).targets(['theirCommander']).pay();
    g.passAll();
    g.expect.attached(WARD, 'theirCommander');
    g.expect.derived('theirCommander', { keywords: ['indestructible'] });
    g.expect.invariants();
  });

  test('in the caster’s own main phase (normal timing) any creature may be the target: nothing is restricted', () => {
    const g = board({ active: 0 });
    g.expect.legal(0, { cast: WARD });
    g.act(0).cast(WARD);
    const slot = targetsDecision(g).specs[0];
    const ids = (slot?.legal ?? []).map((t) => (t.kind === 'object' ? t.id : null));
    expect(ids).toHaveLength(3);
    expect(ids).toContain(g.id('mine'));
    expect(ids).toContain(g.id('theirElves'));
    expect(ids).toContain(g.id('theirCommander'));
  });

  test('a target that is not a commander is refused when the cast is at flash timing', () => {
    const g = board({ active: 1 });
    g.act(0).cast(WARD);
    const attempt = g.act(0).try.action({
      kind: 'chooseTargets',
      targets: [{ kind: 'object', id: g.id('theirElves'), specId: 't1' }],
    });
    expect(attempt.ok).toBe(false);
    g.expect.pending('targets', 0);
  });

  test('cancelling the cast restores the state and the next cast asks again', () => {
    const g = board({ active: 1 });
    g.act(0).cast(WARD);
    g.act(0).cancel();
    g.expect.zone(WARD, 'hand', { seat: 0 });
    g.act(0).cast(WARD);
    const slot = targetsDecision(g).specs[0];
    expect(slot?.legal).toHaveLength(1);
  });

  test('the timing is read with the commander as the possible target: castTiming says which filter the targets must meet', () => {
    const g = board({ active: 1 });
    const obj = g.object(WARD);
    expect(castTiming(g.state, 0, obj)).toEqual({
      allowed: true,
      onlyTargets: { commander: true },
    });
    const own = board({ active: 0 });
    expect(castTiming(own.state, 0, own.object(WARD))).toEqual({
      allowed: true,
      onlyTargets: null,
    });
  });
});

describe('a condition of the permission that is not about the targets (SYNTHETIC)', () => {
  test('with two creatures the Aura is castable at flash timing and any creature may be the target', () => {
    const g = scenario()
      .define(syntheticCard(CROWD))
      .seat(0)
      .library(...LIBRARY)
      .hand(CROWD)
      .battlefield('Plains', { count: 2 })
      .battlefield(BEARS, 'Llanowar Elves')
      .seat(1)
      .library(...LIBRARY)
      .battlefield(COMMANDER, { commander: true })
      .at('precombatMain', { active: 1, priority: 0 })
      .build();
    g.expect.legal(0, { cast: CROWD });
    g.act(0).cast(CROWD);
    expect(targetsDecision(g).specs[0]?.legal).toHaveLength(3);
  });

  test('with one creature the condition fails and the Aura needs sorcery timing', () => {
    const g = scenario()
      .define(syntheticCard(CROWD))
      .seat(0)
      .library(...LIBRARY)
      .hand(CROWD)
      .battlefield('Plains', { count: 2 })
      .battlefield(BEARS)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 1, priority: 0 })
      .build();
    g.expect.illegal(0, { cast: CROWD });
  });
});
