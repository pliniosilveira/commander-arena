/**
 * "The owner of target permanent puts it on their choice of the top or bottom of their library." (CR 108.3, 401.4, issue 81, Plan for All Outcomes): for each permanent the effect names
 * that is on the battlefield (and, Endless Detour, each spell on the stack and each card in a graveyard), its owner (not its controller) is asked, one object after the other, where it goes:
 * on top of their library or on the bottom. A token ceases to exist
 * (CR 111.7) as it leaves the battlefield. The choice is a `chooseOne` the owner answers.
 */
import type { Effect } from '../ast/types';
import type { ObjectId } from '../ids';
import type { GameState, Instruction } from '../state/types';
import { done, type StepOutcome } from './step-outcome';

export function runOwnerLibraryChoice(state: GameState, ids: readonly ObjectId[]): StepOutcome {
  const queue: Instruction[] = [];
  for (const id of ids) {
    const object = state.objects[id];
    // The permanent on the battlefield, the spell on the stack and the card in a graveyard (Endless Detour); an ability on the stack is none of these.
    if (
      object === undefined ||
      (object.zone !== 'battlefield' &&
        object.zone !== 'graveyard' &&
        !(object.zone === 'stack' && object.stack?.kind === 'spell'))
    ) {
      continue;
    }
    const move = (position: 'top' | 'bottom'): Effect => ({
      kind: 'moveToZone',
      objects: { kind: 'boundObjects', ids: [id] },
      to: 'library',
      position,
    });
    queue.push({
      kind: 'effect',
      effect: {
        kind: 'chooseOne',
        // The owner chooses, not the controller of the effect (CR 108.3).
        chooser: { kind: 'ownerOf', of: { kind: 'boundObjects', ids: [id] } },
        options: [
          { label: 'on top of your library', effect: move('top') },
          { label: 'on the bottom of your library', effect: move('bottom') },
        ],
      },
    });
  }
  return done(state, [], queue);
}
