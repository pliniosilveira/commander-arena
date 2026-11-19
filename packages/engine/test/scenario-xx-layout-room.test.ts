// Split cards with a shared type line, Rooms (CR 709.5): either half is cast as a permanent spell (CR 709.3) and that half is unlocked as the permanent enters (CR 709.5d); the
// other half is locked and gives the permanent no name, mana cost or rules text (CR 709.5); a player may pay the mana cost of a locked half to unlock it, a special action in a
// main phase of their turn with an empty stack (CR 709.5e, 116); "When you unlock this door" triggers when that half is given its designation, entering included (CR 709.5h).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-rooms.ts, synthetic-layouts.ts).
import { describe, expect, test } from 'vitest';
import { type Action, getLegalActions, manaValue } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { viewOf } from './layout-helpers';

const WATCH = 'SYNTHETIC Watch Room // Vault Room'; // {1}{W}: whenever you gain life, each opponent loses 1 | {2}{B}: when you unlock this door, each opponent loses 2
const PLAIN = 'SYNTHETIC Plain Room // Bare Room'; // {W} | {1}{U}, no abilities
const SINGE = 'SYNTHETIC Singe // Mend'; // Mend {1}{W}: you gain 4 life
const STUDY = 'SYNTHETIC Study // Zap'; // two spell halves
const MIRROR = 'SYNTHETIC Mirror Wash';
const BOUNCE = 'SYNTHETIC Door Bounce';
const FILLER = ['Island', 'Island', 'Island'] as const;

type Builder = ReturnType<typeof scenario>;

const unlocks = (g: ScenarioGame): Action[] =>
  getLegalActions(g.state, 0).filter((a) => a.kind === 'unlockDoor');

/** Seat 0 (the active player, main phase) with `hand` and `battlefield`; seat 1 with 20 life. */
type Piece = string | readonly [string, { readonly unlocked: readonly number[] }];

function board(
  hand: readonly string[],
  pieces: readonly Piece[],
  at: Parameters<Builder['at']>[1] = { active: 0 },
  step: Parameters<Builder['at']>[0] = 'precombatMain',
): ScenarioGame {
  let mine = scenario()
    .seat(0)
    .life(20)
    .library(...FILLER)
    .hand(...hand);
  for (const piece of pieces) {
    mine = typeof piece === 'string' ? mine.battlefield(piece) : mine.battlefield(...piece);
  }
  return mine
    .seat(1)
    .life(20)
    .library(...FILLER)
    .at(step, at)
    .build();
}

