// The earthbend cards of the Toph deck, with their REAL Oracle text (the card data of the deck support issue, in the golden corpus): the text goes through the grammar as a card with no
// override, and is played through applyAction in games of two, three and four seats. The behaviour of earthbend itself is pinned in the engine's scenario-xx-earthbend.test.ts (the
// rulings of 2025-10-02, no Comprehensive Rules number exists for it in this repository).
import { readFileSync } from 'node:fs';
import { type CardDefinition, getView, validateCard } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const RECORDS = readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8')
  .split('\n')
  .filter((line) => line.includes('issue #692'))
  .map((line) => JSON.parse(line) as { name: string });

function real(name: string): CardDefinition {
  const record = RECORDS.find((r) => r.name === name);
  if (record === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(record as never), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed).toEqual([]);
  expect(imported.support.status).toBe('supported');
  expect(validateCard(imported.definition)).toEqual([]);
  return imported.definition;
}

const BADGERMOLE = 'Badgermole';
const RUMBLE = 'Earth Rumble';
const TOPH = 'Toph, Hardheaded Teacher';
const LESSON = 'Earthbending Lesson';
const ROCKALANCHE = 'Rockalanche';
const BEARS = 'Grizzly Bears';

/** Answers every question with the first choice; a target question takes the first legal target of each slot. */
function settle(g: ScenarioGame): void {
  for (let i = 0; i < 60; i += 1) {
    const d = g.state.pending;
    if (d?.kind === 'confirmOptional') g.act(d.seat).decline();
    else if (d?.kind === 'targets') {
      g.act(d.seat).choose({
        kind: 'chooseTargets',
        targets: d.specs.flatMap((spec) => {
          const first = spec.legal[0];
          if (first === undefined) return [];
          return [
            first.kind === 'player'
              ? { kind: 'player' as const, seat: first.seat, specId: spec.specId }
              : { kind: 'object' as const, id: first.id, specId: spec.specId },
          ];
        }),
      });
    } else if (g.state.stack.length === 0 && d?.kind === 'priority') return;
    else g.pass();
  }
  throw new Error('the stack did not settle');
}

const landCreatures = (g: ScenarioGame, seat = 0) =>
  getView(g.state, seat).battlefield.filter(
    (o) => o.controller === 0 && o.types.includes('land') && o.types.includes('creature'),
  );

function table(
  seats: 2 | 3 | 4,
  cards: CardDefinition[],
  build: (b: ReturnType<typeof scenario>) => ReturnType<typeof scenario>,
) {
  let b = scenario({ seats });
  for (const c of cards) b = b.define(c);
  b = build(b);
  for (let s = 1; s < seats; s += 1) b = b.seat(s).battlefield(BEARS);
  return b.at('precombatMain').build();
}

describe('Badgermole: when it enters, earthbend 2; creatures with +1/+1 counters have trample', () => {
  for (const seats of [2, 3, 4] as const) {
    test(`${seats} seats: a land of the controller becomes a 2/2 haste land creature with trample`, () => {
      const g = table(seats, [real(BADGERMOLE)], (b) =>
        b.seat(0).hand(BADGERMOLE).battlefield('Forest', { count: 5 }),
      );
      g.act(0).cast(BADGERMOLE, { pay: true });
      settle(g);
      const lands = landCreatures(g);
      expect(lands).toHaveLength(1);
      expect(lands[0]?.power).toBe(2);
      g.expect.derived(lands[0]?.id ?? 'none', { keywords: ['haste', 'trample'] });
      for (let s = 1; s < seats; s += 1) {
        expect(
          getView(g.state, s).battlefield.filter(
            (o) => o.controller === s && o.types.includes('land'),
          ),
        ).toHaveLength(0);
      }
    });
  }
});

describe('Rockalanche: earthbend X, where X is the number of Forests you control', () => {
  test('five Forests: the land is a 5/5', () => {
    const g = table(2, [real(ROCKALANCHE)], (b) =>
      b.seat(0).hand(ROCKALANCHE).battlefield('Forest', { count: 5 }),
    );
    g.act(0).cast(ROCKALANCHE, { targets: ['Forest[1]'], pay: true });
    settle(g);
    expect(landCreatures(g)[0]?.power).toBe(5);
  });
});

describe('Earth Rumble: earthbend 2, then up to one creature you control fights a creature an opponent controls', () => {
  for (const seats of [2, 3, 4] as const) {
    test(`${seats} seats: the new land creature fights an opponent's 2/2`, () => {
      const g = table(seats, [real(RUMBLE)], (b) =>
        b.seat(0).hand(RUMBLE).battlefield('Forest', { count: 6 }),
      );
      g.act(0).cast(RUMBLE, { targets: ['Forest[1]'], pay: true });
      settle(g);
      // the 2/2 land and the 2/2 Bears dealt each other lethal damage: both are gone (the land returns tapped from the delayed ability, a fresh object that is no creature)
      expect(landCreatures(g)).toHaveLength(0);
      expect(
        getView(g.state, 1).battlefield.filter((o) => o.controller === 1 && o.name === BEARS),
      ).toHaveLength(0);
      expect(
        getView(g.state, 0).battlefield.filter((o) => o.controller === 0 && o.name === 'Forest'),
      ).toHaveLength(6);
    });
  }
});

describe('Toph, Hardheaded Teacher: whenever you cast a spell, earthbend 1; a Lesson gets one more counter', () => {
  test('casting a Lesson puts two counters on the land the trigger targets, a plain spell one', () => {
    const g = table(3, [real(TOPH), real(LESSON)], (b) =>
      b.seat(0).battlefield(TOPH).hand(LESSON).battlefield('Forest', { count: 5 }),
    );
    g.act(0).cast(LESSON, { targets: ['Forest[1]'], pay: true });
    settle(g);
    const counters = landCreatures(g)
      .map((o) => o.counters['+1/+1'] ?? 0)
      .sort();
    // earthbend 1 plus the Lesson's extra counter on one land, earthbend 4 of the Lesson itself on the first legal land
    expect(counters.reduce((a, b) => a + b, 0)).toBe(2 + 4);
  });
});
