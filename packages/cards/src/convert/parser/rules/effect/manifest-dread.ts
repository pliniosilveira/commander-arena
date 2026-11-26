/**
 * Effect rules of "manifest dread" (CR 701.62a, Duskmourn): "Look at the top two cards of your library. Manifest one of them, then put the cards you looked at that were not manifested
 * this way into your graveyard." The lowering is in `lower/manifest-dread.ts`.
 */
import { choice, map, pattern } from '../../combinators';
import { defineRule } from '../registry';
import { type Clauses, single } from './operands';

const RULE = 'effect.manifest-dread';

/**
 * `effect.manifest-dread`: "manifest dread" and "manifest dread twice" with no subject: you do it (CR 701.62a, 701.40a). The engine's `lookAtTop` of the top two cards with `take.to`
 * `manifest` and the rest in the graveyard; "twice" does it two times, one after the other (CR 701.40e). Not read: another player manifesting dread, "manifest dread" more than twice.
 */
export const EFFECT_MANIFEST_DREAD = defineRule<Clauses>({
  id: RULE,
  family: 'effect',
  leading: ['manifest'],
  cites: ['CR 701.62a (Manifest Dread)', 'CR 701.40a (Manifest)'],
  examples: ['manifest dread', 'Manifest dread', 'manifest dread twice'],
  rejects: [
    'manifests dread',
    'manifest dreadful',
    'manifest dread three times',
    'manifest the top card of your library',
    'manifest dread twice more',
    'dread',
  ],
  parse: single(
    RULE,
    choice(
      map(pattern(/manifest dread twice(?![\p{L}\p{N}])/iu), () => 'manifestDreadTwice'),
      map(pattern(/manifest dread(?![\p{L}\p{N}])/iu), () => 'manifestDread'),
    ),
    (verb) => ({ verb, args: {} }),
  ),
});

export const MANIFEST_DREAD_EFFECT_RULES = [EFFECT_MANIFEST_DREAD] as const;
