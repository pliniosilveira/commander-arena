// The Danitha deck (issue 26), group 7 (D-433): the Tiered lines of Restoration Magic (CR 702.183a, 700.2h). The first block is the real Oracle text of the acceptance
// card of the golden corpus read through the whole pipeline; the other lines are SYNTHETIC siblings and the near misses the grammar must not read. The engine runs what is
// lowered in convert-grammar-engine-danitha-g7.test.ts.
import { describe, expect, test, vi } from 'vitest';

vi.mock('@commander-arena/engine', async (importOriginal) =>
  (await import('./blocked-features')).blockFeatures(
    await importOriginal<typeof import('@commander-arena/engine')>(),
  ),
);

import { DECLARED_NEEDS } from '../src/convert/parser/index';
import { read, readAll, withoutFeature } from './parser-p5-helpers';

const BODY = 'Target permanent gains hexproof and indestructible until end of turn.';
const REAL = [
  'Tiered',
  `• Cure — {0} — ${BODY}`,
  `• Cura — {1} — ${BODY} You gain 3 life.`,
  '• Curaga — {3}{W} — Permanents you control gain hexproof and indestructible until end of turn. You gain 6 life.',
].join('\n');

describe('Restoration Magic: "Tiered" and the modes with a cost (CR 702.183a, 700.2h)', () => {
  test('the real text: one mode is chosen, and each mode has its cost, its effect and its words', () => {
    const parsed = readAll(REAL, 'instant');
    const modes = parsed.spell?.modes ?? [];
    expect(parsed.spell?.chooseModes).toEqual({ min: 1, max: 1 });
    expect(modes.map((m) => m.cost)).toEqual([
      [{ kind: 'mana', symbols: ['0'] }],
      [{ kind: 'mana', symbols: ['1'] }],
      [{ kind: 'mana', symbols: ['3', 'W'] }],
    ]);
    expect(modes.map((m) => m.text)).toEqual([
      `Cure — {0} — ${BODY}`,
      `Cura — {1} — ${BODY} You gain 3 life.`,
      'Curaga — {3}{W} — Permanents you control gain hexproof and indestructible until end of turn. You gain 6 life.',
    ]);
    // Each target is the mode's own, with ids unique across the modes.
    expect(modes[0]?.targets?.[0]?.id).toBe('t1');
    expect(modes[1]?.targets?.[0]?.id).toBe('t2');
    expect(modes[2]?.targets).toBeUndefined();
  });

  test('the effect of each mode is what its words after the cost say', () => {
    const modes = readAll(REAL, 'instant').spell?.modes ?? [];
    expect(modes[1]?.effect).toMatchObject({
      kind: 'sequence',
      effects: [
        { kind: 'grantKeyword', keyword: { kind: 'hexproof' } },
        { kind: 'grantKeyword', keyword: { kind: 'indestructible' } },
        { kind: 'gainLife', amount: 3 },
      ],
    });
  });

  test('another card of the same shape (SYNTHETIC): two modes, a hybrid cost and a name of two words', () => {
    const text = [
      'Tiered',
      '• Light Touch — {R} — ~ deals 1 damage to any target.',
      '• Heavy Blow — {2}{R/W} — ~ deals 3 damage to any target.',
    ].join('\n');
    const parsed = readAll(text, 'sorcery');
    expect(parsed.spell?.modes?.map((m) => m.cost)).toEqual([
      [{ kind: 'mana', symbols: ['R'] }],
      [{ kind: 'mana', symbols: ['2', 'R/W'] }],
    ]);
  });

  test.each([
    // a bullet without a name or a cost
    ['Tiered', `• ${BODY}`, `• Cura — {1} — ${BODY}`],
    ['Tiered', `• Cure — ${BODY}`, `• Cura — {1} — ${BODY}`],
    ['Tiered', `• {0} — ${BODY}`, `• Cura — {1} — ${BODY}`],
    // a cost the engine does not run in a mode: X, a cost that is not mana
    ['Tiered', `• Cure — {X} — ${BODY}`, `• Cura — {1} — ${BODY}`],
    ['Tiered', `• Cure — {T} — ${BODY}`, `• Cura — {1} — ${BODY}`],
    ['Tiered', `• Cure — {Q} — ${BODY}`, `• Cura — {1} — ${BODY}`],
    // a name that is not a name, a cost that is not in braces
    ['Tiered', `• cure — {0} — ${BODY}`, `• Cura — {1} — ${BODY}`],
    ['Tiered', `• Cure — 0 — ${BODY}`, `• Cura — {1} — ${BODY}`],
    // one mode is not a choice
    ['Tiered', `• Cure — {0} — ${BODY}`],
  ])('another shape is dropped, never half read (SYNTHETIC): %s', (...lines) => {
    const parsed = read(lines.join('\n'), 'instant');
    expect(parsed.unparsed.length).toBeGreaterThan(0);
    expect(parsed.spell?.modes ?? null).toBeNull();
  });

  test('a mode that does not read stops the whole text', () => {
    const parsed = read(
      ['Tiered', `• Cure — {0} — ${BODY}`, '• Cura — {1} — Frobnicate the permanent.'].join('\n'),
      'instant',
    );
    expect(parsed.unparsed.length).toBeGreaterThan(0);
    expect(parsed.spell ?? null).toBeNull();
  });

  test('"Tiered" on a permanent has no spell to give modes to', () => {
    const parsed = read(REAL, 'creature');
    expect(parsed.unparsed.length).toBeGreaterThan(0);
  });

  test('the modes name the feature the engine lacks (D-068)', () => {
    const missing = withoutFeature('ability:modeCost', REAL, 'instant');
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toContain('ability:modeCost');
    expect(DECLARED_NEEDS).toContain('ability:modeCost');
  });
});
