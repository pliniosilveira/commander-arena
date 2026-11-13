/**
 * Words for an activated ability (CR 602) in the ability chooser: the cost as Oracle text prints it
 * and a short description of the effect, read from the ability's AST (`ObjectView.activated`).
 * Cycling reads "Cycling {2}", Equip "Equip {1}", Unearth "Unearth {R}" and Crew "Crew 3", as on the card. The effect text
 * is a gist for choosing between abilities, never rules text: an effect kind it does not know is
 * left out, not guessed at.
 */
import type {
  ActivatedAbility,
  Amount,
  AttackedBySelector,
  Condition,
  Effect,
  ObjectFilter,
  ObjectRef,
  ObjectSelector,
  ObjectView,
  PlayerSelector,
  Restriction,
  StackAbility,
  TargetSpec,
  Trigger,
} from '@commander-arena/engine';
import {
  amountPhrase,
  attachedText,
  createDefinitions,
  type Definitions,
  quantity,
  type Unit,
} from '../../game/amount-text';
import { exileUntilText, PROLIFERATE_TEXT } from '../../game/angels-text';
import {
  chosenCardMoveText,
  costReducedByNote,
  discardUnlessTail,
  duringStepPhrase,
  lookAtTopText,
  nounOfTypes,
  numberWord,
  oncePerTurnNote,
  tapChooseText,
  triggerWords,
  untapChooseText,
} from '../../game/artifacts-text';
import { castCardText } from '../../game/cast-card-text';
import { gameConditionWords } from '../../game/condition-text';
import { copySpellWords, delayedCastWords } from '../../game/copy-text';
import { activationCostPart, activationCostText, unlessCostPhrase } from '../../game/cost-text';
import {
  castFreeText,
  dividedDamageText,
  doublePtText,
  fightText,
  preventByFilterText,
  revealUntilText,
} from '../../game/dinosaurs-text';
import {
  ANY_NUMBER_OF_CARDS,
  anyCombinationWords,
  beholdText,
  delayedWords,
  EXTRA_BEGINNING_PHASE_TEXT,
  exileTopText,
  exileUntilCastText,
  extraCombatText,
  fixedTimesWords,
  mayPlayText,
  payAnyAmountText,
  revealTopTail,
  revealTopText,
} from '../../game/dragons-text';
import { pluralSubtype, thingsPhrase } from '../../game/filter-text';
import { ENCORE_EFFECT_TEXT } from '../../game/keywords-text';
import { controlDurationText, requireAttackText } from '../../game/korvold-text';
import { playRuleWordings, staticWording } from '../../game/play-rule-text';
import { namesSeveral, subjectVerb } from '../../game/player-text';
import { ptEffectText } from '../../game/pt-text';
import { isReflexiveAbility, positionPhrase } from '../../game/recursion-text';
import { groupPhrase } from '../../game/static-text';
import { tokenWords } from '../../game/token-text';
import { filterPhrase, keywordWords, withText } from '../../game/trigger-text';

/** True for Cycling's expansion: an ability from the hand whose cost discards the card (CR 702.29a). */
export function isCycling(ability: ActivatedAbility): boolean {
  return ability.functionsIn === 'hand' && ability.cost.some((c) => c.kind === 'discardThis');
}

/** True for Equip's expansion: an ability whose effect attaches the card itself (CR 702.6a). */
export function isEquip(ability: ActivatedAbility): boolean {
  return ability.effect.kind === 'attach' && ability.effect.object.kind === 'this';
}

/**
 * The N of "Crew N" for the expansion of the crew keyword (CR 702.122a): the card has the keyword
 * and the ability's cost is tapping creatures; null for any other ability. The chooser then says
 * "Crew 3", which is what the card prints, instead of the long cost line.
 */
export function crewNumber(
  card: Pick<ObjectView, 'keywords'> | undefined,
  ability: ActivatedAbility,
): number | null {
  // Test doubles of a card may carry no keyword list; a real view always does.
  if (!(card?.keywords ?? []).includes('crew')) return null;
  const cost = ability.cost.find((c) => c.kind === 'tapCreatures');
  return cost === undefined ? null : cost.totalPower;
}

/** "Equip {1}", or "Equip—Pay 2 life" when the cost is not mana, as the keyword reads on a card. */
function costKeyword(word: string, cost: ActivatedAbility['cost']): string {
  const text = activationCostText(cost);
  return text.startsWith('{') ? `${word} ${text}` : `${word}—${text}`;
}

/** True for Encore's expansion: an ability from the graveyard whose effect is `encore` (CR 702.141a, D-185). */
export function isEncore(ability: ActivatedAbility): boolean {
  return ability.effect.kind === 'encore';
}

/** True for Unearth's expansion: an ability from the graveyard whose effect is `unearth` (CR 702.84a, D-124). */
export function isUnearth(ability: ActivatedAbility): boolean {
  return ability.effect.kind === 'unearth';
}

/** What the gist reads of an ability: the target slots its effect names (activated or triggered). */
type WithTargets = { readonly targets?: readonly TargetSpec[]; readonly trigger?: Trigger };

function nounOf(filter: ObjectFilter): string {
  // "creature or planeswalker": a disjunction names each member's noun once.
  const members = filter.anyOf ?? [];
  const types =
    members.length > 0 ? [...new Set(members.flatMap((m) => m.types ?? []))] : (filter.types ?? []);
  const subtypes = (filter.subtypes ?? []).join(' ');
  // D-145 (CR 903.3): "target commander", "target creature commander".
  const noun =
    filter.commander !== undefined
      ? [...types, 'commander'].join(' ')
      : types.length === 0
        ? 'permanent'
        : types.join(' or ');
  const named = subtypes === '' ? noun : `${subtypes} ${noun}`;
  // D-139: "target nontoken creature" (CR 111.1).
  const core = filter.token === false ? `nontoken ${named}` : named;
  // Mentor and Battle cry (CR 702.134a, 702.91a): "attacking creature".
  return filter.attacking === true ? `attacking ${core}` : core;
}

/** "creatures", "creature or planeswalker" as "creatures or planeswalkers": the noun of a slot of several targets (D-187). */
function pluralNounOf(filter: ObjectFilter): string {
  const noun = nounOf(filter);
  return noun
    .split(' or ')
    .map((word) => (word.endsWith('s') ? word : `${word}s`))
    .join(' or ');
}

