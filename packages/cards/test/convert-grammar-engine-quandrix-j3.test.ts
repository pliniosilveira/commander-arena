// Yavimaya Bloomsage // Channel (the Quandrix Unlimited deck): the REAL Oracle text of the golden corpus goes through the grammar with no override and is played through applyAction.
// "Then if that creature has power 7 or greater, ~ becomes prepared" is an `objectMatches` power test on the target the counter went on, in a `conditional` effect (CR 608.2c, 208.1),
// whose effect is the engine's `prepare` (CR 722.3a: a permanent with a prepare spell becomes prepared). The repository's CR text was not available while this was written: the rules are cited
// as the code already cites them.
import { readFileSync } from 'node:fs';
import type { CardDefinition } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';
import { dropped, readAll } from './parser-p5-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);
const NAME = 'Yavimaya Bloomsage // Channel';

function real(): CardDefinition {
  const card = GOLDEN.find((c) => c.name === NAME);
  if (card === undefined) throw new Error(`${NAME} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  // Both faces read whole: face 0 (Yavimaya Bloomsage) with the prepare line of this group, face 1 (Channel) with the mana ability the player is granted for the turn.
  expect(imported.support.unparsed).toEqual([]);
  expect(imported.support.status).toBe('supported');
  return imported.definition;
}

describe('the grammar', () => {
  const TEXT =
    'At the beginning of your end step, put a +1/+1 counter on target creature you control. Then if that creature has power 7 or greater, ~ becomes prepared.';

  test('reads the counter and the conditional prepare', () => {
    const [ability] = readAll(TEXT).abilities;
    expect(ability).toMatchObject({
      kind: 'triggered',
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'addCounters', counter: '+1/+1' },
          {
            kind: 'conditional',
            condition: {
              kind: 'objectMatches',
              of: { kind: 'target' },
              filter: { power: { cmp: 'atLeast', value: 7 } },
            },
            effect: { kind: 'prepare', objects: { kind: 'this' } },
          },
        ],
      },
    });
  });

  test('near misses are dropped whole', () => {
    expect(dropped(TEXT.replace('power 7 or greater', 'power seven or greater'))).not.toEqual([]);
    expect(dropped(TEXT.replace('that creature has', 'that player has'))).not.toEqual([]);
  });
});

describe('the engine', () => {
  const bloomsage = real();
  const FRONT = NAME;
  const LIBRARY = Array.from({ length: 8 }, () => 'Forest');
  const play = (counters: number) => {
    const b = scenario().define(bloomsage);
    b.seat(0)
      .library(...LIBRARY)
      .battlefield(FRONT, { counters: { '+1/+1': counters }, label: 'bloom' });
    b.seat(1).library(...LIBRARY);
    const g = b.at('postcombatMain', { active: 0, priority: 0 }).build();
    g.passAll();
    g.passAll();
    return g;
  };
  const prepared = (g: ReturnType<typeof play>) =>
    Object.values(g.state.objects).some((o) => o.prepareOf !== undefined);

  test('power 6 before the counter: it reaches 7 and becomes prepared', () => {
    const g = play(4);
    g.expect.counters('bloom', { '+1/+1': 5 });
    g.expect.pt('bloom', 7, 7);
    expect(prepared(g)).toBe(true);
    g.expect.invariants();
  });

  test('power 5 before the counter: it reaches 6 and does not become prepared', () => {
    const g = play(3);
    g.expect.pt('bloom', 6, 6);
    expect(prepared(g)).toBe(false);
  });
});
