/**
 * Checks of the Artifacts slice (D-139): what a keyword or a static ability needs of its own parts, and of the card it is printed on
 * and the other abilities of the card. `validate.ts` calls `checkArtifactsFace` for each face and `checkArtifactsStatic` for the
 * static effects it does not know itself.
 */

import type { CardFace } from '../cards/definition';
import { CARD_TYPES } from '../characteristics';
import type { StaticEffect } from './types';
import { checkStaticSubject } from './validate-attach';
import { isOneOf, kindOf } from './validate-base';
import { type AstIssue, checkFilter, filterSome, issue } from './validate-parts';

/** CR 702.92a: Living weapon belongs to an Equipment (it attaches "this Equipment" to the Germ). */
function checkLivingWeapon(face: CardFace, path: string, out: AstIssue[]): void {
  face.abilities.forEach((a, i) => {
    if (
      a?.kind !== 'keyword' ||
      (a.keyword?.kind !== 'livingWeapon' && a.keyword?.kind !== 'jobSelect')
    )
      return;
    if (!face.types.includes('artifact') || !face.subtypes.includes('Equipment')) {
      const [name, rule] =
        a.keyword.kind === 'jobSelect' ? ['job select', '702.182a'] : ['living weapon', '702.92a'];
      issue(
        out,
        `${path}.abilities[${i}]`,
        `${name} is the ability of an Equipment (CR ${rule}): an artifact with the subtype Equipment`,
      );
    }
  });
}

/** Whether the effect, at any depth, moves a card chosen from the cards the permanent exiled (D-207). */
function readsLinkedExile(e: unknown): boolean {
  const text = JSON.stringify(e ?? null);
  return (
    (text.includes('"zone":"exile"') && text.includes('"kind":"choose"')) ||
    // D-230: "return the exiled card": the `linkedExile` reference (Fiend Hunter, Skyclave Apparition, the token Hofri makes).
    text.includes('"kind":"linkedExile"')
  );
}

/** Whether the effect is, or holds at any depth, an `exile` with `linked`. */
function hasLinkedExile(e: unknown): boolean {
  return (
    (JSON.stringify(e ?? null).includes('"kind":"exile"') &&
      JSON.stringify(e).includes('"linked":true')) ||
    // D-230: a token that copies a creature and remembers the cards the effect before it exiled holds the link itself.
    JSON.stringify(e ?? null).includes('"linkExiled":true')
  );
}

/**
 * CR 607.2a (D-139): the static ability that reads the cards "exiled with" a permanent and the ability that exiles them are linked: a
 * face with one needs the other, or the card would silently do nothing.
 */
function checkLinkedExile(face: CardFace, path: string, out: AstIssue[]): void {
  const reads = face.abilities.some(
    (a) =>
      (a?.kind === 'static' && a.static?.kind === 'takeFromLinkedExile') ||
      // D-207: "Put a card exiled with this artifact into its owner's graveyard": a choice among the cards of the linked exile.
      ((a?.kind === 'triggered' || a?.kind === 'activated') && readsLinkedExile(a.effect)),
  );
  const exiles = face.abilities.some(
    (a) => (a?.kind === 'triggered' || a?.kind === 'activated') && hasLinkedExile(a.effect),
  );
  // CR 702.75a (Hideaway): the keyword's own trigger exiles the card that "play the exiled card" reads (D-230).
  const hideaway = face.abilities.some(
    (a) => a?.kind === 'keyword' && a.keyword?.kind === 'hideaway',
  );
  if (reads && !exiles && !hideaway) {
    issue(
      out,
      `${path}.abilities`,
      'takeFromLinkedExile reads the cards this permanent exiled with a linked ability: the face needs an ability whose exile effect says linked',
    );
  }
  if (exiles && !reads) {
    issue(
      out,
      `${path}.abilities`,
      'a linked exile is read by a takeFromLinkedExile static ability of the same face: without one nothing uses the cards',
    );
  }
}

export function checkArtifactsFace(face: CardFace, path: string, out: AstIssue[]): void {
  checkLivingWeapon(face, path, out);
  checkLinkedExile(face, path, out);
}

/** The filter of a static ability that names what it applies to by a card's own words: no zone, owner or stack kind. */
function checkDescribing(f: unknown, path: string, out: AstIssue[]): void {
  const filter = f as Parameters<typeof checkFilter>[0];
  checkFilter(filter, path, out);
  if (filterSome(filter, (m) => m.zone !== undefined || m.stackKind !== undefined)) {
    issue(out, path, 'it names objects by what they are: no zone or stackKind');
  }
  if (filterSome(filter, (m) => m.owner !== undefined)) {
    issue(out, path, 'owner is only read in the "each" selector of an effect');
  }
}

