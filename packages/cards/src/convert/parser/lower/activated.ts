/**
 * Activated abilities (CR 602) and mana abilities (CR 605). An activated ability is
 * "[costs]: [effect]. [Activate only ...]"; one whose effect is only adding mana, with no target,
 * is a mana ability and never uses the stack (CR 605.1a), whatever else its costs are.
 *
 * A mana ability the engine cannot represent is reported "recognised, not runnable" and is never
 * lowered as an ordinary activated ability: that would put the mana on the stack, which is not
 * what the card does. The engine's mana ability has `also` effects of three kinds, costs of `{T}`,
 * at most one mana cost (hybrid symbols allowed, CR 107.4e), at most one payment of life and one
 * sacrifice of itself (at least `{T}` or the sacrifice), and, since stage P14, a restriction "Activate
 * only if <condition>" (CR 602.5b); anything else (`{T}: Add {G}. Draw a card.`) says which
 * `manaAlso:` or `manaCost:` feature is missing, or is dropped whole with no feature named.
 */
import {
  type Ability,
  type Amount,
  CARD_TYPES,
  type CardType,
  type Color,
  type Condition,
  type Cost,
  type Effect,
  type ManaAbility,
  type ManaProduction,
  OUTLAW_CREATURE_TYPES,
} from '@commander-arena/engine';
import type {
  IrAbility,
  IrAmount,
  IrClause,
  IrFilter,
  IrModes,
  IrQuotedAbility,
} from '../ir/types';
import { lowerAmount } from './amounts';
import { amountArg } from './clauses';
import { lowerCondition } from './conditions';
import { lowerCost } from './costs';
import { lowerClause, lowerMana } from './effects';
import { type FeatureRef, missingFeatures } from './features';
import { lowerModes, MODAL_NEEDS, NO_EFFECT } from './modal';
import { colorLetter, lowerFilter } from './nouns';
import { kindOfNoun, lowerDelayedCast, lowerSentences } from './sentences';
import { type LowerContext, type LowerFailure, type LowerResult, newContext } from './types';

type Activated = Extract<IrAbility, { kind: 'activated' }>;
type At = { readonly span: { start: number; end: number }; readonly rule: string };

function failure(node: At, needs: readonly FeatureRef[] = []): LowerFailure {
  return { ok: false, needs, at: node.span, rule: node.rule };
}

/** Fails at `node` naming the missing features, or null when the engine runs all of them. */
function gate(node: At, needs: readonly FeatureRef[]): LowerFailure | null {
  const missing = missingFeatures(needs);
  return missing.length > 0 ? failure(node, missing) : null;
}

/** What a mana ability may do besides adding mana (CR 605.1a): damage or life change to you. */
type Also = Extract<Effect, { kind: 'dealDamage' | 'loseLife' | 'gainLife' }>;

function isAlso(effect: Effect): effect is Also {
  switch (effect.kind) {
    case 'dealDamage':
      return effect.to.kind === 'you';
    case 'loseLife':
    case 'gainLife':
      return effect.player.kind === 'you';
    default:
      return false;
  }
}

const plainClause = (clause: IrClause) =>
  !clause.optional && clause.condition === undefined && clause.duration === undefined;

/**
 * "Spend this mana only to cast an Angel spell." (stage P33, D-150, CR 106.6): the engine's `spendOnly` of a mana ability, the card types and
 * the creature types of the spells its mana can pay for (a spell must be of one of each kind that is listed). The words name types alone: a
 * color, a quality or a mix of the two kinds in one choice says more than the engine's restriction and is not lowered.
 */
function spendOnlyOf(clause: IrClause): ManaAbility['spendOnly'] | null {
  // "Spend this mana only to cast monocolored spells of that color." (issue 144, Throne of Eldraine, CR 106.6, 105.2a): the color the permanent chose; the caller checks the mana is of it.
  const mono = clause.args.monocoloredChosen;
  if (mono?.kind === 'flag' && mono.value) {
    return plainClause(clause) ? { monocoloredChosen: true } : null;
  }
  // "This mana can't be spent to pay generic mana costs." (Jegantha, the Wellspring, CR 106.6).
  const notGeneric = clause.args.notGeneric;
  if (notGeneric?.kind === 'flag' && notGeneric.value) {
    return plainClause(clause) ? { notGeneric: true } : null;
  }
  // "Spend this mana only to turn permanents face up." (Overgrown Zealot, CR 106.6, 701.40b).
  const turnFaceUp = clause.args.turnFaceUp;
  if (turnFaceUp?.kind === 'flag' && turnFaceUp.value) {
    return plainClause(clause) ? { turnFaceUp: true } : null;
  }
  // "Spend this mana only to cast a spell from your graveyard." (issue 102, Lord of the Forsaken, CR 106.6, 601.2a).
  const fromGraveyard = clause.args.fromGraveyard;
  if (fromGraveyard?.kind === 'flag' && fromGraveyard.value) {
    return plainClause(clause) ? { fromGraveyard: true } : null;
  }
  // "Spend this mana only to cast spells you don't own." (Thieving Varmint, CR 106.6, 108.3).
  const notOwned = clause.args.notOwned;
  if (notOwned?.kind === 'flag' && notOwned.value) {
    return plainClause(clause) ? { notOwned: true } : null;
  }
  // "Spend this mana only on costs that contain {X}." (Quandrix Unlimited group E, CR 106.6, 107.3).
  const xCost = clause.args.xCost;
  if (xCost?.kind === 'flag' && xCost.value) return plainClause(clause) ? { xCost: true } : null;
  // "Spend this mana only to activate abilities." (issue 345, CR 106.6).
  const abilitiesOnly = clause.args.abilitiesOnly;
  if (abilitiesOnly?.kind === 'flag' && abilitiesOnly.value) {
    return plainClause(clause) ? { abilitiesOnly: true } : null;
  }
  // "Spend this mana only to cast spells with mana value 5 or greater or spells with {X} in their mana costs." (CR 106.6, 202.3, 107.3): the spell has at least one of the qualities.
  const atLeast = clause.args.manaValueAtLeast;
  const hasX = clause.args.hasX;
  if (atLeast !== undefined || hasX !== undefined) {
    if (!plainClause(clause) || clause.args.spells !== undefined) return null;
    if (atLeast !== undefined && (atLeast.kind !== 'number' || atLeast.value < 1)) return null;
    if (hasX !== undefined && !(hasX.kind === 'flag' && hasX.value)) return null;
    return {
      qualities: [
        ...(atLeast?.kind === 'number'
          ? [{ kind: 'manaValueAtLeast' as const, value: atLeast.value }]
          : []),
        ...(hasX === undefined ? [] : [{ kind: 'hasX' as const }]),
      ],
    };
  }
  const spells = clause.args.spells;
  if (spells?.kind !== 'noun' || !plainClause(clause)) return null;
  const kinds = spellKindsOf(spells.filter, true);
  if (kinds === null) return null;
  // "Spend this mana only to cast Dragon spells or activate abilities of Dragons." (stage P34, D-152): the abilities of the permanents that
  // are of the kinds the spells are (the engine's `alsoAbilities`), which the text says by naming the same kind.
  const abilities = clause.args.alsoAbilities;
  // Issue 151 (Secluded Courtyard): "or activate an ability of a creature source of the chosen type": the abilities of the creatures of the chosen type.
  return {
    ...kinds,
    ...(abilities?.kind === 'flag' && abilities.value ? { alsoAbilities: true as const } : {}),
  };
}

/**
 * The card types and the creature types a noun of spells names (stage P33, D-150): a choice of types or a choice of creature types, never a
 * mix of the two, and nothing else (a color or a quality says more than the engine's restriction and its rider). Null when the words say more.
 */
