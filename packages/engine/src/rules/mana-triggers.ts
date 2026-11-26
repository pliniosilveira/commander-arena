/**
 * Triggered mana abilities (CR 605.1b, 605.4, D-139): "Whenever you tap a permanent for {C}, add an additional {C}." Such an ability does
 * not go on the stack: it resolves as soon as the mana ability that triggered it has (CR 605.4a), and its mana goes to the same pool. This
 * engine finds them where a mana ability is activated (`mana-engine.ts`, by hand) and where the payment planner reads what a source makes
 * (`mana-sources.ts`): the extra mana is counted with the mana the source makes, so a plan never taps more than it must.
 *
 * "Tap a permanent for mana" is activating a mana ability with {T} in its cost (CR 106.12). The permanent that is tapped must match the
 * trigger's filter, belong to the controller of the triggered ability (`by` is "you"), and, when the trigger names a type of mana, the
 * mana ability must have produced that type. Several abilities each add their own mana.
 */
import type { Condition, Effect, ManaAbility, ManaProduction, Trigger } from '../ast/types';
import type { ManaColor } from '../mana/types';
import type { GameObject, GameState } from '../state/types';
import { evaluateCondition } from './conditions';
import { controllerOf } from './control';
import { derive } from './derive';
import { matchesFilter } from './select';

type ManaTrigger = Extract<Trigger, { kind: 'tappedForMana' }>;

/** What a triggered mana ability adds: mana of fixed types, or one mana of a color its player chooses (CR 106.1b). */
type Extra =
  | { readonly kind: 'fixed'; readonly mana: readonly ManaColor[] }
  | { readonly kind: 'anyColor' }
  // CR 106.12a, 605.4a: one mana of a type the tapped permanent's mana ability produced ("any type that land produced").
  | { readonly kind: 'produced' };

interface Source {
  readonly object: GameObject;
  readonly trigger: ManaTrigger;
  readonly extra: Extra;
  /** Barbflare Gremlin: "if this creature is tapped", read for the permanent with the ability when the mana ability is activated (CR 603.4). */
  readonly condition?: Condition;
  /** Barbflare Gremlin: "Then that land deals 1 damage to that player": the damage the tapped permanent deals to the player who tapped it, with the mana (CR 605.4a). */
  readonly damage: number;
}

/**
 * The mana and the damage a triggered mana ability does: "add one mana of any type that land produced" alone, or (Barbflare Gremlin, CR 605.1b, 605.4a) followed by "that land deals 1
 * damage to that player", a `dealDamage` of a whole number to the `triggerPlayer`. Null for any other effect.
 */
function triggeredManaShape(
  effect: Effect,
): { readonly mana: ManaProduction; readonly damage: number } | null {
  if (effect.kind === 'addMana') return { mana: effect.mana, damage: 0 };
  if (effect.kind !== 'sequence') return null;
  const [first, ...rest] = effect.effects;
  if (first?.kind !== 'addMana' || rest.length === 0) return null;
  let damage = 0;
  for (const e of rest) {
    if (e.kind !== 'dealDamage' || typeof e.amount !== 'number' || e.to.kind !== 'triggerPlayer') {
      return null;
    }
    damage += e.amount;
  }
  return { mana: first.mana, damage };
}

/** The colors "one mana of any color" can be: colorless is not a color (CR 105.1, 106.1b). */
export const ANY_COLORS: readonly ManaColor[] = ['W', 'U', 'B', 'R', 'G'];

interface Index {
  readonly battlefield: GameState['battlefield'];
  readonly definitions: GameState['definitions'];
  readonly effects: GameState['continuousEffects'];
  readonly sources: readonly Source[];
}

const cache = new WeakMap<object, Index>();

function scan(state: GameState): Index {
  const sources: Source[] = [];
  for (const id of state.battlefield) {
    const object = state.objects[id];
    if (object === undefined) continue;
    for (const a of derive(state, object).abilities) {
      if (a.kind !== 'triggered' || a.trigger.kind !== 'tappedForMana') continue;
      const shape = triggeredManaShape(a.effect);
      if (shape === null) continue;
      const base = {
        object,
        trigger: a.trigger,
        damage: shape.damage,
        ...(a.interveningIf === undefined ? {} : { condition: a.interveningIf }),
      };
      if (shape.mana.kind === 'fixed') {
        sources.push({ ...base, extra: { kind: 'fixed', mana: shape.mana.mana } });
      } else if (shape.mana.kind === 'anyColor' && (shape.mana.count ?? 1) === 1) {
        sources.push({ ...base, extra: { kind: 'anyColor' } });
      } else if (shape.mana.kind === 'producedType') {
        sources.push({ ...base, extra: { kind: 'produced' } });
      }
    }
  }
  return {
    battlefield: state.battlefield,
    definitions: state.definitions,
    effects: state.continuousEffects,
    sources,
  };
}