/** The static effects D-139 adds. True when `s` is one of them (it was checked here). */
export function checkArtifactsStatic(s: StaticEffect, path: string, out: AstIssue[]): boolean {
  switch (s?.kind) {
    case 'setPt':
      checkStaticSubject(s.subject, `${path}.subject`, out);
      for (const key of ['power', 'toughness'] as const) {
        if (!Number.isSafeInteger(s[key]))
          issue(out, `${path}.${key}`, `${key} must be a whole number`);
      }
      return true;
    case 'cantBeBlockedBy':
      checkStaticSubject(s.subject, `${path}.subject`, out);
      if (s.blockers === undefined || s.blockers === null || typeof s.blockers !== 'object') {
        issue(
          out,
          `${path}.blockers`,
          'cantBeBlockedBy needs a filter of the creatures that can not block',
        );
      } else {
        checkDescribing(s.blockers, `${path}.blockers`, out);
      }
      return true;
    case 'takeFromLinkedExile':
      if (kindOf(s.subject) !== 'this') {
        issue(
          out,
          `${path}.subject`,
          'takeFromLinkedExile is the ability of the permanent itself ("this")',
        );
      }
      if (s.from === undefined || s.from === null || typeof s.from !== 'object') {
        issue(out, `${path}.from`, 'takeFromLinkedExile names which exiled card counts: a filter');
      } else {
        checkDescribing(s.from, `${path}.from`, out);
      }
      if (s.alsoSubtypes !== undefined) {
        if (!Array.isArray(s.alsoSubtypes) || s.alsoSubtypes.length === 0) {
          issue(out, `${path}.alsoSubtypes`, 'alsoSubtypes must be a non-empty list when present');
        } else {
          s.alsoSubtypes.forEach((t, i) => {
            if (typeof t !== 'string' || t === '')
              issue(out, `${path}.alsoSubtypes[${i}]`, 'empty subtype');
          });
        }
      }
      return true;
    case 'spellsCantBeCountered':
      // D-185: "Creature spells you control can't be countered": the filter describes the spell as it is on the stack.
      if (s.spells === undefined || s.spells === null || typeof s.spells !== 'object') {
        issue(out, `${path}.spells`, 'spellsCantBeCountered needs a filter of the spells');
      } else {
        checkDescribing(s.spells, `${path}.spells`, out);
      }
      return true;
    case 'castAsThoughFlash':
      if (s.spells === undefined || s.spells === null || typeof s.spells !== 'object') {
        issue(out, `${path}.spells`, 'castAsThoughFlash needs a filter of the spells');
      } else {
        checkDescribing(s.spells, `${path}.spells`, out);
      }
      return true;
    case 'setTypes':
      // The "in addition to its other types" form with named types; the chosen-type form is checked in validate.ts.
      if (s.chosenType !== undefined) return false;
      checkStaticSubject(s.subject, `${path}.subject`, out);
      // D-145: additive ("in addition to its other types") or, left out, replacing (CR 205.1a): "is a green Elk creature".
      if (s.additive !== undefined && s.additive !== true) {
        issue(out, `${path}.additive`, 'additive must be true when present (CR 205.1b)');
      }
      if (
        s.additive !== true &&
        Array.isArray(s.subtypes) &&
        s.subtypes.length > 0 &&
        !(Array.isArray(s.types) && (s.types.includes('creature') || s.types.includes('kindred')))
      ) {
        issue(
          out,
          `${path}.subtypes`,
          'creature subtypes that replace the creature types need the creature or kindred card type (CR 205.1a)',
        );
      }
      if (s.subtypes === undefined && s.types === undefined) {
        issue(out, path, 'setTypes names the subtypes or the card types it adds');
      }
      if (s.subtypes !== undefined) {
        if (!Array.isArray(s.subtypes) || s.subtypes.length === 0) {
          issue(out, `${path}.subtypes`, 'subtypes must be a non-empty list when present');
        } else {
          s.subtypes.forEach((t, i) => {
            if (typeof t !== 'string' || t === '')
              issue(out, `${path}.subtypes[${i}]`, 'empty subtype');
          });
        }
      }
      if (s.types !== undefined) {
        if (!Array.isArray(s.types) || s.types.length === 0) {
          issue(out, `${path}.types`, 'types must be a non-empty list when present');
        } else {
          s.types.forEach((t, i) => {
            if (!isOneOf(t, CARD_TYPES))
              issue(out, `${path}.types[${i}]`, `unknown card type ${String(t)}`);
          });
        }
      }
      return true;
    default:
      return false;
  }
}