function spellKindsOf(
  filter: IrFilter,
  allowMix = false,
): { types?: CardType[]; subtypes?: string[]; chosenType?: true; typesOrSubtypes?: true } | null {
  const known = new Set(['types', 'subtypes', 'anyOf', 'zone', 'stackKind', 'raw', 'chosen']);
  // CR 700.12 (Discreet Retreat): "outlaw spells" are the spells of at least one of the five outlaw creature types, which is the engine's list of creature types.
  if (filter.outlaw === true) {
    const { outlaw: _outlaw, ...rest } = filter;
    if (
      Object.keys(rest).some((key) => !['zone', 'stackKind', 'raw'].includes(key)) ||
      filter.types !== undefined
    ) {
      return null;
    }
    return { subtypes: [...OUTLAW_CREATURE_TYPES] };
  }
  if (Object.keys(filter).some((key) => !known.has(key))) return null;
  // Issue 199 (CR 106.6, 607.2d): "a creature spell of the chosen type": the card types, and the creature type the permanent chose as it entered; not with named creature types.
  if (filter.chosen === 'type') {
    const only = filter.types ?? [];
    if (only.length === 0 || filter.subtypes !== undefined || filter.anyOf !== undefined)
      return null;
    if (!only.every((t) => (CARD_TYPES as readonly string[]).includes(t))) return null;
    return { types: only as CardType[], chosenType: true };
  }
  const types = [...(filter.types ?? [])];
  const subtypes = [...(filter.subtypes ?? [])];
  const members = filter.anyOf ?? [];
  const memberTypes = members.filter((m) => m.types !== undefined);
  const memberSubtypes = members.filter((m) => m.subtypes !== undefined);
  // A choice of types or a choice of creature types, never a mix of the two ("artifact or Angel spells" is neither of the engine's two lists), unless the caller reads a mix as the
  // engine's `typesOrSubtypes` (Séance Board, CR 106.6: a spell of one of the card types or of one of the creature types).
  const mixed = memberTypes.length > 0 && memberSubtypes.length > 0;
  if (mixed && !allowMix) return null;
  for (const member of members) {
    if (Object.keys(member).some((key) => !['types', 'subtypes', 'raw'].includes(key))) return null;
    types.push(...(member.types ?? []));
    subtypes.push(...(member.subtypes ?? []));
  }
  if (types.length === 0 && subtypes.length === 0) return null;
  if (!types.every((t) => (CARD_TYPES as readonly string[]).includes(t))) return null;
  return {
    ...(types.length > 0 ? { types: types as CardType[] } : {}),
    ...(subtypes.length > 0 ? { subtypes } : {}),
    ...(mixed ? { typesOrSubtypes: true as const } : {}),
  };
}

/**
 * "If that mana is spent on a Dragon creature spell, it gains haste until end of turn." (stage P34, D-152, CR 106.6, 702.10): the engine's
 * `spentRider` of a mana ability, the spell that mana is spent on having at least one of the card types and one of the creature types.
 */
function spentRiderOf(clause: IrClause): ManaAbility['spentRider'] | null {
  // "When you spend this mana to cast your commander, scry X, where X is the number of times it's been cast from the command zone this game" (stage P68,
  // D-229, CR 903.8): the spells are the caster's commanders and the scry is as many as the times that commander was cast from the command zone.
  const byCommander = clause.args.commanderCastScry;
  if (byCommander?.kind === 'flag' && byCommander.value) {
    if (!plainClause(clause)) return null;
    return { spells: { commander: true }, grants: { scryCommanderCasts: true } };
  }
  // "If you spend this mana to cast your commander, it enters with a number of additional +1/+1 counters on it equal to the number of times it's been cast from the command
  // zone this game" (issue 241, CR 122.6, 903.8): the spells are the caster's commanders and the commander enters with that many more counters.
  const counters = clause.args.commanderCastCounters;
  if (counters?.kind === 'flag' && counters.value) {
    if (!plainClause(clause)) return null;
    return { spells: { commander: true }, grants: { countersCommanderCasts: true } };
  }
  const spells = clause.args.spells;
  if (spells?.kind !== 'noun' || !plainClause(clause)) return null;
  // "When that mana is spent to cast a red instant or sorcery spell, copy that spell and you may choose new targets for the copy." (D-328, CR 707.10, 707.10c):
  // the spell is of one color (or any) and of a card type, and the rider copies it.
  const copy = clause.args.copy;
  if (copy?.kind === 'flag' && copy.value) {
    const { colors: words, ...rest } = spells.filter;
    const colors = (words ?? []).map((w) => colorLetter(w));
    if (colors.some((c) => c === undefined)) return null;
    const shape = spellKindsOf(rest);
    if (shape === null) return null;
    const newTargets = clause.args.newTargets;
    return {
      spells: {
        ...shape,
        ...(colors.length === 0 ? {} : { colors: colors as Color[] }),
      },
      grants: { copySpell: newTargets?.kind === 'flag' && newTargets.value ? 'may' : 'no' },
    };
  }
  // "When you spend this mana to cast an instant or sorcery spell with mana value 3 or less, you may exile that spell instead of putting it into its owner's graveyard as it resolves."
  // (issue 121, Forger's Foundry, CR 607.2a): the spells are of a card type and have a mana value no more than the number, and the rider exiles the spell with the permanent.
  const exile = clause.args.exileLinked;
  if (exile?.kind === 'flag' && exile.value) {
    const limit = clause.args.manaValueAtMost;
    const shape = spellKindsOf(spells.filter);
    if (shape === null || limit?.kind !== 'number') return null;
    return {
      spells: { ...shape, manaValueAtMost: limit.value },
      grants: { exileLinked: true },
    };
  }
  const kinds = spellKindsOf(spells.filter);
  if (kinds === null) return null;
  // "When that mana is spent to cast a creature spell that shares a creature type with your commander, scry 1." (group 4 of the Vraska deck): the
  // rider is a scry, and the spells are the ones that share a creature type with the commander.
  const scry = clause.args.scry;
  if (scry === undefined) return { spells: kinds, grants: 'haste' };
  if (scry.kind !== 'number') return null;
  const shares = clause.args.sharesCreatureTypeWithCommander;
  return {
    spells: {
      ...kinds,
      ...(shares?.kind === 'flag' && shares.value
        ? { sharesTypeWithCommander: true as const }
        : {}),
    },
    grants: { scry: scry.value },
  };
}

/**
 * The costs of an ability, lowered in text order; the first that cannot be lowered stops it. A
 * hybrid mana symbol is lowered in a mana ability (stage P14) and in an ordinary activation (stage
 * P15: the engine's planner pays it the same way there, with the pool and the sources that cost
 * nothing, CR 107.4e); a keyword's cost (Cycling, Equip) has none. An {X} or "pay X life" is
 * lowered only where `x` is set, which is the cost of an ordinary activation (stage P16, D-103): a
 * mana ability with X is not something the engine runs.
 */
function lowerCosts(ability: Activated, x = false): LowerResult<Cost[]> {
  const costs: Cost[] = [];
  for (const ir of ability.costs) {
    const lowered = lowerCost(ir, { hybrid: true, x, ordinary: x, mana: !x });
    if (!lowered.ok) return lowered;
    costs.push(lowered.value);
  }
  return { ok: true, value: costs, rule: ability.rule };
}

/**
 * The mana ability shape (CR 605.1a): a first sentence that is only "Add ...", costs of one {T}
 * and/or one sacrifice of the permanent itself, with at most one mana cost, and after the mana only
 * damage to you or a change of your life total, which the engine runs in the same activation
 * (`also`). A target after the mana makes it an ordinary activated ability (null: not this
 * shape). Anything else the engine cannot represent is reported with what is missing, never built.
 */