function sourcesOf(state: GameState): readonly Source[] {
  const hit = cache.get(state.objects);
  if (
    hit !== undefined &&
    hit.battlefield === state.battlefield &&
    hit.definitions === state.definitions &&
    hit.effects === state.continuousEffects
  ) {
    return hit.sources;
  }
  const fresh = scan(state);
  cache.set(state.objects, fresh);
  return fresh.sources;
}

/** Whether the triggered mana ability `src` triggers when `tapped` is tapped for `produced`: whose permanent it is (`by`), the type of mana, the filter and the "if" (CR 106.12, 605.1b, 603.4). */
function triggerApplies(
  state: GameState,
  src: Source,
  tapped: GameObject,
  produced: readonly ManaColor[],
): boolean {
  // CR 106.12, 605.1b: `you` taps it for the controller of the ability; `tapper` is whoever controls the permanent that was tapped (only they can tap it, CR 605.2).
  if (src.trigger.by === 'you' && controllerOf(state, src.object) !== controllerOf(state, tapped)) {
    return false;
  }
  if (src.trigger.mana !== undefined && !produced.includes(src.trigger.mana)) return false;
  const filter = { ...src.trigger.what, zone: 'battlefield' as const };
  if (
    !matchesFilter(state, tapped, filter, {
      controller: controllerOf(state, src.object),
      source: src.object.id,
    })
  ) {
    return false;
  }
  // CR 603.4 (Barbflare Gremlin): "if this creature is tapped": the permanent with the ability, as it is when the mana ability is activated.
  return (
    src.condition === undefined ||
    evaluateCondition(state, src.condition, {
      controller: controllerOf(state, src.object),
      source: src.object.id,
    })
  );
}

/**
 * The damage the triggered mana abilities deal to the player who taps `tapped` for mana (Barbflare Gremlin, CR 605.1b, 605.4a: "Then that land deals 1 damage to that player"), one amount
 * for each ability that triggers.
 */
export function triggeredManaDamage(
  state: GameState,
  tapped: GameObject,
  ability: ManaAbility,
  produced: readonly ManaColor[],
): number[] {
  if (produced.length === 0 || !ability.cost.some((c) => c.kind === 'tap')) return [];
  return sourcesOf(state)
    .filter((src) => src.damage > 0 && triggerApplies(state, src, tapped, produced))
    .map((src) => src.damage);
}

/**
 * The mana the triggered mana abilities add when `tapped` is tapped for `produced` by `ability`, as the alternatives the player may choose among: one list of mana when
 * nothing is left to choose (nothing at all for an ability without {T} in its cost or one that makes no mana: `[[]]`), several when an ability adds one mana of any color (one
 * alternative for each color, and for several such abilities the colors of each, in the order of the abilities on the battlefield, CR 605.1b, 106.1b).
 */
export function additionalManaOptions(
  state: GameState,
  tapped: GameObject,
  ability: ManaAbility,
  produced: readonly ManaColor[],
): ManaColor[][] {
  if (produced.length === 0 || !ability.cost.some((c) => c.kind === 'tap')) return [[]];
  const sources = sourcesOf(state);
  if (sources.length === 0) return [[]];
  let options: ManaColor[][] = [[]];
  for (const src of sources) {
    // CR 106.12, 605.1b: `you` taps it for the controller of the ability; `tapper` is whoever controls the permanent that was tapped (only they can tap it, CR 605.2).
    if (!triggerApplies(state, src, tapped, produced)) continue;
    // CR 106.12a: the mana the ability produced, not what other triggered mana abilities add to it; one alternative for each type it made.
    const adds: ManaColor[][] =
      src.extra.kind === 'fixed'
        ? [[...src.extra.mana]]
        : src.extra.kind === 'produced'
          ? [...new Set(produced)].map((c) => [c])
          : ANY_COLORS.map((c) => [c]);
    options = options.flatMap((so) => adds.map((a) => [...so, ...a]));
  }
  return options;
}
