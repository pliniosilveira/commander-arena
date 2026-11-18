/**
 * Static statements of the Jubilant Skybonder group (First Flight deck, D-149): "Spells your opponents cast that target ~ cost {2} more to cast." (CR 601.2f, 601.2c, 113.6, 604.2) and
 * the quoted static ability a group has ("Creatures you control with flying have \"...\"", CR 613.1f, 604.1).
 */
import { fail, literal, type Parser, pattern, sequence } from '../../combinators';
import type { IrNoun, IrStatic, IrStaticEffect } from '../../ir/types';
import { defineRule } from '../registry';
import { readQuotedAbility } from './quoted';

const ID = 'static.spells-cost-increase-targeting-self';

/**
 * `static.spells-cost-increase-targeting-self`: "Spells your opponents cast that target ~ cost {2} more to cast." A static ability of a permanent: each spell an opponent of its controller
 * casts that targets it costs generic mana more (the engine's `costIncrease`, with `~` the permanent that has the ability, also when the ability is a quoted one a group has). Not read:
 * "you cast" or no caster, another kind of spell, "that target a creature", a cost that is not generic mana ({X}, colored), "less", "to activate" and a missing period.
 */
export const STATIC_SPELLS_COST_INCREASE_TARGETING_SELF = defineRule<IrStatic>({
  id: ID,
  family: 'static',
  leading: [],
  cites: [
    'CR 601.2f (Casting Spells)',
    'CR 601.2c (Casting Spells)',
    'CR 113.6 (Abilities That Function in Zones Other Than the Battlefield)',
    'CR 604.2 (Handling Static Abilities)',
  ],
  examples: [
    'Spells your opponents cast that target ~ cost {2} more to cast.',
    'Spells your opponents cast that target ~ cost {1} more to cast.',
    'Spells your opponents cast that target ~ cost {3} more to cast.',
  ],
  rejects: [
    'Spells your opponents cast that target ~ cost {2} more to cast',
    'Spells you cast that target ~ cost {2} more to cast.',
    'Spells that target ~ cost {2} more to cast.',
    'Spells your opponents cast that target ~ cost {2} less to cast.',
    'Spells your opponents cast that target ~ cost {X} more to cast.',
    'Spells your opponents cast that target ~ cost {W} more to cast.',
    'Spells your opponents cast that target ~ cost {0} more to cast.',
    'Spells your opponents cast that target ~ cost {2}{W} more to cast.',
    'Spells your opponents cast that target ~ cost {2} more to activate.',
    'Spells your opponents cast that target a creature cost {2} more to cast.',
    'Spells your opponents cast that target ~ cost more to cast.',
    'Spells your opponents cast cost {2} more to cast.',
    'Creature spells your opponents cast that target ~ cost {2} more to cast.',
    'Abilities your opponents activate that target ~ cost {2} more to activate.',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      literal('Spells your opponents cast that target ~ cost '),
      pattern(/\{([1-9]\d*)\}/u),
      literal(' more to cast.'),
    )(ctx, pos);
    if (!r.ok) return r;
    const subjectEnd = pos + 'Spells'.length;
    const subject: IrNoun = {
      kind: 'noun',
      det: 'each',
      filter: { controller: 'opponent', castTargetsSelf: true, raw: 'Spells' },
      upTo: false,
      plural: true,
      other: false,
      span: { start: pos, end: subjectEnd },
      rule: ID,
    };
    const effect: IrStaticEffect = { kind: 'costIncrease', amount: Number(r.value[1][1]) };
    return {
      ok: true,
      value: {
        kind: 'static',
        subject,
        effects: [effect],
        span: { start: pos, end: r.pos },
        rule: ID,
      },
      pos: r.pos,
    };
  },
});

/**
 * A quoted static ability a group has (CR 604.1, 613.1f): `have "Spells your opponents cast that target ~ cost {2} more to cast."`. Only the cost increase is read from a quotation: any other
 * quoted static ability stays text that is not read (`grantQuoted`). The quoted line is read by the phrase rule above; `~` in it is the permanent that has the ability.
 */
export const QUOTED_COST_INCREASE: Parser<readonly IrStaticEffect[]> = (ctx, pos) => {
  const read = readQuotedAbility(ctx, pos, { mana: false, statics: true });
  if (!read.ok) return read;
  const { ability } = read.value;
  if (
    ability.kind !== 'static' ||
    ability.statement.effects.length !== 1 ||
    ability.statement.effects[0]?.kind !== 'costIncrease'
  ) {
    return fail(ctx, pos);
  }
  return { ok: true, value: [{ kind: 'grantAbility', ability: read.value }], pos: read.pos };
};

export const SKYBONDER_STATIC_RULES = [STATIC_SPELLS_COST_INCREASE_TARGETING_SELF];