function lowerManaAbility(
  ability: Activated,
  clauses: readonly IrClause[],
  faceTypes: readonly string[],
  /** The sentence "Choose a color." came before (`lowerChosenColorDevotion`): the only place "that color" has a color to name. */
  colorChosen = false,
): LowerResult<readonly Ability[]> | null {
  const [add, ...afterAdd] = clauses;
  // Issue 345 (Soulbright Flamekin, CR 605.1a): an ability whose first instruction is not "Add ..." is not the mana ability shape, whatever a later instruction (a conditional "add") does.
  if (add?.verb !== 'addMana') return null;
  const spec = add?.args.mana;
  if (
    spec?.kind === 'manaSpec' &&
    (spec.what.kind === 'devotionToChosenColor' || spec.what.kind === 'thatColor') &&
    !colorChosen
  ) {
    return failure(ability);
  }
  // "Spend this mana only to cast an Angel spell." (stage P33, D-150): a sentence about the mana, not an instruction.
  const spendClauses = afterAdd.filter((c) => c.verb === 'spendOnly');
  const riderClauses = afterAdd.filter((c) => c.verb === 'spentRider');
  const rest = afterAdd.filter((c) => c.verb !== 'spendOnly' && c.verb !== 'spentRider');
  if (riderClauses.length > 1) return failure(ability);
  const [riderClause] = riderClauses;
  const spentRider = riderClause === undefined ? undefined : spentRiderOf(riderClause);
  if (riderClause !== undefined && spentRider === null) return failure(riderClause);
  if (spendClauses.length > 1) return failure(ability);
  const [spendClause] = spendClauses;
  const spendOnly = spendClause === undefined ? undefined : spendOnlyOf(spendClause);
  if (spendClause !== undefined && spendOnly === null) return failure(spendClause);
  // A definition of X after the mana would be dropped by this reading, so it is not read (stage P28). Neither is a test on a
  // sentence (stage P32): "If you control a Dragon, add {R}" is not "Add {G}", and only `lowerManaInstead` reads the one that says "instead".
  // "Add X mana of any one color, where X is this creature's power." (CR 107.3c): the one definition of X a mana ability of one sentence may have, read by that production.
  const defines =
    spec?.kind === 'manaSpec' &&
    (spec.what.kind === 'anyOneColorX' || spec.what.kind === 'anyCombinationX');
  // Issue 345 (Redshift): the sentence of the mana is the first, and later sentences ("Spend this mana only to activate abilities.") define nothing.
  const whereOf = ability.body.sentences[0]?.where;
  const laterWhere = ability.body.sentences.slice(1).some((s) => s.where !== undefined);
  if (
    ability.body.sentences.some((s) => s.where !== undefined) &&
    !(defines && whereOf && !laterWhere)
  ) {
    return failure(ability);
  }
  // CR 107.3, 605.3b (Hazel of the Rootbloom): "Tap X untapped tokens you control: Add X mana in any combination of colors": X is what the cost taps, so no ", where X is" defines it
  // (and with one, the mana would count two Xs: not read).
  const tapsX = ability.costs.some((c) => c.kind === 'tapPermanentsX');
  const xFromCost =
    tapsX &&
    spec?.kind === 'manaSpec' &&
    spec.what.kind === 'anyCombinationX' &&
    whereOf === undefined;
  if (tapsX && !xFromCost) return failure(ability);
  if (defines && whereOf === undefined && !xFromCost) return failure(ability);
  if (ability.body.sentences.some((s) => s.condition !== undefined || s.instead === true)) {
    return failure(ability);
  }
  // D-487 (CR 605.1a): mana added by a later instruction of an ability with a target ("Any number of target players each lose 2 life. You add {B}{B}.") is not a mana
  // ability: the ordinary reading runs it through the stack, and refuses mana added where nothing is targeted (`lowerOrdinary`).
  if (spec?.kind !== 'manaSpec' || !plainClause(add)) {
    return failure(ability);
  }
  // A trial context: a target found here means this is not a mana ability, and must not leak.
  const trial = newContext('ability', faceTypes);
  const effects: Effect[] = [];
  for (const clause of rest) {
    const lowered = lowerClause(clause, trial);
    if (!lowered.ok) return lowered;
    effects.push(...lowered.value);
  }
  if (trial.targets.length > 0) return null;
  // An X in a mana ability (CR 605.1a) has nothing to read it from: X is announced for a spell or
  // an activation on the stack (CR 107.3a), and a mana ability never uses the stack.
  if (trial.usesX) return failure(ability);
  const costs = lowerCosts(ability);
  if (!costs.ok) return costs;
  // "Activate only once each turn." (CR 602.5b) is the one timing a mana ability has (no "as a sorcery": CR 605.3a).
  const restrictions = restrictionsOf(ability, false, true);
  if (!restrictions.ok) return restrictions;
  // CR 106.1b, 605.3b: the count of mana of the one color chosen as the ability resolves, from the "for each" of the sentence or from the X its ", where X is" defines.
  let production: ManaProduction;
  if (xFromCost) {
    production = { kind: 'anyCombinationTapped' };
  } else if (
    spec.what.kind === 'thatColor' ||
    spec.what.kind === 'anyOneColorX' ||
    spec.what.kind === 'anyCombinationX'
  ) {
    const counted = spec.what.kind === 'thatColor' ? add.args.times : whereOf;
    if (counted === undefined || counted.kind === 'flag') return failure(ability);
    const amount = lowerAmount(counted as IrAmount, trial, spec.rule);
    if (!amount.ok) return amount;
    // The amount is counted before the costs are paid, so no cost may change what it reads (CR 605.3a, 605.3b). The one exception: giving up the permanent itself when the amount counts
    // the counters on it (Glittering Stockpile), which the sacrifice leaves as they were (CR 113.7a, last-known information).
    const ownCounters =
      amount.value !== null &&
      typeof amount.value === 'object' &&
      amount.value.kind === 'countersOn' &&
      amount.value.of.kind === 'this';
    if (
      costs.value.some(
        (c) =>
          (c.kind === 'sacrifice' &&
            !(ownCounters && 'kind' in c.what && c.what.kind === 'this')) ||
          c.kind === 'removeCounters' ||
          c.kind === 'putCounters',
      )
    ) {
      return failure(ability);
    }
    production =
      spec.what.kind === 'anyCombinationX'
        ? { kind: 'anyCombinationAmount', amount: amount.value }
        : { kind: 'anyColorAmount', amount: amount.value };
  } else if (spec.what.kind === 'colorsAmongCards') {
    // "Add one mana of any color among legendary creature cards in your graveyard." (CR 106.1b, 105.2, 605.3b): the colors the cards have between them, read as the ability is
    // activated. Cards of a zone outside the battlefield and the library (hidden information) only.
    const zone = spec.what.of.filter.zone;
    if (zone === undefined || zone === 'battlefield' || zone === 'library') return failure(ability);
    const cards = lowerFilter(spec.what.of);
    if (!cards.ok) return cards;
    // The colors are read before the costs are paid, so a cost that gives up a permanent could change them (`validateCard` refuses it too).
    if (costs.value.some((c) => c.kind === 'sacrifice')) return failure(ability);
    production = { kind: 'anyColorAmong', filter: cards.value };
  } else {
    const plain = lowerMana(spec);
    if (plain === null) return failure(ability);
    production = plain;
  }
  // "Add {C} for each charge counter on ~." (Quandrix Unlimited group E), "Add {U} for each artifact you control." (Uthros, Titanic Godcore; CR 605.1a, 106.1): the fixed mana as many
  // times as the amount says, read as the ability is activated. An amount that is not a state amount (X, a target) has nothing to read it from, and a cost that gives up a permanent or
  // takes counters off could change the count: neither is read (`validateCard` refuses them too).
  const countsOwnCounters = add.args.times !== undefined && production.kind === 'fixed';
  if (countsOwnCounters && production.kind === 'fixed') {
    const times = amountArg(add, 'times', trial);
    if (!times.ok) return times;
    if (
      trial.usesX ||
      costs.value.some(
        (c) => c.kind === 'sacrifice' || c.kind === 'removeCounters' || c.kind === 'putCounters',
      )
    ) {
      return failure(ability);
    }
    production = { ...production, times: times.value };
  }
  // A "for each" the production does not read would be dropped by this reading, so it is not read.
  if (
    add.args.times !== undefined &&
    production.kind !== 'fixed' &&
    production.kind !== 'anyColorAmount'
  ) {
    return failure(ability);
  }
  // Issue 144: "that color" of "monocolored spells of that color" is the chosen color, so the mana the ability adds must be of it.
  if (spendOnly?.monocoloredChosen === true && production.kind !== 'chosenColor') {
    return failure(spendClause ?? ability);
  }
  const needs: FeatureRef[] = [
    'ability:mana',
    ...(countsOwnCounters ? (['ability:manaCountOwnCounters'] as const) : []),
    ...(spendOnly?.xCost === true ? (['ability:manaSpendOnlyXCost'] as const) : []),
    ...(spendOnly?.abilitiesOnly === true ? (['ability:manaSpendOnlyAbilities'] as const) : []),
    ...(spendOnly?.notGeneric === true ? (['ability:manaSpendOnlyNotGeneric'] as const) : []),
    ...(spendOnly?.typesOrSubtypes === true
      ? (['ability:manaSpendOnlyTypesOrSubtypes'] as const)
      : []),
    ...costs.value.map((c): FeatureRef => `manaCost:${c.kind}`),
    'effect:addMana',
    `manaProduction:${production.kind}`,
    ...effects.map((e): FeatureRef => `manaAlso:${e.kind}`),
    ...(spendClause === undefined ? [] : (['ability:manaSpendOnly'] as const)),
    ...(restrictions.value.oncePerTurn === true ? (['ability:oncePerTurn'] as const) : []),
    ...(spendOnly?.chosenType === true ? (['ability:manaSpendOnlyChosenType'] as const) : []),
    ...(spendOnly?.monocoloredChosen === true
      ? (['ability:manaSpendOnlyMonocolored'] as const)
      : []),
    ...(spendOnly?.fromGraveyard === true ? (['ability:manaSpendOnlyFromGraveyard'] as const) : []),
    ...(spendOnly?.notOwned === true ? (['ability:manaSpendOnlyNotOwned'] as const) : []),
    ...(spendOnly?.turnFaceUp === true ? (['ability:manaSpendOnlyTurnFaceUp'] as const) : []),
    ...(riderClause === undefined ? [] : (['ability:manaSpentRider'] as const)),
    // D-328: the rider copies the spell the mana is spent on.
    ...(spentRider !== undefined &&
    spentRider !== null &&
    typeof spentRider.grants === 'object' &&
    'copySpell' in spentRider.grants
      ? (['ability:manaSpentRiderCopy'] as const)
      : []),
    ...(spentRider !== undefined &&
    spentRider !== null &&
    typeof spentRider.grants === 'object' &&
    'countersCommanderCasts' in spentRider.grants
      ? (['ability:manaSpentRiderCounters'] as const)
      : []),
    ...(spentRider !== undefined &&
    spentRider !== null &&
    typeof spentRider.grants === 'object' &&
    'exileLinked' in spentRider.grants
      ? (['ability:manaSpentRiderExile'] as const)
      : []),
    ...(production.kind === 'anyCombination' && production.distinct === true
      ? (['ability:manaDistinctColors'] as const)
      : []),
    ...(production.kind === 'anyCombination' && production.colors !== undefined
      ? (['ability:manaColorSubset'] as const)
      : []),
  ];
  const blocked = gate(ability, needs);
  if (blocked !== null) return blocked;
  const taps = costs.value.filter((c) => c.kind === 'tap').length;
  const manas = costs.value.filter((c) => c.kind === 'mana').length;
  const lives = costs.value.filter((c) => c.kind === 'payLife').length;
  const mills = costs.value.filter((c) => c.kind === 'mill').length;
  // Issue 105 (Aether Hub, CR 107.14): "Pay {E}", one such cost.
  const energies = costs.value.filter((c) => c.kind === 'energy').length;
  // Issue 245 (Vivid Grove): "Remove a charge counter from ~", one such cost of the permanent itself.
  const removals = costs.value.filter((c) => c.kind === 'removeCounters').length;
  // CR 118.3, 122.1 (Wall of Roots): "Put a -0/-1 counter on ~", one such cost, the permanent itself; it pays for the ability like a counter taken off it.
  const additions = costs.value.filter((c) => c.kind === 'putCounters').length;
  // Issue 144 (Arena of Glory, CR 701.43a): "Exert ~", the permanent itself, once.
  const exerts = costs.value.filter((c) => c.kind === 'exert').length;
  const sacrifices = costs.value.filter((c) => c.kind === 'sacrifice');
  // D-625 (CR 118.3, 605.3b): "Tap an untapped creature you control" once, chosen as the ability is activated; never together with a sacrifice (two choices to name).
  const tapsOther = costs.value.filter((c) => c.kind === 'tapPermanents');
  // CR 107.3 (Hazel of the Rootbloom): "Tap X untapped tokens you control", once, paired with the production of X mana in any combination of colors.
  const tapsXs = costs.value.filter((c) => c.kind === 'tapPermanentsX');
  // CR 605.3b, 701.21a (stage P63, D-216): the permanent itself ("Sacrifice this artifact: Add ...") or one of a kind the controller has ("Sacrifice a Spirit:
  // Add {R}."), one only: the engine chooses it as the ability is activated, or the payment names it.
  const selfOnly = sacrifices.every((c) => c.kind === 'sacrifice' && c.count === undefined);
  // `{T}`, the sacrifice of itself or a counter taken off it pays for it (a Treasure, a Gold token with no `{T}`, or "Remove a charge counter from ~": Mana Bloom).
  const shaped =
    taps <= 1 &&
    (taps === 1 ||
      sacrifices.length === 1 ||
      removals === 1 ||
      additions === 1 ||
      lives === 1 ||
      energies === 1 ||
      // Relic of Legends (CR 605.3b): "Tap an untapped legendary creature you control: Add one mana of any color." needs no {T} of its own.
      tapsOther.length === 1 ||
      tapsXs.length === 1) &&
    manas <= 1 &&
    lives <= 1 &&
    mills <= 1 &&
    energies <= 1 &&
    removals <= 1 &&
    additions <= 1 &&
    exerts <= 1 &&
    sacrifices.length <= 1 &&
    tapsOther.length <= 1 &&
    tapsXs.length <= 1 &&
    (tapsOther.length === 0 ||
      (sacrifices.length === 0 && tapsOther.every((c) => c.count === 1))) &&
    (tapsXs.length === 0 || (sacrifices.length === 0 && tapsOther.length === 0)) &&
    selfOnly &&
    taps +
      manas +
      lives +
      mills +
      energies +
      removals +
      additions +
      exerts +
      sacrifices.length +
      tapsOther.length +
      tapsXs.length ===
      costs.value.length &&
    effects.every(isAlso) &&
    rest.every(plainClause);
  if (!shaped) return failure(ability);
  // CR 700.5 (Devotion), 605.3b: devotion is read as the ability is activated, before its costs are paid, so a cost that can take a permanent off the battlefield
  // (a sacrifice) would leave the permanent's own symbols counted, where the ability resolves after the cost. Refused, never guessed.
  if (colorChosen && sacrifices.length > 0) return failure(ability);
  const also = effects.filter(isAlso);
  const value: ManaAbility = {
    kind: 'mana',
    cost: costs.value,
    production,
    ...(also.length > 0 ? { also } : {}),
    ...(spendOnly === undefined || spendOnly === null ? {} : { spendOnly }),
    ...(spentRider === undefined || spentRider === null ? {} : { spentRider }),
    ...(restrictions.value.activateOnlyIf === undefined
      ? {}
      : { activateOnlyIf: restrictions.value.activateOnlyIf }),
    ...(restrictions.value.oncePerTurn === true ? { oncePerTurn: true as const } : {}),
  };
  return { ok: true, value: [value], rule: 'mana.tap-add' };
}

