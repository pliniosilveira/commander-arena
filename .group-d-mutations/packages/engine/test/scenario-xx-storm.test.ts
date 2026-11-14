// Storm (CR 702.40a, 702.40b, D-129): "When you cast this spell, copy it for each other spell that was cast before it
// this turn. If the spell has any targets, you may choose new targets for any of the copies."
// Pins: CR 702.40a (a triggered ability that functions on the stack, found as the spell is cast; spells cast by every player
// count; the number is fixed as the spell is cast), 702.40b (each instance triggers separately), 603.3b (the trigger goes
// on the stack above the spell), 707.10 and 707.10c (the copies are spells that are not cast: they do not count and do not
// trigger Storm again; each may get new targets), 707.10f and 608.3f (a copy of a permanent spell becomes a token),
// 113.7a (the trigger copies a spell that was countered in response, from last-known information), 500.5 (turns).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-copies.ts) except Lightning Bolt and Counterspell.
import { describe, expect, test } from 'vitest';
import {
  type GameObject,
  getView,
  isFeatureSupported,
  syntheticCard,
  validateCard,
} from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { targetsDecision } from './pending-helpers';

const BOLT = 'SYNTHETIC Storm Bolt'; // {R} instant, storm: 1 damage to any target
const DRAIN = 'SYNTHETIC Storm Drain'; // {B} sorcery, storm: each opponent loses 2 life
const X_DRAIN = 'SYNTHETIC Storm X Drain'; // {X}{B} sorcery, storm: each opponent loses X life
const KICK_BOLT = 'SYNTHETIC Storm Kick Bolt'; // {R} instant, kicker {1}, storm: 1 (3 kicked) damage to target creature
const DOUBLE = 'SYNTHETIC Double Storm'; // {1}{B} sorcery, storm twice: each opponent loses 1 life
const BEAST = 'SYNTHETIC Storm Beast'; // {2}{R} 1/1, storm; when it enters, you gain 1 life
const CHARM = 'SYNTHETIC Storm Charm'; // {1}{R} instant, storm: choose one: 2 damage to target creature / gain 3 life
const TWIN = 'SYNTHETIC Twin Spell';
const LIGHTNING = 'Lightning Bolt';
const COUNTERSPELL = 'Counterspell';
const SPIDER = 'Giant Spider'; // 2/4
const BEARS = 'Grizzly Bears';

const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;
type Builder = ReturnType<typeof scenario>;

/** Seat 0's precombat main phase of turn 3, with libraries that do not run out. */
function game(configure: (b: Builder) => Builder): ScenarioGame {
  return configure(scenario().seat(0).life(20))
    .seat(0)
    .library(...FILLER)
    .seat(1)
    .life(20)
    .library(...FILLER)
    .build();
}

const resolveTop = (g: ScenarioGame): void => {
  g.pass();
  g.pass();
};

const copies = (g: ScenarioGame): GameObject[] =>
  [...g.state.stack]
    .reverse()
    .map((id) => g.state.objects[id])
    .filter((o): o is GameObject => o?.copyOf !== undefined);

/** Seat 0 casts `LIGHTNING` at the opponent's face `n` times, resolving each, so `n` spells were cast this turn. */
const castBolts = (g: ScenarioGame, n: number): void => {
  for (let i = 0; i < n; i += 1) {
    g.act(0).cast(
      { name: LIGHTNING, zone: 'hand', nth: 0 },
      { targets: [{ player: 1 }], pay: true },
    );
    resolveTop(g);
  }
};

const lands = (b: Builder, n: number) =>
  b.battlefield('Mountain', { count: n }).battlefield('Swamp', { count: 3 });

