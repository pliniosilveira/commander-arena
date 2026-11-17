/**
 * Effect rules of group 3 of the Galadriel deck (issue 43): "Exchange control of ~ and target nonland permanent" (Eyes Everywhere), "counter up to one target spell unless its controller pays
 * mana equal to the greatest power among creatures you control" (Repulsive Mutation), "Draw a card and reveal it. Remove a number of loyalty counters equal to that card's mana value
 * from ~." (Jace, Mirror Mage) and "Its activated abilities can't be activated this turn." (Koma, Cosmos Serpent). The engine runs `exchangeControl`, `counterUnlessPays` with a
 * generic amount, `draw` with `reveal` followed by `removeCounters`, and `restrict` of `cantActivateAbilities`; the lowerings are in `lower/galadriel-g3.ts`.
 */
import { fail, literal, pattern, satisfy, sequence } from '../../combinators';
import type { IrAmount, IrArg, IrCounterSpec, IrNoun } from '../../ir/types';
import { BOUNDARY } from '../noun/phrases';
import { defineRule, family, quietly, spanned } from '../registry';
import { type Clauses, single } from './operands';

/**
 * `effect.exchange-control`: "exchange control of ~ and target nonland permanent" (CR 701.12a: if the entire exchange can't be completed, no part of it occurs; 701.12b: each of
 * two players gains control of the permanent the other controlled, and the same player controlling both does nothing; 613.1b, 611.2a). The permanent with the ability ("this
 * enchantment" is `~`) and one target permanent; the engine's `exchangeControl`. Not read: two targets ("exchange control of two target creatures": the engine runs it, the words
 * need a slot for each target and are not read yet), a group, "up to", a player, a duration, anything after the target.
 */
export const EFFECT_EXCHANGE_CONTROL = defineRule<Clauses>({
  id: 'effect.exchange-control',
  family: 'effect',
  leading: ['exchange'],
  cites: [
    'CR 701.12a (Exchange)',
    'CR 701.12b (Exchange)',
    'CR 613.1b (Interaction of Continuous Effects)',
    'CR 611.2a (Continuous Effects)',
  ],
  examples: [
    'exchange control of ~ and target nonland permanent',
    'exchange control of ~ and target permanent',
    'exchange control of ~ and target creature',
    'exchange control of ~ and target artifact',
  ],
  rejects: [
    'exchange control of ~',
    'exchange control of target creature and target creature',
    'exchange control of two target creatures',
    'exchange control of ~ and ~',
    'exchange control of ~ and target creatures',
    'exchange control of ~ and up to one target creature',
    'exchange control of ~ and each creature',
    'exchange control of ~ and target player',
    'exchange control of ~ and target creature until end of turn',
    'exchange control of ~ and target creature and draw a card',
    'exchange life totals with target player',
    'exchange control of it and target creature',
    'exchanges control of ~ and target creature',
  ],
  parse: single(
    'effect.exchange-control',
    sequence(
      literal('exchange control of '),
      family<IrNoun>('noun', { only: ['noun.self'] }),
      literal(' and '),
      // One permanent: not several of them and not "up to one".
      satisfy(
        family<IrNoun>('noun', { only: ['noun.target-permanent'] }),
        (noun) => !noun.plural && !noun.upTo,
      ),
    ),
    ([, first, , second]) => {
      return { verb: 'exchangeControl', args: { first, second } };
    },
  ),
});

/**
 * "mana equal to <amount>" after "unless its controller pays": the generic mana the controller of the spell must pay, a number the amount rules read ("the greatest power among creatures
 * you control").
 */
const PAYS_MANA_EQUAL_TO = sequence(
  literal(' unless its controller pays mana '),
  family<IrAmount>('amount', { only: ['amount.equal-to', 'amount.number-of', 'amount.power-of'] }),
);

/**
 * `effect.counter-unless-pays-equal`: "counter target spell unless its controller pays mana equal to the greatest power among creatures you control", with "up to one" for the
 * spell (CR 701.6 counter; CR 118.12a: that player may pay the cost as the effect resolves, and CR 608.2d: the controller of the spell decides; CR 115.2: "up to one" lets the caster
 * choose none; CR 608.2c: the amount is read as the effect resolves). The engine's `counterUnlessPays` with a generic amount to pay. The cost is mana only, as many generic mana as
 * the amount says. Not read: a cost in symbols (`effect.counter-unless`'s), "pays life", "that player pays", an amount the amount rules do not read, anything after the amount.
 */