/**
 * "{T}: Put a charge counter on ~. Add X mana of any one color, where X is the number of charge counters on ~." (Empowered Autogenerator; CR 605.1a, 605.3b, 122.6): a mana ability whose
 * first instruction puts counters on its own permanent, which the engine's `putCounter` does before the mana is added (the amount counts after). Exactly these two sentences, each of one
 * instruction, the first a number of counters of a named kind on `~`; the second is read as any mana ability is.
 *
 * "{T}: Add {R}. Put a stash counter on ~." (Glittering Stockpile; CR 605.1a, 605.3b, 122.6): the same two sentences in the other order. The engine puts the counters first, which no
 * one can tell from putting them after the mana when the mana does not depend on the counters, so this order is read only for mana that is a fixed amount or one color of a choice (never an
 * amount that counts something). Null when the ability is not of one of these shapes (the ordinary reading follows).
 */
function lowerCounterThenMana(
  ability: Activated,
  faceTypes: readonly string[],
): LowerResult<readonly Ability[]> | null {
  const [first, second, ...more] = ability.body.sentences;
  if (first === undefined || second === undefined || more.length > 0) return null;
  const [one, ...firstMore] = first.clauses;
  const [two, ...secondMore] = second.clauses;
  const manaFirst = one?.verb === 'addMana' && two?.verb === 'addCounters';
  const counterFirst = one?.verb === 'addCounters' && two?.verb === 'addMana';
  if (!manaFirst && !counterFirst) return null;
  const put = counterFirst ? one : two;
  const add = counterFirst ? two : one;
  const putSentence = counterFirst ? first : second;
  const addSentence = counterFirst ? second : first;
  if (put === undefined || add === undefined) return null;
  if (
    firstMore.length > 0 ||
    secondMore.length > 0 ||
    !plainClause(put) ||
    putSentence.condition !== undefined ||
    putSentence.where !== undefined ||
    putSentence.instead === true ||
    putSentence.otherwise === true ||
    putSentence.delayed !== undefined
  ) {
    return failure(ability);
  }
  const counter = put.args.counter;
  const objects = put.args.objects;
  if (counter?.kind !== 'counterSpec' || objects?.kind !== 'noun' || objects.det !== 'self') {
    return failure(ability);
  }
  const count = amountArg(put, 'count', newContext('ability', faceTypes));
  if (!count.ok) return count;
  if (typeof count.value !== 'number' || count.value < 1) return failure(ability);
  const base = lowerManaAbility(
    { ...ability, body: { ...ability.body, sentences: [addSentence] } },
    addSentence.clauses,
    faceTypes,
  );
  if (base === null || !base.ok) return base;
  const [mana] = base.value;
  if (mana?.kind !== 'mana') return failure(ability);
  if (manaFirst && !COUNTER_BLIND_PRODUCTION.has(productionShape(mana.production))) {
    return failure(ability);
  }
  const blocked = gate(ability, ['ability:manaPutCounter']);
  if (blocked !== null) return blocked;
  return {
    ok: true,
    value: [{ ...mana, putCounter: { counter: counter.name, count: count.value } }],
    rule: base.rule,
  };
}

