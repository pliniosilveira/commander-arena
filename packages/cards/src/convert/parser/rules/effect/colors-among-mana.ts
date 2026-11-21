/**
 * Effect rule of "For each color among permanents you control, add one mana of that color." (Faeburrow Elder, CR 105.2, 106.1b, 605.3b): one mana of each of the colors the
 * permanents have between them. The lowering (`lowerMana`, read by `lowerManaAbility`) reads it only as a mana ability, the engine's `eachColorAmong`.
 */
import { literal, pattern, satisfy, sequence } from '../../combinators';
import type { IrNoun } from '../../ir/types';
import { defineRule, family } from '../registry';
import { type Clauses, single } from './operands';

/**
 * `effect.add-mana-each-color`: "for each color among permanents you control, add one mana of that color" (CR 105.2: a color counts once however many permanents have it and
 * colorless is no color; CR 605.3b: a mana ability resolves at once, so the colors are those of the permanents as it is activated). The permanents are the controller's own. Not
 * read: another count of mana ("add two mana of that color"), another controller, "for each color" with no permanents, "each color among permanents you control" with no
 * "for", a choice of which colors, another instruction after it.
 */
export const EFFECT_ADD_MANA_EACH_COLOR = defineRule<Clauses>({
  id: 'effect.add-mana-each-color',
  family: 'effect',
  leading: ['for'],
  cites: [
    'CR 105.2 (Colors)',
    'CR 106.1b (Mana)',
    'CR 605.3b (Mana Abilities)',
    'CR 608.2c (Resolving Spells and Abilities)',
  ],
  examples: [
    'for each color among permanents you control, add one mana of that color',
    'for each color among creatures you control, add one mana of that color',
    'for each color among nonland permanents you control, add one mana of that color',
  ],
  rejects: [
    'for each color among permanents you control, add two mana of that color',
    'for each color among permanents you control, add one mana of any color',
    'for each color among permanents you control, add {G}',
    'for each color among permanents, add one mana of that color',
    'for each color among permanents your opponents control, add one mana of that color',
    'for each color among other permanents you control, add one mana of that color',
    'for each color, add one mana of that color',
    'for each colors among permanents you control, add one mana of that color',
    'for each color among permanents you control, add one mana of that color and draw a card',
    'for each color among permanents you control add one mana of that color',
    'each color among permanents you control, add one mana of that color',
    'add one mana of each color among permanents you control',
  ],
  parse: single(
    'effect.add-mana-each-color',
    sequence(
      literal('for each color among '),
      satisfy(
        family<IrNoun>('noun', { only: ['noun.plain-permanents'] }),
        (noun) => noun.filter.controller === 'you' && !noun.other,
      ),
      pattern(/, add one mana of that color(?![\p{L}\p{N}])(?!\s+(?:and|then)(?![\p{L}\p{N}]))/iu),
    ),
    ([, of]) => ({
      verb: 'addMana',
      args: {
        mana: {
          kind: 'manaSpec',
          what: { kind: 'eachColorAmong', of },
          span: of.span,
          rule: 'effect.add-mana-each-color',
        },
      },
    }),
  ),
});

export const COLORS_AMONG_MANA_EFFECT_RULES = [EFFECT_ADD_MANA_EACH_COLOR];
