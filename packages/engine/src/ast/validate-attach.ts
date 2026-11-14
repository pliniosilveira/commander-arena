/**
 * Validation of what Auras, Equipment and static abilities add to the AST (CR 301.5, 303.4, 604,
 * 611.3, 613): enchant filters, static subjects, granted keywords, and which cards may use them.
 * `validate.ts` and `validate-parts.ts` compose these.
 */
import { CARD_TYPES, type CardType, COLORS, SUPERTYPES, type Subtype } from '../characteristics';
import { GRANTABLE_KEYWORDS } from './features';
import type { Ability, Keyword, ObjectFilter, StaticSubject } from './types';
import { isOneOf, kindOf } from './validate-base';
import {
  type AstIssue,
  checkEnumList,
  checkFilter,
  filterSome,
  isCount,
  issue,
  readsCombatOrSourceBesidesCommander,
  readsKeywords,
} from './validate-parts';

export { GRANTABLE_KEYWORDS };

/** A filter read on the battlefield only: statics and enchant abilities affect permanents. */
export function checkBattlefieldFilter(f: ObjectFilter, path: string, out: AstIssue[]): void {
  checkFilter(f, path, out);
  if (f.zone !== undefined && f.zone !== 'battlefield') {
    issue(out, `${path}.zone`, 'only permanents on the battlefield can be affected here');
  }
  if (f.stackKind !== undefined) {
    issue(out, `${path}.stackKind`, 'only permanents on the battlefield can be affected here');
  }
  for (const [i, member] of (f.anyOf ?? []).entries()) {
    if (member.zone !== undefined || member.stackKind !== undefined) {
      issue(out, `${path}.anyOf[${i}]`, 'anyOf members may not set zone or stackKind');
    }
  }
}

/**
 * A static ability's subject. `keywords` (D-149) allows a filter that names a keyword ("creatures you control with flying"): only
 * a `grantKeyword` may, because `derive` reads the keywords after the effects that give them (CR 613.8a) for that one alone.
 */
export function checkStaticSubject(
  s: StaticSubject,
  path: string,
  out: AstIssue[],
  keywords = false,
  allowPair = false,
): void {
  switch (s?.kind) {
    case 'this':
      break;
    case 'pair':
      // D-286 (CR 702.95b): "each of those creatures": read by the three static abilities that `derive` applies through `subjectAffects`.
      if (!allowPair) {
        issue(
          out,
          path,
          "the 'pair' subject is for a static ability that changes power and toughness or grants a keyword or an ability only",
        );
      }
      break;
    case 'attached':
      // The host's types ("Enchanted creature"): see StaticSubject. Each list is non-empty when set.
      checkEnumList(out, `${path}.types`, s.types, CARD_TYPES, 'card type');
      checkEnumList(out, `${path}.supertypes`, s.supertypes, SUPERTYPES, 'supertype');
      break;
    case 'filter':
      checkBattlefieldFilter(s.filter, `${path}.filter`, out);
      // D-120: `derive` matches this filter without the combat or a source power. "Commander" is read from the card, which no layer changes (D-443), so a group
      // of commander creatures is a subject.
      if (filterSome(s.filter, readsCombatOrSourceBesidesCommander)) {
        issue(
          out,
          `${path}.filter`,
          'a static ability cannot name attacking creatures or compare power with its source',
        );
      }
      // D-422: `derive` reads the group before layers 6 and 7 with the view of each permanent alone: a permanent that has an Aura attached, or one attached to a permanent of a
      // kind, needs the view of another object, which only a count or a condition is given.
      if (
        filterSome(s.filter, (f) => f.enchanted !== undefined || f.attachedTo?.kind === 'matching')
      ) {
        issue(
          out,
          `${path}.filter`,
          'a static ability\'s group cannot be named by "enchanted" or by the kind of permanent something is attached to (D-422)',
        );
      }
      if (!keywords && filterSome(s.filter, readsKeywords)) {
        issue(
          out,
          `${path}.filter`,
          'only a static ability that grants a keyword can name a keyword in its subject (CR 613.8)',
        );
      }
      if (s.other !== undefined && typeof s.other !== 'boolean') {
        issue(out, `${path}.other`, 'other must be a boolean');
      }
      break;
    default:
      issue(out, path, `unknown static subject ${kindOf(s)}`);
  }
}

