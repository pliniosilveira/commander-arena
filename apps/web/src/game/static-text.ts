/**
 * The words of the static abilities and replacements that the play-rule words (`play-rule-text.ts`) do not
 * cover (D-133): lords ("Other Zombies you control get +1/+1."), the grants of a keyword to a group, a
 * restriction ("Creatures you control with power 4 or greater can't be blocked by more than one creature."),
 * the permission to cast a card from the graveyard, the condition "as long as ..." of any of them, and the
 * replacement of a death ("If a nontoken creature an opponent controls would die, exile it instead and create a
 * 2/2 black Zombie creature token."). Composed from the AST: the group is worded from its filter, so any creature
 * type reads right (`pluralSubtype`), never from a card name. A shape the words do not cover gives `null`, and
 * the card's Oracle text stays the only description (AGENTS.md "Honesty"). Pure.
 */
import type {
  Ability,
  Condition,
  ObjectFilter,
  Replacement,
  Restriction,
  StaticEffect,
  StaticSubject,
} from '@commander-arena/engine';
import {
  angelsStaticWording,
  cantCastWording,
  gameEndSentence,
  lifeGainBonusWording,
  othersEnterWithCountersWording,
} from './angels-text';
import {
  hasJobSelect,
  hasLivingWeapon,
  JOB_SELECT_REMINDER,
  LIVING_WEAPON_REMINDER,
} from './artifacts-text';
import { targetedReductionWording } from './attachment-text';
import { gameConditionWords } from './condition-text';
import { umbraArmorWording } from './danitha-g4-text';
import {
  castFromTopText,
  entersAsCopyText,
  entersOptionText,
  unspentManaText,
} from './dragons-text';
import { drawInsteadWording, skipDrawWording } from './draw-skip-text';
import { pluralSubtype, thingsPhrase } from './filter-text';
import { ptChangeText } from './pt-text';
import { keepsDamageWording, redirectDamageWording } from './redirect-text';
import { tokenWords } from './token-text';
import { filterPhrase, keywordWords, withText } from './trigger-text';
import { COLOR_NAMES } from './words';

/** What the words need to know about the permanent or card that has the ability. */
export interface StaticContext {
  /** Its first card type: "creature" for "This creature gets +1/+1". */
  readonly noun: string;
  /** Its subtypes, to tell "Equipped creature" (an Equipment) from "Enchanted creature" (an Aura), D-139. */
  readonly subtypes?: readonly string[];
  /**
   * What an Aura enchants, from its own `enchant` keyword ("creature"), for "Enchanted creature" when the subject names no
   * type (D-145). Absent for a card with no such keyword.
   */
  readonly hostType?: string;
  /**
   * 'graveyard' for the card of a graveyard (D-151, CR 113.6b): only the abilities that work from there are worded, each with "as long as
   * this card is in your graveyard"; on the battlefield they are left out, as they do nothing there.
   */
  readonly zone?: 'graveyard';
}

const capital = (text: string): string => `${text.charAt(0).toUpperCase()}${text.slice(1)}`;

/** What each restriction reads after its subject ("can't block", "can't be blocked by more than one creature"). */
const RESTRICTION_WORDS: Readonly<Record<Restriction, { one: string; many: string }>> = {
  cantAttack: { one: "can't attack", many: "can't attack" },
  cantBlock: { one: "can't block", many: "can't block" },
  cantBeBlocked: { one: "can't be blocked", many: "can't be blocked" },
  cantBeBlockedByMoreThanOne: {
    one: "can't be blocked by more than one creature",
    many: "can't be blocked by more than one creature",
  },
  attacksEachCombat: { one: 'attacks each combat if able', many: 'attack each combat if able' },
  mustBeBlocked: { one: 'must be blocked if able', many: 'must be blocked if able' },
  doesntUntap: {
    one: "doesn't untap during its controller's untap step",
    many: "don't untap during their controllers' untap steps",
  },
  cantBeCountered: { one: "can't be countered", many: "can't be countered" },
};

/** "a, b and c": a list of group names, as a lord's subject names several. */
const joinAnd = (parts: readonly string[]): string =>
  parts.length <= 2
    ? parts.join(' and ')
    : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;

