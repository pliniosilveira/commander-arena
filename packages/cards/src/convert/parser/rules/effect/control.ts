/**
 * Effect rules of stage P42 (D-190): the control-change slice of the Korvold deck. "Gain control of that artifact until the end of your next turn"
 * (CR 613.1b, 611.2).
 */
import { choice, literal, map, optional, pattern, refuseAt, sequence } from '../../combinators';
import type { IrArg, IrClause, IrDuration, IrNoun } from '../../ir/types';
import { BOUNDARY, permanentPhrase } from '../noun/phrases';
import { defineRule, family, spanned } from '../registry';
import { perOpponentNoun } from './angels';
import { type Clauses, makeClause, single } from './operands';

const RULE = 'effect.gain-control';

/**
 * How long the control lasts, from the words after the object: "until end of turn", "until the end of your next turn" (the end of the next turn
 * of the controller of the effect, D-151) and "for as long as you control ~" (CR 611.2b); none is no duration (CR 611.2a: until the game ends).
 */
const DURATION = optional(
  spanned(
    choice(
      map(literal(' until end of turn'), () => 'untilEndOfTurn' as const),
      map(literal(' until the end of your next turn'), () => 'untilEndOfNextTurn' as const),
      map(literal(' for as long as you control ~'), () => 'whileYouControlSelf' as const),
      // CR 611.2b: "for as long as ~ remains on the battlefield", the duration of an ability of a permanent (issue 103).
      map(
        literal(' for as long as ~ remains on the battlefield'),
        () => 'whileSelfRemains' as const,
      ),
    ),
  ),
  null,
);

/**
 * The object of a control change: one permanent, a target, the permanent with the ability or the one an earlier word of the text names, or a group of the battlefield
 * ("each noncommander creature", "all artifacts that player controls"); never "up to" or a player.
 */
const GAIN_CONTROL_OBJECT = // One permanent: a target, or "that artifact" and "it" for what the text named before. A plural, "up to" and a player are other nouns.
  refuseAt(
    family<IrNoun>('noun', {
      only: [
        'noun.target-permanent',
        // Ahoy Mateys group 7 (Admiral Beckett Brass): "target nonland permanent controlled by a player who was dealt combat damage by three or more Pirates this turn".
        'noun.target-permanent-controller-dealt-damage-by',
        // Hosts of Mordor deck (Wake the Dragon): "gain control of target artifact that player controls", the player of the combat damage event of a trigger.
        'noun.target-permanent-of-that-player',
        // Limit Break deck, group 4 (Hellkite Tyrant): "gain control of all artifacts that player controls", a group of the permanents the player the text named controls.
        'noun.all-permanents-of-that-player',
        // Riders of Rohan deck, group B (Call for Aid): "gain control of all creatures target opponent controls until end of turn", the group of a player chosen as a target.
        'noun.all-permanents-of-target-player',
        // Hosts of Mordor deck (Subjugate the Hobbits): "gain control of each noncommander creature with mana value 3 or less", a group of the battlefield.
        'noun.each-permanent',
        // Hosts of Mordor deck (Grishnákh): "target nonlegendary creature an opponent controls with power less than or equal to the amassed Army's power".
        'noun.target-permanent-power-at-most-amassed',
        'noun.that-object',
        'noun.it',
        'noun.self',
      ],
    }),
    (n) =>
      (!n.plural ||
        n.rule === 'noun.all-permanents-of-that-player' ||
        n.rule === 'noun.all-permanents-of-target-player' ||
        n.rule === 'noun.each-permanent') &&
      !n.upTo &&
      n.filter.player === undefined,
    (_n, _ctx, start) => start,
  );

/**
 * `effect.gain-control`: "gain control of target creature until end of turn", "gain control of that artifact until the end of your next turn",
 * "gain control of target artifact for as long as you control ~", "gain control of target creature" (CR 613.1b: a control-changing effect is
 * applied in layer 2; CR 611.2a: its duration is the one it states, and none stated means the rest of the game; CR 611.2c: the permanent is
 * fixed when it begins). One object, a target, the permanent with the ability ("gain control of ~") or the permanent an earlier word of the text names ("that artifact", "it"); the player who gains
 * control is the controller of the ability. A group, "up to" and a player who is not "you" are other lines, and so are the durations the engine has
 * no node for ("until your next turn", "for as long as ~ remains tapped").
 */