function targetText(spec: TargetSpec | undefined): string {
  if (spec === undefined) return 'target';
  // D-151 (CR 115.3): "up to two other targets": a slot of several targets, kept apart from an earlier slot by the word "other".
  if (spec.what.kind === 'anyTarget' && (spec.differentFrom !== undefined || (spec.max ?? 1) > 1)) {
    const most = spec.max ?? 1;
    const other = spec.differentFrom === undefined ? '' : 'other ';
    const count = (spec.min ?? 1) === 0 && most > 1 ? `up to ${numberWord(most)} ` : '';
    return most > 1 ? `${count}${other}targets` : `another target`;
  }
  switch (spec.what.kind) {
    case 'object': {
      // D-135: a card in a graveyard, "target Zombie creature card from your graveyard".
      if (spec.what.filter.zone === 'graveyard') {
        const { controller } = spec.what.filter;
        const whose =
          controller === 'you' ? 'your' : controller === 'opponent' ? "an opponent's" : 'a';
        return `target ${nounOf(spec.what.filter)} card from ${whose} graveyard${withText(spec.what.filter)}`;
      }
      // "target creature an opponent controls": the controller is part of what the text promises.
      const { controller } = spec.what.filter;
      const who =
        controller === 'opponent'
          ? ' an opponent controls'
          : controller === 'you'
            ? ' you control'
            : controller === 'triggerPlayer'
              ? ' that opponent controls'
              : controller === 'defendingPlayer'
                ? ' defending player controls'
                : '';
      // D-149: "target commander you own": the commander a player designated and owns, wherever it is controlled.
      const owned =
        (spec.what.filter.commander === 'yours' ? ' you own' : '') +
        // Group 4 of the Vraska deck (CR 400.7): "target commander that entered this turn".
        (spec.what.filter.enteredThisTurn === true ? ' that entered this turn' : '');
      // D-187 (CR 603.12, 115.2): "up to that many target creatures" (the number not fixed yet), "up to two target creatures": several targets, the noun plural.
      if (spec.upToThatMany === true || ((spec.max ?? 1) > 1 && (spec.min ?? 1) === 0)) {
        const count = spec.upToThatMany === true ? 'that many' : numberWord(spec.max ?? 1);
        return `up to ${count} target ${pluralNounOf(spec.what.filter)}${owned}${who}${withText(spec.what.filter)}`;
      }
      return `target ${nounOf(spec.what.filter)}${owned}${who}${withText(spec.what.filter)}`;
    }
    case 'player':
      return spec.what.filter === 'opponent' ? 'target opponent' : 'target player';
    case 'anyTarget':
      return 'any target';
    case 'playerOrObject':
      // D-200: "target player or planeswalker", "target opponent or planeswalker" (or battle).
      return `target ${spec.what.player === 'opponent' ? 'opponent' : 'player'} or ${nounOf(spec.what.filter)}`;
    case 'objectOrGraveyardCard': {
      // D-270 (CR 115.1): "up to three other target creatures from the battlefield and/or creature cards from graveyards".
      const cards = nounOf(spec.what.card);
      if ((spec.max ?? 1) <= 1) {
        const one = spec.what.filter.other === true ? 'another target' : 'target';
        return `${one} ${nounOf(spec.what.filter)} from the battlefield or a ${cards} card from a graveyard`;
      }
      const other = spec.what.filter.other === true ? 'other ' : '';
      const upTo =
        (spec.min ?? 1) === 0
          ? `up to ${numberWord(spec.max ?? 1)} `
          : `${numberWord(spec.max ?? 1)} `;
      return `${upTo}${other}target ${pluralNounOf(spec.what.filter)} from the battlefield and/or ${cards} cards from graveyards`;
    }
  }
}

/** What the ability's text calls an object: the card itself, a target slot, or a group. */
function objectText(what: ObjectSelector, ability: WithTargets, self: string): string {
  switch (what.kind) {
    case 'this':
      return `this ${self}`;
    case 'thisSpell':
      return 'this spell';
    case 'target':
      return targetText(ability.targets?.find((t) => t.id === what.id));
    case 'each':
      // D-151: "each other creature", the one the effect names is left out.
      return eachText(what.except === undefined ? what.filter : { ...what.filter, other: true });
    case 'moved':
      return 'it';
    case 'triggerSubject':
      // The spell of a "whenever you cast" trigger (Storm-like copies) or what targeted the permanent; else the
      // permanent or creature the trigger is about (D-133): "put a +1/+1 counter on it".
      return ability.trigger === undefined ||
        ability.trigger.kind === 'castSpell' ||
        ability.trigger.kind === 'becomesTarget'
        ? 'that spell'
        : 'it';
    case 'thisCard':
    case 'triggerCard':
      // Persist and Undying: "return it to the battlefield", the card the creature became (CR 603.10a); D-230 "return that card".
      return 'it';
    case 'sacrificedCost':
    case 'sacrificed':
      return 'the sacrificed creature';
    case 'attached':
      return attachedText(self);
    case 'linkedExile':
      // D-145: the card this permanent exiled with a linked ability (Hideaway).
      return 'the exiled card';
  }
}

/**
 * Marks a group the words cannot say (an `each` over a filter with a field they leave out): the gist that holds it is
 * dropped as a whole, never said with the field missing (AGENTS.md "Honesty").
 */
const UNSAID = '\u0000';

/** The fields of a filter the fallback of `eachText` says: its nouns and the "with ..." clause. */
const FALLBACK_SAYS: ReadonlySet<string> = new Set([
  'types',
  'subtypes',
  'attacking',
  'other',
  'power',
  'toughness',
  'manaValue',
  'manaValueX',
  'colorCount',
  'keywords',
  'notKeywords',
  'powerLessThanSource',
  'controllerDealtDamageBySource',
]);

/**
 * "each Zombie you control", "each creature you control with power 3 or greater", "each non-Zombie creature",
 * "each other creature": the group of an `each` selector, from the filter's own words (its controller and
 * counted fields included). A filter those words cannot say falls back to its nouns.
 */
function eachText(given: ObjectFilter): string {
  // D-151 (CR 506.4): "untap all attacking creatures": only a creature attacks, so a filter of the attacking ones names creatures.
  const filter =
    given.attacking === true && given.types === undefined && given.anyOf === undefined
      ? { ...given, types: ['creature' as const] }
      : given;
  // D-139: "all artifacts, creatures and enchantments", a union of kinds.
  if (filter.anyOf !== undefined) {
    const group = groupPhrase(filter);
    return group === null ? UNSAID : `all ${group}`;
  }
  const things = thingsPhrase(filter, false);
  if (things !== null) return `each ${things.replace(' on the battlefield', '')}`;
  if (Object.keys(filter).some((k) => !FALLBACK_SAYS.has(k))) return UNSAID;
  return `each ${filter.other === true ? 'other ' : ''}${nounOf(filter)}${withText(filter)}`;
}

/** "each opponent's graveyard" (D-139): an `each` over the cards of graveyards by owner, or null. */
function graveyardsText(filter: ObjectFilter): string | null {
  const { zone, owner, ...rest } = filter;
  if (zone !== 'graveyard' || owner === undefined || Object.keys(rest).length > 0) return null;
  if (owner.kind === 'you') return 'your graveyard';
  if (owner.kind === 'eachOpponent') return "each opponent's graveyard";
  if (owner.kind === 'eachPlayer') return "each player's graveyard";
  return null;
}

/** The recipient of damage: an object selector or a player selector. */
function recipientText(
  to: ObjectSelector | PlayerSelector | AttackedBySelector,
  ability: WithTargets,
  self: string,
): string {
  switch (to.kind) {
    case 'you':
      return 'you';
    case 'eachPlayer':
      return 'each player';
    case 'eachOpponent':
      return 'each opponent';
    case 'eachOtherOpponent':
      return 'each other opponent';
    case 'controllerOf':
      return 'its controller';
    case 'ownerOf':
      return 'its owner';
    case 'triggerSubject':
      return 'it';
    case 'defendingPlayer':
      return 'the defending player';
    case 'attackedBy':
      // D-139 (CR 508.1b): "the player or planeswalker it's attacking".
      return "the player or planeswalker it's attacking";
    case 'triggerPlayer':
      return 'that player';
    case 'giftRecipient':
      // CR 702.174a (D-135): the opponent the caster promised the gift to.
      return 'the chosen player';
    case 'discardedThisWay':
      return 'each player who discarded a card this way';
    case 'attackedPlayers':
      // D-269 (CR 508.6).
      return 'each player this creature attacked this turn';
    case 'all':
      return to.of.map((member) => recipientText(member, ability, self)).join(' and ');
    case 'target':
    case 'this':
    case 'thisSpell':
    case 'moved':
    case 'thisCard':
    case 'triggerCard':
    case 'sacrificedCost':
    case 'sacrificed':
    case 'attached':
    case 'linkedExile':
    case 'each':
      return objectText(to, ability, self);
  }
}

