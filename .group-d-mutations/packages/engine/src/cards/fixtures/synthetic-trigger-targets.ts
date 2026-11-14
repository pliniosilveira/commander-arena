/**
 * SYNTHETIC CARDS WITH TARGETED TRIGGERED ABILITIES. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests and the soak games of triggered abilities that choose targets as they go on
 * the stack (CR 603.3d, 115.1d): enters, dies, attacks and chapter abilities with one or two target
 * slots, with "up to one", with a player target and with "you may". Names start with "SYNTHETIC ";
 * oracleId is null. The text describes what the AST does; it is not Oracle text. None of them is
 * the definition of a real card.
 */
import type { Ability, Condition, Effect, TargetSpec } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const THIS = { kind: 'this' } as const;
const T1 = { kind: 'target', id: 't1' } as const;
const T2 = { kind: 'target', id: 't2' } as const;

const OPPONENT_CREATURE: TargetSpec = {
  id: 't1',
  what: {
    kind: 'object',
    filter: { zone: 'battlefield', types: ['creature'], controller: 'opponent' },
  },
};
const YOUR_CREATURE: TargetSpec = {
  id: 't1',
  what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'], controller: 'you' } },
};

const destroyT1: Effect = { kind: 'destroy', objects: T1 };

const triggered = (
  trigger: Extract<Ability, { kind: 'triggered' }>['trigger'],
  targets: readonly TargetSpec[],
  effect: Effect,
  optional?: boolean,
  interveningIf?: Condition,
): Ability => ({
  kind: 'triggered',
  trigger,
  targets,
  effect,
  ...(optional ? { optional } : {}),
  ...(interveningIf === undefined ? {} : { interveningIf }),
});

/** A 2/2 creature with the given abilities, one printed line of text. */
const imp = (name: string, oracleText: string, abilities: readonly Ability[]): CardDefinition =>
  singleFace({
    name,
    manaCost: ['2', 'B'],
    types: ['creature'],
    subtypes: ['Imp'],
    colors: ['B'],
    colorIdentity: ['B'],
    power: 2,
    toughness: 2,
    oracleText,
    abilities,
  });