/**
 * The group of a lord as a plural noun phrase, lower-case where it begins a plain noun: "other Zombies you
 * control", "Skeletons you control and other Zombies you control", "creatures you control with power 4 or
 * greater". An `anyOf` names each alternative on its own, with the fields around it. Null when a field cannot be said.
 */
export function groupPhrase(filter: ObjectFilter, other?: boolean): string | null {
  const { anyOf, ...base } = filter;
  const merged = other === true ? { ...base, other: true as const } : base;
  // "Other Zombies get +1/+1", not "Other Zombies on the battlefield": a lord of every controller is the group itself.
  const said = (f: ObjectFilter): string | null =>
    thingsPhrase(f, true)?.replace(' on the battlefield', '') ?? null;
  if (anyOf === undefined || anyOf.length === 0) return said(merged);
  // D-1414: "Skeletons and Zombies you control": two creature types, each alone in its member, with one controller for both.
  const pair = anyOf.map((m) => (Object.keys(m).join() === 'subtypes' ? (m.subtypes ?? []) : []));
  if (
    anyOf.length === 2 &&
    pair.every((s) => s.length === 1) &&
    base.controller === 'you' &&
    Object.keys(base).every((k) => k === 'controller' || k === 'zone')
  ) {
    const [a, b] = pair.map((s) => pluralSubtype(s[0] ?? ''));
    return `${other === true ? 'other ' : ''}${a} and ${b} you control`;
  }
  const parts = anyOf.map((member) => said({ ...merged, ...member }));
  return parts.some((part) => part === null) ? null : joinAnd(parts as string[]);
}

/** The subject of a static ability and whether its verb is plural: "This creature", "Other Zombies you control". */
function subjectWords(
  subject: StaticSubject,
  ctx: StaticContext,
): { text: string; many: boolean } | null {
  if (subject.kind === 'this') return { text: `This ${ctx.noun}`, many: false };
  if (subject.kind === 'attached') return attachedSubject(subject, ctx);
  if (subject.kind !== 'filter') return null;
  const group = groupPhrase(subject.filter, subject.other);
  return group === null ? null : { text: capital(group), many: true };
}

/**
 * "Equipped creature", "Enchanted creature" (D-139, CR 301.5a, 303.4b): what an Equipment or an Aura is attached to,
 * named by the subject's own type. Null when the permanent is neither, or the subject names more than a card type.
 */
function attachedSubject(
  subject: Extract<StaticSubject, { kind: 'attached' }>,
  ctx: StaticContext,
): { text: string; many: boolean } | null {
  const { kind: _kind, types, ...rest } = subject;
  if (Object.keys(rest).length > 0 || (types !== undefined && types.length > 1)) return null;
  const subtypes = ctx.subtypes ?? [];
  const equipment =
    subtypes.includes('Equipment') || (subtypes.length === 0 && ctx.noun === 'artifact');
  const aura = subtypes.includes('Aura') || (subtypes.length === 0 && ctx.noun === 'enchantment');
  if (!equipment && !aura) return null;
  // D-145 (CR 301.5): an Equipment is attached to a creature only; an Aura enchants what its `enchant` keyword says.
  const host = types?.[0] ?? (equipment ? 'creature' : (ctx.hostType ?? 'permanent'));
  return { text: `${equipment ? 'Equipped' : 'Enchanted'} ${host}`, many: false };
}

/**
 * The blockers of "can't be blocked by Walls", "... by creatures with power 2 or less", "... by creatures with flying"
 * (D-139, CR 509.1b): a blocker is a creature, so a filter that names no card type is read as one.
 */
function blockersPhrase(blockers: ObjectFilter): string | null {
  const filter =
    blockers.types === undefined ? { ...blockers, types: ['creature'] as const } : blockers;
  return groupPhrase(filter);
}

