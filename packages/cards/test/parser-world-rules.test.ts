// "Players can't gain life." (CR 119.7), "Damage can't be prevented." (CR 615.12) and "All damage is dealt as though its source had wither." (CR 702.80a,
// 120.3d), the three world-rule lines of Everlasting Torment, through the whole pipeline. The engine runs what is lowered in
// packages/engine/test/scenario-xx-blight-curse-statics.test.ts.
import { describe, expect, test } from 'vitest';
import { dropped, readAll } from './parser-p5-helpers';

describe('the three lines are static abilities of the permanent (CR 604.1)', () => {
  test.each([
    ["Players can't gain life.", { kind: 'cantGainLife', who: 'players' }],
    ['Players can’t gain life.', { kind: 'cantGainLife', who: 'players' }],
    ["Damage can't be prevented.", { kind: 'damageCantBePrevented' }],
    ['All damage is dealt as though its source had wither.', { kind: 'damageAsThoughWither' }],
  ])('%s', (text, effect) => {
    expect(readAll(text, 'enchantment').abilities).toEqual([{ kind: 'static', static: effect }]);
  });

  test('all three together, as on the real card', () => {
    const parsed = readAll(
      "Players can't gain life.\nDamage can't be prevented.\nAll damage is dealt as though its source had wither.",
      'enchantment',
    );
    expect(parsed.abilities.map((a) => (a.kind === 'static' ? a.static.kind : a.kind))).toEqual([
      'cantGainLife',
      'damageCantBePrevented',
      'damageAsThoughWither',
    ]);
  });
});

describe('near misses are not read', () => {
  test.each([
    "Players can't gain life until end of turn.",
    "Players can't lose life.",
    "Damage can't be prevented this turn.",
    "Combat damage can't be prevented.",
    'All damage is dealt as though its source had infect.',
    'Damage is dealt as though its source had wither.',
  ])('%s', (text) => {
    expect(dropped(text, 'enchantment')).toMatchObject({ reason: 'unrecognised' });
  });
});
