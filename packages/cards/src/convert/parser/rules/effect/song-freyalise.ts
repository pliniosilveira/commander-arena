/**
 * Effect rule of the Hatsune Miku deck (issue 145, Song of Freyalise): "Until your next turn, creatures you control gain "{T}: Add one mana of any color."" (CR 613.1f, 605.1a,
 * 611.2a: a continuous effect that gives a mana ability; CR 500.1: the next turn of its controller).
 */
import { fail, literal, pattern } from '../../combinators';
import type { IrClause, IrDuration, IrNoun } from '../../ir/types';
import { defineRule, family } from '../registry';
import { QUOTED_MANA } from '../static/grants';
import { type Clauses, makeClause } from './operands';

const ID = 'effect.lead-gain-mana-ability-all';

/**
 * `effect.lead-gain-mana-ability-all`: "Until your next turn, creatures you control gain "{T}: Add one mana of any color."" (CR 613.1f: a layer 6 effect; CR 611.2c: the creatures
 * are those you control as the effect resolves; CR 605.1a: an activated ability that adds mana is a mana ability). Not read: another duration, a group other than the creatures
 * you control, "have" for "gain", an ability that is not a mana ability, a bare keyword, a target.
 */
export const EFFECT_LEAD_GAIN_MANA_ABILITY_ALL = defineRule<Clauses>({
  id: ID,
  family: 'effect',
  leading: ['until'],
  cites: [
    'CR 613.1f (Interaction of Continuous Effects)',
    'CR 611.2a (Continuous Effects)',
    'CR 611.2c (Continuous Effects)',
    'CR 605.1a (Mana Abilities)',
    'CR 500.1 (Beginning of Turn)',
  ],
  examples: [
    'Until your next turn, creatures you control gain "{T}: Add one mana of any color."',
    'until your next turn, creatures you control gain "{T}: Add {G}."',
  ],
  rejects: [
    'Until end of turn, creatures you control gain "{T}: Add one mana of any color."',
    'Until your next turn, creatures you control have "{T}: Add one mana of any color."',
    'Until your next turn, target creature gains "{T}: Add one mana of any color."',
    'Until your next turn, creatures you control gain vigilance',
    'Until your next turn, creatures you control gain "{T}: Draw a card."',
    'Until your next turn, creatures your opponents control gain "{T}: Add one mana of any color."',
    'Until your next turn creatures you control gain "{T}: Add one mana of any color."',
    'Until your next turn, creatures you control gain "{T}: Add one mana of any color." and draw a card',
  ],
  parse: (ctx, pos) => {
    // "Until your next turn" (CR 500.1, 611.2a): the duration family reads only "until end of turn", the rules that need this one read it themselves.
    const until = pattern(/until your next turn(?![\p{L}\p{N}])/iu)(ctx, pos);
    if (!until.ok) return until;
    const duration: { readonly value: IrDuration; readonly pos: number } = {
      value: {
        kind: 'duration',
        scope: 'untilYourNextTurn',
        span: { start: pos, end: until.pos },
        rule: ID,
      },
      pos: until.pos,
    };
    const comma = literal(', ')(ctx, duration.pos);
    if (!comma.ok) return comma;
    const subject = family<IrNoun>('noun', { only: ['noun.plain-permanents'] })(ctx, comma.pos);
    if (!subject.ok) return subject;
    const filter = subject.value.filter;
    if (
      filter.controller !== 'you' ||
      filter.types?.length !== 1 ||
      filter.types[0] !== 'creature' ||
      subject.value.other
    ) {
      return fail(ctx, comma.pos);
    }
    const gain = literal(' gain ')(ctx, subject.pos);
    if (!gain.ok) return gain;
    const quoted = QUOTED_MANA(ctx, gain.pos);
    if (!quoted.ok) return quoted;
    const [granted] = quoted.value;
    if (granted?.kind !== 'grantAbility') return fail(ctx, gain.pos);
    const clause: IrClause = {
      ...makeClause(
        ID,
        'grantManaAbility',
        { objects: subject.value, ability: granted.ability },
        granted.ability.span,
      ),
      duration: duration.value,
    };
    return { ok: true, value: [clause], pos: quoted.pos };
  },
});

export const SONG_FREYALISE_EFFECT_RULES = [EFFECT_LEAD_GAIN_MANA_ABILITY_ALL];