/** "artifact spells", "creature spells", "spells with mana value 2 or less" (D-139): the spells a flash permission names. */
function spellsPhrase(spells: ObjectFilter): string | null {
  const { types, controller, ...rest } = spells;
  const allowed = new Set(['colors', 'manaValue', 'subtypes']);
  if (controller !== undefined && controller !== 'you') return null;
  if (Object.keys(rest).some((k) => !allowed.has(k))) return null;
  const colors = (rest.colors ?? []).map((c) => COLOR_NAMES[c] ?? c);
  const words = [...colors, ...(rest.subtypes ?? []), ...(types ?? [])].join(' ');
  return `${words === '' ? '' : `${words} `}spells${withText(rest)}`;
}

/** "Juggernauts", "Elves and Goblins", "artifacts": what a type-adding effect adds, as a plural (D-139). */
function addedTypes(
  effect: Extract<StaticEffect, { kind: 'setTypes'; chosenType?: undefined }>,
): string | null {
  const subtypes = (effect.subtypes ?? []).map(pluralSubtype);
  const types = (effect.types ?? []).map((t) => `${t}s`);
  const all = [...types, ...subtypes];
  return all.length === 0 ? null : joinAnd(all);
}

/** "green", "green and white", "colorless": the colors a `setColors` gives (CR 105.3). */
function colorsWords(colors: readonly string[]): string {
  return colors.length === 0 ? 'colorless' : colors.map((c) => COLOR_NAMES[c] ?? c).join(' and ');
}

/** "an Elk creature", "a green Elk creature": the noun a non-additive `setTypes` makes, with the colors that come before it. */
function replacedKind(
  effect: Extract<StaticEffect, { kind: 'setTypes'; chosenType?: undefined }>,
  colors: readonly string[] | null = null,
): string | null {
  const nouns = [...(effect.subtypes ?? []), ...(effect.types ?? [])];
  if (nouns.length === 0) return null;
  const words = [
    ...(colors === null || colors.length === 0 ? [] : [colorsWords(colors)]),
    ...nouns,
  ];
  const phrase = words.join(' ');
  return `${/^[aeiou]/i.test(phrase) ? 'an' : 'a'} ${phrase}`;
}

/** The card types in the plural, as a card says them: "creatures", "sorceries". */
function pluralCardType(type: string): string {
  return type === 'sorcery' ? 'sorceries' : `${type}s`;
}

