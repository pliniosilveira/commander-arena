// Fight (CR 701.14, D-145): "Target creature you control fights target creature you don't control." and "For each creature your opponents
// control, create a 4/4 green Phyrexian Beast creature token. Each of those tokens fights a different one of those creatures."
// Pins: CR 701.14a (each deals damage equal to its power to the other), CR 701.14b (no damage unless both are creatures on the
// battlefield), CR 120.3 (damage from the creatures: lifelink, deathtouch), CR 615 (prevention applies to each), CR 608.2b (an illegal
// target), CR 608.2d (the controller chooses as the effect resolves), CR 111.2 (a token's controller creates it), CR 400.7j ("those
// tokens"). Cards are SYNTHETIC (src/cards/fixtures/synthetic-fight.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import type { GameEvent } from '../src/index';
import { syntheticCard, validateCard } from '../src/index';
import type { ScenarioGame } from '../src/testing/index';
import { scenario } from '../src/testing/index';
import { choosePermanentDecision } from './pending-helpers';

const DUEL = 'SYNTHETIC Duel';
const SWARM = 'SYNTHETIC Swarm Predation';
const TWIN = 'SYNTHETIC Twin Brawl';
const V22 = 'SYNTHETIC Vanilla 2/2';
const V33 = 'SYNTHETIC Vanilla 3/3';
const V55 = 'SYNTHETIC Vanilla 5/5';
const LIFELINK = 'SYNTHETIC Double Strike Lifelink 3/3';
const DEATHTOUCH = 'SYNTHETIC Deathtouch Trampler 4/4';
const FOG = 'SYNTHETIC Fog Spell';
const QUIET_FOG = 'SYNTHETIC Quiet Fog';

const fights = (events: readonly GameEvent[]) => events.filter((e) => e.kind === 'fought');
const beasts = (g: ScenarioGame) => g.find({ name: 'Phyrexian Beast', zone: 'battlefield' });

describe('the cards are valid', () => {
  test.each([DUEL, SWARM, TWIN])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
});