/** "a card", "3 cards", "X cards" (X defined at the end of the sentence). */
const CARD: Unit = { one: 'a card', many: 'cards' };

/** "1 life", "5 life", "X life". */
const LIFE: Unit = { one: '1 life', many: 'life' };

/** "a +1/+1 counter", "3 age counters". */
const counters = (counter: string): Unit => ({
  one: `a ${counter} counter`,
  many: `${counter} counters`,
});

/** What a `restrict` effect says after its subject, in the singular ("Target creature can't be blocked this turn"). */
const RESTRICTION_EFFECT: Readonly<Record<Restriction, string>> = {
  cantAttack: "can't attack",
  cantBlock: "can't block",
  cantBeBlocked: "can't be blocked",
  cantBeBlockedByMoreThanOne: "can't be blocked by more than one creature",
  attacksEachCombat: 'attacks if able',
  mustBeBlocked: 'must be blocked if able',
  doesntUntap: "doesn't untap",
  cantBeCountered: "can't be countered",
};

const lower = (text: string): string => text.charAt(0).toLowerCase() + text.slice(1);

/** "a" or "an" for the first word of a phrase ("an 8/8 white Angel creature token"). */
const withArticle = (phrase: string): string =>
  /^(?:[aeiou]|8|11|18)/i.test(phrase) ? `an ${phrase}` : `a ${phrase}`;

/** The subject and verb of a player effect: "You draw", "Each player draws", "You and target opponent each draw". */
function playerVerb(player: PlayerSelector, ability: WithTargets, verb: string): string {
  return subjectVerb(player, verb, (id) => targetText(ability.targets?.find((t) => t.id === id)));
}

/** "your", "target player's", "each opponent's": whose life total or other possession an effect sets (D-201). */
function playerOwner(player: PlayerSelector, ability: WithTargets): string {
  if (player.kind === 'you') return 'your';
  if (player.kind === 'target') {
    const text = targetText(ability.targets?.find((t) => t.id === player.id));
    return `${text}'s`;
  }
  return player.kind === 'eachOpponent' ? "each opponent's" : "each player's";
}

/** "a permanent", "an artifact or creature", "2 permanents", "X creatures": what a choice of permanents names. */
function chosenPermanents(filter: ObjectFilter, amount: Amount, defs: Definitions): string {
  const noun = nounOf(filter);
  if (amount === 1) return `${/^[aeiou]/.test(noun) ? 'an' : 'a'} ${noun}`;
  const types = filter.types ?? [];
  const subtypes = (filter.subtypes ?? []).join(' ');
  const plural = (types.length === 0 ? ['permanent'] : types).map((t) => `${t}s`).join(' or ');
  return `${defs.say(amount)} ${subtypes === '' ? '' : `${subtypes} `}${plural}`;
}

/**
 * "any number of other permanents you control" (D-135): what an "any number" choice names, from its filter. The
 * controller is the player who sacrifices, so a sacrifice by another player says "they control".
 */
function anyNumberOf(filter: ObjectFilter, theirs: boolean, atLeastOne = false): string {
  const things = thingsPhrase({ ...filter, controller: 'you' }, true);
  // D-187 (CR 701.21): "one or more Treasures" is some or all of them, not none.
  return `${atLeastOne ? 'one or more' : 'any number of'} ${things === null ? 'permanents' : things.replace(/ you control$/, theirs ? ' they control' : ' you control')}`;
}

/** "with the greatest power among creatures they control" (D-135): the stat of a `greatest` choice. */
function greatestOf(
  stat: 'power' | 'toughness' | 'manaValue',
  filter: ObjectFilter,
  theirs: boolean,
): string {
  const things = thingsPhrase({ ...filter, controller: 'you' }, true);
  const group = things === null ? 'permanents' : things;
  const word = stat === 'manaValue' ? 'mana value' : stat;
  return ` with the greatest ${word} among ${group.replace(/ you control$/, theirs ? ' they control' : ' you control')}`;
}

/** The gist of a sacrifice effect: "Defending player sacrifices 2 permanents", "Sacrifice this creature". */
function sacrificeText(
  effect: Extract<Effect, { kind: 'sacrifice' }>,
  ability: WithTargets,
  self: string,
  defs: Definitions,
): string {
  const { objects, player } = effect;
  // D-139: "Each player sacrifices all permanents they control that are two or more colors": an `each` with no
  // player and no controller is sacrificed by each controller of what it matches.
  if (player === undefined && objects.kind === 'each' && objects.filter.controller === undefined) {
    const things = thingsPhrase({ ...objects.filter, controller: 'you' }, true);
    return things === null
      ? UNSAID
      : `Each player sacrifices all ${things.replace(' you control', ' they control')}`;
  }
  const theirs = player !== undefined && player.kind !== 'you';
  const what =
    objects.kind !== 'choose'
      ? objectText(objects, ability, self)
      : objects.anyNumber === true
        ? anyNumberOf(objects.filter, theirs, objects.atLeastOne === true)
        : `${chosenPermanents(objects.filter, objects.count ?? 1, defs)}${
            objects.greatest === undefined
              ? ''
              : greatestOf(objects.greatest, objects.filter, theirs)
          }`;
  if (player === undefined) return `Sacrifice ${what}`;
  // CR 101.4 (D-131): each of several players chooses their own, in turn order.
  const choice = objects.kind === 'choose' && namesSeveral(player) ? ' of their choice' : '';
  return `${playerVerb(player, ability, 'sacrifice')} ${what}${choice}`;
}

const capital = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/** Who pays in "unless ... pays": "you", "that player", "they" (each opponent). */
function payerWords(player: PlayerSelector): { readonly who: string; readonly third: boolean } {
  switch (player.kind) {
    case 'you':
      return { who: 'you', third: false };
    case 'eachOpponent':
    case 'eachOtherOpponent':
    case 'eachPlayer':
      return { who: 'they', third: false };
    case 'controllerOf':
    case 'ownerOf':
      return { who: 'that player', third: true };
    case 'target':
      return { who: 'that player', third: true };
    case 'defendingPlayer':
      return { who: 'the defending player', third: true };
    case 'triggerPlayer':
      return { who: 'that player', third: true };
    case 'giftRecipient':
      return { who: 'the chosen player', third: true };
    case 'discardedThisWay':
    case 'attackedPlayers':
      return { who: 'they', third: false };
    case 'all':
      return { who: 'they', third: false };
  }
}

/** What a creature that is the source of damage is called: "target creature you control", "that creature", "this creature". */
function sourceText(from: ObjectRef, ability: WithTargets, self: string): string {
  return from.kind === 'triggerSubject' ? 'that creature' : objectText(from, ability, self);
}

/**
 * The gist of damage. A spell or ability's own damage is "Deal 3 damage to target creature"; with a source
 * creature (D-131, CR 120.3) it is that creature that deals it: "Target creature you control deals damage
 * equal to its power to target creature you don't control". A stat of a creature reads "damage equal to ...".
 */