export const EFFECT_GAIN_CONTROL = defineRule<Clauses>({
  id: RULE,
  family: 'effect',
  leading: ['gain'],
  cites: [
    'CR 613.1b (Interaction of Continuous Effects)',
    'CR 611.2a (Continuous Effects)',
    'CR 611.2b (Continuous Effects)',
    'CR 611.2c (Continuous Effects)',
    'CR 110.2 (Permanents)',
  ],
  examples: [
    'gain control of target creature until end of turn',
    'gain control of target creature',
    'gain control of target artifact until the end of your next turn',
    'gain control of that artifact until the end of your next turn',
    'gain control of that creature until end of turn',
    'gain control of it until end of turn',
    'gain control of target creature for as long as you control ~',
    'gain control of target creature for as long as ~ remains on the battlefield',
    'gain control of target permanent until end of turn',
    'gain control of target creature an opponent controls until end of turn',
    'gain control of each noncommander creature with mana value 3 or less',
    'gain control of each creature until end of turn',
    'gain control of target artifact that player controls',
    'gain control of ~',
    'gain control of ~ until end of turn',
    'gain control of all artifacts that player controls',
    // Riders of Rohan deck, group B (Call for Aid, CR 613.1b, 611.2c): every creature of the player chosen as a target, for the turn.
    'gain control of all creatures target opponent controls until end of turn',
    'gain control of all creatures target player controls',
    'gain control of target nonland permanent controlled by a player who was dealt combat damage by three or more Pirates this turn',
  ],
  rejects: [
    'gain control of target creature until your next turn',
    'gain control of target creature until end of combat',
    'gain control of target creature for as long as ~ remains tapped',
    'gain control of target creature for as long as you control a Dragon',
    'gain control of target creature until end of turn and untap it',
    'gain control of target creatures until end of turn',
    'gain control of up to one target creature until end of turn',
    'gain control of all creatures until end of turn',
    'gain control of target player until end of turn',
    'gain control of target creature until end of turn, then',
    'gains control of target creature until end of turn',
    'gain control of that card until end of turn',
    'gain control of target creature until the end of turn',
    'gain control of target creature until the end of your turn',
    'gain control of target creature and target land until end of turn',
  ],
  parse: single(
    RULE,
    sequence(literal('gain control of '), GAIN_CONTROL_OBJECT, DURATION),
    ([, objects, ended]) => {
      const duration: IrDuration | undefined =
        ended === null
          ? undefined
          : { kind: 'duration', scope: ended.value, span: ended.span, rule: RULE };
      return {
        verb: 'gainControl',
        args: { objects },
        ...(duration === undefined ? {} : { duration }),
      };
    },
  ),
});

/**
 * `effect.lead-gain-control`: "until end of turn, gain control of target nonlegendary creature an opponent controls with power less than or equal to the amassed Army's power"
 * (Grishnákh, Brash Instigator, CR 613.1b, 611.2a): `effect.gain-control` with its duration said first, as "Until end of turn, target creature gets +2/+2" says it. Only "until end of
 * turn", and no duration after the object.
 */
export const EFFECT_LEAD_GAIN_CONTROL = defineRule<Clauses>({
  id: 'effect.lead-gain-control',
  family: 'effect',
  leading: ['until'],
  cites: [
    'CR 613.1b (Interaction of Continuous Effects)',
    'CR 611.2a (Continuous Effects)',
    'CR 514.2 (Cleanup Step)',
  ],
  examples: [
    'until end of turn, gain control of target creature',
    'Until end of turn, gain control of target creature an opponent controls',
    "until end of turn, gain control of target nonlegendary creature an opponent controls with power less than or equal to the amassed Army's power",
  ],
  rejects: [
    'until end of turn, gain control of target creature until end of turn',
    'until end of turn, gain control of target creatures',
    'until end of turn, gain control of up to one target creature',
    'until your next turn, gain control of target creature',
    'until the end of turn, gain control of target creature',
    'until end of turn gain control of target creature',
    'until end of turn, gains control of target creature',
    'until end of turn, gain control of target player',
    'until end of turn, gain control of target creature and untap it',
  ],
  parse: single(
    'effect.lead-gain-control',
    sequence(
      spanned(literal('until end of turn, ')),
      literal('gain control of '),
      GAIN_CONTROL_OBJECT,
    ),
    ([lead, , objects]) => {
      const duration: IrDuration = {
        kind: 'duration',
        scope: 'untilEndOfTurn',
        span: lead.span,
        rule: 'effect.lead-gain-control',
      };
      return { verb: 'gainControl', args: { objects }, duration };
    },
  ),
});