/** The sentence of one static effect (no condition, no final period); null for the kinds these words do not cover. */
export function lordWording(effect: StaticEffect, ctx: StaticContext): string | null {
  switch (effect.kind) {
    case 'modifyPt': {
      const subject = subjectWords(effect.subject, ctx);
      if (subject === null) return null;
      const words = ptWords(effect);
      // D-187 (CR 508.1): a group's "for each time it has attacked this turn" is each creature's own count: "they" for the group.
      return `${subject.text} ${subject.many ? 'get' : 'gets'} ${subject.many ? words.replace(' time it has attacked', ' time they have attacked') : words}`;
    }
    case 'grantKeyword': {
      const subject = subjectWords(effect.subject, ctx);
      if (subject === null) return null;
      // D-376 (CR 702.16): "Creatures you control have protection from the chosen card type".
      // D-402 (CR 702.16a): "Enchanted creature has protection from creatures".
      const has =
        effect.keyword.kind === 'protection' && effect.keyword.from === 'chosenCardType'
          ? 'protection from the chosen card type'
          : effect.keyword.kind === 'protection' && effect.keyword.from === 'cardType'
            ? `protection from ${effect.keyword.types.map(pluralCardType).join(' and from ')}`
            : keywordWords(effect.keyword.kind);
      return `${subject.text} ${subject.many ? 'have' : 'has'} ${has}`;
    }
    case 'restriction': {
      const subject = subjectWords(effect.subject, ctx);
      if (subject === null) return null;
      const words = RESTRICTION_WORDS[effect.restriction];
      return `${subject.text} ${subject.many ? words.many : words.one}`;
    }
    case 'cantHaveCounters': {
      // D-380 (CR 122.6, 101.2): "Creatures you control can't have -1/-1 counters put on them".
      const subject = subjectWords(effect.subject, ctx);
      if (subject === null) return null;
      return `${subject.text} can't have ${effect.counter} counters put on ${subject.many ? 'them' : 'it'}`;
    }
    case 'castFromGraveyard':
      return 'You may cast this card from your graveyard';
    case 'setPt': {
      // D-139 (CR 613.4b): "Other creatures you control have base power and toughness 5/3".
      const subject = subjectWords(effect.subject, ctx);
      if (subject === null) return null;
      return `${subject.text} ${subject.many ? 'have' : 'has'} base power and toughness ${effect.power}/${effect.toughness}`;
    }
    case 'setTypes': {
      // D-139 (CR 205.1b): "Other creatures you control are Juggernauts in addition to their other creature types".
      if (effect.chosenType === true) return null;
      const subject = subjectWords(effect.subject, ctx);
      // D-145 (CR 205.1a): without `additive` the types replace the old ones: "Enchanted creature is an Elk creature".
      if (effect.additive !== true) {
        const kind = replacedKind(effect);
        return subject === null || subject.many || kind === null
          ? null
          : `${subject.text} is ${kind}`;
      }
      const added = addedTypes(effect);
      if (subject === null || added === null) return null;
      const kind = (effect.types ?? []).length === 0 ? 'creature types' : 'types';
      if (subject.many) return `${subject.text} are ${added} in addition to their other ${kind}`;
      // One permanent (an Aura or Equipment's host): the singular, "is a Wizard in addition to its other types".
      const one = [...(effect.subtypes ?? []), ...(effect.types ?? [])].join(' ');
      return `${subject.text} is ${/^[aeiou]/i.test(one) ? 'an' : 'a'} ${one} in addition to its other ${kind}`;
    }
    case 'cantBeBlockedBy': {
      // D-139 (CR 509.1b): "Juggernauts you control can't be blocked by Walls".
      const subject = subjectWords(effect.subject, ctx);
      const blockers = blockersPhrase(effect.blockers);
      if (subject === null || blockers === null) return null;
      return `${subject.text} can't be blocked by ${blockers}`;
    }
    case 'spellsCantBeCountered': {
      // D-185 (CR 101.2): "Creature spells you control can't be countered".
      const spells = spellsPhrase(effect.spells);
      return spells === null
        ? null
        : `${spells.charAt(0).toUpperCase()}${spells.slice(1)} you control can't be countered`;
    }
    case 'opponentsCantCastSpells': {
      // D-282 (CR 101.2, 601.2): "Your opponents can't cast spells with mana value 3 or less".
      const spells = spellsPhrase(effect.spells);
      return spells === null ? null : `Your opponents can't cast ${spells}`;
    }
    case 'castAsThoughFlash': {
      // D-408 (CR 601.3b, 113.6d): the spell's own permission, "You may cast this spell as though it had flash" (its condition is worded by `conditionalWording`).
      if ('kind' in effect.spells) return 'You may cast this spell as though it had flash';
      // D-139 (CR 601.3b, 702.8a): "You may cast artifact spells as though they had flash".
      const spells = spellsPhrase(effect.spells);
      return spells === null ? null : `You may cast ${spells} as though they had flash`;
    }
    case 'loseAllAbilities': {
      // D-145 (CR 613.1f): "Enchanted creature loses all abilities".
      const subject = subjectWords(effect.subject, ctx);
      return subject === null ? null : `${subject.text} loses all abilities`;
    }
    case 'setColors': {
      // D-145 (CR 613.1e): "Enchanted creature is green".
      const subject = subjectWords(effect.subject, ctx);
      return subject === null || subject.many
        ? null
        : `${subject.text} is ${colorsWords(effect.colors)}`;
    }
    case 'restrictionUnless': {
      // D-145 (CR 508.1a, 509.1a): "This creature can't attack or block unless you control another creature with power 4 or greater".
      const unless = gameConditionWords(effect.unless, { self: ctx.noun });
      const subject = subjectWords(effect.subject, ctx);
      if (unless === null || subject === null) return null;
      const words = effect.restrictions.map((r) => RESTRICTION_WORDS[r].one);
      // "can't attack or block": the shared "can't" is said once.
      const said = words.length === 2 ? "can't attack or block" : (words[0] ?? '');
      return said === '' ? null : `${subject.text} ${said} unless ${unless}`;
    }
    case 'takeFromLinkedExile': {
      // D-139 (CR 607.2a, 613.4b): Duplicant's "As long as a card exiled with this creature is a creature card, ...".
      const card = filterPhrase(effect.from, 'card');
      if (card === null || effect.subject.kind !== 'this') return null;
      const kind = card.endsWith(' card') ? card : `${card} card`;
      const bare = kind.replace(/^an? /, '');
      const still = (effect.alsoSubtypes ?? []).join(' ');
      const self = `this ${ctx.noun}`;
      return `As long as a card exiled with ${self} is ${kind}, ${self} has the power, toughness and creature types of the last ${bare} exiled with it${still === '' ? '' : `. It's still ${/^[aeiou]/i.test(still) ? 'an' : 'a'} ${still}`}`;
    }
    case 'castFromTopOfLibrary':
      // D-151 (CR 601.3): "You may cast creature spells with power 4 or greater from the top of your library".
      return castFromTopText(effect);
    case 'unspentManaStays':
      // D-151 (CR 500.5): "You don't lose unspent red mana as steps and phases end".
      return unspentManaText(effect);
    case 'keepsDamage':
      // D-192 (CR 514.2): "Damage isn't removed from this creature during cleanup steps".
      return keepsDamageWording(ctx.noun);
    case 'abilityCostReduction':
    case 'costReduction': {
      // D-424, D-425 (CR 601.2f, 602.2b): "Equip abilities you activate that target enchanted creature cost {3} less to activate", "Aura spells you cast that target ... cost {3} less to cast".
      const host = attachedSubject({ kind: 'attached' }, ctx)?.text;
      return targetedReductionWording(effect, host === undefined ? null : host.toLowerCase());
    }
    default:
      // D-149: "You have hexproof", "You can't lose the game", prevention to this creature, a tax on blocking.
      return angelsStaticWording(effect, ctx.noun);
  }
}