/** D-376 (CR 702.16a): the card types a protection or a player's protection names: at least one, each a card type of `CARD_TYPES`. */
export function checkProtectionTypes(types: unknown, path: string, out: AstIssue[]): void {
  if (!Array.isArray(types) || types.length === 0) {
    issue(out, path, 'protection from a card type needs at least one card type');
    return;
  }
  checkEnumList(out, path, types, CARD_TYPES, 'card type');
}

/**
 * D-472, D-473: the parameter of a keyword that is granted and has one: "afflict 3" (CR 702.130a, a positive whole number) and a landwalk
 * (CR 702.14a, a land type or "nonbasic", as for a printed one).
 */
export function checkGrantedParameter(k: Keyword, path: string, out: AstIssue[]): void {
  if (k?.kind === 'afflict' && (!isCount(k.count) || k.count < 1)) {
    issue(out, `${path}.count`, 'afflict needs a positive integer');
  }
  if (k?.kind === 'landwalk') {
    if (typeof k.landType !== 'string' || k.landType === '') {
      issue(out, `${path}.landType`, 'landwalk needs a land type or "nonbasic"');
    } else if (k.landType !== 'nonbasic' && !/^[A-Z][A-Za-z'-]*$/.test(k.landType)) {
      issue(out, `${path}.landType`, `${JSON.stringify(k.landType)} is not a land type`);
    }
  }
}

export function checkGrantedKeyword(k: Keyword, path: string, out: AstIssue[]): void {
  // D-259 (CR 702.16): a static ability may give protection from colors; its colors are checked as a printed protection keyword is.
  // D-376: or from card types, or from the chosen card type.
  if (k?.kind === 'protection') {
    if (k.from === 'cardType') {
      checkProtectionTypes(k.types, `${path}.types`, out);
    } else if (k.from === 'color') {
      if (!Array.isArray(k.colors) || k.colors.length === 0) {
        issue(out, `${path}.colors`, 'protection needs at least one color');
      } else {
        k.colors.forEach((c, i) => {
          if (!isOneOf(c, COLORS)) issue(out, `${path}.colors[${i}]`, `unknown color ${String(c)}`);
        });
      }
    } else if (k.from === 'colorOfChoice') {
      // D-451: asked as an effect resolves; a static ability or a printed keyword has nothing to ask.
      issue(
        out,
        `${path}.from`,
        'protection from the color of your choice is chosen as an effect resolves: only a grantKeyword effect gives it',
      );
    } else if (k.from !== 'colorsNotInCommanderIdentity' && k.from !== 'chosenCardType') {
      issue(
        out,
        `${path}.from`,
        `unknown protection quality ${String((k as { from: unknown }).from)}`,
      );
    }
    return;
  }
  if (!GRANTABLE_KEYWORDS.includes(k?.kind)) {
    issue(
      out,
      path,
      `a static ability cannot grant ${kindOf(k)}: only keywords without parameters can be granted (and afflict and landwalk, D-472, D-473)`,
    );
    return;
  }
  checkGrantedParameter(k, path, out);
}

/**
 * Face-level rules: an Aura has exactly the enchant ability that defines it (CR 303.4a, 702.5a) and
 * only an Aura has one; an "attached" subject needs an Aura or an Equipment to be attached to
 * something (CR 301.5a, 303.4b).
 */
export function checkAttachmentFace(
  abilities: readonly Ability[],
  face: { readonly types: readonly CardType[]; readonly subtypes: readonly Subtype[] },
  path: string,
  out: AstIssue[],
): void {
  const isAura = face.subtypes.includes('Aura');
  const isEquipment = face.subtypes.includes('Equipment');
  const enchants = abilities.filter((a) => a.kind === 'keyword' && a.keyword.kind === 'enchant');
  if (isAura && !face.types.includes('enchantment')) {
    issue(out, `${path}.subtypes`, 'an Aura is an enchantment (CR 303.4)');
  }
  if (isAura && enchants.length === 0) {
    issue(out, `${path}.abilities`, 'an Aura needs an enchant ability (CR 303.4a, 702.5a)');
  }
  if (!isAura && enchants.length > 0) {
    issue(out, `${path}.abilities`, 'only an Aura has an enchant ability (CR 702.5a)');
  }
  abilities.forEach((a, i) => {
    const subject = a.kind === 'static' && 'subject' in a.static ? a.static.subject : null;
    if (subject?.kind === 'attached' && !isAura && !isEquipment) {
      issue(
        out,
        `${path}.abilities[${i}].static.subject`,
        'an "attached" subject needs an Aura or an Equipment: nothing else is attached to a permanent',
      );
    }
  });
}
