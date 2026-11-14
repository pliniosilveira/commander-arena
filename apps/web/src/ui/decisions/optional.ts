/**
 * The wording of the `confirmOptional` question (CR 603.5 "you may", 614.12 shock lands, 702.33a
 * Kicker, 702.21a Ward, 701.23 "may search", "counter unless its controller pays"): the bar
 * prompt, the button labels and whether Cancel is offered. Six questions share the decision and are
 * told apart by `cost` and `purpose`, so their words live here, away from `model.ts`.
 */
import type { ConfirmOptionalDecision, Cost, ObjectId, ObjectView } from '@commander-arena/engine';
import { findEffect } from '../../game/artifacts-text';
import { castCardOfAbility, castCardPrompt } from '../../game/cast-card-text';
import {
  additionalWayText,
  costText,
  kickerCostPart,
  unlessCostAsk,
  unlessCostPhrase,
} from '../../game/cost-text';
import { isExtortAbility } from '../../game/describe-keywords2';
import { beholdQuality, beholdReminder } from '../../game/dragons-text';
import { castNowButtons, castNowPrompt, miracleRevealPrompt } from '../../game/later-text';
import { giftPrompt } from '../../game/recursion-text';
import {
  findUnless,
  inSentence,
  payerOf,
  unlessResultText,
  type Who,
} from '../../game/unless-text';
import { triggerGist } from './ability-label';
import { type Index, plural, stackName } from './lookup';

/** "Name: oracle text — do it?" (the text is the whole card's; empty for a vanilla source). */
export function optionalPrompt(sourceName: string, oracleText: string): string {
  return oracleText === '' ? `${sourceName} — do it?` : `${sourceName}: ${oracleText} — do it?`;
}

/** "Pay 2 life?" for a shock land's question. */
export function payPrompt(cost: readonly Cost[]): string {
  return `Pay ${costText(cost)}?`;
}

/**
 * The kicker question: "Pay the kicker cost {2}?" for a mana cost and "Pay the kicker cost: 3
 * life?" when life is part of it ("{1} and 1 life" for both), as the card prints "Kicker {2}" and
 * "Kicker-Pay 3 life".
 */
export function kickerPrompt(cost: readonly Cost[]): string {
  const parts = cost.map(kickerCostPart);
  if (parts.length === 0) return 'Pay the kicker cost?';
  if (cost.every((c) => c.kind === 'mana')) return `Pay the kicker cost ${parts.join('')}?`;
  return `Pay the kicker cost: ${parts.join(' and ')}?`;
}

/**
 * The ward question (CR 702.21a): "Pay {2} or Lightning Bolt is countered?", "Pay 3 life or ...",
 * "Discard a card or ..." for Ward—Discard a card (D-095).
 * `subject` is the name of the spell or ability that is countered if the player does not pay.
 */
export function wardPrompt(cost: readonly Cost[], subject: string): string {
  return `${unlessCostAsk(cost)} or ${subject} is countered?`;
}

/**
 * The "counter target spell unless its controller pays" question (D-092): "Pay {3} or Lightning Bolt
 * is countered by Soft Counter?". It names the counterspell, which the title of the dialog also
 * does, so the prompt still reads when the bar alone is seen.
 */
export function counterUnlessPaysPrompt(
  cost: readonly Cost[],
  subject: string,
  counterspell: string,
): string {
  return `${unlessCostAsk(cost)} or ${subject} is countered by ${counterspell}?`;
}

/** The seat's name relative to the viewer: the questions are asked of the human, who is "you". */
const relative = (seat: number, question: { readonly seat: number }): Who =>
  seat === question.seat ? 'you' : 'opp';

/**
 * The "[do something] unless [that player] pays" question (CR 118.12a, D-111), asked of the payer:
 * "Pay {1} or Opponent draws a card?" (a "you may" effect: "Pay {1} or Opponent may draw a card?").
 * The effect is read from the ability on the stack; one the words do not know is not guessed at:
 * "Pay {1} or SYNTHETIC X's ability has its effect?".
 */
