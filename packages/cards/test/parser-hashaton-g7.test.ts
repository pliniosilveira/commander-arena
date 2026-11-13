// The Hashaton deck (issue 31), group 7 (D-1130): "At the beginning of each of your postcombat main phases, there is an additional beginning phase after this phase."
// (Sphinx of the Second Sun). The first line is the real Oracle text of the acceptance card of the golden corpus (with its reminder text) read through the whole
// pipeline; the other lines are SYNTHETIC siblings and the near misses the grammar must not read. The engine runs what is lowered in
// convert-grammar-engine-hashaton-g7.test.ts.
import { describe, expect, test, vi } from 'vitest';

vi.mock('@commander-arena/engine', async (importOriginal) =>
  (await import('./blocked-features')).blockFeatures(
    await importOriginal<typeof import('@commander-arena/engine')>(),
  ),
);

import { DECLARED_NEEDS } from '../src/convert/parser/index';
import { BLOCKED } from './blocked-features';
import { read, readAll, withoutFeature } from './parser-p5-helpers';

const REAL =
  'Flying\nAt the beginning of each of your postcombat main phases, there is an additional beginning phase after this phase. (The beginning phase includes the untap, upkeep, and draw steps.)';
const TRIGGER = 'At the beginning of each of your postcombat main phases, ';
const EXTRA = { kind: 'extraBeginningPhase' };
const MAIN2_YOURS = { kind: 'step', step: 'main2', whose: 'you' };

describe('"At the beginning of each of your postcombat main phases, there is an additional beginning phase after this phase." (CR 500.8, 500.10, 505.1)', () => {
  test('the real text: flying and a step trigger of my postcombat main phases that adds a beginning phase', () => {
    const parsed = readAll(REAL, 'creature', ['Sphinx']);
    expect(parsed.abilities).toEqual([
      { kind: 'keyword', keyword: { kind: 'flying' } },
      { kind: 'triggered', trigger: MAIN2_YOURS, effect: EXTRA },
    ]);
  });

  test('without the reminder text and with the singular phase (SYNTHETIC)', () => {
    const plural = readAll(
      `${TRIGGER}there is an additional beginning phase after this phase.`,
      'creature',
      ['Sphinx'],
    );
    expect(plural.abilities).toEqual([{ kind: 'triggered', trigger: MAIN2_YOURS, effect: EXTRA }]);
    const singular = readAll(
      "At the beginning of your postcombat main phase, there's an additional beginning phase after this phase.",
      'creature',
      ['Sphinx'],
    );
    expect(singular.abilities).toEqual([
      { kind: 'triggered', trigger: MAIN2_YOURS, effect: EXTRA },
    ]);
  });

  test('"each of your" with the other phases and the draw step is the same trigger as "your" (SYNTHETIC)', () => {
    const second = readAll(
      'At the beginning of each of your second main phases, you gain 1 life.',
      'creature',
      ['Sphinx'],
    );
    expect(second.abilities[0]).toMatchObject({ trigger: MAIN2_YOURS });
    const first = readAll(
      'At the beginning of each of your precombat main phases, you gain 1 life.',
      'creature',
      ['Sphinx'],
    );
    expect(first.abilities[0]).toMatchObject({
      trigger: { kind: 'step', step: 'main1', whose: 'you' },
    });
    const draw = readAll(
      'At the beginning of each of your draw steps, you gain 1 life.',
      'creature',
      ['Sphinx'],
    );
    expect(draw.abilities[0]).toMatchObject({
      trigger: { kind: 'step', step: 'draw', whose: 'you' },
    });
  });

  test.each([
    // whose turns, which phase, how many
    'At the beginning of each of your main phases, there is an additional beginning phase after this phase.',
    'At the beginning of each of their postcombat main phases, there is an additional beginning phase after this phase.',
    'At the beginning of each of your postcombat main phase, there is an additional beginning phase after this phase.',
    // another phase or another place
    'At the beginning of each of your postcombat main phases, there is an additional combat phase after this phase and draw a card.',
    'At the beginning of each of your postcombat main phases, there is an additional beginning phase.',
    'At the beginning of each of your postcombat main phases, there is an additional beginning phase after that phase.',
    'At the beginning of each of your postcombat main phases, there are two additional beginning phases after this phase.',
    'At the beginning of each of your postcombat main phases, there is an additional upkeep step after this phase.',
    // something joined to the instruction
    'At the beginning of each of your postcombat main phases, there is an additional beginning phase after this phase and you draw a card.',
    'At the beginning of each of your postcombat main phases, there is an additional beginning phase after this phase, then you gain 1 life.',
  ])('another wording is dropped, never half read (SYNTHETIC): %s', (text) => {
    const parsed = read(text, 'creature', ['Sphinx']);
    expect(parsed.abilities).toEqual([]);
    expect(parsed.unparsed).toHaveLength(1);
  });
});

describe('a line whose engine feature is not listed names it (D-068)', () => {
  const CASES = [['effect:extraBeginningPhase', REAL, 'creature']] as const;

  test.each(CASES)('without %s', (ref, text, type) => {
    const missing = withoutFeature(ref, text, type, ['Sphinx']);
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toContain(ref);
  });

  test('a blocked line leaves the face with no ability of that line (never half-executed)', () => {
    for (const [ref, text, type] of CASES) {
      BLOCKED.clear();
      BLOCKED.add(ref);
      try {
        const parsed = read(text, type, ['Sphinx']);
        expect(parsed.abilities, `${ref}: ${text}`).toEqual([
          { kind: 'keyword', keyword: { kind: 'flying' } },
        ]);
        expect(parsed.unparsed).toHaveLength(1);
      } finally {
        BLOCKED.clear();
      }
    }
  });

  test('every feature the lowering of this slice names is declared', () => {
    expect(DECLARED_NEEDS).toContain('effect:extraBeginningPhase');
  });
});
