// "Rather than pay the mana cost of the next spell you cast this turn, you may pay life equal to that spell's mana value" (Marshland Bloodcaster, issue 190): the effect
// `nextSpellPayLife` and the alternative cost `lifeForMana`. (SYNTHETIC Life Caster, src/cards/fixtures/synthetic-life-cost.ts.)
// Pins: CR 118.9 (an alternative cost replaces the mana cost), CR 601.2b and 601.2f (announced, then totalled), CR 202.3e (an {X} counts as the X announced), CR 119.4 (life can be paid only
// when the life total is at least the payment) and CR 119.8 (a life total that can't change can't pay), CR 611.2a (it lasts until end of turn), CR 733 (a cancelled cast is rewound).
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import { getLegalActions, syntheticCard, validateCard } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';

const CASTER = 'SYNTHETIC Life Caster';
const SORCERY = 'SYNTHETIC Plot Draw'; // {2}{U} sorcery, draw a card, mana value 3
const INSTANT = 'SYNTHETIC Plot Gain'; // {1}{U} instant, gain 2 life, mana value 2
const X_SPELL = 'SYNTHETIC Jump X Drain'; // {X}{U} sorcery, gain X life
const LOCK = 'SYNTHETIC Self Life Lock';
const lock = singleFace({
  name: LOCK,
  manaCost: ['W'],
  types: ['instant'],
  colors: ['W'],
  colorIdentity: ['W'],
  oracleText: 'SYNTHETIC fixture: your life total can not change.',
  spell: {
    effect: {
      kind: 'preventPlayerLifeTotalChange',
      player: { kind: 'you' },
      duration: 'untilNextTurn',
    },
  },
});
const FILLER = ['Island', 'Island', 'Island', 'Island', 'Island', 'Island'] as const;

type Builder = ReturnType<typeof scenario>;

function game(configure: (b: Builder) => Builder, pool = '', life = 20): ScenarioGame {
  return configure(
    scenario()
      .seat(0)
      .life(life)
      .library(...FILLER)
      .define(lock)
      .pool(pool),
  )
    .seat(1)
    .library(...FILLER)
    .at('precombatMain', { active: 0, turn: 3 })
    .build();
}

const cardId = (g: ScenarioGame, name: string) => g.find({ name, zone: 'hand', seat: 0 })[0]?.id;
const listed = (g: ScenarioGame, name: string, alternative?: 'lifeForMana'): boolean =>
  getLegalActions(g.state, 0).some(
    (a) => a.kind === 'castSpell' && a.object === cardId(g, name) && a.alternative === alternative,
  );
const granted = (g: ScenarioGame): number =>
  g.state.continuousEffects.filter((e) => e.change.kind === 'nextSpellLife').length;

function arm(g: ScenarioGame, nth = 0): void {
  g.act(0).activate({ name: CASTER, nth });
  g.passAll();
}

describe('the card is valid', () => {
  test(CASTER, () => expect(validateCard(syntheticCard(CASTER))).toEqual([]));
});

describe('pay life equal to the mana value rather than the mana cost (CR 118.9)', () => {
  test('with no mana at all the sorcery is cast for 3 life, and nothing before the ability', () => {
    const g = game((b) => b.battlefield(CASTER).hand(SORCERY));
    expect(listed(g, SORCERY, 'lifeForMana')).toBe(false);
    expect(listed(g, SORCERY)).toBe(false);
    arm(g);
    expect(listed(g, SORCERY)).toBe(false);
    expect(listed(g, SORCERY, 'lifeForMana')).toBe(true);
    g.act(0).cast(SORCERY, { alternative: 'lifeForMana' });
    g.expect.life(0, 17);
    g.passAll();
    expect(g.state.seats[0]?.hand).toHaveLength(1);
    g.expect.invariants();
  });

  test('the ordinary cast is still offered beside it when the mana is there', () => {
    const g = game((b) => b.battlefield(CASTER).hand(SORCERY), 'UUU');
    arm(g);
    expect(listed(g, SORCERY)).toBe(true);
    expect(listed(g, SORCERY, 'lifeForMana')).toBe(true);
    g.act(0).cast(SORCERY, { pay: true });
    g.expect.life(0, 20);
  });

  test('the event says how the spell was cast', () => {
    const g = game((b) => b.battlefield(CASTER).hand(INSTANT));
    arm(g);
    const cast = g.act(0).cast(INSTANT, { alternative: 'lifeForMana' });
    expect(cast).toBeDefined();
    g.expect.life(0, 18);
    expect(g.state.stack).toHaveLength(1);
    g.passAll();
    g.expect.life(0, 20); // 20 - 2 paid + 2 gained
  });

  test('an {X} counts as the X announced: X = 4 on {X}{U} is 5 life', () => {
    const g = game((b) => b.battlefield(CASTER).hand(X_SPELL));
    arm(g);
    g.act(0).cast(X_SPELL, { alternative: 'lifeForMana', x: 4 });
    g.expect.life(0, 15);
    g.passAll();
    g.expect.life(0, 19); // the sorcery gains X = 4
  });

  test('X cannot be announced higher than the life allows: with 6 life the most is 5', () => {
    const g = game((b) => b.battlefield(CASTER).hand(X_SPELL), '', 6);
    arm(g);
    g.act(0).cast(X_SPELL, { alternative: 'lifeForMana' });
    const d = g.state.pending;
    expect(d?.kind).toBe('chooseX');
    if (d?.kind === 'chooseX') expect(d.max).toBe(5);
  });

  test('paying all of the life is allowed (CR 119.4)', () => {
    const g = game((b) => b.battlefield(CASTER).hand(SORCERY), '', 3);
    arm(g);
    expect(listed(g, SORCERY, 'lifeForMana')).toBe(true);
  });
});

