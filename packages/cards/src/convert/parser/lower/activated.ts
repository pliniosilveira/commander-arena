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
  type Condition,
  type Cost,
  type Effect,
  type ManaAbility,
} from '@commander-arena/engine';
import type { IrAbility, IrClause, IrFilter, IrModes, IrQuotedAbility } from '../ir/types';
import { lowerAmount } from './amounts';
import { lowerCondition } from './conditions';
import { lowerCost } from './costs';
import { lowerClause, lowerMana } from './effects';
import { type FeatureRef, missingFeatures } from './features';
import { lowerModes, MODAL_NEEDS, NO_EFFECT } from './modal';
import { lowerSentences } from './sentences';
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
  const spells = clause.args.spells;
  if (spells?.kind !== 'noun' || !plainClause(clause)) return null;
  const kinds = spellKindsOf(spells.filter);
  if (kinds === null) return null;
  // "Spend this mana only to cast Dragon spells or activate abilities of Dragons." (stage P34, D-152): the abilities of the permanents that
  // are of the kinds the spells are (the engine's `alsoAbilities`), which the text says by naming the same kind.
  const abilities = clause.args.alsoAbilities;
  return {
    ...kinds,
    ...(abilities?.kind === 'flag' && abilities.value ? { alsoAbilities: true as const } : {}),
  };
}

/**
 * The card types and the creature types a noun of spells names (stage P33, D-150): a choice of types or a choice of creature types, never a
 * mix of the two, and nothing else (a color or a quality says more than the engine's restriction and its rider). Null when the words say more.
 */
function spellKindsOf(filter: IrFilter): { types?: CardType[]; subtypes?: string[] } | null {
  const known = new Set(['types', 'subtypes', 'anyOf', 'zone', 'stackKind', 'raw']);
  if (Object.keys(filter).some((key) => !known.has(key))) return null;
  const types = [...(filter.types ?? [])];
  const subtypes = [...(filter.subtypes ?? [])];
  const members = filter.anyOf ?? [];
  const memberTypes = members.filter((m) => m.types !== undefined);
  const memberSubtypes = members.filter((m) => m.subtypes !== undefined);
  // A choice of types or a choice of creature types, never a mix of the two: "artifact or Angel spells" is neither of the engine's two lists.
  if (memberTypes.length > 0 && memberSubtypes.length > 0) return null;
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
  const spells = clause.args.spells;
  if (spells?.kind !== 'noun' || !plainClause(clause)) return null;
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
  const spec = add?.args.mana;
  if (spec?.kind === 'manaSpec' && spec.what.kind === 'devotionToChosenColor' && !colorChosen) {
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
  if (ability.body.sentences.some((s) => s.where !== undefined)) return failure(ability);
  if (ability.body.sentences.some((s) => s.condition !== undefined || s.instead === true)) {
    return failure(ability);
  }
  if (add?.verb !== 'addMana' || spec?.kind !== 'manaSpec' || !plainClause(add)) {
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
  const restrictions = restrictionsOf(ability, false);
  if (!restrictions.ok) return restrictions;
  const production = lowerMana(spec);
  const needs: FeatureRef[] = [
    'ability:mana',
    ...costs.value.map((c): FeatureRef => `manaCost:${c.kind}`),
    'effect:addMana',
    `manaProduction:${production.kind}`,
    ...effects.map((e): FeatureRef => `manaAlso:${e.kind}`),
    ...(spendClause === undefined ? [] : (['ability:manaSpendOnly'] as const)),
    ...(riderClause === undefined ? [] : (['ability:manaSpentRider'] as const)),
  ];
  const blocked = gate(ability, needs);
  if (blocked !== null) return blocked;
  const taps = costs.value.filter((c) => c.kind === 'tap').length;
  const manas = costs.value.filter((c) => c.kind === 'mana').length;
  const lives = costs.value.filter((c) => c.kind === 'payLife').length;
  const mills = costs.value.filter((c) => c.kind === 'mill').length;
  const sacrifices = costs.value.filter((c) => c.kind === 'sacrifice');
  // CR 605.3b, 701.21a (stage P63, D-216): the permanent itself ("Sacrifice this artifact: Add ...") or one of a kind the controller has ("Sacrifice a Spirit:
  // Add {R}."), one only: the engine chooses it as the ability is activated, or the payment names it.
  const selfOnly = sacrifices.every((c) => c.kind === 'sacrifice' && c.count === undefined);
  // `{T}` or the sacrifice of itself pays for it (a Treasure, or a Gold token with no `{T}`).
  const shaped =
    taps <= 1 &&
    (taps === 1 || sacrifices.length === 1) &&
    manas <= 1 &&
    lives <= 1 &&
    mills <= 1 &&
    sacrifices.length <= 1 &&
    selfOnly &&
    taps + manas + lives + mills + sacrifices.length === costs.value.length &&
    effects.every(isAlso) &&
    rest.every(plainClause);
  if (!shaped) return failure(ability);
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
  };
  return { ok: true, value: [value], rule: 'mana.tap-add' };
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
    add.args.mana.what.kind !== 'devotionToChosenColor' ||
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
  const production = lowerMana(spec);
  const blocked = gate(ability, ['ability:manaInstead', `manaProduction:${production.kind}`]);
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
}

/**
 * "Activate only as a sorcery" (CR 602.5d) and "Activate only if <condition>" (CR 602.5b) are the
 * restrictions read. Each at most once: two of the same kind are not Oracle text, and the engine
 * has one slot for each. A mana ability has no timing (`allowTiming` false); a condition needs
 * the engine's `ability:activateOnlyIf`.
 */
function restrictionsOf(ability: Activated, allowTiming: boolean): LowerResult<Restrictions> {
  let timing: 'sorcery' | undefined;
  let activateOnlyIf: Condition | undefined;
  let costReducedIf: Restrictions['costReducedIf'];
  let costReducedBy: Restrictions['costReducedBy'];
  let oncePerTurn = false;
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
      if (!allowTiming || oncePerTurn || restriction.perTurn !== 1) return failure(restriction);
      if (restriction.timing !== undefined || restriction.condition !== undefined) {
        return failure(restriction);
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
      (c.kind === 'loyalty' && c.change === 'x'),
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
  ]);
  if (blocked !== null) return blocked;
  // The engine refuses a cost that taps permanents together with a mana cost, another tap cost or Crew (D-133): the
  // player could tap those permanents for mana first. The ability is recognised and not run.
  if (
    costs.value.some((c) => c.kind === 'tapPermanents') &&
    costs.value.some((c) => c.kind === 'mana' || c.kind === 'tap')
  ) {
    return failure(ability);
  }
  // The engine pays one sacrifice and one discard (`breakDown` in the engine's
  // rules/activate-costs.ts): an ability with two of either is never offered.
  if (costs.value.filter((c) => c.kind === 'sacrifice').length > 1) return failure(ability);
  if (costs.value.filter((c) => c.kind === 'discard').length > 1) return failure(ability);
  const restrictions = restrictionsOf(ability, true);
  if (!restrictions.ok) return restrictions;
  // A cost that sacrifices `~` leaves nothing for the effect to act on.
  ctx.selfGone = costs.value.some((c) => c.kind === 'sacrifice' && 'kind' in c.what);
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
  };
}

