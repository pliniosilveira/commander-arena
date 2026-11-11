/**
 * SYNTHETIC CARDS FOR THE TRIGGER SLICE OF D-111. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of the step, drawn, combat-damage and leaves-the-battlefield triggers, the
 * power, toughness and mana value comparisons of `ObjectFilter`, the `attached` trigger subject, the
 * `opponent` caster and the `unlessPays` effect (CR 503 to 514, 121.1, 120.2a, 603.6c, 603.10a, 118.12a).
 * Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not
 * Oracle text and none of these copies a real card. Most "watchers" gain 1 life, so a test can count
 * how often one triggered by the life total alone.
 */
import type {
  Ability,
  Cost,
  Effect,
  ObjectFilter,
  Trigger,
  TriggerStep,
  Zone,
} from '../../ast/types';
import { TRIGGER_STEPS } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { kw, singleFace } from './helpers';

const THIS = { kind: 'this' } as const;
const ATTACHED = { kind: 'attached' } as const;
const YOU = { kind: 'you' } as const;
const gainOne: Effect = { kind: 'gainLife', player: YOU, amount: 1 };
const drawOne: Effect = { kind: 'draw', player: YOU, count: 1 };
const mana = (...symbols: string[]): Cost => ({ kind: 'mana', symbols });
const triggered = (trigger: Trigger, effect: Effect, optional?: boolean): Ability => ({
  kind: 'triggered',
  trigger,
  effect,
  ...(optional ? { optional } : {}),
});
const CREATURE: ObjectFilter = { types: ['creature'] };

/** An enchantment whose one ability is `trigger`, `effect`. */
function watcher(name: string, text: string, trigger: Trigger, effect: Effect = gainOne) {
  return singleFace({
    name,
    manaCost: ['1'],
    types: ['enchantment'],
    colors: [],
    colorIdentity: [],
    oracleText: text,
    abilities: [triggered(trigger, effect)],
  });
}

