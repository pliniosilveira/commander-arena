// The Niv-Mizzet deck (issue 25), group 3-b (D-980 to D-984): "If you casting or copying an instant or sorcery spell causes a triggered ability of a permanent
// you control to trigger, that ability triggers an additional time." (Veyran, Voice of Duality). The line is the real Oracle text of the acceptance card of
// the golden corpus (the wording, "you casting", is the card's own) read through the whole pipeline; the other lines are SYNTHETIC siblings and the near
// misses the grammar must not read. The engine runs what is lowered in convert-grammar-engine-niv-group-3-b.test.ts.
import { describe, expect, test, vi } from 'vitest';

vi.mock('@commander-arena/engine', async (importOriginal) =>
  (await import('./blocked-features')).blockFeatures(
    await importOriginal<typeof import('@commander-arena/engine')>(),
  ),
);

import { BLOCKED } from './blocked-features';
import { read, readAll, withoutFeature } from './parser-p5-helpers';

const VEYRAN =
  'If you casting or copying an instant or sorcery spell causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time.';
const INSTANT_OR_SORCERY = {
  stackKind: 'spell',
  anyOf: [{ types: ['instant'] }, { types: ['sorcery'] }],
};

describe('"If you casting or copying an instant or sorcery spell causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time." (CR 603.2d, 601.2i, 707.10)', () => {
  test('the real text: the permanents of the controller, caused by casting or copying an instant or sorcery spell', () => {
    const parsed = readAll(VEYRAN, 'creature', ['Efreet', 'Wizard']);
    expect(parsed.unparsed).toEqual([]);
    expect(parsed.abilities).toEqual([
      {
        kind: 'static',
        static: {
          kind: 'doubleTriggers',
          subject: { kind: 'filter', filter: { controller: 'you' } },
          cause: { kind: 'castOrCopySpell', spell: INSTANT_OR_SORCERY },
        },
      },
    ]);
  });

  test('another kind of spell (SYNTHETIC)', () => {
    const parsed = readAll(
      'If you casting or copying a noncreature spell causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time.',
      'creature',
    );
    expect(parsed.abilities).toMatchObject([
      {
        kind: 'static',
        static: {
          kind: 'doubleTriggers',
          cause: { kind: 'castOrCopySpell', spell: { stackKind: 'spell' } },
        },
      },
    ]);
  });

  test('the magecraft line before it reads as before: the cast or copy trigger', () => {
    const parsed = readAll(
      'Magecraft — Whenever you cast or copy an instant or sorcery spell, this creature gets +1/+1 until end of turn.',
      'creature',
    );
    expect(parsed.abilities).toMatchObject([
      { kind: 'triggered', trigger: { kind: 'castSpell', by: 'you', orCopy: true } },
    ]);
  });

  test.each([
    // the text of the ability, with one word changed
    VEYRAN.slice(0, -1),
    VEYRAN.replace('a permanent you control', 'a creature you control'),
    VEYRAN.replace('a permanent you control', 'a permanent'),
    VEYRAN.replace('If you casting or copying', 'If an opponent casting or copying'),
    VEYRAN.replace('casting or copying', 'casting'),
    VEYRAN.replace('casting or copying', 'copying'),
    VEYRAN.replace('an instant or sorcery spell', 'spells'),
    VEYRAN.replace('a triggered ability', 'an activated ability'),
    VEYRAN.replace('an additional time', 'two additional times'),
    `${VEYRAN} Draw a card.`,
  ])('another wording is dropped, never half read (SYNTHETIC): %s', (text) => {
    const parsed = read(text, 'creature');
    expect(parsed.abilities).toEqual([]);
    expect(parsed.unparsed).toHaveLength(1);
  });
});

describe('a line whose engine feature is not listed names it (D-068)', () => {
  test('without static:doubleTriggers', () => {
    const missing = withoutFeature('static:doubleTriggers', VEYRAN, 'creature', ['Wizard']);
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toContain('static:doubleTriggers');
  });

  test('a blocked line leaves the face with no ability (never half-executed)', () => {
    BLOCKED.clear();
    BLOCKED.add('static:doubleTriggers');
    try {
      const parsed = read(VEYRAN, 'creature', ['Wizard']);
      expect(parsed.abilities).toEqual([]);
    } finally {
      BLOCKED.clear();
    }
  });
});
