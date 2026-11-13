/**
 * Static abilities (CR 604): "You have no maximum hand size." and the statements that say what a
 * permanent or a group of permanents gets and has. One IR statement has one subject and several
 * effects; each effect is one engine `static` ability, in text order, as the engine's fixtures
 * write them ("gets +1/+1 and has vigilance" is a `modifyPt` and a `grantKeyword`).
 */
import {
  type Ability,
  CARD_TYPES,
  type CardType,
  type Color,
  type Condition,
  type ObjectFilter,
  type StaticEffect,
  type StaticSubject,
  SUPERTYPES,
  type Supertype,
} from '@commander-arena/engine';
import { bind } from '../ir/bind';
import type { IrAbility, IrNoun, IrStaticEffect, IrStaticPart } from '../ir/types';
import { isGrantable, keywordKind, plainKeyword } from '../rules/keyword/vocabulary';
import { lowerActivated, lowerGrantedMana } from './activated';
import { isKeepsDamage, lowerKeepsDamage } from './adamantoise';
import { lowerAmount, lowerDefinedPt, lowerStaticAmount, lowerStaticPtStep } from './amounts';
import { isAngelStatic, lowerAngelStatic } from './angels';
import { withoutZone } from './attachments';
import { lowerCondition } from './conditions';
import { isDragonStatic, lowerDragonStatic } from './dragons';
import { type FeatureRef, missingFeatures } from './features';
import { isGraveyardPlayStatic, lowerGraveyardPlayStatic } from './hofri';
import { isKorvoldStatic, lowerKorvoldStatic } from './korvold';
import { colorLetter, lowerFilter } from './nouns';
import { isPlayRule, lowerPlayRule, PLAY_RULE_NEEDS, playRuleNeeds } from './play-rules';
import { lowerTriggered } from './triggers';
import { type LowerContext, type LowerFailure, type LowerResult, newContext } from './types';

type At = { readonly span: { start: number; end: number }; readonly rule: string };
type Static = Extract<IrAbility, { kind: 'static' }>;

function failure(node: At, needs: readonly FeatureRef[] = []): LowerFailure {
  return { ok: false, needs, at: node.span, rule: node.rule };
}

/**
 * The subject of an "enchanted" or "equipped" statement: the permanent the source is attached to.
 * "Enchanted" needs an Aura and "equipped" an Equipment (CR 303.4b, 301.5a); on any other face
 * nothing is attached to anything, so the statement is not lowered (the engine's `validateCard`
 * would refuse it too).
 */
function attachedSubject(noun: IrNoun, ctx: LowerContext): LowerResult<StaticSubject> {
  const needed = noun.det === 'enchanted' ? 'Aura' : 'Equipment';
  if (!ctx.faceSubtypes.includes(needed)) return failure(noun);
  // The word after "enchanted" or "equipped" is the type the host must have (CR 303.4m, 301.5a):
  // an `Enchant permanent` Aura that says "Enchanted creature" gives nothing to a land.
  const types = noun.filter.types ?? [];
  const supertypes = noun.filter.supertypes ?? [];
  const known =
    types.every((t) => (CARD_TYPES as readonly string[]).includes(t)) &&
    supertypes.every((t) => (SUPERTYPES as readonly string[]).includes(t));
  if (!known) return failure(noun);
  const value: StaticSubject = {
    kind: 'attached',
    ...(types.length > 0 ? { types: types as CardType[] } : {}),
    ...(supertypes.length > 0 ? { supertypes: supertypes as Supertype[] } : {}),
  };
  return { ok: true, value, rule: noun.rule };
}

/** Whether the filter, or one of its `anyOf` members, says "with flying" or "without flying". */
function namesKeyword(filter: ObjectFilter): boolean {
  return (
    filter.keywords !== undefined ||
    filter.notKeywords !== undefined ||
    (filter.anyOf?.some(namesKeyword) ?? false)
  );
}

/** Whether a condition reads a keyword or a power or toughness, which a static ability's condition may not (CR 613.8). */
function conditionNamesLayerValue(condition: Condition): boolean {
  switch (condition.kind) {
    case 'controlsAtLeast':
    case 'thisMatches':
      return namesKeyword(condition.filter) || comparesPowerOrToughness(condition.filter);
    case 'and':
    case 'or':
      return condition.terms.some(conditionNamesLayerValue);
    case 'not':
      return conditionNamesLayerValue(condition.term);
    default:
      return false;
  }
}

/**
 * A group of permanents: the filter without a zone, and "other" on the subject, as the fixtures. With `keywords` (stage P33, D-150) the
 * filter may name a keyword ("Other creatures you control with flying have indestructible."): only a keyword grant may, which the engine
 * reads after the effects that do not read keywords and again until none more applies (CR 613.8).
 */
function groupSubject(noun: IrNoun, keywords = false): LowerResult<StaticSubject> {
  const filter = lowerFilter({ ...noun, other: false, filter: withoutZone(noun.filter) });
  if (!filter.ok) return filter;
  // D-133, CR 613.8: a keyword in the subject of a static ability would depend on the layer it applies in (layer 6).
  if (namesKeyword(filter.value) && !keywords) return failure(noun);
  return {
    ok: true,
    value: { kind: 'filter', filter: filter.value, ...(noun.other ? { other: true } : {}) },
    rule: noun.rule,
  };
}

