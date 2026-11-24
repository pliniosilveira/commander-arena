/**
 * Words for an activated ability (CR 602) in the ability chooser: the cost as Oracle text prints it
 * and a short description of the effect, read from the ability's AST (`ObjectView.activated`).
 * Cycling reads "Cycling {2}", Equip "Equip {1}", Unearth "Unearth {R}" and Crew "Crew 3", as on the card. The effect text
 * is a gist for choosing between abilities, never rules text: an effect kind it does not know is
 * left out, not guessed at.
 */
import type {
  Ability,
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
import { chosenColorManaText } from '../../game/chosen-color-text';
import { gameConditionWords } from '../../game/condition-text';
import { copyForEachWords, copySpellWords, delayedCastWords } from '../../game/copy-text';
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
  revealTopCastText,
  revealTopTail,
  revealTopText,
} from '../../game/dragons-text';
import { pluralSubtype, thingsPhrase } from '../../game/filter-text';
import { delayedSacrificeText } from '../../game/gisa-g5-text';
import { copiesOfTokensText } from '../../game/hashaton-g5-text';
import {
  entersTappedText,
  groupOfTargetPlayerText,
  isSeveral,
  keepTappedText,
} from '../../game/hylda-text';
import { ENCORE_EFFECT_TEXT } from '../../game/keywords-text';
import { controlDurationText, requireAttackText } from '../../game/korvold-text';
import { searchText } from '../../game/lorehold-g1-text';
import { playRuleWordings, staticWording } from '../../game/play-rule-text';
import { namesSeveral, subjectVerb } from '../../game/player-text';
import { ptEffectText } from '../../game/pt-text';
import { isReflexiveAbility, positionPhrase } from '../../game/recursion-text';
import { groupPhrase } from '../../game/static-text';
import { tokenWords } from '../../game/token-text';
import { filterPhrase, grantedKeywordWords, withText } from '../../game/trigger-text';

/**
 * True for Cycling's expansion: an ability from the hand whose cost discards the card as the cycling keyword's does (CR 702.29a). The engine marks that cost
 * `cycling`; the cost of any other "Discard this card: ..." ability (Magma Opus: "{U/R}{U/R}, Discard this card: Create a Treasure token", D-646) is not Cycling.
 */
