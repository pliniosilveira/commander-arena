/**
 * Validation of the "cast later" family (D-128): the delayed triggered ability an effect creates (CR 603.7) and,
 * further down, Suspend, Madness and Foretell. Self-contained (it reads only `validate-base`), so
 * `validate-parts.ts` can call it.
 */
import { type Amount, type Effect, TRIGGER_STEPS } from './types';
import { isCount, isOneOf, issue, kindOf, type Out } from './validate-base';

type Delayed = Extract<Effect, { kind: 'delayedTrigger' }>;

/** The player selectors a delayed effect may use: they name players, never an object that may be gone. */
const DELAYED_PLAYERS = ['you', 'eachPlayer', 'eachOpponent'];

/**
 * CR 603.7: what a delayed triggered ability may do is a player-only effect with a fixed amount (`draw`,
 * `gainLife`, `loseLife`): the spell that creates it is gone when it triggers (CR 603.7c), so nothing in it may
 * name an object, a target or an X.
 */
export function checkDelayedTrigger(
  e: Delayed,
  path: string,
  out: Out,
  exiledAvailable = false,
  diesTrigger = false,
): void {
  if (!isOneOf(e.at?.step, [...TRIGGER_STEPS, 'nextMain'])) {
    issue(out, `${path}.at.step`, `unknown step ${JSON.stringify(e.at?.step)}`);
  }
  if (!isOneOf(e.at?.whose, ['you', 'each'])) {
    issue(
      out,
      `${path}.at.whose`,
      "a delayed trigger waits for the turn of 'you' or of 'each' player",
    );
  }
  const inner = e.effect;
  const kind = kindOf(inner);
  // D-205 (CR 603.7c, 400.7j): "return it to the battlefield under its owner's control at the beginning of the next end step", about the object an
  // earlier effect of the same sequence exiled (`moved`), as it is when the ability is created. Only onto the battlefield and only that object.
  // D-982 (CR 603.7c, 400.7, 603.10a): in a "dies" trigger, "return it to the battlefield ... at the beginning of your next upkeep" is about the card
  // the creature became in the graveyard (`triggerCard`), as it is when the ability is created and only if it is still there when it triggers.
  if (kind === 'moveToZone') {
    const move = inner as Extract<Effect, { kind: 'moveToZone' }>;
    const movedObject = exiledAvailable && kindOf(move.objects) === 'moved';
    const dyingObject = diesTrigger && kindOf(move.objects) === 'triggerCard';
    if (!movedObject && !dyingObject) {
      issue(
        out,
        `${path}.effect.objects`,
        "a delayed move names the object an effect before it exiled: 'moved' after an exile, or 'triggerCard' in a dies trigger",
      );
    }
    if (move.to !== 'battlefield') {
      issue(out, `${path}.effect.to`, 'a delayed move puts the object onto the battlefield');
    }
    return;
  }
  // D-217 (CR 603.7c): "add an amount of {C} equal to the amount of mana spent to cast that spell at the beginning of your next main phase": fixed mana,
  // a number of times that is a number or the mana spent on a spell this ability targets, fixed as the ability is created.
  if (kind === 'addMana') {
    const mana = (inner as Extract<Effect, { kind: 'addMana' }>).mana;
    const times = mana?.kind === 'fixed' ? mana.times : undefined;
    const spentOnTarget =
      typeof times === 'object' &&
      times !== null &&
      times.kind === 'manaSpent' &&
      times.of !== undefined;
    if (mana?.kind !== 'fixed' || !(spentOnTarget || (isCount(times) && times >= 1))) {
      issue(
        out,
        `${path}.effect.mana`,
        'a delayed mana effect adds fixed mana a number of times, a number or the mana spent on the spell it targets',
      );
    }
    if (e.at?.step !== 'nextMain' && e.at?.whose !== 'you') {
      issue(out, `${path}.at`, "a delayed mana effect is added in the controller's own turn");
    }
    return;
  }
  if (kind !== 'draw' && kind !== 'gainLife' && kind !== 'loseLife' && kind !== 'dealDamage') {
    issue(
      out,
      `${path}.effect`,
      `a delayed trigger may draw, gain life, lose life or deal damage only (or return what the effect before it exiled), not ${kind}`,
    );
    return;
  }
  const effect = inner as Extract<
    Effect,
    { kind: 'draw' | 'gainLife' | 'loseLife' | 'dealDamage' }
  >;
  if (effect.kind === 'dealDamage') {
    // D-151: "deals 2 damage to each opponent for each of those cards that are still exiled": the source is the permanent
    // that created it (the one the effect names, `this`), the recipients are players.
    if (!isOneOf(kindOf(effect.to), DELAYED_PLAYERS)) {
      issue(
        out,
        `${path}.effect.to`,
        'a delayed effect names players only: you, each player or each opponent',
      );
    }
    if (effect.from !== undefined) {
      issue(out, `${path}.effect.from`, 'a delayed damage effect is dealt by its own source');
    }
  } else if (
    effect.kind === 'draw' &&
    effect.upTo === true &&
    effect.player?.kind === 'controllerOf' &&
    kindOf(effect.player.of) === 'target'
  ) {
    // D-217: "Its controller may draw up to two cards at the beginning of the next turn's upkeep": the player is the controller of a spell this ability targets.
  } else if (effect.kind === 'draw' && effect.upTo === true) {
    issue(
      out,
      `${path}.effect.player`,
      'a delayed draw of up to some cards is by the controller of a target',
    );
  } else if (!isOneOf(effect.player?.kind, DELAYED_PLAYERS)) {
    issue(
      out,
      `${path}.effect.player`,
      'a delayed effect names players only: you, each player or each opponent',
    );
  }
  const amount = effect.kind === 'draw' ? effect.count : effect.amount;
  if (!delayedAmountOk(amount, exiledAvailable)) {
    issue(
      out,
      `${path}.effect`,
      exiledAvailable
        ? 'a delayed effect has a fixed amount of at least 1, or a multiple of "those cards that are still exiled"'
        : 'a delayed effect has a fixed amount of at least 1',
    );
  }
}

/** A delayed effect's amount (D-151): a number of at least 1, or (after an exile effect) a multiple of `exiledStillThere`. */
function delayedAmountOk(a: Amount, exiledAvailable: boolean): boolean {
  if (isCount(a)) return a >= 1;
  if (!exiledAvailable || typeof a !== 'object' || a === null) return false;
  if (a.kind === 'exiledStillThere') return true;
  return (
    a.kind === 'multiple' &&
    Number.isSafeInteger(a.factor) &&
    a.factor >= 2 &&
    delayedAmountOk(a.of, true)
  );
}

export function checkEngineOnlyEffect(kind: string, path: string, out: Out): void {
  issue(
    out,
    path,
    `${kind} is part of the engine's Suspend and Madness abilities; a card writes the keyword or the alternative cost`,
  );
}