function subjectOf(noun: IrNoun, ctx: LowerContext, keywords = false): LowerResult<StaticSubject> {
  // `~` is the ability's own permanent, or the spell for "This spell can't be countered".
  if (noun.det === 'self') return { ok: true, value: { kind: 'this' }, rule: noun.rule };
  if (noun.det === 'enchanted' || noun.det === 'equipped') return attachedSubject(noun, ctx);
  if (noun.det === 'each') return groupSubject(noun, keywords);
  // "Each of those creatures" of a soulbond card (D-286, CR 702.95b): this permanent and the creature it is paired with.
  if (noun.det === 'pair') return { ok: true, value: { kind: 'pair' }, rule: noun.rule };
  return failure(noun);
}

/**
 * The host of an Aura or Equipment as the layers of D-145 name it: the permanent it is attached to, with no host type (the Aura's own
 * Enchant ability limits what it can be attached to, CR 303.4m), which the engine's `loseAllAbilities`, `setColors` and `setTypes` take.
 */
function plainAttached(subject: StaticSubject): StaticSubject {
  return subject.kind === 'attached' ? { kind: 'attached' } : subject;
}

/**
 * `has "Whenever ~ attacks, it deals 7 damage to target creature defending player controls."` (stage P34, D-152, CR 613.1f, 603.2): an
 * activated or a triggered ability the permanent itself has. In the text of an ability that is granted `~` is the permanent that has it, which
 * is the one the static ability is on when the subject is `~`. Any other subject (an attached permanent, a group) is read and not run.
 */
function lowerGrantedAbility(
  quoted: Extract<IrStaticEffect, { kind: 'grantAbility' }>['ability'],
  subject: StaticSubject,
  at: At,
  ctx: LowerContext,
): LowerResult<Extract<Ability, { kind: 'activated' | 'triggered' }>> {
  const inner = quoted.ability;
  // A refusal points at the statement that grants, as it did when the quoted text was only text.
  if (inner.kind !== 'activated' && inner.kind !== 'triggered') return failure(at);
  // The permanent itself, or (stage P36, D-178) a group of permanents (the engine's `grantAbility` gives the ability to each permanent the subject
  // names, which has it as its own); an attached subject with such an ability is read and not run. `~` is the permanent that has the ability, which
  // is not the card for a group, so a card that names itself inside a quotation is not read for one.
  // Stage P49 (D-206): the equipped or enchanted permanent too, for a triggered ability ("Equipped creature has \"Whenever this creature attacks, you gain 1 life.\"": `~` in the quotation is
  // the creature that has the ability, the same as for a group).
  // D-286 (CR 702.95b): the pair, for a triggered ability ("each of those creatures has a quoted ability"): `~` in the quotation is the creature that has it.
  if (
    subject.kind !== 'this' &&
    ((subject.kind !== 'filter' &&
      !((subject.kind === 'attached' || subject.kind === 'pair') && inner.kind === 'triggered')) ||
      ctx.namedInQuotes)
  ) {
    return failure(at);
  }
  const bound = bind(inner, {});
  if (!bound.ok) return failure(at);
  const own = newContext('ability', ctx.faceTypes, ctx.faceSubtypes, ctx.cardName);
  const lowered =
    bound.ability.kind === 'triggered'
      ? lowerTriggered(bound.ability, own)
      : bound.ability.kind === 'activated'
        ? lowerActivated(bound.ability, own)
        : null;
  if (lowered === null) return failure(at);
  if (!lowered.ok) return failure(at, lowered.needs);
  const [only, ...more] = lowered.value;
  if (only === undefined || more.length > 0) return failure(at);
  return only.kind === 'activated' || only.kind === 'triggered'
    ? { ok: true, value: only, rule: at.rule }
    : failure(at);
}

