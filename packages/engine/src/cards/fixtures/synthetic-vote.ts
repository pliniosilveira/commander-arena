/**
 * SYNTHETIC CARDS FOR VOTING. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of D-194 (voting, CR 701.38, the subsystem of Emissary Green in the Korvold deck). SYNTHETIC Emissary Green has the name's type
 * line, mana cost and Oracle text of the real card, from the owner's request file of 2026-10-29 (`docs/proposals/korvold-deck-analysis.md`); that file
 * gives no power or toughness, so the 3/4 here is INVENTED, and the card is not the definition of the real one (which the parser reads from its Oracle
 * text, `packages/cards`). SYNTHETIC Ballot Rite is invented outright (three options, three effects) to test what Emissary Green's two options do not:
 * a third option, ties of one option against another and a vote that touches the opponent. Names start with "SYNTHETIC "; oracleId is null; the text of
 * Ballot Rite describes what the AST does and is not Oracle text.
 */
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const THIS = { kind: 'this' } as const;
const YOU = { kind: 'you' } as const;

export const SYNTHETIC_VOTE_LIST: readonly CardDefinition[] = [
  singleFace({
    name: 'SYNTHETIC Emissary Green',
    manaCost: ['4', 'G'],
    supertypes: ['legendary'],
    types: ['creature'],
    subtypes: ['Human', 'Advisor'],
    colors: ['G'],
    colorIdentity: ['G'],
    // INVENTED: the request file gives no power or toughness.
    power: 3,
    toughness: 4,
    oracleText:
      'Whenever Emissary Green attacks, starting with you, each player votes for profit or security. You create a number of Treasure tokens equal to twice the number of profit votes. Put a number of +1/+1 counters on each creature you control equal to the number of security votes.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'attacks', what: THIS },
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'vote', options: ['profit', 'security'], startingWith: 'you' },
            {
              kind: 'createToken',
              token: { kind: 'preset', preset: 'Treasure' },
              count: { kind: 'multiple', factor: 2, of: { kind: 'votesFor', option: 'profit' } },
            },
            {
              kind: 'addCounters',
              objects: {
                kind: 'each',
                filter: { zone: 'battlefield', types: ['creature'], controller: 'you' },
              },
              counter: '+1/+1',
              count: { kind: 'votesFor', option: 'security' },
            },
          ],
        },
      },
    ],
  }),
  // "Starting with you, each player votes for gold, iron or ash. You gain 2 life for each gold vote. Draw a card for each iron vote. Each opponent
  // loses 1 life for each ash vote." (invented: three options and an effect against the opponent)
  singleFace({
    name: 'SYNTHETIC Ballot Rite',
    manaCost: ['2', 'U'],
    types: ['sorcery'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText:
      'Starting with you, each player votes for gold, iron or ash. You gain 2 life for each gold vote. Draw a card for each iron vote. Each opponent loses 1 life for each ash vote.',
    spell: {
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'vote', options: ['gold', 'iron', 'ash'], startingWith: 'you' },
          {
            kind: 'gainLife',
            player: YOU,
            amount: { kind: 'multiple', factor: 2, of: { kind: 'votesFor', option: 'gold' } },
          },
          { kind: 'draw', player: YOU, count: { kind: 'votesFor', option: 'iron' } },
          {
            kind: 'loseLife',
            player: { kind: 'eachOpponent' },
            amount: { kind: 'votesFor', option: 'ash' },
          },
        ],
      },
    },
  }),
];
