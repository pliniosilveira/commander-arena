/**
 * The actions that answer a decision (`legalActionsForDecision`). A decision carries everything
 * needed, so the AI and the UI can list legal answers from the decision in their view without
 * reading hidden state. Where a decision accepts more answers than can be listed (any subset of
 * attackers, a choice among dozens of permanents) the list holds representative ones; the engine
 * still accepts every legal answer.
 */

import type { ObjectId } from './ids';
import { arrangementActions, orderedChoices } from './rules/arrange-choices';
import { defaultDivision } from './rules/combat-flow';
import { crewChoices } from './rules/crew-choices';
import { sharesLandType } from './rules/share-type';
import { targetAnswerError } from './rules/target-choice';
import type { Action } from './state/actions';
import type { ChosenTarget } from './state/chosen';
import type { AttackTarget } from './state/combat-types';
import type { PendingDecision } from './state/decisions';

function combinations<T>(items: readonly T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (items.length < k) return [];
  const [head, ...rest] = items;
  if (head === undefined) return [];
  return [...combinations(rest, k - 1).map((c) => [head, ...c]), ...combinations(rest, k)];
}

/** Longest list of answers `legalActionsForDecision` builds for a choice among many permanents. */
const MAX_LISTED_CHOICES = 500;

/** Most combinations `firstCombinations` looks at while it waits for `limit` that `accept` takes. */
const MAX_COMBINATIONS_TRIED = 200_000;

/**
 * The first `limit` combinations of `k` items that `accept` takes (all of them by default), in the order
 * `combinations` lists them. The cap applies to the accepted ones, so a constraint on the whole answer (D-262:
 * cards that share a land type) cannot leave the list empty of answers that exist; the search for them stops after
 * `MAX_COMBINATIONS_TRIED` combinations.
 */
function firstCombinations<T>(
  items: readonly T[],
  k: number,
  limit: number,
  accept: (combination: readonly T[]) => boolean = () => true,
): T[][] {
  const out: T[][] = [];
  const chosen: T[] = [];
  let tried = 0;
  const walk = (start: number): void => {
    if (chosen.length === k) {
      tried += 1;
      if (accept(chosen)) out.push([...chosen]);
      return;
    }
    for (let i = start; i <= items.length - (k - chosen.length); i += 1) {
      chosen.push(items[i] as T);
      walk(i + 1);
      chosen.pop();
      if (out.length >= limit || tried >= MAX_COMBINATIONS_TRIED) return;
    }
  };
  walk(0);
  return out;
}

/** CR 205.3i (D-262): a choice whose cards have no land type in common is no answer; every choice is one without the option. */
function sharesTypeOf(
  types: Readonly<Record<ObjectId, readonly string[]>> | undefined,
): (chosen: readonly ObjectId[]) => boolean {
  return (chosen) => types === undefined || sharesLandType(chosen, types);
}

function range(from: number, to: number): number[] {
  return Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i);
}

/** Longest list of triggers whose every order is listed; beyond it only two orders are. */
const ORDERS_LISTED_UP_TO = 5;

/** The orders (CR 603.3b) to offer for `n` triggers: all of them while that stays small. */
function triggerOrders(n: number): number[][] {
  const identity = Array.from({ length: n }, (_, i) => i);
  if (n > ORDERS_LISTED_UP_TO) return [identity, [...identity].reverse()];
  const permutations = (items: number[]): number[][] =>
    items.length <= 1
      ? [items]
      : items.flatMap((x, i) =>
          permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [x, ...rest]),
        );
  return permutations(identity);
}

/**
 * Two ways to divide `total` among `n` targets, each getting at least 1: the rest on the last, the rest on the first (one way when they are the
 * same, none for n of 0 or a total that is too small).
 */
function divisions(n: number, total: number): number[][] {
  if (n === 0) return [[]];
  if (total < n) return [];
  const ones = Array.from({ length: n }, () => 1);
  const last = ones.map((v, i) => (i === n - 1 ? total - (n - 1) : v));
  const first = ones.map((v, i) => (i === 0 ? total - (n - 1) : v));
  return n === 1 ? [last] : [last, first];
}