function damageText(
  effect: Extract<Effect, { kind: 'dealDamage' }>,
  ability: WithTargets,
  self: string,
  defs: Definitions,
): string {
  const { amount, from } = effect;
  const to = recipientText(effect.to, ability, self);
  const stat =
    typeof amount === 'object' && (amount.kind === 'powerOf' || amount.kind === 'toughnessOf');
  // D-151: "2 damage for each of those cards that are still exiled".
  const perCard =
    typeof amount === 'object' &&
    amount.kind === 'multiple' &&
    typeof amount.of === 'object' &&
    amount.of.kind === 'exiledStillThere';
  const damage = stat
    ? `damage equal to ${amountPhrase(amount, { self, ...(from === undefined ? {} : { same: from }) })}`
    : perCard
      ? `${amount.factor} damage`
      : `${defs.say(amount, { self })} damage`;
  const perCardTail = perCard ? ' for each of those cards that are still exiled' : '';
  // D-151 (CR 115.3): "3 damage to each of up to two other targets".
  const each = to.startsWith('up to ') ? 'each of ' : '';
  const text =
    from === undefined
      ? `Deal ${damage} to ${each}${to}${perCardTail}`
      : `${capital(sourceText(from, ability, self))} deals ${damage} to ${each}${to}${perCardTail}`;
  // D-145 (CR 702.19b): "If the creature you control has trample, excess damage is dealt to that creature's controller instead".
  return effect.trampleExcess === true && from !== undefined
    ? `${text}. If ${lower(sourceText(from, ability, self))} has trample, excess damage is dealt to that creature's controller instead`
    : text;
}

/** "Create 13 tapped 2/2 black Zombie creature tokens", "Create X tapped Treasure tokens, where X is ...". */
function tokenText(
  effect: Extract<Effect, { kind: 'createToken' }>,
  ability: WithTargets,
  self: string,
  defs: Definitions,
): string {
  const words = tokenWords(effect.token, effect.tapped === true, (ref) =>
    objectText(ref, ability, self),
  );
  const what = quantity(effect.count, defs, { one: withArticle(words.one), many: words.many });
  return effect.controller === undefined
    ? `Create ${what}`
    : `${playerVerb(effect.controller, ability, 'create')} ${what}`;
}

/**
 * Where a card moved to, worded: "Return target creature card from your graveyard to your hand", "Return it to the
 * battlefield with a +1/+1 counter on it", "Put it third from the top of its owner's library" (D-135, CR 401.7). A chosen
 * set (the player picks among their permanents) is not worded, never guessed.
 */
function moveText(
  effect: Extract<Effect, { kind: 'moveToZone' }>,
  ability: WithTargets,
  self: string,
  defs: Definitions,
): string {
  const { objects } = effect;
  // D-139: "You may put an artifact card from your hand onto the battlefield"; any other chosen set is not worded.
  if (objects.kind === 'choose') return chosenCardMoveText(effect) ?? '';
  const what = objectText(objects, ability, self);
  // D-151 (CR 113.6b): a card that returns itself from the graveyard says where it comes from.
  if (objects.kind === 'this' && self === 'card' && effect.to === 'hand') {
    return 'Return this card from your graveyard to your hand';
  }
  // A target in your own graveyard goes to "your" hand or library, any other card to "its owner's".
  const spec =
    objects.kind === 'target' ? ability.targets?.find((t) => t.id === objects.id) : undefined;
  const yours =
    spec?.what.kind === 'object' &&
    spec.what.filter.zone === 'graveyard' &&
    spec.what.filter.controller === 'you';
  const owner = yours ? 'your' : "its owner's";
  switch (effect.to) {
    case 'hand':
      return `Return ${what} to ${owner} hand`;
    case 'library':
      return `Put ${what} ${positionPhrase(effect.position ?? 'top')} ${owner} library`;
    case 'graveyard':
      return `Put ${what} into ${owner} graveyard`;
    case 'battlefield': {
      const kept = effect.withCounters;
      const withCounters =
        kept === undefined
          ? ''
          : ` with ${quantity(kept.count, defs, counters(kept.counter))} on ${objects.kind === 'each' ? 'them' : 'it'}`;
      // The card itself comes back to its owner's control anyway; a target or a group says it.
      const control =
        effect.controller === 'owner' && (objects.kind === 'target' || objects.kind === 'each')
          ? " under its owner's control"
          : '';
      return `Return ${what} to the battlefield${effect.tapped === true ? ' tapped' : ''}${control}${withCounters}`;
    }
  }
}

/** The effect worded, with the definitions of its X at the end: "Draw X cards, where X is the number of Zombies you control". */
function gistOf(effect: Effect, ability: WithTargets, self: string): string {
  const defs = createDefinitions();
  const text = effectText(effect, ability, self, defs);
  return text === '' || text.includes(UNSAID) ? '' : `${text}${defs.tail()}`;
}

/**
 * The effects of a sequence as sentences. Three shapes read across their neighbours (D-151): "You may play those cards" after an
 * exile of several cards, "... onto the battlefield tapped and attacking" when a creature enters attacking, and the owner who
 * shuffles a permanent into their library and then reveals its top card. Everything else is one sentence for each effect.
 */
function sequenceText(
  effects: readonly Effect[],
  ability: WithTargets,
  self: string,
  defs: Definitions,
): string {
  const out: string[] = [];
  let several = false;
  for (let at = 0; at < effects.length; at += 1) {
    const effect = effects[at];
    if (effect === undefined) continue;
    const shuffled = shuffleIntoThenReveal(effects, at, ability, self);
    if (shuffled !== null) {
      out.push(shuffled);
      at += 2;
      continue;
    }
    // D-327: "Mill two cards. You may play those cards this turn." says it the same way after a mill.
    if (effect.kind === 'exileTop' || effect.kind === 'mill') several = effect.count !== 1;
    const text =
      effect.kind === 'mayPlay'
        ? mayPlayText(effect, several)
        : effect.kind === 'enterAttacking'
          ? ''
          : effectText(effect, ability, self, defs);
    if (effect.kind === 'enterAttacking') {
      const last = out.length - 1;
      if (last >= 0) out[last] = `${out[last]} and attacking`;
      continue;
    }
    if (text !== '') out.push(text);
  }
  return out.join('. ');
}

/**
 * "The owner of target permanent shuffles it into their library, then reveals the top card of their library. If it's a permanent card,
 * they put it onto the battlefield" (D-151, CR 701.24, 701.20): the move to the library, the shuffle and the reveal of the same owner,
 * read as one sentence, or null for any other three effects.
 */
function shuffleIntoThenReveal(
  effects: readonly Effect[],
  at: number,
  ability: WithTargets,
  self: string,
): string | null {
  const [move, shuffle, reveal] = [effects[at], effects[at + 1], effects[at + 2]];
  if (move?.kind !== 'moveToZone' || move.to !== 'library' || move.objects.kind === 'choose') {
    return null;
  }
  if (shuffle?.kind !== 'shuffle' || reveal?.kind !== 'revealTop') return null;
  if (shuffle.player.kind !== 'ownerOf' || reveal.player.kind !== 'ownerOf') return null;
  if (JSON.stringify(shuffle.player.of) !== JSON.stringify(move.objects)) return null;
  if (JSON.stringify(reveal.player.of) !== JSON.stringify(move.objects)) return null;
  const owner = `the owner of ${objectText(move.objects, ability, self)}`;
  const tail = revealTopTail(reveal, false);
  if (tail === null) return null;
  return `${capital(owner)} shuffles it into their library, then reveals the top card of their library. ${tail}`;
}

