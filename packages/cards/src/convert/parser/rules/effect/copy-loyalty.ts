/**
 * Effect rules of the Planeswalker Party deck (issue 132, Jaya's Phoenix, Leori, Repeated Reverberation): the delayed copy of the next cast or activation, and the choice of a planeswalker type.
 */
import { fail, pattern } from '../../combinators';
import { defineRule, spanned } from '../registry';
import { flag } from './dragons';
import { type Clauses, makeClause } from './operands';

/** ". You may choose new targets for the copy" (or "copies"): the sentence that follows, taken with the clause: the copy's controller may always choose new targets (CR 707.10c). */
const NEW_TARGETS_COPY = /\. you may choose new targets for the copy(?![\p{L}\p{N}])/iu;
const NEW_TARGETS_COPIES = /\. you may choose new targets for the copies(?![\p{L}\p{N}])/iu;

const NEXT_ID = 'effect.copy-next-loyalty-ability';

/**
 * `effect.copy-next-loyalty-ability`: "Copy the next loyalty ability you activate this turn when you activate it. You may choose new targets for the copy." (Jaya's Phoenix; CR 603.7, 603.7a,
 * 602.2, 606.2, 707.10, 707.10c): a delayed triggered ability, made as the ability resolves, that waits for the controller's next loyalty ability this turn and copies it as it goes on the stack.
 * The engine's `delayedCopy` with a loyalty `activation`. Not read: another ability than a loyalty ability, "each", another duration, no sentence about the new targets, a rider.
 */
export const EFFECT_COPY_NEXT_LOYALTY_ABILITY = defineRule<Clauses>({
  id: NEXT_ID,
  family: 'effect',
  leading: ['copy'],
  cites: [
    'CR 603.7 (Delayed Triggered Abilities)',
    'CR 606.2 (Loyalty Abilities)',
    'CR 707.10 (Copying Objects)',
    'CR 707.10c (Copying Objects)',
  ],
  examples: [
    'copy the next loyalty ability you activate this turn when you activate it. You may choose new targets for the copy',
  ],
  rejects: [
    'copy the next loyalty ability you activate this turn when you activate it',
    'copy the next ability you activate this turn when you activate it. You may choose new targets for the copy',
    'copy each loyalty ability you activate this turn when you activate it. You may choose new targets for the copy',
    'copy the next loyalty ability you activate when you activate it. You may choose new targets for the copy',
    'copy the next loyalty ability you activate this turn. You may choose new targets for the copy',
    'copy the next loyalty ability you activate this turn when you activate it. You may choose new targets for the copies',
    'copy the next loyalty ability you activate this turn when you activate it, then draw a card. You may choose new targets for the copy',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      pattern(
        new RegExp(
          `copy the next loyalty ability you activate this turn when you activate it${NEW_TARGETS_COPY.source}`,
          'iu',
        ),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: [
        makeClause(
          NEXT_ID,
          'delayedCopy',
          { loyalty: flag(NEXT_ID, true, r.value.span) },
          r.value.span,
        ),
      ],
      pos: r.pos,
    };
  },
});

const TYPE_ID = 'effect.until-eot-activate-of-type-copy';

/**
 * `effect.until-eot-activate-of-type-copy`: "Until end of turn, whenever you activate an ability of a planeswalker of that type, copy that ability. You may choose new targets for the copies."
 * (Leori, Sparktouched Hunter; CR 603.7, 602.2, 707.10, 707.10c): a delayed triggered ability for the turn that copies each ability of the controller's that a planeswalker of the type the
 * sentence before chose has, as it goes on the stack. The engine's `delayedCopy` with `ofChosenType` and `repeat`. Not read: another type than "that type", another duration, "next", no
 * sentence about the new targets, a rider.
 */
