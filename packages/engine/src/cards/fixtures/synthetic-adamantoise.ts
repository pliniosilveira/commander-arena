/**
 * SYNTHETIC CARD FOR DAMAGE REDIRECTION. NOT A REAL MAGIC CARD.
 *
 * Invented for the tests of D-192 (the redirection of damage, CR 614.9, and damage that stays through cleanup steps, CR 514.2; the last step of the
 * Ancient Adamantoise slice of the Korvold deck). SYNTHETIC Ancient Adamantoise has the name's type line, mana cost and Oracle text of the real card, from
 * the owner's request file of 2026-10-29 (`docs/proposals/korvold-deck-analysis.md`); that file gives no power or toughness, so the 6/8 here is INVENTED,
 * and the card is not the definition of the real one (which the parser reads from its Oracle text, `packages/cards`). Names start with "SYNTHETIC ";
 * oracleId is null.
 */
import type { CardDefinition } from '../definition';
import { kw, singleFace } from './helpers';

const THIS = { kind: 'this' } as const;

export const SYNTHETIC_ADAMANTOISE_LIST: readonly CardDefinition[] = [
  singleFace({
    name: 'SYNTHETIC Ancient Adamantoise',
    manaCost: ['5', 'G', 'G', 'G'],
    types: ['creature'],
    subtypes: ['Turtle'],
    colors: ['G'],
    colorIdentity: ['G'],
    // INVENTED: the request file gives no power or toughness.
    power: 6,
    toughness: 8,
    oracleText:
      "Vigilance, ward {3}\nDamage isn't removed from this creature during cleanup steps.\nAll damage that would be dealt to you and other permanents you control is dealt to this creature instead.\nWhen this creature dies, exile it and create ten tapped Treasure tokens.",
    abilities: [
      kw('vigilance'),
      { kind: 'keyword', keyword: { kind: 'ward', cost: [{ kind: 'mana', symbols: ['3'] }] } },
      { kind: 'static', static: { kind: 'keepsDamage', subject: THIS } },
      {
        kind: 'replacement',
        replacement: { kind: 'redirectDamage', you: true, permanents: { controller: 'you' } },
      },
      {
        kind: 'triggered',
        trigger: { kind: 'dies', what: THIS },
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'exile', objects: { kind: 'thisCard' } },
            {
              kind: 'createToken',
              token: { kind: 'preset', preset: 'Treasure' },
              count: 10,
              tapped: true,
            },
          ],
        },
      },
    ],
  }),
];