function ptWords(effect: Extract<StaticEffect, { kind: 'modifyPt' }>): string {
  return ptChangeText(effect.power, effect.toughness);
}

/**
 * The sentence of a static ability with its condition: "Other Zombies you control get +1/+1 as long as you control
 * your commander." Null when the effect or the condition cannot be said (a condition left out would claim more).
 */
export function conditionalWording(
  ability: Extract<Ability, { kind: 'static' }>,
  ctx: StaticContext,
): string | null {
  const text = lordWording(ability.static, ctx);
  if (text === null) return null;
  if (ability.condition === undefined) return text;
  // D-408: "You may cast this spell as though it had flash if it targets a commander": an "if" of the spell, not an "as long as".
  if (ability.static.kind === 'castAsThoughFlash' && 'kind' in ability.static.spells) {
    const when = flashCondition(ability.condition);
    return when === null ? null : `${text} if ${when}`;
  }
  const when = gameConditionWords(ability.condition);
  if (when === null) return null;
  // "You may cast this card from your graveyard as long as you control a Zombie."
  return `${text} as long as ${when}`;
}

/**
 * The condition of a spell's own permission to be cast as though it had flash, in words (D-408): "it targets a commander", "it targets a creature", or any condition
 * the game words know ("you control two or more creatures"). Null when it cannot be said.
 */
function flashCondition(condition: Condition): string | null {
  if (condition.kind !== 'spellTargets') return gameConditionWords(condition);
  const { types, commander, ...rest } = condition.filter;
  if (Object.keys(rest).length > 0 || (types ?? []).length > 1) return null;
  const noun = [...(types ?? []), ...(commander === true ? ['commander'] : [])].join(' ');
  if (noun === '') return null;
  return `it targets ${/^[aeiou]/i.test(noun) ? 'an' : 'a'} ${noun}`;
}

/**
 * "Creatures you control have haste as long as this card is in your graveyard and you control a Mountain" (D-151, CR 113.6b, 604.2): a
 * static ability that works from the graveyard. Null when the effect or the condition cannot be said.
 */
export function graveyardStaticWording(
  ability: Extract<Ability, { kind: 'static' }>,
  ctx: StaticContext,
): string | null {
  const text = lordWording(ability.static, ctx);
  if (text === null) return null;
  if (ability.condition === undefined) return `${text} as long as this card is in your graveyard`;
  const when = gameConditionWords(ability.condition);
  return when === null ? null : `${text} as long as this card is in your graveyard and ${when}`;
}