export function unlessPaysPrompt(
  cost: readonly Cost[],
  d: Pick<ConfirmOptionalDecision, 'seat' | 'source' | 'sourceName' | 'upkeep'>,
  index: Index,
): string {
  const ability = index.get(d.source);
  // The upkeep keywords always sacrifice the permanent itself; Cumulative upkeep's effect is not an
  // `unlessPays` on the stack, so the decision's own marker tells.
  if (d.upkeep !== undefined) return sacrificeUnlessPrompt(cost, d, index);
  const unless = ability?.ability === undefined ? null : findUnless(ability.ability.effect);
  if (unless !== null && sacrificesThis(unless)) return sacrificeUnlessPrompt(cost, d, index);
  const result =
    unless === null || ability === undefined
      ? null
      : unlessResultText(unless, relative(ability.controller, d), 'you');
  return result === null
    ? `${unlessCostAsk(cost)} or ${d.sourceName}'s ability has its effect?`
    : `${unlessCostAsk(cost)} or ${inSentence(result.text)}?`;
}

const sacrificesThis = (unless: NonNullable<ReturnType<typeof findUnless>>): boolean =>
  unless.effect.kind === 'sacrifice' && unless.effect.objects.kind === 'this';

/** True when declining this unless-pays question sacrifices the permanent itself. */
function sacrificesIt(d: Pick<ConfirmOptionalDecision, 'source'>, index: Index): boolean {
  const ability = index.get(d.source)?.ability;
  const unless = ability === undefined ? null : findUnless(ability.effect);
  return unless !== null && sacrificesThis(unless);
}

/** The age counters on the permanent the upkeep ability on the stack belongs to; null when it left. */
function ageCounters(source: ObjectId, index: Index): number | null {
  const host = index.get(source)?.abilitySource;
  const count = host === undefined ? undefined : index.get(host)?.counters.age;
  return count === undefined || count <= 0 ? null : count;
}

/**
 * "[do something] unless you pay" whose effect is sacrificing the permanent itself: Echo (CR 702.30a,
 * D-127) and Cumulative upkeep (CR 702.24a) say why, "Echo: pay {1}{R} or sacrifice Name?" and
 * "Cumulative upkeep: pay {1}{1} (2 age counters) or sacrifice Name?" (the cost is the whole payment,
 * the printed cost once for each age counter); any other says "Pay {2} or sacrifice Name?".
 */
function sacrificeUnlessPrompt(
  cost: readonly Cost[],
  d: Pick<ConfirmOptionalDecision, 'source' | 'sourceName' | 'upkeep'>,
  index: Index,
): string {
  const pay = unlessCostPhrase(cost);
  if (d.upkeep === 'echo') return `Echo: ${pay} or sacrifice ${d.sourceName}?`;
  if (d.upkeep === 'cumulativeUpkeep') {
    const age = ageCounters(d.source, index);
    const counters = age === null ? '' : ` (${plural(age, 'age counter')})`;
    return `Cumulative upkeep: ${pay}${counters} or sacrifice ${d.sourceName}?`;
  }
  return `${unlessCostAsk(cost)} or sacrifice ${d.sourceName}?`;
}

/**
 * The "you may pay [cost]. If you do, [effect]" question (CR 702.101a Extort, D-120): "Pay {W/B} for
 * extort?" for Extort's expansion, "Pay {2} for SYNTHETIC X's ability?" for any other. The ability is read
 * from the stack object's own AST, never from the source's text. It is asked only when the cost can be
 * paid, so declining is the only other answer and nothing is rewound.
 */
export function mayPayPrompt(
  cost: readonly Cost[],
  d: Pick<ConfirmOptionalDecision, 'source' | 'sourceName'>,
  index: Index,
): string {
  const reason = isExtortAbility(index.get(d.source)?.ability)
    ? 'extort'
    : `${d.sourceName}'s ability`;
  return `${unlessCostAsk(cost)} for ${reason}?`;
}

/**
 * What a `cascade` question is asking (D-120, D-151): Cascade itself (CR 702.85a: declining puts the card on the bottom of the library with
 * the others), Discover N (CR 701.57a) and "exile cards until you exile a nonland card; you may cast it if its mana value is N or less"
 * (declining puts the card into your hand). Read from the effect of the ability on the stack: the `cascade` effect is Cascade's; any
 * other source is a spell or an ability whose instruction puts the card into the hand when it is not cast.
 */