describe('insufficient life, or a life total that cannot change', () => {
  test('with 2 life a mana value 3 spell cannot be cast for life', () => {
    const g = game((b) => b.battlefield(CASTER).hand(SORCERY), '', 2);
    arm(g);
    expect(listed(g, SORCERY, 'lifeForMana')).toBe(false);
    g.expect.illegal(0, { cast: SORCERY, alternative: 'lifeForMana' });
    expect(granted(g)).toBe(1);
  });

  test('a locked life total pays nothing (CR 119.8)', () => {
    const g = game((b) => b.battlefield(CASTER).hand(LOCK, SORCERY), 'W');
    g.act(0).cast(LOCK, { pay: true });
    g.passAll();
    arm(g);
    expect(listed(g, SORCERY, 'lifeForMana')).toBe(false);
  });

  test('a spell with no mana cost is cast for 0 life, which is allowed', () => {
    const g = game((b) => b.battlefield(CASTER).hand('Lightning Bolt'), '');
    arm(g);
    expect(listed(g, 'Lightning Bolt', 'lifeForMana')).toBe(true);
  });
});

describe('the next spell uses it up, used or not', () => {
  test('a cheaper spell cast with mana consumes it: the sorcery after it has no such option', () => {
    const g = game((b) => b.battlefield(CASTER).hand(INSTANT, SORCERY), 'UU');
    arm(g);
    g.act(0).cast(INSTANT, { pay: true });
    expect(granted(g)).toBe(0);
    g.passAll();
    expect(listed(g, SORCERY, 'lifeForMana')).toBe(false);
  });

  test('a spell cast for life consumes it too', () => {
    const g = game((b) => b.battlefield(CASTER).hand(INSTANT, SORCERY));
    arm(g);
    g.act(0).cast(INSTANT, { alternative: 'lifeForMana' });
    g.passAll();
    expect(granted(g)).toBe(0);
    expect(listed(g, SORCERY, 'lifeForMana')).toBe(false);
  });

  test('a land is played, not cast: it leaves the permission', () => {
    const g = game((b) => b.battlefield(CASTER).hand('Island', SORCERY));
    arm(g);
    g.act(0).playLand('Island');
    expect(granted(g)).toBe(1);
    expect(listed(g, SORCERY, 'lifeForMana')).toBe(true);
  });

  test('an activated ability is not a spell: another activation leaves it', () => {
    const g = game((b) => b.battlefield(CASTER, CASTER).hand(SORCERY));
    arm(g, 0);
    arm(g, 1);
    expect(granted(g)).toBe(2);
    expect(listed(g, SORCERY, 'lifeForMana')).toBe(true);
  });

  test('two activations before one spell are both used up by it', () => {
    const g = game((b) => b.battlefield(CASTER, CASTER).hand(INSTANT, SORCERY));
    arm(g, 0);
    arm(g, 1);
    g.act(0).cast(INSTANT, { alternative: 'lifeForMana' });
    g.passAll();
    expect(granted(g)).toBe(0);
    expect(listed(g, SORCERY, 'lifeForMana')).toBe(false);
  });

  test('an activation after the first spell gives the next one its own permission', () => {
    const g = game((b) => b.battlefield(CASTER, CASTER).hand(INSTANT, SORCERY), 'UU');
    arm(g, 0);
    g.act(0).cast(INSTANT, { pay: true });
    g.passAll();
    arm(g, 1);
    g.act(0).cast(SORCERY, { alternative: 'lifeForMana' });
    g.expect.life(0, 17 + 2);
  });
});

describe('it ends with the turn, and a cancelled cast gives it back (CR 611.2a, 733)', () => {
  test('it expires at the end of the turn', () => {
    const g = game((b) => b.battlefield(CASTER).hand(SORCERY));
    arm(g);
    expect(granted(g)).toBe(1);
    g.advanceTo('precombatMain', { turn: 'next' });
    expect(granted(g)).toBe(0);
  });

  test('cancelling the cast at the X question restores the permission and the life', () => {
    const g = game((b) => b.battlefield(CASTER).hand(X_SPELL));
    arm(g);
    g.act(0).cast(X_SPELL, { alternative: 'lifeForMana' });
    expect(g.state.pending?.kind).toBe('chooseX');
    g.act(0).cancel();
    expect(granted(g)).toBe(1);
    g.expect.life(0, 20);
    expect(listed(g, X_SPELL, 'lifeForMana')).toBe(true);
    g.expect.invariants();
  });
});
