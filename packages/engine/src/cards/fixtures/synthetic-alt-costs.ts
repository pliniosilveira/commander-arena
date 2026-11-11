/**
 * SYNTHETIC ALTERNATIVE-COST CARDS: OVERLOAD, EVOKE, DASH, SPECTACLE, ESCAPE AND UNEARTH. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of the named alternative costs (D-117, D-121, D-124): Overload (CR 702.96), Evoke
 * (CR 702.74), Dash (CR 702.109), Spectacle (CR 702.137), Escape (CR 702.138) and Unearth (CR 702.84). Names
 * start with "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not Oracle
 * text and none of these copies a real card's definition.
 *
 * The overload cost is data on the face (`alternativeCosts`); the text change ("target" becomes
 * "each") is made by the engine from the spell text (`ast/overload.ts`), so the cards below write
 * only their ordinary text. Likewise the sacrifice trigger of an evoked permanent is the engine's
 * (`rules/derive-alt.ts`): the evoke cards write only their own enters and leaves abilities. Dash is the
 * same: haste and the return at the end step are the engine's (`rules/derive-alt.ts`, `rules/stack.ts`).
 */
import type { Ability } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const T1 = { kind: 'target', id: 't1' } as const;
const OPPONENT_CREATURE = {
  id: 't1',
  what: {
    kind: 'object',
    filter: { zone: 'battlefield', types: ['creature'], controller: 'opponent' },
  },
} as const;
const ANY_CREATURE = {
  id: 't1',
  what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
} as const;
const mana = (...symbols: string[]) => [{ kind: 'mana', symbols }] as const;
const enters = (effect: Extract<Ability, { kind: 'triggered' }>['effect']): Ability => ({
  kind: 'triggered',
  trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
  effect,
});