/** The productions that read nothing of the game, so the counters may be put before them (`lowerCounterThenMana`). */
const COUNTER_BLIND_PRODUCTION: ReadonlySet<string> = new Set([
  'fixed',
  'anyColor',
  'oneOf',
  'anyCombination',
  'combination',
]);

/** The kind of a production, `fixed-times` for a fixed one that counts something. */
function productionShape(production: ManaProduction): string {
  return production.kind === 'fixed' && production.times !== undefined
    ? 'fixed-times'
    : production.kind;
}

/**
 * "{2}, {T}: Choose a color. Add an amount of mana of that color equal to your devotion to that color." (Nykthos, Shrine to Nyx; CR 605.3b, 700.5): the mana ability of the
 * second sentence with the engine's `anyColorDevotion`, whose color the player chooses as it resolves (the first sentence says so, and makes no instruction of its own).
 * Exactly these two sentences, each of one instruction. Null when the ability is not of this shape (the ordinary reading follows, which refuses "that color" with no color
 * chosen before it).
 */
function lowerChosenColorDevotion(
  ability: Activated,
  faceTypes: readonly string[],
): LowerResult<readonly Ability[]> | null {
  const [first, second, ...more] = ability.body.sentences;
  if (first === undefined || second === undefined || more.length > 0) return null;
  const [choose, ...firstMore] = first.clauses;
  const [add, ...secondMore] = second.clauses;
  if (
    choose === undefined ||
    add === undefined ||
    firstMore.length > 0 ||
    secondMore.length > 0 ||
    choose.verb !== 'chooseColor' ||
    add.verb !== 'addMana' ||
    add.args.mana?.kind !== 'manaSpec' ||
    (add.args.mana.what.kind !== 'devotionToChosenColor' &&
      add.args.mana.what.kind !== 'thatColor') ||
    !plainClause(choose) ||
    !plainClause(add) ||
    first.condition !== undefined ||
    first.where !== undefined ||
    first.instead === true
  ) {
    return null;
  }
  return lowerManaAbility(
    { ...ability, body: { ...ability.body, sentences: [second] } },
    [add],
    faceTypes,
    true,
  );
}

/**
 * "{T}: Add one mana of any color. If you control a creature with power 4 or greater, add two mana of any one color instead." (stage P32,
 * D-147, CR 605.3b, 608.2c, 614.1a): the mana ability of the first sentence with the engine's `instead`, the production the second
 * sentence says while its condition holds. Exactly these two sentences, each one instruction that adds mana and nothing else; the
 * condition is read for the controller as the ability is activated and wherever the engine asks what the source can make. Null when
 * the ability is not of this shape (the ordinary reading follows).
 */
function lowerManaInstead(
  ability: Activated,
  faceTypes: readonly string[],
): LowerResult<readonly Ability[]> | null {
  const [first, second, ...more] = ability.body.sentences;
  if (first === undefined || second === undefined || more.length > 0) return null;
  if (second.instead !== true || second.condition === undefined) return null;
  const [one, ...firstMore] = first.clauses;
  const [other, ...secondMore] = second.clauses;
  const spec = other?.args.mana;
  if (
    one === undefined ||
    other === undefined ||
    firstMore.length > 0 ||
    secondMore.length > 0 ||
    one.verb !== 'addMana' ||
    other.verb !== 'addMana' ||
    spec?.kind !== 'manaSpec' ||
    spec.what.kind === 'devotionToChosenColor' ||
    !plainClause(other) ||
    first.condition !== undefined ||
    first.where !== undefined ||
    second.where !== undefined ||
    one.args.additional !== undefined ||
    other.args.additional !== undefined
  ) {
    return null;
  }
  // The ability of the first sentence alone, as any mana ability is read.
  const base = lowerManaAbility(
    { ...ability, body: { ...ability.body, sentences: [first] } },
    [one],
    faceTypes,
  );
  if (base === null || !base.ok) return base;
  const [mana] = base.value;
  if (mana?.kind !== 'mana') return failure(ability);
  const condition = lowerCondition(second.condition, false, newContext('ability', faceTypes));
  if (!condition.ok) return condition;
  // "add three mana of that type instead" (Incubation Druid, CR 106.7, 605.3b): the first sentence's "could produce" production, with all `count` mana of the type chosen.
  const production =
    spec.what.kind === 'couldProduceThatType'
      ? mana.production.kind === 'couldProduce' && mana.production.count === undefined
        ? { ...mana.production, count: spec.what.count }
        : null
      : lowerMana(spec);
  if (production === null) return failure(ability);
  const blocked = gate(ability, [
    'ability:manaInstead',
    `manaProduction:${production.kind}`,
    ...(production.kind === 'anyCombination' && production.distinct === true
      ? (['ability:manaDistinctColors'] as const)
      : []),
    ...(production.kind === 'anyCombination' && production.colors !== undefined
      ? (['ability:manaColorSubset'] as const)
      : []),
  ]);
  if (blocked !== null) return blocked;
  return {
    ok: true,
    value: [{ ...mana, instead: { condition: condition.value, production } }],
    rule: 'mana.tap-add',
  };
}

/**
 * The mana ability a static ability gives: `Lands you control have "{T}: Add one mana of any
 * color."` (CR 613.1f, 605.1a). The quoted text is read as an activated ability, and only what lowers
 * to a mana ability is given: the engine's `grantAbility` takes no other kind.
 */
export function lowerGrantedMana(
  quoted: IrQuotedAbility,
  faceTypes: readonly string[],
): LowerResult<ManaAbility> {
  const { ability } = quoted;
  if (ability.kind !== 'activated') return failure(quoted);
  const clauses = ability.body.sentences.flatMap((s) => s.clauses);
  const lowered = lowerManaAbility(ability, clauses, faceTypes);
  if (lowered === null) return failure(quoted);
  if (!lowered.ok) return lowered;
  const [only] = lowered.value;
  return only?.kind === 'mana' ? { ok: true, value: only, rule: lowered.rule } : failure(quoted);
}