function effectText(effect: Effect, ability: WithTargets, self: string, defs: Definitions): string {
  const object = (what: ObjectSelector) => objectText(what, ability, self);
  switch (effect.kind) {
    case 'unlessPays': {
      // "You may draw a card unless that player pays {1}" (CR 118.12a, D-111).
      const inner = effectText(effect.effect, ability, self, defs);
      if (inner === '') return '';
      const what =
        effect.optional === true && inner.startsWith('You ') ? `You may ${inner.slice(4)}` : inner;
      const payer = payerWords(effect.player);
      return `${what} unless ${payer.who} ${unlessCostPhrase(effect.cost, payer.third)}`;
    }
    case 'cumulativeUpkeep':
      // CR 702.24a (D-127): the whole ability of the keyword, in the words of its reminder text.
      return `Put an age counter on this ${self}. Sacrifice it unless you ${unlessCostPhrase(effect.cost)} for each age counter on it`;
    case 'becomeMonarch':
      // CR 725.1 (D-127): "you become the monarch", "its controller becomes the monarch".
      return `${playerVerb(effect.player, ability, 'become')} the monarch`;
    case 'gainLevel':
      // CR 716.2a (D-235): the effect of a class level bar, "Level 2".
      return `Level ${effect.level}`;
    case 'phaseOut':
      // CR 702.26 (D-234): "any number of other target creatures you control phase out".
      return `Phase out ${object(effect.objects)}`;
    case 'sequence':
      return sequenceText(effect.effects, ability, self, defs);
    case 'modifyPt':
    case 'setPt': {
      // D-145 (CR 701.10): "Double the power and toughness of each creature you control until end of turn".
      if (effect.kind === 'modifyPt') {
        const doubled = doublePtText(effect, object(effect.objects));
        if (doubled !== null) return doubled;
      }
      // "gets +1/+1 for each artifact you control", "gets -X/-X", "has base power and toughness 4/4"; the duration
      // goes before the definition of X ("gets +X/+0 until end of turn, where X is ...").
      const words = ptEffectText(effect);
      const until = effect.duration === 'untilEndOfTurn' ? ' until end of turn' : '';
      const at = words.indexOf(', where ');
      const said = at < 0 ? `${words}${until}` : `${words.slice(0, at)}${until}${words.slice(at)}`;
      return `${capital(object(effect.objects))} ${said}`;
    }
    case 'draw':
      // D-135: "draw that many cards" after "sacrifice any number of ...": the count of the instruction before.
      if (
        typeof effect.count === 'object' &&
        effect.count.kind === 'thisWay' &&
        (effect.count.what === 'sacrificed' ||
          effect.count.what === 'destroyed' ||
          effect.count.what === 'discarded')
      ) {
        return `${playerVerb(effect.player, ability, 'draw')} that many cards`;
      }
      // D-364: "If you do, draw that many cards" after "you may pay that much life": the life that caused the trigger.
      if (typeof effect.count === 'object' && effect.count.kind === 'triggerDamage') {
        return `${playerVerb(effect.player, ability, 'draw')} that many cards`;
      }
      // D-217 (CR 121.1): "Its controller may draw up to two cards": the player is the one the ability named as it was created.
      if (effect.upTo === true) {
        const who = effect.player.kind === 'triggerPlayer' ? 'That player' : 'You';
        return `${who} may draw up to ${quantity(effect.count, defs, CARD)}`;
      }
      return `${playerVerb(effect.player, ability, 'draw')} ${quantity(effect.count, defs, CARD)}`;
    case 'discard': {
      // D-151 (CR 701.9): "You discard any number of cards".
      if (effect.anyNumber === true) {
        return `${playerVerb(effect.player, ability, 'discard')} ${ANY_NUMBER_OF_CARDS}`;
      }
      // D-139: "You discard 2 cards unless you discard an artifact card".
      const unless = discardUnlessTail(effect);
      if (unless === null) return UNSAID;
      return `${playerVerb(effect.player, ability, 'discard')} ${quantity(effect.count, defs, CARD)}${unless}`;
    }
    case 'lookAtTop':
      // D-139 (CR 701.20): look at the top cards and take some of a kind into the hand.
      return lookAtTopText(effect, (amount) => defs.say(amount, { self })) ?? UNSAID;
    case 'mill':
      // CR 701.17a (D-131): the top cards of a library go to its owner's graveyard.
      return `${playerVerb(effect.player, ability, 'mill')} ${quantity(effect.count, defs, CARD)}`;
    case 'gainLife':
      // "You gain life equal to the total life lost this way", not "gain the total ... life".
      if (typeof effect.amount === 'object' && effect.amount.kind === 'lifeLostThisWay') {
        return `${playerVerb(effect.player, ability, 'gain')} life equal to ${amountPhrase(effect.amount)}`;
      }
      // D-133: "you gain that much life" (the damage that caused the trigger).
      return typeof effect.amount === 'object' && effect.amount.kind === 'triggerDamage'
        ? `${playerVerb(effect.player, ability, 'gain')} that much life`
        : `${playerVerb(effect.player, ability, 'gain')} ${quantity(effect.amount, defs, LIFE)}`;
    case 'loseLife':
      // D-365: "Each opponent loses life equal to the life that player lost this turn", not "loses the life ... life".
      if (typeof effect.amount === 'object' && effect.amount.kind === 'lifeLostThisTurn') {
        return `${playerVerb(effect.player, ability, 'lose')} life equal to ${amountPhrase(effect.amount)}`;
      }
      return typeof effect.amount === 'object' && effect.amount.kind === 'triggerDamage'
        ? `${playerVerb(effect.player, ability, 'lose')} that much life`
        : `${playerVerb(effect.player, ability, 'lose')} ${quantity(effect.amount, defs, LIFE)}`;
    case 'sacrifice':
      return sacrificeText(effect, ability, self, defs);
    case 'dealDamage':
      return damageText(effect, ability, self, defs);
    case 'dealDividedDamage': {
      // D-145 (CR 601.2d): the total is read as the spell is cast; the slot says what the damage is divided among.
      const spec = ability.targets?.find((t) => t.id === effect.to.id);
      const total = spec?.divide === undefined ? null : defs.say(spec.divide.total, { self });
      return total === null ? UNSAID : (dividedDamageText(spec, total) ?? UNSAID);
    }
    case 'fight':
      // D-145 (CR 701.14).
      return fightText(effect, { object }) ?? UNSAID;
    case 'revealUntil':
      // D-145 (CR 701.20).
      return revealUntilText(effect) ?? UNSAID;
    case 'castCard':
      // D-350 (CR 608.2g, 609.4b, 614.1a): "You may cast target instant or sorcery card from a graveyard, and mana of any type can be spent to cast that spell. If that spell
      // would be put into a graveyard, exile it instead".
      return castCardText(effect, object(effect.object));
    case 'castFree':
      // D-145 (CR 608.2g, 118.9).
      return castFreeText(effect) ?? UNSAID;
    case 'preventDamage':
      // D-145 (CR 615.1): only the prevention by the kind of source is worded; any other leaves the instruction out.
      return preventByFilterText(effect) ?? '';
    case 'destroy':
      return effect.cantBeRegenerated === true
        ? `Destroy ${object(effect.objects)}. It can't be regenerated`
        : `Destroy ${object(effect.objects)}`;
    case 'regenerate':
      // CR 701.19a (D-120): the shield lasts until end of turn.
      return `Regenerate ${object(effect.objects)}`;
    case 'mayPay': {
      // Extort (CR 702.101a): "You may pay {W/B}. If you do, each opponent loses 1 life. You gain life ...".
      const inner = effectText(effect.effect, ability, self, defs);
      const pay = `You may ${unlessCostPhrase(effect.cost)}`;
      return inner === ''
        ? pay
        : `${pay}. If you do, ${inner.charAt(0).toLowerCase()}${inner.slice(1)}`;
    }
    case 'encore':
      // CR 702.141a (D-185): the whole ability is the keyword; the card was exiled as the cost.
      return ENCORE_EFFECT_TEXT;
    case 'unearth':
      // CR 702.84a (D-124): the whole ability is the keyword; the card returns as a new object with
      // haste, a delayed trigger exiles it at the next end step, and a replacement exiles it instead
      // of letting it go anywhere else.
      return 'Return this card from your graveyard to the battlefield. It gains haste. Exile it at the beginning of the next end step. If it would leave the battlefield, exile it instead of putting it anywhere else';
    case 'cascade':
      // CR 702.85a: the whole ability in a line.
      return 'Exile cards from the top of your library until you exile a nonland card with lesser mana value, and you may cast it without paying its mana cost';
    case 'moveToZone':
      return moveText(effect, ability, self, defs);
    case 'may': {
      // CR 608.2c (D-135): "You may discard a card", "You may exile it".
      const inner = effectText(effect.effect, ability, self, defs);
      if (inner === '') return '';
      return inner.startsWith('You ') ? `You may ${inner.slice(4)}` : `You may ${lower(inner)}`;
    }
    case 'reflexive': {
      // CR 603.12 (D-135): "When you do, return target creature card from your graveyard to your hand". Its own
      // targets are the ones its words name.
      const inner = effectText(
        effect.effect,
        effect.targets === undefined ? ability : { ...ability, targets: effect.targets },
        self,
        defs,
      );
      return inner === '' ? '' : `When you do, ${lower(inner)}`;
    }
    case 'mayCast':
      // D-135 (CR 601.2, 611.2a): "You may cast target Zombie creature card from your graveyard this turn".
      // D-359 (CR 614.1a): the rider "If that spell would be put into your graveyard, exile it instead".
      return `You may cast ${object(effect.objects)} this turn${
        effect.exileInstead === true
          ? '. If that spell would be put into your graveyard, exile it instead'
          : ''
      }`;
    case 'exile': {
      // D-149 (CR 610.3): "Exile target creature until this enchantment leaves the battlefield", one for each opponent.
      if (effect.until !== undefined) {
        const { objects } = effect;
        const spec =
          objects.kind === 'target' ? ability.targets?.find((t) => t.id === objects.id) : undefined;
        return exileUntilText(effect, spec, object(effect.objects), self) ?? UNSAID;
      }
      // D-139: "Exile each opponent's graveyard".
      const graveyards =
        effect.objects.kind === 'each' ? graveyardsText(effect.objects.filter) : null;
      if (graveyards !== null) return `Exile ${graveyards}`;
      // D-139 (CR 607.2a): a card exiled with a linked ability is the one the permanent's other ability reads.
      return effect.linked === true
        ? `Exile ${object(effect.objects)}. It's exiled with this ${self}`
        : `Exile ${object(effect.objects)}`;
    }
    case 'tap':
      // D-139 (CR 701.26a): "You may tap any number of untapped Myr you control".
      return effect.objects.kind === 'choose'
        ? (tapChooseText(effect.objects) ?? UNSAID)
        : `Tap ${object(effect.objects)}`;
    case 'vote':
      // D-194 (CR 701.38a): "Starting with you, each player votes for profit or security".
      return `Starting with you, each player votes for ${effect.options.length <= 2 ? effect.options.join(' or ') : `${effect.options.slice(0, -1).join(', ')} or ${effect.options[effect.options.length - 1]}`}`;
    case 'pair':
      // D-286 (CR 702.95a): the effect of the two abilities soulbond stands for; the creature is chosen as it resolves.
      return effect.partner === 'choose'
        ? 'You may pair this creature with another unpaired creature you control'
        : 'You may pair this creature with the creature that entered';
    case 'ringTempts':
      // D-196 (CR 701.54a): the Ring tempts the controller.
      return 'The Ring tempts you';
    case 'empowerJace':
      // D-201 (CR 701.71a): the keyword action, as the cards write it.
      return `Empower Jace ${effect.amount}`;
    case 'amass':
      // D-367 (CR 701.47a): the keyword action, as the cards write it (older cards: "amass Zombies 1").
      return `Amass ${pluralSubtype(effect.subtype)} ${amountPhrase(effect.count)}`;
    case 'createEmblem':
      // D-201 (CR 114.1): "You get an emblem with "...", the text the emblem shows.
      return `You get an emblem with "${effect.text}"`;
    case 'meld':
      // D-278 (CR 701.42a): "Exile this creature and the creature named Bruna, the Fading Light, then meld them into Brisela, Voice of Nightmares".
      return `Exile this permanent and the creature named ${effect.partner}, then meld them into ${effect.result}`;
    case 'loseGame':
      // D-269 (CR 104.3e): "Each player this creature attacked this turn loses the game".
      return `${playerVerb(effect.player, ability, 'lose')} the game`;
    case 'setLifeTotal':
      // D-201 (CR 119.5): "Target player's life total becomes 1".
      return `${capital(playerOwner(effect.player, ability))} life total becomes ${effect.amount}`;
    case 'reselectAttack':
      // D-139 (CR 508.7).
      return `Reselect which player or permanent ${object(effect.objects)} is attacking`;
    case 'untap':
      // D-216 (CR 701.26a): "Untap up to three lands".
      return effect.objects.kind === 'choose'
        ? (untapChooseText(effect.objects) ?? UNSAID)
        : `Untap ${object(effect.objects)}`;
    case 'removeAllCounters':
      return `Remove all counters from ${object(effect.objects)}`;
    case 'counter':
      return `Counter ${object(effect.objects)}`;
    case 'addCounters':
      return `Put ${quantity(effect.count, defs, counters(effect.counter))} on ${object(effect.objects)}`;
    case 'grantKeyword':
      // "Each Zombie gains menace until end of turn" (CR 613.1f, 611.2c).
      // D-187: "up to that many target creatures gain double strike": several targets, the plural verb.
      return `${capital(object(effect.objects))} ${object(effect.objects).startsWith('up to ') ? 'gain' : 'gains'} ${keywordWords(effect.keyword.kind)}${effect.duration === 'untilEndOfTurn' ? ' until end of turn' : ''}`;
    case 'restrict':
      // "Target creature can't be blocked this turn" (CR 613.11).
      return `${capital(object(effect.objects))} ${RESTRICTION_EFFECT[effect.restriction]}${effect.duration === 'untilEndOfTurn' ? ' this turn' : effect.duration === 'forAsLongAsYouControlThis' ? ' for as long as you control this' : ''}`;
    case 'gainControl':
      // D-189 (CR 613.1b, 611.2): "Gain control of target creature until end of turn".
      return `Gain control of ${object(effect.objects)}${controlDurationText(effect.duration, self)}`;
    case 'requireAttack':
      // D-179 (CR 508.1d): "Until your next turn, creatures your opponents control attack each combat if able".
      return requireAttackText(effect) ?? UNSAID;
    case 'addMana': {
      // "Add {C}" for a fixed amount (D-139: a triggered mana ability's "add an additional {C}"), else the gist.
      if (effect.mana.kind === 'fixed') {
        // D-151 (CR 106.1): "Add {R} for each tapped land your opponents control".
        const made = fixedTimesWords(effect.mana);
        return made === null ? UNSAID : `Add ${made}`;
      }
      // D-151 (CR 106.1b): "Add two mana in any combination of colors".
      return effect.mana.kind === 'anyCombination'
        ? `Add ${anyCombinationWords(effect.mana.count, effect.mana.distinct === true)}`
        : 'Add mana';
    }
    case 'exileTop':
      // D-151 (CR 701.13): "Exile the top card of your library"; D-187 (CR 406.3): "... of target opponent's library face down".
      return exileTopText(
        effect,
        (amount) => defs.say(amount, { self }),
        effect.from === undefined
          ? 'your library'
          : `${recipientText(effect.from, ability, self)}'s library`,
      );
    case 'mayPlay':
      // D-151 (CR 601.2, 305.1): alone, the cards are "that card".
      return mayPlayText(effect, false);
    case 'extraCombat':
      // D-151 (CR 500.8): "After this phase, there is an additional combat phase"; D-187: "... At the beginning of that combat, untap all creatures you control".
      return extraCombatText(
        effect.atBeginning === undefined
          ? null
          : effectText(effect.atBeginning, ability, self, defs),
      );
    case 'extraBeginningPhase':
      // D-356 (CR 500.8): "After this phase, there is an additional beginning phase".
      return EXTRA_BEGINNING_PHASE_TEXT;
    case 'enterAttacking':
      // D-151 (CR 508.4): said with the move that put the creature onto the battlefield (`sequenceText`).
      return UNSAID;
    case 'revealTop':
      // D-151 (CR 701.20): "Target player reveals the top card of their library. If it's a permanent card, they put it ...".
      return revealTopText(effect, recipientText(effect.player, ability, self)) ?? UNSAID;
    case 'exileUntilCast':
      // D-151 (CR 701.57): "Discover 10" and its kin.
      return exileUntilCastText(effect);
    case 'behold':
      // D-151 (CR 701.4a): "Behold a Dragon".
      return beholdText(effect) ?? UNSAID;
    case 'payAnyAmount': {
      // D-257 (CR 608.2c): "You may pay {X}, up to that much. If you do, draw X cards": no reflexive ability, the follow-up runs at once.
      if (effect.ifPaid !== undefined) {
        const follow = effectText(effect.ifPaid, ability, self, defs);
        const pay =
          effect.atMost === undefined ? 'You may pay {X}' : 'You may pay {X}, up to that much';
        return follow === '' ? pay : `${pay}. If you do, ${lower(follow)}`;
      }
      if (effect.reflexive === undefined) return UNSAID;
      // D-151 (CR 118.1, 603.12): "You may pay any amount of {R}. When you do, it deals that much damage to any target".
      const inner = effectText(
        effect.reflexive.effect,
        effect.reflexive.targets === undefined
          ? ability
          : { ...ability, targets: effect.reflexive.targets },
        self,
        defs,
      );
      const pay = payAnyAmountText(effect.symbol);
      return inner === '' ? pay : `${pay}. When you do, ${lower(inner)}`;
    }
    case 'copySpell': {
      // D-337 (CR 707.10, 707.10c, 903.8): "Copy that spell", with new targets, and once for each time the commander was cast from the command zone.
      const count =
        effect.count === undefined
          ? null
          : effect.count === 1
            ? null
            : typeof effect.count === 'object' && effect.count.kind === 'commanderCasts'
              ? "time you've cast your commander from the command zone this game"
              : UNSAID;
      if (count === UNSAID) return UNSAID;
      const spell = object(effect.spell);
      return spell === UNSAID ? UNSAID : copySpellWords(spell, effect.newTargets, count);
    }
    case 'delayedCast': {
      // D-336 (CR 603.7, 603.7a): "When you next cast an instant or sorcery spell this turn, copy that spell".
      const spell = filterPhrase(effect.filter, 'spell');
      const inner = effectText(
        effect.effect,
        { ...ability, trigger: { kind: 'castSpell', filter: effect.filter, by: 'you' } },
        self,
        defs,
      );
      if (spell === null || inner === '' || inner.includes(UNSAID)) return UNSAID;
      // A choice of types says "an instant or sorcery"; the trigger is about a spell, as the card says.
      return delayedCastWords(/\bspells?$/.test(spell) ? spell : `${spell} spell`, inner);
    }
    case 'delayedTrigger': {
      // D-151 (CR 603.7): "At the beginning of your next end step, this creature deals 2 damage to each opponent for each of those cards".
      const when = delayedWords(effect.at);
      const inner = effectText(effect.effect, ability, self, defs);
      return when === null || inner === '' ? UNSAID : `${when}, ${lower(inner)}`;
    }
    case 'setTypes': {
      // D-151 (CR 205.1b, 613.1d): "Until end of turn, this creature becomes a Dragon in addition to its other types".
      const kinds = [...(effect.subtypes ?? []), ...(effect.types ?? [])];
      if (effect.additive !== true || kinds.length === 0) return UNSAID;
      const noun = kinds.join(' ');
      const until = effect.duration === 'untilEndOfTurn' ? ' until end of turn' : '';
      return `${capital(object(effect.objects))} becomes ${/^[aeiou]/i.test(noun) ? 'an' : 'a'} ${noun} in addition to its other types${until}`;
    }
    case 'proliferate':
      // D-149 (CR 701.34a).
      return PROLIFERATE_TEXT;
    case 'shuffle':
      return 'Shuffle your library';
    case 'rollDie':
      // CR 706.1 (D-271): "Roll a four-sided die".
      return `Roll a ${effect.sides}-sided die`;
    case 'search':
      return 'Search your library';
    case 'createToken':
      return tokenText(effect, ability, self, defs);
    case 'conditional': {
      // CR 608.2c (D-131): "If you're the monarch, ...; otherwise, ...". A condition the words do not
      // cover leaves the instruction out, never guessed at.
      const when = gameConditionWords(effect.condition, { self });
      if (when === null) return '';
      const then = effectText(effect.effect, ability, self, defs);
      if (then === '') return '';
      const otherwise =
        effect.else === undefined ? '' : effectText(effect.else, ability, self, defs);
      return `If ${when}, ${lower(then)}${otherwise === '' ? '' : `. Otherwise, ${lower(otherwise)}`}`;
    }
    default:
      // Moving cards and anything the engine adds later: the label shows the cost only.
      return '';
  }
}

