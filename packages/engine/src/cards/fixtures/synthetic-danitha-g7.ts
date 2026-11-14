/**
 * SYNTHETIC CARDS FOR THE DANITHA DECK (ISSUE 26), GROUP 7 (D-433 TO D-435). NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of modes that have a cost listed before their effect (CR 700.2h, 702.183 Tiered, D-433): a "choose one" instant whose three modes each add a
 * cost (one of them {0}, one aimed at a permanent, one that affects a group), a "choose one or more" sorcery whose modes all have a cost (all the costs of the modes chosen
 * are paid), and a "choose one" spell where only one of the modes has a cost. Each has the wording of a real card, the name replaced. Names start with "SYNTHETIC ";
 * oracleId is null. The text describes what the AST does; it is not Oracle text, and none of these is the definition of a real card.
 */
import type { Effect, SpellMode } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const END = 'untilEndOfTurn' as const;
/** The target ids are unique across the modes of a spell (the slots of the chosen modes are asked together). */
const permanentTarget = (id: string) =>
  ({ id, what: { kind: 'object', filter: { zone: 'battlefield' } } }) as const;

/** "Target permanent gains hexproof and indestructible until end of turn." */
const wardTarget = (id: string): Effect => ({
  kind: 'sequence',
  effects: [
    {
      kind: 'grantKeyword',
      objects: { kind: 'target', id },
      keyword: { kind: 'hexproof' },
      duration: END,
    },
    {
      kind: 'grantKeyword',
      objects: { kind: 'target', id },
      keyword: { kind: 'indestructible' },
      duration: END,
    },
  ],
});

const gain = (amount: number): Effect => ({
  kind: 'gainLife',
  player: { kind: 'you' },
  amount,
});

const mana = (...symbols: string[]) => [{ kind: 'mana' as const, symbols }];

export const SYNTHETIC_DANITHA_G7_LIST: readonly CardDefinition[] = [
  // "Choose one. As an additional cost to cast this spell, pay the cost of the mode. • {0} — Target permanent gains hexproof and indestructible until end of turn.
  //  • {1} — Target permanent gains hexproof and indestructible until end of turn. You gain 3 life. • {3}{W} — Permanents you control gain hexproof and indestructible until end of turn. You gain 6 life."
  singleFace({
    name: 'SYNTHETIC Tiered Ward',
    manaCost: ['W'],
    types: ['instant'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText:
      'Tiered (Choose one additional cost.)\n• Small — {0} — Target permanent gains hexproof and indestructible until end of turn.\n• Medium — {1} — Target permanent gains hexproof and indestructible until end of turn. You gain 3 life.\n• Large — {3}{W} — Permanents you control gain hexproof and indestructible until end of turn. You gain 6 life.',
    spell: {
      chooseModes: { min: 1, max: 1 },
      modes: [
        {
          text: 'Small — {0} — Target permanent gains hexproof and indestructible until end of turn.',
          cost: mana('0'),
          targets: [permanentTarget('t1')],
          effect: wardTarget('t1'),
        },
        {
          text: 'Medium — {1} — Target permanent gains hexproof and indestructible until end of turn. You gain 3 life.',
          cost: mana('1'),
          targets: [permanentTarget('t2')],
          effect: { kind: 'sequence', effects: [wardTarget('t2'), gain(3)] },
        },
        {
          text: 'Large — {3}{W} — Permanents you control gain hexproof and indestructible until end of turn. You gain 6 life.',
          cost: mana('3', 'W'),
          effect: {
            kind: 'sequence',
            effects: [
              {
                kind: 'grantKeyword',
                objects: { kind: 'each', filter: { controller: 'you' } },
                keyword: { kind: 'hexproof' },
                duration: END,
              },
              {
                kind: 'grantKeyword',
                objects: { kind: 'each', filter: { controller: 'you' } },
                keyword: { kind: 'indestructible' },
                duration: END,
              },
              gain(6),
            ],
          },
        },
      ],
    },
  }),
  // "Choose one or more. As an additional cost to cast this spell, pay the cost of each mode chosen. • {1} — You gain 2 life. • {R} — This spell deals 3 damage to target creature."
  singleFace({
    name: 'SYNTHETIC Costed Pair',
    manaCost: ['R'],
    types: ['sorcery'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText:
      'Choose one or more — • {1} — You gain 2 life. • {R} — This spell deals 3 damage to target creature.',
    spell: {
      chooseModes: { min: 1, max: 2 },
      modes: [
        { text: '{1} — You gain 2 life.', cost: mana('1'), effect: gain(2) },
        {
          text: '{R} — This spell deals 3 damage to target creature.',
          cost: mana('R'),
          targets: [{ id: 'hit', what: { kind: 'object', filter: { types: ['creature'] } } }],
          effect: { kind: 'dealDamage', amount: 3, to: { kind: 'target', id: 'hit' } },
        } satisfies SpellMode,
      ],
    },
  }),
  // "Choose one — • You gain 2 life. • {2}{U} — Draw two cards." (only one mode has a cost)
  singleFace({
    name: 'SYNTHETIC Half Costed Choice',
    manaCost: ['U'],
    types: ['instant'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'Choose one — • You gain 2 life. • {2}{U} — Draw two cards.',
    spell: {
      chooseModes: { min: 1, max: 1 },
      modes: [
        { text: 'You gain 2 life.', effect: gain(2) },
        {
          text: '{2}{U} — Draw two cards.',
          cost: mana('2', 'U'),
          effect: { kind: 'draw', player: { kind: 'you' }, count: 2 },
        },
      ],
    },
  }),
];