export function isCycling(ability: ActivatedAbility): boolean {
  return (
    ability.functionsIn === 'hand' &&
    ability.cost.some((c) => c.kind === 'discardThis' && c.cycling === true)
  );
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

/**
 * True for Eternalize's expansion (CR 702.129a, D-384): an ability from the graveyard that exiles the card as a cost and creates a token that is a copy of it, black, 4/4, with no mana cost
 * and a Zombie in addition.
 */
export function isEternalize(ability: ActivatedAbility): boolean {
  const { effect } = ability;
  if (ability.functionsIn !== 'graveyard' || effect.kind !== 'createToken') return false;
  const { token } = effect;
  return (
    token.kind === 'copyOf' &&
    token.object.kind === 'this' &&
    token.noManaCost === true &&
    token.setPt?.power === 4 &&
    token.setPt.toughness === 4 &&
    token.setColors?.join() === 'B' &&
    token.addSubtypes?.join() === 'Zombie'
  );
}

/**
 * True for Embalm's expansion (CR 702.128a): an ability from the graveyard that exiles the card as a cost and creates a token that is a copy of it, white, with no mana cost and a Zombie
 * in addition.
 */
export function isEmbalm(ability: ActivatedAbility): boolean {
  const { effect } = ability;
  if (ability.functionsIn !== 'graveyard' || effect.kind !== 'createToken') return false;
  const { token } = effect;
  return (
    token.kind === 'copyOf' &&
    token.object.kind === 'this' &&
    token.embalmed === true &&
    token.setColors?.join() === 'W'
  );
}

/**
 * True for Ninjutsu's expansion (CR 702.49a, unverified): an ability from the hand whose cost returns an unblocked attacker you control to its owner's hand (`unblocked`).
 */
export function isNinjutsu(ability: ActivatedAbility): boolean {
  return (
    ability.functionsIn === 'hand' &&
    ability.cost.some(
      (c) => c.kind === 'returnToHand' && 'unblocked' in c.what && c.what.unblocked === true,
    )
  );
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
  // D-513 (CR 205.2): "target nonland permanent": the card types the object is not.
  // D-644 (CR 205.4): "target nonlegendary creature": the supertypes the object is not.
  const without = [...(filter.notTypes ?? []), ...(filter.notSupertypes ?? [])]
    .map((t) => `non${t}`)
    .join(' ');
  // D-139: "target nontoken creature" (CR 111.1).
  const typed = without === '' ? named : `${without} ${named}`;
  const core = filter.token === false ? `nontoken ${typed}` : typed;
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

export function targetText(spec: TargetSpec | undefined): string {
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
        // D-460: a card of any kind ("Exile target card from a graveyard", Ghost Vacuum) is "card", not "permanent card".
        const { types, subtypes, anyOf, commander, notTypes } = spec.what.filter;
        const any =
          types === undefined &&
          subtypes === undefined &&
          anyOf === undefined &&
          commander === undefined;
        // Lorehold group 2 (CR 205.2a): "target noncreature, nonland card from your graveyard": the types it is not, each with its "non".
        const without =
          notTypes === undefined ? '' : `${notTypes.map((t) => `non${t}`).join(', ')} `;
        const kind =
          any && notTypes !== undefined
            ? `${without}card`
            : any
              ? 'card'
              : `${nounOf(spec.what.filter)} card`;
        // Lorehold group 1: "any number of target cards from your graveyard".
        if (spec.anyNumber === true) {
          return `any number of target ${kind}s from ${whose} graveyard${withText(spec.what.filter)}`;
        }
        // D-655 (CR 115.1): "up to one target instant or sorcery card from your graveyard": none may be chosen.
        const optional = (spec.min ?? 1) === 0 && spec.max === 1 ? 'up to one ' : '';
        return `${optional}target ${kind} from ${whose} graveyard${withText(spec.what.filter)}`;
      }
      // Lorehold group 2 (CR 607.2a): "target card exiled with this creature": a card in exile that the permanent exiled with its linked ability.
      if (spec.what.filter.zone === 'exile' && spec.what.filter.exiledWithSource === true) {
        return 'target card exiled with this permanent';
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
      // D-639 (CR 115.1, 601.2d): "any number of target creatures you control".
      if (spec.anyNumber === true) {
        return `any number of ${spec.what.filter.other === true ? 'other ' : ''}target ${pluralNounOf(spec.what.filter)}${owned}${who}${withText(spec.what.filter)}`;
      }
      // D-644 (CR 115.1): "up to one target nonlegendary creature you control": none may be chosen.
      if ((spec.min ?? 1) === 0 && spec.max === 1) {
        return `up to one target ${nounOf(spec.what.filter)}${owned}${who}${withText(spec.what.filter)}`;
      }
      // D-187 (CR 603.12, 115.2): "up to that many target creatures" (the number not fixed yet), "up to two target creatures": several targets, the noun plural.
      // D-513 (CR 603.3d, 701.22): "tap up to X target nonland permanents, where X is the number of cards looked at": the number is the event's.
      if (
        spec.upToThatMany === true ||
        spec.upToTriggerAmount === true ||
        spec.upToAmount !== undefined ||
        ((spec.max ?? 1) > 1 && (spec.min ?? 1) === 0)
      ) {
        // Issue 104 (CR 603.3d): "up to X target Zombie cards ..., where X is the number of opponents you have": the number is an amount of the game, fixed as the ability triggers.
        const count =
          spec.upToAmount !== undefined
            ? 'X'
            : spec.upToThatMany === true || spec.upToTriggerAmount === true
              ? 'that many'
              : numberWord(spec.max ?? 1);
        return `up to ${count} target ${pluralNounOf(spec.what.filter)}${owned}${who}${withText(spec.what.filter)}`;
      }
      // D-639: "another target creature you control": the source of the ability is left out.
      return `${spec.what.filter.other === true ? 'another ' : ''}target ${nounOf(spec.what.filter)}${owned}${who}${withText(spec.what.filter)}`;
    }
    case 'player':
      // D-486 (CR 115.1): "any number of target players" (none, one or each).
      if (spec.anyNumber === true) {
        return spec.what.filter === 'opponent'
          ? 'any number of target opponents'
          : 'any number of target players';
      }
      return spec.what.filter === 'opponent' ? 'target opponent' : 'target player';
    case 'anyTarget':
      return 'any target';
    case 'playerOrObject':
      // D-200: "target player or planeswalker", "target opponent or planeswalker" (or battle).
      return `target ${spec.what.player === 'opponent' ? 'opponent' : 'player'} or ${nounOf(spec.what.filter)}`;
    case 'objectOrSpell':
      // Issue 81 (Fatehold Charm, CR 115.1): "target spell or creature".
      // Endless Detour (CR 115.1): "target spell, nonland permanent, or card in a graveyard".
      if (spec.what.card !== undefined) {
        return `target spell, ${nounOf(spec.what.filter)}, or card in a graveyard`;
      }
      return `target spell or ${nounOf(spec.what.filter)}`;
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

/** What an enchant ability allows, in the card's words: "creature card in a graveyard", "creature put onto the battlefield with this Aura"; null for any filter these words leave out. */
function enchantWords(filter: ObjectFilter): string | null {
  const { zone, types, putWithSource, ...rest } = filter;
  if (Object.keys(rest).length > 0 || types === undefined || types.length !== 1) return null;
  if (zone === 'graveyard')
    return putWithSource === true ? null : `${types[0]} card in a graveyard`;
  if (zone !== undefined && zone !== 'battlefield') return null;
  return putWithSource === true
    ? `${types[0]} put onto the battlefield with this Aura`
    : `${types[0]}`;
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
    case 'chosen':
      return 'the chosen permanent';
    case 'each': {
      // D-517: "all creatures target player controls", the group of a player chosen as a target.
      const chosen = what.filter.controlledBy;
      if (chosen?.kind === 'target' && what.except === undefined) {
        const spec = ability.targets?.find((t) => t.id === chosen.id);
        return (
          groupOfTargetPlayerText(what.filter, targetText(spec).replace(/^target /u, 'target ')) ??
          UNSAID
        );
      }
      // D-151: "each other creature", the one the effect names is left out.
      return eachText(what.except === undefined ? what.filter : { ...what.filter, other: true });
    }
    case 'moved':
    case 'boundObjects':
      // D-639: the engine's own form of `moved` inside a delayed ability.
      return 'it';
    case 'triggerSubject':
      // The spell of a "whenever you cast" trigger (Storm-like copies) or what targeted the permanent; else the
      // permanent or creature the trigger is about (D-133): "put a +1/+1 counter on it".
      // D-491: the "When you cast this spell" ability of the spell itself says "this spell".
      if (ability.trigger?.kind === 'castSpell' && ability.trigger.self === true) {
        return 'this spell';
      }
      if (ability.trigger?.kind === 'activatesAbility') return 'that ability';
      return ability.trigger === undefined ||
        ability.trigger.kind === 'castSpell' ||
        ability.trigger.kind === 'becomesTarget'
        ? 'that spell'
        : 'it';
    case 'thisCard':
    case 'triggerCard':
      // Persist and Undying: "return it to the battlefield", the card the creature became (CR 603.10a); D-230 "return that card".
      return 'it';
    case 'triggerSources':
      // Issue 81 (Tamiyo): the creatures that dealt the combat damage of the trigger.
      return 'those creatures';
    case 'triggerAttackers':
      // Champions from Beyond: the creatures the attack declared.
      return 'those creatures';
    case 'convokers':
      // Lethal Scheme (CR 702.51a): the creatures tapped to cast the spell with Convoke.
      return 'each creature that convoked this spell';
    case 'sacrificedCost':
    case 'sacrificed':
      return 'the sacrificed creature';
    case 'attached':
      return attachedText(self);
    case 'linkedExile':
      // D-145: the card this permanent exiled with a linked ability (Hideaway).
      return 'the exiled card';
    case 'putWithThis':
      // Animate Dead: "that creature", the creature this permanent put onto the battlefield.
      return 'that creature';
    case 'eachObject':
      // Canopy Gargantuan: the creature the counters are being put on right now.
      return 'that creature';
  }
}

/**
 * Marks a group the words cannot say (an `each` over a filter with a field they leave out): the gist that holds it is
 * dropped as a whole, never said with the field missing (AGENTS.md "Honesty").
 */
const UNSAID = '\u0000';

/** D-474 (CR 305.6): the basic land types, the ones an effect can set a land to. */
const BASIC_LAND_TYPE_WORDS: readonly string[] = [
  'Plains',
  'Island',
  'Swamp',
  'Mountain',
  'Forest',
];

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
  'powerGreaterThanSource',
  // D-431: "creatures with power greater than its base power".
  'powerAboveBase',
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
  // D-656 (CR 201.2): "creatures named Leitmotif Composer": a name and the card type creature, nothing else.
  if (
    filter.named !== undefined &&
    Object.keys(filter).length === 2 &&
    filter.types?.length === 1 &&
    filter.types[0] === 'creature'
  ) {
    return `all creatures named ${filter.named}`;
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
    case 'eachPlayerExcept':
      return 'each other player';
    case 'eachPlayerControlling':
      return 'each player who controls one';
    case 'controllerOf':
      return 'its controller';
    case 'ownerOf':
      return 'its owner';
    case 'triggerSubject':
      return 'it';
    case 'triggerSources':
    case 'triggerAttackers':
      return 'those creatures';
    case 'convokers':
      return 'each creature that convoked this spell';
    case 'defendingPlayer':
      return 'the defending player';
    case 'playerToYourRight':
      return 'the player to your right';
    case 'chosenPlayer':
      return 'that player';
    case 'attackedBy':
      // D-139 (CR 508.1b): "the player or planeswalker it's attacking".
      return "the player or planeswalker it's attacking";
    case 'triggerPlayer':
      return 'that player';
    case 'triggerAttackedPlayer':
      // D-648: the player attacked by the declaration that triggered the ability.
      return 'that opponent';
    case 'opponentsAttackingTriggerPlayer':
      // Issue 159 (CR 508.6).
      return 'each opponent attacking that player';
    case 'triggerDamagedPlayers':
      // CR 603.2c: the opponents a batch of sources damaged.
      return 'each of those opponents';
    case 'declinedPlayer':
      return 'the player who declined';
    case 'giftRecipient':
      // CR 702.174a (D-135): the opponent the caster promised the gift to.
      return 'the chosen player';
    case 'discardedThisWay': {
      const group = to.of?.kind === 'eachOpponent' ? 'opponent' : 'player';
      return to.hand === true
        ? `each ${group} who discarded their hand this way`
        : `each ${group} who discarded a card this way`;
    }
    case 'couldntSacrificeThisWay':
      return "each player who can't";
    case 'attackedPlayers':
      // D-269 (CR 508.6).
      return 'each player this creature attacked this turn';
    case 'combatDamagedByNamed':
      // CR 120.2a: the opponents a creature of this name has dealt combat damage to this game.
      return `each opponent dealt combat damage this game by a creature named ${to.name}`;
    case 'lostLifeThisTurn':
      return `each player who lost life this turn`;
    case 'combatDamagedThisTurn':
      return `each player who was dealt combat damage this turn`;
    case 'all':
      return to.of.map((member) => recipientText(member, ability, self)).join(' and ');
    case 'target':
    case 'chosen':
    case 'this':
    case 'thisSpell':
    case 'moved':
    case 'boundObjects':
    case 'thisCard':
    case 'triggerCard':
    case 'sacrificedCost':
    case 'sacrificed':
    case 'attached':
    case 'linkedExile':
    case 'putWithThis':
    case 'eachObject':
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
  // Issue 81 (CR 509.1b): the Gingerbrute token.
  cantBeBlockedExceptByHaste: "can't be blocked except by creatures with haste",
  cantAttackPlayersAlreadyAttacked: "can't attack a player it has already attacked this turn",
  cantBeBlockedByMoreThanOne: "can't be blocked by more than one creature",
  attacksEachCombat: 'attacks if able',
  mustBeBlocked: 'must be blocked if able',
  mustBlock: 'must block this turn if able',
  doesntUntap: "doesn't untap",
  cantBeCountered: "can't be countered",
  canBlockOnlyFlying: 'can block only creatures with flying',
  // Abzan Armor group A (CR 609.4, 702.3b, 510.1a).
  canAttackAsThoughNoDefender: "can attack as though it didn't have defender",
  canAttackAsThoughNoDefenderVsLastTurnAttackers:
    "can attack players who attacked you during their last turn as though it didn't have defender",
  assignsDamageByToughness: 'assigns combat damage equal to its toughness rather than its power',
  cantActivateAbilities: "can't have its activated abilities activated",
};

const lower = (text: string): string => text.charAt(0).toLowerCase() + text.slice(1);

/** "a" or "an" for the first word of a phrase ("an 8/8 white Angel creature token"). */
const withArticle = (phrase: string): string =>
  /^(?:[aeiou]|8|11|18|X\/)/i.test(phrase) ? `an ${phrase}` : `a ${phrase}`;

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
  extreme: 'greatest' | 'least' = 'greatest',
): string {
  const things = thingsPhrase({ ...filter, controller: 'you' }, true);
  const group = things === null ? 'permanents' : things;
  const word = stat === 'manaValue' ? 'mana value' : stat;
  return ` with the ${extreme} ${word} among ${group.replace(/ you control$/, theirs ? ' they control' : ' you control')}`;
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
            objects.greatest !== undefined
              ? greatestOf(objects.greatest, objects.filter, theirs)
              : objects.least !== undefined
                ? greatestOf(objects.least, objects.filter, theirs, 'least')
                : ''
          }`;
  if (player === undefined) return `Sacrifice ${what}`;
  // CR 101.4 (D-131): each of several players chooses their own, in turn order.
  const eachTarget =
    player.kind === 'target' &&
    ability.targets?.find((t) => t.id === player.id)?.anyNumber === true;
  const choice =
    objects.kind === 'choose' && (namesSeveral(player) || eachTarget) ? ' of their choice' : '';
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
    case 'eachPlayerExcept':
    case 'eachPlayerControlling':
    case 'eachPlayer':
      return { who: 'they', third: false };
    case 'controllerOf':
    case 'ownerOf':
      return { who: 'that player', third: true };
    case 'target':
      return { who: 'that player', third: true };
    case 'defendingPlayer':
      return { who: 'the defending player', third: true };
    case 'playerToYourRight':
      return { who: 'the player to your right', third: true };
    case 'chosenPlayer':
      return { who: 'that player', third: true };
    case 'triggerPlayer':
      return { who: 'that player', third: true };
    case 'triggerAttackedPlayer':
      return { who: 'that opponent', third: true };
    case 'opponentsAttackingTriggerPlayer':
      return { who: 'they', third: false };
    case 'triggerDamagedPlayers':
      return { who: 'each of those opponents', third: true };
    case 'declinedPlayer':
      return { who: 'the player who declined', third: true };
    case 'giftRecipient':
      return { who: 'the chosen player', third: true };
    case 'discardedThisWay':
    case 'couldntSacrificeThisWay':
    case 'attackedPlayers':
    case 'lostLifeThisTurn':
    case 'combatDamagedThisTurn':
    case 'combatDamagedByNamed':
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
  // Lorehold group 2 (CR 202.3, 608.2c): "damage equal to the total mana value of the cards milled this way".
  const milledValue =
    typeof amount === 'object' && amount.kind === 'thisWay' && amount.what === 'milledValue';
  const damage = stat
    ? `damage equal to ${amountPhrase(amount, { self, ...(from === undefined ? {} : { same: from }) })}`
    : milledValue
      ? `damage equal to ${amountPhrase(amount)}`
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
  const given = tokenWords(effect.token, effect.tapped === true, (ref) =>
    objectText(ref, ability, self),
  );
  // D-646 (CR 111.4, 208.2): "an X/X token, where X is ..." (`ptAmount`): the 0/0 of the definition is the size the amount gives, said as a letter.
  const size =
    effect.token.kind === 'custom' && effect.token.ptAmount !== undefined
      ? defs.say(effect.token.ptAmount, { self })
      : null;
  const words =
    size === null
      ? given
      : {
          one: given.one.replace('0/0 ', `${size}/${size} `),
          many: given.many.replace('0/0 ', `${size}/${size} `),
        };
  const what = quantity(effect.count, defs, { one: withArticle(words.one), many: words.many });
  // D-652 (CR 508.1d): "For each opponent, create two 3/3 ... tokens that attack that opponent this turn if able".
  if (effect.forEachOpponent !== undefined) {
    return `For each opponent, create ${what} that attack that opponent this turn if able`;
  }
  // CR 303.4f (issue 89): "Create a white Aura enchantment token named Contract attached to target creature ...".
  const attached =
    effect.attachTo === undefined
      ? ''
      : ` attached to ${objectText(effect.attachTo, ability, self)}`;
  return effect.controller === undefined
    ? `Create ${what}${attached}`
    : `${playerVerb(effect.controller, ability, 'create')} ${what}${attached}`;
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
  // D-460 (CR 607.2a, 110.2a, 122.6): "Put each creature card exiled with this artifact onto the battlefield under your control with a flying counter on it".
  if (
    objects.kind === 'linkedExile' &&
    objects.filter !== undefined &&
    effect.to === 'battlefield'
  ) {
    const kind = nounOf(objects.filter);
    const kept = effect.withCounters;
    const withCounters =
      kept === undefined ? '' : ` with ${quantity(kept.count, defs, counters(kept.counter))} on it`;
    const control =
      effect.controller === 'owner' ? " under its owner's control" : ' under your control';
    return `Put each ${kind} card exiled with this ${self} onto the battlefield${effect.tapped === true ? ' tapped' : ''}${control}${withCounters}`;
  }
  // CR 400.7, 303.4 (Animate Dead): "Return enchanted creature card to the battlefield under your control": the card an Aura enchants, which is in a graveyard until it returns.
  if (objects.kind === 'attached' && effect.to === 'battlefield' && effect.putWithSource === true) {
    return `Return the enchanted card to the battlefield${effect.controller === 'owner' ? " under its owner's control" : ' under your control'}`;
  }
  // D-394 (CR 110.2a, 400.7): the card an earlier instruction exiled ("it") put onto the battlefield under the control of the player who puts it: it is not returning anywhere.
  if (objects.kind === 'moved' && effect.to === 'battlefield' && effect.controller === 'you') {
    return `Put it onto the battlefield${effect.tapped === true ? ' tapped' : ''} under your control`;
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
    // CR 406.1: only a chosen card is exiled by a `moveToZone` (the choice is worded above); anything else is the `exile` effect.
    case 'exile':
      return `Exile ${what}`;
    // Issue 103 (CR 903.9): "Return it to the command zone", the delayed return of a commander.
    case 'command':
      return `Return ${what} to the command zone`;
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
      // Issue 89 (CR 303.4f): "... attached to that token": the object an effect before it made, or a target.
      const attached =
        effect.attachTo === undefined
          ? ''
          : effect.attachTo.kind === 'target'
            ? ` attached to ${objectText(effect.attachTo, ability, self)}`
            : ' attached to that permanent';
      return `Return ${what} to the battlefield${effect.tapped === true ? ' tapped' : ''}${control}${attached}${withCounters}`;
    }
  }
}

/** The effect worded, with the definitions of its X at the end: "Draw X cards, where X is the number of Zombies you control". */
function gistOf(effect: Effect, ability: WithTargets, self: string): string {
  // D-646 (CR 601.2i): the subject of a "whenever you cast" trigger is a spell, "that spell's mana value".
  const defs = createDefinitions(ability.trigger?.kind === 'castSpell' ? { spell: true } : {});
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
    // Lorehold group 1 (CR 701.24c, 701.24d): "Shuffle any number of target cards from your graveyard into your library".
    const cardsShuffled = shuffleCardsIntoLibrary(effects, at, ability, self);
    if (cardsShuffled !== null) {
      out.push(cardsShuffled);
      at += 1;
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
      // D-639 (CR 508.4): "create a tapped token that's a copy of that token" is "create a tapped and attacking token ...".
      if (last >= 0) {
        out[last] = out[last]?.includes('create a tapped token')
          ? (out[last] ?? '').replace(
              'create a tapped token',
              'create a tapped and attacking token',
            )
          : `${out[last]} and attacking`;
      }
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

/** The exception "except it has haste" of a copy: the keyword haste as the one ability the copy has besides its own (D-639, CR 707.9b). */
function onlyHaste(abilities: readonly Ability[] | undefined): boolean {
  const [only, ...more] = abilities ?? [];
  return more.length === 0 && only?.kind === 'keyword' && only.keyword.kind === 'haste';
}

/**
 * "Each other token you control becomes a copy of that token" and "This creature becomes a copy of up to one target nonlegendary creature you control until end of turn, except it has
 * myriad" (D-642, D-640, CR 707.2, 707.9b): a `becomeCopy` for good of the other tokens of the controller, and a copy of a target with a keyword. UNSAID for any other shape.
 */
function becomeCopyText(
  effect: Extract<Effect, { kind: 'becomeCopy' }>,
  ability: WithTargets,
  self: string,
): string {
  const { objects, of } = effect;
  if (
    objects.kind === 'each' &&
    of.kind === 'chosen' &&
    effect.duration === 'permanent' &&
    effect.abilities === undefined &&
    effect.keepName === undefined &&
    effect.addTypes === undefined &&
    objects.filter.token === true &&
    objects.filter.controller === 'you' &&
    Object.keys(objects.filter).length === 2
  ) {
    return 'If you do, each other token you control becomes a copy of that token';
  }
  if (effect.duration !== 'untilEndOfTurn' || of.kind !== 'target' || objects.kind !== 'this') {
    return UNSAID;
  }
  const keywords = (effect.abilities ?? []).map((a) =>
    a.kind === 'keyword' ? grantedKeywordWords(a.keyword) : null,
  );
  if (keywords.some((k) => k === null)) return UNSAID;
  const except = keywords.length === 0 ? '' : `, except it has ${keywords.join(' and ')}`;
  return `${capital(objectText(objects, ability, self))} becomes a copy of ${objectText(of, ability, self)} until end of turn${except}`;
}

/**
 * "Shuffle any number of target cards from your graveyard into your library" (CR 701.24c, 701.24d, Lorehold group 1): the move of the targets of your own graveyard into your library and
 * the shuffle of it, read as one sentence, or null for any other two effects. The library is shuffled whatever the number of cards, so the position the cards were put at is not said.
 */
function shuffleCardsIntoLibrary(
  effects: readonly Effect[],
  at: number,
  ability: WithTargets,
  self: string,
): string | null {
  const [move, shuffle] = [effects[at], effects[at + 1]];
  if (move?.kind !== 'moveToZone' || move.to !== 'library' || move.position !== undefined) {
    return null;
  }
  if (
    move.objects.kind !== 'target' ||
    shuffle?.kind !== 'shuffle' ||
    shuffle.player.kind !== 'you'
  ) {
    return null;
  }
  const { id } = move.objects;
  const spec = ability.targets?.find((t) => t.id === id);
  if (
    spec?.what.kind !== 'object' ||
    spec.what.filter.zone !== 'graveyard' ||
    spec.what.filter.controller !== 'you'
  ) {
    return null;
  }
  return `Shuffle ${objectText(move.objects, ability, self)} into your library`;
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
    case 'extraTurn':
      // CR 500.7: "take an extra turn after this one", "target player takes an extra turn after this one".
      return `${playerVerb(effect.player, ability, 'take')} an extra turn after this one`;
    case 'loseLifeManaValue':
      // Issue 97 (Kefka): "each player who owns a spell you cast this way loses life equal to its mana value".
      return 'Each player who owns a spell cast this way loses life equal to its mana value';
    case 'becomeMonarch':
      // CR 725.1 (D-127): "you become the monarch", "its controller becomes the monarch".
      return `${playerVerb(effect.player, ability, 'become')} the monarch`;
    case 'gainLevel':
      // CR 716.2a (D-235): the effect of a class level bar, "Level 2".
      return `Level ${effect.level}`;
    case 'monstrosity':
      // CR 701.37a (D-445): "Monstrosity 5"; a count the game reads has no short word, so the label shows the cost only.
      return typeof effect.count === 'number' ? `Monstrosity ${effect.count}` : '';
    case 'transform':
      // CR 701.27a (D-395 provisional): "Transform this creature".
      return `Transform ${object(effect.objects)}`;
    case 'exileRandomFromHand':
      // CR 701.13 (D-393 provisional): "That player exiles a card from their hand at random"; the player is the one the selector names.
      return `${playerVerb(effect.player, ability, 'exile')} a card from ${
        effect.player.kind === 'you' ? 'your' : 'their'
      } hand at random`;
    case 'chooseRandomFromGraveyard': {
      // CR 608.2c (Death Toll deck group B): "Choose a card at random in your graveyard", "Choose two creature cards at random in your graveyard".
      const kind = effect.filter?.types?.length === 1 ? `${effect.filter.types[0]} ` : '';
      const cards = effect.count === 1 ? `a ${kind}card` : `${effect.count} ${kind}cards`;
      return `Choose ${cards} at random in your graveyard`;
    }
    case 'phaseOut':
      // CR 702.26 (D-234): "any number of other target creatures you control phase out".
      return `Phase out ${object(effect.objects)}`;
    case 'sequence':
      return sequenceText(effect.effects, ability, self, defs);
    case 'forEachPlayer': {
      const who =
        effect.players.kind === 'eachOpponent'
          ? 'opponent'
          : effect.players.kind === 'eachPlayer'
            ? 'player'
            : null;
      const inner = effectText(effect.effect, ability, self, defs);
      return who === null || inner === '' ? UNSAID : `For each ${who}, ${lower(inner)}`;
    }
    case 'prepare':
      return `${capital(object(effect.objects))} becomes prepared`;
    case 'delayedCombatDamage': {
      const inner = effectText(effect.effect, ability, self, defs);
      return inner === ''
        ? UNSAID
        : `Whenever ${object(effect.objects)} deals combat damage to a player this combat, ${lower(inner)}`;
    }
    case 'chooseOne': {
      // D-585 (CR 106.4, 608.2d): "Choose a color. Target player adds three mana of that color for each artifact sacrificed this way".
      const colored = chosenColorManaText(effect, (player) => recipientText(player, ability, self));
      if (colored !== null) return colored;
      const choices = effect.options.map((option) => option.label).join('; ');
      // Hylda group 3: "You may tap or untap target creature" is a choice that may also be declined.
      if (effect.optional === true && effect.times === undefined) {
        return `You may choose one: ${choices}`;
      }
      return effect.times === undefined
        ? `Choose one: ${choices}`
        : `Repeat this choice ${defs.say(effect.times, { self })} times (choose independently): ${choices}`;
    }
    case 'modifyPt':
    case 'setPt': {
      // D-145 (CR 701.10): "Double the power and toughness of each creature you control until end of turn".
      if (effect.kind === 'modifyPt') {
        const doubled = doublePtText(effect, object(effect.objects));
        if (doubled !== null) return doubled;
      }
      // "gets +1/+1 for each artifact you control", "gets -X/-X", "has base power and toughness 4/4"; the duration
      // goes before the definition of X ("gets +X/+0 until end of turn, where X is ...").
      const words = ptEffectText(
        effect,
        ability.trigger?.kind === 'castSpell' ? { spell: true } : {},
      );
      const until = effect.duration === 'untilEndOfTurn' ? ' until end of turn' : '';
      const at = words.indexOf(', where ');
      const said = at < 0 ? `${words}${until}` : `${words.slice(0, at)}${until}${words.slice(at)}`;
      // Galadriel group 1: "up to two target lands you control have base power and toughness 5/5": several targets, the plural verb.
      const several = object(effect.objects).startsWith('up to ');
      const verbed = several ? said.replace(/^gets /u, 'get ').replace(/^has /u, 'have ') : said;
      return `${capital(object(effect.objects))} ${verbed}`;
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
      return `${playerVerb(effect.player, ability, 'draw')} ${quantity(effect.count, defs, CARD)}${effect.reveal === true ? ' and reveal it' : ''}`;
    case 'discard': {
      // Lorehold group 3 (CR 701.9a): "Each player discards their hand".
      if (effect.hand === true) {
        return `${playerVerb(effect.player, ability, 'discard')} ${effect.player.kind === 'you' ? 'your' : 'their'} hand`;
      }
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
      // Lorehold group 2 (CR 701.38a): "You mill a card for each past vote".
      if (typeof effect.count === 'object' && effect.count.kind === 'votesFor') {
        return `${playerVerb(effect.player, ability, 'mill')} a card for each ${effect.count.option} vote`;
      }
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
      if (
        typeof effect.amount === 'object' &&
        (effect.amount.kind === 'lifeLostThisTurn' || effect.amount.kind === 'attackersOfAffected')
      ) {
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
      // D-511 (CR 603.12): "You may pay {1}. When you do, choose one — ...": the reflexive ability says its own "When you do".
      if (effect.effect.kind === 'reflexive' && effect.effect.afterPayment === true) {
        return inner === '' ? pay : `${pay}. ${inner}`;
      }
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
    case 'replaceEnchant': {
      // CR 702.5a, 613.1f (Animate Dead): "This Aura loses "enchant creature card in a graveyard" and gains "enchant creature put onto the battlefield with this Aura"".
      const lost = enchantWords(effect.loses.filter);
      const gained = enchantWords(effect.gains.filter);
      return lost === null || gained === null
        ? UNSAID
        : `This ${self} loses "enchant ${lost}" and gains "enchant ${gained}"`;
    }
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
      // D-511 (CR 603.12, 700.2b): "When you do, choose one — Create a token; Put a counter on each creature you control": the modes as the card words them.
      if (effect.modes !== undefined) {
        const how = effect.chooseModes?.max === 1 ? 'one' : 'one or more';
        return `When you do, choose ${how} — ${effect.modes.map((m) => m.text.replace(/\.$/, '')).join('; ')}`;
      }
      return inner === '' ? '' : `When you do, ${lower(inner)}`;
    }
    case 'mayCast':
      // Lorehold group 2 (CR 601.2, 118.9, 614.1a): "Choose target card exiled with this creature. You may cast that card this turn without paying its mana cost. If that spell would be
      // put into a graveyard, put it on the bottom of its owner's library instead."
      if (effect.from === 'exile') {
        const rider =
          effect.bottomInstead === true
            ? ". If that spell would be put into a graveyard, put it on the bottom of its owner's library instead"
            : '';
        return `You may cast ${object(effect.objects)} this turn${effect.free === true ? ' without paying its mana cost' : ''}${rider}`;
      }
      // Hildibrand Manderville (CR 601.2, 715.3): "You may cast it from your graveyard as an Adventure until the end of your next turn" (the card of a permanent that died).
      if (effect.adventure === true) {
        return `You may cast it from your graveyard as an Adventure ${
          effect.duration === 'untilEndOfNextTurn' ? 'until the end of your next turn' : 'this turn'
        }`;
      }
      // D-135 (CR 601.2, 611.2a): "You may cast target Zombie creature card from your graveyard this turn".
      // D-359 (CR 614.1a): the rider "If that spell would be put into your graveyard, exile it instead".
      // Issue 159: "in a graveyard" (any player's) and the rider "When you cast it this turn, this creature gains all activated abilities of that card until end of turn".
      return `You may cast ${object(effect.objects)} this turn${
        effect.exileInstead === true
          ? '. If that spell would be put into your graveyard, exile it instead'
          : ''
      }${
        effect.whenCast === undefined
          ? ''
          : '. When you cast it this turn, this creature gains all activated abilities of that card until end of turn'
      }`;
    case 'mayCastOneMilled':
      // CR 601.2, 611.2a (Locke, Treasure Hunter): "Until end of turn, you may cast a spell from among those cards".
      return 'Until end of turn, you may cast a spell from among those cards';
    case 'mayCastSpells':
      // Issue 159 (CR 601.2, 611.2a): "You may cast Zombie spells from your graveyard this turn".
      // The one word of the filter: a creature type ("Zombie spells") or a card type ("creature spells").
      return `You may cast ${effect.spells.subtypes?.[0] ?? effect.spells.types?.[0] ?? ''} spells from your graveyard this turn`;
    case 'gainFlashbackFromManaCost':
      // CR 702.34a, 611.2a: "Each instant and sorcery card in your graveyard gains flashback until end of turn".
      return 'Each instant and sorcery card in your graveyard gains flashback until end of turn';
    case 'gainActivatedAbilitiesOf':
      // Issue 159 (CR 613.1f): "This creature gains all activated abilities of that card until end of turn".
      return 'This creature gains all activated abilities of that card until end of turn';
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
    case 'attach': {
      // D-406 (CR 701.3): "Attach this Aura to that creature": the creature a trigger is about is "that creature" here, not "it".
      const onto = effect.to.kind === 'triggerSubject' ? 'that creature' : object(effect.to);
      return `Attach ${object(effect.object)} to ${onto}`;
    }
    case 'unattach':
      return `Unattach ${object(effect.object)}`;
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
    case 'scry':
    case 'surveil':
      // CR 701.22, 701.25 (Galadriel group 1): "Scry 3", "Surveil X"; always the controller's own library.
      return effect.player === undefined || effect.player.kind === 'you'
        ? `${effect.kind === 'scry' ? 'Scry' : 'Surveil'} ${defs.say(effect.count, { self })}`
        : UNSAID;
    case 'ringTempts':
      // D-196 (CR 701.54a): the Ring tempts the controller.
      return 'The Ring tempts you';
    case 'myriad':
      // CR 702.116a: the ability the keyword Myriad stands for, as the keyword's reminder text writes it.
      return effect.opponent === undefined
        ? "For each opponent other than defending player, you may create a token that's a copy of this creature that's tapped and attacking that player or a planeswalker they control. Exile the tokens at end of combat"
        : 'Create a token that is a copy of this creature, tapped and attacking that opponent';
    case 'delayedSacrifice':
      // D-478 (CR 702.147a, 701.54c): the sacrifice at end of combat of the ability of Decayed, and of the third level of the Ring.
      return delayedSacrificeText(effect.of);
    case 'empowerJace':
      // D-201 (CR 701.71a): the keyword action, as the cards write it.
      return `Empower Jace ${effect.amount}`;
    case 'moveCountersOnto':
      // Issue 230 (CR 122.1): the effect as the card writes it.
      return `Move any number of ${effect.counter} counters from this creature onto other creatures`;
    case 'populate':
      // D-627 (CR 701.36): the keyword action.
      return 'Populate';
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
    case 'exchangeLifeWithPt':
      // CR 701.12g: "Exchange target opponent's life total with this creature's toughness".
      return `Exchange ${playerOwner(effect.player, ability)} life total with ${effect.object.kind === 'this' ? "this permanent's" : "that permanent's"} ${effect.stat}`;
    case 'reselectAttack':
      // D-139 (CR 508.7).
      return `Reselect which player or permanent ${object(effect.objects)} is attacking`;
    case 'untap':
      // D-216 (CR 701.26a): "Untap up to three lands".
      return effect.objects.kind === 'choose'
        ? (untapChooseText(effect.objects) ?? UNSAID)
        : `Untap ${object(effect.objects)}`;
    case 'noMaxHandSizeForGame':
      // CR 402.2: "You have no maximum hand size for the rest of the game".
      return 'You have no maximum hand size for the rest of the game';
    case 'removeAllCounters':
      return `Remove all counters from ${object(effect.objects)}`;
    case 'moveAllCounters':
      // CR 122.1: "Move all counters from target nonland permanent you control onto another target nonland permanent you control".
      return `Move all counters from ${object(effect.from)} onto ${object(effect.to)}`;
    case 'removeAllPlayerCounters':
      return `${playerVerb(effect.player, ability, 'lose')} all counters`;
    case 'createCopies': {
      // D-385: "For each token you control of the chosen type that entered this turn, create a token that's a copy of it".
      // D-639: "For each creature token you control that entered this turn, create a tapped token that's a copy of that token".
      const group = copiesOfTokensText(effect);
      if (group !== null) return group;
      // D-639 (CR 707.2, 707.9b): "For each of any number of target creatures you control, create a token that's a copy of that creature, except it has haste".
      return effect.objects.kind === 'target' && onlyHaste(effect.abilities)
        ? `For each of ${object(effect.objects)}, create a token that's a copy of that creature, except it has haste`
        : UNSAID;
    }
    case 'chooseObjects':
      // D-642 (CR 608.2d): "Choose a token you control", the offer of Brudiclad.
      return effect.count === 1 &&
        effect.filter.token === true &&
        effect.filter.controller === 'you' &&
        Object.keys(effect.filter).length === 2
        ? 'You may choose a token you control'
        : UNSAID;
    case 'becomeCopy':
      return becomeCopyText(effect, ability, self);
    case 'counter':
      return `Counter ${object(effect.objects)}`;
    case 'addCounters':
      return `Put ${quantity(effect.count, defs, counters(effect.counter))} on ${object(effect.objects)}`;
    case 'grantKeyword':
      // "Each Zombie gains menace until end of turn" (CR 613.1f, 611.2c).
      // D-187: "up to that many target creatures gain double strike": several targets, the plural verb.
      // D-653 (CR 604.1): the keyword works on its controller's turn only, "gains first strike during your turn until end of turn".
      return `${capital(object(effect.objects))} ${object(effect.objects).startsWith('up to ') ? 'gain' : 'gains'} ${grantedKeywordWords(effect.keyword)}${effect.duringYourTurn === true ? ' during your turn' : ''}${effect.duration === 'untilEndOfTurn' ? ' until end of turn' : effect.duration === 'untilYourNextTurn' ? ' until your next turn' : ''}`;
    case 'exileSpellWithTimeCounters':
      // D-651 (CR 608.2n, 122.1, 702.62b): "Exile this spell with three time counters on it".
      return `Exile this spell with ${effect.count} time counters on it`;
    case 'exileUntilFound':
      // CR 701.13, 101.4 (D-661): each player exiles from their own library until a nonland card.
      return 'Each player exiles cards from the top of their library until they exile a nonland card';
    case 'opponentChoosesCard':
      // CR 608.2d (D-661): the others are the cards exiled this way that were not chosen.
      return 'An opponent chooses a nonland card exiled this way';
    case 'exilePiles':
      // CR 700.3, 406.3 (D-664).
      return `Exile the top ${effect.count} cards of your library in a face-down pile, then exile the top ${effect.count} cards of your library in a face-up pile. An opponent chooses one of those piles. Put that pile into your graveyard. Look at the cards in the other pile`;
    case 'exileTopAnyNumber':
      // CR 701.13, 608.2d (D-662).
      return 'As many times as you choose, you may exile the top card of your library';
    case 'delayedCombatDamageTurn':
      // CR 603.7, 510.3a (D-663): a delayed ability for the turn.
      return 'Whenever a creature you control deals combat damage to a player this turn, copy the exiled card. You may cast the copy without paying its mana cost';
    case 'delayedCombatDamageToPlayer': {
      // CR 603.7c (issue 144): a delayed ability for the turn, for damage to the player the spell targeted.
      const inner = effectText(effect.effect, ability, self, defs);
      return inner === ''
        ? UNSAID
        : `Whenever a creature you control deals combat damage to that player this turn, ${lower(inner)}`;
    }
    case 'copyCardAndCast':
      // D-654 (CR 707.12, 608.2g): the card the instruction before exiled, copied, and the copy cast for free.
      return 'Copy the exiled card. You may cast the copy without paying its mana cost';
    case 'grantPlayerHexproof':
      // CR 702.11b (Hylda group 3): "You gain hexproof until end of turn".
      return `${playerVerb(effect.player, ability, 'gain')} hexproof until end of turn`;
    case 'restrict':
      // D-517 (CR 502.3, 611.2a): "Target creature doesn't untap during its controller's next untap step".
      if (effect.duration === 'untilNextUntapStep') {
        const who = object(effect.objects);
        return keepTappedText(who, isSeveral(who));
      }
      // Galadriel group 3 (CR 602.5): "Target permanent's activated abilities can't be activated this turn".
      if (effect.restriction === 'cantActivateAbilities') {
        return `${capital(object(effect.objects))}'s activated abilities can't be activated${effect.duration === 'untilEndOfTurn' ? ' this turn' : ''}`;
      }
      // "Target creature can't be blocked this turn" (CR 613.11).
      return `${capital(object(effect.objects))} ${RESTRICTION_EFFECT[effect.restriction]}${effect.duration === 'untilEndOfTurn' ? ' this turn' : effect.duration === 'forAsLongAsYouControlThis' ? ' for as long as you control this' : ''}`;
    case 'gainControl':
      // D-189 (CR 613.1b, 611.2): "Gain control of target creature until end of turn".
      return `Gain control of ${object(effect.objects)}${controlDurationText(effect.duration, self)}`;
    case 'returnControlToOwners':
      // D-628 (CR 613.1b): "Each player gains control of all creatures they own".
      return `Each player gains control of ${object(effect.objects)} they own`;
    case 'exchangeControl':
      // Galadriel group 3 (CR 701.12): "Exchange control of this enchantment and target nonland permanent".
      return `Exchange control of ${object(effect.first)} and ${object(effect.second)}`;
    case 'removeCounters':
      // Galadriel group 3 (CR 122.1): "Remove a number of loyalty counters equal to that card's mana value from this planeswalker".
      if (
        typeof effect.count === 'object' &&
        effect.count.kind === 'manaValueOf' &&
        effect.count.of.kind === 'moved'
      ) {
        return `Remove a number of ${effect.counter} counters equal to that card's mana value from ${object(effect.objects)}`;
      }
      return `Remove ${quantity(effect.count, defs, counters(effect.counter))} from ${object(effect.objects)}`;
    case 'counterUnlessPays':
      // Galadriel group 3 (CR 118.12a): "Counter target spell unless its controller pays mana equal to the greatest power among creatures you control". The effects with a cost of
      // symbols show the cost only, as before.
      return effect.genericAmount === undefined
        ? ''
        : `Counter ${object(effect.objects)} unless its controller pays mana equal to ${amountPhrase(effect.genericAmount, { self })}`;
    case 'requireAttack':
      // D-179 (CR 508.1d): "Until your next turn, creatures your opponents control attack each combat if able".
      return requireAttackText(effect) ?? UNSAID;
    case 'creaturesCantAttackYou':
      // Federation Fleet group F (CR 508.1a): "Until your next turn, creatures can't attack you".
      return "Until your next turn, creatures can't attack you";
    case 'restrictGroup': {
      // Abzan Armor group A (CR 609.4, 611.2c): "Creatures you control with defender can attack this turn as though they didn't have defender".
      const group = groupPhrase(effect.creatures);
      if (group === null) return UNSAID;
      return effect.restriction === 'canAttackAsThoughNoDefender'
        ? `${capital(group)} can attack this turn as though they didn't have defender`
        : `Until end of turn, ${group} assign combat damage equal to their toughness rather than their power`;
    }
    case 'doubleTokens':
      // Issue 101 (CR 614.1a): "Until end of turn, if one or more tokens would be created under your control, twice that many are created instead".
      return 'until end of turn, twice as many tokens are created under your control';
    case 'permanentsEnterTapped':
      // D-519 (CR 614.1c, 614.12): "Until your next turn, creatures your opponents control enter tapped".
      return entersTappedText(effect) ?? UNSAID;
    case 'addMana': {
      // "Add {C}" for a fixed amount (D-139: a triggered mana ability's "add an additional {C}"), else the gist.
      if (effect.mana.kind === 'fixed') {
        // D-151 (CR 106.1): "Add {R} for each tapped land your opponents control".
        const made = fixedTimesWords(effect.mana);
        // D-650 (CR 500.5, 106.4): "Until end of turn, you don't lose this mana as steps and phases end".
        return made === null
          ? UNSAID
          : `Add ${made}${effect.mana.staysUntilEndOfTurn === true ? ". Until end of turn, you don't lose this mana as steps and phases end" : ''}`;
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
    case 'revealTopCast':
      // CR 701.20a, 608.2g: "Reveal the top card of your library. You may cast it without paying its mana cost if it's a spell with lesser mana value ...".
      return revealTopCastText();
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
      // Issue 121 (CR 118.1, 603.12): "You may pay {2}{R} any number of times. When you pay this cost one or more times, ...".
      if (effect.cost !== undefined) {
        const times = `You may pay ${effect.cost.map((s) => `{${s}}`).join('')} any number of times`;
        return inner === ''
          ? times
          : `${times}. When you pay this cost one or more times, ${lower(inner)}`;
      }
      const pay = payAnyAmountText(effect.symbol ?? '1');
      return inner === '' ? pay : `${pay}. When you do, ${lower(inner)}`;
    }
    case 'sparePermanents': {
      // D-484 (CR 608.2d, 701.21a): "Each opponent chooses a permanent they control of each permanent type and sacrifices the rest." Only the shape with the six types is said; the
      // controller's own choices (Tragic Arrogance) are not worded here.
      if (effect.own === undefined) return UNSAID;
      const all =
        effect.types.length === 6 &&
        ['artifact', 'battle', 'creature', 'enchantment', 'land', 'planeswalker'].every((t) =>
          (effect.types as readonly string[]).includes(t),
        );
      if (!all) return UNSAID;
      const who = effect.own.players.kind === 'eachOpponent' ? 'Each opponent' : 'Each player';
      return `${who} chooses a permanent they control of each permanent type and sacrifices the rest`;
    }
    case 'copySpell': {
      // D-438 (CR 707.10, 707.10e): a copy for each other creature, each aimed at one of them; only the shape the engine's cards have is said.
      if (effect.forEach !== undefined) {
        const f = effect.forEach;
        const theirs = effect.copier === 'triggerPlayer';
        const shape =
          f.types?.length === 1 &&
          f.types[0] === 'creature' &&
          f.other === true &&
          f.controller === (theirs ? 'triggerPlayer' : 'you') &&
          effect.newTargets === 'no' &&
          effect.count === undefined &&
          Object.keys(f).every((k) => ['types', 'other', 'controller', 'zone'].includes(k));
        const named = object(effect.spell);
        return shape && named !== UNSAID ? copyForEachWords(named, theirs) : UNSAID;
      }
      // D-337 (CR 707.10, 707.10c, 903.8): "Copy that spell", with new targets, and once for each time the commander was cast from the command zone.
      const count =
        effect.count === undefined
          ? null
          : effect.count === 1
            ? null
            : typeof effect.count === 'object' && effect.count.kind === 'commanderCasts'
              ? "time you've cast your commander from the command zone this game"
              : // D-491 (CR 118.8): "copy this spell for each creature sacrificed this way".
                typeof effect.count === 'object' && effect.count.kind === 'sacrificedAsCost'
                ? 'creature sacrificed this way'
                : UNSAID;
      if (count === UNSAID) return UNSAID;
      const spell = object(effect.spell);
      return spell === UNSAID ? UNSAID : copySpellWords(spell, effect.newTargets, count);
    }
    case 'doubleSpellX':
      // CR 107.3 (Unbound Flourishing): the X of the spell that was cast.
      return object(effect.spell) === UNSAID ? UNSAID : 'Double the value of X';
    case 'exileOnResolve': {
      // D-439 (CR 614.1a, 608.2n, 603.7): the spell whose casting caused the trigger is exiled as it resolves, and comes back to the hand at the next end step.
      return object(effect.spell) === UNSAID
        ? UNSAID
        : 'Exile that card instead of putting it into your graveyard as it resolves. If you do, return it to your hand at the beginning of the next end step';
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
    case 'exileIfLeaves':
      // D-459 (CR 614.1a): the replacement of the permanent an earlier instruction put onto the battlefield (Whip of Erebos).
      return `If ${object(effect.objects)} would leave the battlefield, exile it instead of putting it anywhere else`;
    case 'delayedTrigger': {
      // D-151 (CR 603.7): "At the beginning of your next end step, this creature deals 2 damage to each opponent for each of those cards".
      const when = delayedWords(effect.at);
      const inner = effectText(effect.effect, ability, self, defs);
      return when === null || inner === '' ? UNSAID : `${when}, ${lower(inner)}`;
    }
    case 'setTypes': {
      // D-151 (CR 205.1b, 613.1d): "Until end of turn, this creature becomes a Dragon in addition to its other types".
      const kinds = [...(effect.subtypes ?? []), ...(effect.types ?? [])];
      // D-474 (CR 305.7): "Target land becomes a Swamp until end of turn": a basic land type replaces the land types.
      if (
        effect.additive !== true &&
        effect.types === undefined &&
        effect.subtypes?.length === 1 &&
        BASIC_LAND_TYPE_WORDS.includes(effect.subtypes[0] ?? '')
      ) {
        const land = effect.subtypes[0] ?? '';
        return `${capital(object(effect.objects))} becomes ${land === 'Island' ? 'an' : 'a'} ${land}${effect.duration === 'untilEndOfTurn' ? ' until end of turn' : ''}`;
      }
      if (effect.additive !== true || kinds.length === 0) return UNSAID;
      const noun = kinds.join(' ');
      // D-460 (CR 613.1d, 613.4b, 611.2a): "Each of them is a 1/1 Spirit in addition to its other types", for good: the base power and toughness are said too.
      if (effect.basePt !== undefined && effect.duration === 'permanent') {
        const size = `${effect.basePt.power}/${effect.basePt.toughness}`;
        return `${capital(object(effect.objects))} is a ${size} ${noun} in addition to its other types`;
      }
      const until = effect.duration === 'untilEndOfTurn' ? ' until end of turn' : '';
      // Galadriel group 1: "Up to two target lands you control become Elemental creatures in addition to their other types": several targets, the plural verb and noun.
      if (object(effect.objects).startsWith('up to ')) {
        const plural = [
          ...(effect.types === undefined && effect.subtypes !== undefined
            ? [...effect.subtypes.slice(0, -1), pluralSubtype(effect.subtypes.at(-1) ?? '')]
            : (effect.subtypes ?? [])),
          ...(effect.types ?? []).map((type) => `${type}s`),
        ].join(' ');
        return `${capital(object(effect.objects))} become ${plural} in addition to their other types${until}`;
      }
      return `${capital(object(effect.objects))} becomes ${/^[aeiou]/i.test(noun) ? 'an' : 'a'} ${noun} in addition to its other types${until}`;
    }
    case 'proliferate':
      // D-149 (CR 701.34a).
      return PROLIFERATE_TEXT;
    case 'shuffle':
      return 'Shuffle your library';
    case 'clash':
      // CR 701.30b: "Clash with an opponent".
      return 'Clash with an opponent';
    case 'coinFlip':
      // CR 705.2: the flip after the call.
      return `Flip a coin, calling ${effect.call}`;
    case 'rollDie':
      // CR 706.1 (D-271): "Roll a four-sided die".
      return `Roll a ${effect.sides}-sided die`;
    case 'search':
      return searchText(effect);
    case 'dealDamageToSelf':
      // CR 120.3 (Lorehold group 1): "Each creature deals damage to itself equal to its power".
      return `${capital(object(effect.objects))} deals damage to itself equal to its power`;
    case 'dealDamageToController':
      // CR 120.3 (issue 279): "Each creature deals 1 damage to its controller".
      return `${capital(object(effect.objects))} deals ${defs.say(effect.amount, { self })} damage to its controller`;
    case 'copyOneOfTriggerCards':
      // Twilight Diviner (CR 603.2c, 707.2): of the permanents a batch enters trigger saw.
      return "Create a token that's a copy of one of them";
    case 'exileFromTriggerCards':
      // CR 603.2c (Lorehold group 1): of the cards a batch trigger is about.
      return 'You may exile one of them from your graveyard';
    case 'createToken':
      return tokenText(effect, ability, self, defs);
    case 'conditional': {
      // CR 608.2c (D-131): "If you're the monarch, ...; otherwise, ...". A condition the words do not
      // cover leaves the instruction out, never guessed at.
      const when = gameConditionWords(
        effect.condition,
        ability.trigger?.kind === 'castSpell' ? { self, spell: true } : { self },
      );
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
  // CR 702.49a: "Ninjutsu {1}{R}": the return of the attacker is part of the keyword, not of the price.
  if (isNinjutsu(ability)) {
    return costKeyword(
      'Ninjutsu',
      ability.cost.filter((c) => c.kind !== 'returnToHand'),
    );
  }
  if (isEquip(ability)) return costKeyword('Equip', ability.cost);
  if (isUnearth(ability)) return costKeyword('Unearth', ability.cost);
  // D-384: "Eternalize {5}{U}{U}": the exile of the card is part of the keyword, not of the price.
  if (isEternalize(ability)) {
    return costKeyword(
      'Eternalize',
      ability.cost.filter((c) => c.kind !== 'exileThis'),
    );
  }
  // CR 702.128a: "Embalm {5}{W}": the exile of the card is part of the keyword, not of the price.
  if (isEmbalm(ability)) {
    return costKeyword(
      'Embalm',
      ability.cost.filter((c) => c.kind !== 'exileThis'),
    );
  }
  // D-185: "Encore {3}{R}": the exile of the card is part of the keyword, not of the price.
  if (isEncore(ability)) {
    return costKeyword(
      'Encore',
      ability.cost.filter((c) => c.kind !== 'exileThis'),
    );
  }
  const crew = crewNumber(card, ability);
  if (crew !== null) return `Crew ${crew}`;
  // CR 702.184a: the expansion of the Station keyword reads "Station", as the card prints it.
  if (
    (card?.keywords ?? []).includes('station') &&
    ability.effect.kind === 'addCounters' &&
    ability.effect.count !== undefined &&
    typeof ability.effect.count === 'object' &&
    ability.effect.count.kind === 'tappedAsCostPower'
  ) {
    return 'Station';
  }
  const noun = selfNoun(card);
  // Lorehold group 1: "Exile this artifact" of a permanent on the battlefield; the exile of a card in the graveyard is said by the cost.
  const cost = ability.cost
    .map((part) =>
      part.kind === 'exileThis' && ability.functionsIn !== 'graveyard'
        ? `Exile this ${noun}`
        : activationCostPart(part, noun),
    )
    .join(', ');
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