/**
 * A condition in words, for the gist. Only the shape batch 2 adds is said here (Evolve's "if", CR 702.100a);
 * any other gives null and the gist leaves the condition's sentence out, never guessing at it.
 */
export function conditionText(condition: Condition): string | null {
  switch (condition.kind) {
    case 'subjectGreaterPt':
      return "that creature's power or toughness is greater than this creature's";
    case 'cameUnderControlSinceLastUpkeep':
      // Echo (CR 702.30a, D-127): the intervening "if" of its trigger.
      return 'this permanent came under your control since the beginning of your last upkeep';
    default:
      // D-131: "the total power of creatures you control is 8 or greater", "you're the monarch".
      return gameConditionWords(condition);
  }
}

/** The thing the card is, for "this creature gets ...": "creature" for any creature, else its first card type, else "permanent". */
function selfNoun(card: Partial<Pick<ObjectView, 'types'>> | undefined): string {
  // An artifact creature is "this creature", as the cards print it (D-139).
  return nounOfTypes(card?.types ?? []);
}

/**
 * " (costs {4} less to activate if an opponent controls 4 or more nonbasic lands)" (D-135, CR 601.2f): the label shows
 * the printed cost, and this says when it is lower. '' for an ability with no such reduction, or one whose condition the
 * words do not cover (never guessed).
 */