describe('a fight between two creatures (CR 701.14a)', () => {
  const duel = (
    mine: string,
    theirs: string,
    extra: (b: ReturnType<typeof scenario>) => ReturnType<typeof scenario> = (b) => b,
  ) => {
    const g = extra(
      scenario()
        .seat(0)
        .hand(DUEL)
        .battlefield('Forest', 'Forest')
        .battlefield(mine, { label: 'mine' }),
    )
      .seat(1)
      .battlefield(theirs, { label: 'theirs' })
      .build();
    g.act(0).cast(DUEL, { targets: ['mine', 'theirs'], pay: true });
    g.passAll();
    return g;
  };

  test('each deals damage equal to its power to the other: a 3/3 and a 2/2', () => {
    const g = duel(V33, V22);
    g.expect.zone(V22, 'graveyard', { seat: 1 });
    g.expect.damage('mine', 2);
    expect(fights(g.eventsSince(0))).toHaveLength(1);
  });

  test('it is a fight, not a bite: the creature fought deals its damage back', () => {
    const g = duel(V22, V55);
    g.expect.damage('theirs', 2);
    g.expect.zone(V22, 'graveyard', { seat: 0 });
  });

  test('lifelink of a fighter gains life (CR 120.3f)', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .hand(DUEL)
      .battlefield('Forest', 'Forest')
      .battlefield(LIFELINK, { label: 'mine' })
      .seat(1)
      .battlefield(V55, { label: 'theirs' })
      .build();
    g.act(0).cast(DUEL, { targets: ['mine', 'theirs'], pay: true });
    g.passAll();
    g.expect.life(0, 23);
  });

  test('deathtouch of a fighter kills (CR 702.2b)', () => {
    const g = duel(DEATHTOUCH, V55);
    g.expect.zone(V55, 'graveyard', { seat: 1 });
  });

  test('a prevention effect applies to the damage of a fight: it is noncombat damage (CR 615, 120.3)', () => {
    const g = scenario()
      .seat(0)
      .hand(QUIET_FOG, DUEL)
      .battlefield('Plains', 'Plains', 'Forest', 'Forest')
      .battlefield(V33, { label: 'mine' })
      .seat(1)
      .battlefield(V22, { label: 'theirs' })
      .build();
    g.act(0).cast(QUIET_FOG, { pay: true });
    g.passAll();
    g.act(0).cast(DUEL, { targets: ['mine', 'theirs'], pay: true });
    g.passAll();
    g.expect.damage('theirs', 0);
    g.expect.damage('mine', 0);
    expect(fights(g.eventsSince(0))).toHaveLength(1);
  });

  test('combat damage prevention does not apply: a fight is not combat', () => {
    const g = scenario()
      .seat(0)
      .hand(FOG, DUEL)
      .battlefield('Plains', 'Forest', 'Forest', 'Forest')
      .battlefield(V33, { label: 'mine' })
      .seat(1)
      .battlefield(V22, { label: 'theirs' })
      .build();
    g.act(0).cast(FOG, { pay: true });
    g.passAll();
    g.act(0).cast(DUEL, { targets: ['mine', 'theirs'], pay: true });
    g.passAll();
    g.expect.zone(V22, 'graveyard', { seat: 1 });
  });

  test('a target that is no longer legal: nothing fights (CR 701.14b, 608.2b)', () => {
    const g = scenario()
      .seat(0)
      .hand(DUEL, 'Unsummon')
      .battlefield('Island', 'Forest', 'Forest', 'Forest', 'Island')
      .battlefield(V33, { label: 'mine' })
      .seat(1)
      .battlefield(V22, { label: 'theirs' })
      .build();
    g.act(0).cast(DUEL, { targets: ['mine', 'theirs'], pay: true });
    g.act(0).cast('Unsummon', { targets: ['theirs'], pay: true });
    g.passAll();
    g.expect.damage('mine', 0);
    expect(fights(g.eventsSince(0))).toHaveLength(0);
  });
});

describe('"For each creature your opponents control, create a 4/4 Beast. Each of those tokens fights a different one of those creatures."', () => {
  const cast = (theirs: readonly string[]) => {
    let b = scenario()
      .seat(0)
      .hand(SWARM)
      .battlefield('Forest', 'Forest', 'Forest', 'Forest', 'Forest', 'Forest')
      .seat(1);
    for (const t of theirs) b = b.battlefield(t);
    const g = b.build();
    g.act(0).cast(SWARM, { pay: true });
    g.passAll();
    return g;
  };

  test('one Beast for each creature they control, all under my control', () => {
    const g = cast([V22, V33, V55]);
    expect(beasts(g).filter((o) => o.controller === 0)).toHaveLength(3);
  });

  test('with one creature there is nothing to choose: the Beast fights it at once', () => {
    const g = cast([V33]);
    g.expect.pending('priority', 0);
    g.expect.zone(V33, 'graveyard', { seat: 1 });
    expect(fights(g.eventsSince(0))).toHaveLength(1);
  });

  test('with three, the controller chooses for the first Beast among all three, for the second among the other two, the third is forced', () => {
    const g = cast([V22, V33, V55]);
    const first = choosePermanentDecision(g);
    expect(first.purpose).toBe('fight');
    expect(first.min).toBe(1);
    expect(first.max).toBe(1);
    expect(first.seat).toBe(0);
    expect(first.legal).toHaveLength(3);
    expect(beasts(g).map((o) => o.id)).toContain(first.subject);
    g.act(0).choosePermanents({ name: V55, seat: 1 });
    const second = choosePermanentDecision(g);
    expect(second.legal).toHaveLength(2);
    expect(second.legal).not.toContain(g.id(V55));
    expect(second.subject).not.toBe(first.subject);
    g.act(0).choosePermanents({ name: V22, seat: 1 });
    // The third creature is the only one left: it is paired without a question.
    g.expect.pending('priority', 0);
    expect(fights(g.eventsSince(0))).toHaveLength(3);
    // Each creature fought a 4/4: the 2/2 and the 3/3 died, the 5/5 took 4 damage.
    g.expect.zone(V22, 'graveyard', { seat: 1 });
    g.expect.zone(V33, 'graveyard', { seat: 1 });
    g.expect.damage(V55, 4);
    g.expect.invariants();
  });

  test('the choice decides who fights whom: the Beast chosen for the 5/5 takes 5 and dies', () => {
    const g = cast([V33, V55]);
    g.act(0).choosePermanents({ name: V55, seat: 1 });
    // Two Beasts: the one paired with the 5/5 died, the other fought the 3/3.
    expect(beasts(g)).toHaveLength(1);
    g.expect.zone(V33, 'graveyard', { seat: 1 });
    g.expect.damage(V55, 4);
  });

  test('a creature that cannot be chosen twice: the second answer cannot name the first creature again', () => {
    const g = cast([V22, V33, V55]);
    g.act(0).choosePermanents({ name: V55, seat: 1 });
    const r = g.act(0).try.action({ kind: 'choosePermanents', objects: [g.id(V55)] });
    expect(r.ok).toBe(false);
  });

  test('no creature on their side: no Beast and nothing to fight', () => {
    const g = cast([]);
    expect(beasts(g)).toHaveLength(0);
    g.expect.zone(SWARM, 'graveyard', { seat: 0 });
  });

  test('the opponent never chooses: only the controller of the spell is asked', () => {
    const g = cast([V22, V33]);
    expect(choosePermanentDecision(g).seat).toBe(0);
  });
});

