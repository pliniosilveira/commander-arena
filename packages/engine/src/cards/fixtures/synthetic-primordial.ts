/**
 * SYNTHETIC CARDS FOR "FOR EACH OPPONENT, YOU MAY CAST UP TO ONE TARGET INSTANT OR SORCERY CARD FROM THAT PLAYER'S GRAVEYARD WITHOUT PAYING ITS MANA COST". NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of the Diluvian Primordial group (First Flight deck): `castCard` with `free` over a slot that takes at most one target for each opponent
 * (`TargetSpec.onePerOpponent`) in graveyards, and the exile of a spell cast this way instead of a graveyard (`exileInstead`). Names start with "SYNTHETIC "; oracleId is
 * null. The text describes what the AST does; it is not Oracle text, and none of these is the definition of a real card.
 */
import type { Ability } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const trigger = (): Ability => ({
  kind: 'triggered',
  trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
  targets: [
    {
      id: 't1',
      onePerOpponent: true,
      what: {
        kind: 'object',
        filter: {
          zone: 'graveyard',
          controller: 'opponent',
          anyOf: [{ types: ['instant'] }, { types: ['sorcery'] }],
        },
      },
    },
  ],
  effect: {
    kind: 'castCard',
    object: { kind: 'target', id: 't1' },
    free: true,
    exileInstead: true,
  },
});

export const SYNTHETIC_PRIMORDIAL_LIST: readonly CardDefinition[] = [
  singleFace({
    name: 'SYNTHETIC Tidal Caster',
    manaCost: ['3', 'U'],
    types: ['creature'],
    subtypes: ['Avatar'],
    colors: ['U'],
    colorIdentity: ['U'],
    power: 2,
    toughness: 2,
    oracleText:
      "When this creature enters, for each opponent, you may cast up to one target instant or sorcery card from that player's graveyard without paying its mana cost. If a spell cast this way would be put into a graveyard, exile it instead.",
    abilities: [trigger()],
  }),
  // An instant that takes a card out of a graveyard in response: "Exile target card from a graveyard."
  singleFace({
    name: 'SYNTHETIC Quick Exile',
    manaCost: ['U'],
    types: ['instant'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'Exile target card from a graveyard.',
    spell: {
      targets: [{ id: 't1', what: { kind: 'object', filter: { zone: 'graveyard' } } }],
      effect: { kind: 'moveToZone', objects: { kind: 'target', id: 't1' }, to: 'exile' },
    },
  }),
];
