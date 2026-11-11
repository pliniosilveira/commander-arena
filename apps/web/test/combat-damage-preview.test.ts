/** The passing damage of the declare blockers question (issue 106): per defender, as the blocks are picked. */
import type {
  DeclareBlockersDecision,
  GameView,
  ObjectId,
  ObjectView,
} from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import type { BlockPick } from '../src/ui/decisions/block';
import {
  passingDamage,
  passingHeadline,
  passingRemaining,
  throughDamage,
} from '../src/ui/decisions/combat-damage-preview';

const creature = (
  id: ObjectId,
  power: number,
  toughness: number,
  patch: Partial<ObjectView> = {},
) =>
  ({
    id,
    name: `Creature ${id}`,
    controller: 1,
    types: ['creature'],
    keywords: [],
    damage: 0,
    counters: {},
    power,
    toughness,
    ...patch,
  }) as unknown as ObjectView;

const walker = (loyalty: number) =>
  ({
    id: 'o20' as ObjectId,
    name: 'Jace',
    controller: 0,
    types: ['planeswalker'],
    keywords: [],
    damage: 0,
    counters: { loyalty },
    power: null,
    toughness: null,
  }) as unknown as ObjectView;

function view(objects: ObjectView[], life = 40, poison = 0): GameView {
  return {
    viewer: 0,
    battlefield: objects,
    stack: [],
    exile: [],
    seats: [
      { id: 0, life, poison, hand: [], graveyard: [], command: [] },
      { id: 1, life: 40, poison: 0, hand: null, graveyard: [], command: [] },
    ],
  } as unknown as GameView;
}

const player = { kind: 'player', seat: 0 } as const;
const atk = (
  attacker: ObjectId,
  target: DeclareBlockersDecision['attackers'][number]['target'],
) => ({
  attacker,
  target,
  minBlockers: 1,
});

describe('throughDamage', () => {
  test('an unblocked attacker puts its power through, twice with double strike', () => {
    expect(throughDamage(creature('o1', 3, 3), [])).toEqual({ amount: 3, how: 'open' });
    expect(throughDamage(creature('o1', 3, 3, { keywords: ['doubleStrike'] }), []).amount).toBe(6);
  });

  test('a blocked attacker without trample puts nothing through', () => {
    expect(throughDamage(creature('o1', 5, 5), [creature('o2', 1, 1)]).amount).toBe(0);
  });

  test('a trampler puts through what is left over lethal to its blockers, damage marked counted', () => {
    const t = creature('o1', 6, 6, { keywords: ['trample'] });
    expect(throughDamage(t, [creature('o2', 1, 4)]).amount).toBe(2);
    expect(throughDamage(t, [creature('o2', 1, 4), creature('o3', 1, 3)]).amount).toBe(0);
    expect(throughDamage(t, [creature('o2', 1, 4, { damage: 3 })]).amount).toBe(5);
  });

  test('deathtouch makes one point lethal to each blocker', () => {
    const t = creature('o1', 4, 4, { keywords: ['trample', 'deathtouch'] });
    expect(throughDamage(t, [creature('o2', 1, 9), creature('o3', 1, 9)]).amount).toBe(2);
  });

  test('double strike with trample lets the second strike past blockers the first killed', () => {
    const t = creature('o1', 3, 3, { keywords: ['trample', 'doubleStrike'] });
    // First strike: 3 to a 2-toughness blocker, 1 over; second strike: 3 over.
    expect(throughDamage(t, [creature('o2', 1, 2)]).amount).toBe(4);
  });

  test('a blocker whose toughness is unknown soaks nothing', () => {
    const t = creature('o1', 3, 3, { keywords: ['trample'] });
    expect(throughDamage(t, [creature('o2', 1, 1, { toughness: null })]).amount).toBe(3);
  });
});

describe('passingDamage', () => {
  const objects = [
    creature('o1', 3, 3),
    creature('o2', 4, 4, { keywords: ['trample'] }),
    creature('o3', 2, 2),
    creature('o11', 1, 2, { controller: 0 }),
    creature('o12', 1, 1, { controller: 0 }),
    walker(5),
  ];
  const decision = {
    attackers: [
      atk('o1', player),
      atk('o2', player),
      atk('o3', { kind: 'permanent', object: 'o20' }),
    ],
  };

  test('with no blocks everything passes, per defender', () => {
    const result = passingDamage(view(objects), decision, []);
    expect(result).toHaveLength(2);
    const [me, jace] = result;
    expect(me).toMatchObject({
      label: 'You',
      damage: 7,
      current: 40,
      remaining: 33,
      lethal: false,
    });
    expect(me?.sources.map((s) => [s.name, s.amount])).toEqual([
      ['Creature o1', 3],
      ['Creature o2', 4],
    ]);
    expect(jace).toMatchObject({
      label: 'Jace',
      damage: 2,
      current: 5,
      remaining: 3,
      stat: 'loyalty',
    });
  });

  test('a block takes the blocked attacker out, a block on a trampler leaves the excess', () => {
    const blocks: BlockPick[] = [
      { blocker: 'o11', attacker: 'o1' },
      { blocker: 'o12', attacker: 'o2' },
    ];
    const [me, jace] = passingDamage(view(objects), decision, blocks);
    expect(me?.damage).toBe(3);
    expect(me?.sources).toEqual([{ object: 'o2', name: 'Creature o2', amount: 3, how: 'trample' }]);
    expect(jace?.damage).toBe(2);
  });

  test('a defender with nothing passing is left out', () => {
    const blocks: BlockPick[] = [
      { blocker: 'o11', attacker: 'o1' },
      { blocker: 'o12', attacker: 'o3' },
    ];
    const result = passingDamage(
      view(objects),
      { attackers: decision.attackers.slice(0, 1) },
      blocks,
    );
    expect(result).toEqual([]);
  });

  test('damage equal to the life total, or to the loyalty, is lethal', () => {
    expect(passingDamage(view(objects, 7), decision, [])[0]?.lethal).toBe(true);
    expect(passingDamage(view(objects, 8), decision, [])[0]?.lethal).toBe(false);
    const heavy = { attackers: [atk('o1', { kind: 'permanent', object: 'o20' })] };
    expect(passingDamage(view([creature('o1', 5, 5), walker(5)]), heavy, [])[0]?.lethal).toBe(true);
  });

  test('infect damage to a player is poison, not life loss', () => {
    const toxic = creature('o1', 3, 3, { keywords: ['infect'] });
    const result = passingDamage(view([toxic], 40, 6), { attackers: [atk('o1', player)] }, []);
    expect(result[0]).toMatchObject({ damage: 0, poison: 3, remaining: 40, lethal: false });
    const lethal = passingDamage(view([toxic], 40, 7), { attackers: [atk('o1', player)] }, []);
    expect(lethal[0]?.lethal).toBe(true);
    expect(passingHeadline(lethal[0] as NonNullable<(typeof lethal)[0]>)).toBe('You get 3 poison');
  });

  test('the words: "You take 7", "Life 40 to 33", the planeswalker by name', () => {
    const [me, jace] = passingDamage(view(objects), decision, []);
    expect(me && passingHeadline(me)).toBe('You take 7');
    expect(me && passingRemaining(me)).toBe('Life 40 to 33');
    expect(jace && passingHeadline(jace)).toBe('Jace takes 2');
    expect(jace && passingRemaining(jace)).toBe('Loyalty 5 to 3');
  });
});