export const EFFECT_COUNTER_UNLESS_PAYS_EQUAL = defineRule<Clauses>({
  id: 'effect.counter-unless-pays-equal',
  family: 'effect',
  leading: ['counter'],
  cites: [
    'CR 701.6 (Counter)',
    'CR 118.12a (Costs)',
    'CR 608.2c (Resolving Spells and Abilities)',
    'CR 608.2d (Resolving Spells and Abilities)',
    'CR 115.2 (Targets)',
  ],
  examples: [
    'counter up to one target spell unless its controller pays mana equal to the greatest power among creatures you control',
    'counter target spell unless its controller pays mana equal to the greatest power among creatures you control',
    'counter target spell unless its controller pays mana equal to the number of creatures you control',
    'counter target noncreature spell unless its controller pays mana equal to the total power of creatures you control',
    'counter target spell unless its controller pays mana equal to the greatest mana value among artifacts you control',
  ],
  rejects: [
    'counter target spell unless its controller pays mana',
    'counter target spell unless its controller pays {3}',
    'counter target spell unless its controller pays mana equal to 3',
    'counter target spell unless its controller pays X mana',
    'counter target spell unless that player pays mana equal to the greatest power among creatures you control',
    'counter target spell unless you pay mana equal to the greatest power among creatures you control',
    'counter target spell unless its controller pays life equal to the greatest power among creatures you control',
    'counter target spell unless its controller pays mana equal to the greatest power among creatures you control and draw a card',
    'counter up to two target spells unless its controller pays mana equal to the greatest power among creatures you control',
    'counter target spell or ability unless its controller pays mana equal to the greatest power among creatures you control',
    'counter target creature unless its controller pays mana equal to the greatest power among creatures you control',
  ],
  parse: single(
    'effect.counter-unless-pays-equal',
    sequence(
      literal('counter '),
      family<IrNoun>('noun', { only: ['noun.target-spell', 'noun.up-to-one-target-spell'] }),
      PAYS_MANA_EQUAL_TO,
    ),
    ([, objects, [, amount]]) => ({
      verb: 'counterUnlessPaysAmount',
      args: { objects, amount },
    }),
  ),
});

/** The name of the counter in "loyalty counters": one lower-case word. */
const COUNTER_NAME = pattern(/([a-z]+) counters(?![\p{L}\p{N}])/iu);

/**
 * `effect.draw-reveal-remove`: "draw a card and reveal it. Remove a number of loyalty counters equal to that card's mana value from ~." (CR 701.20a: reveal shows the card to every
 * player; CR 400.7j and 608.2c: "that card" is the card just drawn, read as the second instruction comes up; CR 202.3: its mana value; CR 122.1, 122.2: counters are removed from a
 * permanent). One instruction made of two sentences (the segmenter keeps them together, `segment.ts`); the engine's `draw` with `reveal` and `removeCounters` of the amount "the mana
 * value of what was drawn". The counters come off the permanent with the ability. Not read: more than one card, another player, counters of a kind the engine does not know, another
 * amount, counters taken from a target, a second instruction after the sentence.
 */