export function costReductionNote(ability: Pick<ActivatedAbility, 'costReducedIf'>): string {
  const reduction = ability.costReducedIf;
  if (reduction === undefined) return '';
  const when = gameConditionWords(reduction.condition);
  return when === null ? '' : ` (costs {${reduction.generic}} less to activate if ${when})`;
}

/** " Activate only if you control three or more lands with the same name." (D-149), or '' when the words do not cover the condition. */
export function activateOnlyIfNote(ability: Pick<ActivatedAbility, 'activateOnlyIf'>): string {
  if (ability.activateOnlyIf === undefined) return '';
  const when = gameConditionWords(ability.activateOnlyIf);
  return when === null ? '' : ` Activate only if ${when}.`;
}

/**
 * The chooser label of one activated ability: "Cycling {2}", or the cost and a gist of the effect,
 * like "{1}: This creature gets +1/+1 until end of turn". Falls back to the cost alone when the
 * effect is not one the gist knows.
 */
export function activationLabel(
  card: ObjectView | undefined,
  entry: { readonly abilityIndex: number; readonly ability: ActivatedAbility },
): string {
  const { ability } = entry;
  if (isCycling(ability)) {
    return costKeyword(
      'Cycling',
      ability.cost.filter((c) => c.kind !== 'discardThis'),
    );
  }
  if (isEquip(ability)) return costKeyword('Equip', ability.cost);
  if (isUnearth(ability)) return costKeyword('Unearth', ability.cost);
  // D-185: "Encore {3}{R}": the exile of the card is part of the keyword, not of the price.
  if (isEncore(ability)) {
    return costKeyword(
      'Encore',
      ability.cost.filter((c) => c.kind !== 'exileThis'),
    );
  }
  const crew = crewNumber(card, ability);
  if (crew !== null) return `Crew ${crew}`;
  const noun = selfNoun(card);
  const cost = ability.cost.map((part) => activationCostPart(part, noun)).join(', ');
  // An ability that works from the graveyard is read from the card there: "Return this card from your graveyard".
  const self = ability.functionsIn === 'graveyard' ? 'card' : noun;
  const gist = gistOf(ability.effect, ability, self);
  const base = gist === '' ? cost : `${cost}: ${gist}`;
  const sorcery = ability.timing === 'sorcery' ? ' (sorcery speed)' : '';
  // D-139: "This ability costs {1} less to activate for each other artifact you control. Activate only once each turn."
  // D-149 (CR 602.5b): "Activate only if you control three or more lands with the same name."
  const only = activateOnlyIfNote(ability);
  const notes = `${costReducedByNote(ability)}${oncePerTurnNote(ability)}${only}`;
  return `${base}${sorcery}${costReductionNote(ability)}${notes === '' ? '' : `.${notes}`}`;
}

