// Stage P19 (M6): a modal text the grammar reads but whose engine feature is not listed is reported as
// "recognised, not runnable" naming that feature, never built and never read as something else (D-068,
// D-114). The engine lists `ability:modal`, so the support check is replaced here by one that lacks it (and
// the other features a modal text can need), one at a time, and the lowering must name what it needs.
import { describe, expect, test, vi } from 'vitest';

vi.mock('@commander-arena/engine', async (importOriginal) =>
  (await import('./blocked-features')).blockFeatures(
    await importOriginal<typeof import('@commander-arena/engine')>(),
  ),
);

import { withoutFeature } from './parser-p5-helpers';

const SPELL = 'Choose one —\n• Draw a card.\n• You gain 3 life.';
const TRIGGER = 'When ~ enters, choose one —\n• Draw a card.\n• You gain 3 life.';
const ACTIVATED = '{2}, {T}: Choose one —\n• Draw a card.\n• You gain 3 life.';
const COMMANDER =
  'Choose one. If you control a commander as you cast ~, you may choose both instead.\n• Draw a card.\n• You gain 3 life.';

describe('the lowerings of stage P19 name the engine feature they need (D-114)', () => {
  test.each([
    ['ability:modal', SPELL, 'sorcery'],
    ['ability:modal', COMMANDER, 'instant'],
    ['ability:modal', TRIGGER, 'creature'],
    ['ability:modal', 'Whenever ~ attacks, choose one —\n• Draw a card.\n• Scry 1.', 'creature'],
    ['ability:modal', ACTIVATED, 'artifact'],
    ['condition:controlCommander', COMMANDER, 'instant'],
    ['ability:triggered', TRIGGER, 'creature'],
    ['ability:activated', ACTIVATED, 'artifact'],
    ['trigger:entersBattlefield', TRIGGER, 'creature'],
    ['cost:tap', ACTIVATED, 'artifact'],
  ] as const)('without %s: %s', (ref, text, type) => {
    const missing = withoutFeature(ref, text, type);
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toContain(ref);
  });

  test('a mode that needs a feature the engine lacks stops the whole text and names it', () => {
    const missing = withoutFeature(
      'effect:destroy',
      'Choose one —\n• Draw a card.\n• Destroy target artifact.',
      'sorcery',
    );
    expect(missing).toMatchObject({ reason: 'notRunnable', needs: ['effect:destroy'] });
    // Where it stopped: the bullet that needs it, not the lead line and not the bullet before it.
    expect(missing.stoppedAt.startsWith('Destroy target artifact.')).toBe(true);
  });

  test('a mode of a trigger that needs a feature names it, with the ability gate first', () => {
    const missing = withoutFeature(
      'effect:scry',
      'When ~ enters, choose one —\n• Draw a card.\n• Scry 1.',
      'creature',
    );
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toContain('effect:scry');
  });
});