function effectOf(
  effect: IrStaticEffect,
  subject: StaticSubject,
  at: At,
  ctx: LowerContext,
): LowerResult<StaticEffect> {
  const ok = (value: StaticEffect): LowerResult<StaticEffect> => ({
    ok: true,
    value,
    rule: at.rule,
  });
  switch (effect.kind) {
    case 'pt':
      return ok({ kind: 'modifyPt', subject, power: effect.power, toughness: effect.toughness });
    case 'ptCount': {
      // D-115, CR 611.3a: a bonus per object counted, worked out each time the subject is derived.
      const power = lowerStaticPtStep(effect.power, effect.count, ctx, at.rule);
      if (!power.ok) return power;
      const toughness = lowerStaticPtStep(effect.toughness, effect.count, ctx, at.rule);
      if (!toughness.ok) return toughness;
      return ok({ kind: 'modifyPt', subject, power: power.value, toughness: toughness.value });
    }
    case 'definesPt': {
      // CR 604.3, 208.2a: the permanent's own characteristic-defining ability, layer 7a. The stat the
      // line does not define stays the number the card prints (`validateCard` pairs the `*`).
      if (subject.kind !== 'this') return failure(at);
      const defined = lowerDefinedPt(effect.count, ctx, at.rule);
      if (!defined.ok) return defined;
      return ok({
        kind: 'characteristicPt',
        ...(effect.stats === 'toughness' ? {} : { power: defined.value }),
        ...(effect.stats === 'power' ? {} : { toughness: defined.value }),
      });
    }
    case 'grantKeyword': {
      const kind = keywordKind(effect.keyword);
      if (kind === undefined || !isGrantable(kind) || (effect.params ?? []).length > 0) {
        return failure(at);
      }
      return ok({ kind: 'grantKeyword', subject, keyword: plainKeyword(kind) });
    }
    case 'grantProtection': {
      // CR 702.16, 903.4 (stage P70, D-259): the engine's `grantKeyword` with a protection, from the named colors or from those outside the
      // commander's color identity.
      // CR 702.16a, 607.2d (Hashaton deck group 6, D-376): or from the card type the permanent that gives it chose as it entered.
      if (effect.chosenCardType === true) {
        return ok({
          kind: 'grantKeyword',
          subject,
          keyword: { kind: 'protection', from: 'chosenCardType' },
        });
      }
      if (effect.commanderIdentity === true) {
        return ok({
          kind: 'grantKeyword',
          subject,
          keyword: { kind: 'protection', from: 'colorsNotInCommanderIdentity' },
        });
      }
      // CR 702.16a, 205.2a (Danitha deck group 1b, D-1212): "protection from creatures", from the card types the text names.
      if (effect.cardTypes !== undefined) {
        const types = effect.cardTypes.filter((t): t is CardType =>
          (CARD_TYPES as readonly string[]).includes(t),
        );
        if (types.length === 0 || types.length !== effect.cardTypes.length) return failure(at);
        return ok({
          kind: 'grantKeyword',
          subject,
          keyword: { kind: 'protection', from: 'cardType', types },
        });
      }
      const colors = (effect.colors ?? []).map((w) => colorLetter(w));
      if (colors.length === 0 || colors.some((c) => c === undefined)) return failure(at);
      return ok({
        kind: 'grantKeyword',
        subject,
        keyword: { kind: 'protection', from: 'color', colors: colors as Color[] },
      });
    }
    case 'grantAbility': {
      // CR 613.1f: the engine gives a mana ability, and (stage P34, D-152) an activated or a triggered ability of its own kinds; the
      // quoted text was read as an ability and is lowered like the abilities of the card itself.
      const quoted = effect.ability;
      const inner = quoted.ability;
      const makesMana =
        inner.kind === 'activated' &&
        inner.body.sentences.some((s) => s.clauses.some((c) => c.verb === 'addMana'));
      if (makesMana) {
        // A granted mana ability that sacrifices its permanent names it `~` (stage P36, D-178): not for a group of a card that names itself in quotes.
        if (subject.kind !== 'this' && ctx.namedInQuotes) return failure(at);
        const mana = lowerGrantedMana(quoted, ctx.faceTypes);
        return mana.ok ? ok({ kind: 'grantAbility', subject, ability: mana.value }) : mana;
      }
      const granted = lowerGrantedAbility(quoted, subject, at, ctx);
      return granted.ok ? ok({ kind: 'grantAbility', subject, ability: granted.value }) : granted;
    }
    case 'cantHaveCounters':
      // CR 122.6, 101.2 (Hashaton deck group 3, D-380): the permanents the subject names can't have counters of the kind put on them: a group, `~` or the attached permanent.
      return subject.kind === 'filter' || subject.kind === 'this' || subject.kind === 'attached'
        ? ok({ kind: 'cantHaveCounters', subject, counter: effect.counter })
        : failure(at);
    case 'castFromGraveyard':
      // CR 113.6b (stage P29, D-133): the ability of a card in its owner's graveyard, so its subject is `~`.
      return subject.kind === 'this' ? ok({ kind: 'castFromGraveyard' }) : failure(at);
    case 'chosenType':
      // D-100, CR 205.1b, 613.1d: the permanent itself has the type it chose, in addition to its own
      // (layer 4). Only `~` and only the chosen creature type run; the card must ask the question.
      return subject.kind === 'this'
        ? ok({ kind: 'setTypes', subject, chosenType: true, additive: true })
        : failure(at);
    case 'cantBeBlockedBy': {
      // "Juggernauts you control can't be blocked by Walls" (stage P31, D-140, CR 509.1b): the blockers as they are now.
      const blockers = lowerFilter({
        kind: 'noun',
        det: 'a',
        filter: effect.blockers,
        upTo: false,
        plural: true,
        other: false,
        span: at.span,
        rule: at.rule,
      });
      return blockers.ok
        ? ok({ kind: 'cantBeBlockedBy', subject, blockers: blockers.value })
        : blockers;
    }
    case 'basePt':
      // "Other creatures you control have base power and toughness 5/3" (stage P31, D-140, CR 613.4b): layer 7b.
      return ok({
        kind: 'setPt',
        subject: plainAttached(subject),
        power: effect.power,
        toughness: effect.toughness,
      });
    case 'addTypes':
      // "... are Juggernauts in addition to their other creature types" (stage P31, D-140, CR 205.1b, 613.1d): layer 4; and, stage P33
      // (D-150), "Enchanted creature ... is an Angel in addition to its other types".
      return subject.kind === 'filter' || subject.kind === 'attached'
        ? ok({ kind: 'setTypes', subject, additive: true, subtypes: [...effect.subtypes] })
        : failure(at);
    case 'restrictUnless': {
      // CR 508.1a, 509.1a (stage P32, D-147): the permanent's own restriction, lifted while the condition holds for its controller
      // ("another" is every permanent but this one), read where the attack or block is declared and never in a layer.
      if (subject.kind !== 'this') return failure(at);
      const unless = lowerCondition(effect.unless, true, ctx);
      if (!unless.ok) return unless;
      return ok({
        kind: 'restrictionUnless',
        subject: { kind: 'this' },
        restrictions: [...effect.restrictions],
        unless: unless.value,
      });
    }
    case 'ptTimesAttacked':
      // CR 508.1, 613.4c (stage P41, D-188): +1 for each time the creature affected has attacked this turn, read from the turn log as it is looked at.
      return ok({
        kind: 'modifyPt',
        subject,
        power: effect.power ? { kind: 'timesAttacked' } : 0,
        toughness: effect.toughness ? { kind: 'timesAttacked' } : 0,
      });
    case 'ptAmount': {
      // "+X/+X, where X is the greatest mana value among your commanders" (stage P32, D-147, CR 613.4c): the amount follows the board.
      const amount = lowerStaticAmount(effect.amount, ctx, at.rule);
      if (!amount.ok) return amount;
      return ok({
        kind: 'modifyPt',
        subject,
        power: effect.power ? amount.value : 0,
        toughness: effect.toughness ? amount.value : 0,
      });
    }
    case 'loseAllAbilities':
      // CR 613.1f (stage P32, D-147): the permanent the Aura or Equipment is attached to, whatever host type its text says.
      return subject.kind === 'attached'
        ? ok({ kind: 'loseAllAbilities', subject: { kind: 'attached' } })
        : failure(at);
    case 'setColors': {
      const colors: Color[] = [];
      for (const word of effect.colors) {
        const letter = colorLetter(word);
        if (letter === undefined) return failure(at);
        colors.push(letter);
      }
      return ok({ kind: 'setColors', subject: plainAttached(subject), colors });
    }
    case 'replaceTypes': {
      // CR 205.1a, 205.3d, 613.1d (stage P32, D-147): the card types and the creature types listed replace those the object has.
      let types = effect.cardTypes;
      if (!types.every((t) => (CARD_TYPES as readonly string[]).includes(t))) return failure(at);
      // "~ is a Dragon" (stage P34, D-152, CR 205.1a, 205.3m): a creature type says the permanent is a creature, which the engine wants said as
      // the card type of the replacement; the permanent keeps its card types, so it is read only for a face that is a creature and nothing else.
      if (types.length === 0 && effect.subtypes.length > 0) {
        const onlyCreature = ctx.faceTypes.length === 1 && ctx.faceTypes[0] === 'creature';
        if (subject.kind !== 'this' || !onlyCreature) return failure(at);
        types = ['creature'];
      }
      return ok({
        kind: 'setTypes',
        subject: plainAttached(subject),
        ...(types.length > 0 ? { types: types as CardType[] } : {}),
        ...(effect.subtypes.length > 0 ? { subtypes: [...effect.subtypes] } : {}),
      });
    }
    case 'loseTypes': {
      // CR 613.1d, 205.1a (stage P68, D-229): "~ isn't a creature": the permanent itself loses card types, in layer 4.
      if (subject.kind !== 'this') return failure(at);
      if (!effect.cardTypes.every((t) => (CARD_TYPES as readonly string[]).includes(t))) {
        return failure(at);
      }
      return ok({ kind: 'loseTypes', subject, types: effect.cardTypes as CardType[] });
    }
    case 'restriction': {
      // CR 113.6g: "can't be countered" is the spell's own ability, so its subject is `~`; `~` says
      // nothing else but restrictions (the grammar reads only those of it).
      if (effect.restriction === 'cantBeCountered' && subject.kind !== 'this') return failure(at);
      return ok({ kind: 'restriction', subject, restriction: effect.restriction });
    }
    default:
      return failure(at);
  }
}

