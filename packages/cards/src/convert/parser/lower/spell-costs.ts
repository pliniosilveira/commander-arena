/**
 * The statements about what a spell costs (stage P13, D-095, D-101): "As an additional cost to cast
 * ~, sacrifice a creature." and "If you control a commander, you may cast ~ without paying its mana
 * cost." lower to the face's `additionalCosts` and `alternativeCosts` (CR 118.8, 118.9); they are
 * not abilities. The cost reduction is a static ability and is lowered with the others (statics.ts).
 *
 * A cost is lowered only when the engine pays it as an additional cost: one sacrifice of a kind of
 * permanent ("another", a count above one and "~" are refused), one discard of N cards, a payment of
 * life of one or more (or X, stage P16) and plain mana (an {X} in it is refused). A second sacrifice or discard in the same sentence, which
 * the engine's `validateCard` would refuse, is refused here with the line.
 */
import { type AlternativeCost, type Cost, SUPPORTED_FEATURES } from '@commander-arena/engine';
import type { IrAbility, IrCondition, IrCost, IrKeyword } from '../ir/types';
import { withoutZone } from './attachments';
import { lowerCondition } from './conditions';
import { lowerCost } from './costs';
import { type FeatureRef, missingFeatures } from './features';
import { lowerFilter } from './nouns';
import type { FaceCosts, LowerFailure, LowerResult } from './types';

type Static = Extract<IrAbility, { kind: 'static' }>;
type At = { readonly span: { start: number; end: number }; readonly rule: string };

function failure(node: At, needs: readonly FeatureRef[] = []): LowerFailure {
  return { ok: false, needs, at: node.span, rule: node.rule };
}

/** What a lowered line contributes to its face. */
export type SpellCostLowering = LowerResult<FaceCosts>;

const NONE: FaceCosts = { additionalCosts: [], alternativeCosts: [] };

/** One cost of an additional cost, or the failure that refuses it. */
function additional(cost: IrCost): LowerResult<Cost> {
  // "Sacrifice ~" is a cost of an ability, and "another" has no meaning for a spell that is not on
  // the battlefield yet: the engine's filter has nothing to leave out (CR 701.21a).
  if (cost.kind === 'sacrifice' && (cost.what.det !== 'a' || cost.what.other)) {
    return failure(cost);
  }
  // An {X} in an additional mana cost is not run (the engine's `checkAdditionalCosts`).
  if (cost.kind === 'mana' && cost.symbols.includes('X')) return failure(cost);
  return lowerCost(cost, { x: true, discardX: true });
}

/**
 * "As an additional cost to cast ~, sacrifice an artifact or creature or pay {4}." (stage P38, D-182, CR 118.8, 601.2b): the caster pays one of two
 * ways, the engine's `additionalCostChoice`. Each way is one cost the engine pays as an additional cost (no {X} and no "pay X life", which the
 * engine does not combine with a choice), and the two are different kinds of cost.
 */
function lowerChoice(
  ability: Static,
  first: readonly IrCost[],
  second: readonly IrCost[],
): LowerResult<FaceCosts> {
  const options: Cost[][] = [];
  for (const way of [first, second]) {
    const lowered: Cost[] = [];
    for (const ir of way) {
      const cost = additional(ir);
      if (!cost.ok) return cost;
      lowered.push(cost.value);
    }
    options.push(lowered);
  }
  const [one, other] = options;
  if (one === undefined || other === undefined) return failure(ability);
  const costs = [...one, ...other];
  if (costs.some((c) => c.kind === 'payXLife' || c.kind === 'discardX')) return failure(ability);
  const missing = missingFeatures([
    ...costs.map((c): FeatureRef => `cost:${c.kind}`),
    'ability:additionalCostChoice',
  ]);
  if (missing.length > 0) return failure(ability, missing);
  // Two ways that are the same kind of cost ("sacrifice a creature or sacrifice an artifact") are one cost of a wider description, not a choice.
  if (one.length === 1 && other.length === 1 && one[0]?.kind === other[0]?.kind) {
    return failure(ability);
  }
  return {
    ok: true,
    value: { ...NONE, additionalCostChoice: [one, other] },
    rule: ability.rule,
  };
}