/** What the "Activate only ..." sentences of an ability say, lowered. */
interface Restrictions {
  readonly timing?: 'sorcery';
  readonly activateOnlyIf?: Condition;
  /** "This ability costs {4} less to activate if ..." (stage P30, D-135, CR 601.2f). */
  readonly costReducedIf?: { readonly generic: number; readonly condition: Condition };
  /** "This ability costs {1} less to activate for each other artifact you control." (stage P31, D-140, CR 601.2f). */
  readonly costReducedBy?: { readonly amount: Amount };
  /** "Activate only once each turn." (stage P31, D-140, CR 602.5b). */
  readonly oncePerTurn?: true;
  /** "Only your opponents may activate this ability" (CR 602.2). */
  readonly activator?: 'opponents';
}

/**
 * "Activate only as a sorcery" (CR 602.5d) and "Activate only if <condition>" (CR 602.5b) are the
 * restrictions read. Each at most once: two of the same kind are not Oracle text, and the engine
 * has one slot for each. A mana ability has no timing (`allowTiming` false); a condition needs
 * the engine's `ability:activateOnlyIf`.
 */
function restrictionsOf(
  ability: Activated,
  allowTiming: boolean,
  allowOnce = allowTiming,
): LowerResult<Restrictions> {
  let timing: 'sorcery' | undefined;
  let activateOnlyIf: Condition | undefined;
  let costReducedIf: Restrictions['costReducedIf'];
  let costReducedBy: Restrictions['costReducedBy'];
  let oncePerTurn = false;
  let activator: 'opponents' | undefined;
  // CR 702.142a (Boast): "Boast — [Cost]: [Effect]" means "[Cost]: [Effect]. Activate only if this creature attacked this turn and only once each turn."
  if (ability.boast === true) {
    if (!allowOnce) return failure(ability);
    const blocked = gate(ability, [
      'ability:oncePerTurn',
      'ability:activateOnlyIf',
      'condition:thisAttackedThisTurn',
    ]);
    if (blocked !== null) return blocked;
    activateOnlyIf = { kind: 'thisAttackedThisTurn' };
    oncePerTurn = true;
  }
  for (const restriction of ability.restrictions) {
    // "This ability costs {1} less to activate for each other artifact you control." (stage P31, D-140, CR 601.2f): an amount read as
    // the ability is activated, for its controller, off the generic part of an ordinary activation's mana cost.
    if (restriction.costReducedBy !== undefined) {
      if (!allowTiming || costReducedBy !== undefined) return failure(restriction);
      const blocked = gate(restriction, ['ability:costReducedBy']);
      if (blocked !== null) return blocked;
      const amount = lowerAmount(
        restriction.costReducedBy,
        newContext('ability', []),
        restriction.rule,
      );
      if (!amount.ok) return amount;
      // A plain number is not "for each" anything: the reading always counts.
      if (typeof amount.value === 'number') return failure(restriction);
      costReducedBy = { amount: amount.value };
      continue;
    }
    // "Activate only once each turn." (stage P31, D-140, CR 602.5b): an ordinary activation's own count; a mana ability has none.
    if (restriction.perTurn !== undefined) {
      if (!allowOnce || oncePerTurn || restriction.perTurn !== 1) return failure(restriction);
      if (restriction.condition !== undefined) return failure(restriction);
      // Issue 345 (Invigorating Hot Spring): "Activate only as a sorcery and only once each turn." says both in one sentence.
      if (restriction.timing !== undefined) {
        if (!allowTiming || timing !== undefined) return failure(restriction);
        timing = 'sorcery';
      }
      const blocked = gate(restriction, ['ability:oncePerTurn']);
      if (blocked !== null) return blocked;
      oncePerTurn = true;
      continue;
    }
    // "This ability costs {4} less to activate if an opponent controls four or more nonbasic lands." (stage P30, CR 601.2f): the
    // engine takes the generic mana off the cost of an ordinary activation when the condition holds as it is activated.
    if (restriction.costReduction !== undefined) {
      const { amount, condition } = restriction.costReduction;
      if (!allowTiming || costReducedIf !== undefined || amount.kind !== 'number') {
        return failure(restriction);
      }
      const blocked = gate(restriction, ['ability:costReducedIf']);
      if (blocked !== null) return blocked;
      const lowered = lowerCondition(condition);
      if (!lowered.ok) return lowered;
      costReducedIf = { generic: amount.value, condition: lowered.value };
      continue;
    }
    // "Only your opponents may activate this ability [and only as a sorcery]." (CR 602.2): who may activate; an ordinary activation only.
    if (restriction.activator !== undefined) {
      if (!allowTiming || activator !== undefined || restriction.condition !== undefined) {
        return failure(restriction);
      }
      const blocked = gate(restriction, ['ability:activatorOpponents']);
      if (blocked !== null) return blocked;
      activator = restriction.activator;
      if (restriction.timing === 'sorcery') {
        if (timing !== undefined) return failure(restriction);
        timing = 'sorcery';
      }
      continue;
    }
    // One sentence may say both ("Activate only if you control a Swamp and only as a sorcery.", stage P29).
    if (restriction.timing === undefined && restriction.condition === undefined) {
      return failure(restriction);
    }
    if (restriction.timing === 'sorcery') {
      if (!allowTiming || timing !== undefined) return failure(restriction);
      timing = 'sorcery';
    }
    if (restriction.condition !== undefined) {
      if (activateOnlyIf !== undefined) return failure(restriction);
      const blocked = gate(restriction, ['ability:activateOnlyIf']);
      if (blocked !== null) return blocked;
      const condition = lowerCondition(restriction.condition);
      if (!condition.ok) return condition;
      activateOnlyIf = condition.value;
    }
  }
  const value: Restrictions = {
    ...(timing === undefined ? {} : { timing }),
    ...(activateOnlyIf === undefined ? {} : { activateOnlyIf }),
    ...(costReducedIf === undefined ? {} : { costReducedIf }),
    ...(costReducedBy === undefined ? {} : { costReducedBy }),
    ...(oncePerTurn ? { oncePerTurn: true as const } : {}),
    ...(activator === undefined ? {} : { activator }),
  };
  return { ok: true, value, rule: ability.rule };
}

/**
 * The costs, the restrictions and the gate that an ordinary activation and a modal one share
 * (CR 602.2): what is paid, what the engine pays, and when the ability may be activated.
 */
interface Prepared {
  readonly costs: readonly Cost[];
  readonly hasX: boolean;
  readonly restrictions: Restrictions;
}

