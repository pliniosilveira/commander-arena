/**
 * The lowerings of `rules/effect/manifest-dread.ts` (CR 701.62a): "manifest dread" is the engine's `lookAtTop` of the top two cards of the controller's library, one of them manifested
 * (`take.to` `manifest`) and the rest in the graveyard; "manifest dread twice" does it two times in a row (CR 701.40e).
 */
import type { Effect } from '@commander-arena/engine';
import type { IrClause } from '../ir/types';
import { type Effects, failure } from './clauses';
import type { Lowering } from './types';

const MANIFEST_DREAD: Effect = {
  kind: 'lookAtTop',
  count: 2,
  take: { filter: {}, max: 1, min: 1, hidden: true, to: 'manifest' },
  rest: 'graveyard',
};

const manifestDread = (head: string, times: number): Lowering<IrClause, Effects> => ({
  head,
  id: `lower.${head}`,
  needs: ['effect:lookAtTop', 'ability:lookTakeManifest'],
  lower(clause) {
    if (clause.rule === undefined) return failure(clause);
    const value: Effect[] =
      times === 1 ? [MANIFEST_DREAD] : [{ kind: 'repeat', times, effect: MANIFEST_DREAD }];
    return { ok: true, value, rule: clause.rule };
  },
});

/** "Manifest a card from your hand." (CR 701.40a): the player chooses one card of their hand, which is put onto the battlefield face down as a manifested creature. */
const MANIFEST_FROM_HAND: Lowering<IrClause, Effects> = {
  head: 'manifestFromHand',
  id: 'lower.manifest-from-hand',
  needs: ['effect:moveToZone', 'selector:choose', 'ability:manifestFromHand'],
  lower(clause) {
    if (clause.rule === undefined) return failure(clause);
    return {
      ok: true,
      value: [
        {
          kind: 'moveToZone',
          objects: {
            kind: 'choose',
            filter: { zone: 'hand', controller: 'you' },
            count: 1,
          },
          to: 'battlefield',
          faceDownAs: 'manifest',
        },
      ],
      rule: clause.rule,
    };
  },
};

export const MANIFEST_DREAD_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  MANIFEST_FROM_HAND,
  manifestDread('manifestDread', 1),
  manifestDread('manifestDreadTwice', 2),
];
