/**
 * Conditions of the Niv-Mizzet deck program (issue 25, D-318): what the engine's per-seat count of spells cast tells. "You've cast three or more spells this
 * turn" (CR 601.2i: a spell is cast once it is on the stack with its costs paid; the count of the turn adds them up).
 */
import { choice, fail, map, pattern, satisfy, sequence } from '../../combinators';
import type { IrCondition } from '../../ir/types';
import { quantity } from '../amount/index';
import { BOUNDARY, typeChoice } from '../noun/phrases';
import { defineRule, spanned } from '../registry';

/** The card types a spell can have (CR 205.2a, 304, 307): "instant or sorcery", "creature", "artifact", the words of the spell phrases. */
const SPELL_TYPES = 'artifact|battle|creature|enchantment|instant|planeswalker|sorcery';

/** "an instant", "a creature": the article the first word of the types takes (CR 205.2a words, English "a" before a consonant). */
const articleOf = (word: string): string => (/^[aeiou]/iu.test(word) ? 'an' : 'a');

/**
 * `condition.spells-cast-this-turn`: "you've cast three or more spells this turn", "you have cast two or more spells this turn" (CR 602.5b, 601.2i: the spells
 * the controller has cast this turn, from every zone, a copy never counted, CR 707.10) and, since the Feather deck (D-444), "you've cast an instant or sorcery spell this
 * turn", "you've cast a creature spell this turn": one spell of one of the card types named (`ofTypes`), read from the types the spell was cast with. The engine's
 * `spellsCastThisTurn`, read as the ability is activated. Not read: "or fewer", "an opponent has cast", a kind of spell with a count ("two or more creature spells"), a color or
 * a subtype ("a red spell", "a Dragon spell"), a noncreature spell, zero, a variable count, "a spell" with no kind.
 */
export const CONDITION_SPELLS_CAST_THIS_TURN = defineRule<IrCondition>({
  id: 'condition.spells-cast-this-turn',
  family: 'condition',
  leading: ["you've", 'you’ve', 'you'],
  cites: [
    'CR 602.5b (Activating Activated Abilities)',
    'CR 601.2i (Casting Spells)',
    'CR 707.10 (Copying Objects)',
    'CR 205.2a (Card Types)',
  ],
  examples: [
    "you've cast three or more spells this turn",
    'you’ve cast three or more spells this turn',
    'you have cast two or more spells this turn',
    "you've cast 3 or more spells this turn",
    "you've cast five or more spells this turn",
    "you've cast one or more spells this turn",
    // D-444: one spell of a kind.
    "you've cast an instant or sorcery spell this turn",
    'you’ve cast an instant or sorcery spell this turn',
    'you have cast an instant or sorcery spell this turn',
    "you've cast a creature spell this turn",
    "you've cast an artifact spell this turn",
    "you've cast a creature or planeswalker spell this turn",
  ],
  rejects: [
    "you've cast three or more spells",
    "you've cast three or more spells this turn.",
    "you've cast three or more instant or sorcery spells this turn",
    "you've cast three or fewer spells this turn",
    "you've cast a spell this turn",
    "you've cast 0 or more spells this turn",
    "you've cast X or more spells this turn",
    'an opponent has cast three or more spells this turn',
    "you've cast three spells this turn",
    "you've cast three or more spells this game",
    'you cast three or more spells this turn',
    "you've cast three or more spells this turn and",
    // D-444: the article, the number of the noun, the words after it.
    "you've cast a instant or sorcery spell this turn",
    "you've cast an creature spell this turn",
    "you've cast an instant or sorcery spells this turn",
    "you've cast an instant or sorcery spell",
    "you've cast an instant or sorcery spell this game",
    "you've cast an instant or sorcery spell this turn and",
    "you've cast an instant or instant spell this turn",
    "you've cast a noncreature spell this turn",
    "you've cast a red spell this turn",
    "you've cast a Dragon spell this turn",
    "you've cast an instant, sorcery spell this turn",
  ],
  parse: (ctx, pos) => {
    const head = pattern(/you(?:'ve|’ve| have) cast /iu)(ctx, pos);
    if (!head.ok) return head;
    const span = (end: number) => ({ start: pos, end });
    // D-444: "an instant or sorcery spell this turn": one spell with one of the types.
    const kind = sequence(
      pattern(/(an?) /iu),
      // One type, or two or more joined by "or" (`typeChoice` reads the lists).
      choice(
        typeChoice(SPELL_TYPES),
        map(pattern(new RegExp(`(?:${SPELL_TYPES})${BOUNDARY}`, 'iu')), (m) => [
          m[0].toLowerCase(),
        ]),
      ),
      pattern(new RegExp(` spell this turn${BOUNDARY}`, 'iu')),
    )(ctx, head.pos);
    if (kind.ok) {
      const [article, types] = kind.value;
      const [first] = types;
      if (first === undefined || (article[1] ?? '').toLowerCase() !== articleOf(first)) {
        return fail(ctx, pos);
      }
      return {
        ok: true,
        value: {
          kind: 'condition',
          test: { kind: 'spellsCastThisTurn', atLeast: 1, ofTypes: types },
          span: span(kind.pos),
          rule: 'condition.spells-cast-this-turn',
        },
        pos: kind.pos,
      };
    }
    const r = sequence(
      spanned(satisfy(quantity, (n) => n >= 1)),
      pattern(new RegExp(` or more spells this turn${BOUNDARY}`, 'iu')),
    )(ctx, head.pos);
    if (!r.ok) return r;
    const [count] = r.value;
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: { kind: 'spellsCastThisTurn', atLeast: count.value },
        span: span(r.pos),
        rule: 'condition.spells-cast-this-turn',
      },
      pos: r.pos,
    };
  },
});

export const SPELLS_CAST_CONDITION_RULES = [CONDITION_SPELLS_CAST_THIS_TURN];