describe('casting a half of a Room (CR 709.3, 709.5)', () => {
  test('either half is offered as a permanent spell, only when its own cost can be paid', () => {
    const one = board([WATCH], ['Plains', 'Plains']);
    one.expect.legal(0, { cast: WATCH, face: 0 }); // {1}{W}
    one.expect.illegal(0, { cast: WATCH, face: 1 }); // {2}{B}: no black mana
    const both = board([WATCH], ['Plains', 'Swamp', 'Plains']);
    both.expect.legal(0, { cast: WATCH, face: 0 });
    both.expect.legal(0, { cast: WATCH, face: 1 });
  });

  test('on the stack the spell is only the half that was cast: its name, mana cost and mana value', () => {
    const g = board([WATCH], ['Plains', 'Swamp', 'Plains']);
    g.act(0).cast(WATCH, { face: 1, pay: true });
    const v = viewOf(g, WATCH);
    expect(v.zone).toBe('stack');
    expect(v.name).toBe('Vault Room');
    expect(v.manaCost).toEqual(['2', 'B']);
    expect(manaValue(v.manaCost ?? [])).toBe(3); // CR 709.3b: the cost of that half only
    expect(v.colors).toEqual(['B']);
    expect(v.types).toEqual(['enchantment']);
    expect(v.subtypes).toEqual(['Room']);
  });

  test('outside the stack and the battlefield the card has both halves: two names and the combined cost (CR 709.4)', () => {
    const g = board([WATCH], []);
    const v = viewOf(g, WATCH);
    expect(v.name).toBe('Watch Room // Vault Room');
    expect(v.manaCost).toEqual(['1', 'W', '2', 'B']);
    expect(v.colors).toEqual(['W', 'B']);
    // CR 709.5a: the halves share one type line.
    expect(v.types).toEqual(['enchantment']);
    expect(v.subtypes).toEqual(['Room']);
  });

  test('a permanent spell is cast at sorcery speed (CR 307.1): not in combat, not with a spell on the stack', () => {
    const combat = board([WATCH], ['Plains', 'Plains'], { active: 0 }, 'beginningOfCombat');
    combat.expect.illegal(0, { cast: WATCH, face: 0 });
    const g = board([WATCH, BOUNCE], ['Plains', 'Plains', 'Island', PLAIN]);
    g.expect.legal(0, { cast: WATCH, face: 0 });
    g.act(0).cast(BOUNCE, { pay: true, targets: [PLAIN] });
    g.expect.illegal(0, { cast: WATCH, face: 0 });
  });

  test('the half that was cast is unlocked as the permanent enters; the other half is locked (CR 709.5d)', () => {
    const g = board([WATCH], ['Plains', 'Swamp', 'Plains']);
    g.act(0).cast(WATCH, { face: 0, pay: true });
    g.passAll();
    g.expect.zone(WATCH, 'battlefield', { seat: 0 });
    expect(g.state.objects[g.id(WATCH)]?.unlockedDoors).toEqual([0]);
    const v = viewOf(g, WATCH);
    expect(v.name).toBe('Watch Room'); // the locked half has no name (CR 709.5)
    expect(v.manaCost).toEqual(['1', 'W']);
    expect(v.colors).toEqual(['W']);
    expect(v.types).toEqual(['enchantment']);
    expect(v.subtypes).toEqual(['Room']);
  });

  test('the right half cast: the left half is the locked one', () => {
    const g = board([WATCH], ['Plains', 'Swamp', 'Plains']);
    g.act(0).cast(WATCH, { face: 1, pay: true });
    g.passAll();
    expect(g.state.objects[g.id(WATCH)]?.unlockedDoors).toEqual([1]);
    expect(viewOf(g, WATCH).name).toBe('Vault Room');
    expect(viewOf(g, WATCH).manaCost).toEqual(['2', 'B']);
  });

  test('a Room put onto the battlefield without being cast has neither half unlocked: no name, no mana cost, mana value 0', () => {
    const g = board([], [WATCH]);
    expect(g.state.objects[g.id(WATCH)]?.unlockedDoors).toBeUndefined();
    const v = viewOf(g, WATCH);
    expect(v.name).toBe('');
    expect(v.manaCost).toBeNull();
    expect(manaValue(v.manaCost ?? [])).toBe(0);
    expect(v.colors).toEqual([]);
    expect(v.types).toEqual(['enchantment']); // the shared type line stays
    expect(v.subtypes).toEqual(['Room']);
  });

  test('a split card with two spell halves is not a Room and gets no designation', () => {
    const g = board([STUDY], ['Island', 'Island']);
    g.act(0).cast(STUDY, { face: 0, pay: true });
    g.passAll();
    g.expect.zone(STUDY, 'graveyard', { seat: 0 });
    expect(g.state.objects[g.id(STUDY)]?.unlockedDoors).toBeUndefined();
  });
});

describe('a locked half has no rules text (CR 709.5)', () => {
  const gain = (g: ScenarioGame) => {
    g.act(0).cast(SINGE, { face: 1, pay: true });
    g.passAll();
  };

  test('the ability of an unlocked half works: gaining life makes each opponent lose 1', () => {
    const g = board([SINGE], ['Plains', 'Plains', [WATCH, { unlocked: [0] }]]);
    gain(g);
    g.expect.life(0, 24);
    g.expect.life(1, 19);
  });

  test('the same ability of a half that is locked does nothing', () => {
    const g = board([SINGE], ['Plains', 'Plains', [WATCH, { unlocked: [1] }]]);
    gain(g);
    g.expect.life(0, 24);
    g.expect.life(1, 20);
  });

  test('a Room with neither half unlocked has no abilities at all', () => {
    const g = board([SINGE], ['Plains', 'Plains', WATCH]);
    gain(g);
    g.expect.life(1, 20);
  });
});

