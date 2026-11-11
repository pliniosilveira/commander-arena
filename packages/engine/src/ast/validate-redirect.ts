/**
 * Checks of the damage redirection slice (D-192): the replacement `redirectDamage` ("All damage that would be dealt to you and other
 * permanents you control is dealt to this creature instead", CR 614.9) and the static `keepsDamage` ("Damage isn't removed from this creature
 * during cleanup steps", CR 514.2). `validate.ts` calls into this file for the kinds it does not know itself.
 */
import type { CardFace } from '../cards/definition';
import type { Replacement, StaticEffect } from './types';
import { kindOf } from './validate-base';
import { type AstIssue, checkFilter, filterSome, issue } from './validate-parts';

/** The replacement kind D-192 adds. True when `r` is it (it was checked here). */
export function checkRedirectReplacement(r: Replacement, path: string, out: AstIssue[]): boolean {
  if (r?.kind !== 'redirectDamage') return false;
  if (typeof r.you !== 'boolean') issue(out, `${path}.you`, 'you is true or false');
  if (r.permanents === undefined) {
    if (r.you !== true) {
      issue(out, path, 'a redirection names at least one recipient: "you" or permanents');
    }
    return true;
  }
  checkFilter(r.permanents, `${path}.permanents`, out);
  if (r.permanents.controller !== 'you') {
    // The creature that gets the damage must be controlled by the player who chooses the order (CR 616.1): the recipients are the
    // controller's own, so redirecting to a creature controlled by another player does not arise.
    issue(
      out,
      `${path}.permanents.controller`,
      'the permanents a redirection covers are the controller\'s own: controller must be "you"',
    );
  }
  if (
    filterSome(
      r.permanents,
      (f) =>
        f.zone !== undefined ||
        f.owner !== undefined ||
        f.stackKind !== undefined ||
        f.manaValueX !== undefined ||
        f.controllerDealtDamageBySource !== undefined ||
        f.putFromBattlefieldThisTurn !== undefined ||
        f.enteredThisTurn !== undefined,
    )
  ) {
    issue(
      out,
      `${path}.permanents`,
      'the recipients are permanents on the battlefield: no zone, owner, stackKind, X or "this turn" reading',
    );
  }
  return true;
}

/** The static kind D-192 adds. True when `s` is it (it was checked here). */
export function checkRedirectStatic(s: StaticEffect, path: string, out: AstIssue[]): boolean {
  if (s?.kind !== 'keepsDamage') return false;
  if (kindOf(s.subject) !== 'this') {
    issue(out, `${path}.subject`, 'keepsDamage is about the permanent itself ("this")');
  }
  return true;
}

/** What a face with a redirection must be (CR 614.9: damage is redirected to a creature, planeswalker or battle; the engine redirects to a creature). */
export function redirectFaceIssues(face: CardFace, path: string, out: AstIssue[]): void {
  face.abilities.forEach((a, i) => {
    if (
      a?.kind === 'replacement' &&
      a.replacement?.kind === 'redirectDamage' &&
      !face.types.includes('creature')
    ) {
      issue(
        out,
        `${path}.abilities[${i}].replacement`,
        'a redirection deals the damage to the permanent with it: only a creature face is run (CR 614.9)',
      );
    }
  });
}