/** What each kind of effect needs from the engine, whether or not it can be lowered. */
function needsOf(effect: IrStaticEffect): FeatureRef[] {
  switch (effect.kind) {
    case 'pt':
      return ['static:modifyPt'];
    case 'ptCount':
      return ['static:modifyPt', 'amount:countOf'];
    case 'definesPt':
      return ['static:characteristicPt', 'amount:countOf'];
    case 'grantKeyword':
      // D-186: riot is read by the engine from the group's static ability as a permanent enters, and listed as a keyword of its own.
      return effect.keyword === 'riot'
        ? ['static:grantKeyword', 'keyword:riot']
        : ['static:grantKeyword'];
    case 'grantProtection':
      return ['static:grantKeyword', 'keyword:protection'];
    case 'grantQuoted':
      return ['static:grantAbility'];
    case 'restriction':
      return ['static:restriction'];
    case 'grantAbility':
      return ['static:grantAbility'];
    case 'noMaxHandSize':
      return ['static:noMaximumHandSize'];
    case 'chosenType':
      return ['static:setTypes'];
    case 'castFromGraveyard':
      return ['static:castFromGraveyard'];
    case 'cantBeBlockedBy':
      return ['static:cantBeBlockedBy'];
    case 'basePt':
      return ['static:setPt'];
    case 'addTypes':
      return ['static:setTypes'];
    case 'castAsThoughFlash':
      return ['static:castAsThoughFlash'];
    case 'opponentsCantCastSpells':
      return ['static:opponentsCantCastSpells'];
    case 'takeFromLinkedExile':
      return ['static:takeFromLinkedExile'];
    case 'costReduction':
      return ['static:costReduction'];
    case 'restrictUnless':
      return ['static:restrictionUnless'];
    case 'ptAmount':
      return ['static:modifyPt', 'amount:commanderManaValue'];
    case 'ptTimesAttacked':
      return ['static:modifyPt', 'amount:timesAttacked'];
    case 'loseAllAbilities':
      return ['static:loseAllAbilities'];
    case 'setColors':
      return ['static:setColors'];
    case 'replaceTypes':
      return ['static:setTypes'];
    case 'loseTypes':
      return ['static:loseTypes'];
    case 'additionalLandDrops':
    case 'lookAtTopOfLibrary':
    case 'attackTax':
    case 'optionalUntap':
    case 'untapInOthersStep':
      return playRuleNeeds(effect);
    case 'additionalCost':
    case 'freeCast':
    case 'tapAlternative':
      return [];
    case 'playerHexproof':
      return ['static:playerHexproof'];
    case 'playerProtection':
      return ['static:playerProtection'];
    case 'doubleTriggers':
      return ['static:doubleTriggers'];
    case 'cantLoseGame':
      return ['static:cantLoseGame'];
    case 'opponentsCantWin':
      return ['static:opponentsCantWin'];
    case 'cantGainLife':
      return ['static:cantGainLife'];
    case 'cantHaveCounters':
      return ['static:cantHaveCounters'];
    case 'preventDamageToThis':
      return ['static:preventDamageToThis'];
    case 'cantCastThis':
      return ['static:cantCastThis', 'condition:ownTurnNumber'];
    case 'blockTax':
      return ['static:blockTax', 'cost:mana'];
    case 'othersEnterWithCounters':
      return ['replacement:othersEnterWithCounters'];
    case 'unspentManaStays':
      return ['static:unspentManaStays'];
    case 'castFromTop':
      return ['static:castFromTopOfLibrary'];
    case 'graveyardPlay':
      return ['static:playFromGraveyardOnceEachTurn'];
    case 'groupEntersUntapped':
      return ['replacement:groupEntersUntapped'];
    case 'opponentsCantCast':
      return ['static:opponentsCantCastOnYourTurn'];
    case 'spellsCantBeCountered':
      return ['static:spellsCantBeCountered'];
    case 'keepsDamage':
      return ['static:keepsDamage'];
    case 'raw':
      return [];
  }
}