describe('the storm trigger (CR 702.40a, 603.3b)', () => {
  test('goes on the stack above the spell as it is cast; the spell is on the stack under it', () => {
    const g = game((b) => lands(b.seat(0).hand(DRAIN), 1));
    g.act(0).cast(DRAIN, { pay: true });
    g.expect.stack([`${DRAIN} (ability)`, DRAIN]);
    const trigger = g.state.objects[g.state.stack[1] ?? ('o0' as never)];
    expect(trigger?.stack?.ability?.kind).toBe('triggered');
    expect(trigger?.stack?.ability).toMatchObject({
      trigger: { kind: 'castSpell', self: true },
      effect: { kind: 'storm' },
    });
  });

  test('is a spell-only ability: a card in a hand has no storm trigger and a copy does not trigger it again', () => {
    const g = game((b) => lands(b.seat(0).hand(DRAIN, LIGHTNING), 2));
    castBolts(g, 1);
    g.act(0).cast(DRAIN, { pay: true });
    resolveTop(g); // the storm trigger: one copy
    g.expect.stack([DRAIN, DRAIN]);
    expect(copies(g)).toHaveLength(1);
    // The copy is not cast, so nothing triggered: only the two spells of the stack.
    g.expect.pending('priority', 0);
  });

  test('with no spell cast before it, makes no copies', () => {
    const g = game((b) => lands(b.seat(0).hand(DRAIN), 1));
    g.act(0).cast(DRAIN, { pay: true });
    resolveTop(g);
    g.expect.stack([DRAIN]);
    expect(g.eventsSince(0).filter((e) => e.kind === 'spellCopied')).toHaveLength(0);
    resolveTop(g);
    g.expect.life(1, 18);
  });

  test('copies the spell once for one earlier spell: the copy resolves before the original', () => {
    const g = game((b) => lands(b.seat(0).hand(DRAIN, LIGHTNING), 2));
    castBolts(g, 1);
    g.expect.life(1, 17);
    g.act(0).cast(DRAIN, { pay: true });
    resolveTop(g);
    g.expect.stack([DRAIN, DRAIN]);
    expect(g.state.stack.map((id) => g.state.objects[id]?.copyOf !== undefined)).toEqual([
      false,
      true,
    ]);
    resolveTop(g);
    g.expect.life(1, 15);
    g.expect.stack([DRAIN]);
    resolveTop(g);
    g.expect.life(1, 13);
    g.expect.invariants();
  });

  test('copies it three times for three earlier spells', () => {
    const g = game((b) => lands(b.seat(0).hand(DRAIN).hand(LIGHTNING, { count: 3 }), 3));
    castBolts(g, 3);
    g.expect.life(1, 11);
    g.act(0).cast(DRAIN, { pay: true });
    resolveTop(g);
    expect(copies(g)).toHaveLength(3);
    g.expect.stack([DRAIN, DRAIN, DRAIN, DRAIN]);
    for (let i = 0; i < 4; i += 1) resolveTop(g);
    g.expect.life(1, 3);
    g.expect.stack([]);
    // Four spells in all went through this: three bolts and the drain, but the copies are no spells cast.
    expect(g.state.seats[0]?.spellsCastThisTurn).toBe(4);
    expect(g.find({ name: DRAIN })).toHaveLength(1);
    g.expect.invariants();
  });

  test('counts the spells the opponent cast too (every player)', () => {
    const g = game((b) =>
      lands(b.seat(0).hand(BOLT, LIGHTNING), 2).seat(1).hand(LIGHTNING).battlefield('Mountain'),
    );
    g.act(0).cast(LIGHTNING, { targets: [{ player: 1 }], pay: true });
    g.pass(0);
    g.act(1).cast(LIGHTNING, { targets: [{ player: 0 }], pay: true });
    g.pass(1);
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    expect(g.state.seats.map((s) => s.spellsCastThisTurn)).toEqual([2, 1]);
    resolveTop(g);
    g.act(0).chooseTargets({ player: 1 });
    g.act(0).chooseTargets({ player: 1 });
    expect(copies(g)).toHaveLength(2);
  });

  test('the number is fixed as the spell is cast: a spell cast in response to the trigger does not add', () => {
    const g = game((b) =>
      lands(b.seat(0).hand(BOLT), 1).seat(1).hand(LIGHTNING).battlefield('Mountain'),
    );
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.pass(0);
    g.act(1).cast(LIGHTNING, { targets: [{ player: 0 }], pay: true });
    resolveTop(g); // the bolt of the opponent
    resolveTop(g); // the storm trigger: no spell had been cast before the storm spell
    expect(copies(g)).toHaveLength(0);
    g.expect.stack([BOLT]);
    expect(g.state.objects[g.state.stack[0] ?? ('o0' as never)]?.stack?.spellsCastBefore).toBe(0);
  });

  test('the count starts over each turn', () => {
    const g = game((b) => lands(b.seat(0).hand(BOLT, LIGHTNING), 2));
    castBolts(g, 1);
    expect(g.state.seats.map((s) => s.spellsCastThisTurn)).toEqual([1, 0]);
    g.advanceTo('precombatMain', { turn: 'next' });
    expect(g.state.seats.map((s) => s.spellsCastThisTurn)).toEqual([0, 0]);
    g.advanceTo('precombatMain', { turn: 'next' });
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    expect(g.state.objects[g.state.stack[0] ?? ('o0' as never)]?.stack?.spellsCastBefore).toBe(0);
  });

  test('a spell countered in response to the trigger is still copied, from what it was', () => {
    const g = game((b) =>
      lands(b.seat(0).hand(BOLT, LIGHTNING), 2)
        .seat(1)
        .hand(COUNTERSPELL)
        .battlefield('Island', { count: 2 }),
    );
    castBolts(g, 1); // 1 damage
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.pass(0);
    g.act(1).cast(COUNTERSPELL, { targets: [{ name: BOLT, zone: 'stack' }], pay: true });
    resolveTop(g); // the counterspell resolves; the storm spell is in the graveyard
    g.expect.zone(BOLT, 'graveyard', { seat: 0 });
    // Seat 1 cast the counterspell after the storm spell: it was not counted (CR 702.40a: before it).
    resolveTop(g); // the trigger: one copy, made from last-known information; its controller may choose new targets
    g.expect.pending('targets', 0);
    g.act(0).chooseTargets({ player: 1 });
    g.expect.stack([BOLT]);
    expect(copies(g)).toHaveLength(1);
    resolveTop(g);
    g.expect.life(1, 16); // the Lightning Bolt (3) and the copy (1)
  });
});

