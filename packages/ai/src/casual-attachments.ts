/**
 * CasualAgent and attachments (slice S4a): Auras and Equipment.
 *
 * - An Aura goes on the agent's own best creature (the highest power), and on an opponent's only
 *   when its text says it hurts ("gets -2/-2", "can't attack or block", ...). The view carries only
 *   rules text, so "hurts" is read from it: the agent cannot judge an Aura it cannot read, and
 *   treats it as a benefit.
 * - An Aura is cast only when a host of the right side exists, because a started cast is never
 *   cancelled (see `worthCasting` in casual-priority.ts).
 * - An Equipment that is attached to nothing is equipped to the best creature that carries no
 *   attachment yet (otherwise the best creature), once per turn per Equipment. It never moves an
 *   Equipment that is already attached: the creature's power includes the Equipment's bonus, so
 *   the agent could not tell a better host from a worse one.
 */
import type {
  Action,
  ActivatedAbility,
  ChosenTarget,
  ConfirmOptionalDecision,
  GameView,
  ObjectView,
  TargetsDecision,
} from '@commander-arena/engine';
import { findObject, isCreature, powerOf } from './casual-view';

/** Aura text that hurts the enchanted permanent. */
const HOSTILE_AURA = /gets? -\d|can't attack|can't block|doesn't untap|loses /i;

export const isAura = (o: ObjectView): boolean => o.subtypes.includes('Aura');
export const isEquipment = (o: ObjectView): boolean => o.subtypes.includes('Equipment');
export const auraIsHostile = (o: ObjectView): boolean => HOSTILE_AURA.test(o.oracleText);

/**
 * "Enchanted" (D-429, CR 303.4): a permanent with an Aura attached to it, whoever controls the Aura. The view lists what is attached to a permanent
 * (`attachments`); an Equipment attached is no Aura.
 */
export function isEnchanted(view: GameView, o: ObjectView): boolean {
  return (o.attachments ?? []).some((id) => {
    const attached = view.battlefield.find((b) => b.id === id);
    return attached !== undefined && isAura(attached);
  });
}

/** "You may cast this spell as though it had flash if it targets a commander." (D-408, CR 601.3b, 601.3d): an Aura that can be cast at instant speed only on a commander. */
const FLASH_FOR_COMMANDER = /cast this spell as though it had flash if it targets a commander/i;

/** What an opposing spell or ability says that an indestructible commander survives: it destroys, or it deals damage. */
const KILLS_BY_DAMAGE_OR_DESTROY = /\bdestroy|\bdeals? (?:\d+|x|that much|damage)|\bdamage\b/i;

/** Whether the Aura is cast at instant speed only on a commander (D-408). */
export const flashesForCommander = (o: ObjectView): boolean =>
  FLASH_FOR_COMMANDER.test(o.oracleText);

/**
 * Whether the agent is in its own main phase with an empty stack: the timing of a sorcery (CR 307.1), where an Aura is cast as any other Aura.
 */
function hasSorceryTiming(view: GameView): boolean {
  return (
    view.activeSeat === view.viewer &&
    (view.step === 'precombatMain' || view.step === 'postcombatMain') &&
    view.stack.length === 0
  );
}

/**
 * "Held up for a commander" (D-408): an Aura that has flash only if it targets a commander is cast at its controller's sorcery timing like any Aura, and otherwise
 * only as a response that saves a commander of the agent's own: the top object of the stack is the opponent's, it targets that commander and its text destroys or
 * deals damage (indestructible saves it from both). At flash timing only commanders are legal targets, so one of the agent's own must be there for the cast to
 * be a choice it can make (the cast, once begun, is never cancelled).
 */
export function commanderAuraWorthCasting(view: GameView): boolean {
  if (hasSorceryTiming(view)) return true;
  const top = view.stack[view.stack.length - 1];
  if (top === undefined || top.controller === view.viewer) return false;
  if (!KILLS_BY_DAMAGE_OR_DESTROY.test(top.oracleText)) return false;
  const mine = view.battlefield.filter(
    (o) => o.controller === view.viewer && o.isCommander && targetable(view, o),
  );
  return mine.some((o) => top.targets.some((t) => t.kind === 'object' && t.id === o.id));
}

/**
 * "Whenever a creature enters, you may attach this Aura to that creature" (D-406, CR 701.3, 303.4j): the decision does not say which creature entered, but the view lists the
 * battlefield in the order permanents entered it, so the newest creature there is the one (when several enter together the last of them stands for the rest). A benefit
 * moves onto a creature of the agent's own that does not carry it already, a hurt (`auraIsHostile`) onto an opponent's. Null when the question is not that one.
 */