/**
 * `effect.gain-control-per-opponent`: "for each opponent, gain control of up to one target creature that player controls until end of turn" (In the Darkness Bind Them, CR 115.1,
 * 601.2c, 613.1b, 611.2: one slot that takes at most one target of each opponent, as `effect.exile-per-opponent` reads it, and the controller of the ability gains control of each
 * chosen creature for the duration). "Up to one" only; the permanent is whatever phrase of the permanent family names no controller ("that player controls" is the controller). The
 * group of chosen creatures is plural for the sentences after it ("Untap those creatures. They gain haste until end of turn.").
 */
export const EFFECT_GAIN_CONTROL_PER_OPPONENT = defineRule<Clauses>({
  id: `${RULE}-per-opponent`,
  family: 'effect',
  leading: ['for'],
  cites: [
    'CR 115.1 (Targets)',
    'CR 601.2c (Casting Spells)',
    'CR 613.1b (Interaction of Continuous Effects)',
    'CR 611.2a (Continuous Effects)',
  ],
  examples: [
    'for each opponent, gain control of up to one target creature that player controls until end of turn',
    'for each opponent, gain control of up to one target artifact that player controls',
  ],
  rejects: [
    'for each opponent, gain control of target creature that player controls until end of turn',
    'for each opponent, gain control of up to two target creatures that player controls until end of turn',
    'for each opponent, gain control of up to one target creature until end of turn',
    'for each opponent, gain control of up to one target creature you control until end of turn',
    'for each opponent, gain control of up to one target creature an opponent controls until end of turn',
    'for each player, gain control of up to one target creature that player controls until end of turn',
    'for each other opponent, gain control of up to one target creature that player controls until end of turn',
    'gain control of up to one target creature that player controls until end of turn',
    'for each opponent, gain control of up to one target creature that player controls until your next turn',
    'for each opponent, gain control of up to one target creature that player controls until end of turn and draw a card',
    'for each opponent, gains control of up to one target creature that player controls until end of turn',
  ],
  parse: (ctx, pos) => {
    const id = `${RULE}-per-opponent`;
    const head = literal('for each opponent, gain control of up to one target ')(ctx, pos);
    if (!head.ok) return head;
    const noun = perOpponentNoun(ctx, pos, 'gain control of', head.pos, id);
    if (!noun.ok) return noun;
    const ended = DURATION(ctx, noun.pos);
    if (!ended.ok) return ended;
    const end = ended.pos;
    const span = { start: pos, end };
    const duration: IrDuration | undefined =
      ended.value === null
        ? undefined
        : { kind: 'duration', scope: ended.value.value, span: ended.value.span, rule: id };
    return {
      ok: true,
      value: [
        {
          ...makeClause(id, 'gainControl', { objects: { ...noun.value, plural: true } }, span),
          ...(duration === undefined ? {} : { duration }),
        },
      ],
      pos: end,
    };
  },
});

/** "Target player gains control of up to N target creatures" (CR 613.1b, 611.2c): one target player controls the chosen target group. */
export const EFFECT_GAIN_CONTROL_FOR_PLAYER = defineRule<Clauses>({
  id: `${RULE}-for-player`,
  family: 'effect',
  leading: ['target'],
  cites: [
    'CR 115.1 (Targets)',
    'CR 601.2c (Casting Spells)',
    'CR 611.2c (Continuous Effects)',
    'CR 613.1b (Interaction of Continuous Effects)',
  ],
  examples: [
    'target player gains control of up to three target nonattacking creatures until end of turn',
  ],
  rejects: [
    'target player gains control of target creature until end of turn',
    'target player gains control of up to three creatures until end of turn',
  ],
  parse: single(
    `${RULE}-for-player`,
    sequence(
      refuseAt(
        family<IrNoun>('noun', { only: ['noun.player'] }),
        (n) => n.det === 'target' && n.filter.player !== undefined,
        (_n, _ctx, start) => start,
      ),
      literal(' gains control of '),
      refuseAt(
        family<IrNoun>('noun', { only: ['noun.target-permanent'] }),
        (n) =>
          n.plural &&
          n.det === 'target' &&
          n.filter.types?.length === 1 &&
          n.filter.types[0] === 'creature' &&
          n.upTo === true,
        (_n, _ctx, start) => start,
      ),
      DURATION,
    ),
    ([player, , objects, ended]) => {
      const duration: IrDuration | undefined =
        ended === null
          ? undefined
          : { kind: 'duration', scope: ended.value, span: ended.span, rule: `${RULE}-for-player` };
      return {
        verb: 'gainControl',
        args: { player, objects },
        ...(duration === undefined ? {} : { duration }),
      };
    },
  ),
});

