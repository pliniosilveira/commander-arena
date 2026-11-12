/**
 * The effect of the meld ability (D-278, CR 701.42a, 701.42b, 701.42c, 712.4a, 712.14c): "exile them, then meld them into Brisela, Voice of Nightmares". One
 * instruction of two clauses that name the same two objects, read together: the objects are "this and the creature named X" of the condition that goes with it.
 */
import { fail, pattern } from '../../combinators';
import { defineRule, quietly, spanned } from '../registry';
import { type Clauses, makeClause } from './operands';

/**
 * `effect.meld`: "exile them, then meld them into Brisela, Voice of Nightmares" (CR 701.42a: to meld two cards is to put them onto the battlefield with their back faces
 * up and combined, which the instruction does after exiling them). `them` is the permanent the ability belongs to and the permanent its condition names; the name after
 * "into" is the combined face of the pair, to the end of the sentence (it may hold a comma). Not read: another verb in front or behind, "meld it", "meld them" with no exile
 * before it, "then meld them" without a name, a name with a period.
 */
export const EFFECT_MELD = defineRule<Clauses>({
  id: 'effect.meld',
  family: 'effect',
  leading: ['exile'],
  cites: [
    'CR 701.42a (Meld)',
    'CR 701.42b (Meld)',
    'CR 701.42c (Meld)',
    'CR 712.4a (Double-Faced Cards)',
    'CR 712.14c (Double-Faced Cards)',
  ],
  examples: [
    'exile them, then meld them into Brisela, Voice of Nightmares',
    'exile them, then meld them into Chittering Host',
    'exile them, then meld them into Hanweir, the Writhing Township',
  ],
  rejects: [
    'exile them',
    'exile them, then meld them',
    'exile them, then meld them into',
    'exile it, then meld it into Chittering Host',
    'exile them and meld them into Chittering Host',
    'meld them into Chittering Host',
    'exile them, then meld them into Chittering Host.',
    'exile them, then meld them into Chittering Host, then draw a card.',
    'exile target creature, then meld them into Chittering Host',
    'you may exile them, then meld them into Chittering Host',
    'exile them, then return them to the battlefield',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      pattern(/[Ee]xile them, then meld them into ([A-Z][^.]*[^.\s])(?![\p{L}\p{N}])/u),
    )(ctx, pos);
    if (!r.ok) return r;
    const { value: match, span } = r.value;
    const result = match[1];
    if (result === undefined) return fail(ctx, pos);
    // A clause after the name ("..., then draw a card") is another instruction, and the name would swallow it: the name has no ", then ".
    if (/, (?:then|and)\b/u.test(result)) return fail(ctx, pos);
    return {
      ok: true,
      value: [
        makeClause(
          'effect.meld',
          'meld',
          { result: { kind: 'name', name: result.trim(), span, rule: 'effect.meld' } },
          span,
        ),
      ],
      pos: r.pos,
    };
  },
});

export const MELD_EFFECT_RULES = [EFFECT_MELD].map(quietly);