export function cascadeKind(
  d: Pick<ConfirmOptionalDecision, 'source'>,
  index: Index,
): { readonly kind: 'cascade' | 'discover' | 'cast' | 'spell'; readonly limit?: number } {
  const source = index.get(d.source);
  // A source the view does not hold keeps Cascade's words (the question has always been Cascade's, D-120).
  if (source === undefined) return { kind: 'cascade' };
  const effect = source.ability?.effect;
  if (effect === undefined) return { kind: 'spell' };
  if (findEffect(effect, 'cascade') !== null) return { kind: 'cascade' };
  const found = findEffect(effect, 'exileUntilCast');
  if (found?.foundAtMost !== undefined) return { kind: 'discover', limit: found.foundAtMost };
  if (found?.castAtMost !== undefined) return { kind: 'cast', limit: found.castAtMost };
  return { kind: 'spell' };
}

/**
 * Cascade's question (CR 702.85a, D-120): "Cascade: cast Lightning Bolt without paying its mana cost?" naming the card exiled, which
 * is public (`subject`). The same decision serves Discover and its kin (D-151), and says what declining does: "Discover 10: cast X
 * without paying its mana cost, or put it into your hand?". When the view no longer holds the card, "that card".
 */
export function cascadePrompt(
  d: Pick<ConfirmOptionalDecision, 'subject' | 'source'>,
  index: Index,
): string {
  const card = (d.subject === undefined ? undefined : index.get(d.subject)?.name) ?? 'that card';
  const ask = cascadeKind(d, index);
  switch (ask.kind) {
    case 'cascade':
      return `Cascade: cast ${card} without paying its mana cost?`;
    case 'discover':
      return `Discover ${ask.limit}: cast ${card} without paying its mana cost, or put it into your hand?`;
    case 'cast':
      return `Cast ${card} without paying its mana cost (its mana value is ${ask.limit} or less), or put it into your hand?`;
    case 'spell':
      return `Cast ${card} without paying its mana cost, or put it into your hand?`;
  }
}

/** The button that declines the cascade question: "Don't cast it" for Cascade, "Put it into your hand" for the others (D-151). */
export function cascadeDecline(d: Pick<ConfirmOptionalDecision, 'source'>, index: Index): string {
  return cascadeKind(d, index).kind === 'cascade' ? "Don't cast it" : 'Put it into your hand';
}

/**
 * The second question of an "unless that player pays" ability that says "you may" (CR 118.12a): the
 * payer did not pay, and the controller is asked whether to do it: "Opponent didn't pay {1}. Draw a
 * card?". It is a plain `confirmOptional` (no purpose), so it is told from the ability's own "you
 * may" by what the ability on the stack says: an `optional` effect of an `unlessPays` and no
 * ability-level `optional`. Null for every other plain question.
 */
export function mayEffectPrompt(d: ConfirmOptionalDecision, index: Index): string | null {
  if (d.purpose !== undefined || d.cost !== undefined) return null;
  const object = index.get(d.source);
  const ability = object?.ability;
  if (ability === undefined || ability.kind !== 'triggered' || ability.optional === true) {
    return null;
  }
  const unless = findUnless(ability.effect);
  if (unless === null || unless.optional !== true) return null;
  const controller = relative(object?.controller ?? d.seat, d);
  const payer = payerOf(unless, controller, null);
  const result = unlessResultText(unless, controller, payer);
  if (result === null) return null;
  const did = payer === 'you' ? 'You' : 'Opponent';
  const doIt =
    result.subject === 'You'
      ? `${result.base.charAt(0).toUpperCase()}${result.base.slice(1)}`
      : `Have ${result.subject === 'Opponent' ? 'Opponent' : 'each player'} ${result.base}`;
  return `${did} didn't ${unlessCostPhrase(unless.cost)}. ${doIt}?`;
}

/**
 * The plain "you may" of a triggered ability whose effect is a delayed ability ("When this creature dies, you may return it to the battlefield ... at the beginning of
 * your next upkeep", D-284): worded from the ability on the stack, "Name: At the beginning of your next upkeep, return it to the battlefield — do it?". The decision
 * quotes the Oracle text of the permanent the ability belongs to, which is not the ability when it was granted (the Seraph gives it to both creatures of its pair,
 * CR 613.1f): a vanilla partner would read "Grizzly Bears — do it?" and another creature's text would be quoted for it. Null for any other plain question, and for
 * an ability the view does not show or the words do not know (never guessed).
 */
export function mayDelayedPrompt(d: ConfirmOptionalDecision, index: Index): string | null {
  if (d.purpose !== undefined || d.cost !== undefined) return null;
  const object = index.get(d.source);
  const ability = object?.ability;
  if (ability?.kind !== 'triggered' || ability.optional !== true) return null;
  if (ability.effect.kind !== 'delayedTrigger') return null;
  const gist = triggerGist(ability, object);
  return gist === '' ? null : optionalPrompt(d.sourceName, gist);
}

