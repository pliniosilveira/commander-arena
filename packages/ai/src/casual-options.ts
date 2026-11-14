/**
 * CasualAgent's answer to "As this enters, choose a creature type / a color" (D-100). It picks what its
 * own cards share most, so a lord or a cost reducer of that type works for it: the creature type found on
 * most of the cards in its hand and the creatures it controls, the color found on most of its hand and
 * its permanents. With nothing to count it falls back on its commander (the command zone and the
 * battlefield are public), and with no commander either on the first option. Ties go to the option listed
 * first, so the answer is deterministic and uses no randomness. The view shows an agent its hand, never a
 * library, so (unlike the library) only what the view shows is counted; that is a deliberate limit.
 */
import type { Action, ChooseOptionDecision, GameView, ObjectView } from '@commander-arena/engine';
import { chooseCardType } from './casual-card-type';
import { chooseNamedOption } from './casual-dragons';
import { chooseRiot } from './casual-keywords';
import { choosePile } from './casual-piles';
import { chooseProtectionColor } from './casual-protection';
import { ownCommandZone, ownHand } from './casual-view';
import { chooseVote } from './casual-vote';

/** The creature type or color names the object has, as the decision spells them. */
function namesOf(
  d: ChooseOptionDecision,
  o: ObjectView,
  spelled: ReadonlyMap<string, string>,
): string[] {
  if (d.purpose === 'color') return o.colors.filter((c) => d.options.includes(c));
  // A creature type is a subtype of a creature or kindred card; the rules spell two of them with a
  // typographic apostrophe, which a card's text may write plainly.
  if (!o.types.includes('creature') && !o.types.includes('kindred')) return [];
  return o.subtypes.flatMap((s) => {
    const option = spelled.get(s.replaceAll('’', "'"));
    return option === undefined ? [] : [option];
  });
}

/** The option that most of `objects` share, ties to the earlier option; null when none shares any. */
function mostCommon(
  d: ChooseOptionDecision,
  objects: readonly ObjectView[],
  spelled: ReadonlyMap<string, string>,
): string | null {
  const counts = new Map<string, number>();
  for (const o of objects) {
    for (const name of new Set(namesOf(d, o, spelled)))
      counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const option of d.options) {
    const n = counts.get(option) ?? 0;
    if (n > bestCount) {
      best = option;
      bestCount = n;
    }
  }
  return best;
}

/**
 * "Reselect which player or permanent an attacking creature is attacking" (`attackTarget`, D-139, CR 508.7). When the creature is the
 * agent's own, it attacks the opponent with the least life (a player over a planeswalker); when it is an opponent's, the agent sends it
 * at something that is not its own: another player, or a permanent of another player, and when everything is its own it keeps the
 * current target (the first option the engine lists is any, so the choice is deterministic).
 */
function chooseAttackTargetAnswer(view: GameView, d: ChooseOptionDecision): Action {
  const targets = d.attackTargets ?? [];
  const attacker = view.battlefield.find((o) => o.id === d.attacker);
  const mine = attacker?.controller === view.viewer;
  const lifeOf = (seat: number): number => view.seats[seat]?.life ?? Number.POSITIVE_INFINITY;
  const owner = (t: (typeof targets)[number]): number | undefined =>
    t.kind === 'player' ? t.seat : view.battlefield.find((o) => o.id === t.object)?.controller;
  const ranked = targets
    .map((t, index) => {
      const who = owner(t);
      const own = who === view.viewer;
      return {
        option: d.options[index],
        index,
        // Redirecting a creature of mine: players first, the lowest life first. Redirecting another's: away from me.
        score: mine
          ? (t.kind === 'player' ? 0 : 1000) + lifeOf(who ?? 0)
          : (own ? 1_000_000 : 0) + (t.kind === 'player' ? 0 : 1000),
      };
    })
    .sort((a, b) => a.score - b.score || a.index - b.index);
  const option = ranked[0]?.option ?? d.options[0];
  if (option === undefined) throw new Error('a choice with no options');
  return { kind: 'chooseOption', option };
}

/**
 * The words of the instructions an effect offers that the agent likes best, in order (D-175, CR 608.2d: "create a Food token or a Treasure
 * token", `purpose` 'effect'). The decision carries only the words of each instruction, so the agent reads those: mana it can spend this turn
 * (a Treasure), then a card (draw), else the first option listed. Deterministic, no randomness.
 */
const LIKED_INSTRUCTIONS: readonly RegExp[] = [/\btreasure\b/i, /\bdraw\b/i];

function chooseOfferedInstruction(d: ChooseOptionDecision): Action {
  for (const liked of LIKED_INSTRUCTIONS) {
    const option = d.options.find((o) => liked.test(o));
    if (option !== undefined) return { kind: 'chooseOption', option };
  }
  const first = d.options[0];
  if (first === undefined) throw new Error('a choice with no options');
  return { kind: 'chooseOption', option: first };
}

/**
 * Which prevention effect to apply first to a damage event (CR 616.1, D-191, `purpose` 'replacement'): the first option, which the engine lists in
 * its default order, the effects that prevent all damage and then the numeric shields oldest first: "prevent first", the owner's stated default.
 * Always legal and deterministic. The HeuristicAgent reads what each choice leads to instead (`heuristic-replacement.ts`).
 */
function chooseFirstReplacement(d: ChooseOptionDecision): Action {
  const first = d.options[0];
  if (first === undefined) throw new Error('a choice with no options');
  return { kind: 'chooseOption', option: first };
}

export function chooseOptionAnswer(view: GameView, d: ChooseOptionDecision): Action {
  if (d.purpose === 'replacement') return chooseFirstReplacement(d);
  // CR 712.21a, 712.21b (D-279): the order of the two cards a melded permanent became. Nothing in the game reads it for the agent's plans, so the first
  // option, deterministic and always legal.
  if (d.purpose === 'meldOrder') return chooseFirstReplacement(d);
  // CR 700.3 (D-303): which of two piles of revealed cards goes to the hand (casual-piles.ts).
  if (d.purpose === 'pile') return choosePile(view, d);
  // CR 701.38a (D-194): a vote, from the words and the votes so far.
  if (d.purpose === 'vote') return chooseVote(d);
  if (d.purpose === 'attackTarget') return chooseAttackTargetAnswer(view, d);
  if (d.purpose === 'effect') return chooseOfferedInstruction(d);
  // CR 702.136a (D-185): the counter or haste of riot.
  if (d.purpose === 'riot') return chooseRiot(view, d);
  // D-151: a name from a list the card gives, the chapter of a Saga with read ahead (casual-dragons.ts).
  if (d.purpose === 'option') return chooseNamedOption(d);
  // D-376 (CR 614.12a): "choose a card type", the type the opponents' permanents have most of (casual-card-type.ts).
  if (d.purpose === 'cardType') return chooseCardType(view, d);
  // D-451 (CR 702.16, 608.2d): "gains protection from the color of your choice", the color that threatens the protected permanents (casual-protection.ts).
  if (d.purpose === 'protectionColor') return chooseProtectionColor(view, d);
  const spelled = new Map(d.options.map((o) => [o.replaceAll('’', "'"), o] as const));
  const mine = view.battlefield.filter((o) => o.controller === view.viewer);
  const commanders = [...ownCommandZone(view), ...mine].filter((o) => o.isCommander);
  const option =
    mostCommon(d, [...ownHand(view), ...mine], spelled) ??
    mostCommon(d, commanders, spelled) ??
    d.options[0];
  if (option === undefined) throw new Error('a choice with no options');
  return { kind: 'chooseOption', option };
}
