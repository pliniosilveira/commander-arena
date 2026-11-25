/**
 * Cost rule of the Hosts of Mordor deck (Shelob, Dread Weaver): "Put a creature card exiled with ~ into its owner's graveyard" (CR 607.2a linked abilities, 118.3, 400.7). The player
 * chooses one card of the kind among those the permanent exiled with its linked ability and puts it into its owner's graveyard as a cost of an activated ability. The engine's
 * `putLinkedExileInGraveyard` cost, which only an ability of a permanent that has such a linked ability can use.
 */
import { pattern } from '../../combinators';
import type { IrCost, IrNoun } from '../../ir/types';
import { defineRule, spanned } from '../registry';

const ID = 'cost.put-linked-exile-graveyard';

export const COST_PUT_LINKED_EXILE_GRAVEYARD = defineRule<IrCost>({
  id: ID,
  family: 'cost',
  leading: ['put'],
  cites: ['CR 607.2a (Linked Abilities)', 'CR 118.3 (Costs)', 'CR 400.7 (General)'],
  examples: [
    "Put a creature card exiled with ~ into its owner's graveyard",
    'put a creature card exiled with ~ into its owner’s graveyard',
    "Put a card exiled with ~ into its owner's graveyard",
  ],
  rejects: [
    "Put two creature cards exiled with ~ into their owners' graveyards",
    'Put a creature card exiled with ~ into your graveyard',
    "Put a creature card exiled with ~ into its owner's hand",
    'Put a creature card exiled with ~ onto the battlefield',
    "Put a creature card from your graveyard into its owner's graveyard",
    "Put ~ into its owner's graveyard",
    "Put a creature card exiled with target creature into its owner's graveyard",
    "Put a creature card exiled with ~ into its owner's graveyard and",
  ],
  parse: (ctx, pos) => {
    // One pattern, so that a line that is not this cost records nothing of it.
    const r = spanned(
      pattern(
        /put an? (artifact |creature |land |enchantment |planeswalker |instant |sorcery |battle )?card exiled with ~ into its owner['’]s graveyard(?![\p{L}\p{N}'’])(?!\s+and)/iu,
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const type = (r.value.value[1] ?? '').trim().toLowerCase();
    const what: IrNoun = {
      kind: 'noun',
      det: 'a',
      filter: {
        ...(type === '' ? {} : { types: [type] }),
        card: true,
        raw: ctx.text.slice(pos, r.pos),
      },
      upTo: false,
      plural: false,
      other: false,
      span: r.value.span,
      rule: ID,
    };
    return {
      ok: true,
      value: { kind: 'putLinkedExile', what, span: r.value.span, rule: ID },
      pos: r.pos,
    };
  },
});

export const PUT_LINKED_EXILE_COST_RULES = [COST_PUT_LINKED_EXILE_GRAVEYARD];
