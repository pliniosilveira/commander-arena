/**
 * SYNTHETIC CARD FOR "EXILE ..., THEN RETURN IT AT THE BEGINNING OF THE NEXT END STEP". NOT A REAL MAGIC CARD.
 *
 * Invented for the tests of D-205 (the Vraska deck, slice 1): a delayed triggered ability that returns the object an earlier instruction of the
 * same resolution exiled (CR 603.7, 603.7c, 400.7j). The name starts with "SYNTHETIC "; oracleId is null. The text describes what the AST does; it
 * is not Oracle text, and this is not the definition of a real card.
 */
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

export const SYNTHETIC_DELAYED_RETURN_LIST: readonly CardDefinition[] = [
  // "Exile up to one target creature or land you control. If you do, return it to the battlefield under its owner's control at the
  //  beginning of the next end step."
  singleFace({
    name: 'SYNTHETIC Delayed Flicker',
    manaCost: ['1', 'U'],
    types: ['sorcery'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText:
      "Exile up to one target creature or land you control. If you do, return it to the battlefield under its owner's control at the beginning of the next end step.",
    spell: {
      targets: [
        {
          id: 't1',
          min: 0,
          max: 1,
          what: {
            kind: 'object',
            filter: {
              zone: 'battlefield',
              controller: 'you',
              anyOf: [{ types: ['creature'] }, { types: ['land'] }],
            },
          },
        },
      ],
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'exile', objects: { kind: 'target', id: 't1' } },
          {
            kind: 'conditional',
            condition: { kind: 'didPrevious' },
            effect: {
              kind: 'delayedTrigger',
              at: { step: 'endStep', whose: 'each' },
              effect: {
                kind: 'moveToZone',
                objects: { kind: 'moved' },
                to: 'battlefield',
                controller: 'owner',
              },
            },
          },
        ],
      },
    },
  }),
  // "Create a Treasure token. Exile it. Return it to the battlefield under its owner's control at the beginning of the next end step." (a token
  //  that is exiled ceases to exist: nothing comes back)
  singleFace({
    name: 'SYNTHETIC Token Flicker',
    manaCost: ['U'],
    types: ['sorcery'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText:
      "Create a Treasure token. Exile it. Return it to the battlefield under its owner's control at the beginning of the next end step.",
    spell: {
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'createToken', token: { kind: 'preset', preset: 'Treasure' }, count: 1 },
          { kind: 'exile', objects: { kind: 'moved' } },
          {
            kind: 'delayedTrigger',
            at: { step: 'endStep', whose: 'each' },
            effect: {
              kind: 'moveToZone',
              objects: { kind: 'moved' },
              to: 'battlefield',
              controller: 'owner',
            },
          },
        ],
      },
    },
  }),
];