function lowerAdditional(
  ability: Static,
  costs: readonly IrCost[],
  orCosts?: readonly IrCost[],
): LowerResult<FaceCosts> {
  if (orCosts !== undefined) return lowerChoice(ability, costs, orCosts);
  const lowered: Cost[] = [];
  for (const ir of costs) {
    const cost = additional(ir);
    if (!cost.ok) return cost;
    lowered.push(cost.value);
  }
  const needs = lowered.map((c): FeatureRef => `cost:${c.kind}`);
  // "Pay X life": the caster announces X as the spell is cast (CR 107.3a, D-103).
  if (lowered.some((c) => c.kind === 'payXLife')) needs.push('ability:xCost');
  // "Discard X cards" (D-1190): X is announced the same way, and the engine pays it as the one discard cost of the spell.
  if (lowered.some((c) => c.kind === 'discardX')) needs.push('ability:xCost');
  const missing = missingFeatures(needs);
  if (missing.length > 0) return failure(ability, missing);
  // The engine allows one "pay X life" (`checkAdditionalCosts`).
  if (lowered.filter((c) => c.kind === 'payXLife').length > 1) return failure(ability);
  for (const kind of ['sacrifice', 'discard'] as const) {
    // The engine pays one sacrifice and one discard as additional costs (`checkAdditionalCosts`).
    if (lowered.filter((c) => c.kind === kind).length > 1) return failure(ability);
  }
  // The one discard cost is "discard X cards" or a discard of N cards, not both (`checkAdditionalCosts`, D-1190).
  if (lowered.some((c) => c.kind === 'discardX')) {
    if (lowered.filter((c) => c.kind === 'discardX' || c.kind === 'discard').length > 1) {
      return failure(ability);
    }
  }
  return { ok: true, value: { ...NONE, additionalCosts: lowered }, rule: ability.rule };
}

function lowerFree(ability: Static, condition: IrCondition | undefined): LowerResult<FaceCosts> {
  // The alternative cost itself has no `FeatureRef`: it is named by `castAlternatives`.
  if (!SUPPORTED_FEATURES.castAlternatives.includes('free')) return failure(ability);
  let alternative: AlternativeCost = { kind: 'free' };
  if (condition !== undefined) {
    const lowered = lowerCondition(condition);
    if (!lowered.ok) return lowered;
    alternative = { kind: 'free', condition: lowered.value };
  }
  return { ok: true, value: { ...NONE, alternativeCosts: [alternative] }, rule: ability.rule };
}

/**
 * "You may pay {W} and tap four untapped creatures you control with flying rather than pay ~'s mana cost." (stage P33, D-150, CR 118.9, 118.3):
 * the engine's alternative cost `tapPermanents`: its mana, and the number of untapped permanents of the caster's that match the filter,
 * which the engine plans the mana around and asks for. The mana is plain (no X, no hybrid, as for the named alternative costs) and the
 * permanents are described by a filter with no controller (the caster's are meant) and no zone.
 */
function lowerTapAlternative(
  ability: Static,
  effect: Extract<IrAbility, { kind: 'static' }>['statement']['effects'][number] & {
    kind: 'tapAlternative';
  },
): LowerResult<FaceCosts> {
  const cost = lowerCost(effect.cost);
  if (!cost.ok) return cost;
  const what = lowerFilter({ ...effect.what, filter: withoutZone(effect.what.filter) });
  if (!what.ok) return what;
  const { controller, ...filter } = what.value;
  if (controller !== undefined && controller !== 'you') return failure(ability);
  if (effect.count < 1) return failure(ability);
  const blocked = missingFeatures([
    'castAlternative:tapPermanents',
    `cost:${cost.value.kind}`,
    ...(filter.keywords === undefined && filter.notKeywords === undefined
      ? []
      : (['selector:keywords'] as const)),
  ]);
  if (blocked.length > 0) return failure(ability, blocked);
  const entry: AlternativeCost = {
    kind: 'tapPermanents',
    cost: [cost.value],
    filter,
    count: effect.count,
  };
  return { ok: true, value: { ...NONE, alternativeCosts: [entry] }, rule: ability.rule };
}

/**
 * The face costs of a static statement that says one, or null when the statement is not about the
 * cost of casting (the caller lowers it as an ability).
 */
