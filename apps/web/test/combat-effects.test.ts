/**
 * What the combat animation layer draws (issue 9, D-228): the beats of a snapshot's steps, their
 * order, stagger, cap and speed, and the two settings.
 */
import type { GameEvent, GameView } from '@commander-arena/engine';
import { afterEach, describe, expect, test } from 'vitest';
import type { AppliedStep } from '../src/game/protocol';
import {
  type Beat,
  combatBeats,
  MAX_BEATS,
  MAX_LUNGERS,
  planCombat,
  scheduleBeats,
  TIMING,
} from '../src/ui/board/combat-effects';
import {
  currentAnimationSpeed,
  currentCombatAnimations,
  motionAllowed,
  readStoredAnimationSpeed,
  readStoredCombatAnimations,
  SPEED_FACTOR,
  setAnimationSpeed,
  setCombatAnimations,
} from '../src/ui/panels/animations';

const step = (...events: GameEvent[]): AppliedStep => ({
  seat: 0,
  action: { kind: 'pass' },
  events,
});
const damage = (
  source: `o${number}`,
  to: Extract<GameEvent, { kind: 'damageDealt' }>['to'],
  amount: number,
  combat = true,
) => ({ kind: 'damageDealt', source, to, amount, combat }) as GameEvent;
const player = (seat: number) => ({ kind: 'player', seat }) as const;
const object = (id: `o${number}`) => ({ kind: 'object', id }) as const;
/** Seat 1 attacks with o1 and o3 (the active seat); seat 0 blocks with o2. o5 is a planeswalker of seat 0. */
const before = {
  activeSeat: 1,
  combat: {
    attackers: [
      { object: 'o1', target: { kind: 'player', seat: 0 }, blocked: true, blockedBy: ['o2'] },
      { object: 'o3', target: { kind: 'player', seat: 0 }, blocked: false, blockedBy: [] },
    ],
  },
  battlefield: [
    { id: 'o1', name: 'Grizzly Bears', controller: 1, types: ['creature'] },
    { id: 'o2', name: 'Serra Angel', controller: 0, types: ['creature'] },
    { id: 'o3', name: 'Hill Giant', controller: 1, types: ['creature'] },
    { id: 'o5', name: 'Jace', controller: 0, types: ['planeswalker'] },
  ],
} as unknown as GameView;
const kinds = (beats: readonly Beat[]) => beats.map((b) => b.kind);

describe('combatBeats', () => {
  test('damage to the same recipient in one step is one beat, to others their own', () => {
    const beats = combatBeats(
      [step(damage('o1', player(0), 2), damage('o3', player(0), 4), damage('o1', object('o2'), 2))],
      before,
    );
    expect(beats.map((e) => (e.kind === 'hit' ? [e.to, e.amount, e.sources] : e.kind))).toEqual([
      [player(0), 6, ['o1', 'o3']],
      [object('o2'), 2, ['o1']],
    ]);
  });

  test('damage of zero shows nothing, and two steps keep their beats apart', () => {
    const beats = combatBeats(
      [
        step(damage('o1', player(1), 0)),
        step(damage('o1', player(1), 3)),
        step(damage('o1', player(1), 1)),
      ],
      before,
    );
    expect(beats).toHaveLength(2);
    expect(new Set(beats.map((e) => e.key)).size).toBe(2);
  });

  test('the attackers hit first, then the blockers, then what follows, then the deaths', () => {
    const beats = combatBeats(
      [
        step(
          { kind: 'died', object: 'o1', card: null },
          { kind: 'lifeGained', seat: 1, amount: 2, nth: 1 },
          damage('o2', object('o1'), 4),
          damage('o1', object('o2'), 2),
          damage('o3', player(0), 3),
        ),
      ],
      before,
    );
    expect(kinds(beats)).toEqual(['hit', 'hit', 'hit', 'gain', 'died']);
    const hits = beats.flatMap((b) => (b.kind === 'hit' ? [b.sources[0]] : []));
    // o1 and o3 attack; the blocker o2 hits last of the three.
    expect(hits).toEqual(['o1', 'o3', 'o2']);
  });

  test('a creature that died is named from the view before; one that was not there is left out', () => {
    const beats = combatBeats(
      [
        step(
          { kind: 'died', object: 'o2', card: null },
          { kind: 'died', object: 'o9', card: null },
        ),
      ],
      before,
    );
    expect(beats).toEqual([{ kind: 'died', key: 'd0-o2', id: 'o2', name: 'Serra Angel' }]);
    expect(combatBeats([step({ kind: 'died', object: 'o2', card: null })], null)).toEqual([]);
  });

  test('lifelink, a loss with the damage, infect and a planeswalker look different', () => {
    const lifelink = combatBeats(
      [
        step(
          damage('o1', player(0), 3),
          { kind: 'lifeChanged', seat: 0, from: 40, to: 37 },
          { kind: 'lifeGained', seat: 1, amount: 3, nth: 1 },
          { kind: 'lifeChanged', seat: 1, from: 20, to: 23 },
        ),
      ],
      before,
    );
    expect(lifeLinkShape(lifelink)).toEqual(['hit:3', 'gain:3']);
    const loss = combatBeats(
      [
        step(
          damage('o1', player(0), 3),
          { kind: 'lifeChanged', seat: 0, from: 40, to: 37 },
          { kind: 'lifeChanged', seat: 0, from: 37, to: 36 },
        ),
      ],
      before,
    );
    expect(lifeLinkShape(loss)).toEqual(['hit:3', 'loss:1']);
    const infect = combatBeats(
      [step(damage('o1', player(0), 2), { kind: 'poisonChanged', seat: 0, from: 0, to: 2 })],
      before,
    );
    expect(infect).toMatchObject([{ kind: 'hit', poison: true, amount: 2 }]);
    const walker = combatBeats([step(damage('o1', object('o5'), 3))], before);
    expect(walker).toMatchObject([{ kind: 'hit', loyalty: true, amount: 3 }]);
  });

  test('life changes outside a step that dealt damage draw nothing (paying life is not combat)', () => {
    expect(
      combatBeats(
        [
          step(
            { kind: 'lifeChanged', seat: 0, from: 40, to: 38 },
            { kind: 'lifeGained', seat: 0, amount: 2, nth: 1 },
          ),
        ],
        before,
      ),
    ).toEqual([]);
  });

  test('spell damage has no lunge, and a board wipe is capped', () => {
    const [spell] = combatBeats([step(damage('o9', player(0), 3, false))], before);
    expect(spell).toMatchObject({ kind: 'hit', sources: [] });
    const many = Array.from({ length: 60 }, (_, i) => damage('o1', object(`o${100 + i}`), 1));
    expect(combatBeats([step(...many)], before)).toHaveLength(MAX_BEATS);
    const crowd = Array.from({ length: 9 }, (_, i) => damage(`o${200 + i}`, player(0), 1));
    const [one] = combatBeats([step(...crowd)], before);
    expect(one?.kind === 'hit' ? one.sources.length : 0).toBe(MAX_LUNGERS);
  });
});