/**
 * "If a nontoken creature an opponent controls would die, exile it instead and create a 2/2 black Zombie creature
 * token." (CR 614.1a, 700.4); null for any other replacement or a creature group the words cannot say.
 */
export function replacementWording(replacement: Replacement, noun = 'permanent'): string | null {
  // D-151 (CR 614.12): a permanent that enters as a copy, or with a choice among names the card gives.
  if (replacement.kind === 'entersAsCopy') return entersAsCopyText(replacement, noun);
  if (replacement.kind === 'asEntersChoose') {
    return replacement.what === 'option' && replacement.options !== undefined
      ? entersOptionText(replacement.options, noun)
      : null;
  }
  // D-149 (CR 119.10, 614.1c): "you gain that much life plus 1 instead", "Each other Angel you control enters with an additional counter".
  if (replacement.kind === 'lifeGainBonus') return lifeGainBonusWording(replacement.amount);
  if (replacement.kind === 'othersEnterWithCounters') {
    return othersEnterWithCountersWording(replacement);
  }
  // D-179 (CR 614.12): "Lands you control enter untapped".
  if (replacement.kind === 'groupEntersUntapped') {
    const group = groupPhrase(replacement.what);
    return group === null ? null : `${capital(group)} enter untapped`;
  }
  // D-332 (CR 614.11): "If you would draw a card while your library has no cards in it, skip that draw instead".
  if (replacement.kind === 'skipDraw') return skipDrawWording(replacement);
  // D-379 (CR 614.11, 504.1): "If you would draw a card except the first one you draw in each of your draw steps, draw two cards instead".
  if (replacement.kind === 'drawInstead') return drawInsteadWording(replacement);
  // D-378 (CR 614.1a, 614.5): "If one or more tokens would be created under your control, twice that many of those tokens are created instead".
  if (replacement.kind === 'tokensInstead' && replacement.mode === 'double') {
    return 'If one or more tokens would be created under your control, twice that many of those tokens are created instead';
  }
  // D-417 (CR 702.89a): Umbra armor.
  if (replacement.kind === 'umbraArmor') return umbraArmorWording();
  // D-192 (CR 614.9): "All damage that would be dealt to you and other permanents you control is dealt to this creature instead".
  if (replacement.kind === 'redirectDamage') return redirectDamageWording(replacement, noun);
  if (replacement.kind !== 'wouldDie') return null;
  const what = filterPhrase(replacement.what, 'creature');
  if (what === null) return null;
  const head = `If ${what} would die, exile it instead`;
  if (replacement.alsoCreate === undefined) return head;
  const { token, count } = replacement.alsoCreate;
  const words = tokenWords(token, false, () => 'it');
  const made =
    count === 1
      ? `${/^(?:[aeiou]|8|11|18)/i.test(words.one) ? 'an' : 'a'} ${words.one}`
      : `${count} ${words.many}`;
  return `${head} and create ${made}`;
}

/** What an Aura enchants, from its `enchant` keyword when that names one card type ("creature"); undefined otherwise (D-145). */
function hostTypeOf(abilities: readonly Ability[]): string | undefined {
  for (const a of abilities) {
    if (a.kind === 'keyword' && a.keyword.kind === 'enchant') {
      const types = a.keyword.filter.types;
      return types?.length === 1 ? types[0] : undefined;
    }
  }
  return undefined;
}

type StaticAbility = Extract<Ability, { kind: 'static' }>;

/**
 * "Enchanted creature loses all abilities and is a green Elk creature with base power and toughness 3/3." (D-145, CR 613.1d-f,
 * 613.4b): the statics of an Aura or Equipment that change what it is attached to, said as the one sentence the card prints. Only
 * when two or more of them are there, none has a condition and the base power and toughness are numbers; the abilities it says
 * come back as `used`, so they are not worded again one by one. Null otherwise (each is then worded alone).
 */