/** Whether the filter, or one of its `anyOf` members, compares power or toughness. */
function comparesPowerOrToughness(filter: ObjectFilter): boolean {
  return (
    filter.power !== undefined ||
    filter.toughness !== undefined ||
    (filter.anyOf?.some(comparesPowerOrToughness) ?? false)
  );
}

/** Whether the filter, or one of its `anyOf` members, reads combat or the turn: attacking, a source's damage, an announced X. */
function readsCombat(filter: ObjectFilter): boolean {
  return (
    filter.attacking === true ||
    filter.manaValueX === true ||
    filter.controllerDealtDamageBySource === true ||
    (filter.anyOf?.some(readsCombat) ?? false)
  );
}

/** "You have no maximum hand size." (CR 402.2). */
function lowerNoMaximum(ability: Static): LowerResult<readonly Ability[]> {
  const missing = missingFeatures(['ability:static', 'static:noMaximumHandSize']);
  if (missing.length > 0) return failure(ability, missing);
  return {
    ok: true,
    value: [{ kind: 'static', static: { kind: 'noMaximumHandSize' } }],
    rule: ability.rule,
  };
}

/**
 * "~ costs {1} less to cast for each creature on the battlefield." and "Artifact spells you cast
 * cost {1} less to cast." (CR 118.7a, 601.2f): the engine's `costReduction`. `~` is the spell's own
 * ability (`spells: { kind: 'this' }`, CR 113.6d); any other subject is the spells described, an
 * ability of the permanent it is on (CR 604.2), whose filter says what the spell is, not where it is.
 */
function lowerCostReduction(
  ability: Static,
  amount: Extract<IrStaticEffect, { kind: 'costReduction' }>['amount'],
  ctx: LowerContext,
): LowerResult<readonly Ability[]> {
  const { subject } = ability.statement;
  const missing = missingFeatures(['ability:static', 'static:costReduction']);
  if (missing.length > 0) return failure(ability, missing);
  const lowered = lowerAmount(amount, ctx, ability.rule);
  if (!lowered.ok) return lowered;
  let spells: Extract<StaticEffect, { kind: 'costReduction' }>['spells'];
  if (subject.det === 'self') {
    spells = { kind: 'this' };
  } else if (subject.det === 'each') {
    const filter = lowerFilter(subject);
    if (!filter.ok) return filter;
    spells = filter.value;
  } else {
    return failure(subject);
  }
  return {
    ok: true,
    value: [{ kind: 'static', static: { kind: 'costReduction', spells, amount: lowered.value } }],
    rule: ability.rule,
  };
}

/**
 * The kinds of static ability the engine reads a condition for (D-133): the ones that act in a layer (`modifyPt`,
 * `grantKeyword`, `grantAbility`), a restriction but not `cantBeCountered`, the attack tax and the cast from the graveyard.
 */
function takesCondition(effect: IrStaticEffect): boolean {
  switch (effect.kind) {
    case 'pt':
    case 'ptCount':
    case 'ptTimesAttacked':
    case 'grantKeyword':
    case 'grantProtection':
    case 'grantAbility':
    case 'attackTax':
    case 'castFromGraveyard':
    // Stage P34 (D-152, Celebration): the layers that change types, colors and base power and toughness read a condition that names no characteristic.
    case 'replaceTypes':
    case 'loseTypes':
    case 'addTypes':
    case 'basePt':
    case 'setColors':
      return true;
    case 'restriction':
      return effect.restriction !== 'cantBeCountered';
    default:
      return false;
  }
}