/**
 * "You may behold a Dragon" (D-151, CR 701.4a): the plain "you may" of an ability whose effect is a `may` over a Behold, worded
 * "Behold a Dragon? Reveal a Dragon card from your hand or choose a Dragon you control on the battlefield.". Null for any other plain
 * question, and for one the view does not show the ability of (never guessed).
 */
export function mayBeholdPrompt(d: ConfirmOptionalDecision, index: Index): string | null {
  if (d.purpose !== undefined || d.cost !== undefined) return null;
  const effect = index.get(d.source)?.ability?.effect;
  const may = effect === undefined ? null : findEffect(effect, 'may');
  if (may?.effect.kind !== 'behold') return null;
  const quality = beholdQuality(may.effect.filter);
  const reminder = beholdReminder(may.effect.filter);
  return quality === null || reminder === null ? null : `Behold ${quality}? ${reminder}.`;
}

/**
 * The "may search" question (CR 608.2d, 701.23, D-096). It is asked of the player who would search,
 * who is not always the one who cast the spell ("Its controller may search their library ...":
 * the human is asked during the opponent's Path to Exile), so the prompt says whose spell it is.
 */
export function searchPrompt(sourceName: string, caster: 'you' | 'other'): string {
  return caster === 'you'
    ? `${sourceName} lets you search your library. Search?`
    : `${sourceName} (the opponent's spell) lets you search your library. Search?`;
}

/**
 * "You may put it onto the battlefield" of a card an earlier sentence of the spell chose as its target (D-403, Cosmic Rebirth: "If it has mana value 3 or less, you may put it
 * onto the battlefield. If you don't put it onto the battlefield, put it into your hand."): worded "Put Grizzly Bears onto the battlefield? If you don't, it goes into your hand.",
 * from the spell on the stack (its text and the card it targets). Null for any other plain question, and when the target is not shown (never guessed).
 */
export function mayPutOntoBattlefieldPrompt(
  d: ConfirmOptionalDecision,
  index: Index,
): string | null {
  if (d.purpose !== undefined || d.cost !== undefined) return null;
  const spell = index.get(d.source);
  if (
    spell === undefined ||
    !/you may put it onto the battlefield\. If you don['’]t put it onto the battlefield, put it into your hand/iu.test(
      spell.oracleText,
    )
  ) {
    return null;
  }
  const target = spell.targets.find((t) => t.kind === 'object');
  const card = target?.kind === 'object' ? index.get(target.id)?.name : undefined;
  return card === undefined
    ? null
    : `Put ${card} onto the battlefield? If you don't, it goes into your hand.`;
}

/**
 * The name and rules text the question quotes. A land played from the hand as the back face of a
 * modal double-faced card (`face` set, CR 712.12) is still the front face in the hand, so the
 * decision's `sourceName` and `sourceOracleText` read the front face: the face being played is
 * looked up in the card's view instead, so the dialog names the land that is entering.
 */
export function optionalSource(
  d: ConfirmOptionalDecision,
  index: Index,
): { readonly name: string; readonly text: string } {
  const face = d.face === undefined ? undefined : index.get(d.source)?.faces?.[d.face];
  return face === undefined
    ? { name: d.sourceName, text: d.sourceOracleText }
    : { name: face.name, text: face.oracleText };
}

/**
 * #44: the card a "you may" trigger is about when it reads "that card" ("Whenever you discard a
 * creature card, you may pay {2}{U}. If you do, create a copy of that card"). Several of the same
 * trigger can wait at once, and the source and its text alone do not say which card each is for.
 * Null when the ability does not read one, or the card is not in view.
 */
export function optionalSubject(d: ConfirmOptionalDecision, index: Index): ObjectView | null {
  if (d.purpose !== undefined && d.purpose !== 'mayPay') return null;
  const id = index.get(d.source)?.triggerSubject;
  return id === undefined ? null : (index.get(id) ?? null);
}

export interface OptionalAsk {
  readonly prompt: string;
  readonly yes: string;
  readonly no: string;
  /** True when a Cancel answer exists: the kicker question rewinds the cast (CR 733). */
  readonly cancellable: boolean;
}