function lifeLinkShape(beats: readonly Beat[]): string[] {
  return beats.map((b) => `${b.kind}:${'amount' in b ? b.amount : ''}`);
}

describe('scheduleBeats', () => {
  const hit = (id: `o${number}`, sources: `o${number}`[] = ['o1']): Beat => ({
    kind: 'hit',
    key: `h-${id}`,
    to: object(id),
    amount: 2,
    poison: false,
    loyalty: false,
    sources,
  });
  const died = (id: `o${number}`): Beat => ({ kind: 'died', key: `d-${id}`, id, name: id });

  test('a hit lasts 1.5 to 2 s and a death about 2 s at Normal speed', () => {
    const lunge = scheduleBeats([hit('o2')], 1).beats[0];
    const plain = scheduleBeats([hit('o2', [])], 1).beats[0];
    const death = scheduleBeats([died('o2')], 1).beats[0];
    expect(lunge?.duration).toBe(1800);
    expect(plain?.duration).toBe(1500);
    expect(death?.duration).toBe(2000);
    // The blow lands after a visible anticipation, not at once.
    expect(lunge?.impact).toBeGreaterThanOrEqual(400);
  });

  test('beats start a stagger apart, in the order given', () => {
    const { beats } = scheduleBeats([hit('o2'), hit('o3'), hit('o4')], 1);
    expect(beats.map((b) => b.start)).toEqual([0, 450, 900]);
    expect(TIMING.stagger).toBeGreaterThanOrEqual(300);
  });

  test('a death waits for the hit that kills it to land', () => {
    const { beats } = scheduleBeats([hit('o2'), died('o2')], 1);
    const [first, second] = beats;
    expect(second?.start).toBeGreaterThanOrEqual((first?.start ?? 0) + (first?.impact ?? 0));
    expect(second?.start).toBe(500 + 250);
    // With no hit before it a death starts in its turn.
    expect(scheduleBeats([hit('o3'), died('o2')], 1).beats[1]?.start).toBe(450);
  });

  test('one snapshot ends by the cap, and the tail of a big combat plays together', () => {
    const many = Array.from({ length: 12 }, (_, i) => hit(`o${10 + i}`));
    const plan = scheduleBeats([...many, died('o30')], 1); // o30 was not hit: nothing holds it back
    expect(plan.totalMs).toBeLessThanOrEqual(TIMING.cap);
    const late = plan.beats.filter((b) => b.start + b.duration === plan.totalMs);
    expect(late.length).toBeGreaterThan(1);
    expect(plan.beats.every((b) => b.start + b.duration <= TIMING.cap)).toBe(true);
  });

  test('a few beats are not squeezed: the cap only bites on a long queue', () => {
    const plan = scheduleBeats([hit('o2'), hit('o3'), died('o2'), died('o3')], 1);
    expect(plan.beats.map((b) => b.start)).toEqual([0, 450, 900, 1350]);
    expect(plan.totalMs).toBe(3350);
  });

  test('Fast halves every time and Slow multiplies them by one and a half', () => {
    const beats = [hit('o2'), hit('o3'), died('o2')];
    const normal = scheduleBeats(beats, SPEED_FACTOR.normal);
    const fast = scheduleBeats(beats, SPEED_FACTOR.fast);
    const slow = scheduleBeats(beats, SPEED_FACTOR.slow);
    expect(fast.totalMs).toBeCloseTo(normal.totalMs * 0.5, -1);
    expect(slow.totalMs).toBeCloseTo(normal.totalMs * 1.5, -1);
    expect(fast.beats[0]?.duration).toBe(900);
    expect(slow.beats[0]?.duration).toBe(2700);
    // The cap scales too.
    const wipe = Array.from({ length: 20 }, (_, i) => hit(`o${10 + i}`));
    expect(scheduleBeats(wipe, 0.5).totalMs).toBeLessThanOrEqual(TIMING.cap * 0.5);
    expect(scheduleBeats(wipe, 1.5).totalMs).toBeLessThanOrEqual(TIMING.cap * 1.5);
  });

  test('planCombat is the beats scheduled', () => {
    const steps = [step(damage('o1', object('o2'), 2), { kind: 'died', object: 'o2', card: null })];
    const plan = planCombat(steps, before, 1);
    expect(plan.beats.map((b) => b.kind)).toEqual(['hit', 'died']);
    expect(plan.totalMs).toBeGreaterThan(2000);
    expect(planCombat([], before, 1)).toEqual({ beats: [], totalMs: 0 });
  });
});