describe('fewer fighters than creatures: each fights a different one, the rest are left alone', () => {
  test('two 3/3 Beasts among three creatures: two are chosen, the third is untouched', () => {
    const g = scenario()
      .seat(0)
      .hand(TWIN)
      .battlefield('Forest', 'Forest', 'Forest', 'Forest')
      .seat(1)
      .battlefield(V22, V33, V55)
      .build();
    g.act(0).cast(TWIN, { pay: true });
    g.passAll();
    expect(choosePermanentDecision(g).legal).toHaveLength(3);
    g.act(0).choosePermanents({ name: V22, seat: 1 });
    expect(choosePermanentDecision(g).legal).toHaveLength(2);
    g.act(0).choosePermanents({ name: V33, seat: 1 });
    g.expect.zone(V22, 'graveyard', { seat: 1 });
    g.expect.zone(V33, 'graveyard', { seat: 1 });
    g.expect.damage(V55, 0);
    expect(fights(g.eventsSince(0))).toHaveLength(2);
  });
});

describe('validation', () => {
  const withEffect = (e: object) =>
    ({
      ...syntheticCard(DUEL),
      faces: [
        {
          ...syntheticCard(DUEL).faces[0],
          spell: { ...syntheticCard(DUEL).faces[0]?.spell, effect: e },
        },
      ],
    }) as unknown as Parameters<typeof validateCard>[0];
  const t1 = { kind: 'target', id: 't1' };
  const t2 = { kind: 'target', id: 't2' };
  const group = { kind: 'each', filter: { types: ['creature'], controller: 'opponent' } };

  test('the plain fight and the pairing validate', () => {
    expect(validateCard(withEffect({ kind: 'fight', fighters: t1, against: t2 }))).toEqual([]);
    expect(
      validateCard(
        withEffect({ kind: 'fight', fighters: t1, against: group, pairing: 'differentChosen' }),
      ),
    ).toEqual([]);
  });

  test.each([
    ['a group in a plain fight', { kind: 'fight', fighters: t1, against: group }],
    [
      'a pairing against one creature',
      { kind: 'fight', fighters: t1, against: t2, pairing: 'differentChosen' },
    ],
    ['an unknown pairing', { kind: 'fight', fighters: t1, against: group, pairing: 'same' }],
  ])('%s is refused', (_name, effect) => {
    expect(validateCard(withEffect(effect)).length).toBeGreaterThan(0);
  });
});