describe('new targets for each copy (CR 702.40a, 707.10c)', () => {
  test('the controller is asked about each copy in turn, and each copy may go somewhere else', () => {
    const g = game((b) =>
      lands(b.seat(0).hand(BOLT).hand(LIGHTNING, { count: 2 }), 3)
        .seat(1)
        .battlefield(SPIDER)
        .battlefield(BEARS),
    );
    castBolts(g, 2);
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    resolveTop(g);
    const first = targetsDecision(g);
    expect(first.forCopy).toBe(true);
    expect(first.current).toEqual([{ kind: 'player', seat: 1, specId: 't1' }]);
    g.act(0).chooseTargets(BEARS);
    // The second copy is made after the first has its targets.
    const second = targetsDecision(g);
    expect(second.source).not.toBe(first.source);
    g.act(0).chooseTargets({ player: 1 });
    expect(copies(g)).toHaveLength(2);
    const aims = copies(g).map((c) => c.stack?.chosenTargets[0]);
    expect(aims).toContainEqual({ kind: 'player', seat: 1, specId: 't1' });
    expect(aims).toContainEqual({ kind: 'object', id: g.id(BEARS), specId: 't1' });
    g.expect.pending('priority', 0);
    g.expect.stack([BOLT, BOLT, BOLT]);
    g.expect.invariants();
  });
});