/** One subject with what it gets or has: one engine `static` ability for each effect, with the condition when there is one. */
function lowerPart(
  part: IrStaticPart,
  ability: Static,
  condition: Condition | undefined,
  ctx: LowerContext,
): LowerResult<readonly Ability[]> {
  // Stage P33 (D-150): a subject that names a keyword is read for keyword grants only (the engine's `grantKeyword`).
  const subject = subjectOf(
    part.subject,
    ctx,
    part.effects.every((e) => e.kind === 'grantKeyword' || e.kind === 'grantProtection'),
  );
  if (!subject.ok) return subject;
  // D-286 (CR 702.95b): "each of those creatures" is read for a granted ability (the Seraph's line) and only "as long as ~ is paired with another creature": the engine
  // would run a keyword or a +N/+N of the pair too, but those lines are not read yet (`docs/ROADMAP.md`), and without that condition nothing is ever paired.
  if (
    subject.value.kind === 'pair' &&
    (condition?.kind !== 'paired' || part.effects.some((e) => e.kind !== 'grantAbility'))
  ) {
    return failure(part.subject);
  }
  // D-111, CR 613.8: only a "+N/+N" effect (layer 7c) can name its subjects by power or toughness, which that layer
  // settles last, and a restriction, which is read where the rule acts, after the layers (D-133, "Each creature you
  // control with power 4 or greater can't be blocked by more than one creature"); a keyword or an ability granted in
  // layer 6 cannot, and `validateCard` would refuse it. Mana value is fixed by the card's characteristics and reads
  // everywhere.
  if (
    subject.value.kind === 'filter' &&
    comparesPowerOrToughness(subject.value.filter) &&
    part.effects.some((e) => e.kind !== 'pt' && e.kind !== 'ptCount' && e.kind !== 'restriction')
  ) {
    return failure(part.subject);
  }
  // "Attacking creatures you control have deathtouch" (stage P31): whether a creature attacks is the game's state, which a static
  // ability's subject does not read in the engine (`validateCard`), so the statement is read and not run.
  if (subject.value.kind === 'filter' && readsCombat(subject.value.filter))
    return failure(part.subject);
  const needs: FeatureRef[] = ['ability:static', `staticSubject:${subject.value.kind}`];
  if (subject.value.kind === 'filter' && namesKeyword(subject.value.filter)) {
    needs.push('selector:keywords');
  }
  for (const effect of part.effects) needs.push(...needsOf(effect));
  if (condition !== undefined) needs.push('ability:staticCondition');
  const missing = missingFeatures(needs);
  if (missing.length > 0) return failure(ability, missing);
  const abilities: Ability[] = [];
  for (const effect of part.effects) {
    if (condition !== undefined && !takesCondition(effect)) return failure(ability);
    const lowered = effectOf(effect, subject.value, ability, ctx);
    if (!lowered.ok) return lowered;
    abilities.push({
      kind: 'static',
      static: lowered.value,
      ...(condition === undefined ? {} : { condition }),
    });
  }
  return { ok: true, value: abilities, rule: ability.rule };
}

/**
 * "You and creatures you control have protection from the chosen card type." (Hashaton deck group 6, D-377, CR 702.16): the controller of the permanent has
 * protection (the engine's `playerProtection`) and each other subject of the statement (`also`) has the keyword. The controller is "you"; the statement has no
 * condition and the effect is the player's alone, so a statement of another shape is not lowered.
 */
function lowerPlayerProtection(
  ability: Static,
  ctx: LowerContext,
): LowerResult<readonly Ability[]> {
  const { statement } = ability;
  if (
    statement.effects.length !== 1 ||
    statement.subject.det !== 'you' ||
    statement.condition !== undefined
  ) {
    return failure(ability);
  }
  const blocked = missingFeatures(['ability:static', 'static:playerProtection']);
  if (blocked.length > 0) return failure(ability, blocked);
  const abilities: Ability[] = [
    { kind: 'static', static: { kind: 'playerProtection', from: 'chosenCardType' } },
  ];
  for (const part of statement.also ?? []) {
    const done = lowerPart(part, ability, undefined, ctx);
    if (!done.ok) return done;
    abilities.push(...done.value);
  }
  return { ok: true, value: abilities, rule: ability.rule };
}

/**
 * A static ability statement. It lowers only when the engine runs every effect and the subject:
 * the effects the grammar reads but the engine lacks (a granted ability in quotes) fail naming the
 * missing `static:` feature, and the statement is dropped whole. A statement that applies "as long as" a condition
 * (stage P29, D-133) gives every ability the condition, and says what the engine needs to read it; it may name more
 * than one subject ("~ gets +2/+2 and creatures you control have vigilance").
 */
export function lowerStatic(ability: Static, ctx: LowerContext): LowerResult<readonly Ability[]> {
  const lowered = lowerStaticStatement(ability, ctx);
  const { functionsIn } = ability.statement;
  if (!lowered.ok || functionsIn === undefined) return lowered;
  // "As long as this card is in your graveyard, ..." (stage P34, D-152, CR 113.6b): the abilities work from the graveyard (the engine allows
  // it for a grant of a keyword and a change of power and toughness of a group, `validateCard`).
  const blocked = missingFeatures(['ability:functionsInGraveyard']);
  if (blocked.length > 0) return failure(ability, blocked);
  return {
    ok: true,
    value: lowered.value.map((a): Ability => ({ ...a, functionsIn }) as Ability),
    rule: lowered.rule,
  };
}

