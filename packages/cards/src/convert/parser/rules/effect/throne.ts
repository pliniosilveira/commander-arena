/**
 * Effect rules of the "chosen color" restrictions of Throne of Eldraine (issue 144): two sentences that say something about the ability before them, as "Spend this mana only to cast an
 * Angel spell." does. The lowering of that ability gives the engine its field; anywhere else the sentence is read and not run.
 */
import { pattern } from '../../combinators';
import { BOUNDARY } from '../noun/phrases';
import { defineRule, spanned } from '../registry';
import { type Clauses, makeClause } from './operands';

/**
 * `effect.spend-only-monocolored-chosen`: "Spend this mana only to cast monocolored spells of that color." (CR 106.6: a mana ability may restrict what its mana can be spent on; CR
 * 105.2a: a monocolored object is exactly one color). "That color" is the color the permanent chose as it entered, which the lowering of the mana ability checks (it adds mana of the
 * chosen color). Not read: another kind of spell, multicolored spells, another color word, other mana than "this mana", abilities.
 */
export const EFFECT_SPEND_ONLY_MONOCOLORED_CHOSEN = defineRule<Clauses>({
  id: 'effect.spend-only-monocolored-chosen',
  family: 'effect',
  leading: ['spend'],
  cites: ['CR 106.6 (Mana)', 'CR 105.2a (Color)', 'CR 605.1a (Mana Abilities)'],
  examples: ['spend this mana only to cast monocolored spells of that color'],
  rejects: [
    'spend this mana only to cast multicolored spells of that color',
    'spend this mana only to cast monocolored spells of that colors',
    'spend this mana only to cast monocolored spells of the chosen color',
    'spend this mana only to cast monocolored spells',
    'spend this mana only to cast monocolored creature spells of that color',
    'spend this mana only to cast a monocolored spell of that color',
    'spend this mana only to cast monocolored spells of that color and draw a card',
    'spend only this mana to cast monocolored spells of that color',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.spend-only-monocolored-chosen';
    const r = spanned(
      pattern(
        new RegExp(
          `spend this mana only to cast monocolored spells of that color${BOUNDARY}`,
          'iu',
        ),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const { span } = r.value;
    return {
      ok: true,
      value: [
        makeClause(
          id,
          'spendOnly',
          { monocoloredChosen: { kind: 'flag' as const, value: true, span, rule: id } },
          span,
        ),
      ],
      pos: r.pos,
    };
  },
});

/**
 * `effect.spend-only-chosen-color-activate`: "Spend only mana of the chosen color to activate this ability." (CR 602.2b: the cost of an activated ability is paid as it is activated; the
 * mana that pays it is restricted to the color the permanent chose as it entered, CR 607.2d). It says something about the mana cost of the ability before it: the lowering of an ordinary
 * activated ability gives the engine's `onlyChosenColor` to that cost. Not read: another restriction, another color word, "this mana".
 */
export const EFFECT_SPEND_ONLY_CHOSEN_COLOR_ACTIVATE = defineRule<Clauses>({
  id: 'effect.spend-only-chosen-color-activate',
  family: 'effect',
  leading: ['spend'],
  cites: ['CR 602.2b (Activating Activated Abilities)', 'CR 607.2d (Linked Abilities)'],
  examples: ['spend only mana of the chosen color to activate this ability'],
  rejects: [
    'spend only mana of that color to activate this ability',
    'spend only mana of the chosen color to activate abilities',
    'spend only mana of the chosen color to cast this spell',
    'spend only mana of the chosen colors to activate this ability',
    'spend only mana of the chosen color to activate this ability and draw a card',
    'spend this mana only to activate this ability',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.spend-only-chosen-color-activate';
    const r = spanned(
      pattern(
        new RegExp(`spend only mana of the chosen color to activate this ability${BOUNDARY}`, 'iu'),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: [makeClause(id, 'spendOnlyChosenColor', {}, r.value.span)],
      pos: r.pos,
    };
  },
});

export const THRONE_EFFECT_RULES = [
  EFFECT_SPEND_ONLY_MONOCOLORED_CHOSEN,
  EFFECT_SPEND_ONLY_CHOSEN_COLOR_ACTIVATE,
];