/**
 * "Pay" / "Don't pay", or "Discard" / "Don't discard" when the whole cost is a discard (D-095); declining an
 * upkeep payment sacrifices the permanent, so it says "Sacrifice it" (D-127).
 */
function unlessButtons(
  cost: readonly Cost[],
  sacrifice = false,
): { readonly yes: string; readonly no: string } {
  if (sacrifice) {
    const discard = cost.length > 0 && cost.every((c) => c.kind === 'discard');
    return { yes: discard ? 'Discard' : 'Pay', no: SACRIFICE_IT };
  }
  return cost.length > 0 && cost.every((c) => c.kind === 'discard')
    ? { yes: 'Discard', no: "Don't discard" }
    : { yes: 'Pay', no: "Don't pay" };
}

/** The decline button of a payment whose alternative is sacrificing the permanent (Echo, Cumulative upkeep). */
export const SACRIFICE_IT = 'Sacrifice it';

export function optionalAsk(d: ConfirmOptionalDecision, index: Index): OptionalAsk {
  // "As this land enters, you may reveal a Mountain or Plains card from your hand. If you don't, it enters tapped" (D-208, CR 701.20, 701.4).
  if (d.reveal !== undefined) {
    return {
      prompt: `${d.reveal.behold === true ? 'Behold' : 'Reveal'} ${d.reveal.words}${d.reveal.behold === true ? '' : ' from your hand'}? If you don't, ${d.sourceName} enters tapped.`,
      yes: d.reveal.behold === true ? 'Behold' : 'Reveal',
      no: "Don't",
      cancellable: false,
    };
  }
  if (d.purpose === 'ward') {
    // Declining is the answer "no", so there is no Cancel: nothing is rewound (the spell resolved
    // its way here) and the engine refuses `cancel` for this question.
    const subject = d.subject === undefined ? 'that spell' : stackName(index, d.subject);
    return {
      prompt: wardPrompt(d.cost ?? [], subject),
      ...unlessButtons(d.cost ?? []),
      cancellable: false,
    };
  }
  if (d.purpose === 'counterUnlessPays') {
    // The same question as Ward's, asked of the controller of the countered spell (`seat`). Nothing
    // is rewound by declining, so there is no Cancel (the engine refuses it).
    const subject = d.subject === undefined ? 'that spell' : stackName(index, d.subject);
    return {
      prompt: counterUnlessPaysPrompt(d.cost ?? [], subject, d.sourceName),
      ...unlessButtons(d.cost ?? []),
      cancellable: false,
    };
  }
  if (d.purpose === 'unlessPays') {
    // Declining lets the effect happen; nothing is rewound, so there is no Cancel.
    return {
      prompt: unlessPaysPrompt(d.cost ?? [], d, index),
      ...unlessButtons(d.cost ?? [], d.upkeep !== undefined || sacrificesIt(d, index)),
      cancellable: false,
    };
  }
  if (d.purpose === 'mayPay') {
    // Declining does nothing, and nothing is rewound by it: no Cancel (the engine refuses it).
    return {
      prompt: mayPayPrompt(d.cost ?? [], d, index),
      ...unlessButtons(d.cost ?? []),
      cancellable: false,
    };
  }
  if (d.purpose === 'cascade') {
    // Declining puts the card on the bottom with the others (Cascade), or into the hand (Discover and its kin, D-151); the engine
    // refuses `cancel` here.
    return {
      prompt: cascadePrompt(d, index),
      yes: 'Cast it',
      no: cascadeDecline(d, index),
      cancellable: false,
    };
  }
  if (d.purpose === 'miracleReveal') {
    // Miracle (CR 702.94a, D-274): "reveal the card you just drew?" Declining reveals nothing; the engine refuses `cancel`.
    const card = (d.subject === undefined ? undefined : index.get(d.subject)?.name) ?? d.sourceName;
    const cost = d.cost?.flatMap((c) => (c.kind === 'mana' ? [...c.symbols] : []));
    return {
      prompt: miracleRevealPrompt(card, cost),
      yes: 'Reveal it',
      no: "Don't reveal it",
      cancellable: false,
    };
  }
  if (d.purpose === 'suspend' || d.purpose === 'madness' || d.purpose === 'miracle') {
    // Suspend's "play it without paying its mana cost", Madness's "cast it by paying its madness cost" and Miracle's "cast it by paying
    // its miracle cost" (D-128, D-274). Declining leaves the card in exile, puts it into the graveyard or leaves it in the hand; nothing is rewound.
    const card = (d.subject === undefined ? undefined : index.get(d.subject)?.name) ?? d.sourceName;
    const cost = d.cost?.flatMap((c) => (c.kind === 'mana' ? [...c.symbols] : []));
    return {
      prompt: castNowPrompt(d.purpose, card, cost),
      ...castNowButtons(d.purpose, cost),
      cancellable: false,
    };
  }
  if (d.purpose === 'search') {
    const caster = index.get(d.source)?.controller;
    return {
      prompt: searchPrompt(d.sourceName, caster === d.seat ? 'you' : 'other'),
      yes: 'Search',
      no: "Don't search",
      cancellable: false,
    };
  }
  if (d.purpose === 'kicker') {
    return {
      prompt: kickerPrompt(d.cost ?? []),
      yes: 'Kick',
      no: "Don't kick",
      cancellable: true,
    };
  }
  if (d.purpose === 'gift') {
    // Gift (CR 702.174a, D-135): "Promise Opponent a gift?" asked as the spell is cast. Declining casts it with no gift
    // (the next opponent is offered first, if there are several); Cancel rewinds the cast (CR 733).
    const spell = index.get(d.source);
    return {
      prompt: giftPrompt(
        d.giftTo === d.seat ? 'you' : 'opponent',
        spell?.types ?? [],
        d.sourceName,
      ),
      yes: 'Gift',
      no: 'No gift',
      cancellable: true,
    };
  }
  if (d.purpose === 'castCard') {
    // D-350 (CR 608.2g): "you may cast target instant or sorcery card from a graveyard": the riders are read from the ability on the stack. Declining leaves the
    // card in its graveyard; nothing is rewound.
    const card = (d.subject === undefined ? undefined : index.get(d.subject)?.name) ?? d.sourceName;
    return {
      prompt: castCardPrompt(card, castCardOfAbility(index.get(d.source)?.ability)),
      yes: 'Cast it',
      no: "Don't cast it (it stays in the graveyard)",
      cancellable: false,
    };
  }
  if (d.purpose === 'pairReturn') {
    // D-272: "You may return those cards to the battlefield under their owners' control": both or neither; nothing is rewound by declining.
    const names = [d.pair?.theirs, d.pair?.mine].flatMap((id) => {
      const card = id === undefined ? undefined : index.get(id);
      return card === undefined ? [] : [card.name];
    });
    return {
      prompt: `${d.sourceName}: return ${names.join(' and ')} to the battlefield under their owners' control?`,
      yes: 'Return them',
      no: "Don't return",
      cancellable: false,
    };
  }
  if (d.purpose === 'costChoice') {
    // "Sacrifice an artifact or creature or pay {4}" (CR 118.8, 601.2b, D-181): asked as the spell is cast, each button is one way to pay;
    // Cancel rewinds the cast (CR 733).
    const first = additionalWayText(d.cost ?? []);
    const second = additionalWayText(d.otherCost ?? []);
    return {
      prompt: `${d.sourceName}: ${first}, or ${second}, as an additional cost?`,
      yes: first.replace(/^./, (c) => c.toUpperCase()),
      no: second.replace(/^./, (c) => c.toUpperCase()),
      cancellable: true,
    };
  }
  const behold = mayBeholdPrompt(d, index);
  if (behold !== null) {
    return { prompt: behold, yes: 'Behold', no: "Don't behold", cancellable: false };
  }
  const mayPut = mayPutOntoBattlefieldPrompt(d, index);
  if (mayPut !== null) {
    return {
      prompt: mayPut,
      yes: 'Put it onto the battlefield',
      no: 'Put it into your hand',
      cancellable: false,
    };
  }
  const mayEffect = mayEffectPrompt(d, index);
  if (mayEffect !== null) {
    return { prompt: mayEffect, yes: 'Yes', no: 'No', cancellable: false };
  }
  const mayDelayed = mayDelayedPrompt(d, index);
  if (mayDelayed !== null) {
    return { prompt: mayDelayed, yes: 'Yes', no: 'No', cancellable: false };
  }
  if (d.cost !== undefined) {
    return { prompt: payPrompt(d.cost), yes: 'Pay', no: "Don't pay", cancellable: false };
  }
  return {
    prompt: optionalPrompt(d.sourceName, d.sourceOracleText),
    yes: 'Yes',
    no: 'No',
    cancellable: false,
  };
}