function lowerStaticStatement(ability: Static, ctx: LowerContext): LowerResult<readonly Ability[]> {
  const { statement } = ability;
  const [first, ...more] = statement.effects;
  if (first === undefined) return failure(ability);
  // Stage P34 (D-152): mana that stays through steps and phases, casting spells from the top of the library.
  if (isDragonStatic(first)) return lowerDragonStatic(ability);
  // Stage P70 (D-232): "Once during each of your turns, you may play a land from your graveyard or cast ... from your graveyard."
  if (isGraveyardPlayStatic(first)) return lowerGraveyardPlayStatic(ability, ctx);
  // Stage P37 (D-180): lands that enter untapped, opponents that can't cast spells during your turn (with a condition, perhaps).
  if (isKorvoldStatic(first)) return lowerKorvoldStatic(ability, ctx);
  // Stage P43 (D-193): damage that stays through cleanup steps.
  if (isKeepsDamage(first)) return lowerKeepsDamage(ability);
  const parts: IrStaticPart[] = [
    { subject: statement.subject, effects: statement.effects },
    ...(statement.also ?? []),
  ];
  // Stage P67 (D-220, CR 603.2d): "If a triggered ability of a Shaman or another Wizard you control triggers, that ability triggers an additional time."
  if (first.kind === 'doubleTriggers') {
    if (more.length > 0 || statement.condition !== undefined || statement.also !== undefined) {
      return failure(ability);
    }
    const blocked = missingFeatures(['ability:static', 'static:doubleTriggers']);
    if (blocked.length > 0) return failure(ability, blocked);
    const subject = subjectOf(statement.subject, ctx);
    if (!subject.ok) return subject;
    if (subject.value.kind !== 'filter' && subject.value.kind !== 'attached')
      return failure(ability);
    // Stage P71 (D-339, CR 603.2d): "If you casting or copying an instant or sorcery spell causes a triggered ability of a permanent you control to trigger,
    // that ability triggers an additional time." The spell the cast or copy must name.
    if (first.cause !== undefined) {
      const spell = lowerFilter(first.cause);
      if (!spell.ok) return spell;
      return {
        ok: true,
        value: [
          {
            kind: 'static',
            static: {
              kind: 'doubleTriggers',
              subject: subject.value,
              cause: { kind: 'castOrCopySpell', spell: spell.value },
            },
          },
        ],
        rule: ability.rule,
      };
    }
    return {
      ok: true,
      value: [{ kind: 'static', static: { kind: 'doubleTriggers', subject: subject.value } }],
      rule: ability.rule,
    };
  }
  // Hashaton deck group 6 (D-377, CR 702.16): "You and creatures you control have protection from the chosen card type."
  if (first.kind === 'playerProtection') return lowerPlayerProtection(ability, ctx);
  // Stage P33 (D-150): the protections of a player, damage prevented to ~, a card that can't be cast early, permanents that enter with counters.
  if (isAngelStatic(first)) return lowerAngelStatic(ability, ctx);
  // "~ costs {3} less to cast if you control a creature with power 4 or greater." (stage P38, D-182, CR 601.2f): the spell's own reduction, with
  // a condition the engine reads as the total cost is determined (not by `derive`, so it may compare a power).
  if (first.kind === 'costReduction' && statement.condition !== undefined) {
    if (more.length > 0 || statement.subject.det !== 'self') return failure(ability);
    const lowered = lowerCondition(statement.condition, false, ctx);
    if (!lowered.ok) return lowered;
    const condition = lowered.value;
    const missing = missingFeatures(['ability:selfCostReducedIf']);
    if (missing.length > 0) return failure(ability, missing);
    const reduction = lowerCostReduction(ability, first.amount, ctx);
    if (!reduction.ok) return reduction;
    return {
      ok: true,
      value: reduction.value.map((a): Ability => ({ ...a, condition }) as Ability),
      rule: reduction.rule,
    };
  }
  if (statement.condition === undefined) {
    if (parts.length > 1) return failure(ability);
  } else {
    // The text is about this permanent: "it" in "as long as it's untapped" is `~` (CR 611.3a).
    // D-287: this is the one condition `paired` is read in (`lowerCondition`).
    ctx.staticCondition = true;
    ctx.staticSubjectIsSelf = parts.every((part) => part.subject.det === 'self');
    const lowered = lowerCondition(statement.condition, true, ctx);
    ctx.staticCondition = false;
    ctx.staticSubjectIsSelf = false;
    if (!lowered.ok) return lowered;
    const condition = lowered.value;
    // D-133, CR 613.8: the condition of a static ability is read where no layer 7 effect changes it, so it names no
    // keyword (layer 6) and no power or toughness.
    if (conditionNamesLayerValue(condition)) return failure(ability);
    const missing = missingFeatures(['ability:staticCondition']);
    if (missing.length > 0) return failure(ability, missing);
    const abilities: Ability[] = [];
    for (const part of parts) {
      // The play rules that take a condition: the attack tax, read where the attack is declared.
      const [only] = part.effects;
      if (only !== undefined && isPlayRule(only)) {
        if (part.effects.length > 1 || only.kind !== 'attackTax') return failure(ability);
        const lowered = lowerPlayRule(ability, only);
        if (!lowered.ok) return lowered;
        abilities.push(...lowered.value.map((a): Ability => ({ ...a, condition }) as Ability));
        continue;
      }
      const done = lowerPart(part, ability, condition, ctx);
      if (!done.ok) return done;
      abilities.push(...done.value);
    }
    return { ok: true, value: abilities, rule: ability.rule };
  }
  if (first.kind === 'costReduction') {
    if (more.length > 0) return failure(ability);
    return lowerCostReduction(ability, first.amount, ctx);
  }
  if (first.kind === 'additionalCost' || first.kind === 'freeCast') return failure(ability);
  if (
    first.kind === 'castAsThoughFlash' ||
    first.kind === 'takeFromLinkedExile' ||
    first.kind === 'opponentsCantCastSpells'
  ) {
    if (more.length > 0) return failure(ability);
    return lowerOwnStatic(ability, first);
  }
  if (first.kind === 'noMaxHandSize') {
    if (more.length > 0 || statement.subject.det !== 'you') return failure(ability);
    return lowerNoMaximum(ability);
  }
  if (isPlayRule(first)) {
    // Stage P24, D-125: a statement of one effect whose subject is the rule's own (a player, `~`, creatures).
    if (more.length > 0) return failure(ability);
    return lowerPlayRule(ability, first);
  }
  return lowerPart(parts[0] as IrStaticPart, ability, undefined, ctx);
}

