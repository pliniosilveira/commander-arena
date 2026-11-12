/**
 * The static ability of a melded face that the engine runs (D-282, CR 101.2, 601.2, 604.1, 202.3): "Your opponents can't cast spells with mana value 3 or less."
 * (the combined face of the pair of Bruna, the Fading Light and Gisela, the Broken Blade). One whole line.
 */
import { fail, pattern } from '../../combinators';
import type { IrComparison, IrFilter, IrNoun, IrStatic } from '../../ir/types';
import { defineRule } from '../registry';

/** The words that say how a mana value compares: "or less" is at most, "or greater" and "or more" at least, none is equal. */
const COMPARE_WORDS: Readonly<Record<string, IrComparison['cmp']>> = {
  less: 'atMost',
  lower: 'atMost',
  fewer: 'atMost',
  greater: 'atLeast',
  more: 'atLeast',
  higher: 'atLeast',
};

/**
 * `static.opponents-cant-cast-spells`: "Your opponents can't cast spells with mana value 3 or less." (CR 101.2: "can't" beats "can"; CR 604.1; CR 202.3: the
 * mana value of a spell, with the X of its cost as announced, CR 202.3e). While the permanent has the ability no opponent of its controller can cast a spell with that
 * mana value, by any means. The subject is the controller. Not read: another subject ("each opponent", "players"), a spell of a card type ("creature spells"), no
 * number ("spells with the highest mana value"), a time ("during your turn" has its own rule), "or activate abilities", and a number written in words.
 */
export const STATIC_OPPONENTS_CANT_CAST_SPELLS = defineRule<IrStatic>({
  id: 'static.opponents-cant-cast-spells',
  family: 'static',
  leading: ['your'],
  cites: [
    'CR 101.2 (The Magic Golden Rules)',
    'CR 604.1 (Handling Static Abilities)',
    'CR 601.2 (Casting Spells)',
    'CR 202.3 (Mana Cost and Color)',
    'CR 202.3e (Mana Cost and Color)',
  ],
  examples: [
    "Your opponents can't cast spells with mana value 3 or less.",
    'Your opponents can’t cast spells with mana value 3 or less.',
    "Your opponents can't cast spells with mana value 4 or greater.",
    "Your opponents can't cast spells with mana value 0.",
  ],
  rejects: [
    "Your opponents can't cast spells with mana value 3 or less",
    "Your opponents can't cast spells.",
    "Your opponents can't cast spells during your turn.",
    "Each opponent can't cast spells with mana value 3 or less.",
    "Your opponents can't cast creature spells with mana value 3 or less.",
    "Your opponents can't cast spells with mana value three or less.",
    "Your opponents can't cast spells with mana value 3 or less or activate abilities.",
    "Your opponents can't cast spells with mana value 3 or less during your turn.",
    "You can't cast spells with mana value 3 or less.",
    "Your opponents can't cast spells with mana value X or less.",
    "Your opponents can't cast spells with mana value 3 or less and you draw a card.",
  ],
  parse: (ctx, pos) => {
    const r = pattern(
      /your opponents can['’]t cast spells with mana value (\d+)(?: or (less|lower|fewer|greater|more|higher))?\./iu,
    )(ctx, pos);
    if (!r.ok) return r;
    const value = Number(r.value[1]);
    if (!Number.isSafeInteger(value)) return fail(ctx, pos);
    const cmp = COMPARE_WORDS[(r.value[2] ?? '').toLowerCase()] ?? 'equal';
    const id = 'static.opponents-cant-cast-spells';
    const span = { start: pos, end: r.pos };
    const spells: IrFilter = { manaValue: { cmp, value }, raw: ctx.text.slice(pos, r.pos) };
    const subject: IrNoun = {
      kind: 'noun',
      det: 'you',
      filter: { raw: 'you' },
      upTo: false,
      plural: false,
      other: false,
      span: { start: pos, end: pos + 4 },
      rule: id,
    };
    return {
      ok: true,
      value: {
        kind: 'static',
        subject,
        effects: [{ kind: 'opponentsCantCastSpells', spells }],
        span,
        rule: id,
      },
      pos: r.pos,
    };
  },
});

export const MELD_STATIC_RULES = [STATIC_OPPONENTS_CANT_CAST_SPELLS];
