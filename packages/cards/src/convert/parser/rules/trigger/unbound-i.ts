/**
 * Trigger rule of group I of the Quandrix Unlimited deck (Unbound Flourishing): "you cast an instant or sorcery spell or activate an ability" (CR 601.2i, 602.2, 603.2c). One ability with
 * two events: the engine's `castSpell` of the kind of spell named, and `activatesAbility` of any ability that uses the stack (`anySource`: "an ability", not only one of a permanent).
 * The "if" that follows ("if that spell's mana cost or that ability's activation cost contains {X}", `condition.cost-contains-x`) is read by the lowering of the trigger.
 */
import { literal, map, pattern, sequence } from '../../combinators';
import type { IrTrigger } from '../../ir/types';
import { spellPhrase, withoutZone } from '../noun/phrases';
import { defineRule, spanned } from '../registry';
import { makeNoun } from './subjects';

const NOT_IN_WORD = '(?![\\p{L}\\p{N}])';

/**
 * `trigger.cast-or-activate`: "you cast an instant or sorcery spell or activate an ability", "you cast a spell or activate an ability" (CR 603.2c: the two events are one ability that
 * triggers once for each). Not read: another player, "an ability of a permanent", "a mana ability", "abilities", either half alone, a third event.
 */
export const TRIGGER_CAST_OR_ACTIVATE = defineRule<IrTrigger>({
  id: 'trigger.cast-or-activate',
  family: 'trigger',
  leading: ['you'],
  cites: [
    'CR 601.2i (Casting Spells)',
    'CR 602.2 (Activating Activated Abilities)',
    'CR 603.2 (Handling Triggered Abilities)',
    'CR 603.2c (Handling Triggered Abilities)',
  ],
  examples: [
    'you cast an instant or sorcery spell or activate an ability',
    'you cast a spell or activate an ability',
    'you cast a creature spell or activate an ability',
  ],
  rejects: [
    'you cast an instant or sorcery spell',
    'you activate an ability',
    'you cast an instant or sorcery spell or activate an ability of a permanent',
    'you cast an instant or sorcery spell or activate a mana ability',
    'you cast an instant or sorcery spell or activate abilities',
    'you cast an instant or sorcery spell or activate an ability or',
    'you cast an instant or sorcery spell or activate an ability and',
    'an opponent casts an instant or sorcery spell or activates an ability',
    'you cast an instant or sorcery spell or you activate an ability',
    'you cast it or activate an ability',
  ],
  parse: (ctx, pos) => {
    const id = 'trigger.cast-or-activate';
    const r = sequence(
      literal('you cast '),
      pattern(/an? /iu),
      spanned(map(spellPhrase(), withoutZone)),
      pattern(
        new RegExp(
          ` or activate an ability${NOT_IN_WORD}(?!\\s+(?:of|or|and)${NOT_IN_WORD})`,
          'iu',
        ),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, , spell] = r.value;
    const span = { start: pos, end: r.pos };
    const you = makeNoun(id, { start: pos, end: pos + 3 }, 'you', { raw: 'you' });
    const activate: IrTrigger = {
      kind: 'trigger',
      event: 'activatesAbility',
      actor: you,
      args: { anySource: { kind: 'flag', value: true, span, rule: id } },
      span,
      rule: id,
    };
    return {
      ok: true,
      value: {
        kind: 'trigger',
        event: 'cast',
        subject: makeNoun(id, spell.span, 'a', spell.value),
        actor: you,
        args: {},
        alternatives: [activate],
        span,
        rule: id,
      },
      pos: r.pos,
    };
  },
});

export const UNBOUND_I_TRIGGER_RULES = [TRIGGER_CAST_OR_ACTIVATE];
