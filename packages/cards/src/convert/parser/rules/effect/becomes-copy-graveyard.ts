/**
 * Effect rule of the Revenant Recon deck (Lazav, the Multifarious): a permanent that becomes a copy of a creature card of a graveyard, with exceptions.
 */
import { fail, literal, pattern, sequence } from '../../combinators';
import type { IrClause, IrNoun } from '../../ir/types';
import { defineRule, family, spanned } from '../registry';
import { flag } from './dragons';
import { type Clauses, makeClause } from './operands';

const ID = 'effect.becomes-copy-of-graveyard-card';

/**
 * `effect.becomes-copy-of-graveyard-card`: "~ becomes a copy of target creature card in your graveyard with mana value X, except its name is ~, it's legendary in addition to its
 * other types, and it has this ability." (CR 707.2, 707.9a, 707.9b, 205.4a, 613.2a: a layer 1 effect with no end that gives this permanent the copiable values of the card as they
 * are when the ability resolves, except that it keeps its name, is also legendary, and has the ability that is resolving, so it can do the same again). The engine's `becomeCopy`
 * with `keepName`, `addSupertypes` and `withThisAbility`. Only `~` itself, only a creature card of your graveyard whose mana value is the X of the ability, only these three
 * exceptions in this order. Not read: a duration, another subject, another card, another exception, an exception left out, "any" card.
 */
export const EFFECT_BECOMES_COPY_OF_GRAVEYARD_CARD = defineRule<Clauses>({
  id: ID,
  family: 'effect',
  leading: ['~'],
  cites: [
    'CR 707.2 (Copying Objects)',
    'CR 707.9a (Copying Objects)',
    'CR 707.9b (Copying Objects)',
    'CR 205.4a (Supertypes)',
    'CR 613.2a (Interaction of Continuous Effects)',
  ],
  examples: [
    "~ becomes a copy of target creature card in your graveyard with mana value X, except its name is ~, it's legendary in addition to its other types, and it has this ability",
    '~ becomes a copy of target creature card in your graveyard with mana value X, except its name is ~, it’s legendary in addition to its other types, and it has this ability',
  ],
  rejects: [
    "~ becomes a copy of target creature card in your graveyard with mana value X, except its name is ~, it's legendary in addition to its other types, and it has this ability.",
    "~ becomes a copy of target creature card in your graveyard with mana value X until end of turn, except its name is ~, it's legendary in addition to its other types, and it has this ability",
    "~ becomes a copy of target creature card in a graveyard with mana value X, except its name is ~, it's legendary in addition to its other types, and it has this ability",
    "~ becomes a copy of target creature card in your graveyard, except its name is ~, it's legendary in addition to its other types, and it has this ability",
    '~ becomes a copy of target creature card in your graveyard with mana value X, except its name is ~, and it has this ability',
    "~ becomes a copy of target creature card in your graveyard with mana value X, except its name is ~ and it's legendary in addition to its other types",
    "~ becomes a copy of target creature card in your graveyard with mana value X, except it's legendary in addition to its other types, and it has this ability",
    "~ becomes a copy of target creature in your graveyard with mana value X, except its name is ~, it's legendary in addition to its other types, and it has this ability",
    "target creature becomes a copy of target creature card in your graveyard with mana value X, except its name is ~, it's legendary in addition to its other types, and it has this ability",
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      family<IrNoun>('noun', { only: ['noun.self'] }),
      literal(' becomes a copy of '),
      family<IrNoun>('noun', { only: ['noun.target-cards-in-your-graveyard'] }),
      spanned(
        pattern(
          /, except its name is ~, it['’]s legendary in addition to its other types, and it has this ability(?![\p{L}\p{N}])/iu,
        ),
      ),
    )(ctx, pos);
    if (!r.ok) return fail(ctx, pos);
    const [objects, , of, except] = r.value;
    const filter = of.filter;
    // One creature card of your graveyard whose mana value is the X of the ability.
    if (
      of.det !== 'target' ||
      of.plural ||
      of.upTo ||
      of.other ||
      filter.zone !== 'graveyard' ||
      filter.controller !== 'you' ||
      filter.manaValueX !== true ||
      filter.types?.length !== 1 ||
      filter.types[0] !== 'creature'
    ) {
      return fail(ctx, pos);
    }
    const span = { start: pos, end: r.pos };
    const clause: IrClause = makeClause(
      ID,
      'becomeCopyFromGraveyard',
      {
        objects,
        of,
        keepName: flag(ID, true, except.span),
        addLegendary: flag(ID, true, except.span),
        withThisAbility: flag(ID, true, except.span),
      },
      span,
    );
    return { ok: true, value: [clause], pos: r.pos };
  },
});

export const BECOMES_COPY_GRAVEYARD_EFFECT_RULES = [EFFECT_BECOMES_COPY_OF_GRAVEYARD_CARD];
