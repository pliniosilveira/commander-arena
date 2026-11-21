// Muldrotha, the Gravetide ("During each of your turns, you may play a land and cast a permanent spell of each permanent type from your graveyard. (If a card has multiple permanent
// types, choose one as you play it.)"): the real line of the acceptance card of the golden corpus read through the whole pipeline, the reminder text included, and the near misses the
// grammar must not read. The engine runs what is lowered in convert-grammar-engine-muldrotha.test.ts (CR 601.2a, 305.1, 205.2a, 604.1).
import { describe, expect, test, vi } from 'vitest';

vi.mock('@commander-arena/engine', async (importOriginal) =>
  (await import('./blocked-features')).blockFeatures(
    await importOriginal<typeof import('@commander-arena/engine')>(),
  ),
);

import { read, readAll, withoutFeature } from './parser-p5-helpers';

const LINE =
  'During each of your turns, you may play a land and cast a permanent spell of each permanent type from your graveyard.';
const REMINDER = '(If a card has multiple permanent types, choose one as you play it.)';
const EACH_TYPE = [{ kind: 'static', static: { kind: 'playFromGraveyardEachType' } }];

describe('Muldrotha: a land and a permanent spell of each permanent type from the graveyard', () => {
  test('the line alone is the engine permission', () => {
    expect(readAll(LINE, 'creature', ['Elemental', 'Avatar']).abilities).toEqual(EACH_TYPE);
  });

  test('the real text, with its reminder, is the same one ability', () => {
    expect(readAll(`${LINE} ${REMINDER}`, 'creature', ['Elemental', 'Avatar']).abilities).toEqual(
      EACH_TYPE,
    );
  });

  test.each([
    LINE.replace('your graveyard', 'your hand'),
    LINE.replace('your graveyard', 'an opponent’s graveyard'),
    LINE.replace('permanent type', 'card type'),
    LINE.replace('each permanent type', 'each nonland permanent type'),
    LINE.replace('a land and cast a permanent spell of each permanent type', 'a land'),
    LINE.replace('a permanent spell of each permanent type', 'a creature spell'),
    LINE.replace('play a land and ', ''),
    `Once ${LINE.charAt(0).toLowerCase()}${LINE.slice(1)}`,
    LINE.replace('During each of your turns', 'During your turn'),
    LINE.slice(0, -1),
  ])('another wording is dropped, never half read (SYNTHETIC): %s', (text) => {
    const parsed = read(text, 'creature', ['Elemental', 'Avatar']);
    expect(parsed.abilities, text).toEqual([]);
    expect(parsed.unparsed, text).toHaveLength(1);
  });

  test('the lowering names the engine feature it needs', () => {
    const missing = withoutFeature('static:playFromGraveyardEachType', LINE, 'creature', [
      'Elemental',
      'Avatar',
    ]);
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toContain('static:playFromGraveyardEachType');
  });
});