describe('what the copies have (CR 707.10)', () => {
  test('a storm spell with {X}: every copy has the X that was announced', () => {
    const g = game((b) =>
      lands(b.seat(0).hand(X_DRAIN, LIGHTNING), 2).battlefield('Mountain', { count: 2 }),
    );
    castBolts(g, 1);
    g.act(0).cast(X_DRAIN, { x: 3, pay: true });
    resolveTop(g);
    const [copy] = copies(g);
    expect(copy?.stack?.x).toBe(3);
    resolveTop(g);
    g.expect.life(1, 14);
    resolveTop(g);
    g.expect.life(1, 11);
  });

  test('a kicked storm spell: every copy is kicked', () => {
    const g = game((b) =>
      lands(b.seat(0).hand(KICK_BOLT, LIGHTNING), 3).seat(1).battlefield(SPIDER).battlefield(BEARS),
    );
    castBolts(g, 1);
    g.act(0).cast(KICK_BOLT, { kicked: true, targets: [SPIDER], pay: true });
    resolveTop(g);
    const [copy] = copies(g);
    expect(copy?.stack?.kicked).toBe(true);
    g.act(0).chooseTargets(BEARS);
    resolveTop(g); // the copy, kicked: 3 damage kills the Bears
    g.expect.noObject(BEARS, { zone: 'battlefield' });
    resolveTop(g);
    g.expect.damage(SPIDER, 3);
  });

  test('a modal storm spell: every copy has the mode, with a target slot of that mode', () => {
    const g = game((b) =>
      lands(b.seat(0).hand(CHARM, LIGHTNING), 3).seat(1).battlefield(SPIDER).battlefield(BEARS),
    );
    castBolts(g, 1);
    g.act(0).cast(CHARM, { modes: [0], targets: [SPIDER], pay: true });
    resolveTop(g);
    const d = targetsDecision(g);
    expect(d.specs.map((s) => ({ id: s.specId, mode: s.mode }))).toEqual([{ id: 't1', mode: 0 }]);
    g.act(0).chooseTargets(BEARS);
    expect(getView(g.state, 1).stack.at(-1)).toMatchObject({ copy: true, modes: [0] });
  });

  test('two instances of storm trigger separately: twice the copies (CR 702.40b)', () => {
    const g = game((b) => lands(b.seat(0).hand(DOUBLE).hand(LIGHTNING, { count: 2 }), 2));
    castBolts(g, 2);
    g.act(0).cast(DOUBLE, { pay: true });
    const triggers = g.state.stack.filter(
      (id) => g.state.objects[id]?.stack?.ability?.kind === 'triggered',
    );
    expect(triggers).toHaveLength(2);
    // Alike, in no order that matters: resolve the triggers first (the copies they make go above the other one).
    g.expect.pending('priority', 0);
    resolveTop(g);
    resolveTop(g);
    resolveTop(g);
    g.passAll();
    expect(g.eventsSince(0).filter((e) => e.kind === 'spellCopied')).toHaveLength(4);
    // Each instance copied it twice (the two bolts cast before it).
    expect(g.state.stack).toEqual([]);
    // Two bolts (3 each), then the spell and its four copies (1 each).
    g.expect.life(1, 20 - 6 - 5);
  });
});

describe('a copy of a permanent spell (CR 707.10f, 608.3f)', () => {
  test('each copy becomes a token with the copiable values, and is no longer a copy of a spell', () => {
    const g = game((b) => lands(b.seat(0).hand(BEAST).hand(LIGHTNING, { count: 2 }), 3));
    castBolts(g, 2);
    g.act(0).cast(BEAST, { pay: true });
    resolveTop(g); // the storm trigger: two copies, no targets to ask about
    expect(copies(g)).toHaveLength(2);
    g.expect.stack([BEAST, BEAST, BEAST]);
    resolveTop(g); // the first copy: a token enters, and its trigger goes on the stack
    const [token] = g.find({ name: BEAST, zone: 'battlefield' });
    expect(token?.token).not.toBeNull();
    expect(token?.copyOf).toBeUndefined();
    expect(token?.card).toBeNull();
    g.expect.pt({ name: BEAST, zone: 'battlefield' }, 1, 1);
    g.expect.stack([`${BEAST} (ability)`, BEAST, BEAST]);
    g.passAll();
    // Both copies became tokens (Beasts), and each entered: "you gain 1 life" twice; then the card itself, a third.
    const beasts = g.find({ name: BEAST, zone: 'battlefield' });
    expect(beasts).toHaveLength(3);
    expect(beasts.filter((o) => o.token !== null)).toHaveLength(2);
    expect(beasts.filter((o) => o.card !== null)).toHaveLength(1);
    g.expect.life(0, 23);
    g.expect.stack([]);
    g.expect.invariants();
  });

  test('a copy of a permanent spell that is countered ceases to exist; the card is not duplicated', () => {
    const g = game((b) =>
      lands(b.seat(0).hand(BEAST, LIGHTNING), 3)
        .seat(1)
        .hand(COUNTERSPELL)
        .battlefield('Island', { count: 2 }),
    );
    castBolts(g, 1);
    g.act(0).cast(BEAST, { pay: true });
    resolveTop(g);
    g.pass(0);
    g.act(1).cast(COUNTERSPELL, { targets: [{ name: BEAST, zone: 'stack', nth: 1 }], pay: true });
    resolveTop(g);
    g.expect.stack([BEAST]);
    expect(g.find({ name: BEAST, zone: 'graveyard' })).toHaveLength(0);
    expect(g.find({ name: BEAST, zone: 'battlefield' })).toHaveLength(0);
    resolveTop(g);
    expect(g.find({ name: BEAST, zone: 'battlefield' })).toHaveLength(1);
  });
});