export function legalActionsForDecision(d: PendingDecision): Action[] {
  const actions: Action[] = [];
  switch (d.kind) {
    case 'priority':
      for (const o of d.options) {
        if (o.kind === 'activateAbility') actions.push({ ...o });
        else actions.push(o);
      }
      return actions;
    case 'mulligan':
      actions.push({ kind: 'keepHand' });
      if (d.canMulligan) actions.push({ kind: 'takeMulligan' });
      return [...actions, { kind: 'concede' }];
    case 'mulliganBottom':
      return [
        ...combinations(d.hand, d.count).map((objects) => ({
          kind: 'chooseCards' as const,
          objects,
        })),
        { kind: 'concede' },
      ];
    case 'discard':
      return [
        ...combinations(d.hand, d.count).map((objects) => ({
          kind: 'chooseCards' as const,
          objects,
        })),
        { kind: 'concede' },
      ];
    case 'targets': {
      // Every combination of picks per slot (CR 601.2c), within each slot's bounds.
      let acc: ChosenTarget[][] = [[]];
      for (const spec of d.specs) {
        const options: ChosenTarget[][] = [];
        if (spec.divide !== undefined) {
          // CR 601.2d (D-145): a division comes with the targets: each gets 1 and the last one the rest, or the first one the rest. The
          // combinations are limited as a choice among many permanents is.
          for (let n = spec.min; n <= spec.max; n += 1) {
            for (const picks of firstCombinations(spec.legal, n, MAX_LISTED_CHOICES)) {
              for (const shares of divisions(n, spec.divide)) {
                options.push(picks.map((t, i) => ({ ...t, share: shares[i] as number })));
              }
            }
          }
        } else {
          for (let n = spec.min; n <= spec.max; n += 1) {
            // D-149: at most one target for each opponent.
            const groupsOf = (picks: readonly ChosenTarget[]) =>
              picks.map((t) => (t.kind === 'object' ? t.group : undefined));
            options.push(
              ...combinations(spec.legal, n).filter(
                (picks) =>
                  spec.onePerGroup !== true ||
                  groupsOf(picks).every((g, i, all) => g === undefined || all.indexOf(g) === i),
              ),
            );
          }
        }
        acc = acc.flatMap((a) => options.map((o) => [...a, ...o]));
        // D-1000: the instances of a mode chosen more than once each have a slot, which makes the combinations grow with every instance: they are limited as
        // a choice among many permanents is (any legal answer is accepted all the same).
        if (d.specs.some((spec) => spec.instance !== undefined))
          acc = acc.slice(0, MAX_LISTED_CHOICES);
      }
      // CR 115.3 (D-151): "other targets": a slot that must differ from an earlier one lists only the answers that do.
      if (d.specs.some((spec) => spec.differentFrom !== undefined)) {
        acc = acc.filter((targets) => targetAnswerError(d, targets) === null);
      }
      return [
        ...acc.map((targets) => ({ kind: 'chooseTargets' as const, targets })),
        // A triggered ability goes on the stack whatever the player thinks (CR 603.3d): no cancel. Nor does a copy of a
        // spell, which is on the stack already (CR 707.10c, D-129).
        ...(d.forTrigger === true || d.forCopy === true || d.forChange === true
          ? []
          : [{ kind: 'cancel' as const }]),
        { kind: 'concede' },
      ];
    }
    case 'payMana':
      // payManual is accepted when its taps pay the cost, but its options cannot be listed.
      return [{ kind: 'payAuto' }, { kind: 'cancel' }, { kind: 'concede' }];
    case 'commanderZone':
      return [{ kind: 'moveToCommandZone' }, { kind: 'declineCommandZone' }, { kind: 'concede' }];
    case 'choosePermanent':
      // CR 701.34a (D-149): a proliferate takes any number of permanents and players: nothing, everything, and each one alone.
      if (d.purpose === 'proliferate') {
        return [
          { kind: 'choosePermanents', objects: [] },
          { kind: 'choosePermanents', objects: [...d.legal], players: [...(d.players ?? [])] },
          ...d.legal.map((id) => ({ kind: 'choosePermanents' as const, objects: [id] })),
          ...(d.players ?? []).map((p) => ({
            kind: 'choosePermanents' as const,
            objects: [],
            players: [p],
          })),
          { kind: 'concede' },
        ];
      }
      // Every choice of between `min` and `max` of the legal permanents (CR 608.2d), up to a limit:
      // any legal choice is accepted, but a choice among dozens of permanents cannot be listed. A
      // crew cost (CR 702.122a) lists the subsets with enough total power instead.
      return [
        ...(d.minTotalPower === undefined
          ? range(d.min, d.max)
              .flatMap((n) => firstCombinations(d.legal, n, MAX_LISTED_CHOICES))
              .slice(0, MAX_LISTED_CHOICES)
              .map((objects) => ({ kind: 'choosePermanents' as const, objects }))
          : crewChoices(d)),
        // A sacrifice paid as a cost can be taken back (CR 733): the activation is rewound.
        ...(d.forCost ? [{ kind: 'cancel' as const }] : []),
        { kind: 'concede' },
      ];
    case 'chooseCards':
      // D-139: a discard "unless you discard an artifact card": the cards that alone will do, and the full count.
      if (d.orSingle !== undefined) {
        const alone = d.orSingle;
        const single = alone.map((id) => [id]);
        const full = firstCombinations(d.legal, d.max, MAX_LISTED_CHOICES).filter(
          (c) => c.length !== 1 || !alone.some((id) => id === c[0]),
        );
        return [
          ...[...single, ...full]
            .slice(0, MAX_LISTED_CHOICES)
            .map((objects) => ({ kind: 'chooseCards' as const, objects })),
          { kind: 'concede' },
        ];
      }
      // Every choice of between `min` and `max` of the legal cards (CR 701.23, 701.9), up to a
      // limit, like choosePermanent. A search lists the empty choice (find nothing) first. Putting
      // cards on top of the library is ordered: the first chosen ends up on top, so the order is
      // part of the answer.
      return [
        ...(d.purpose === 'putOnTop'
          ? range(d.min, d.max).flatMap((n) => orderedChoices(d.legal, n, MAX_LISTED_CHOICES))
          : range(d.min, d.max).flatMap((n) =>
              firstCombinations(d.legal, n, MAX_LISTED_CHOICES, sharesTypeOf(d.shareLandType)),
            )
        )
          // CR 202.3 (D-230): a choice whose mana values add up to more than the limit is no answer.
          .filter(
            (objects) =>
              d.totalManaValue === undefined ||
              objects.reduce((n, id) => n + (d.totalManaValue?.values[id] ?? 0), 0) <=
                d.totalManaValue.limit,
          )
          .slice(0, MAX_LISTED_CHOICES)
          .map((objects) => ({ kind: 'chooseCards' as const, objects })),
        // A discard paid as a cost can be taken back (CR 733): the cast or activation is rewound.
        ...(d.forCost === true ? [{ kind: 'cancel' as const }] : []),
        { kind: 'concede' },
      ];
    case 'arrangeCards':
      // CR 701.22a, 701.25a: where each card looked at goes, and in what order (see arrange-choices).
      return [...arrangementActions(d), { kind: 'concede' }];
    case 'orderTriggers':
      return [
        ...triggerOrders(d.triggers.length).map((order) => ({
          kind: 'orderTriggers' as const,
          order,
        })),
        { kind: 'concede' },
      ];
    case 'confirmOptional':
      return [
        { kind: 'acceptOptional' },
        { kind: 'declineOptional' },
        // The kicker question can be taken back (CR 733): the cast is rewound.
        // The gift question too (D-135).
        ...(d.purpose === 'kicker' || d.purpose === 'gift' || d.purpose === 'costChoice'
          ? [{ kind: 'cancel' as const }]
          : []),
        { kind: 'concede' },
      ];
    case 'chooseOption':
      // CR 614.12a: one action per option, in the decision's order (every creature type, or five colors).
      return [
        ...d.options.map((option) => ({ kind: 'chooseOption' as const, option })),
        { kind: 'concede' },
      ];
    case 'chooseX':
      // CR 107.3a: every value from the least to the most the controller could pay, one action each;
      // the announcement can be taken back (CR 733): the cast or activation is rewound.
      return [
        ...range(d.min, d.max).map((value) => ({ kind: 'chooseX' as const, value })),
        // D-151: "pay any amount of {R}" is asked while an ability resolves: there is no cast to rewind.
        ...(d.purpose === 'payAnyAmount' || d.purpose === 'drawUpTo'
          ? []
          : [{ kind: 'cancel' as const }]),
        { kind: 'concede' },
      ];
    case 'chooseModes':
      // CR 700.2a: one action per legal set of modes; the choice of a spell or an activated ability can be
      // taken back (CR 733), a triggered ability's cannot.
      return [
        ...d.sets.map((modes) => ({ kind: 'chooseModes' as const, modes: [...modes] })),
        ...(d.forTrigger === true ? [] : [{ kind: 'cancel' as const }]),
        { kind: 'concede' },
      ];
    case 'choosePayOptions':
      // CR 601.2f-h (D-120): the answers the engine worked out leave a cost the mana can pay: the empty one
      // when everything can be paid in mana, the planner's own set and sets near it. Any other set that pays
      // for a different mana each is accepted too. The choice can be taken back (CR 733).
      return [
        ...d.choices.map((objects) => ({
          kind: 'choosePayOptions' as const,
          objects: [...objects],
        })),
        { kind: 'cancel' },
        { kind: 'concede' },
      ];
    case 'declareAttackers': {
      // Any legal subset is accepted; listing every subset is not possible, so the list holds the
      // common ones: no attack, each creature alone at each target, and everyone at each target.
      // CR 508.1d: a creature that attacks each combat if able is in every declaration (`mustAttack`),
      // so "no attack" is listed only when none is required and the others come with the required ones.
      // CR 508.1h (D-125): attacking a taxed target costs mana; a declaration the player could not pay for is
      // not listed (the decision's `attackCosts` says how many attackers each taxed target can take), and a
      // required creature is declared at a target that costs nothing.
      const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
      const costOf = (target: AttackTarget) => d.attackCosts?.find((c) => same(c.target, target));
      const targets = [
        ...new Map(
          d.candidates.flatMap((c) => c.targets).map((t) => [JSON.stringify(t), t] as const),
        ).values(),
      ];
      const required = (target: AttackTarget | null) =>
        d.candidates
          .filter((c) => d.mustAttack.includes(c.attacker))
          .flatMap((c) => {
            const wanted =
              target !== null &&
              costOf(target) === undefined &&
              c.targets.some((t) => same(t, target))
                ? target
                : undefined;
            const at = wanted ?? c.targets.find((t) => costOf(t) === undefined) ?? c.targets[0];
            return at === undefined ? [] : [{ attacker: c.attacker, target: at }];
          });
      const base =
        d.mustAttack.length === 0
          ? [[]]
          : (targets.length === 0 ? [null] : targets).map((t) => required(t));
      const alone = d.candidates
        .filter((c) => !d.mustAttack.includes(c.attacker))
        .flatMap((c) =>
          c.targets.map((target) => [...required(target), { attacker: c.attacker, target }]),
        );
      // With one candidate "everyone" is the same action as "alone": list it once. A taxed target takes as many
      // attackers as can be paid for.
      const everyone = targets.flatMap((target) => {
        const taxed = costOf(target);
        const others = d.candidates.filter(
          (c) => !d.mustAttack.includes(c.attacker) && c.targets.some((t) => same(t, target)),
        );
        if (taxed === undefined) {
          return d.candidates.length > 1 &&
            d.candidates.every((c) => c.targets.some((t) => same(t, target)))
            ? [d.candidates.map((c) => ({ attacker: c.attacker, target }))]
            : [];
        }
        return others.length > 1
          ? [
              [
                ...required(target),
                ...others.slice(0, taxed.affordable).map((c) => ({ attacker: c.attacker, target })),
              ],
            ]
          : [];
      });
      const payable = (attacks: readonly { target: AttackTarget }[]) =>
        (d.attackCosts ?? []).every(
          (c) => attacks.filter((a) => same(a.target, c.target)).length <= c.affordable,
        );
      const lists = [...base, ...alone, ...everyone].filter(payable);
      const unique = [...new Map(lists.map((l) => [JSON.stringify(l), l] as const)).values()];
      return [
        ...unique.map((attacks) => ({ kind: 'declareAttackers' as const, attacks })),
        { kind: 'concede' },
      ];
    }
    case 'declareBlockers': {
      // Any legal assignment is accepted; the list holds no block and each single block.
      const minBlockers = new Map(d.attackers.map((a) => [a.attacker, a.minBlockers] as const));
      const single = d.candidates.flatMap((c) =>
        c.canBlock
          .filter((attacker) => (minBlockers.get(attacker) ?? 1) <= 1)
          .map((attacker) => ({
            kind: 'declareBlockers' as const,
            blocks: [{ blocker: c.blocker, attacker }],
          })),
      );
      // D-149: a block costs mana when something taxes it; with nothing affordable only "no block" is listed.
      const canPay = d.blockCost === undefined || d.blockCost.affordable >= 1;
      return [
        { kind: 'declareBlockers', blocks: [] },
        ...(canPay ? single : []),
        { kind: 'concede' },
      ];
    }
    case 'assignDamage':
      // Any legal division is accepted; the list holds the default (lethal to each blocker in order).
      return [
        { kind: 'assignDamage', assignments: defaultDivision(d.choices) },
        { kind: 'concede' },
      ];
    default: {
      const unreachable: never = d;
      return unreachable;
    }
  }
}
