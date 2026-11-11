/**
 * Overload, Evoke and Dash (D-121) as pure models: the cast labels and keys, the menu of a click,
 * the badges, the log line, the words of the dash return. Fake views and states, no DOM.
 */
import type {
  GameEvent,
  GameState,
  ObjectView,
  PriorityDecision,
  PriorityOption,
  StackAbility,
} from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { alternativeBadge, alternativeLogWords, isNamedAlternative } from '../src/game/alt-cost';
import { describeEvent } from '../src/game/describe';
import { castKey, menuItems } from '../src/ui/decisions/abilities';
import { triggerCondition, triggerGist } from '../src/ui/decisions/ability-label';
import { commanderZoneDetail } from '../src/ui/decisions/commander-zone';
import { castLabel } from '../src/ui/decisions/flashback';
import { clickOutcome } from '../src/ui/decisions/priority';
import { lookupIndexFor } from './decisions-helpers';

const card = (name: string, patch: Partial<ObjectView> = {}): ObjectView =>
  ({
    id: 'o1',
    name,
    controller: 0,
    owner: 0,
    zone: 'hand',
    types: ['creature'],
    manaCost: ['2', 'R', 'R'],
    castCost: ['2', 'R', 'R'],
    oracleText: '',
    keywords: [],
    targets: [],
    ...patch,
  }) as ObjectView;

const cast = (
  patch: Partial<Extract<PriorityOption, { kind: 'castSpell' }>> = {},
): PriorityOption => ({
  kind: 'castSpell',
  object: 'o1',
  ...patch,
});

const decision = (...options: PriorityOption[]): PriorityDecision => ({
  id: 'd1',
  seat: 0,
  kind: 'priority',
  options: [{ kind: 'pass' }, ...options],
});

const raider = card('Dash Raider', {
  alternativeCosts: [{ kind: 'dash', cost: ['1', 'R'] }],
});
const bolt = card('Overload Bolt', {
  types: ['instant'],
  manaCost: ['1', 'R'],
  castCost: ['1', 'R'],
  alternativeCosts: [{ kind: 'overload', cost: ['3', 'R', 'R'] }],
});
const drifter = card('Evoke Drifter', {
  alternativeCosts: [{ kind: 'evoke', cost: ['1', 'U'] }],
});
const both = card('Both', {
  alternativeCosts: [
    { kind: 'evoke', cost: ['1', 'U'] },
    { kind: 'dash', cost: ['1', 'R'] },
  ],
});

