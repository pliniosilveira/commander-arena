/**
 * Why a creature cannot block an attacker, in words (CR 509.1b, D-094). The engine offers only the
 * blocks that are legal, so an attacker the picked-up blocker cannot block is simply not clickable;
 * this explains the common reasons from what the view shows. It mirrors the engine's evasion
 * checks (`combat-legality.ts`) and says nothing when none of them applies, so it never guesses a
 * reason (flying and reach, a blocker already tapped and the like are not covered).
 */
import type { ObjectView } from '@commander-arena/engine';
import { landwalkName } from '../board/keywords';

const isArtifactCreature = (o: ObjectView) =>
  o.types.includes('artifact') && o.types.includes('creature');

/** The land type a landwalk names, with an article: "an Island", "a nonbasic land". */
function landPhrase(landType: string): string {
  if (landType === 'nonbasic') return 'a nonbasic land';
  return /^[AEIOU]/.test(landType) ? `an ${landType}` : `a ${landType}`;
}

/** True when `lands` (the defending player's permanents) hold the land a landwalk looks for. */
function controlsWalked(lands: readonly ObjectView[], landType: string): boolean {
  return lands.some(
    (o) =>
      o.types.includes('land') &&
      (landType === 'nonbasic'
        ? !o.supertypes.includes('basic')
        : (o.subtypes as readonly string[]).includes(landType)),
  );
}

/**
 * The reasons `blocker` cannot block `attacker` that the view can show, first to last. `defending`
 * is every permanent the blocker's controller controls. Empty when none of the evasion rules applies.
 */
export function blockRefusals(
  attacker: ObjectView,
  blocker: ObjectView,
  defending: readonly ObjectView[],
  /** Set when the attacker already has its most blockers (D-133): the limit it allows. */
  fullAt?: number,
): readonly string[] {
  const reasons: string[] = [];
  if (fullAt !== undefined) {
    reasons.push(
      `can't be blocked by more than ${fullAt === 1 ? 'one creature' : `${fullAt} creatures`}`,
    );
  }
  if (attacker.restrictions?.includes('cantBeBlocked') === true) reasons.push("can't be blocked");
  for (const type of attacker.landwalks ?? []) {
    if (controlsWalked(defending, type)) {
      reasons.push(`${landwalkName(type).toLowerCase()}: you control ${landPhrase(type)}`);
    }
  }
  if (
    attacker.keywords.includes('fear') &&
    !isArtifactCreature(blocker) &&
    !blocker.colors.includes('B')
  ) {
    reasons.push('fear: only artifact or black creatures can block it');
  }
  if (
    attacker.keywords.includes('intimidate') &&
    !isArtifactCreature(blocker) &&
    !blocker.colors.some((c) => attacker.colors.includes(c))
  ) {
    reasons.push(
      'intimidate: only artifact creatures and creatures that share a color can block it',
    );
  }
  const attackerShadow = attacker.keywords.includes('shadow');
  const blockerShadow = blocker.keywords.includes('shadow');
  if (attackerShadow && !blockerShadow) {
    reasons.push('shadow: only creatures with shadow can block it');
  } else if (!attackerShadow && blockerShadow) {
    reasons.push('shadow: a creature with shadow can block only creatures with shadow');
  }
  return reasons;
}

/**
 * The sentence for the block bar while `blocker` is picked up: "X can't block A (can't be blocked)
 * or B (islandwalk: you control an Island)." Null when every attacker it cannot block has no reason
 * the view can show, or it can block them all.
 */
export function blockRefusalText(
  blocker: ObjectView,
  refused: readonly { readonly attacker: ObjectView; readonly reasons: readonly string[] }[],
): string | null {
  const shown = refused.filter((r) => r.reasons.length > 0);
  if (shown.length === 0) return null;
  const parts = shown.map((r) => `${r.attacker.name} (${r.reasons.join('; ')})`);
  return `${blocker.name} can't block ${parts.join(' or ')}.`;
}
