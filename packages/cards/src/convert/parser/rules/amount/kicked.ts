/**
 * The count of a kicker that may be paid more than once (stage P17, the engine's `Amount`
 * `timesKicked`, D-110): "for each time it was kicked" (CR 702.33c, 702.33d). It follows a
 * quantity of one like `amount.for-each` does ("Draw a card for each time ~ was kicked."), so the
 * quantity is the count; the effect rules that take a counted amount take this one too.
 */
import { type Parser, pattern } from '../../combinators';
import type { IrAmount } from '../../ir/types';
import { defineRule } from '../registry';

const TIMES_KICKED = /for each time (it|~) was kicked(?![\p{L}\p{N}])/iu;
const NUMBER_OF_TIMES_KICKED = /the number of times (it|~) was kicked(?![\p{L}\p{N}])/iu;

/**
 * "the number of times ~ was kicked", read after "where X is" and "equal to" (`amount/value.ts`; Marshal's Anthem, CR 702.33c, 107.3c): the engine's `timesKicked`, the kicks of the
 * spell that is resolving or the permanent the ability is on. As for "for each time", the lowering decides which object "it" is. Not read: "the number of times that creature was
 * kicked", "the number of times it was cast", "the number of times".
 */
export const TIMES_KICKED_VALUE: Parser<IrAmount> = (ctx, pos) => {
  const r = pattern(NUMBER_OF_TIMES_KICKED)(ctx, pos);
  if (!r.ok) return r;
  const who = r.value[1] === '~' ? ('self' as const) : ('it' as const);
  return {
    ok: true,
    value: { kind: 'timesKicked', who, span: { start: pos, end: r.pos } },
    pos: r.pos,
  };
};

/**
 * `amount.times-kicked`: "for each time it was kicked" and "for each time ~ was kicked" (a card's
 * own name, or "this spell" before normalization, is `~`). The engine counts how many times the
 * spell that is resolving, or the permanent the ability is on, was kicked (CR 702.33c: a spell
 * kicked once with Kicker counts 1, an unkicked one 0), also once it has left the battlefield (CR
 * 113.7a). Which object "it" is, is decided by the lowering, as for the condition "it was kicked":
 * the source only where the ability is about the source itself. "For each time" any other thing
 * happened, and a kicker that names its cost ("was kicked with its first kicker", CR 702.33f), are
 * not read.
 */
export const AMOUNT_TIMES_KICKED = defineRule<IrAmount>({
  id: 'amount.times-kicked',
  family: 'amount',
  leading: ['for'],
  cites: ['CR 702.33c (Kicker)', 'CR 702.33d (Kicker)', 'CR 113.7a (Abilities)'],
  examples: [
    'for each time it was kicked',
    'for each time ~ was kicked',
    'For each time it was kicked',
  ],
  rejects: [
    'for each time',
    'for each time it was',
    'for each time it was cast',
    'for each time that creature was kicked',
    'for each time you were kicked',
    'for each time it was kicked.',
    'for each creature you control',
    'each time it was kicked',
    'for each time it was kickedx',
  ],
  parse: (ctx, pos) => {
    const r = pattern(TIMES_KICKED)(ctx, pos);
    if (!r.ok) return r;
    const who = r.value[1] === '~' ? ('self' as const) : ('it' as const);
    return {
      ok: true,
      value: { kind: 'timesKicked', who, span: { start: pos, end: r.pos } },
      pos: r.pos,
    };
  },
});

/**
 * The amounts a count of "for each" may be: objects counted, the times a spell was kicked, and (stage P28, D-131) the
 * counters on an object, the opponents who have more of something than you and what an earlier instruction of the
 * same text did ("for each creature sacrificed this way").
 */
export const FOR_EACH_AMOUNTS = [
  'amount.for-each',
  // Exit from Exile deck (Journey to the Lost City): the creature cards the exile before it exiled.
  'amount.for-each-creature-card-among-those-cards',
  'amount.for-each-counter',
  'amount.for-each-counter-kind',
  'amount.for-each-opponent',
  'amount.for-each-this-way',
  'amount.times-kicked',
  // Stage P34 (D-152): the cards an earlier instruction exiled that are still exiled.
  'amount.for-each-still-exiled',
  // Stage P39 (D-184): the mana spent to cast the spell, in all or from sources of a card type.
  'amount.for-each-mana-spent',
  // Stage P68 (D-230): the nontoken creatures of the controller that an earlier destroy destroyed.
  'amount.for-each-own-nontoken-destroyed',
  // Ahoy Mateys deck, group 5 (Blood Money): the nontoken creatures of any player that an earlier destroy destroyed.
  'amount.for-each-nontoken-destroyed',
  // Feather deck group 1 (D-450): the cards the controller has drawn this turn.
  'amount.for-each-card-drawn',
  // Issue 145 (Aetherflux Reservoir): the spells the controller has cast this turn.
  'amount.for-each-spell-cast',
  'amount.for-each-spell-color',
  // Ahoy Mateys deck, group 1 (Malcolm): the opponents a group of sources dealt damage to in one event.
  'amount.for-each-opponent-dealt-damage',
  // Scions & Spellcraft deck, group A: the players who lost life, or were dealt combat damage by a source, this turn.
  'amount.for-each-player-who',
  // Counter Blitz deck, group C: the opponents who control a permanent of a kind.
  'amount.for-each-opponent-who-controls',
  // Lock and Load (issue 121): the other instants and sorceries the controller has cast this turn.
  'amount.for-each-other-spell-cast',
  // D-654 (Hateful Eidolon): the Auras the controller controlled that were attached to the creature that died.
  'amount.for-each-aura-attached',
  // Lorehold Spirit deck group 2 (issue 86): the votes for one option of the vote the text made.
  'amount.for-each-vote',
  // CR 700.4: the creatures that died this turn (history, read from the turn log).
  'amount.for-each-died',
  // Celeborn the Wise (CR 701.22): the cards looked at by the scry that caused the trigger.
  'amount.for-each-scried',
  // Issue 81 (Occult Epiphany): the different card types among the cards an earlier discard discarded.
  'amount.for-each-card-type-discarded',
  // CR 205.2a: the card types among the cards of a graveyard.
  'amount.for-each-card-type',
  // CR 205.2a, 603.2c: the card types among the cards of a batch trigger ("those cards").
  'amount.for-each-card-type-among-those-cards',
  // Eris, Roar of the Storm (issue 121, CR 202.3): the distinct mana values among the cards of a zone.
  'amount.for-each-different-mana-value',
  // Valiant Changeling (CR 205.3m): the distinct creature types among the permanents of a group.
  'amount.for-each-creature-type',
  // Issue 144 (Glimpse the Impossible): the cards the instruction before it put into the controller's graveyard.
  'amount.for-each-card-put-into-your-graveyard',
  // CR 700.8: the creatures in the controller's party.
  'amount.for-each-party-creature',
] as const;