describe('the cast buttons', () => {
  test('each option is labelled with its kind and the cost it has now', () => {
    expect(castLabel(cast({ alternative: 'dash' }) as never, raider, 'Dash Raider')).toBe(
      'Dash {1}{R}',
    );
    expect(castLabel(cast({ alternative: 'overload' }) as never, bolt, 'Overload Bolt')).toBe(
      'Overload {3}{R}{R}',
    );
    expect(castLabel(cast({ alternative: 'evoke' }) as never, drifter, 'Evoke Drifter')).toBe(
      'Evoke {1}{U}',
    );
    // The plain cast keeps "Cast X".
    expect(castLabel(cast() as never, raider, 'Dash Raider')).toBe('Cast Dash Raider');
  });

  test('a commander tax shows in the cost of the alternative (the view has it after tax)', () => {
    const taxed = card('Commander', {
      alternativeCosts: [{ kind: 'dash', cost: ['3', 'R'] }],
    });
    expect(castLabel(cast({ alternative: 'dash' }) as never, taxed, 'Commander')).toBe(
      'Dash {3}{R}',
    );
  });

  test('Spectacle reads like the others', () => {
    const spectacle = card('Rix', { alternativeCosts: [{ kind: 'spectacle', cost: ['1', 'R'] }] });
    expect(castLabel(cast({ alternative: 'spectacle' }) as never, spectacle, 'Rix')).toBe(
      'Spectacle {1}{R}',
    );
    expect(alternativeBadge({ alternative: 'spectacle', zone: 'stack' })?.text).toBe('spectacle');
    // A permanent does not remember it: no badge on the battlefield.
    expect(alternativeBadge({ alternative: 'spectacle', zone: 'battlefield' })).toBeNull();
    expect(alternativeLogWords('spectacle')).toBe('for its spectacle cost');
  });

  test('a commander tax the view appends as a separate symbol is added to the generic mana', () => {
    const taxed = card('Commander', {
      alternativeCosts: [{ kind: 'dash', cost: ['1', 'R', '2'] }],
    });
    expect(castLabel(cast({ alternative: 'dash' }) as never, taxed, 'Commander')).toBe(
      'Dash {3}{R}',
    );
  });

  test('a view without the cost gives the keyword alone, never a guessed cost', () => {
    expect(castLabel(cast({ alternative: 'dash' }) as never, card('X'), 'X')).toBe('Dash');
    expect(castLabel(cast({ alternative: 'dash' }) as never, undefined, 'it')).toBe('Dash');
  });

  test('the keys of the options of one card are unique', () => {
    const options = [
      cast(),
      cast({ alternative: 'free' }),
      cast({ alternative: 'overload' }),
      cast({ alternative: 'evoke' }),
      cast({ alternative: 'dash' }),
      cast({ face: 1 }),
      cast({ face: 1, alternative: 'free' }),
    ].map((o) => castKey(o as never));
    expect(new Set(options).size).toBe(options.length);
    // The keys that existed before are unchanged.
    expect(options.slice(0, 2)).toEqual(['cast', 'cast-free']);
    expect(castKey(cast({ face: 1 }) as never)).toBe('cast-face-1');
  });

  test('a click on a card with the plain cast and an alternative opens a menu with both, in order', () => {
    const d = decision(cast(), cast({ alternative: 'dash' }));
    const outcome = clickOutcome(d, 'o1', lookupIndexFor([raider]));
    if (outcome.kind !== 'menu') throw new Error('expected a menu');
    expect(outcome.items.map((i) => [i.key, i.label])).toEqual([
      ['cast', 'Cast Dash Raider'],
      ['cast-dash', 'Dash {1}{R}'],
    ]);
    expect(outcome.items.map((i) => i.action)).toEqual([
      { kind: 'castSpell', object: 'o1' },
      { kind: 'castSpell', object: 'o1', alternative: 'dash' },
    ]);
  });

  test('a card with two alternatives and no plain cast gets both', () => {
    const d = decision(cast({ alternative: 'evoke' }), cast({ alternative: 'dash' }));
    const items = menuItems(d, 'o1', lookupIndexFor([both]));
    expect(items.map((i) => i.label)).toEqual(['Evoke {1}{U}', 'Dash {1}{R}']);
  });

  test('an alternative that is the only option is asked about; the free option still casts at once', () => {
    const only = clickOutcome(
      decision(cast({ alternative: 'dash' })),
      'o1',
      lookupIndexFor([raider]),
    );
    if (only.kind !== 'menu') throw new Error('expected a menu');
    expect(only.items.map((i) => i.label)).toEqual(['Dash {1}{R}']);
    expect(
      clickOutcome(decision(cast({ alternative: 'free' })), 'o1', lookupIndexFor([raider])),
    ).toEqual({ kind: 'act', action: { kind: 'castSpell', object: 'o1', alternative: 'free' } });
    expect(clickOutcome(decision(cast()), 'o1', lookupIndexFor([raider]))).toEqual({
      kind: 'act',
      action: { kind: 'castSpell', object: 'o1' },
    });
  });
});

describe('badges', () => {
  test('on the stack: overloaded, evoked, dashed', () => {
    expect(alternativeBadge({ alternative: 'overload', zone: 'stack' })?.text).toBe('overloaded');
    expect(alternativeBadge({ alternative: 'evoke', zone: 'stack' })?.text).toBe('evoked');
    expect(alternativeBadge({ alternative: 'dash', zone: 'stack' })?.text).toBe('dashed');
  });

  test('on the permanent: evoked and dashed say what happens', () => {
    expect(alternativeBadge({ alternative: 'evoke', zone: 'battlefield' })).toMatchObject({
      text: 'evoked',
      fact: 'Evoked: sacrificed when it enters',
    });
    expect(alternativeBadge({ alternative: 'dash', zone: 'battlefield' })?.title).toContain(
      'returns to its owner’s hand at the beginning of the next end step',
    );
  });

  test('nothing for a plain object, an overloaded permanent that cannot exist, or another zone', () => {
    expect(alternativeBadge({ zone: 'stack' })).toBeNull();
    expect(alternativeBadge({ alternative: 'overload', zone: 'battlefield' })).toBeNull();
    expect(alternativeBadge({ alternative: 'dash', zone: 'hand' })).toBeNull();
  });

  test('which alternatives are named ones', () => {
    expect(([undefined, 'flashback', 'free'] as const).some((a) => isNamedAlternative(a))).toBe(
      false,
    );
    expect(['overload', 'evoke', 'dash'].every((a) => isNamedAlternative(a as never))).toBe(true);
  });
});

