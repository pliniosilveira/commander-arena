// "Target creature you control deals damage equal to its power to each other creature and each opponent", "deals 4 damage to any target and 3 damage to
// each of up to two other targets", "choose one that hasn't been chosen this turn" after damage to an opponent (D-151).
// Pins: CR 120.3 (damage), CR 115.3 (a target of one instance of "target" is chosen once; "other targets" are different ones), CR 700.2 and
// 603.3c (modes are chosen as the ability goes on the stack; none left: the ability is removed), CR 510.2 (combat damage is dealt at once). Cards
// are SYNTHETIC (src/cards/fixtures/synthetic-dragons-damage.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const IGNITION = 'SYNTHETIC Rolling Ignition';
const MAW = 'SYNTHETIC Maw Dragon';
const WYRM = 'SYNTHETIC Thrashing Wyrm';
const ANGEL = 'Serra Angel';
const BEARS = 'Grizzly Bears';
const GOBLIN = 'Raging Goblin';
const LIBRARY = Array.from({ length: 10 }, () => 'Mountain');

describe('the cards are valid', () => {
  test.each([IGNITION, MAW, WYRM])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });

  test('the shapes that are refused', () => {
    const card = syntheticCard(MAW);
    const face = card.faces[0];
    if (face === undefined) throw new Error('no face');
    const trigger = face.abilities.find((a) => a.kind === 'triggered');
    if (trigger === undefined || trigger.kind !== 'triggered') throw new Error('no trigger');
    const withTargets = (targets: unknown) =>
      ({
        ...card,
        faces: [{ ...face, abilities: [{ ...trigger, targets }] }],
      }) as never;
    const any = { kind: 'anyTarget' };
    // differentFrom names an earlier slot
    expect(
      validateCard(
        withTargets([
          { id: 't1', what: any },
          { id: 't2', what: any, differentFrom: 't1' },
        ]),
      ),
    ).toEqual([]);
    expect(
      validateCard(
        withTargets([
          { id: 't2', what: any, differentFrom: 't1' },
          { id: 't1', what: any },
        ]),
      ).length,
    ).toBeGreaterThan(0);
    expect(
      validateCard(
        withTargets([
          { id: 't1', what: any, differentFrom: 't1' },
          { id: 't2', what: any },
        ]),
      ).length,
    ).toBeGreaterThan(0);
    // "that opponent" and "each other opponent" need a trigger whose event is about a player
    const upkeep = (effect: unknown, targets?: unknown) =>
      ({
        ...card,
        faces: [
          {
            ...face,
            abilities: [
              {
                kind: 'triggered',
                // The beginning of a step has a player since the Bruna deck (the active player); a death has none.
                trigger: { kind: 'dies', what: { kind: 'this' } },
                effect,
                ...(targets === undefined ? {} : { targets }),
              },
            ],
          },
        ],
      }) as never;
    expect(
      validateCard(upkeep({ kind: 'dealDamage', amount: 1, to: { kind: 'eachOtherOpponent' } }))
        .length,
    ).toBeGreaterThan(0);
    expect(
      validateCard(
        upkeep({ kind: 'destroy', objects: { kind: 'target', id: 'a' } }, [
          {
            id: 'a',
            what: {
              kind: 'object',
              filter: { types: ['artifact'], controller: 'triggerPlayer' },
            },
          },
        ]),
      ).length,
    ).toBeGreaterThan(0);
    // a mode that is not repeated is a triggered ability's
    const wyrm = syntheticCard(WYRM);
    const wface = wyrm.faces[0];
    if (wface === undefined) throw new Error('no face');
    const modal = wface.abilities.find((a) => a.kind === 'triggered');
    if (modal === undefined || modal.kind !== 'triggered') throw new Error('no modal trigger');
    expect(
      validateCard({
        ...wyrm,
        faces: [
          {
            ...wface,
            abilities: [{ ...modal, chooseModes: { min: 1, max: 1, notRepeatedThisTurn: false } }],
          },
        ],
      } as never).length,
    ).toBeGreaterThan(0);
  });
});

describe('"each other creature" and "each opponent"', () => {
  test('the creature that deals the damage is left out, every other creature and each opponent takes it', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .hand(IGNITION)
      .battlefield('Mountain', 'Mountain', 'Mountain', 'Mountain', 'Mountain')
      .battlefield(ANGEL)
      .battlefield(BEARS)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(GOBLIN)
      .build();
    g.act(0).cast(IGNITION, { targets: [ANGEL], pay: true });
    g.passAll();
    g.expect.zone(ANGEL, 'battlefield', { seat: 0 });
    g.expect.damage(ANGEL, 0);
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.zone(GOBLIN, 'graveyard', { seat: 1 });
    g.expect.life(1, 36);
    g.expect.life(0, 40);
    g.expect.invariants();
  });
});

