/**
 * The words of the cast-later family (D-128) as pure functions: the buttons, the payment prompts, the
 * questions, the engine's abilities on the stack, the badges, the marks of a card in exile, and what the
 * log says of a foretell. Fake views, no DOM.
 */
import type { ObjectView, PriorityDecision, StackAbility } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { alternativeBadge } from '../src/game/alt-cost';
import {
  castNowButtons,
  castNowPrompt,
  delayedWording,
  dropYou,
  exileMarks,
  laterAbilityWords,
  laterFacts,
  laterOrderWording,
  specialActionLabel,
  specialPayPrompt,
} from '../src/game/later-text';
import { menuItems } from '../src/ui/decisions/abilities';
import { foretellCastLabel } from '../src/ui/decisions/alt-cost';
import { exileBadge } from '../src/ui/decisions/layouts';
import { clickOutcome, playableObjects } from '../src/ui/decisions/priority';

const card = (name: string, patch: Partial<ObjectView> = {}): ObjectView =>
  ({
    id: 'o1',
    name,
    controller: 0,
    owner: 0,
    zone: 'hand',
    types: ['creature'],
    manaCost: ['2', 'G'],
    oracleText: '',
    keywords: [],
    counters: {},
    targets: [],
    ...patch,
  }) as ObjectView;

const priority = (...options: PriorityDecision['options'][number][]): PriorityDecision => ({
  id: 'd1',
  seat: 0,
  kind: 'priority',
  options: [{ kind: 'pass' }, ...options],
});

describe('special actions of a hand card', () => {
  const bear = card('Bear', {
    specialActions: [{ kind: 'suspend', cost: ['1', 'B'], counters: 2 }],
  });
  const giant = card('Giant', {
    specialActions: [{ kind: 'foretell', cost: ['2'], castCost: ['1', 'G'] }],
  });

  test('labels and payment prompts', () => {
    expect(specialActionLabel('suspend', bear)).toBe('Suspend 2 — {1}{B}');
    expect(specialActionLabel('foretell', giant)).toBe('Foretell {2}');
    expect(specialActionLabel('suspend', undefined)).toBe('Suspend');
    expect(specialPayPrompt('suspend', ['1', 'B'], 'Bear', bear)).toBe(
      'Pay {1}{B} to suspend Bear with 2 time counters',
    );
    expect(specialPayPrompt('foretell', ['2'], 'Giant', giant)).toBe('Pay {2} to foretell Giant');
  });

  test('a card with only a special action is asked about, never acted on by the click', () => {
    const d = priority({ kind: 'suspend', object: 'o1' });
    expect(playableObjects(d).has('o1')).toBe(true);
    const out = clickOutcome(d, 'o1', new Map([['o1', bear]]));
    if (out.kind !== 'menu') throw new Error(out.kind);
    expect(out.items.map((i) => [i.key, i.label])).toEqual([['suspend', 'Suspend 2 — {1}{B}']]);
    expect(out.items[0]?.action).toEqual({ kind: 'suspend', object: 'o1' });
  });

  test('beside the cast, in the menu order: cast first, the special action after', () => {
    const d = priority({ kind: 'castSpell', object: 'o1' }, { kind: 'foretell', object: 'o1' });
    const items = menuItems(d, 'o1', new Map([['o1', giant]]));
    expect(items.map((i) => i.label)).toEqual(['Cast Giant', 'Foretell {2}']);
  });
});

describe('the questions', () => {
  test('suspend and madness', () => {
    expect(castNowPrompt('suspend', 'Bear', undefined)).toBe(
      'Cast Bear now without paying its mana cost? (its last time counter was removed)',
    );
    expect(castNowPrompt('madness', 'Fiend', ['1', 'B'])).toBe(
      'Cast Fiend for its madness cost {1}{B}?',
    );
    expect(castNowButtons('madness', ['1', 'B'])).toEqual({
      yes: 'Cast it for {1}{B}',
      no: "Don't cast it (it goes to the graveyard)",
    });
    expect(castNowButtons('suspend', undefined).no).toBe("Don't cast it (it stays in exile)");
  });
});