describe('the special action: unlock a locked half (CR 709.5e)', () => {
  test('offered for each locked half the controller can pay for, at sorcery speed with an empty stack', () => {
    const g = board([], ['Swamp', 'Swamp', 'Swamp', 'Plains', [WATCH, { unlocked: [0] }]]);
    expect(unlocks(g)).toEqual([{ kind: 'unlockDoor', object: g.id(WATCH), door: 1 }]);
    g.expect.legal(0, { unlock: WATCH, door: 1 });
  });

  test('both halves of a Room with neither unlocked are offered, each at the price of its own mana cost', () => {
    const g = board([], ['Plains', 'Plains', 'Island', PLAIN]);
    expect(unlocks(g)).toEqual([
      { kind: 'unlockDoor', object: g.id(PLAIN), door: 0 },
      { kind: 'unlockDoor', object: g.id(PLAIN), door: 1 },
    ]);
  });

  test('not when the cost cannot be paid', () => {
    const g = board([], ['Swamp', 'Swamp', [WATCH, { unlocked: [0] }]]); // {2}{B}
    g.expect.illegal(0, { unlock: WATCH, door: 1 });
  });

  test('not a half that is already unlocked', () => {
    const g = board([], ['Plains', 'Plains', [WATCH, { unlocked: [0] }]]);
    g.expect.illegal(0, { unlock: WATCH, door: 0 });
  });

  test('not outside a main phase of your turn, nor with the stack not empty, nor on your opponent’s turn', () => {
    const lands: Piece[] = ['Swamp', 'Swamp', 'Swamp', 'Island', [WATCH, { unlocked: [0] }]];
    board([], lands, { active: 0 }, 'beginningOfCombat').expect.illegal(0, {
      unlock: WATCH,
      door: 1,
    });
    board([], lands, { active: 1 }).expect.illegal(0, { unlock: WATCH, door: 1 });
    const stacked = board(
      [BOUNCE],
      ['Swamp', 'Swamp', 'Swamp', 'Island', [WATCH, { unlocked: [0] }]],
    );
    stacked.expect.legal(0, { unlock: WATCH, door: 1 });
    stacked.act(0).cast(BOUNCE, { pay: true, targets: [WATCH] });
    expect(stacked.state.stack.length).toBe(1);
    stacked.expect.illegal(0, { unlock: WATCH, door: 1 });
  });

  test('not a Room of another player', () => {
    const g = scenario()
      .seat(0)
      .battlefield('Swamp', 'Swamp', 'Swamp')
      .seat(1)
      .battlefield(WATCH)
      .at('precombatMain', { active: 0 })
      .build();
    g.expect.illegal(0, { unlock: WATCH, door: 1 });
  });

  test('paying the cost unlocks the half: the mana is spent, the stack is not used and the player keeps priority', () => {
    const g = board([], ['Swamp', 'Swamp', 'Swamp', [WATCH, { unlocked: [0] }]]);
    g.act(0).unlock(WATCH, 1, { pay: true });
    expect(g.state.objects[g.id(WATCH)]?.unlockedDoors).toEqual([0, 1]);
    expect(g.state.pending?.kind).toBe('priority');
    expect(g.state.stack.length).toBeGreaterThanOrEqual(0);
    const v = viewOf(g, WATCH);
    expect(v.name).toBe('Watch Room // Vault Room'); // both halves are unlocked now
    g.expect.noEvent({ kind: 'spellCast' });
  });

  test('cancelling the payment changes nothing', () => {
    const g = board([], ['Swamp', 'Swamp', 'Swamp', [WATCH, { unlocked: [0] }]]);
    g.act(0).unlock(WATCH, 1).cancel();
    expect(g.state.objects[g.id(WATCH)]?.unlockedDoors).toEqual([0]);
    g.expect.legal(0, { unlock: WATCH, door: 1 });
  });
});

