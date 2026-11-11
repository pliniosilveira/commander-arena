/**
 * The Ring-bearer (a `choosePermanent` with `purpose: 'ringBearer'`, CR 701.54a, D-196): the creature that becomes the agent's Ring-bearer, one of
 * `legal` (all creatures the agent controls). The Ring-bearer is legendary and can't be blocked by creatures with greater power, and from the second
 * time the Ring tempts its controller it loots when it attacks, makes its blockers sacrifice themselves and drains the opponents when it connects
 * (CR 701.54c), so the creature to choose is the one that will attack and connect.
 *
 * `chooseRingBearer` (the casual agent) takes the creature with the most power: the first of the list when two tie. `chooseRingBearerWithEvasion`
 * (the heuristic agent) weighs what the designation adds: the opposing creatures it makes unable to block (those with greater power), the keywords that
 * already help it connect or survive, its toughness, and a little less for a creature that cannot attack yet (summoning sickness).
 */
import type {
  Action,
  ChoosePermanentDecision,
  GameView,
  ObjectView,
} from '@commander-arena/engine';
import {
  findObject,
  hasKeyword,
  isCreature,
  opposingCreatures,
  powerOf,
  toughnessOf,
} from './casual-view';

type Candidate = { readonly id: ChoosePermanentDecision['legal'][number]; readonly o: ObjectView };

const candidatesOf = (view: GameView, d: ChoosePermanentDecision): Candidate[] =>
  d.legal.flatMap((id) => {
    const o = findObject(view, id);
    return o === undefined || !isCreature(o) ? [] : [{ id, o }];
  });

/** The candidate with the best score; the first in the list wins a tie, so the answer is deterministic. */
function best(
  candidates: readonly Candidate[],
  score: (o: ObjectView) => number,
): Candidate | undefined {
  let top: Candidate | undefined;
  let topScore = Number.NEGATIVE_INFINITY;
  for (const c of candidates) {
    const s = score(c.o);
    if (s > topScore) {
      top = c;
      topScore = s;
    }
  }
  return top;
}

const answer = (d: ChoosePermanentDecision, chosen: Candidate | undefined): Action => {
  const id = chosen?.id ?? d.legal[0];
  return { kind: 'choosePermanents', objects: id === undefined ? [] : [id] };
};

/** The casual agent's choice: the creature with the most power. */
export function chooseRingBearer(view: GameView, d: ChoosePermanentDecision): Action {
  return answer(d, best(candidatesOf(view, d), powerOf));
}

/** What a keyword adds to a creature that attacks as the Ring-bearer: it connects more often, or it does not die in the exchange. */
const KEYWORD_VALUE: Readonly<Record<string, number>> = {
  flying: 3,
  menace: 2,
  trample: 2,
  'first strike': 2,
  'double strike': 3,
  deathtouch: 2,
  lifelink: 2,
  haste: 1,
  vigilance: 1,
  indestructible: 2,
};

/** The heuristic agent's choice: see the file's comment. */
export function chooseRingBearerWithEvasion(view: GameView, d: ChoosePermanentDecision): Action {
  const blockers = opposingCreatures(view).filter((o) => !o.tapped);
  const score = (o: ObjectView): number => {
    const keywords = Object.entries(KEYWORD_VALUE).reduce(
      (sum, [word, value]) => sum + (hasKeyword(o, word) ? value : 0),
      0,
    );
    // The opposing creatures with greater power that can no longer block it (CR 701.54c): each one is a blocker fewer.
    const evaded = blockers.filter((b) => powerOf(b) > powerOf(o)).length;
    return (
      powerOf(o) + 0.5 * toughnessOf(o) + keywords + 0.75 * evaded - (o.summoningSick ? 0.5 : 0)
    );
  };
  return answer(d, best(candidatesOf(view, d), score));
}