describe('the engine abilities on the stack', () => {
  const tick = {
    kind: 'triggered',
    trigger: { kind: 'upkeep', whose: 'you' },
    effect: { kind: 'removeTimeCounter' },
  } as unknown as StackAbility;
  const free = {
    kind: 'triggered',
    trigger: { kind: 'upkeep', whose: 'you' },
    effect: { kind: 'castExiled', mode: 'suspend' },
  } as unknown as StackAbility;
  const mad = {
    kind: 'triggered',
    trigger: { kind: 'upkeep', whose: 'you' },
    effect: { kind: 'castExiled', mode: 'madness' },
  } as unknown as StackAbility;

  test('words', () => {
    expect(laterAbilityWords(tick, 'Bear', true)).toEqual({
      when: 'At the beginning of your upkeep',
      does: 'Remove a time counter from Bear.',
    });
    expect(laterAbilityWords(tick, 'Bear', false)?.when).toBe(
      "At the beginning of the opponent's upkeep",
    );
    expect(laterAbilityWords(free, 'Bear', true)?.does).toBe(
      'Cast Bear without paying its mana cost.',
    );
    expect(laterAbilityWords(mad, 'Fiend', true)?.does).toBe('Cast Fiend for its madness cost.');
  });

  test('the delayed draw says "the next turn\'s upkeep" only when the source says "next"', () => {
    const delayed = {
      kind: 'triggered',
      trigger: { kind: 'step', step: 'upkeep', whose: 'each' },
      effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
    } as unknown as StackAbility;
    const text = "You draw a card at the beginning of the next turn's upkeep.";
    expect(delayedWording(delayed, text)).toBe("At the beginning of the next turn's upkeep");
    expect(delayedWording(delayed, 'At the beginning of each upkeep, you draw a card.')).toBeNull();
    expect(dropYou('You draw a card')).toBe('draw a card');
  });

  test('a waiting trigger of a suspended card in exile', () => {
    expect(laterOrderWording(-1, { zone: 'exile', counters: { time: 2 } })).toBe(
      'At the beginning of your upkeep',
    );
    expect(laterOrderWording(-1, { zone: 'exile', counters: {} })).toBeNull();
    expect(laterOrderWording(0, { zone: 'battlefield', counters: {} })).toBeUndefined();
  });
});

describe('badges and marks', () => {
  test('spells and permanents', () => {
    expect(alternativeBadge({ zone: 'stack', alternative: 'madness' })?.text).toBe('madness');
    expect(alternativeBadge({ zone: 'stack', alternative: 'foretell' })?.text).toBe('foretold');
    expect(alternativeBadge({ zone: 'stack', suspended: true })?.text).toBe('suspended');
    expect(alternativeBadge({ zone: 'battlefield', alternative: 'suspend' })?.text).toBe(
      'suspended',
    );
    expect(alternativeBadge({ zone: 'battlefield', alternative: 'madness' })).toBeNull();
  });

  test('cards in exile', () => {
    const suspended = card('Bear', { zone: 'exile', counters: { time: 2 } });
    const own = card('Giant', {
      zone: 'exile',
      faceDown: true,
      foretold: true,
      alternativeCosts: [{ kind: 'foretell', cost: ['1', 'G'] }],
    });
    const hidden = card('Face-down card', { zone: 'exile', faceDown: true, owner: 1 });
    expect(exileMarks(suspended)).toEqual(['time 2']);
    expect(exileMarks(own)).toEqual(['Foretold']);
    expect(exileMarks(hidden)).toEqual(['face down']);
    expect(exileMarks(card('Plain', { zone: 'exile' }))).toEqual([]);
    expect(laterFacts(hidden, 0).join(' ')).toContain("the opponent's");
    expect(laterFacts(own, 0).join(' ')).toContain('{1}{G}');
    // The castable foretold card is cast for the foretell cost.
    expect(foretellCastLabel(own)).toBe('Cast for {1}{G}');
    const d = priority({ kind: 'castSpell', object: 'o1', alternative: 'foretell' });
    expect(exileBadge(new Set(['o1']), new Map([['o1', own]]), 'o1')).toBe('Cast for {1}{G}');
    expect(exileBadge(new Set(['o1']), new Map([['o1', suspended]]), 'o1')).toBe('Cast from exile');
    expect(playableObjects(d).has('o1')).toBe(true);
  });
});