function prepare(
  ability: Activated,
  ctx: LowerContext,
  extra: readonly FeatureRef[],
): LowerResult<Prepared> {
  const costs = lowerCosts(ability, true);
  if (!costs.ok) return costs;
  const hasX = costs.value.some(
    (c) =>
      c.kind === 'payXLife' ||
      (c.kind === 'mana' && c.symbols.includes('X')) ||
      // "−X" of a loyalty ability (stage P47, D-202): X is announced as the ability is activated.
      (c.kind === 'loyalty' && c.change === 'x') ||
      // "Sacrifice X creatures" (D-488, CR 107.3a): the X is announced as the ability is activated.
      (c.kind === 'sacrifice' && c.countX === true) ||
      // Issue 101 (CR 107.3a): "Discard X cards".
      (c.kind === 'discard' && c.countX === true) ||
      // Moxite Refinery (CR 107.3a, 602.2b): "Remove X counters from an artifact or creature you control".
      (c.kind === 'removeCounters' && c.countX === true),
  );
  // CR 606.2 (stage P47, D-202): a loyalty symbol is the cost of an ability of a planeswalker, once, and nothing else is paid with it
  // that the rules of 606 do not know (a loyalty ability has no "Activate only" restriction of its own, CR 606.3).
  const loyaltyCosts = costs.value.filter((c) => c.kind === 'loyalty').length;
  if (loyaltyCosts > 0) {
    if (!ctx.faceTypes.includes('planeswalker') || loyaltyCosts > 1 || costs.value.length > 1) {
      return failure(ability);
    }
    if (ability.restrictions.length > 0) return failure(ability);
  }
  const blocked = gate(ability, [
    'ability:activated',
    ...extra,
    ...costs.value.map((c): FeatureRef => `cost:${c.kind}`),
    ...(hasX ? (['ability:xCost'] as const) : []),
    ...(costs.value.some((c) => c.kind === 'sacrifice' && c.countX === true)
      ? (['ability:sacrificeX'] as const)
      : []),
    ...(costs.value.some((c) => c.kind === 'discard' && c.countX === true)
      ? (['ability:discardCostX'] as const)
      : []),
    // Moxite Refinery: "Remove X counters from an artifact or creature you control".
    ...(costs.value.some((c) => c.kind === 'removeCounters' && c.countX === true)
      ? (['ability:removeCountersX'] as const)
      : []),
    // Issue 102 (Necropolis Fiend): "Exile X cards from your graveyard".
    ...(costs.value.some((c) => c.kind === 'exileFromGraveyard' && c.countX === true)
      ? (['ability:exileFromGraveyardX'] as const)
      : []),
    // D-583: "Sacrifice one or more artifacts".
    ...(costs.value.some((c) => c.kind === 'sacrifice' && c.atLeastOne === true)
      ? (['ability:sacrificeOneOrMore'] as const)
      : []),
    // CR 701.21a: "Sacrifice a Swamp and a Forest".
    ...(costs.value.some((c) => c.kind === 'sacrifice' && c.alongside !== undefined)
      ? (['ability:sacrificeEach'] as const)
      : []),
  ]);
  if (blocked !== null) return blocked;
  // D-625: a cost that taps permanents may come with a mana cost and {T} (the permanents are chosen before the mana is paid); the engine still
  // refuses a second one and Crew (`activationCostIssues`).
  // The engine pays one sacrifice and one discard (`breakDown` in the engine's
  // rules/activate-costs.ts): an ability with two of either is never offered.
  if (costs.value.filter((c) => c.kind === 'sacrifice').length > 1) return failure(ability);
  if (costs.value.filter((c) => c.kind === 'discard').length > 1) return failure(ability);
  const restrictions = restrictionsOf(ability, true);
  if (!restrictions.ok) return restrictions;
  // A cost that sacrifices `~` leaves nothing for the effect to act on.
  ctx.selfGone = costs.value.some((c) => c.kind === 'sacrifice' && 'kind' in c.what);
  // D-583 (CR 602.2b, 701.21a): "for each artifact sacrificed this way" counts what a cost of "Sacrifice one or more artifacts" sacrificed.
  const oneOrMore = ability.costs.find(
    (c) => c.kind === 'sacrifice' && c.what.anyNumber === true && c.what.atLeastOne === true,
  );
  ctx.costSacrifice = oneOrMore?.kind === 'sacrifice' ? kindOfNoun(oneOrMore.what) : null;
  return {
    ok: true,
    value: { costs: costs.value, hasX, restrictions: restrictions.value },
    rule: ability.rule,
  };
}

/** The timing and "activate only if" fields of an activated ability, when it has them. */
function restrictionFields(restrictions: Restrictions) {
  return {
    ...(restrictions.timing === undefined ? {} : { timing: restrictions.timing }),
    ...(restrictions.activateOnlyIf === undefined
      ? {}
      : { activateOnlyIf: restrictions.activateOnlyIf }),
    ...(restrictions.costReducedIf === undefined
      ? {}
      : { costReducedIf: restrictions.costReducedIf }),
    ...(restrictions.costReducedBy === undefined
      ? {}
      : { costReducedBy: restrictions.costReducedBy }),
    ...(restrictions.oncePerTurn === true ? { oncePerTurn: true as const } : {}),
    ...(restrictions.activator === undefined ? {} : { activator: restrictions.activator }),
  };
}

/**
 * The ability without its last sentence when that sentence is "Spend only mana of the chosen color to activate this ability." (issue 144), and whether it had it. The sentence is read
 * nowhere else: any other place it stands in is left for the sentence lowering, which refuses it.
 */
function withoutChosenColorOnly(ability: Activated): [Activated, boolean] {
  const sentences = ability.body.sentences;
  const last = sentences[sentences.length - 1];
  const only = last?.clauses[0];
  if (
    sentences.length < 2 ||
    last === undefined ||
    last.clauses.length !== 1 ||
    only?.verb !== 'spendOnlyChosenColor' ||
    !plainClause(only) ||
    last.condition !== undefined
  ) {
    return [ability, false];
  }
  return [{ ...ability, body: { ...ability.body, sentences: sentences.slice(0, -1) } }, true];
}

/** An ordinary activated ability: costs, then an effect on the stack (CR 602.2). */
function lowerOrdinary(written: Activated, ctx: LowerContext): LowerResult<readonly Ability[]> {
  // Issue 144 (Throne of Eldraine, CR 602.2b): the last sentence "Spend only mana of the chosen color to activate this ability." restricts the mana cost, not the effect.
  const [ability, onlyChosenColor] = withoutChosenColorOnly(written);
  const prepared = prepare(ability, ctx, onlyChosenColor ? ['ability:spendOnlyChosenColor'] : []);
  if (!prepared.ok) return prepared;
  const { hasX, restrictions } = prepared.value;
  if (onlyChosenColor && !prepared.value.costs.some((c) => c.kind === 'mana')) {
    return failure(written);
  }
  const costs = onlyChosenColor
    ? prepared.value.costs.map(
        (c): Cost => (c.kind === 'mana' ? { ...c, onlyChosenColor: true } : c),
      )
    : prepared.value.costs;
  const previousGraveyardSource = ctx.usedGraveyardSource;
  if (ability.costs.some((cost) => cost.kind === 'exileThisFromGraveyard')) {
    ctx.usedGraveyardSource = true;
  }
  // "Return this card from your graveyard to the battlefield" (stage P30, D-135, CR 113.6b): an ability of the card itself that works
  // from the graveyard, which only an ordinary activation can be.
  ctx.graveyardSource = true;
  // The sentences are lowered as the body of any other ability is, so an X that a sentence defines ("..., where X is
  // the number of creatures you control", stage P28) and what "this way" counts are read as they are everywhere.
  ctx.activatedBody = true;
  // Primordial Mist (CR 400.7): the cost exiled a permanent, so "that card" of the effect is the card it became in exile.
  const previousExiled = ctx.exiled;
  if (costs.some((c) => c.kind === 'exilePermanent')) ctx.exiled = 'cards';
  const sentenced = lowerSentences(ability.body.sentences, ctx);
  ctx.exiled = previousExiled;
  ctx.activatedBody = false;
  ctx.graveyardSource = false;
  const functionsInGraveyard = ctx.usedGraveyardSource;
  ctx.usedGraveyardSource = previousGraveyardSource;
  if (!sentenced.ok) return sentenced;
  // An ability that works from the graveyard is one sentence and costs only mana or exiles itself: nothing of the
  // battlefield (tapping, a sacrifice) can be paid from there (`validateCard`, D-124 Unearth). D-540 (CR 602.2): returning other
  // permanents you control to their owner's hand is also paid wherever the ability works ("Return two lands you control to their
  // owner's hand: Return this card from your graveyard to your hand").
  if (
    functionsInGraveyard &&
    (ability.body.sentences.length !== 1 ||
      !costs.every(
        (c) =>
          c.kind === 'mana' ||
          c.kind === 'exileThis' ||
          // CR 701.21a (Jarad, Golgari Lich Lord): permanents you control are sacrificed wherever the ability works ("Sacrifice a Swamp and a Forest: Return this card from your graveyard to your hand"); the card itself is not.
          (c.kind === 'sacrifice' && !('kind' in c.what)) ||
          (c.kind === 'returnToHand' && typeof c.what === 'object' && !('kind' in c.what)),
      ))
  ) {
    return failure(ability);
  }
  const effects: Effect[] = [...sentenced.value];
  // CR 107.3: the {X} of the cost is chosen, and the text cannot also define it: refused, not guessed.
  if (hasX && ctx.xDefined) return failure(ability);
  // CR 107.3a, 107.3j: X is announced for this activation (an {X} or "pay X life" in its cost); an
  // ability whose cost has none has no X to read (`validateCard` refuses it too).
  if (ctx.usesX && !hasX) return failure(ability);
  // Mana added with no target is a mana ability (CR 605.1a): one that did not fit the engine's
  // mana ability above is not run through the stack instead. A loyalty ability is never a mana ability (CR 606.2): "+1: Add {R}{R}."
  // uses the stack.
  if (
    effects.some((e) => e.kind === 'addMana') &&
    ctx.targets.length === 0 &&
    !costs.some((c) => c.kind === 'loyalty')
  ) {
    return failure(ability);
  }
  const [only] = effects;
  if (only === undefined) return failure(ability);
  const effect: Effect = effects.length === 1 ? only : { kind: 'sequence', effects };
  const value: Ability = {
    kind: 'activated',
    cost: [...costs],
    ...(ctx.targets.length > 0 ? { targets: [...ctx.targets] } : {}),
    effect,
    ...(JSON.stringify(restrictions.activateOnlyIf ?? null).includes('"thisSuspended"')
      ? // CR 113.6b, 702.62b (Greater Gargadon): "Activate only if this card is suspended": the card is in exile, so that is where the ability works from.
        { functionsIn: 'exile' as const }
      : functionsInGraveyard
        ? { functionsIn: 'graveyard' as const }
        : // CR 113.6b (stage P68, D-229): "Discard this card" is paid from the hand, so the ability works from there.
          costs.some((c) => c.kind === 'discardThis' || c.kind === 'revealThis')
          ? { functionsIn: 'hand' as const }
          : {}),
    ...restrictionFields(restrictions),
  };
  return { ok: true, value: [value], rule: ability.rule };
}

