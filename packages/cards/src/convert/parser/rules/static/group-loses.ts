/**
 * Static ability rule of a group that loses its abilities and has base power and toughness (Sludge Monster): "Non-Horror creatures with slime counters on them lose all abilities
 * and have base power and toughness 2/2." (CR 613.1f abilities, 613.4b base power and toughness, 613.7 timestamps, 604.1). The same two effects as `static.attached-becomes`, said of a
 * group the permanent names instead of the permanent it is attached to.
 */
import { fail, literal, pattern, sequence } from '../../combinators';
import type { IrNoun, IrStatic } from '../../ir/types';
import { BASE_PT } from '../effect/becomes';
import { defineRule, family, quietly } from '../registry';

const GROUPS = [
  'noun.plain-permanents',
  'noun.other-permanents',
  'noun.other-subtype-permanents',
  'noun.all-permanents',
];

/**
 * `static.group-loses-abilities-base-pt`: "Non-Horror creatures with slime counters on them lose all abilities and have base power and toughness 2/2." The engine's static
 * `loseAllAbilities` and `setPt` with the group as the subject (layers 6 and 7b; counters and +N/+N effects still apply on top, CR 613.4c). The group is named by types, colors and
 * counters, which no layer 6 effect changes (the engine refuses a group that names a keyword). Not read: a singular subject, one effect alone, other effects after them, a duration or a
 * condition, "all other abilities", base power and toughness that are not numbers.
 */
export const STATIC_GROUP_LOSES_ABILITIES_BASE_PT = defineRule<IrStatic>({
  id: 'static.group-loses-abilities-base-pt',
  family: 'static',
  leading: [],
  cites: [
    'CR 613.1f (Interaction of Continuous Effects)',
    'CR 613.4b (Interaction of Continuous Effects)',
    'CR 613.7 (Interaction of Continuous Effects)',
    'CR 604.1 (Handling Static Abilities)',
  ],
  examples: [
    'Non-Horror creatures with slime counters on them lose all abilities and have base power and toughness 2/2.',
    'Creatures you control lose all abilities and have base power and toughness 1/1.',
  ],
  rejects: [
    'Non-Horror creatures with slime counters on them lose all abilities and have base power and toughness 2/2',
    'Non-Horror creatures with slime counters on them lose all abilities.',
    'Non-Horror creatures with slime counters on them have base power and toughness 2/2.',
    'Non-Horror creatures with slime counters on them lose all abilities and have power and toughness 2/2.',
    'Non-Horror creatures with slime counters on them lose all abilities and have base power and toughness 2/2 until end of turn.',
    'Non-Horror creatures with slime counters on them lose all abilities and have base power and toughness X/X.',
    'Non-Horror creatures with slime counters on them loses all abilities and have base power and toughness 2/2.',
    'Non-Horror creatures with slime counters on them lose all other abilities and have base power and toughness 2/2.',
    'Non-Horror creatures with slime counters on them lose all abilities and have base power and toughness 2/2 and flying.',
    'Enchanted creature loses all abilities and has base power and toughness 2/2.',
  ],
  parse: (ctx, pos) => {
    const subject = family<IrNoun>('noun', { only: GROUPS })(ctx, pos);
    if (!subject.ok) return subject;
    if (!subject.value.plural) return fail(ctx, pos);
    const r = sequence(
      pattern(/ lose all abilities and have /iu),
      BASE_PT('static.group-loses-abilities-base-pt'),
      literal('.'),
    )(ctx, subject.pos);
    if (!r.ok) return r;
    const [, basePt] = r.value;
    return {
      ok: true,
      value: {
        kind: 'static',
        subject: subject.value,
        effects: [
          { kind: 'loseAllAbilities' },
          { kind: 'basePt', power: basePt.power, toughness: basePt.toughness },
        ],
        span: { start: pos, end: r.pos },
        rule: 'static.group-loses-abilities-base-pt',
      },
      pos: r.pos,
    };
  },
});

export const GROUP_LOSES_STATIC_RULES = [STATIC_GROUP_LOSES_ABILITIES_BASE_PT].map(quietly);
