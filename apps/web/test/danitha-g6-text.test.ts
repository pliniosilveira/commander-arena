/**
 * The words of group 6 of the Danitha deck (D-430, D-431) as pure models: the trigger over creatures with power greater than their base power, the
 * target that says it, and the keyword counters (read from the engine's SYNTHETIC cards, so a wording that drifts from the AST fails here). No DOM.
 */
import { type Ability, syntheticCard } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { triggerWording, withText } from '../src/game/trigger-text';
import { triggerGist } from '../src/ui/decisions/ability-label';

const CTX = { self: 'The card', subtypes: [] as string[] };

const face = (name: string) => {
  const f = syntheticCard(name).faces[0];
  if (f === undefined) throw new Error(`no face for ${name}`);
  return f;
};

const triggerOf = (name: string): Extract<Ability, { kind: 'triggered' }> => {
  const ability = face(name).abilities.find((a) => a.kind === 'triggered');
  if (ability?.kind !== 'triggered') throw new Error(`no trigger on ${name}`);
  return ability;
};

describe('the trigger over creatures above their base power (D-431)', () => {
  test('the batch trigger names the power test', () => {
    expect(triggerWording(triggerOf('SYNTHETIC Base Power Batch Watcher').trigger, CTX)).toBe(
      'Whenever one or more creatures you control with power greater than its base power deal combat damage to a player',
    );
  });

  test('the look-back trigger names it too', () => {
    expect(triggerWording(triggerOf('SYNTHETIC Surge Mourner').trigger, CTX)).toContain(
      'power greater than its base power',
    );
  });
});

describe('the target above its base power and the keyword counters', () => {
  test('a filter with the power test says it', () => {
    expect(withText({ types: ['creature'], powerAboveBase: true })).toBe(
      ' with power greater than its base power',
    );
  });

  test('a keyword counter is worded as the counter it is', () => {
    const spell = face('SYNTHETIC Strike Boon').spell;
    const effect = spell?.effect;
    if (effect?.kind !== 'sequence') throw new Error('a sequence of counters');
    const own = effect.effects.map((e) =>
      e.kind === 'addCounters' ? { ...e, objects: { kind: 'this' as const } } : e,
    );
    const words = own.map((e) =>
      triggerGist(
        {
          kind: 'triggered',
          trigger: { kind: 'dies', what: { kind: 'this' } },
          effect: e,
        } as never,
        undefined,
      ),
    );
    expect(words).toEqual([
      'Put a flying counter on this permanent',
      'Put a first strike counter on this permanent',
      'Put a double strike counter on this permanent',
    ]);
  });
});