describe('the log', () => {
  const state = {
    objects: {
      o1: { card: 'c1', token: null, stack: null, controller: 0, zone: 'stack', face: 0 },
    },
    cards: { c1: { definition: 'd1' } },
    definitions: { d1: { name: 'Dash Raider', faces: [{}] } },
    lki: {},
    pending: null,
    casting: null,
  } as unknown as GameState;
  const spellCast = (patch: Record<string, unknown>) =>
    ({
      kind: 'spellCast',
      seat: 0,
      object: 'o1',
      commanderTax: 0,
      ...patch,
    }) as unknown as GameEvent;
  const line = (patch: Record<string, unknown>, seat = 0) =>
    describeEvent(spellCast({ ...patch, seat }), state, state, 0)?.text;

  test('"for its overload cost", "for its evoke cost", "for its dash cost"', () => {
    expect(line({ alternative: 'overload' })).toBe('You cast Dash Raider for its overload cost.');
    expect(line({ alternative: 'evoke' })).toBe('You cast Dash Raider for its evoke cost.');
    expect(line({ alternative: 'dash' })).toBe('You cast Dash Raider for its dash cost.');
    expect(alternativeLogWords('dash')).toBe('for its dash cost');
  });

  test('with tax and for the opponent', () => {
    expect(line({ alternative: 'dash', commanderTax: 2 })).toBe(
      'You cast Dash Raider (commander tax 2) for its dash cost.',
    );
    expect(line({ alternative: 'evoke' }, 1)).toBe(
      'Opponent casts Dash Raider for its evoke cost.',
    );
  });

  test('flashback and free keep their words, a plain cast has none', () => {
    expect(line({ alternative: 'flashback' })).toBe('You cast Dash Raider with flashback.');
    expect(line({ alternative: 'free' })).toBe(
      'You cast Dash Raider without paying its mana cost.',
    );
    expect(line({})).toBe('You cast Dash Raider.');
  });

  test('an ability triggered with abilityIndex -1 is worded like any other', () => {
    const state2 = {
      ...state,
      objects: {
        o2: { card: 'c1', token: null, stack: null, controller: 0, zone: 'battlefield', face: 0 },
        o3: {
          card: null,
          token: null,
          stack: { kind: 'ability', source: 'o2' },
          controller: 0,
          zone: 'stack',
          face: 0,
        },
      },
    } as unknown as GameState;
    const event = {
      kind: 'abilityTriggered',
      seat: 0,
      source: 'o2',
      abilityIndex: -1,
      stackObject: 'o3',
    } as unknown as GameEvent;
    expect(describeEvent(event, state2, state2, 0)?.text).toBe('Dash Raider triggers.');
  });
});

describe('the words of the evoke and dash triggers', () => {
  const dashReturn = {
    kind: 'triggered',
    trigger: { kind: 'endStep', whose: 'each' },
    effect: { kind: 'moveToZone', objects: { kind: 'this' }, to: 'hand' },
  } as unknown as StackAbility;
  const evoke = {
    kind: 'triggered',
    trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
    effect: { kind: 'sacrifice', objects: { kind: 'this' } },
  } as unknown as StackAbility;

  test('the dash return', () => {
    expect(triggerCondition(dashReturn, 'Dash Raider', undefined)).toBe(
      'At the beginning of each end step',
    );
    expect(triggerGist(dashReturn, raider)).toBe("Return this creature to its owner's hand");
  });

  test('the evoke sacrifice', () => {
    expect(triggerCondition(evoke, 'Evoke Drifter', undefined)).toBe(
      'Whenever Evoke Drifter enters',
    );
    expect(triggerGist(evoke, drifter)).toBe('Sacrifice this creature');
  });

  test('a bounce spell and the other moves: a chosen set is not worded', () => {
    const move = (to: string, objects: unknown) =>
      ({
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        effect: { kind: 'moveToZone', objects, to },
      }) as unknown as StackAbility;
    // D-135: the moves of a card are worded from the node.
    expect(triggerGist(move('graveyard', { kind: 'this' }), raider)).toBe(
      "Put this creature into its owner's graveyard",
    );
    expect(triggerGist(move('battlefield', { kind: 'thisCard' }), raider)).toBe(
      'Return it to the battlefield',
    );
    expect(
      triggerGist(move('hand', { kind: 'choose', filter: { types: ['land'] }, count: 1 }), raider),
    ).toBe('');
    expect(
      triggerGist(move('hand', { kind: 'each', filter: { types: ['creature'] } }), raider),
    ).toBe("Return each creature to its owner's hand");
  });
});

describe('the commander-zone question', () => {
  test('a commander that is still on the battlefield would be put into the hand (dash return, bounce)', () => {
    expect(commanderZoneDetail('Raider', 'hand', 'battlefield')).toBe(
      'Raider would be put into your hand. You may put it into the command zone instead.',
    );
    expect(commanderZoneDetail('Raider', 'library', 'stack')).toBe(
      'Raider would be put into your library. You may put it into the command zone instead.',
    );
  });

  test('a commander already in the graveyard, exile or hand is in it', () => {
    expect(commanderZoneDetail('Raider', 'graveyard', 'graveyard')).toBe(
      'Raider is in the graveyard. You may put it into the command zone instead.',
    );
    expect(commanderZoneDetail('Raider', 'exile', undefined)).toBe(
      'Raider is in exile. You may put it into the command zone instead.',
    );
    expect(commanderZoneDetail('Raider', 'hand', 'hand')).toBe(
      'Raider is in your hand. You may put it into the command zone instead.',
    );
  });
});