export const EFFECT_DRAW_REVEAL_REMOVE = defineRule<Clauses>({
  id: 'effect.draw-reveal-remove',
  family: 'effect',
  leading: ['draw'],
  cites: [
    'CR 701.20a (Reveal)',
    'CR 400.7j (Zone Change)',
    'CR 608.2c (Resolving Spells and Abilities)',
    'CR 202.3 (Mana Value)',
    'CR 122.1 (Counters)',
    'CR 122.2 (Counters)',
  ],
  examples: [
    'draw a card and reveal it. Remove a number of loyalty counters equal to that card’s mana value from ~',
    "draw a card and reveal it. Remove a number of loyalty counters equal to that card's mana value from ~",
    'draw a card and reveal it. Remove a number of charge counters equal to that card’s mana value from ~',
  ],
  rejects: [
    'draw a card and reveal it',
    'draw two cards and reveal them. Remove a number of loyalty counters equal to that card’s mana value from ~',
    'draw a card. Remove a number of loyalty counters equal to that card’s mana value from ~',
    'draw a card and reveal it. Remove a number of loyalty counters equal to its mana value from ~',
    'draw a card and reveal it. Remove a number of loyalty counters from ~',
    'draw a card and reveal it. Remove a number of loyalty counters equal to that card’s mana value from target planeswalker',
    'draw a card and reveal it. Remove a number of loyalty counters equal to that card’s power from ~',
    'draw a card and reveal it. Remove a number of loyalty counters equal to that card’s mana value from ~ and draw a card',
    'draw a card and reveal it. Remove two loyalty counters from ~',
    'draw a card and reveal it. Put a number of loyalty counters equal to that card’s mana value on ~',
    'you draw a card and reveal it. Remove a number of loyalty counters equal to that card’s mana value from ~',
  ],
  parse: single(
    'effect.draw-reveal-remove',
    (ctx, pos) => {
      const head = pattern(/draw a card and reveal it\. remove a number of /iu)(ctx, pos);
      if (!head.ok) return head;
      const counter = spanned(COUNTER_NAME)(ctx, head.pos);
      if (!counter.ok) return counter;
      const mid = pattern(/ equal to that card['’]s mana value from /iu)(ctx, counter.pos);
      if (!mid.ok) return mid;
      const from = family<IrNoun>('noun', { only: ['noun.self'] })(ctx, mid.pos);
      if (!from.ok) return from;
      if (/^(?:,| and\b| then\b)/iu.test(ctx.text.slice(from.pos))) return fail(ctx, pos);
      const name = (counter.value.value[1] ?? '').toLowerCase();
      const spec: IrCounterSpec = {
        kind: 'counterSpec',
        name,
        span: counter.value.span,
        rule: 'effect.draw-reveal-remove',
      };
      return { ok: true, value: { counter: spec, from: from.value }, pos: from.pos };
    },
    ({ counter, from }) => ({
      verb: 'drawRevealRemove',
      args: { counter, from } as Record<string, IrArg>,
    }),
  ),
});

/**
 * `effect.cant-activate-its`: "its activated abilities can't be activated this turn" (CR 602.5: an ability that can't be activated has no activation; 605.1a: a mana ability is an
 * activated ability; 611.2: a continuous effect with the duration it states). The permanent an earlier sentence named ("Tap target permanent."); the engine's `restrict` of
 * `cantActivateAbilities` until end of turn. Not read: another duration, a permanent named in the sentence ("target creature's activated abilities can't be activated this turn"),
 * triggered abilities, "loses all abilities", "unless", words after the period.
 */
export const EFFECT_CANT_ACTIVATE_ITS = defineRule<Clauses>({
  id: 'effect.cant-activate-its',
  family: 'effect',
  leading: ['its'],
  cites: [
    'CR 602.5 (Activating Activated Abilities)',
    'CR 605.1a (Activating Mana Abilities)',
    'CR 611.2 (Continuous Effects)',
  ],
  examples: [
    'its activated abilities can’t be activated this turn',
    "its activated abilities can't be activated this turn",
  ],
  rejects: [
    'its activated abilities can’t be activated',
    'its activated abilities can’t be activated until end of turn',
    'its activated abilities can’t be activated this combat',
    'its activated abilities can be activated this turn',
    'its abilities can’t be activated this turn',
    'its triggered abilities can’t be activated this turn',
    'their activated abilities can’t be activated this turn',
    'target creature’s activated abilities can’t be activated this turn',
    'its activated abilities can’t be activated this turn and it can’t attack',
    'its activated abilities can’t be activated unless you pay {1}',
    'activated abilities can’t be activated this turn',
  ],
  parse: single(
    'effect.cant-activate-its',
    (ctx, pos) => {
      const r = pattern(
        new RegExp(`its activated abilities can['’]t be activated this turn${BOUNDARY}`, 'iu'),
      )(ctx, pos);
      if (!r.ok) return r;
      if (/^ (?:and|unless|until)\b/iu.test(ctx.text.slice(r.pos))) return fail(ctx, pos);
      const objects: IrNoun = {
        kind: 'noun',
        det: 'anaphor',
        filter: { raw: 'it' },
        upTo: false,
        plural: false,
        other: false,
        span: { start: pos, end: pos + 3 },
        rule: 'effect.cant-activate-its',
      };
      return { ok: true, value: objects, pos: r.pos };
    },
    (objects) => ({ verb: 'cantActivate', args: { objects } }),
  ),
});

export const GALADRIEL_G3_EFFECT_RULES = [
  EFFECT_EXCHANGE_CONTROL,
  EFFECT_COUNTER_UNLESS_PAYS_EQUAL,
  EFFECT_DRAW_REVEAL_REMOVE,
  EFFECT_CANT_ACTIVATE_ITS,
].map(quietly);
