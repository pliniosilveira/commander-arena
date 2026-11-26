/**
 * Effect rule of the Revenant Recon deck (Ransom Note): "Cloak the top card of your library." (CR 701.58a). The engine runs it as a manifest whose face-down creature also has
 * ward {2} (`manifest` with `cloak`, `rules/manifest.ts`).
 */
import { pattern } from '../../combinators';
import { defineRule, quietly } from '../registry';
import { type Clauses, single } from './operands';

const ID = 'effect.cloak';

/**
 * `effect.cloak`: "cloak the top card of your library" (CR 701.58a). Only the top card of your own library: several cards, another player's library and "cloak" alone do not read.
 */
export const EFFECT_CLOAK = defineRule<Clauses>({
  id: ID,
  family: 'effect',
  leading: ['cloak'],
  cites: ['CR 701.58a (Cloak)'],
  examples: ['cloak the top card of your library', 'Cloak the top card of your library'],
  rejects: [
    'cloaks the top card of your library',
    'cloak the top card',
    'cloak the top card of their library',
    "cloak the top card of target opponent's library",
    'cloak the top two cards of your library',
    'cloak',
    'cloak the top card of your libraryy',
    'manifest the top card of your library',
  ],
  parse: single(ID, pattern(/cloak the top card of your library(?![\p{L}\p{N}])/iu), () => ({
    verb: 'cloak',
    args: {},
  })),
});

export const CLOAK_EFFECT_RULES = [EFFECT_CLOAK].map(quietly);
