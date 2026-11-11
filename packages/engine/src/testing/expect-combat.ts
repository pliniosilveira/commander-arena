/** Combat assertions (CR 506-511, 903.10a): who is attacking, blocked and what each may do. */

import { applyAction } from '../api';
import type { ObjectId, SeatId } from '../ids';
import { commanderDamageKey } from '../rules/sba';
import type { AttackTarget } from '../state/combat-types';
import { definitionOf } from '../state/ops';
import type { GameState } from '../state/types';
import { opponentSeat } from './combat-refs';
import {
  describeAttackTarget,
  describeObject,
  describePending,
  dumpState,
  nameOf,
} from './describe';
import { type RefContext, resolveObject } from './refs';
import { type CardRef, type CombatExpectation, type Expectations, ScenarioError } from './types';

type CombatExpectations = Pick<
  Expectations,
  'combat' | 'canAttack' | 'canBlock' | 'commanderDamage'
>;

function fail(message: string, state: GameState): never {
  throw new ScenarioError(`${message}\n--- state ---\n${dumpState(state)}`);
}

export function createCombatExpectations(
  ctx: RefContext,
  getState: () => GameState,
): CombatExpectations {
  const label = (state: GameState, id: ObjectId) => {
    const obj = state.objects[id];
    return obj ? describeObject(state, obj) : `${id} (gone)`;
  };

  function sameSet(
    what: string,
    state: GameState,
    actual: readonly ObjectId[],
    wanted: readonly ObjectId[],
  ): void {
    const a = [...new Set(actual)].sort();
    const w = [...new Set(wanted)].sort();
    if (JSON.stringify(a) !== JSON.stringify(w)) {
      fail(
        `Expected ${what} to be [${w.map((id) => label(state, id)).join('; ')}] but it is [${a
          .map((id) => label(state, id))
          .join('; ')}]`,
        state,
      );
    }
  }

  function sameTarget(a: AttackTarget, b: AttackTarget): boolean {
    return a.kind === 'player'
      ? b.kind === 'player' && a.seat === b.seat
      : b.kind === 'permanent' && a.object === b.object;
  }

  return {
    combat(expected: CombatExpectation | null) {
      const state = getState();
      const combat = state.combat;
      if (expected === null) {
        if (combat !== null) fail('Expected no combat in progress, but there is one', state);
        return;
      }
      if (combat === null) fail('Expected a combat in progress, but there is none', state);
      const active = state.turn.activeSeat;
      const attacker = (ref: CardRef) =>
        resolveObject(ctx, ref, { zones: ['battlefield'], seat: active }).id;
      const blocker = (ref: CardRef) =>
        resolveObject(ctx, ref, { zones: ['battlefield'], seat: opponentSeat(state, active) }).id;

      if (expected.attackers !== undefined) {
        sameSet(
          'the attackers',
          state,
          combat.attackers.map((a) => a.object),
          expected.attackers.map(attacker),
        );
      }
      for (const t of expected.targets ?? []) {
        const id = attacker(t.attacker);
        const entry = combat.attackers.find((a) => a.object === id);
        if (!entry) fail(`Expected ${label(state, id)} to be attacking, but it is not`, state);
        const want: AttackTarget =
          typeof t.target === 'object' && 'player' in t.target
            ? { kind: 'player', seat: t.target.player }
            : {
                kind: 'permanent',
                object: resolveObject(ctx, t.target, { zones: ['battlefield'] }).id,
              };
        if (!sameTarget(entry.target, want)) {
          fail(
            `Expected ${label(state, id)} to attack ${describeAttackTarget(state, want)} but it attacks ${describeAttackTarget(state, entry.target)}`,
            state,
          );
        }
      }
      if (expected.blocked !== undefined) {
        sameSet(
          'the blocked attackers',
          state,
          combat.attackers.filter((a) => a.blocked).map((a) => a.object),
          expected.blocked.map(attacker),
        );
      }
      if (expected.unblocked !== undefined) {
        sameSet(
          'the unblocked attackers',
          state,
          combat.attackers.filter((a) => !a.blocked).map((a) => a.object),
          expected.unblocked.map(attacker),
        );
      }
      if (expected.blocks !== undefined) {
        const key = (b: ObjectId, a: ObjectId) => `${b}>${a}`;
        const actual = combat.blocks.map((b) => key(b.blocker, b.attacker)).sort();
        const want = expected.blocks.map((b) => key(blocker(b.blocker), attacker(b.attacker)));
        if (JSON.stringify(actual) !== JSON.stringify([...want].sort())) {
          const text = (pairs: readonly string[]) =>
            pairs
              .map((p) => {
                const [b, a] = p.split('>') as [ObjectId, ObjectId];
                return `${label(state, b)} blocks ${label(state, a)}`;
              })
              .join('; ');
          fail(`Expected the blocks [${text(want)}] but they are [${text(actual)}]`, state);
        }
      }
    },

    canAttack(card, can = true) {
      const state = getState();
      const d = state.pending;
      // When nobody can attack the engine asks nothing and gives priority in the declare attackers
      // step with no combat (CR 508.1, 508.8): every creature is then "not a candidate".
      if (
        d?.kind === 'priority' &&
        state.turn.step === 'declareAttackers' &&
        state.combat === null
      ) {
        const obj = resolveObject(ctx, card, { zones: ['battlefield'], seat: d.seat });
        if (can) {
          fail(
            `Expected ${describeObject(state, obj)} to be able to attack, but the engine asked for no attackers: nobody can attack`,
            state,
          );
        }
        return;
      }
      if (d?.kind !== 'declareAttackers') {
        fail(
          `canAttack needs the declareAttackers decision, but the engine is waiting for ${describePending(state, d)}`,
          state,
        );
      }
      const obj = resolveObject(ctx, card, { zones: ['battlefield'], seat: d.seat });
      const candidate = d.candidates.find((c) => c.attacker === obj.id);
      const target = candidate?.targets[0] ?? { kind: 'player', seat: opponentSeat(state, d.seat) };
      // CR 508.1d: the creatures that attack each combat if able are in every declaration.
      const required = d.mustAttack
        .filter((id) => id !== obj.id)
        .flatMap((attacker) => {
          const at = d.candidates.find((c) => c.attacker === attacker)?.targets[0];
          return at === undefined ? [] : [{ attacker, target: at }];
        });
      const result = applyAction(state, d.seat, {
        kind: 'declareAttackers',
        attacks: [...required, { attacker: obj.id, target }],
      });
      const listed = candidate !== undefined;
      if (listed !== can || result.ok !== can) {
        fail(
          `Expected ${describeObject(state, obj)} ${can ? 'to be able' : 'not to be able'} to attack, but it ${
            listed ? 'is' : 'is not'
          } a candidate and the engine ${result.ok ? 'accepts' : `rejects (${result.error})`} declaring it`,
          state,
        );
      }
    },

    canBlock(blockerRef, attackerRef, can = true) {
      const state = getState();
      const d = state.pending;
      if (d?.kind !== 'declareBlockers') {
        fail(
          `canBlock needs the declareBlockers decision, but the engine is waiting for ${describePending(state, d)}`,
          state,
        );
      }
      const blocker = resolveObject(ctx, blockerRef, { zones: ['battlefield'], seat: d.seat });
      const attacker = resolveObject(ctx, attackerRef, {
        zones: ['battlefield'],
        seat: opponentSeat(state, d.seat),
      });
      const listed =
        d.candidates.find((c) => c.blocker === blocker.id)?.canBlock.includes(attacker.id) ?? false;
      const minBlockers = d.attackers.find((a) => a.attacker === attacker.id)?.minBlockers ?? 1;
      // A lone block of a creature that needs two blockers (menace) is refused whoever blocks it,
      // so the engine check is only meaningful when one blocker may block it alone.
      const result =
        minBlockers > 1
          ? null
          : applyAction(state, d.seat, {
              kind: 'declareBlockers',
              blocks: [{ blocker: blocker.id, attacker: attacker.id }],
            });
      if (listed !== can || (result !== null && result.ok !== can)) {
        fail(
          `Expected ${nameOf(state, blocker)} ${can ? 'to be able' : 'not to be able'} to block ${nameOf(state, attacker)}, but it ${
            listed ? 'is' : 'is not'
          } listed as able to${
            result === null ? '' : ` and the engine ${result.ok ? 'accepts' : 'rejects'} the block`
          }`,
          state,
        );
      }
    },

    commanderDamage(seat: SeatId, commander: string, amount: number) {
      const state = getState();
      const cards = Object.values(state.cards).filter(
        (c) => c.isCommander && definitionOf(state, c.id).name === commander,
      );
      const [card, ...rest] = cards;
      if (!card || rest.length > 0) {
        fail(
          `Expected exactly one commander card named "${commander}" but found ${cards.length}`,
          state,
        );
      }
      const actual = state.commanderDamage[commanderDamageKey(seat, card.id)] ?? 0;
      if (actual !== amount) {
        fail(
          `Expected seat ${seat} to have taken ${amount} commander damage from ${commander} but it has taken ${actual}`,
          state,
        );
      }
    },
  };
}