/**
 * "You may cast artifact spells as though they had flash." (stage P31, D-140, CR 601.3b): the controller's permission, the spells named
 * as they are cast (their card types, colors, ...; `controller: 'you'`, the permission is the controller's). "As long as a card exiled
 * with ~ is a creature card, ~ has the power, toughness, and creature types of the last creature card exiled with it." (CR 607.2a): the
 * permanent's own, reading what its linked ability exiled (the face's exile is marked `linked` by `parseFaceText`).
 */
function lowerOwnStatic(
  ability: Static,
  effect: Extract<
    IrStaticEffect,
    { kind: 'castAsThoughFlash' | 'takeFromLinkedExile' | 'opponentsCantCastSpells' }
  >,
): LowerResult<readonly Ability[]> {
  const { subject } = ability.statement;
  const missing = missingFeatures(['ability:static', ...needsOf(effect)]);
  if (missing.length > 0) return failure(ability, missing);
  const noun = (filter: IrNoun['filter']): IrNoun => ({
    kind: 'noun',
    det: 'a',
    filter,
    upTo: false,
    plural: false,
    other: false,
    span: ability.span,
    rule: ability.rule,
  });
  if (effect.kind === 'opponentsCantCastSpells') {
    // D-282: "Your opponents can't cast spells with mana value 3 or less": the engine reads the filter against the spell on the stack, so it names no zone.
    if (subject.det !== 'you' || ability.statement.condition !== undefined) return failure(ability);
    const { zone, stackKind, ...described } = effect.spells;
    void zone;
    void stackKind;
    const spells = lowerFilter(noun(described));
    if (!spells.ok) return spells;
    return {
      ok: true,
      value: [
        { kind: 'static', static: { kind: 'opponentsCantCastSpells', spells: spells.value } },
      ],
      rule: ability.rule,
    };
  }
  if (effect.kind === 'castAsThoughFlash') {
    if (subject.det !== 'you') return failure(ability);
    const { zone, stackKind, ...described } = effect.spells;
    void zone;
    void stackKind;
    const spells = lowerFilter(noun(described));
    if (!spells.ok) return spells;
    return {
      ok: true,
      value: [
        {
          kind: 'static',
          static: { kind: 'castAsThoughFlash', spells: { ...spells.value, controller: 'you' } },
        },
      ],
      rule: ability.rule,
    };
  }
  if (subject.det !== 'self') return failure(ability);
  const from = lowerFilter(noun(effect.from));
  if (!from.ok) return from;
  return {
    ok: true,
    value: [
      {
        kind: 'static',
        static: {
          kind: 'takeFromLinkedExile',
          subject: { kind: 'this' },
          from: from.value,
          ...(effect.alsoSubtypes.length > 0 ? { alsoSubtypes: [...effect.alsoSubtypes] } : {}),
        },
      },
    ],
    rule: ability.rule,
  };
}

/** Features the static lowerings can name, for the dimension test. */
export const STATIC_NEEDS: readonly FeatureRef[] = [
  'ability:static',
  'static:noMaximumHandSize',
  'static:modifyPt',
  'static:characteristicPt',
  'static:grantKeyword',
  'static:grantAbility',
  'static:restriction',
  'static:costReduction',
  'static:setTypes',
  'static:loseTypes',
  'static:castFromGraveyard',
  'static:cantBeBlockedBy',
  'static:setPt',
  'static:castAsThoughFlash',
  'static:opponentsCantCastSpells',
  'static:takeFromLinkedExile',
  'static:restrictionUnless',
  'static:loseAllAbilities',
  'static:setColors',
  'static:unspentManaStays',
  'static:castFromTopOfLibrary',
  'static:playFromGraveyardOnceEachTurn',
  // Hashaton deck group 6 (D-377, CR 702.16): "You have protection from the chosen card type."
  'static:playerProtection',
  'static:cantHaveCounters',
  'ability:functionsInGraveyard',
  'ability:staticCondition',
  'staticSubject:this',
  'staticSubject:attached',
  'staticSubject:filter',
  'staticSubject:pair',
  ...PLAY_RULE_NEEDS,
];
