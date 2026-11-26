/**
 * CasualAgent's answers to "As this creature enters, choose a player" (`purpose` 'player') and "choose a nonland card name" (`purpose` 'cardName'), CR 614.12a, 607.2d.
 *
 * - The player: an opponent with the most cards in their graveyard (what a creature that counts that graveyard grows with, and the player whose spells it punishes), ties to the first
 *   listed; itself only when no opponent is left.
 * - The name: the nonland permanent an opponent controls whose rules text has the most activated abilities (a line with a cost before a colon), ties to the first one in the view; with
 *   none, a name from the suggestions that is not one of its own permanents, else the name of the permanent that asks (always a legal answer: any non-empty name is one).
 *
 * Deterministic, no randomness; only what the view shows (every player's battlefield and graveyard) is read.
 */
import type { Action, ChooseOptionDecision, GameView } from '@commander-arena/engine';

export function choosePlayerOption(view: GameView, d: ChooseOptionDecision): Action {
  const graveyardOf = (option: string): number =>
    view.seats.find((s) => `seat:${s.id}` === option)?.graveyard.length ?? 0;
  let best: string | undefined;
  for (const option of d.options) {
    if (option === `seat:${d.seat}`) continue;
    if (best === undefined || graveyardOf(option) > graveyardOf(best)) best = option;
  }
  const option = best ?? d.options[0];
  if (option === undefined) throw new Error('a choice of a player with no options');
  return { kind: 'chooseOption', option };
}

/** The lines of rules text that read "cost: effect": each is an activated ability (a loyalty ability and a mana ability are too). */
function activatedLines(text: string): number {
  return text.split('\n').filter((line) => /^[^"“]*?[}\d\w]\s*:\s/u.test(line)).length;
}

export function chooseCardNameOption(view: GameView, d: ChooseOptionDecision): Action {
  let best: string | null = null;
  let bestCount = 0;
  for (const o of view.battlefield) {
    if (o.controller === view.viewer || o.types.includes('land') || o.name === '') continue;
    const n = activatedLines(o.oracleText);
    if (n > bestCount) {
      best = o.name;
      bestCount = n;
    }
  }
  const mine = new Set(
    view.battlefield.filter((o) => o.controller === view.viewer).map((o) => o.name),
  );
  const option = best ?? d.options.find((name) => !mine.has(name)) ?? d.sourceName;
  return { kind: 'chooseOption', option };
}