/**
 * A gist of what a triggered ability on the stack does, for the target prompt: "Destroy target
 * creature". Read from the ability's AST (`ObjectView.ability`), never from the source's Oracle
 * text, which may list several abilities. An effect the gist does not know gives '' and the prompt
 * then names the ability only.
 */
export function triggerGist(ability: StackAbility, source: ObjectView | undefined): string {
  const gist = gistOf(ability.effect, ability, selfNoun(source));
  // The intervening "if" of a triggered ability (CR 603.4), when the words know it: Evolve's.
  // D-139: "during the declare attackers step" is said with the trigger (`triggerCondition`), not here.
  const condition =
    ability.kind === 'triggered' &&
    ability.interveningIf !== undefined &&
    ability.interveningIf.kind !== 'duringStep'
      ? conditionText(ability.interveningIf)
      : null;
  return gist === '' || condition === null ? gist : `${gist} if ${condition}`;
}

/**
 * The gist of a triggered ability of a card in a graveyard (D-151, CR 113.6b): the card is "this card" there ("return this card from your
 * graveyard to your hand"), never "this creature", which it is not in the graveyard.
 */
export function graveyardGist(ability: StackAbility): string {
  return gistOf(ability.effect, ability, 'card');
}

/**
 * The condition of a triggered ability on the stack in words, "Whenever you draw a card" (capitalised,
 * or with a lower-case first letter for the middle of a sentence). Read from the ability's AST;
 * null for an activated ability, a shape the words do not cover, and a Saga chapter (the stack label
 * already says which). `name` is the source's name and `source` its view, when it is still seen, for
 * "equipped creature" and "enchanted permanent".
 */
export function triggerCondition(
  ability: StackAbility | undefined,
  name: string,
  source:
    | (Pick<ObjectView, 'subtypes' | 'oracleText'> & Partial<Pick<ObjectView, 'types'>>)
    | undefined,
  inline = false,
): string | null {
  if (ability === undefined || ability.kind !== 'triggered') return null;
  if (ability.trigger.kind === 'chapter') return null;
  // CR 603.12 (D-135): "When you do, ..." has no event of its own, only a placeholder the view cannot tell apart.
  if (isReflexiveAbility(ability, source?.oracleText ?? ''))
    return inline ? 'when you do' : 'When you do';
  const ctx = { self: name, ...(source === undefined ? {} : { subtypes: source.subtypes }) };
  const words = triggerWords(ability.trigger, ctx, selfNoun(source));
  if (words === null) return null;
  // D-139 (CR 506.1): "When this artifact enters during the declare attackers step".
  const step =
    ability.interveningIf?.kind === 'duringStep'
      ? duringStepPhrase(ability.interveningIf.step)
      : '';
  // D-145 (CR 603.2): "while you don't control another Dinosaur" is part of the event, read once. A condition the
  // words cannot say leaves the whole trigger unworded: the caller then names the source, nothing is half said.
  const condition = ability.triggerCondition;
  // D-151 (CR 702.105a, 607.2d): "Whenever this creature attacks the player with the most life", "Khans — At the beginning of ...".
  const special = condition?.kind === 'attackingMostLife' || condition?.kind === 'chosenOption';
  const during =
    condition === undefined || special
      ? ''
      : gameConditionWords(condition, { self: selfNoun(source) });
  if (during === null) return null;
  // D-149 (CR 603.2): "This ability triggers only once each turn" is said with the event it limits.
  const once = ability.oncePerTurn === true ? ' (only once each turn)' : '';
  const base = `${words}${step}${during === '' ? '' : ` while ${during}`}${once}`;
  const aimed =
    condition?.kind === 'attackingMostLife' && ability.trigger.kind === 'attacks'
      ? `${words}${step} the player with the most life or tied for most life${once}`
      : base;
  if (condition?.kind === 'chosenOption') {
    return inline
      ? `${condition.option} \u2014 ${aimed.charAt(0).toLowerCase()}${aimed.slice(1)}`
      : `${condition.option} \u2014 ${aimed}`;
  }
  return inline ? `${aimed.charAt(0).toLowerCase()}${aimed.slice(1)}` : aimed;
}

/**
 * The words of the play-rule static abilities (D-125): additional land drops, looking at the top card of the
 * library, the cost of attacking and the optional untap, composed from the node and never from a card name
 * ("You may play an additional land on each of your turns"). Null for any other static effect.
 */
export { playRuleWordings, staticWording };
