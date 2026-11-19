/**
 * SYNTHETIC CARDS FOR FLASHBACK WITH THE COST EQUAL TO THE MANA COST. NOT REAL MAGIC CARDS.
 *
 * Invented for the scenario tests of the permanent that gives the instant and sorcery cards in its controller's graveyard flashback (`grantFlashbackToGraveyardCards`, CR 702.34a)
 * and of the spell that does it until end of turn (`gainFlashbackFromManaCost`, CR 611.2a, 611.2c). Names start with "SYNTHETIC "; oracleId is null; the text describes what the AST
 * does, it is not Oracle text, and none of these is the definition of a real card (the real ones are read from their Oracle text by `packages/cards`).
 */
import type { Effect, ObjectFilter, SpellMode } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const INSTANT_OR_SORCERY: ObjectFilter = {
  anyOf: [{ types: ['instant'] }, { types: ['sorcery'] }],
};

const mode = (text: string, effect: Effect): SpellMode => ({ text, effect });

export const SYNTHETIC_JESKAI_FLASHBACK_LIST: readonly CardDefinition[] = [
  // "Spells can't be countered." and "Each instant and sorcery card in your graveyard has flashback. The flashback cost is equal to that card's mana cost."
  singleFace({
    name: 'SYNTHETIC Echo Lecturer',
    manaCost: ['2', 'U', 'R'],
    types: ['creature'],
    subtypes: ['Wizard'],
    colors: ['U', 'R'],
    colorIdentity: ['U', 'R'],
    power: 2,
    toughness: 4,
    oracleText:
      "Spells can't be countered.\nEach instant and sorcery card in your graveyard has flashback. The flashback cost is equal to that card's mana cost.",
    abilities: [
      { kind: 'static', static: { kind: 'spellsCantBeCountered', spells: {} } },
      {
        kind: 'static',
        static: { kind: 'grantFlashbackToGraveyardCards', what: INSTANT_OR_SORCERY },
      },
    ],
  }),
  // "Each instant and sorcery card in your graveyard gains flashback until end of turn. The flashback cost is equal to its mana cost."
  singleFace({
    name: 'SYNTHETIC Echo Rite',
    manaCost: ['1', 'R'],
    types: ['sorcery'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText:
      'Each instant and sorcery card in your graveyard gains flashback until end of turn. The flashback cost is equal to its mana cost.',
    spell: {
      effect: {
        kind: 'gainFlashbackFromManaCost',
        what: INSTANT_OR_SORCERY,
        duration: 'untilEndOfTurn',
      },
    },
  }),
  // "Choose one. If you control a commander as you cast this spell, you may choose both instead. • Each player may discard their hand and draw five cards. • Each instant and sorcery
  // card in your graveyard gains flashback until end of turn. The flashback cost is equal to its mana cost."
  singleFace({
    name: 'SYNTHETIC Echo Will',
    manaCost: ['2', 'U', 'R'],
    types: ['sorcery'],
    colors: ['U', 'R'],
    colorIdentity: ['U', 'R'],
    oracleText:
      'Choose one. If you control a commander as you cast this spell, you may choose both instead.\n• Each player may discard their hand and draw five cards.\n• Each instant and sorcery card in your graveyard gains flashback until end of turn. The flashback cost is equal to its mana cost.',
    spell: {
      chooseModes: { min: 1, max: 1, maxIf: { condition: { kind: 'controlCommander' }, max: 2 } },
      modes: [
        mode('Each player may discard their hand and draw five cards.', {
          kind: 'playersMay',
          players: { kind: 'eachPlayer' },
          runsAs: 'chooser',
          effect: {
            kind: 'sequence',
            effects: [
              {
                kind: 'discard',
                player: { kind: 'you' },
                count: { kind: 'countOf', filter: { zone: 'hand', controller: 'you' } },
              },
              { kind: 'draw', player: { kind: 'you' }, count: 5 },
            ],
          },
        }),
        mode(
          'Each instant and sorcery card in your graveyard gains flashback until end of turn. The flashback cost is equal to its mana cost.',
          {
            kind: 'gainFlashbackFromManaCost',
            what: INSTANT_OR_SORCERY,
            duration: 'untilEndOfTurn',
          },
        ),
      ],
    },
  }),
];
