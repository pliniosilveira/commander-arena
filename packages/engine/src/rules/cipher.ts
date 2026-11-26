/**
 * Cipher (CR 702.99, number as the task of this group gave it: the CR text was not in the worktree to check it): "Then you may exile this spell card encoded on a creature you control.
 * Whenever that creature deals combat damage to a player, its controller may cast a copy of the encoded card without paying its mana cost."
 *
 * The keyword is a static ability of an instant or a sorcery that works while the spell is on the stack: as the spell resolves, after its other effects, and only if it is represented by a
 * card (a copy of the spell is not), its controller may choose a creature they control; the card is then exiled instead of put into the graveyard and is encoded on that creature
 * (a countered or fizzled spell never gets here and goes to the graveyard). The creature has, from then on, a triggered ability of its own that copies the encoded card and lets
 * its controller cast the copy: a continuous effect of layer 6 on that object, so it lasts while the creature stays on the battlefield (a creature that leaves is a new object, CR 400.7,
 * and the card is no longer encoded on anything, though it stays in exile), it is the creature's own (another player who gains control of it controls the ability, and a creature that
 * loses its abilities loses it while the card stays encoded), and each card encoded on the creature has an ability of its own, so two encoded cards are two copies.
 */
import type { Ability } from '../ast/types';
import type { CardFace } from '../cards/definition';
import type { ObjectId } from '../ids';
import { allocateTimestamp } from '../state/ops';
import type { GameObject, GameState } from '../state/types';
import { controllerOf } from './control';
import { derive } from './derive';

/** Whether the face has Cipher (several instances are redundant). */
export function hasCipher(face: CardFace | null): boolean {
  return (face?.abilities ?? []).some((a) => a.kind === 'keyword' && a.keyword.kind === 'cipher');
}

/**
 * Whether the resolving spell may be encoded: an instant or sorcery with the keyword, represented by a card (not a copy: `card` is null for a copy), that would go to its owner's
 * graveyard and that no other effect or keyword sends elsewhere.
 */
export function ciphers(
  face: CardFace | null,
  obj: GameObject,
  otherPlace: { readonly permanent: boolean; readonly elsewhere: boolean },
): boolean {
  return (
    !otherPlace.permanent &&
    !otherPlace.elsewhere &&
    obj.card !== null &&
    obj.stack?.kind === 'spell' &&
    obj.stack.flashback !== true &&
    obj.stack.jumpStart !== true &&
    obj.stack.aftermath !== true &&
    obj.stack.alt !== 'harmonize' &&
    obj.stack.exileInstead !== true &&
    hasCipher(face)
  );
}

/** The creatures the controller of the spell controls: the ones the card may be encoded on (CR 702.99), in the order of the battlefield. */
export function cipherCandidates(state: GameState, spell: GameObject): ObjectId[] {
  const controller = controllerOf(state, spell);
  return state.battlefield.filter((id) => {
    const obj = state.objects[id];
    return (
      obj !== undefined &&
      controllerOf(state, obj) === controller &&
      derive(state, obj).types.includes('creature')
    );
  });
}

/** The ability an encoded card gives its creature: "Whenever this creature deals combat damage to a player, you may copy the encoded card and you may cast the copy without paying its mana cost." */
export function encodedAbility(card: ObjectId): Ability {
  return {
    kind: 'triggered',
    trigger: { kind: 'dealsCombatDamage', what: { kind: 'this' }, to: 'player' },
    effect: {
      kind: 'copyCardAndCast',
      objects: { kind: 'boundObjects', ids: [card], zone: 'exile' },
    },
  };
}

/** The card `card` (in exile) is encoded on `creature`: the creature has the ability above for as long as it stays the same object on the battlefield. */
export function encodeOn(state: GameState, card: ObjectId, creature: ObjectId): GameState {
  const [stamp, stamped] = allocateTimestamp(state);
  return {
    ...stamped,
    continuousEffects: [
      ...stamped.continuousEffects,
      {
        id: `ce${stamp}`,
        timestamp: stamp,
        objects: [creature],
        until: 'permanent',
        change: { kind: 'grantAbility', ability: encodedAbility(card) },
      },
    ],
  };
}
