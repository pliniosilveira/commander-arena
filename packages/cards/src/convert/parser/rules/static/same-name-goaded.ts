/**
 * Static ability rule: "Other creatures with the same name as ~ are goaded." (Mocking Doppelganger; CR 701.15a, 701.15b, 201.2, 604.1), the engine's `goaded` static ability of a group.
 */
import { literal } from '../../combinators';
import type { IrNoun, IrStatic } from '../../ir/types';
import { defineRule, quietly } from '../registry';
import { staticOf } from './angels-words';

/**
 * `static.same-name-goaded`: "Other creatures with the same name as ~ are goaded." (CR 701.15a: the controller of the permanent goads them, for as long as the ability applies; CR 201.2:
 * the names are compared as each creature has it now, so a copy has the name it copies). The engine's `goaded` static ability whose subject is the creatures, other than the permanent,
 * that have its name (`sameNameAsSource`). Usually the text is quoted: a permanent that enters as a copy "except it has" this ability. Not read: another group, "the same name as" another
 * thing, no "other", a condition, more words after it.
 */
export const STATIC_SAME_NAME_GOADED = defineRule<IrStatic>({
  id: 'static.same-name-goaded',
  family: 'static',
  leading: [],
  cites: [
    'CR 701.15a (Goad)',
    'CR 701.15b (Goad)',
    'CR 201.2 (Name)',
    'CR 604.1 (Handling Static Abilities)',
  ],
  examples: ['Other creatures with the same name as ~ are goaded.'],
  rejects: [
    'Other creatures with the same name as ~ are goaded',
    'Creatures with the same name as ~ are goaded.',
    'Other creatures you control with the same name as ~ are goaded.',
    'Other creatures with the same name as ~ is goaded.',
    'Other creatures with the same name as that creature are goaded.',
    'Other creatures with the same name as ~ can’t block.',
    'Other creatures with the same name as ~ are goaded. Draw a card.',
    'Other artifacts with the same name as ~ are goaded.',
  ],
  parse: (ctx, pos) => {
    const r = literal('Other creatures with the same name as ~ are goaded.')(ctx, pos);
    if (!r.ok) return r;
    const subject: IrNoun = {
      kind: 'noun',
      det: 'each',
      filter: {
        raw: 'Other creatures with the same name as ~',
        types: ['creature'],
        sameNameAsSource: true,
      },
      upTo: false,
      plural: true,
      other: true,
      span: { start: pos, end: pos + 'Other creatures with the same name as ~'.length },
      rule: 'static.same-name-goaded',
    };
    return {
      ok: true,
      value: staticOf(
        'static.same-name-goaded',
        subject,
        [{ kind: 'restriction', restriction: 'goaded' }],
        pos,
        r.pos,
      ),
      pos: r.pos,
    };
  },
});

export const SAME_NAME_GOADED_STATIC_RULES = [STATIC_SAME_NAME_GOADED].map(quietly);