type Storage = { getItem(k: string): string | null; setItem(k: string, v: string): void };
function fakeWindow(store: Map<string, string> | null, reduced = false) {
  const localStorage: Storage =
    store === null
      ? {
          getItem() {
            throw new Error('blocked');
          },
          setItem() {
            throw new Error('blocked');
          },
        }
      : { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => void store.set(k, v) };
  Object.assign(globalThis, {
    window: { localStorage, matchMedia: () => ({ matches: reduced }) },
  });
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'window');
  setCombatAnimations(true, false);
  setAnimationSpeed('normal', false);
});

describe('the Combat animations setting', () => {
  test('is on until the player turns it off, and the choice is remembered', () => {
    const store = new Map<string, string>();
    fakeWindow(store);
    expect(currentCombatAnimations()).toBe(true);
    expect(readStoredCombatAnimations()).toBeNull();
    setCombatAnimations(false, true);
    expect(currentCombatAnimations()).toBe(false);
    expect(store.get('commander-arena.combat-animations')).toBe('off');
    expect(readStoredCombatAnimations()).toBe(false);
    setCombatAnimations(true, true);
    expect(readStoredCombatAnimations()).toBe(true);
  });

  test('works without storage', () => {
    fakeWindow(null);
    expect(readStoredCombatAnimations()).toBeNull();
    expect(() => setCombatAnimations(false, true)).not.toThrow();
    expect(currentCombatAnimations()).toBe(false);
  });

  test('reduced motion turns the effects off whatever the setting says', () => {
    fakeWindow(new Map(), true);
    expect(motionAllowed()).toBe(false);
    fakeWindow(new Map(), false);
    expect(motionAllowed()).toBe(true);
    Reflect.deleteProperty(globalThis, 'window');
    expect(motionAllowed()).toBe(true);
  });
});

describe('the Animation speed setting', () => {
  test('is Normal until the player picks another, and the choice is remembered', () => {
    const store = new Map<string, string>();
    fakeWindow(store);
    expect(currentAnimationSpeed()).toBe('normal');
    expect(readStoredAnimationSpeed()).toBeNull();
    setAnimationSpeed('slow', true);
    expect(currentAnimationSpeed()).toBe('slow');
    expect(store.get('commander-arena.animation-speed')).toBe('slow');
    expect(readStoredAnimationSpeed()).toBe('slow');
    setAnimationSpeed('fast', true);
    expect(readStoredAnimationSpeed()).toBe('fast');
  });

  test('a stored value that is not a speed is ignored, and storage may be blocked', () => {
    fakeWindow(new Map([['commander-arena.animation-speed', 'turbo']]));
    expect(readStoredAnimationSpeed()).toBeNull();
    fakeWindow(null);
    expect(readStoredAnimationSpeed()).toBeNull();
    expect(() => setAnimationSpeed('slow', true)).not.toThrow();
    expect(currentAnimationSpeed()).toBe('slow');
  });

  test('Fast is half and Slow is one and a half times Normal', () => {
    expect(SPEED_FACTOR).toEqual({ fast: 0.5, normal: 1, slow: 1.5 });
  });
});