function polymorphSentence(
  abilities: readonly Ability[],
  ctx: StaticContext,
): { readonly text: string; readonly used: ReadonlySet<Ability> } | null {
  const statics = abilities.filter(
    (a): a is StaticAbility => a.kind === 'static' && a.condition === undefined,
  );
  const only = <K extends StaticEffect['kind']>(kind: K) =>
    statics.find(
      (a) =>
        a.static.kind === kind && 'subject' in a.static && a.static.subject.kind === 'attached',
    );
  const lose = only('loseAllAbilities');
  const colors = only('setColors');
  const pt = only('setPt');
  const types = statics.find(
    (a) =>
      a.static.kind === 'setTypes' &&
      a.static.chosenType !== true &&
      a.static.additive !== true &&
      a.static.subject.kind === 'attached',
  );
  const colorEffect = colors?.static.kind === 'setColors' ? colors.static : undefined;
  const typeEffect =
    types?.static.kind === 'setTypes' && types.static.chosenType !== true
      ? types.static
      : undefined;
  const ptEffect = pt?.static.kind === 'setPt' ? pt.static : undefined;
  const base =
    ptEffect !== undefined &&
    typeof ptEffect.power === 'number' &&
    typeof ptEffect.toughness === 'number'
      ? `base power and toughness ${ptEffect.power}/${ptEffect.toughness}`
      : null;
  // Base power and toughness that are not plain numbers are not part of the sentence (and are not consumed).
  const withBase = base !== null && pt !== undefined;
  const pieces = [lose, colors, types, withBase ? pt : undefined].filter((p) => p !== undefined);
  if (pieces.length < 2 || (lose === undefined && colors === undefined && types === undefined)) {
    return null;
  }
  const subject = attachedSubject({ kind: 'attached' }, ctx);
  if (subject === null) return null;
  let kind: string | null = null;
  if (typeEffect !== undefined) {
    kind = replacedKind(typeEffect, colorEffect?.colors ?? null);
    if (kind === null) return null;
  } else if (colorEffect !== undefined) {
    kind = colorsWords(colorEffect.colors);
  }
  const parts: string[] = [];
  if (lose !== undefined) parts.push('loses all abilities');
  if (kind !== null) {
    parts.push(`is ${kind}${base !== null && typeEffect !== undefined ? ` with ${base}` : ''}`);
    if (base !== null && typeEffect === undefined) parts.push(`has ${base}`);
  } else if (base !== null) {
    parts.push(`has ${base}`);
  }
  const used = new Set<Ability>(pieces);
  return { text: `${subject.text} ${parts.join(' and ')}`, used };
}

/** The sentences of the abilities among `abilities` that this file words, in order, each with its period. */
export function lordWordings(abilities: readonly Ability[], ctx: StaticContext): readonly string[] {
  // CR 702.92a (D-139): Living weapon's reminder text, first, as the keyword is printed first.
  const living = [
    ...(hasLivingWeapon(abilities) ? [LIVING_WEAPON_REMINDER] : []),
    ...(hasJobSelect(abilities) ? [JOB_SELECT_REMINDER] : []),
  ];
  const hostType = hostTypeOf(abilities);
  const here: StaticContext = hostType === undefined ? ctx : { ...ctx, hostType };
  // One sentence for several abilities: the polymorph of an Aura, and "You can't lose the game and your opponents can't win".
  const combined = [polymorphSentence(abilities, here), gameEndSentence(abilities)].filter(
    (c) => c !== null,
  );
  return [
    ...living,
    ...abilities.flatMap((a, at) => {
      const joint = combined.find((c) => c.used.has(a));
      if (joint !== undefined) {
        // The one sentence goes where the first of the abilities it says stands.
        const first = abilities.findIndex((b) => joint.used.has(b));
        return at === first ? [`${joint.text}.`] : [];
      }
      if (a.kind === 'static' && a.functionsIn === 'graveyard') {
        const said = here.zone === 'graveyard' ? graveyardStaticWording(a, here) : null;
        return said === null ? [] : [`${said}.`];
      }
      const text =
        a.kind === 'static'
          ? (cantCastWording(a) ?? conditionalWording(a, here))
          : a.kind === 'replacement'
            ? replacementWording(a.replacement, here.noun)
            : null;
      return text === null ? [] : [`${text}.`];
    }),
  ];
}