/** A 2/2 creature whose one ability is `trigger`, `effect`. */
function bear(name: string, text: string, trigger: Trigger, effect: Effect = gainOne) {
  return singleFace({
    name,
    manaCost: ['1', 'G'],
    types: ['creature'],
    subtypes: ['Bear'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 2,
    toughness: 2,
    oracleText: text,
    abilities: [triggered(trigger, effect)],
  });
}

const STEP_WORDS: Readonly<Record<TriggerStep, string>> = {
  upkeep: 'upkeep',
  draw: 'draw step',
  main1: 'precombat main phase',
  beginCombat: 'beginning of combat',
  combatEnd: 'end of combat step',
  main2: 'postcombat main phase',
  endStep: 'end step',
};
const WHOSE_WORDS = { you: 'your', each: "each player's", opponent: "each opponent's" } as const;

/** The name of the step watcher for a step and a turn owner, e.g. `SYNTHETIC Step Watcher beginCombat you`. */
export function stepWatcherName(step: TriggerStep, whose: 'you' | 'each' | 'opponent'): string {
  return `SYNTHETIC Step Watcher ${step} ${whose}`;
}

const STEP_WATCHERS: readonly CardDefinition[] = TRIGGER_STEPS.flatMap((step) =>
  (['you', 'each', 'opponent'] as const).map((whose) =>
    watcher(
      stepWatcherName(step, whose),
      `At the beginning of ${WHOSE_WORDS[whose]} ${STEP_WORDS[step]}, you gain 1 life.`,
      { kind: 'step', step, whose },
    ),
  ),
);

/** The name of the creature that watches itself leave for a zone (`any` for no zone). */
export function leaverName(to: Zone | 'any'): string {
  return `SYNTHETIC Leaver ${to}`;
}

const LEAVER_ZONES: readonly (Zone | 'any')[] = ['any', 'graveyard', 'exile', 'hand', 'library'];
const LEAVERS: readonly CardDefinition[] = LEAVER_ZONES.map((to) =>
  bear(
    leaverName(to),
    to === 'any'
      ? 'Whenever this creature leaves the battlefield, you gain 1 life.'
      : `Whenever this creature leaves the battlefield and is put into ${to === 'hand' ? "its owner's hand" : `a ${to}`}, you gain 1 life.`,
    { kind: 'leavesBattlefield', what: THIS, ...(to === 'any' ? {} : { to }) },
  ),
);

const cmp = (kind: 'atLeast' | 'atMost' | 'equal', value: number) => ({ cmp: kind, value });

export const SYNTHETIC_TRIGGER_MORE_LIST: readonly CardDefinition[] = [
  ...STEP_WATCHERS,
  ...LEAVERS,
  // ---- "Whenever you draw a card" and its relatives (CR 121.1)
  watcher('SYNTHETIC Draw Watcher', 'Whenever you draw a card, you gain 1 life.', {
    kind: 'drawn',
    who: 'you',
  }),
  watcher(
    'SYNTHETIC Opponent Draw Watcher',
    'Whenever an opponent draws a card, you gain 1 life.',
    {
      kind: 'drawn',
      who: 'opponent',
    },
  ),
  watcher('SYNTHETIC Any Draw Watcher', 'Whenever a player draws a card, you gain 1 life.', {
    kind: 'drawn',
    who: 'any',
  }),
  watcher(
    'SYNTHETIC Second Draw Watcher',
    'Whenever you draw your second card each turn, you gain 1 life.',
    { kind: 'drawn', who: 'you', nth: 2 },
  ),
  watcher(
    'SYNTHETIC Opponent Second Draw Watcher',
    'Whenever an opponent draws their second card each turn, you gain 1 life.',
    { kind: 'drawn', who: 'opponent', nth: 2 },
  ),
  singleFace({
    name: 'SYNTHETIC Cantrip',
    manaCost: ['U'],
    types: ['instant'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'Draw a card.',
    spell: { effect: drawOne },
  }),
  // ---- Combat damage dealt (CR 120.2a, 510.2)
  watcher(
    'SYNTHETIC Player Hit Watcher',
    'Whenever a creature you control deals combat damage to a player, you gain 1 life.',
    {
      kind: 'dealsCombatDamage',
      what: { types: ['creature'], controller: 'you' },
      to: 'player',
    },
  ),
  watcher(
    'SYNTHETIC Opponent Hit Watcher',
    'Whenever a creature you control deals combat damage to an opponent, you gain 1 life.',
    {
      kind: 'dealsCombatDamage',
      what: { types: ['creature'], controller: 'you' },
      to: 'opponent',
    },
  ),
  watcher(
    'SYNTHETIC Creature Hit Watcher',
    'Whenever a creature you control deals combat damage to a creature, you gain 1 life.',
    {
      kind: 'dealsCombatDamage',
      what: { types: ['creature'], controller: 'you' },
      to: 'creature',
    },
  ),
  watcher(
    'SYNTHETIC Big Creature Hit Watcher',
    'Whenever a creature you control deals combat damage to a creature with power 3 or greater, you gain 1 life.',
    {
      kind: 'dealsCombatDamage',
      what: { types: ['creature'], controller: 'you' },
      to: 'creature',
      filter: { power: cmp('atLeast', 3) },
    },
  ),
  watcher(
    'SYNTHETIC Any Damage Watcher',
    'Whenever a creature you control deals combat damage, you gain 1 life.',
    { kind: 'dealsCombatDamage', what: { types: ['creature'], controller: 'you' }, to: 'any' },
  ),
  watcher(
    'SYNTHETIC Every Hit Watcher',
    'Whenever a creature deals combat damage to a player, you gain 1 life.',
    { kind: 'dealsCombatDamage', what: CREATURE, to: 'player' },
  ),
  bear(
    'SYNTHETIC Biting Bear',
    'Whenever this creature deals combat damage to a player, you gain 1 life.',
    { kind: 'dealsCombatDamage', what: THIS, to: 'player' },
  ),
  bear(
    'SYNTHETIC Scrapping Bear',
    'Whenever this creature deals combat damage to a creature, you gain 1 life.',
    { kind: 'dealsCombatDamage', what: THIS, to: 'creature' },
  ),
  singleFace({
    name: 'SYNTHETIC Striking Bear',
    manaCost: ['1', 'W'],
    types: ['creature'],
    subtypes: ['Bear'],
    colors: ['W'],
    colorIdentity: ['W'],
    power: 2,
    toughness: 2,
    oracleText:
      'Double strike. Whenever this creature deals combat damage to a player, you gain 1 life.',
    abilities: [
      kw('doubleStrike'),
      triggered({ kind: 'dealsCombatDamage', what: THIS, to: 'player' }, gainOne),
    ],
  }),
  // ---- Leaves the battlefield (CR 603.6c, 603.10a)
  watcher(
    'SYNTHETIC Departure Watcher',
    'Whenever a creature you control leaves the battlefield, you gain 1 life.',
    { kind: 'leavesBattlefield', what: { types: ['creature'], controller: 'you' } },
  ),
  watcher(
    'SYNTHETIC Rival Departure Watcher',
    'Whenever a creature an opponent controls leaves the battlefield, you gain 1 life.',
    { kind: 'leavesBattlefield', what: { types: ['creature'], controller: 'opponent' } },
  ),
  watcher(
    'SYNTHETIC Exile Watcher',
    'Whenever a permanent is put into exile from the battlefield, you gain 1 life.',
    { kind: 'leavesBattlefield', what: {}, to: 'exile' },
  ),
  // ---- Comparisons (D-111)
  watcher(
    'SYNTHETIC Big Arrival Watcher',
    'Whenever a creature with power 4 or greater enters, you gain 1 life.',
    {
      kind: 'entersBattlefield',
      what: { types: ['creature'], power: cmp('atLeast', 4) },
    },
  ),
  watcher(
    'SYNTHETIC Frail Death Watcher',
    'Whenever a creature with power 3 or less dies, you gain 1 life.',
    { kind: 'dies', what: { types: ['creature'], power: cmp('atMost', 3) } },
  ),
  watcher(
    'SYNTHETIC Tough Death Watcher',
    'Whenever a creature with toughness 4 or greater dies, you gain 1 life.',
    { kind: 'dies', what: { types: ['creature'], toughness: cmp('atLeast', 4) } },
  ),
  watcher(
    'SYNTHETIC Cheap Spell Watcher',
    'Whenever a player casts a spell with mana value 2 or less, you gain 1 life.',
    { kind: 'castSpell', filter: { stackKind: 'spell', manaValue: cmp('atMost', 2) }, by: 'any' },
  ),
  watcher(
    'SYNTHETIC Exact Spell Watcher',
    'Whenever a player casts a spell with mana value 3, you gain 1 life.',
    { kind: 'castSpell', filter: { stackKind: 'spell', manaValue: cmp('equal', 3) }, by: 'any' },
  ),
  watcher('SYNTHETIC Rival Spell Watcher', 'Whenever an opponent casts a spell, you gain 1 life.', {
    kind: 'castSpell',
    filter: { stackKind: 'spell' },
    by: 'opponent',
  }),
  singleFace({
    name: 'SYNTHETIC Giant Slayer',
    manaCost: ['1', 'B'],
    types: ['instant'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText: 'Destroy target creature with power 4 or greater.',
    spell: {
      targets: [
        {
          id: 't1',
          what: { kind: 'object', filter: { types: ['creature'], power: cmp('atLeast', 4) } },
        },
      ],
      effect: { kind: 'destroy', objects: { kind: 'target', id: 't1' } },
    },
  }),
  singleFace({
    name: 'SYNTHETIC Wall Breaker',
    manaCost: ['1', 'R'],
    types: ['instant'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText: 'Destroy target creature with toughness 1 or less.',
    spell: {
      targets: [
        {
          id: 't1',
          what: { kind: 'object', filter: { types: ['creature'], toughness: cmp('atMost', 1) } },
        },
      ],
      effect: { kind: 'destroy', objects: { kind: 'target', id: 't1' } },
    },
  }),
  singleFace({
    name: 'SYNTHETIC Grower',
    manaCost: ['2', 'G'],
    types: ['creature'],
    subtypes: ['Beast'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 2,
    toughness: 2,
    oracleText: 'This creature enters with two +1/+1 counters on it.',
    abilities: [
      {
        kind: 'replacement',
        replacement: { kind: 'entersWithCounters', counter: '+1/+1', count: 2 },
      },
    ],
  }),
  singleFace({
    name: 'SYNTHETIC Titan Roost',
    manaCost: ['2', 'G'],
    types: ['enchantment'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText:
      'At the beginning of your upkeep, if you control a creature with power 4 or greater, you gain 1 life.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'step', step: 'upkeep', whose: 'you' },
        interveningIf: {
          kind: 'controlsAtLeast',
          filter: { types: ['creature'], controller: 'you', power: cmp('atLeast', 4) },
          count: 1,
        },
        effect: gainOne,
      },
    ],
  }),
  singleFace({
    name: 'SYNTHETIC Titan Anthem',
    manaCost: ['2', 'W'],
    types: ['enchantment'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText: 'Creatures you control with power 4 or greater get +1/+1.',
    abilities: [
      {
        kind: 'static',
        static: {
          kind: 'modifyPt',
          subject: {
            kind: 'filter',
            filter: { types: ['creature'], controller: 'you', power: cmp('atLeast', 4) },
          },
          power: 1,
          toughness: 1,
        },
      },
    ],
  }),
  singleFace({
    name: 'SYNTHETIC Frail Anthem',
    manaCost: ['2', 'W'],
    types: ['enchantment'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText: 'Creatures you control with toughness 2 or less get +1/+1.',
    abilities: [
      {
        kind: 'static',
        static: {
          kind: 'modifyPt',
          subject: {
            kind: 'filter',
            filter: { types: ['creature'], controller: 'you', toughness: cmp('atMost', 2) },
          },
          power: 1,
          toughness: 1,
        },
      },
    ],
  }),
  singleFace({
    name: 'SYNTHETIC Cheap Lord',
    manaCost: ['1', 'W'],
    types: ['enchantment'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText: 'Creatures you control with mana value 2 or less get +1/+1.',
    abilities: [
      {
        kind: 'static',
        static: {
          kind: 'modifyPt',
          subject: {
            kind: 'filter',
            filter: { types: ['creature'], controller: 'you', manaValue: cmp('atMost', 2) },
          },
          power: 1,
          toughness: 1,
        },
      },
    ],
  }),
  singleFace({
    name: 'SYNTHETIC Big Stompers',
    manaCost: ['4', 'G'],
    types: ['creature'],
    subtypes: ['Giant'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 5,
    toughness: 5,
    oracleText: 'A big body.',
  }),
  // ---- "Equipped creature" and "enchanted creature" as a subject
  singleFace({
    name: 'SYNTHETIC Last Gift Blade',
    manaCost: ['1'],
    types: ['artifact'],
    subtypes: ['Equipment'],
    colors: [],
    colorIdentity: [],
    oracleText: 'Whenever equipped creature dies, draw two cards. Equip {1}',
    abilities: [
      triggered({ kind: 'dies', what: ATTACHED }, { kind: 'draw', player: YOU, count: 2 }),
      { kind: 'keyword', keyword: { kind: 'equip', cost: [mana('1')] } },
    ],
  }),
  singleFace({
    name: 'SYNTHETIC Drumbeat Blade',
    manaCost: ['1'],
    types: ['artifact'],
    subtypes: ['Equipment'],
    colors: [],
    colorIdentity: [],
    oracleText:
      'Whenever equipped creature attacks, you gain 1 life. Whenever equipped creature deals combat damage to a player, draw a card. Whenever equipped creature leaves the battlefield, you gain 3 life. Equip {1}',
    abilities: [
      triggered({ kind: 'attacks', what: ATTACHED }, gainOne),
      triggered({ kind: 'dealsCombatDamage', what: ATTACHED, to: 'player' }, drawOne),
      triggered(
        { kind: 'leavesBattlefield', what: ATTACHED },
        { kind: 'gainLife', player: YOU, amount: 3 },
      ),
      { kind: 'keyword', keyword: { kind: 'equip', cost: [mana('1')] } },
    ],
  }),
  singleFace({
    name: 'SYNTHETIC Doom Aura',
    manaCost: ['B'],
    types: ['enchantment'],
    subtypes: ['Aura'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText: 'Enchant creature. Whenever enchanted creature dies, you gain 2 life.',
    abilities: [
      { kind: 'keyword', keyword: { kind: 'enchant', filter: CREATURE } },
      triggered({ kind: 'dies', what: ATTACHED }, { kind: 'gainLife', player: YOU, amount: 2 }),
    ],
  }),
  singleFace({
    name: 'SYNTHETIC Tap Aura',
    manaCost: ['U'],
    types: ['enchantment'],
    subtypes: ['Aura'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'Enchant creature. Whenever enchanted creature becomes tapped, you gain 1 life.',
    abilities: [
      { kind: 'keyword', keyword: { kind: 'enchant', filter: CREATURE } },
      triggered({ kind: 'becomesTapped', what: ATTACHED }, gainOne),
    ],
  }),
  // ---- "Unless that player pays" (CR 118.12a)
  singleFace({
    name: 'SYNTHETIC Tax Collector',
    manaCost: ['2', 'U'],
    types: ['enchantment'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText:
      'Whenever an opponent casts a spell, you may draw a card unless that player pays {1}.',
    abilities: [
      triggered(
        { kind: 'castSpell', filter: { stackKind: 'spell' }, by: 'opponent' },
        {
          kind: 'unlessPays',
          player: { kind: 'controllerOf', of: { kind: 'triggerSubject' } },
          cost: [mana('1')],
          effect: drawOne,
          optional: true,
        },
      ),
    ],
  }),
  singleFace({
    name: 'SYNTHETIC Strict Tax Collector',
    manaCost: ['2', 'U'],
    types: ['enchantment'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'Whenever an opponent casts a spell, draw a card unless that player pays {1}.',
    abilities: [
      triggered(
        { kind: 'castSpell', filter: { stackKind: 'spell' }, by: 'opponent' },
        {
          kind: 'unlessPays',
          player: { kind: 'controllerOf', of: { kind: 'triggerSubject' } },
          cost: [mana('1')],
          effect: drawOne,
        },
      ),
    ],
  }),
  singleFace({
    name: 'SYNTHETIC Blood Tax Collector',
    manaCost: ['2', 'B'],
    types: ['enchantment'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText: 'Whenever an opponent casts a spell, draw a card unless that player pays 2 life.',
    abilities: [
      triggered(
        { kind: 'castSpell', filter: { stackKind: 'spell' }, by: 'opponent' },
        {
          kind: 'unlessPays',
          player: { kind: 'controllerOf', of: { kind: 'triggerSubject' } },
          cost: [{ kind: 'payLife', amount: 2 }],
          effect: drawOne,
        },
      ),
    ],
  }),
  singleFace({
    name: 'SYNTHETIC Tithe Collector',
    manaCost: ['2', 'W'],
    types: ['enchantment'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText:
      'Whenever an opponent casts a spell, draw a card unless that player discards a card.',
    abilities: [
      triggered(
        { kind: 'castSpell', filter: { stackKind: 'spell' }, by: 'opponent' },
        {
          kind: 'unlessPays',
          player: { kind: 'controllerOf', of: { kind: 'triggerSubject' } },
          cost: [{ kind: 'discard', count: 1 }],
          effect: drawOne,
        },
      ),
    ],
  }),
  singleFace({
    name: 'SYNTHETIC Toll Keeper',
    manaCost: ['1', 'R'],
    types: ['enchantment'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText:
      "At the beginning of each opponent's upkeep, that player loses 2 life unless they pay {2}.",
    abilities: [
      triggered(
        { kind: 'step', step: 'upkeep', whose: 'opponent' },
        {
          kind: 'unlessPays',
          player: { kind: 'eachOpponent' },
          cost: [mana('2')],
          effect: { kind: 'loseLife', player: { kind: 'eachOpponent' }, amount: 2 },
        },
      ),
    ],
  }),
];