export const EFFECT_UNTIL_EOT_ACTIVATE_OF_TYPE_COPY = defineRule<Clauses>({
  id: TYPE_ID,
  family: 'effect',
  leading: ['until'],
  cites: [
    'CR 603.7 (Delayed Triggered Abilities)',
    'CR 602.2 (Activating Activated Abilities)',
    'CR 707.10 (Copying Objects)',
    'CR 707.10c (Copying Objects)',
  ],
  examples: [
    'until end of turn, whenever you activate an ability of a planeswalker of that type, copy that ability. You may choose new targets for the copies',
  ],
  rejects: [
    'until end of turn, whenever you activate an ability of a planeswalker of that type, copy that ability',
    'until end of turn, whenever you activate an ability of a planeswalker of that type, copy that ability. You may choose new targets for the copy',
    'until end of turn, whenever you activate an ability of a creature of that type, copy that ability. You may choose new targets for the copies',
    'until your next turn, whenever you activate an ability of a planeswalker of that type, copy that ability. You may choose new targets for the copies',
    'until end of turn, whenever you activate an ability of a planeswalker, copy that ability. You may choose new targets for the copies',
    'until end of turn, whenever you activate an ability of a planeswalker of that type, copy that ability and draw a card. You may choose new targets for the copies',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      pattern(
        new RegExp(
          `until end of turn, whenever you activate an ability of a planeswalker of that type, copy that ability${NEW_TARGETS_COPIES.source}`,
          'iu',
        ),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const span = r.value.span;
    return {
      ok: true,
      value: [
        makeClause(
          TYPE_ID,
          'delayedCopy',
          { ofChosenType: flag(TYPE_ID, true, span), repeat: flag(TYPE_ID, true, span) },
          span,
        ),
      ],
      pos: r.pos,
    };
  },
});

const REVERB_ID = 'effect.next-cast-or-loyalty-copy-twice';

/**
 * `effect.next-cast-or-loyalty-copy-twice`: "When you next cast an instant spell, cast a sorcery spell, or activate a loyalty ability this turn, copy that spell or ability twice. You may choose
 * new targets for the copies." (Repeated Reverberation; CR 603.7, 603.7a, 603.7b, 707.10, 707.10c): a delayed triggered ability, made as the spell resolves, that waits for the first of the three
 * events and copies what caused it twice. The engine's `delayedCopy` with a `count` of two. Not read: another kind of spell, another ability than a loyalty ability, another count, "whenever",
 * another duration, no sentence about the new targets, a rider.
 */
export const EFFECT_NEXT_CAST_OR_LOYALTY_COPY_TWICE = defineRule<Clauses>({
  id: REVERB_ID,
  family: 'effect',
  leading: ['when'],
  cites: [
    'CR 603.7 (Delayed Triggered Abilities)',
    'CR 603.7b (Delayed Triggered Abilities)',
    'CR 707.10 (Copying Objects)',
    'CR 707.10c (Copying Objects)',
  ],
  examples: [
    'when you next cast an instant spell, cast a sorcery spell, or activate a loyalty ability this turn, copy that spell or ability twice. You may choose new targets for the copies',
  ],
  rejects: [
    'when you next cast an instant spell, cast a sorcery spell, or activate a loyalty ability this turn, copy that spell or ability twice',
    'when you next cast an instant spell, cast a sorcery spell, or activate a loyalty ability this turn, copy that spell or ability. You may choose new targets for the copies',
    'when you next cast an instant spell, cast a creature spell, or activate a loyalty ability this turn, copy that spell or ability twice. You may choose new targets for the copies',
    'when you next cast an instant spell, cast a sorcery spell, or activate an ability this turn, copy that spell or ability twice. You may choose new targets for the copies',
    'whenever you cast an instant spell, cast a sorcery spell, or activate a loyalty ability this turn, copy that spell or ability twice. You may choose new targets for the copies',
    'when you next cast an instant spell, cast a sorcery spell, or activate a loyalty ability this turn, copy that spell or ability three times. You may choose new targets for the copies',
    'when you next cast an instant spell, cast a sorcery spell, or activate a loyalty ability this turn, copy that spell or ability twice and draw a card. You may choose new targets for the copies',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      pattern(
        new RegExp(
          `when you next cast an instant spell, cast a sorcery spell, or activate a loyalty ability this turn, copy that spell or ability twice${NEW_TARGETS_COPIES.source}`,
          'iu',
        ),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const span = r.value.span;
    return {
      ok: true,
      value: [
        makeClause(
          REVERB_ID,
          'delayedCopy',
          {
            instant: flag(REVERB_ID, true, span),
            sorcery: flag(REVERB_ID, true, span),
            loyalty: flag(REVERB_ID, true, span),
            twice: flag(REVERB_ID, true, span),
          },
          span,
        ),
      ],
      pos: r.pos,
    };
  },
});

const CHOOSE_ID = 'effect.choose-planeswalker-type';

/**
 * `effect.choose-planeswalker-type`: "Choose a planeswalker type." (Leori; CR 205.3j, 608.2d): the controller chooses one of the planeswalker types as the effect resolves; the sentences after it
 * read it as "that type". The engine's `chooseCreatureType` with `planeswalker`. Not read: a creature type, "target", another number, an opponent choosing.
 */
export const EFFECT_CHOOSE_PLANESWALKER_TYPE = defineRule<Clauses>({
  id: CHOOSE_ID,
  family: 'effect',
  leading: ['choose'],
  cites: ['CR 205.3j (Subtypes)', 'CR 608.2d (Resolving Spells and Abilities)'],
  examples: ['choose a planeswalker type'],
  rejects: [
    'choose a creature type',
    'choose a planeswalker',
    'choose target planeswalker type',
    'choose two planeswalker types',
    'choose a planeswalker type and draw a card',
    'choose a planeswalker types',
  ],
  parse: (ctx, pos) => {
    const r = spanned(pattern(/choose a planeswalker type(?![\p{L}\p{N}])/iu))(ctx, pos);
    if (!r.ok) return fail(ctx, pos);
    return {
      ok: true,
      value: [makeClause(CHOOSE_ID, 'choosePlaneswalkerType', {}, r.value.span)],
      pos: r.pos,
    };
  },
});

const PUMP_ID = 'effect.until-next-turn-attackers-get';

/**
 * `effect.until-next-turn-attackers-get`: "Until your next turn, whenever a creature an opponent controls attacks, it gets -1/-0 until end of turn." (Jace, Architect of Thought; CR 603.7,
 * 500.1, 508.1, 611.2a): a delayed triggered ability, made as the ability resolves, that gives each creature an opponent attacks with the change when it is declared an attacker, until the
 * controller's next turn begins. The engine's `delayedAttackerPump`. Not read: another duration, "you control", another number of players, another change, "until end of combat", a rider.
 */
export const EFFECT_UNTIL_NEXT_TURN_ATTACKERS_GET = defineRule<Clauses>({
  id: PUMP_ID,
  family: 'effect',
  leading: ['until'],
  cites: [
    'CR 603.7 (Delayed Triggered Abilities)',
    'CR 500.1 (Beginning of the Turn)',
    'CR 508.1 (Declare Attackers Step)',
    'CR 611.2a (Continuous Effects)',
  ],
  examples: [
    'until your next turn, whenever a creature an opponent controls attacks, it gets -1/-0 until end of turn',
    'until your next turn, whenever a creature an opponent controls attacks, it gets -2/-0 until end of turn',
  ],
  rejects: [
    'until end of turn, whenever a creature an opponent controls attacks, it gets -1/-0 until end of turn',
    'until your next turn, whenever a creature you control attacks, it gets -1/-0 until end of turn',
    'until your next turn, whenever a creature an opponent controls attacks, it gets -1/-0',
    'until your next turn, whenever a creature an opponent controls attacks, it gets -1/-0 until end of combat',
    'until your next turn, whenever a creature an opponent controls attacks, it gets +1/-0 until end of turn',
    'until your next turn, whenever a creature an opponent controls attacks, it gets -1/-0 until end of turn and you draw a card',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      pattern(
        /until your next turn, whenever a creature an opponent controls attacks, it gets -(\d+)\/-(\d+) until end of turn(?![\p{L}\p{N}])/iu,
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const span = r.value.span;
    const found = r.value.value;
    const num = (n: string | undefined) => ({
      kind: 'number' as const,
      value: Number(n),
      span,
    });
    return {
      ok: true,
      value: [
        makeClause(
          PUMP_ID,
          'delayedAttackerPump',
          { power: num(found[1]), toughness: num(found[2]) },
          span,
        ),
      ],
      pos: r.pos,
    };
  },
});

export const COPY_LOYALTY_EFFECT_RULES = [
  EFFECT_UNTIL_NEXT_TURN_ATTACKERS_GET,
  EFFECT_COPY_NEXT_LOYALTY_ABILITY,
  EFFECT_UNTIL_EOT_ACTIVATE_OF_TYPE_COPY,
  EFFECT_NEXT_CAST_OR_LOYALTY_COPY_TWICE,
  EFFECT_CHOOSE_PLANESWALKER_TYPE,
];
