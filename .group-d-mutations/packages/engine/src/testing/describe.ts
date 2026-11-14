/** Readable descriptions of objects, actions and states for DSL error messages. */
import type { Zone } from '../ast/types';
import type { SeatId } from '../ids';
import { controllerOf } from '../rules/control';
import { derive } from '../rules/derive';
import { inherentName } from '../rules/inherent';
import { cardsOf } from '../rules/melded';
import type { Action } from '../state/actions';
import type { AttackTarget } from '../state/combat-types';
import type { PendingDecision } from '../state/decisions';
import type { GameEvent } from '../state/events';
import { definitionOf } from '../state/ops';
import type { GameObject, GameState } from '../state/types';

export function nameOf(state: GameState, obj: GameObject): string {
  // D-277: a melded permanent is named by both of its cards.
  if (obj.card !== null)
    return cardsOf(obj)
      .map((c) => definitionOf(state, c).name)
      .join(' + ');
  // A token, and a copy of a spell (D-129), are named by what they are.
  if (obj.token || obj.copyOf !== undefined) return derive(state, obj).name;
  // An ability on the stack is named after its source, which may have left (CR 113.7a).
  if (obj.stack?.inherent !== undefined) return `${inherentName(obj.stack.inherent)} (ability)`;
  const source = obj.stack?.source ?? null;
  const origin = source === null ? null : (state.objects[source] ?? state.lki[source]?.object);
  return origin ? `${nameOf(state, origin)} (ability)` : '(ability)';
}

/** The seat a zone listing refers to (see CardQuery.seat). */
export function seatOfObject(state: GameState, obj: GameObject): SeatId {
  if (obj.zoneOwner !== null) return obj.zoneOwner;
  return obj.zone === 'exile' ? obj.owner : controllerOf(state, obj);
}

export function describeLocation(state: GameState, obj: GameObject): string {
  const zone: Zone = obj.zone;
  return `seat ${seatOfObject(state, obj)}'s ${zone}`;
}

export function describeObject(state: GameState, obj: GameObject): string {
  return `${nameOf(state, obj)} (${obj.id}, ${describeLocation(state, obj)})`;
}

export function describeAction(state: GameState, action: Action): string {
  const named = (id: string) => {
    const obj = state.objects[id as GameObject['id']];
    return obj ? `${nameOf(state, obj)} ${id}` : id;
  };
  switch (action.kind) {
    case 'playLand':
      return `${action.kind} ${named(action.object)}${action.face ? ` (face ${action.face})` : ''}`;
    case 'castSpell':
      return `castSpell ${named(action.object)}${action.alternative ? ` (${action.alternative})` : ''}${action.face ? ` (face ${action.face})` : ''}`;
    case 'suspend':
    case 'foretell':
    case 'turnFaceUp':
      return `${action.kind} ${named(action.object)}`;
    case 'activate':
      return `activate ${named(action.object)}#${action.abilityIndex}`;
    case 'activateAbility':
      return `activateAbility ${named(action.source)}#${action.abilityIndex}${
        action.color ? ` for ${action.color}` : ''
      }${action.combination ? ` for ${action.combination.join('')}` : ''}`;
    case 'chooseCards':
      return `chooseCards [${action.objects.map(named).join(', ')}]`;
    case 'arrangeCards':
      return `arrangeCards top [${action.top.map(named).join(', ')}] other [${action.other
        .map(named)
        .join(', ')}]`;
    case 'choosePermanents':
      return `choosePermanents [${action.objects.map(named).join(', ')}]`;
    case 'choosePayOptions':
      return `choosePayOptions [${action.objects.map(named).join(', ')}]`;
    case 'orderTriggers':
      return `orderTriggers [${action.order.join(', ')}]`;
    case 'chooseOption':
      return `chooseOption ${action.option}`;
    case 'chooseX':
      return `chooseX ${action.value}`;
    case 'chooseModes':
      return `chooseModes [${action.modes.join(', ')}]`;
    case 'chooseTargets':
      return `chooseTargets [${action.targets
        .map((t) => (t.kind === 'object' ? named(t.id) : `player ${t.seat}`))
        .join(', ')}]`;
    case 'payManual':
      return `payManual [${action.taps.map((t) => named(t.object)).join(', ')}]`;
    case 'declareAttackers':
      return `declareAttackers [${action.attacks
        .map((a) => `${named(a.attacker)} -> ${describeAttackTarget(state, a.target)}`)
        .join(', ')}]`;
    case 'declareBlockers':
      return `declareBlockers [${action.blocks
        .map((b) => `${named(b.blocker)} blocks ${named(b.attacker)}`)
        .join(', ')}]`;
    case 'assignDamage':
      return `assignDamage [${action.assignments
        .map(
          (a) =>
            `${named(a.source)} -> ${a.to.kind === 'player' ? `player ${a.to.seat}` : named(a.to.id)}: ${a.amount}`,
        )
        .join(', ')}]`;
    default:
      return action.kind;
  }
}