describe('"any target and each of up to two other targets"', () => {
  function attackGame() {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(MAW)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS)
      .battlefield(GOBLIN)
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack([MAW]);
    return g;
  }

  test('the second slot offers every target and the answer may not repeat the first slot', () => {
    const g = attackGame();
    const d = g.state.pending;
    expect(d?.kind).toBe('targets');
    if (d?.kind !== 'targets') return;
    const second = d.specs.find((s) => s.specId === 't2');
    expect(second?.min).toBe(0);
    expect(second?.max).toBe(2);
    expect(second?.differentFrom).toBe('t1');
    const bears = g.object(BEARS).id;
    expect(() =>
      g.act(0).choose({
        kind: 'chooseTargets',
        targets: [
          { kind: 'object', id: bears, specId: 't1' },
          { kind: 'object', id: bears, specId: 't2' },
        ],
      }),
    ).toThrow();
    g.expect.pending('targets', 0);
  });

  test('4 to the first target and 3 to each of the others', () => {
    const g = attackGame();
    const bears = g.object(BEARS).id;
    const goblin = g.object(GOBLIN).id;
    g.act(0).choose({
      kind: 'chooseTargets',
      targets: [
        { kind: 'player', seat: 1, specId: 't1' },
        { kind: 'object', id: bears, specId: 't2' },
        { kind: 'object', id: goblin, specId: 't2' },
      ],
    });
    g.passAll();
    g.expect.life(1, 36);
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.zone(GOBLIN, 'graveyard', { seat: 1 });
  });

  test('none of the others is allowed', () => {
    const g = attackGame();
    g.act(0).choose({
      kind: 'chooseTargets',
      targets: [{ kind: 'player', seat: 1, specId: 't1' }],
    });
    g.passAll();
    g.expect.life(1, 36);
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
  });
});

describe('"choose one that hasn\'t been chosen this turn"', () => {
  function wyrmGame(theirs: readonly string[] = []) {
    let b = scenario()
      .seat(0)
      .library('Forest', 'Island', ...LIBRARY)
      .battlefield(WYRM)
      .seat(1)
      .library(...LIBRARY);
    for (const name of theirs) b = b.battlefield(name);
    const g = b.build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack([WYRM]);
    return g;
  }

  test('the first damage: all three modes are offered; "each other opponent" with two players hurts nobody', () => {
    const g = wyrmGame();
    g.passAll();
    g.passAll();
    // first strike damage dealt: the trigger asks for a mode; the artifact mode has no target
    const d = g.state.pending;
    expect(d?.kind).toBe('chooseModes');
    if (d?.kind !== 'chooseModes') return;
    expect(d.modes.map((m) => m.legal)).toEqual([false, true, true]);
    g.act(0).chooseModes(1);
    g.passAll();
    // 4 damage in the first strike step only (double strike deals 4 twice: 8 in all by the end)
    g.expect.life(1, 36);
  });

  test('the second damage event of the turn: the mode chosen before is not offered again (one left: it is chosen)', () => {
    const g = wyrmGame();
    g.passAll();
    g.passAll();
    g.act(0).chooseModes(2);
    g.passAll();
    // the regular damage step: the exile mode was chosen, the artifact mode has no target, so only "each other opponent" is left and is taken
    g.passAll();
    g.expect.pending('priority', 0);
    const top = g.state.stack[g.state.stack.length - 1];
    expect(top).toBeDefined();
    const data = top === undefined ? undefined : g.state.objects[top]?.stack;
    expect(data?.chosenModes).toEqual([1]);
    g.expect.invariants();
  });

  test('the second damage event: with the exile mode used, "that opponent" artifact and the other opponents are offered', () => {
    const g = wyrmGame(['Sol Ring']);
    g.passAll();
    g.passAll();
    g.act(0).chooseModes(2);
    g.passAll();
    g.passAll();
    const d = g.state.pending;
    expect(d?.kind).toBe('chooseModes');
    if (d?.kind !== 'chooseModes') return;
    expect(d.modes.map((m) => m.legal)).toEqual([true, true, false]);
    expect(d.sets).toEqual([[0], [1]]);
  });

  test('the modes chosen are recorded for the turn, by the permanent', () => {
    const g = wyrmGame(['Sol Ring']);
    g.passAll();
    g.passAll();
    g.act(0).chooseModes(0);
    g.passAll();
    g.passAll();
    g.act(0).chooseModes(1);
    g.passAll();
    g.expect.zone('Sol Ring', 'graveyard', { seat: 1 });
    // the Wyrm dealt double strike damage twice: the two triggers used two modes; a third damage event has two modes left
    expect(g.state.turnLog.modesChosen.map((m) => m.mode)).toEqual([0, 1]);
  });

  test('"that opponent": the artifact is destroyed only if that opponent controls it', () => {
    const g = wyrmGame(['Sol Ring']);
    g.passAll();
    g.passAll();
    const d = g.state.pending;
    expect(d?.kind).toBe('chooseModes');
    if (d?.kind !== 'chooseModes') return;
    expect(d.modes.map((m) => m.legal)).toEqual([true, true, true]);
    g.act(0).chooseModes(0);
    g.passAll();
    g.expect.zone('Sol Ring', 'graveyard', { seat: 1 });
  });

  test('the exile mode: the top card may be played this turn', () => {
    const g = wyrmGame();
    g.passAll();
    g.passAll();
    g.act(0).chooseModes(2);
    g.passAll();
    g.expect.zone('Forest', 'exile', { seat: 0 });
  });
});