/**
 * "{2}, {T}: Choose one —" and its bullets (stage P19, CR 700.2a, 602.2b): the engine's modal activated
 * ability. The modes are chosen as the ability is activated, then X, the targets and the costs; the
 * effects and targets are in the modes and `effect` is the empty sequence. An ability that could add
 * mana is a mana ability (CR 605.1a) and cannot have modes, so a mode that adds mana is not lowered.
 */
function lowerModalActivated(
  ability: Activated,
  modal: IrModes,
  ctx: LowerContext,
): LowerResult<readonly Ability[]> {
  const prepared = prepare(ability, ctx, MODAL_NEEDS);
  if (!prepared.ok) return prepared;
  const { costs, hasX, restrictions } = prepared.value;
  const lowered = lowerModes(modal, ctx);
  if (!lowered.ok) return lowered;
  const { modes, chooseModes, usesX } = lowered.value;
  // An X in a mode is the activation's own X (an {X} or "pay X life" in the cost), as for any ability.
  if (usesX && !hasX) return failure(ability);
  if (modes.some((m) => m.effect.kind === 'addMana')) return failure(ability);
  const value: Ability = {
    kind: 'activated',
    cost: [...costs],
    effect: NO_EFFECT,
    modes: [...modes],
    chooseModes,
    ...restrictionFields(restrictions),
  };
  return { ok: true, value: [value], rule: ability.rule };
}

/** An ability with costs and a body: a mana ability when it has that shape, else an activation. */
export function lowerActivated(
  ability: Activated,
  ctx: LowerContext,
): LowerResult<readonly Ability[]> {
  if (ability.modal !== undefined) return lowerModalActivated(ability, ability.modal, ctx);
  const clauses = ability.body.sentences.flatMap((s) => s.clauses);
  if (
    clauses.some((c) => c.verb === 'addMana') &&
    !ability.costs.some((c) => c.kind === 'loyalty')
  ) {
    const counterFirst = lowerCounterThenMana(ability, ctx.faceTypes);
    if (counterFirst !== null) return counterFirst;
    const chosen = lowerChosenColorDevotion(ability, ctx.faceTypes);
    if (chosen !== null) return chosen;
    const instead = lowerManaInstead(ability, ctx.faceTypes);
    if (instead !== null) return instead;
    // "{T}: Add {C}{C}. When you next cast a spell with {X} in its mana cost this turn, you draw a card and gain half X life, rounded down." (Quandrix Unlimited group E, CR 603.7,
    // 605.1a): the mana ability, and the delayed trigger it creates as its extra effect (`also`).
    const delayed = lowerManaWithDelayedCast(ability, ctx);
    if (delayed !== null) return delayed;
    const mana = lowerManaAbility(ability, clauses, ctx.faceTypes);
    if (mana !== null) return mana;
  }
  return lowerOrdinary(ability, ctx);
}

/**
 * A mana ability whose last sentence is a "When you next cast ..." delayed trigger: the sentence is the `also` effect `delayedCast` (the engine runs it in the same activation, as
 * the mana is added), the rest is read as any mana ability. Null when the ability has no such sentence.
 */
function lowerManaWithDelayedCast(
  ability: Activated,
  ctx: LowerContext,
): LowerResult<readonly Ability[]> | null {
  const sentences = ability.body.sentences;
  const at = sentences.findIndex((s) => s.delayed?.step === 'nextCast');
  const sentence = sentences[at];
  if (at < 1 || at !== sentences.length - 1 || sentence === undefined) return null;
  const spell = sentence.delayed?.spell;
  const without = { ...ability, body: { ...ability.body, sentences: sentences.slice(0, at) } };
  const base = lowerManaAbility(
    without,
    without.body.sentences.flatMap((s) => s.clauses),
    ctx.faceTypes,
  );
  if (base === null) return null;
  if (!base.ok) return base;
  const [mana] = base.value;
  if (mana?.kind !== 'mana' || spell === undefined) return failure(ability);
  const blocked = gate(ability, ['manaAlso:delayedCast', 'effect:delayedCast']);
  if (blocked !== null) return blocked;
  const lowered = lowerDelayedCast(sentence, spell, newContext('ability', ctx.faceTypes));
  if (!lowered.ok) return lowered;
  return {
    ok: true,
    value: [{ ...mana, also: [...(mana.also ?? []), lowered.value] }],
    rule: base.rule,
  };
}

/** Features the activated and mana ability lowerings can name, for the dimension test. */
export const ACTIVATED_NEEDS: readonly FeatureRef[] = [
  'ability:mana',
  'manaCost:exert',
  'ability:manaSpendOnlyMonocolored',
  'ability:manaSpendOnlyNotGeneric',
  'ability:manaSpendOnlyTypesOrSubtypes',
  'ability:manaSpendOnlyFromGraveyard',
  'ability:manaSpendOnlyNotOwned',
  'ability:manaSpendOnlyTurnFaceUp',
  'ability:spendOnlyChosenColor',
  'manaCost:tap',
  'manaCost:mana',
  'manaCost:sacrifice',
  'manaCost:payLife',
  'manaCost:removeCounters',
  'effect:addMana',
  'manaProduction:fixed',
  'manaProduction:oneOf',
  'manaProduction:anyColor',
  'manaProduction:commanderIdentity',
  'manaProduction:couldProduce',
  'manaProduction:combination',
  'manaProduction:chosenColor',
  'ability:manaSpendOnlyChosenType',
  'ability:manaSpendOnlyXCost',
  'ability:manaCountOwnCounters',
  'ability:manaPutCounter',
  'ability:removeCountersX',
  'ability:manaSpendOnlyChosenType',
  'ability:manaSpentRider',
  'ability:manaDistinctColors',
  'ability:manaColorSubset',
  'ability:manaSpentRiderCopy',
  'ability:manaSpentRiderCounters',
  'ability:manaSpentRiderExile',
  'manaProduction:anyCombination',
  'manaProduction:anyColorDevotion',
  'manaProduction:anyColorAmount',
  'manaProduction:anyColorAmong',
  'manaProduction:anyCombinationAmount',
  'manaProduction:anyCombinationTapped',
  'ability:activateOnlyIf',
  'ability:costReducedIf',
  'ability:costReducedBy',
  'ability:oncePerTurn',
  'ability:activatorOpponents',
  'ability:manaInstead',
  'manaAlso:dealDamage',
  'manaAlso:loseLife',
  'manaAlso:gainLife',
  'manaAlso:draw',
  'ability:activated',
  'ability:xCost',
  'ability:sacrificeX',
  'ability:discardCostX',
  'ability:exileFromGraveyardX',
  'ability:sacrificeOneOrMore',
  'ability:sacrificeEach',
];