describe('"When you unlock this door" (CR 709.5h)', () => {
  test('triggers when the half is unlocked by the special action', () => {
    const g = board([], ['Swamp', 'Swamp', 'Swamp', [WATCH, { unlocked: [0] }]]);
    g.act(0).unlock(WATCH, 1, { pay: true });
    g.passAll();
    g.expect.life(1, 18);
  });

  test('triggers when the permanent enters because that half was cast', () => {
    const g = board([WATCH], ['Plains', 'Swamp', 'Plains']);
    g.act(0).cast(WATCH, { face: 1, pay: true });
    g.passAll();
    g.expect.zone(WATCH, 'battlefield', { seat: 0 });
    g.passAll();
    g.expect.life(1, 18);
  });

  test('does not trigger when the other half is the one unlocked', () => {
    const g = board([WATCH], ['Plains', 'Swamp', 'Plains']);
    g.act(0).cast(WATCH, { face: 0, pay: true });
    g.passAll();
    g.passAll();
    g.expect.life(1, 20);
  });

  test('is an ability of its half: unlocking the other half does not trigger it', () => {
    const g = board([], ['Plains', 'Plains', [WATCH, { unlocked: [1] }]]);
    g.act(0).unlock(WATCH, 0, { pay: true });
    g.passAll();
    g.expect.life(1, 20);
  });

  test('does not trigger for a Room that enters with neither half unlocked', () => {
    const g = board([], [WATCH]);
    g.expect.life(1, 20);
    expect(g.state.stack.length).toBe(0);
  });
});

describe('copiable values and zone changes (CR 709.5b, 709.5c, 400.7)', () => {
  test('a copy has both halves, and is locked or unlocked by its own designations, not the original’s', () => {
    const g = board([MIRROR], ['Island', [PLAIN, { unlocked: [0] }], [WATCH, { unlocked: [1] }]]);
    g.act(0).cast(MIRROR, { pay: true, targets: [PLAIN, WATCH] });
    g.passAll();
    const v = viewOf(g, PLAIN);
    // Plain Room is a copy of Watch Room // Vault Room with its own unlocked left half: the left half of the copied card is Watch Room.
    expect(v.name).toBe('Watch Room');
    expect(v.manaCost).toEqual(['1', 'W']);
    expect(g.state.objects[g.id(PLAIN)]?.unlockedDoors).toEqual([0]);
    // The original keeps its own: its right half.
    expect(viewOf(g, WATCH).name).toBe('Vault Room');
  });

  test('a copy of a Room with the unlock trigger of the unlocked half keeps the ability with its door', () => {
    const g = board(
      [MIRROR],
      ['Island', 'Swamp', 'Swamp', 'Swamp', [PLAIN, { unlocked: [0] }], [WATCH, { unlocked: [0] }]],
    );
    g.act(0).cast(MIRROR, { pay: true, targets: [PLAIN, WATCH] });
    g.passAll();
    // The copy is Watch // Vault with the left half unlocked; unlocking its right half triggers the copied ability of that half.
    g.act(0).unlock(PLAIN, 1, { pay: true });
    g.passAll();
    g.expect.life(1, 18);
  });

  test('a Room that leaves the battlefield is a new object: it has no designation when it is cast again', () => {
    const g = board([BOUNCE], ['Island', [WATCH, { unlocked: [0] }]]);
    g.act(0).cast(BOUNCE, { pay: true, targets: [WATCH] });
    g.passAll();
    g.expect.zone(WATCH, 'hand', { seat: 0 });
    expect(g.state.objects[g.id(WATCH)]?.unlockedDoors).toBeUndefined();
    expect(viewOf(g, WATCH).name).toBe('Watch Room // Vault Room');
  });
});