export function lowerSpellCosts(ability: Static): SpellCostLowering | null {
  const [effect, ...more] = ability.statement.effects;
  if (effect === undefined || more.length > 0) return null;
  if (effect.kind === 'additionalCost') {
    return lowerAdditional(ability, effect.costs, effect.orCosts);
  }
  if (effect.kind === 'freeCast') return lowerFree(ability, effect.condition);
  if (effect.kind === 'tapAlternative') return lowerTapAlternative(ability, effect);
  return null;
}

/**
 * The keywords that are alternative costs of the engine (stage P22, D-121; Spectacle and Escape: P23, D-124;
 * Madness and Foretell: P26, D-128; Miracle, with an {X} allowed in its cost: D-274).
 */
const NAMED_ALTERNATIVES = [
  'overload',
  'evoke',
  'dash',
  'spectacle',
  'escape',
  'madness',
  'miracle',
  'foretell',
] as const;
type NamedAlternative = (typeof NAMED_ALTERNATIVES)[number];

const isNamedAlternative = (name: string): name is NamedAlternative =>
  (NAMED_ALTERNATIVES as readonly string[]).includes(name);

/**
 * "Overload {6}{U}", "Evoke {2}{U}", "Dash {1}{R}", "Spectacle {R}" and "Escape—{G}{G}{U}{U}, Exile five other
 * cards from your graveyard." (CR 702.96a, 702.74a, 702.109a, 702.137a, 702.138a; D-121, D-124): the keyword
 * is an alternative cost of the face, `{ kind, cost: [mana] }` and for Escape `exile`, the number of other
 * cards of the graveyard; the engine owns the text change, the sacrifice, the haste and the return, the
 * condition of Spectacle and the exile of Escape. "Madness {1}{B}{B}" and "Foretell {4}{R}{R}" (CR 702.35a,
 * 702.143a; stage P26, D-128) are the same shape: the engine owns the discard replacement and the cast from
 * exile of Madness and the special action of Foretell (the cost on the line is what the cast from exile costs). The cost is plain mana without {X} (the only cost the engine
 * pays, `checkAlternativeCosts`). Whether the face can have it (an instant or sorcery for Overload, a permanent
 * for Evoke, a creature for Dash, not a land for Spectacle and Escape, no Delve beside Escape) and the second
 * one of a kind are `validateCard`'s refusals. Null when the keyword is not one of them (the caller lowers it
 * as an ability).
 */
export function lowerAlternativeKeyword(ability: IrKeyword): SpellCostLowering | null {
  if (!isNamedAlternative(ability.name)) return null;
  const kind = ability.name;
  const [only, ...more] = ability.cost ?? [];
  if (only?.kind !== 'mana' || more.length > 0) return failure(ability);
  // Escape has the number of cards as its one parameter; the others have none.
  const [count, ...rest] = ability.params;
  let exile = 0;
  if (kind === 'escape') {
    if (count?.kind !== 'number' || rest.length > 0) return failure(ability);
    if (!Number.isSafeInteger(count.value) || count.value < 1 || count.value > 9) {
      return failure(ability);
    }
    exile = count.value;
  } else if (count !== undefined) {
    return failure(ability);
  }
  // A hybrid symbol or an {X} is refused here, as the engine's own check would; Miracle's cost may have an {X} (D-274, CR 107.3a).
  const cost = lowerCost(only, { x: kind === 'miracle' });
  if (!cost.ok) return cost;
  const blocked = missingFeatures([`castAlternative:${kind}`, `cost:${cost.value.kind}`]);
  if (blocked.length > 0) return failure(ability, blocked);
  const entry: AlternativeCost =
    kind === 'escape' ? { kind, cost: [cost.value], exile } : { kind, cost: [cost.value] };
  return {
    ok: true,
    value: { ...NONE, alternativeCosts: [entry] },
    rule: `keyword.${kind}`,
  };
}

/** Features the lowering of the named alternative costs can name, for the dimension test. */
export const ALTERNATIVE_COST_NEEDS: readonly FeatureRef[] = [
  'castAlternative:overload',
  'castAlternative:evoke',
  'castAlternative:dash',
  'castAlternative:spectacle',
  'castAlternative:escape',
  'castAlternative:madness',
  'castAlternative:miracle',
  'castAlternative:foretell',
  'cost:mana',
];
