/**
 * The words of the attachments of a permanent (the Danitha deck, group 3, D-422 to D-428): "Aura attached to it", "Aura you control that's attached to a creature",
 * "creatures that aren't enchanted" (the engine's `ObjectFilter.attachedTo` and `enchanted`), "another Aura is attached to the permanent this is attached to" (an `amountIs` over
 * them), "this permanent entered this turn", and the reductions of Equip abilities and Aura spells that target the enchanted creature (`abilityCostReduction`, `costReduction`
 * with `targetsObject`). A shape the words do not cover gives `null`, and the card's Oracle text stays the only description (AGENTS.md "Honesty"). Pure.
 */
import type { Amount, Condition, ObjectFilter, StaticEffect } from '@commander-arena/engine';

/** The subtypes whose permanents are attached to others (CR 301.5, 303.4, 301.6): named by themselves, never as "Aura permanents". */
export const ATTACHABLE: ReadonlySet<string> = new Set(['Aura', 'Equipment', 'Fortification']);

/** "Aura", "Auras", "Equipment": an attachable subtype in the number the phrase asks for (Equipment is its own plural). */
function attachableNoun(subtype: string, plural: boolean): string {
  return plural && subtype !== 'Equipment' ? `${subtype}s` : subtype;
}

/**
 * The permanents of attachable subtypes a filter names alone: `{ subtypes: ['Aura'] }` is "Aura", `{ anyOf: [{ subtypes: ['Aura'] }, { subtypes: ['Equipment'] }] }` is "Aura and
 * Equipment" (every one of them; the engine counts what is attached whichever kind it is). Null when the filter has a card type or other subtypes, or a member that is not one
 * attachable subtype.
 */
export function attachableNouns(filter: ObjectFilter, plural: boolean): string | null {
  if (filter.anyOf !== undefined) {
    const names: string[] = [];
    for (const member of filter.anyOf) {
      const keys = Object.keys(member);
      const only = member.subtypes?.[0];
      if (keys.length !== 1 || member.subtypes?.length !== 1 || only === undefined) return null;
      if (!ATTACHABLE.has(only)) return null;
      names.push(attachableNoun(only, plural));
    }
    return names.length === 0 ? null : names.join(' and ');
  }
  const subtypes = filter.subtypes ?? [];
  if (filter.types !== undefined || subtypes.length !== 1) return null;
  const only = subtypes[0];
  return only !== undefined && ATTACHABLE.has(only) ? attachableNoun(only, plural) : null;
}

/** " attached to it", " that's attached to a creature": where the permanents a filter names are attached; null for a host the words do not say. */
export function attachedToWords(filter: ObjectFilter): string | null {
  const to = filter.attachedTo;
  if (to === undefined) return '';
  // The host of the sentence's subject: "gets +2/+2 for each Aura attached to it" is said of the permanent itself or of the one it is attached to.
  if (to.kind === 'source' || to.kind === 'host') return ' attached to it';
  const { types, ...rest } = to.filter;
  if (Object.keys(rest).length > 0 || types === undefined || types.length === 0) return null;
  const kind = types.join(' or ');
  return ` that's attached to ${/^[aeiou]/i.test(kind) ? 'an' : 'a'} ${kind}`;
}

/** " that aren't enchanted", " that are enchanted" (CR 303.4), in the number the phrase has; '' when the filter does not say. */
export function enchantedWords(filter: ObjectFilter, plural: boolean): string {
  if (filter.enchanted === undefined) return '';
  const be = plural ? (filter.enchanted ? 'are' : "aren't") : filter.enchanted ? 'is' : "isn't";
  return ` that ${be} enchanted`;
}

/** The fields of a filter these words say, which the generic words must not refuse. */
export const ATTACHMENT_FIELDS: readonly string[] = ['attachedTo', 'enchanted'];

/** "{3}": the generic mana of a reduction, as a card prints it. */
const mana = (amount: Amount): string | null =>
  typeof amount === 'number' && Number.isInteger(amount) && amount > 0 ? `{${amount}}` : null;

/**
 * "another Aura is attached to the permanent this is attached to" (D-427): at least one other attachment of a kind on the host of the source, the `amountIs` of Face of
 * Divinity. Null for any other count.
 */
export function otherAttachedWords(
  condition: Extract<Condition, { kind: 'amountIs' }>,
  negate: boolean,
): string | null {
  const { amount, compare } = condition;
  if (typeof amount !== 'object' || amount.kind !== 'countOf') return null;
  const { filter } = amount;
  const { attachedTo, other, ...kind } = filter;
  if (
    attachedTo?.kind !== 'host' ||
    other !== true ||
    compare.cmp !== 'atLeast' ||
    compare.value !== 1
  ) {
    return null;
  }
  const noun = attachableNouns(kind, false);
  if (noun === null) return null;
  return negate
    ? `no other ${noun} is attached to the permanent this is attached to`
    : `another ${noun} is attached to the permanent this is attached to`;
}

/** "this permanent entered this turn" (D-427, CR 400.7). */
export const thisEnteredWords = (negate: boolean): string =>
  `this permanent ${negate ? "didn't enter" : 'entered'} this turn`;

/**
 * "Activated abilities of creature cards in your graveyard cost {1} less to activate" (D-1432, CR 601.2f, 113.6b): the reduction of the abilities of the cards of a kind in the
 * graveyard of the controller. Null for a filter the words do not say (another zone, another controller, another field).
 */
function graveyardReductionWording(
  effect: Extract<StaticEffect, { kind: 'abilityCostReduction'; abilities: 'ofObjects' }>,
): string | null {
  const generic = mana(effect.amount);
  const { zone, controller, types, ...rest } = effect.objects;
  if (
    generic === null ||
    zone !== 'graveyard' ||
    controller !== 'you' ||
    types === undefined ||
    types.length !== 1 ||
    Object.keys(rest).length > 0
  ) {
    return null;
  }
  return `Activated abilities of ${types[0]} cards in your graveyard cost ${generic} less to activate`;
}

/**
 * "Equip abilities you activate that target enchanted creature cost {3} less to activate" and "Aura spells you cast that target enchanted creature cost {3} less to cast"
 * (D-425, D-424, CR 601.2f, 602.2b): the reductions that read what the cost's object targets. `host` is the permanent an Aura or Equipment is attached to, as the card names it
 * ("enchanted creature"). Null for any other reduction, which these words do not say.
 */
export function targetedReductionWording(effect: StaticEffect, host: string | null): string | null {
  if (effect.kind === 'abilityCostReduction' && effect.abilities === 'ofObjects') {
    return graveyardReductionWording(effect);
  }
  if (host === null) return null;
  if (effect.kind === 'abilityCostReduction' && effect.abilities === 'equip') {
    const generic = mana(effect.amount);
    const { hostOfSource, ...rest } = effect.targeting;
    if (generic === null || hostOfSource !== true || Object.keys(rest).length > 0) return null;
    return `Equip abilities you activate that target ${host} cost ${generic} less to activate`;
  }
  if (effect.kind !== 'costReduction' || 'kind' in effect.spells) return null;
  const generic = mana(effect.amount);
  const { targetsObject, controller, ...spells } = effect.spells;
  if (
    generic === null ||
    controller !== 'you' ||
    targetsObject?.hostOfSource !== true ||
    Object.keys(targetsObject).length !== 1
  ) {
    return null;
  }
  const noun = attachableNouns(spells, false);
  if (noun === null) return null;
  return `${noun} spells you cast that target ${host} cost ${generic} less to cast`;
}
