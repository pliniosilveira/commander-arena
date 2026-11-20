/**
 * SYNTHETIC cards for the groups of the Quick Draw deck (issue 121) after Plot and Jump-start (`synthetic-jump-start.ts`). Names start with "SYNTHETIC "; oracleId is null. The text
 * describes what the AST does; it is not Oracle text, and none of these is the definition of a real card (the real ones are read from the golden corpus by the grammar and have the same
 * abilities).
 */
import type { ObjectFilter } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const INSTANT_OR_SORCERY_IN_YOUR_GRAVEYARD: ObjectFilter = {
  zone: 'graveyard',
  controller: 'you',
  anyOf: [{ types: ['instant'] }, { types: ['sorcery'] }],
};

const INSTANT_OR_SORCERY: ObjectFilter = {
  anyOf: [{ types: ['instant'] }, { types: ['sorcery'] }],
};

export const SYNTHETIC_QUICK_DRAW_LIST: readonly CardDefinition[] = [
  // "This spell costs {2} less to cast for each different mana value among instant and sorcery cards in your graveyard." ({8}{U} sorcery: you gain 1 life)
  singleFace({
    name: 'SYNTHETIC Value Discount',
    manaCost: ['8', 'U'],
    types: ['sorcery'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText:
      'This spell costs {2} less to cast for each different mana value among instant and sorcery cards in your graveyard. You gain 1 life.',
    abilities: [
      {
        kind: 'static',
        static: {
          kind: 'costReduction',
          spells: { kind: 'this' },
          amount: {
            kind: 'multiple',
            factor: 2,
            of: {
              kind: 'differentManaValuesAmong',
              filter: INSTANT_OR_SORCERY_IN_YOUR_GRAVEYARD,
            },
          },
        },
      },
    ],
    spell: { effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 1 } },
  }),
  // "{T}: The next instant or sorcery spell you cast this turn costs {X} less to cast, where X is the number of Wizards you control as this ability resolves." (a 1/2 Wizard)
  singleFace({
    name: 'SYNTHETIC Discount Wizard',
    manaCost: ['U', 'R'],
    types: ['creature'],
    subtypes: ['Human', 'Wizard'],
    colors: ['U', 'R'],
    colorIdentity: ['U', 'R'],
    power: 1,
    toughness: 2,
    oracleText:
      '{T}: The next instant or sorcery spell you cast this turn costs {X} less to cast, where X is the number of Wizards you control as this ability resolves.',
    abilities: [
      {
        kind: 'activated',
        cost: [{ kind: 'tap' }],
        effect: {
          kind: 'nextSpellModifier',
          spells: INSTANT_OR_SORCERY,
          lessGeneric: {
            kind: 'countOf',
            filter: { zone: 'battlefield', controller: 'you', subtypes: ['Wizard'] },
          },
        },
      },
    ],
  }),
  // "{T}: The next instant or sorcery spell you cast this turn has storm." (a 2/2)
  singleFace({
    name: 'SYNTHETIC Storm Granter',
    manaCost: ['R'],
    types: ['creature'],
    subtypes: ['Human'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 2,
    toughness: 2,
    oracleText: '{T}: The next instant or sorcery spell you cast this turn has storm.',
    abilities: [
      {
        kind: 'activated',
        cost: [{ kind: 'tap' }],
        effect: {
          kind: 'nextSpellModifier',
          spells: INSTANT_OR_SORCERY,
          grants: 'storm',
        },
      },
    ],
  }),
  // "{T}: The next instant spell and the next sorcery spell you cast this turn each have cascade." (a 2/2)
  singleFace({
    name: 'SYNTHETIC Cascade Granter',
    manaCost: ['R'],
    types: ['creature'],
    subtypes: ['Human'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 2,
    toughness: 2,
    oracleText:
      '{T}: The next instant spell and the next sorcery spell you cast this turn each have cascade.',
    abilities: [
      {
        kind: 'activated',
        cost: [{ kind: 'tap' }],
        effect: {
          kind: 'sequence',
          effects: [
            {
              kind: 'nextSpellModifier',
              spells: { types: ['instant'] },
              grants: 'cascade',
            },
            {
              kind: 'nextSpellModifier',
              spells: { types: ['sorcery'] },
              grants: 'cascade',
            },
          ],
        },
      },
    ],
  }),
  // "{T}: Add {U}. When you spend this mana to cast an instant or sorcery spell with mana value 3 or less, you may exile that spell instead of putting it into its owner's graveyard as it
  // resolves." and "{3}{U}{U}, {T}: You may cast any number of spells from among cards exiled with this artifact without paying their mana costs. Activate only as a sorcery."
  singleFace({
    name: 'SYNTHETIC Exile Foundry',
    manaCost: ['2', 'U'],
    types: ['artifact'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText:
      "{T}: Add {U}. When you spend this mana to cast an instant or sorcery spell with mana value 3 or less, you may exile that spell instead of putting it into its owner's graveyard as it resolves. {3}{U}{U}, {T}: You may cast any number of spells from among cards exiled with this artifact without paying their mana costs. Activate only as a sorcery.",
    abilities: [
      {
        kind: 'mana',
        cost: [{ kind: 'tap' }],
        production: { kind: 'fixed', mana: ['U'] },
        spentRider: {
          spells: { types: ['instant', 'sorcery'], manaValueAtMost: 3 },
          grants: { exileLinked: true },
        },
      },
      {
        kind: 'activated',
        cost: [{ kind: 'mana', symbols: ['3', 'U', 'U'] }, { kind: 'tap' }],
        timing: 'sorcery',
        effect: { kind: 'castFree', objects: { kind: 'linkedExile' }, max: 'any' },
      },
    ],
  }),
  // "When this creature enters, you may pay {2}{R} any number of times. When you pay this cost one or more times, put that many +1/+1 counters on this creature, then exile up to that
  // many target instant and/or sorcery cards with mana value 3 or less from your graveyard and copy them. You may cast any number of the copies without paying their mana costs." (a 2/2 haste)
  singleFace({
    name: 'SYNTHETIC Paying Adversary',
    manaCost: ['1', 'R'],
    types: ['creature'],
    subtypes: ['Vampire'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 2,
    toughness: 2,
    oracleText:
      'Haste. When this creature enters, you may pay {2}{R} any number of times. When you pay this cost one or more times, put that many +1/+1 counters on this creature, then exile up to that many target instant and/or sorcery cards with mana value 3 or less from your graveyard and copy them. You may cast any number of the copies without paying their mana costs.',
    abilities: [
      { kind: 'keyword', keyword: { kind: 'haste' } },
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        effect: {
          kind: 'payAnyAmount',
          cost: ['2', 'R'],
          reflexive: {
            targets: [
              {
                id: 't1',
                what: {
                  kind: 'object',
                  filter: {
                    zone: 'graveyard',
                    controller: 'you',
                    anyOf: [{ types: ['instant'] }, { types: ['sorcery'] }],
                    manaValue: { cmp: 'atMost', value: 3 },
                  },
                },
                upToTriggerAmount: true,
              },
            ],
            effect: {
              kind: 'sequence',
              effects: [
                {
                  kind: 'addCounters',
                  objects: { kind: 'this' },
                  counter: '+1/+1',
                  count: { kind: 'triggerDamage' },
                },
                { kind: 'exile', objects: { kind: 'target', id: 't1' } },
                { kind: 'copyCardAndCast', objects: { kind: 'moved' } },
              ],
            },
          },
        },
      },
    ],
  }),
  // "You may cast up to one target instant card and/or up to one target sorcery card from your graveyard each with mana value X or less without paying their mana costs. If a spell cast this way
  // would be put into your graveyard, exile it instead. If X is 10 or more, copy each of those spells twice. You may choose new targets for the copies." ({X}{R}{R} sorcery)
  singleFace({
    name: 'SYNTHETIC Promise Finale',
    manaCost: ['X', 'R', 'R'],
    types: ['sorcery'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText:
      'You may cast up to one target instant card and/or up to one target sorcery card from your graveyard each with mana value X or less without paying their mana costs. If a spell cast this way would be put into your graveyard, exile it instead. If X is 10 or more, copy each of those spells twice. You may choose new targets for the copies.',
    spell: {
      x: true,
      targets: [
        {
          id: 't1',
          what: {
            kind: 'object',
            filter: {
              zone: 'graveyard',
              controller: 'you',
              types: ['instant'],
              manaValueAtMost: { kind: 'x' },
            },
          },
          min: 0,
          max: 1,
        },
        {
          id: 't2',
          what: {
            kind: 'object',
            filter: {
              zone: 'graveyard',
              controller: 'you',
              types: ['sorcery'],
              manaValueAtMost: { kind: 'x' },
            },
          },
          min: 0,
          max: 1,
        },
      ],
      effect: {
        kind: 'sequence',
        effects: [
          {
            kind: 'castCard',
            object: { kind: 'target', id: 't1' },
            free: true,
            exileInstead: true,
            remember: true,
          },
          {
            kind: 'castCard',
            object: { kind: 'target', id: 't2' },
            free: true,
            exileInstead: true,
            remember: true,
          },
          {
            kind: 'conditional',
            condition: { kind: 'xAtLeast', value: 10 },
            effect: {
              kind: 'copySpell',
              spell: { kind: 'moved' },
              newTargets: 'may',
              count: 2,
            },
          },
        ],
      },
    },
  }),
];
