/**
 * The condition of the meld ability (D-992, CR 701.42a, 712.4a, 603.4): "if you both own and control ~ and a creature named Bruna, the Fading Light". The
 * intervening "if" of a triggered ability of a meld card: the card itself and a permanent of a card type with the counterpart's name, both owned and controlled by the
 * controller of the ability.
 */
import { fail, pattern } from '../../combinators';
import type { IrCondition } from '../../ir/types';
import { defineRule, spanned } from '../registry';

/** The card types a named permanent can be (the meld ability names a creature; the other permanent types are read the same way). */
const NAMED_TYPES = 'creature|artifact|land|enchantment|planeswalker';

/**
 * `condition.own-and-control-named`: "you both own and control ~ and a creature named Bruna, the Fading Light" (CR 701.42a: the ability of a meld card names its
 * counterpart; CR 108.3, 109.4: owner and controller are different things, and the text asks for both). The name is what follows "named" to the end of the condition,
 * which may hold a comma ("Bruna, the Fading Light"; the segmenter keeps a comma that is followed by "the" or a capital letter inside a name). Not read: "you control
 * ~ and ...", "you own and control ~ and a creature named X" without "both", a count, another card than the card itself ("Bruna and Gisela"), a name with a period.
 */
export const CONDITION_OWN_AND_CONTROL_NAMED = defineRule<IrCondition>({
  id: 'condition.own-and-control-named',
  family: 'condition',
  leading: ['you'],
  cites: [
    'CR 701.42a (Meld)',
    'CR 712.4a (Double-Faced Cards)',
    'CR 603.4 (Handling Triggered Abilities)',
    'CR 108.3 (Cards)',
    'CR 109.4 (Objects)',
  ],
  examples: [
    'you both own and control ~ and a creature named Bruna, the Fading Light',
    'you both own and control ~ and a creature named Graf Rats',
    'you both own and control ~ and an artifact named The Mightstone and Weakstone',
  ],
  rejects: [
    'you control ~ and a creature named Graf Rats',
    'you own and control ~ and a creature named Graf Rats',
    'you both own and control ~ and a creature',
    'you both own and control ~ and a creature named',
    'you both own and control ~ and creatures named Graf Rats',
    'you both own and control ~ and two creatures named Graf Rats',
    'you both own and control Graf Rats and a creature named Midnight Scavengers',
    'you both own and control ~ and a creature named Graf Rats.',
    'you both own and control ~ and a card named Graf Rats',
    'you both own and control ~',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      pattern(
        new RegExp(
          `you both own and control ~ and an? (${NAMED_TYPES}) named ([^.]*[^.\\s])(?![\\p{L}\\p{N}])`,
          'u',
        ),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const { value: match, span } = r.value;
    const type = match[1];
    const name = match[2];
    // The whole text of the condition is the name: nothing may follow it in this phrase (a sentence end, or the end of the condition).
    if (type === undefined || name === undefined || name.trim() === '') return fail(ctx, pos);
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: { kind: 'ownsAndControlsNamed', name: name.trim(), type },
        span,
        rule: 'condition.own-and-control-named',
      },
      pos: r.pos,
    };
  },
});

export const MELD_CONDITION_RULES = [CONDITION_OWN_AND_CONTROL_NAMED];