/**
 * `effect.control-while-remains`: "For as long as ~ remains on the battlefield, gain control of that permanent, it loses all abilities, and it can't attack or
 * block." (issue 103, CR 611.2b, 613.1b, 613.1f, 613.11): the permanent an earlier sentence chose is controlled by the controller of the ability, loses its
 * abilities and can't attack or block, all of it for as long as the permanent with the ability remains on the battlefield. Three effects with the one duration:
 * the engine's `gainControl`, `loseAllAbilities` and a `restrict` of each of the two restrictions. Not read: another duration, another list of effects, another
 * order, a target in place of the permanent the text named.
 */
export const EFFECT_CONTROL_WHILE_REMAINS = defineRule<Clauses>({
  id: 'effect.control-while-remains',
  family: 'effect',
  leading: ['for'],
  cites: [
    'CR 611.2b (Continuous Effects)',
    'CR 613.1b (Interaction of Continuous Effects)',
    'CR 613.1f (Interaction of Continuous Effects)',
    'CR 613.11 (Interaction of Continuous Effects)',
  ],
  examples: [
    "for as long as ~ remains on the battlefield, gain control of that permanent, it loses all abilities, and it can't attack or block",
    'For as long as ~ remains on the battlefield, gain control of that creature, it loses all abilities, and it can’t attack or block',
  ],
  rejects: [
    "for as long as you control ~, gain control of that permanent, it loses all abilities, and it can't attack or block",
    "for as long as ~ remains on the battlefield, gain control of that permanent, it loses all abilities, and it can't attack",
    "for as long as ~ remains on the battlefield, gain control of that permanent and it loses all abilities and it can't attack or block",
    "for as long as ~ remains on the battlefield, gain control of that permanent, it loses all abilities, and it can't block or attack",
    "for as long as ~ remains on the battlefield, gain control of target permanent, it loses all abilities, and it can't attack or block",
    "for as long as ~ remains on the battlefield, gain control of those permanents, it loses all abilities, and it can't attack or block",
    "gain control of that permanent, it loses all abilities, and it can't attack or block",
    "for as long as ~ remains on the battlefield, gain control of that permanent, it loses all abilities, and it can't attack or block and draw a card",
  ],
  parse: (ctx, pos) => {
    const rule = 'effect.control-while-remains';
    const lead = spanned(literal('for as long as ~ remains on the battlefield, gain control of '))(
      ctx,
      pos,
    );
    if (!lead.ok) return lead;
    const object = refuseAt(
      family<IrNoun>('noun', { only: ['noun.that-object'] }),
      (n) => !n.plural,
      (_n, _ctx, start) => start,
    )(ctx, lead.pos);
    if (!object.ok) return object;
    const middle = literal(', ')(ctx, object.pos);
    if (!middle.ok) return middle;
    const it = family<IrNoun>('noun', { only: ['noun.it'] })(ctx, middle.pos);
    if (!it.ok) return it;
    const loses = spanned(literal(' loses all abilities, and '))(ctx, it.pos);
    if (!loses.ok) return loses;
    const again = family<IrNoun>('noun', { only: ['noun.it'] })(ctx, loses.pos);
    if (!again.ok) return again;
    const cant = spanned(pattern(/ can['’]t attack or block(?![\p{L}\p{N}])/iu))(ctx, again.pos);
    if (!cant.ok) return cant;
    const span = { start: pos, end: cant.pos };
    const duration: IrDuration = { kind: 'duration', scope: 'whileSelfRemains', span, rule };
    const restriction = (kind: 'cantAttack' | 'cantBlock'): IrArg => ({
      kind: 'restrictionKind',
      restriction: kind,
      span: cant.value.span,
      rule,
    });
    const clauses: IrClause[] = [
      {
        ...makeClause(rule, 'gainControl', { objects: object.value }, lead.value.span),
        duration,
        connector: 'and',
      },
      {
        ...makeClause(rule, 'loseAllAbilities', { objects: it.value }, loses.value.span),
        duration,
        connector: 'and',
      },
      {
        ...makeClause(
          rule,
          'restrict',
          { objects: again.value, restriction: restriction('cantAttack') },
          cant.value.span,
        ),
        duration,
        connector: 'and',
      },
      {
        ...makeClause(
          rule,
          'restrict',
          { objects: again.value, restriction: restriction('cantBlock') },
          cant.value.span,
        ),
        duration,
      },
    ];
    return { ok: true, value: clauses, pos: cant.pos };
  },
});

/**
 * `effect.exchange-control-of-all`: "You and that opponent each gain control of all creatures the other controls until end of turn." (CR 701.12a, 613.1b, 611.2a, 611.2c): the group of
 * a kind of permanent that the controller of the effect controls and the group the other player controls change hands together, the other player being the one an earlier
 * word of the text named ("that opponent", "that player"); the engine's `exchangeControlOfAll`. "Those creatures" after it are the permanents exchanged (`moved`). Not read: a target
 * as the other player (it would need a slot of its own), "each" or "all" of every player's, a controller stated for the group, another duration.
 */
export const EFFECT_EXCHANGE_CONTROL_OF_ALL = defineRule<Clauses>({
  id: 'effect.exchange-control-of-all',
  family: 'effect',
  leading: ['you'],
  cites: [
    'CR 701.12a (Exchange)',
    'CR 613.1b (Interaction of Continuous Effects)',
    'CR 611.2a (Continuous Effects)',
    'CR 611.2c (Continuous Effects)',
  ],
  examples: [
    'you and that opponent each gain control of all creatures the other controls until end of turn',
    'you and that player each gain control of all creatures the other controls until end of turn',
    'you and that opponent each gain control of all artifacts the other controls until end of turn',
    'you and that opponent each gain control of all creatures the other controls',
  ],
  rejects: [
    'you and target opponent each gain control of all creatures the other controls until end of turn',
    'you and that opponent gain control of all creatures the other controls until end of turn',
    'you and that opponent each gain control of all creatures you control until end of turn',
    'you and that opponent each gain control of all creatures the other controls until your next turn',
    'you and that opponent each gain control of each creature the other controls until end of turn',
    'you and that opponent each gain control of all creatures the other controls until end of turn and draw a card',
    'you and that opponent each gain control of creatures the other controls until end of turn',
  ],
  parse: single(
    'effect.exchange-control-of-all',
    sequence(
      literal('you and '),
      family<IrNoun>('noun', { only: ['noun.that-player'] }),
      literal(' each gain control of all '),
      spanned(permanentPhrase(true, 'all')),
      pattern(new RegExp(` the other controls${BOUNDARY}`, 'iu')),
      optional(spanned(map(literal(' until end of turn'), () => 'untilEndOfTurn' as const)), null),
    ),
    ([, player, , group, , ended]) => {
      const objects: IrNoun = {
        kind: 'noun',
        det: 'each',
        filter: { ...group.value, raw: `all ${group.value.raw}` },
        upTo: false,
        plural: true,
        other: false,
        span: group.span,
        rule: 'effect.exchange-control-of-all',
      };
      const duration: IrDuration | undefined =
        ended === null
          ? undefined
          : {
              kind: 'duration',
              scope: ended.value,
              span: ended.span,
              rule: 'effect.exchange-control-of-all',
            };
      return {
        verb: 'exchangeControlOfAll',
        args: { player, objects },
        ...(duration === undefined ? {} : { duration }),
      };
    },
  ),
});

export const CONTROL_EFFECT_RULES = [
  EFFECT_GAIN_CONTROL,
  EFFECT_LEAD_GAIN_CONTROL,
  EFFECT_GAIN_CONTROL_PER_OPPONENT,
  EFFECT_GAIN_CONTROL_FOR_PLAYER,
  EFFECT_CONTROL_WHILE_REMAINS,
  EFFECT_EXCHANGE_CONTROL_OF_ALL,
];