export function answerAttachToEntered(view: GameView, d: ConfirmOptionalDecision): Action | null {
  const source = findObject(view, d.source);
  const ability = source?.ability;
  if (
    ability?.kind !== 'triggered' ||
    ability.effect.kind !== 'attach' ||
    ability.effect.to.kind !== 'triggerSubject'
  ) {
    return null;
  }
  const aura =
    source !== undefined && source.abilitySource !== undefined
      ? findObject(view, source.abilitySource)
      : undefined;
  const entered = [...view.battlefield].reverse().find((o) => isCreature(o) && o.id !== aura?.id);
  if (aura === undefined || entered === undefined) return { kind: 'declineOptional' };
  const mine = entered.controller === view.viewer;
  const already = aura.attachedTo === entered.id;
  const wanted = auraIsHostile(aura) ? !mine : mine;
  return wanted && !already ? { kind: 'acceptOptional' } : { kind: 'declineOptional' };
}

/** The kind of permanent an Aura enchants, from "Enchant creature (you control)" in its text. */
function enchantedNoun(aura: ObjectView): string | null {
  return /enchant (\w+)/i.exec(aura.oracleText)?.[1]?.toLowerCase() ?? null;
}

/** Whether `o` can be named by anything its own side does: not shroud, and not an opponent hexproof. */
function targetable(view: GameView, o: ObjectView): boolean {
  if (o.keywords.includes('shroud')) return false;
  return o.controller === view.viewer || !o.keywords.includes('hexproof');
}

/**
 * Whether the permanents on the battlefield include a host for `aura` on the side it is meant for.
 * An Aura whose enchant text the agent cannot read is treated as castable.
 */
export function auraHasHost(view: GameView, aura: ObjectView): boolean {
  const noun = enchantedNoun(aura);
  if (noun === null) return true;
  const hostile = auraIsHostile(aura);
  return view.battlefield.some(
    (o) =>
      (noun === 'permanent' || o.types.some((t) => t === noun)) &&
      targetable(view, o) &&
      (hostile ? o.controller !== view.viewer : o.controller === view.viewer),
  );
}

type Slot = TargetsDecision['specs'][number];

/** The legal object targets of a slot with the view of each, in the engine's order. */
function candidates(view: GameView, slot: Slot): { target: ChosenTarget; view: ObjectView }[] {
  return slot.legal.flatMap((target) => {
    const o = target.kind === 'object' ? findObject(view, target.id) : undefined;
    return o === undefined ? [] : [{ target, view: o }];
  });
}

/** The one with the highest (or lowest) power; the first in the engine's order wins a tie. */
function byPower<T extends { view: ObjectView }>(
  list: readonly T[],
  highest: boolean,
): T | undefined {
  let best: T | undefined;
  for (const item of list) {
    if (
      best === undefined ||
      (highest ? powerOf(item.view) > powerOf(best.view) : powerOf(item.view) < powerOf(best.view))
    ) {
      best = item;
    }
  }
  return best;
}

/**
 * The host of an Aura: the best creature of the side the Aura is meant for. When only the wrong side
 * is legal (the cast could not be avoided), the least valuable permanent there: the least harm.
 */
export function chooseAuraHost(
  view: GameView,
  d: TargetsDecision,
  aura: ObjectView,
): ChosenTarget[] {
  const [slot] = d.specs;
  if (slot === undefined) return [];
  const hostile = auraIsHostile(aura);
  const all = candidates(view, slot);
  const mine = all.filter((c) => c.view.controller === view.viewer);
  const theirs = all.filter((c) => c.view.controller !== view.viewer);
  const [meant, other] = hostile ? [theirs, mine] : [mine, theirs];
  const pick = meant.length > 0 ? byPower(meant, true) : byPower(other, false);
  const chosen = pick?.target ?? slot.legal[0];
  return chosen === undefined ? [] : [chosen];
}

/** Whether an ability is an Equipment's equip ability: "attach this", for mana, at sorcery speed. */
export function isEquipAbility(ability: ActivatedAbility): boolean {
  return (
    ability.effect.kind === 'attach' &&
    ability.effect.object.kind === 'this' &&
    ability.cost.every((c) => c.kind === 'mana')
  );
}

/** The creature to equip: the best one with nothing attached, else the best one. */
export function chooseEquipTarget(view: GameView, d: TargetsDecision): ChosenTarget[] {
  const [slot] = d.specs;
  if (slot === undefined) return [];
  const mine = candidates(view, slot).filter(
    (c) => c.view.controller === view.viewer && isCreature(c.view),
  );
  const bare = mine.filter((c) => (c.view.attachments ?? []).length === 0);
  const pick = byPower(bare.length > 0 ? bare : mine, true);
  const chosen = pick?.target ?? slot.legal[0];
  return chosen === undefined ? [] : [chosen];
}

/**
 * Which attachment decision `d` belongs to: the Aura spell being cast, the equip ability being
 * activated, or neither. The stack object of the decision tells.
 */
export function attachmentContext(
  view: GameView,
  d: TargetsDecision,
): { kind: 'aura'; aura: ObjectView } | { kind: 'equip' } | null {
  const source = findObject(view, d.source);
  if (source === undefined) return null;
  if (source.zone === 'stack' && isAura(source)) return { kind: 'aura', aura: source };
  if (source.abilitySource !== undefined) {
    const origin = findObject(view, source.abilitySource);
    if (origin !== undefined && isEquipment(origin) && origin.zone === 'battlefield') {
      return { kind: 'equip' };
    }
  }
  return null;
}
