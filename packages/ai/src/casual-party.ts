/**
 * CasualAgent and the party of Stick Together (`chooseParty`, CR 700.8d): "choose a party from among creatures you control, then sacrifice the rest". Every creature left out is
 * sacrificed, so the best party is the one that keeps the most the agent values (`permanentValue`): the assignment of creatures to the Cleric, Rogue, Warrior and Wizard places
 * with the greatest total value, a creature with several of the types filling the place that lets the others stay. The parties the engine lists are all the assignments (fullest first), so
 * the agent takes the best of them; a party with fewer creatures is never better, since keeping a creature is never worth less than nothing.
 */
import {
  type Action,
  type ChoosePartyDecision,
  enumerateParties,
  type GameView,
  type ObjectId,
} from '@commander-arena/engine';
import { permanentValue } from './casual-permanents';
import { findObject } from './casual-view';

/** More than any real board offers: a party has at most four members, so there are at most (creatures + 1) to the fourth power of them. */
const ALL_PARTIES = 100_000;

export function choosePartyAnswer(view: GameView, d: ChoosePartyDecision): Action {
  const value = (id: ObjectId): number => {
    const o = findObject(view, id);
    return o === undefined ? 0 : permanentValue(view, o);
  };
  let best: { party: ReturnType<typeof enumerateParties>[number]; score: number } | undefined;
  for (const party of enumerateParties(d.slots, ALL_PARTIES)) {
    const score = party.reduce((sum, m) => sum + value(m.object), 0);
    // Strictly better only: the first of equal parties (the fullest, in the engine's order) stays.
    if (best === undefined || score > best.score) best = { party, score };
  }
  return { kind: 'chooseParty', party: best?.party ?? [] };
}