export const SYNTHETIC_ALT_COST_LIST: readonly CardDefinition[] = [
  singleFace({
    name: 'SYNTHETIC Overload Bolt',
    manaCost: ['1', 'R'],
    types: ['instant'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText:
      'Overload {3}{R}{R}. Deals 3 damage to target creature an opponent controls (each creature an opponent controls when overloaded).',
    alternativeCosts: [{ kind: 'overload', cost: mana('3', 'R', 'R') }],
    spell: {
      targets: [OPPONENT_CREATURE],
      effect: { kind: 'dealDamage', amount: 3, to: T1 },
    },
  }),
  singleFace({
    name: 'SYNTHETIC Overload Bounce',
    manaCost: ['1', 'U'],
    types: ['instant'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText:
      'Overload {3}{U}{U}. Return target nonland permanent you do not control to its owner’s hand (each when overloaded).',
    alternativeCosts: [{ kind: 'overload', cost: mana('3', 'U', 'U') }],
    spell: {
      targets: [
        {
          id: 't1',
          what: {
            kind: 'object',
            filter: { zone: 'battlefield', notTypes: ['land'], controller: 'opponent' },
          },
        },
      ],
      effect: { kind: 'moveToZone', objects: T1, to: 'hand' },
    },
  }),
  // Two instructions that both name the target: the text change replaces every "target".
  singleFace({
    name: 'SYNTHETIC Overload Sap',
    manaCost: ['1', 'B'],
    types: ['sorcery'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText:
      'Overload {3}{B}{B}. Target creature an opponent controls gets -2/-2 until end of turn, then you gain 1 life for it (each when overloaded).',
    alternativeCosts: [{ kind: 'overload', cost: mana('3', 'B', 'B') }],
    spell: {
      targets: [OPPONENT_CREATURE],
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'modifyPt', objects: T1, power: -2, toughness: -2, duration: 'untilEndOfTurn' },
          { kind: 'gainLife', player: { kind: 'you' }, amount: 1 },
        ],
      },
    },
  }),
  // "Creature" with no controller: overloaded it hits the caster's own creatures too.
  singleFace({
    name: 'SYNTHETIC Overload Ping',
    manaCost: ['2', 'R'],
    types: ['sorcery'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText:
      'Overload {4}{R}{R}. Deals 2 damage to target creature (each creature when overloaded).',
    alternativeCosts: [{ kind: 'overload', cost: mana('4', 'R', 'R') }],
    spell: {
      targets: [ANY_CREATURE],
      effect: { kind: 'dealDamage', amount: 2, to: T1 },
    },
  }),
  // An additional cost that the overload cost does not replace (CR 118.9d): the discard is paid either way.
  singleFace({
    name: 'SYNTHETIC Overload Toll',
    manaCost: ['1', 'B'],
    types: ['sorcery'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText:
      'Overload {3}{B}{B}. As an additional cost to cast this spell, discard a card. Destroy target creature an opponent controls (each when overloaded).',
    additionalCosts: [{ kind: 'discard', count: 1 }],
    alternativeCosts: [{ kind: 'overload', cost: mana('3', 'B', 'B') }],
    spell: {
      targets: [OPPONENT_CREATURE],
      effect: { kind: 'destroy', objects: T1 },
    },
  }),
  // An overload cost that can only be paid when a condition holds (D-117 `condition`).
  singleFace({
    name: 'SYNTHETIC Overload Gated',
    manaCost: ['2', 'R'],
    types: ['instant'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText:
      'Overload {1}{R}, only if you control a commander. Deals 1 damage to target creature an opponent controls (each when overloaded).',
    alternativeCosts: [
      { kind: 'overload', cost: mana('1', 'R'), condition: { kind: 'controlCommander' } },
    ],
    spell: {
      targets: [OPPONENT_CREATURE],
      effect: { kind: 'dealDamage', amount: 1, to: T1 },
    },
  }),

  // ---- Evoke (CR 702.74)
  // Two enters abilities once evoked: its own and the sacrifice, which the controller orders.
  singleFace({
    name: 'SYNTHETIC Evoke Drifter',
    manaCost: ['3', 'U'],
    types: ['creature'],
    subtypes: ['Elemental'],
    colors: ['U'],
    colorIdentity: ['U'],
    power: 2,
    toughness: 2,
    oracleText: 'Evoke {1}{U}. When this creature enters, draw two cards.',
    alternativeCosts: [{ kind: 'evoke', cost: mana('1', 'U') }],
    abilities: [enters({ kind: 'draw', player: { kind: 'you' }, count: 2 })],
  }),
  // An enters ability that chooses a target as it goes on the stack.
  singleFace({
    name: 'SYNTHETIC Evoke Reaper',
    manaCost: ['3', 'B'],
    types: ['creature'],
    subtypes: ['Elemental'],
    colors: ['B'],
    colorIdentity: ['B'],
    power: 3,
    toughness: 2,
    oracleText:
      'Evoke {1}{B}. When this creature enters, destroy target creature an opponent controls.',
    alternativeCosts: [{ kind: 'evoke', cost: mana('1', 'B') }],
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        targets: [OPPONENT_CREATURE],
        effect: { kind: 'destroy', objects: T1 },
      },
    ],
  }),
  // A dies ability: the sacrifice of the evoke trigger makes it trigger.
  singleFace({
    name: 'SYNTHETIC Evoke Martyr',
    manaCost: ['2', 'W'],
    types: ['creature'],
    subtypes: ['Spirit'],
    colors: ['W'],
    colorIdentity: ['W'],
    power: 1,
    toughness: 1,
    oracleText: 'Evoke {W}. When this creature dies, you gain 3 life.',
    alternativeCosts: [{ kind: 'evoke', cost: mana('W') }],
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'dies', what: { kind: 'this' } },
        effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 3 },
      },
    ],
  }),
  // A leaves-the-battlefield ability, whatever the zone it goes to.
  singleFace({
    name: 'SYNTHETIC Evoke Wisp',
    manaCost: ['2', 'G'],
    types: ['creature'],
    subtypes: ['Elemental'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 2,
    toughness: 1,
    oracleText: 'Evoke {1}{G}. When this creature leaves the battlefield, draw a card.',
    alternativeCosts: [{ kind: 'evoke', cost: mana('1', 'G') }],
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'leavesBattlefield', what: { kind: 'this' } },
        effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
      },
    ],
  }),

  // ---- Dash (CR 702.109)
  singleFace({
    name: 'SYNTHETIC Dash Raider',
    manaCost: ['2', 'R', 'R'],
    types: ['creature'],
    subtypes: ['Goblin'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 3,
    toughness: 1,
    oracleText: 'Dash {1}{R}',
    alternativeCosts: [{ kind: 'dash', cost: mana('1', 'R') }],
  }),
  // An enters ability of its own: it triggers each time the creature is dashed in.
  singleFace({
    name: 'SYNTHETIC Dash Scout',
    manaCost: ['3', 'R'],
    types: ['creature'],
    subtypes: ['Goblin'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 2,
    toughness: 2,
    oracleText: 'Dash {R}. When this creature enters, you gain 1 life.',
    alternativeCosts: [{ kind: 'dash', cost: mana('R') }],
    abilities: [enters({ kind: 'gainLife', player: { kind: 'you' }, amount: 1 })],
  }),

  // ---- Spectacle (CR 702.137): "if an opponent lost life this turn" is the engine's condition.
  singleFace({
    name: 'SYNTHETIC Spectacle Raider',
    manaCost: ['3', 'R'],
    types: ['creature'],
    subtypes: ['Goblin'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 2,
    toughness: 2,
    oracleText: 'Spectacle {1}{R}',
    alternativeCosts: [{ kind: 'spectacle', cost: mana('1', 'R') }],
  }),
  singleFace({
    name: 'SYNTHETIC Spectacle Insight',
    manaCost: ['2', 'U'],
    types: ['instant'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'Spectacle {U}. Draw a card.',
    alternativeCosts: [{ kind: 'spectacle', cost: mana('U') }],
    spell: { effect: { kind: 'draw', player: { kind: 'you' }, count: 1 } },
  }),
  // A life loss that is not damage: "each opponent loses 1 life".
  singleFace({
    name: 'SYNTHETIC Drain Pulse',
    manaCost: ['B'],
    types: ['sorcery'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText: 'Each opponent loses 1 life.',
    spell: { effect: { kind: 'loseLife', player: { kind: 'eachOpponent' }, amount: 1 } },
  }),

  // ---- Escape (CR 702.138): cast from the graveyard, exiling other cards of it.
  singleFace({
    name: 'SYNTHETIC Escape Wraith',
    manaCost: ['3', 'B'],
    types: ['creature'],
    subtypes: ['Spirit'],
    colors: ['B'],
    colorIdentity: ['B'],
    power: 3,
    toughness: 3,
    oracleText: 'Escape—{B}{B}, Exile three other cards from your graveyard.',
    alternativeCosts: [{ kind: 'escape', cost: mana('B', 'B'), exile: 3 }],
  }),
  // "This creature escapes with a +1/+1 counter on it" (CR 702.138c): a replacement as it enters.
  singleFace({
    name: 'SYNTHETIC Escape Brute',
    manaCost: ['4', 'R'],
    types: ['creature'],
    subtypes: ['Beast'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 4,
    toughness: 4,
    oracleText:
      'Escape—{R}{R}, Exile two other cards from your graveyard. This creature escapes with a +1/+1 counter on it.',
    alternativeCosts: [{ kind: 'escape', cost: mana('R', 'R'), exile: 2 }],
    abilities: [
      {
        kind: 'replacement',
        replacement: { kind: 'entersWithCounters', counter: '+1/+1', count: 1, ifEscaped: true },
      },
    ],
  }),
  // "When this creature enters, sacrifice it unless it escaped" (CR 702.138b).
  singleFace({
    name: 'SYNTHETIC Escape Titan',
    manaCost: ['3', 'G'],
    types: ['creature'],
    subtypes: ['Elemental'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 5,
    toughness: 5,
    oracleText:
      'When this creature enters, sacrifice it unless it escaped. Escape—{G}{G}, Exile one other card from your graveyard.',
    alternativeCosts: [{ kind: 'escape', cost: mana('G', 'G'), exile: 1 }],
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        interveningIf: { kind: 'not', term: { kind: 'escaped' } },
        effect: { kind: 'sacrifice', objects: { kind: 'this' } },
      },
    ],
  }),
  // A sorcery with escape: an ordinary spell that goes to the graveyard as it resolves.
  singleFace({
    name: 'SYNTHETIC Escape Pulse',
    manaCost: ['1', 'B'],
    types: ['sorcery'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText:
      'Each opponent loses 2 life. Escape—{B}{B}, Exile two other cards from your graveyard.',
    alternativeCosts: [{ kind: 'escape', cost: mana('B', 'B'), exile: 2 }],
    spell: { effect: { kind: 'loseLife', player: { kind: 'eachOpponent' }, amount: 2 } },
  }),

  // ---- Unearth (CR 702.84): an activated ability from the graveyard; the rest is the engine's.
  singleFace({
    name: 'SYNTHETIC Unearth Gnoll',
    manaCost: ['2', 'R', 'R'],
    types: ['creature'],
    subtypes: ['Goblin'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 3,
    toughness: 1,
    oracleText: 'Unearth {R}',
    abilities: [{ kind: 'keyword', keyword: { kind: 'unearth', cost: mana('R') } }],
  }),
  // A trigger when it enters (each time it is unearthed) and one when it dies (never, if exiled instead).
  singleFace({
    name: 'SYNTHETIC Unearth Shade',
    manaCost: ['3', 'B'],
    types: ['creature'],
    subtypes: ['Spirit'],
    colors: ['B'],
    colorIdentity: ['B'],
    power: 2,
    toughness: 2,
    oracleText:
      'Unearth {1}{B}. When this creature enters, you gain 1 life. When this creature dies, draw a card.',
    abilities: [
      { kind: 'keyword', keyword: { kind: 'unearth', cost: mana('1', 'B') } },
      enters({ kind: 'gainLife', player: { kind: 'you' }, amount: 1 }),
      {
        kind: 'triggered',
        trigger: { kind: 'dies', what: { kind: 'this' } },
        effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
      },
    ],
  }),
  // Takes a card out of a graveyard in response to an unearth.
  singleFace({
    name: 'SYNTHETIC Grave Scour',
    manaCost: ['B'],
    types: ['instant'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText: 'Exile target card from a graveyard.',
    spell: {
      targets: [{ id: 't1', what: { kind: 'object', filter: { zone: 'graveyard' } } }],
      effect: { kind: 'exile', objects: T1 },
    },
  }),
];