/** A Saga with the given chapter abilities (CR 714), as the layout validator expects it. */
function saga(
  name: string,
  oracleText: string,
  chapters: readonly {
    readonly at: number;
    readonly targets?: readonly TargetSpec[];
    effect: Effect;
  }[],
): CardDefinition {
  const base = singleFace({
    name,
    manaCost: ['2', 'B'],
    types: ['enchantment'],
    subtypes: ['Saga'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText,
    abilities: chapters.map((c) => ({
      kind: 'triggered' as const,
      trigger: { kind: 'chapter' as const, from: c.at, to: c.at },
      ...(c.targets === undefined ? {} : { targets: c.targets }),
      effect: c.effect,
    })),
  });
  const face = base.faces[0];
  if (face === undefined) throw new Error(`${name} has no face`);
  return {
    ...base,
    layout: 'saga',
    faces: [{ ...face, finalChapter: Math.max(...chapters.map((c) => c.at)) }],
  };
}

export const SYNTHETIC_TRIGGER_TARGET_LIST: readonly CardDefinition[] = [
  imp(
    'SYNTHETIC Reaper Imp',
    'When this creature enters, destroy target creature an opponent controls.',
    [triggered({ kind: 'entersBattlefield', what: THIS }, [OPPONENT_CREATURE], destroyT1)],
  ),
  imp(
    'SYNTHETIC Last Gasp Imp',
    'When this creature dies, destroy target creature an opponent controls.',
    [triggered({ kind: 'dies', what: THIS }, [OPPONENT_CREATURE], destroyT1)],
  ),
  imp(
    'SYNTHETIC Twin Spark Imp',
    'When this creature enters, put a +1/+1 counter on target creature you control and ' +
      'this creature deals 2 damage to target creature an opponent controls.',
    [
      triggered(
        { kind: 'entersBattlefield', what: THIS },
        [YOUR_CREATURE, { ...OPPONENT_CREATURE, id: 't2' }],
        {
          kind: 'sequence',
          effects: [
            { kind: 'addCounters', objects: T1, counter: '+1/+1', count: 1 },
            { kind: 'dealDamage', amount: 2, to: T2 },
          ],
        },
      ),
    ],
  ),
  imp('SYNTHETIC Tinker Imp', 'When this creature enters, destroy up to one target artifact.', [
    triggered(
      { kind: 'entersBattlefield', what: THIS },
      [
        {
          id: 't1',
          min: 0,
          max: 1,
          what: { kind: 'object', filter: { zone: 'battlefield', types: ['artifact'] } },
        },
      ],
      destroyT1,
    ),
  ]),
  imp('SYNTHETIC Drain Imp', 'When this creature enters, target opponent loses 2 life.', [
    triggered(
      { kind: 'entersBattlefield', what: THIS },
      [{ id: 't1', what: { kind: 'player', filter: 'opponent' } }],
      { kind: 'loseLife', player: { kind: 'target', id: 't1' }, amount: 2 },
    ),
  ]),
  imp(
    'SYNTHETIC Eager Imp',
    'When this creature enters, you may destroy target creature an opponent controls.',
    [triggered({ kind: 'entersBattlefield', what: THIS }, [OPPONENT_CREATURE], destroyT1, true)],
  ),
  imp('SYNTHETIC Pinger Imp', 'Whenever this creature attacks, it deals 1 damage to any target.', [
    triggered({ kind: 'attacks', what: THIS }, [{ id: 't1', what: { kind: 'anyTarget' } }], {
      kind: 'dealDamage',
      amount: 1,
      to: T1,
    }),
  ]),
  imp(
    'SYNTHETIC Mentor Imp',
    'Whenever this creature attacks, put a +1/+1 counter on target creature you control.',
    [
      triggered({ kind: 'attacks', what: THIS }, [YOUR_CREATURE], {
        kind: 'addCounters',
        objects: T1,
        counter: '+1/+1',
        count: 1,
      }),
    ],
  ),
  imp(
    'SYNTHETIC Bounce Imp',
    "When this creature enters, return target creature you control to its owner's hand.",
    [
      triggered({ kind: 'entersBattlefield', what: THIS }, [YOUR_CREATURE], {
        kind: 'moveToZone',
        objects: T1,
        to: 'hand',
      }),
    ],
  ),
  // An intervening "if" (CR 603.4) with a target: it triggers only if its controller has another
  // creature, and is checked again on resolution.
  imp(
    'SYNTHETIC Careful Imp',
    'When this creature enters, if you control another creature, destroy target creature an opponent controls.',
    [
      triggered({ kind: 'entersBattlefield', what: THIS }, [OPPONENT_CREATURE], destroyT1, false, {
        kind: 'controlsAtLeast',
        filter: { types: ['creature'], other: true },
        count: 1,
      }),
    ],
  ),
  // Whenever another creature enters under your control, 1 damage to target creature an opponent
  // controls: two targeted triggers at once with Reaper Imp (CR 603.3b).
  singleFace({
    name: 'SYNTHETIC Ember Watcher',
    manaCost: ['1', 'R'],
    types: ['enchantment'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText:
      'Whenever another creature enters under your control, this enchantment deals 1 damage to target creature an opponent controls.',
    abilities: [
      triggered(
        {
          kind: 'entersBattlefield',
          what: { other: true, types: ['creature'], controller: 'you' },
        },
        [OPPONENT_CREATURE],
        { kind: 'dealDamage', amount: 1, to: T1 },
      ),
    ],
  }),
  // Whenever any creature enters, a counter on target creature you control: both players can have
  // one waiting at once (CR 603.3b, APNAP).
  singleFace({
    name: 'SYNTHETIC Growth Totem',
    manaCost: ['1', 'G'],
    types: ['enchantment'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText: 'Whenever a creature enters, put a +1/+1 counter on target creature you control.',
    abilities: [
      triggered({ kind: 'entersBattlefield', what: { types: ['creature'] } }, [YOUR_CREATURE], {
        kind: 'addCounters',
        objects: T1,
        counter: '+1/+1',
        count: 1,
      }),
    ],
  }),
  saga(
    'SYNTHETIC Purge Saga',
    'I — Destroy target creature an opponent controls.\nII — Put a +1/+1 counter on target creature you control.\nIII — You gain 2 life.',
    [
      { at: 1, targets: [OPPONENT_CREATURE], effect: destroyT1 },
      {
        at: 2,
        targets: [YOUR_CREATURE],
        effect: { kind: 'addCounters', objects: T1, counter: '+1/+1', count: 1 },
      },
      { at: 3, effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 2 } },
    ],
  ),
];
