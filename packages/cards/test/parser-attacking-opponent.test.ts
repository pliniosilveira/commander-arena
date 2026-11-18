// Issue 89 (Silverquill Influence), "each other creature that's attacking one of your opponents gets +1/+1 until end of turn" (D-650; Martial Impetus) read through the whole
// pipeline: the real line, the node it lowers to, SYNTHETIC variants and the near misses the grammar must not read.
// The engine runs what is lowered in packages/engine/test/scenario-xx-attacking-opponent-players.test.ts.
import { describe, expect, test } from 'vitest';
import { dropped, readAll } from './parser-p5-helpers';

const line =
  "Whenever enchanted creature attacks, each other creature that's attacking one of your opponents gets +1/+1 until end of turn.";
const aura = (text: string) =>
  readAll(`Enchant creature\n${text}`, 'enchantment', ['Aura']).abilities;

describe('"each other creature that\'s attacking one of your opponents gets +1/+1 until end of turn" (CR 508.1b)', () => {
  test('the real third line of Martial Impetus', () => {
    expect(aura(line)[1]).toEqual({
      kind: 'triggered',
      trigger: { kind: 'attacks', what: { kind: 'attached' } },
      effect: {
        kind: 'modifyPt',
        objects: {
          kind: 'each',
          filter: { zone: 'battlefield', types: ['creature'], attackingOpponents: 'players' },
          except: { kind: 'triggerSubject' },
        },
        power: 1,
        toughness: 1,
        duration: 'untilEndOfTurn',
      },
    });
  });

  test.each([
    [
      "Whenever enchanted creature attacks, each creature that's attacking one of your opponents gets +1/+1 until end of turn.",
    ],
    [
      "Whenever enchanted creature attacks, each other creature that's attacking one of your opponents gets +1/+1.",
    ],
    [
      "Whenever enchanted creature attacks, each other creature that's attacking your opponents gets +1/+1 until end of turn.",
    ],
  ])('is dropped, never half read (SYNTHETIC): %s', (text) => {
    expect(dropped(`Enchant creature\n${text}`, 'enchantment', ['Aura']).stoppedAt).toBeDefined();
  });
});
