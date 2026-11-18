// Issue 89 (Silverquill Influence), "creatures your opponents control lose hexproof and shroud and can't have hexproof or shroud" (D-649): the activated ability of Arcane
// Lighthouse read through the whole pipeline, the node it lowers to, SYNTHETIC variants and the near misses the grammar must not read.
// The engine runs what is lowered in packages/engine/test/scenario-xx-lose-hexproof.test.ts.
import { describe, expect, test } from 'vitest';
import { dropped, readAll } from './parser-p5-helpers';

const LOSE = {
  kind: 'loseHexproofShroud',
  objects: {
    kind: 'each',
    filter: { types: ['creature'], controller: 'opponent', zone: 'battlefield' },
  },
  duration: 'untilEndOfTurn',
} as const;
const sentence =
  "Until end of turn, creatures your opponents control lose hexproof and shroud and can't have hexproof or shroud.";

describe('"Until end of turn, creatures your opponents control lose hexproof and shroud and can\'t have hexproof or shroud." (CR 702.11b, 702.18a)', () => {
  test('the real second ability of Arcane Lighthouse', () => {
    const abilities = readAll(`{T}: Add {C}.\n{1}, {T}: ${sentence}`, 'land').abilities;
    expect(abilities).toHaveLength(2);
    expect(abilities[1]).toMatchObject({
      kind: 'activated',
      effect: LOSE,
    });
  });

  test('as a spell (SYNTHETIC)', () => {
    const card = readAll(sentence, 'instant');
    expect(card.spell?.effect).toEqual(LOSE);
  });

  test.each([
    [
      "Until end of turn, creatures your opponents control lose hexproof and can't have hexproof or shroud.",
    ],
    ['Until end of turn, creatures your opponents control lose hexproof and shroud.'],
    [
      "Until end of turn, creatures your opponents control lose shroud and hexproof and can't have hexproof or shroud.",
    ],
    [
      "Until your next turn, creatures your opponents control lose hexproof and shroud and can't have hexproof or shroud.",
    ],
    [
      "Until end of turn, target creature loses hexproof and shroud and can't have hexproof or shroud.",
    ],
  ])('is dropped, never half read (SYNTHETIC): %s', (text) => {
    expect(dropped(text, 'instant').stoppedAt).toBeDefined();
  });
});