export function describeAttackTarget(state: GameState, target: AttackTarget): string {
  if (target.kind === 'player') return `player ${target.seat}`;
  const obj = state.objects[target.object];
  return obj ? `${nameOf(state, obj)} ${target.object}` : target.object;
}

export function describePending(state: GameState, d: PendingDecision | null): string {
  if (d === null) return state.result ? `game over (${JSON.stringify(state.result)})` : 'nothing';
  return `${d.kind} decision for seat ${d.seat}`;
}

export function describeEvent(state: GameState, e: GameEvent): string {
  const text = JSON.stringify(e);
  const ids = [...text.matchAll(/"(o\d+)"/g)].map((m) => m[1] as string);
  const names = [
    ...new Set(
      ids.flatMap((id) => {
        const live = state.objects[id as GameObject['id']];
        const lki = state.lki[id as GameObject['id']]?.object;
        const obj = live ?? lki;
        return obj ? [`${id}=${nameOf(state, obj)}`] : [];
      }),
    ),
  ];
  return names.length > 0 ? `${text} [${names.join(', ')}]` : text;
}

/** A compact multi-line dump of the state: what a failing test needs to see. */
export function dumpState(state: GameState): string {
  const list = (ids: readonly string[]) =>
    ids
      .map((id) => {
        const obj = state.objects[id as GameObject['id']];
        if (!obj) return id;
        const flags = [
          obj.tapped ? 'tapped' : '',
          obj.damage ? `damage ${obj.damage}` : '',
          obj.attachedTo === null ? '' : `attached to ${obj.attachedTo}`,
          ...Object.entries(obj.counters)
            .filter(([, n]) => n > 0)
            .map(([c, n]) => `${n} ${c}`),
        ].filter((f) => f !== '');
        return `${nameOf(state, obj)}(${id}${flags.length ? `; ${flags.join(', ')}` : ''})`;
      })
      .join(', ');
  const t = state.turn;
  const lines = [
    `turn ${t.number}, active seat ${t.activeSeat}, step ${t.step}, priority ${t.prioritySeat ?? 'none'}`,
    `pending: ${describePending(state, state.pending)}`,
    `stack (top first): ${list([...state.stack].reverse())}`,
    `battlefield: ${list(state.battlefield)}`,
    `exile: ${list(state.exile)}`,
  ];
  if (state.combat) {
    const named = (id: string) => {
      const obj = state.objects[id as GameObject['id']];
      return obj ? `${nameOf(state, obj)}(${id})` : `${id}(gone)`;
    };
    for (const a of state.combat.attackers) {
      const blockers = state.combat.blocks.filter((b) => b.attacker === a.object);
      lines.push(
        `combat: ${named(a.object)} attacks ${describeAttackTarget(state, a.target)}${
          a.blocked ? ` (blocked by [${blockers.map((b) => named(b.blocker)).join(', ')}])` : ''
        }`,
      );
    }
  }
  if (state.monarch !== null) lines.push(`monarch: seat ${state.monarch}`);
  for (const s of state.seats) {
    const pool = s.manaPool.map((m) => m.color).join('');
    lines.push(
      `seat ${s.id}: life ${s.life}${s.hasLost ? ' (lost)' : ''}, pool [${pool}], lands played ${s.landsPlayedThisTurn}`,
      `  hand: ${list(s.hand)}`,
      `  library (top first): ${s.library.length} cards${s.library.length <= 6 ? ` ${list(s.library)}` : ''}`,
      `  graveyard: ${list(s.graveyard)}`,
      `  command: ${list(s.command)}`,
    );
  }
  return lines.join('\n');
}
