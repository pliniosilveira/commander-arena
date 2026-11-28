/**
 * A group of permanents that are made Equipment and given what an Equipment has (Gemcutter Buccaneer, issue 134): `Treasures you control are Equipment in addition to their
 * other types and have "Equipped creature gets +2/+0," equip Pirate {1}, and equip {3}.`
 */
import { fail, literal, pattern, satisfy } from '../../combinators';
import type { IrCost, IrNoun, IrStatic } from '../../ir/types';
import { SUBTYPE_WORD_NUMBERED } from '../noun/subtypes';
import { defineRule, family } from '../registry';

const PLAIN_MANA = /^(\d+|[WUBRGC])$/u;

/**
 * `static.group-is-equipment`: "[Group] are Equipment in addition to their other types and have "Equipped creature gets +N/+N," equip [creature type] {cost}, and equip {cost}."
 * (CR 613.1d: the subtype is added in layer 4; CR 613.1f: the abilities are given in layer 6; CR 613.4c: what the quoted ability does is applied in layer 7c; CR 702.6a, 702.6c: each
 * equip ability and the creatures an "equip [quality]" may target; CR 301.5: an Equipment is attached by its equip ability). One statement: the group has the type, the quoted
 * static ability and one or more equip abilities, each with a mana cost. Not read: the type alone or the abilities alone (other rules), another quoted ability, an equip cost that
 * is not plain mana, an equip restriction that is not one creature type, no equip ability.
 */
export const STATIC_GROUP_IS_EQUIPMENT = defineRule<IrStatic>({
  id: 'static.group-is-equipment',
  family: 'static',
  leading: ['treasures', 'clues', 'foods', 'artifacts'],
  cites: [
    'CR 613.1d (Interaction of Continuous Effects)',
    'CR 613.1f (Interaction of Continuous Effects)',
    'CR 613.4c (Interaction of Continuous Effects)',
    'CR 702.6a (Equip)',
    'CR 702.6c (Equip)',
    'CR 301.5 (Artifacts)',
  ],
  examples: [
    'Treasures you control are Equipment in addition to their other types and have "Equipped creature gets +2/+0," equip Pirate {1}, and equip {3}.',
    'Treasures you control are Equipment in addition to their other types and have "Equipped creature gets +1/+1," and equip {2}.',
    // Issue 128 (Armed with Proof): the comma may come after the quotation or not at all.
    'Clues you control are Equipment in addition to their other types and have "Equipped creature gets +2/+0" and equip {2}.',
  ],
  rejects: [
    'Treasures you control are Equipment in addition to their other types.',
    'Treasures you control are Equipment in addition to their other types and have "Equipped creature gets +2/+0."',
    'Treasures you control are Equipment in addition to their other types and have "Equipped creature gets +2/+0," equip Pirate {1}, and equip {3}',
    'Treasures you control are Equipment in addition to their other types and have "Equipped creature has flying," equip Pirate {1}, and equip {3}.',
    'Treasures you control are Equipment in addition to their other types and have "Equipped creature gets +2/+0," equip Pirate {X}, and equip {3}.',
    'Treasures you control are Equipment in addition to their other types and have "Equipped creature gets +2/+0," equip Pirate—Pay 2 life, and equip {3}.',
    'Treasures you control are Equipment in addition to their other types and have "Equipped creature gets +2/+0," equip legendary creature {1}, and equip {3}.',
    'Treasures you control are Auras in addition to their other types and have "Equipped creature gets +2/+0," equip Pirate {1}, and equip {3}.',
    'Treasures you control are Equipment and have "Equipped creature gets +2/+0," equip Pirate {1}, and equip {3}.',
    'Treasures you control are Equipment in addition to their other types and have "Enchanted creature gets +2/+0," equip Pirate {1}, and equip {3}.',
  ],
  parse: (ctx, pos) => {
    const rule = 'static.group-is-equipment';
    const subject = family<IrNoun>('noun', { only: ['noun.plain-permanents'] })(ctx, pos);
    if (!subject.ok) return subject;
    const lead = pattern(
      / are Equipment in addition to their other types and have ["“]Equipped creature gets ([+\-−]\d+)\/([+\-−]\d+),?["”]/iu,
    )(ctx, subject.pos);
    if (!lead.ok) return lead;
    const number = (text: string | undefined) => Number((text ?? '0').replace('−', '-'));
    const equips: { cost: IrCost; subtype?: string }[] = [];
    let at = lead.pos;
    for (;;) {
      const join = pattern(equips.length === 0 ? /(?: and)? equip / : /(?:, and|,| and) equip /iu)(
        ctx,
        at,
      );
      if (!join.ok) break;
      // "equip Pirate {1}" (CR 702.6c): one creature type, in the singular.
      const word = satisfy(SUBTYPE_WORD_NUMBERED, (w) => w.plural !== true)(ctx, join.pos);
      const space = word.ok ? literal(' ')(ctx, word.pos) : null;
      if (word.ok && (space === null || !space.ok)) return fail(ctx, pos);
      const costAt = space?.ok === true ? space.pos : join.pos;
      const cost = family<IrCost>('cost', { only: ['cost.mana'] })(ctx, costAt);
      if (!cost.ok) return fail(ctx, pos);
      if (cost.value.kind !== 'mana' || cost.value.symbols.some((s) => !PLAIN_MANA.test(s))) {
        return fail(ctx, pos);
      }
      equips.push({ cost: cost.value, ...(word.ok ? { subtype: word.value.subtype } : {}) });
      at = cost.pos;
    }
    if (equips.length === 0) return fail(ctx, pos);
    const end = literal('.')(ctx, at);
    if (!end.ok) return fail(ctx, pos);
    return {
      ok: true,
      value: {
        kind: 'static',
        subject: subject.value,
        effects: [
          {
            kind: 'equipmentKit',
            power: number(lead.value[1]),
            toughness: number(lead.value[2]),
            equips,
          },
        ],
        span: { start: pos, end: end.pos },
        rule,
      },
      pos: end.pos,
    };
  },
});

export const EQUIPMENT_KIT_STATIC_RULES = [STATIC_GROUP_IS_EQUIPMENT];