/** An ordinary activated ability: costs, then an effect on the stack (CR 602.2). */
function lowerOrdinary(ability: Activated, ctx: LowerContext): LowerResult<readonly Ability[]> {
  const prepared = prepare(ability, ctx, []);
  if (!prepared.ok) return prepared;
  const { costs, hasX, restrictions } = prepared.value;
  // "Return this card from your graveyard to the battlefield" (stage P30, D-135, CR 113.6b): an ability of the card itself that works
  // from the graveyard, which only an ordinary activation can be.
  ctx.graveyardSource = true;
  // The sentences are lowered as the body of any other ability is, so an X that a sentence defines ("..., where X is
  // the number of creatures you control", stage P28) and what "this way" counts are read as they are everywhere.
  const sentenced = lowerSentences(ability.body.sentences, ctx);
  ctx.graveyardSource = false;
  if (!sentenced.ok) return sentenced;
  // An ability that works from the graveyard has one instruction and costs only mana: nothing of the battlefield (tapping, a
  // sacrifice) can be paid from there (`validateCard`, D-124 Unearth).
  if (
    ctx.usedGraveyardSource &&
    (ability.body.sentences.length !== 1 ||
      sentenced.value.length !== 1 ||
      !costs.every((c) => c.kind === 'mana'))
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
    ...(ctx.usedGraveyardSource
      ? { functionsIn: 'graveyard' as const }
      : // CR 113.6b (stage P68, D-229): "Discard this card" is paid from the hand, so the ability works from there.
        costs.some((c) => c.kind === 'discardThis')
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
    const chosen = lowerChosenColorDevotion(ability, ctx.faceTypes);
    if (chosen !== null) return chosen;
    const instead = lowerManaInstead(ability, ctx.faceTypes);
    if (instead !== null) return instead;
    const mana = lowerManaAbility(ability, clauses, ctx.faceTypes);
    if (mana !== null) return mana;
  }
  return lowerOrdinary(ability, ctx);
}

/** Features the activated and mana ability lowerings can name, for the dimension test. */
export const ACTIVATED_NEEDS: readonly FeatureRef[] = [
  'ability:mana',
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
  'ability:manaSpendOnly',
  'ability:manaSpentRider',
  'manaProduction:anyCombination',
  'manaProduction:anyColorDevotion',
  'ability:activateOnlyIf',
  'ability:costReducedIf',
  'ability:costReducedBy',
  'ability:oncePerTurn',
  'ability:manaInstead',
  'manaAlso:dealDamage',
  'manaAlso:loseLife',
  'manaAlso:gainLife',
  'manaAlso:draw',
  'ability:activated',
  'ability:xCost',
];
