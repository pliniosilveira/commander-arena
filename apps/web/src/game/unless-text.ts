/**
 * Words for "[do something] unless [that player] pays [cost]" (CR 118.12a, `unlessPays`, D-111),
 * read from the effect's AST. The same effect is worded from two seats: the payer is asked first
 * ("Pay {1} or Opponent draws a card?") and the controller of the ability is asked "you may" after
 * (an `optional` effect: "Opponent didn't pay {1}. Draw a card?"). Only the effects the words know
 * (draw, discard, gain life, lose life with a whole-number amount) are said; any other gives null
 * and the caller words the question without the effect, never guessing at it.
 */
import type { Effect, PlayerSelector } from '@commander-arena/engine';

export type UnlessEffect = Extract<Effect, { kind: 'unlessPays' }>;

/** Which player a sentence is about, relative to the viewer. */
export type Who = 'you' | 'opp';

/** The `unlessPays` effect of an ability's effect: the effect itself or one step of a sequence. */
export function findUnless(effect: Effect): UnlessEffect | null {
  if (effect.kind === 'unlessPays') return effect;
  if (effect.kind === 'sequence') {
    for (const step of effect.effects) {
      const found = findUnless(step);
      if (found !== null) return found;
    }
  }
  return null;
}

const flip = (who: Who): Who => (who === 'you' ? 'opp' : 'you');

const same = (a: PlayerSelector, b: PlayerSelector): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

/** Who a player selector of the effect names, or null when it cannot be told. */
function whoIs(
  selector: PlayerSelector,
  unless: UnlessEffect,
  controller: Who,
  payer: Who,
): Who | 'each' | null {
  if (same(selector, unless.player)) return payer;
  switch (selector.kind) {
    case 'you':
      return controller;
    case 'eachOpponent':
      // Two seats in v1: the opponent of the controller.
      return flip(controller);
    case 'eachPlayer':
      return 'each';
    default:
      return null;
  }
}

/** The payer, relative to the viewer: given by the question for the payer, else read from the effect. */
export function payerOf(unless: UnlessEffect, controller: Who, asked: Who | null): Who {
  if (asked !== null) return asked;
  return unless.player.kind === 'you' ? controller : flip(controller);
}

const amountOf = (n: unknown): number | null => (typeof n === 'number' ? n : null);

/** The effect as an imperative: "draw a card", "lose 2 life"; null for an effect the words do not know. */
export function effectBase(effect: Effect): string | null {
  switch (effect.kind) {
    case 'draw': {
      const n = amountOf(effect.count);
      return n === null ? null : `draw ${n === 1 ? 'a card' : `${n} cards`}`;
    }
    case 'discard': {
      const n = amountOf(effect.count);
      return n === null ? null : `discard ${n === 1 ? 'a card' : `${n} cards`}`;
    }
    case 'gainLife': {
      const n = amountOf(effect.amount);
      return n === null ? null : `gain ${n} life`;
    }
    case 'loseLife': {
      const n = amountOf(effect.amount);
      return n === null ? null : `lose ${n} life`;
    }
    default:
      return null;
  }
}

/** The player the effect is about (the controller in "you may draw"), for the effect's own selector. */
function effectPlayer(effect: Effect): PlayerSelector | null {
  return effect.kind === 'draw' ||
    effect.kind === 'discard' ||
    effect.kind === 'gainLife' ||
    effect.kind === 'loseLife'
    ? effect.player
    : null;
}

/** "draw" to "draws": the third person of the first word of the imperative. */
function thirdPerson(base: string): string {
  const [verb = '', ...rest] = base.split(' ');
  return [`${verb}${verb.endsWith('s') ? 'es' : 's'}`, ...rest].join(' ');
}

/**
 * What happens if the payer does not pay, as a sentence: "Opponent draws a card", "You lose 2 life",
 * "Opponent may draw a card" for an optional effect. `controller` and `payer` are relative to the
 * viewer. Null when the effect or its player cannot be told.
 */
export function unlessResultText(
  unless: UnlessEffect,
  controller: Who,
  payer: Who,
): { readonly subject: string; readonly base: string; readonly text: string } | null {
  const base = effectBase(unless.effect);
  const selector = effectPlayer(unless.effect);
  if (base === null || selector === null) return null;
  const who = whoIs(selector, unless, controller, payer);
  if (who === null) return null;
  const subject = who === 'you' ? 'You' : who === 'opp' ? 'Opponent' : 'Each player';
  const text =
    unless.optional === true
      ? `${subject} may ${base}`
      : who === 'you'
        ? `${subject} ${base}`
        : `${subject} ${thirdPerson(base)}`;
  return { subject, base, text };
}

/** A sentence in the middle of another: "You lose 2 life" after "or" or ";" is "you lose 2 life". */
export function inSentence(text: string): string {
  return text.startsWith('You ') ? `you ${text.slice(4)}` : text;
}