describe('copies are not cast', () => {
  test('a copy made by another effect does not count for storm either', () => {
    const g = game((b) =>
      lands(b.seat(0).hand(BOLT, TWIN, LIGHTNING), 3).battlefield('Island', { count: 2 }),
    );
    castBolts(g, 1);
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    resolveTop(g); // trigger: 1 copy; asks about new targets
    g.act(0).chooseTargets({ player: 1 });
    // Twin Spell copies the storm spell: that copy is not cast, so no new storm trigger and no more copies.
    g.act(0).cast(TWIN, { targets: [{ name: BOLT, zone: 'stack', nth: 0 }], pay: true });
    resolveTop(g);
    g.act(0).chooseTargets({ player: 1 });
    expect(g.state.seats[0]?.spellsCastThisTurn).toBe(3);
    expect(copies(g)).toHaveLength(2);
  });
});

describe('validation and features', () => {
  test('the keyword and the effects are supported features', () => {
    expect(isFeatureSupported('keyword:storm')).toBe(true);
    expect(isFeatureSupported('effect:copySpell')).toBe(true);
    expect(isFeatureSupported('effect:storm')).toBe(true);
  });

  test('every synthetic card of the slice is valid', () => {
    for (const name of [BOLT, DRAIN, X_DRAIN, KICK_BOLT, DOUBLE, BEAST, CHARM, TWIN]) {
      expect(validateCard(syntheticCard(name)), name).toEqual([]);
    }
  });

  test('the storm effect stands only in "when you cast this spell"', () => {
    const base = syntheticCard(DRAIN);
    const face = base.faces[0];
    if (face === undefined) throw new Error('no face');
    const inSpell = {
      ...base,
      faces: [{ ...face, abilities: [], spell: { effect: { kind: 'storm' as const } } }],
    };
    expect(
      validateCard(inSpell)
        .map((i) => i.message)
        .join(' '),
    ).toContain('storm');
    const asTrigger = {
      ...base,
      faces: [
        {
          ...face,
          abilities: [
            {
              kind: 'triggered' as const,
              trigger: { kind: 'upkeep' as const, whose: 'you' as const },
              effect: { kind: 'storm' as const },
            },
          ],
        },
      ],
    };
    expect(
      validateCard(asTrigger)
        .map((i) => i.message)
        .join(' '),
    ).toContain('storm');
  });

  test('copySpell refuses an unknown mode of choosing targets and a source that is not a spell reference', () => {
    const base = syntheticCard(TWIN);
    const face = base.faces[0];
    if (face === undefined) throw new Error('no face');
    const bad = (effect: unknown) =>
      validateCard({
        ...base,
        faces: [{ ...face, spell: { ...face.spell, effect } as never }],
      }).map((i) => i.message);
    expect(
      bad({ kind: 'copySpell', spell: { kind: 'target', id: 't1' }, newTargets: 'always' }).join(
        ' ',
      ),
    ).toContain('newTargets');
    expect(
      bad({ kind: 'copySpell', spell: { kind: 'this' }, newTargets: 'no' }).join(' '),
    ).toContain('copySpell');
    expect(
      bad({ kind: 'copySpell', spell: { kind: 'triggerSubject' }, newTargets: 'no' }).join(' '),
    ).toContain('triggerSubject');
    expect(
      bad({ kind: 'copySpell', spell: { kind: 'target', id: 't9' }, newTargets: 'no' }).join(' '),
    ).toContain('t9');
  });
});
