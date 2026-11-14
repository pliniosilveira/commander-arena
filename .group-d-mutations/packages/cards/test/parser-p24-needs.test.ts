// Stage P24 (M6): a play-rule line the grammar reads whose engine feature is not listed is reported as "recognised,
// not runnable" naming that feature, never built (D-068, D-125). The engine lists every feature below, so the support
// check is replaced here by one that lacks one feature at a time, and the lowering must name it. All lines are the
// real lines of reports/templates.json.
import { describe, expect, test, vi } from 'vitest';

vi.mock('@commander-arena/engine', async (importOriginal) =>
  (await import('./blocked-features')).blockFeatures(
    await importOriginal<typeof import('@commander-arena/engine')>(),
  ),
);

import { DECLARED_NEEDS } from '../src/convert/parser/index';
import { BLOCKED } from './blocked-features';
import { read, withoutFeature } from './parser-p5-helpers';

const ADDITIONAL_LAND = 'You may play an additional land on each of your turns.';
const EACH_PLAYER_LAND = 'Each player may play an additional land on each of their turns.';
const LOOK_AT_TOP = 'You may look at the top card of your library any time.';
const PROPAGANDA =
  "Creatures can't attack you unless their controller pays {2} for each creature they control that's attacking you.";
const NORNS_ANNEX =
  "Creatures can't attack you or planeswalkers you control unless their controller pays {W/P} for each of those creatures.";
const OPTIONAL_UNTAP = 'You may choose not to untap ~ during your untap step.';

describe('the play-rule lines name the feature the engine lacks (D-125)', () => {
  test.each([
    ['ability:static', ADDITIONAL_LAND, 'enchantment'],
    ['static:additionalLandDrops', ADDITIONAL_LAND, 'enchantment'],
    ['static:additionalLandDrops', EACH_PLAYER_LAND, 'enchantment'],
    ['static:lookAtTopOfLibrary', LOOK_AT_TOP, 'enchantment'],
    ['ability:static', LOOK_AT_TOP, 'enchantment'],
    ['static:attackTax', PROPAGANDA, 'enchantment'],
    ['cost:mana', PROPAGANDA, 'enchantment'],
    ['ability:static', PROPAGANDA, 'enchantment'],
    ['static:attackTax', NORNS_ANNEX, 'artifact'],
    ['cost:mana', NORNS_ANNEX, 'artifact'],
    ['static:optionalUntap', OPTIONAL_UNTAP, 'artifact'],
    ['ability:static', OPTIONAL_UNTAP, 'artifact'],
  ] as const)('without %s: %s', (ref, text, type) => {
    const missing = withoutFeature(ref, text, type);
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toEqual([ref]);
  });

  test('a kind the engine does not list does not block the others', () => {
    BLOCKED.clear();
    BLOCKED.add('static:attackTax');
    try {
      expect(read(ADDITIONAL_LAND, 'enchantment').unparsed).toEqual([]);
      expect(read(LOOK_AT_TOP, 'enchantment').unparsed).toEqual([]);
      expect(read(OPTIONAL_UNTAP, 'artifact').unparsed).toEqual([]);
      expect(read(PROPAGANDA, 'enchantment').unparsed).toHaveLength(1);
    } finally {
      BLOCKED.clear();
    }
  });

  test('a blocked line leaves the face with no ability (never half-executed)', () => {
    for (const [ref, text] of [
      ['static:additionalLandDrops', ADDITIONAL_LAND],
      ['static:lookAtTopOfLibrary', LOOK_AT_TOP],
      ['static:attackTax', PROPAGANDA],
      ['static:optionalUntap', OPTIONAL_UNTAP],
    ] as const) {
      BLOCKED.clear();
      BLOCKED.add(ref);
      try {
        expect(read(text, 'enchantment').abilities, ref).toEqual([]);
      } finally {
        BLOCKED.clear();
      }
    }
  });

  test('every feature the lowering can name is declared for the dimension test', () => {
    for (const ref of [
      'static:additionalLandDrops',
      'static:lookAtTopOfLibrary',
      'static:attackTax',
      'static:optionalUntap',
      'cost:mana',
    ] as const) {
      expect(DECLARED_NEEDS, ref).toContain(ref);
    }
  });
});
