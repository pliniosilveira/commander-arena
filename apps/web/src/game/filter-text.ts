/**
 * The words that name a group of objects by a filter: "artifacts you control", "Zombie cards in your
 * graveyard", "creatures attacking you". Shared by the words of power and toughness (`pt-text.ts`) and of
 * counted amounts (`amount-text.ts`). Read from the AST, never from a card name; a filter field the words
 * cannot say gives `null`, never a guess (AGENTS.md "Honesty"). Pure.
 */
import type { ObjectFilter } from '@commander-arena/engine';
import { attachableNouns, attachedToWords, enchantedWords } from './attachment-text';
import { withText } from './trigger-text';
import { COLOR_NAMES } from './words';

/** Where cards are named by a zone: "cards in your hand", "creature cards in your graveyard". */
const ZONE_WORDS: Readonly<Record<string, { you: string; opponent: string; any: string }>> = {
  hand: { you: 'in your hand', opponent: "in an opponent's hand", any: 'in all hands' },
  graveyard: {
    you: 'in your graveyard',
    opponent: "in an opponent's graveyard",
    any: 'in all graveyards',
  },
  library: {
    you: 'in your library',
    opponent: "in an opponent's library",
    any: 'in all libraries',
  },
  exile: { you: 'in exile', opponent: 'in exile', any: 'in exile' },
};

/** The basic land types (CR 205.3i): a filter of one of them and no card type is about lands. */
const BASIC_LAND_TYPES: ReadonlySet<string> = new Set([
  'Plains',
  'Island',
  'Swamp',
  'Mountain',
  'Forest',
]);

/** The fields of a filter the counting words can say; any other makes the phrase unknowable. */
const COUNTABLE: ReadonlySet<string> = new Set([
  'zone',
  'types',
  'notTypes',
  'supertypes',
  'notSupertypes',
  'subtypes',
  'colors',
  'controller',
  'tapped',
  'power',
  'toughness',
  'manaValue',
  'other',
  'attacking',
  'attackingYou',
  'attackingOrBlocking',
  // D-218.
  'attackingOpponents',
  // D-133.
  'token',
  'notSubtypes',
  'colorless',
  'keywords',
  // D-422: "Aura attached to it", "creatures that aren't enchanted".
  'attachedTo',
  'enchanted',
  'notKeywords',
  // D-139: said by `withText`.
  'colorCount',
  'manaValueX',
  'controllerDealtDamageBySource',
  // D-145: "commanders you control", "creatures you control with a counter on it"; `withText` says the counter.
  'commander',
  'hasCounter',
]);

/** Creature types whose plural is the same word ("Merfolk", "Samurai", "Fish": CR 205.3m spells the singular). */
const SAME_PLURAL: ReadonlySet<string> = new Set([
  'astartes',
  'aurochs',
  'caribou',
  'custodes',
  'dauthi',
  'deer',
  'drix',
  'eldrazi',
  'elk',
  'fish',
  'jellyfish',
  'kavu',
  'kithkin',
  'kor',
  'lammasu',
  'merfolk',
  'moonfolk',
  'moose',
  // "Tap X untapped Myr you control" (D-139).
  'myr',
  'qu',
  'samurai',
  'sheep',
  'soltari',
  'starfish',
  'thalakos',
  'treefolk',
  'vedalken',
  'zubera',
]);

/** Plurals that no ending rule gives: "Elf" is "Elves", "Wolf" "Wolves", "Mouse" "Mice". */
const IRREGULAR_PLURAL: Readonly<Record<string, string>> = {
  cyberman: 'Cybermen',
  cyclops: 'Cyclopes',
  dwarf: 'Dwarves',
  elf: 'Elves',
  fungus: 'Fungi',
  goose: 'Geese',
  homunculus: 'Homunculi',
  man: 'Men',
  mouse: 'Mice',
  ox: 'Oxen',
  pegasus: 'Pegasi',
  thief: 'Thieves',
  werewolf: 'Werewolves',
  wolf: 'Wolves',
};

/**
 * The plural of a creature type as a noun: "Zombie" is "Zombies", "Elf" "Elves", "Wolf" "Wolves", "Ally"
 * "Allies", "Fox" "Foxes", "Merfolk" "Merfolk". Only the last word changes ("Time Lord" is "Time Lords"). The
 * exceptions are tables, the rest are the regular endings, so a creature type added later reads right unless it
 * is one more exception (`filter-text.test.ts` loops over every type of CR 205.3m).
 */
export function pluralSubtype(subtype: string): string {
  const at = subtype.lastIndexOf(' ') + 1;
  const head = subtype.slice(0, at);
  const word = subtype.slice(at);
  const key = word.toLowerCase();
  const kept = (text: string): string => `${head}${text}`;
  if (SAME_PLURAL.has(key)) return subtype;
  const irregular = IRREGULAR_PLURAL[key];
  if (irregular !== undefined) return kept(irregular);
  if (/[^aeiou]y$/i.test(word)) return kept(`${word.slice(0, -1)}ies`);
  // "Fox", "Sphinx", "Phoenix", "Walrus", "Octopus", "Leech"; "Primarch" says "k" and is regular.
  if (/(?:s|x|z|sh|eech)$/i.test(word) || key === 'hero') return kept(`${word}es`);
  return kept(`${word}s`);
}

/**
 * "Zombie tokens you control", "creature tokens you control", "tokens you control" (D-369, CR 111.1, 205.3m): a plural group of the tokens of one player, with at most one
 * creature type or the card type creature and nothing else. Null for any other filter of tokens, which is not worded.
 */
function tokenGroup(filter: ObjectFilter, plural: boolean): string | null {
  const { token: _token, zone, controller, types, subtypes, ...rest } = filter;
  if (!plural || Object.keys(rest).length > 0 || (zone ?? 'battlefield') !== 'battlefield') {
    return null;
  }
  if (controller !== 'you' && controller !== 'opponent') return null;
  if (types !== undefined && subtypes !== undefined) return null;
  if ((types?.length ?? 0) > 1 || (types !== undefined && types[0] !== 'creature')) return null;
  if ((subtypes?.length ?? 0) > 1) return null;
  const kind = subtypes?.[0] ?? types?.[0] ?? '';
  return `${kind === '' ? '' : `${kind} `}tokens${controller === 'you' ? ' you control' : ' an opponent controls'}`;
}

/** The things a filter counts, "artifacts you control" (plural) or "artifact you control" (each). */
export function thingsPhrase(filter: ObjectFilter, plural: boolean): string | null {
  // D-422 (CR 301.5, 303.4): "Aura attached to it", "Aura and Equipment attached to it", "Aura you control that's attached to a creature".
  if (filter.attachedTo !== undefined && attachableNouns(filter, plural) !== null) {
    return attachedThings(filter, plural);
  }
  // D-139: "artifacts or enchantments you control", a union of card types and nothing else per member.
  if (filter.anyOf !== undefined) {
    const { anyOf, ...rest } = filter;
    const single = anyOf.every(
      (m) => Object.keys(m).every((k) => k === 'types') && m.types?.length === 1,
    );
    if (!single || rest.types !== undefined || rest.subtypes !== undefined) return null;
    return thingsPhrase({ ...rest, types: anyOf.flatMap((m) => m.types ?? []) }, plural);
  }
  if (Object.keys(filter).some((k) => !COUNTABLE.has(k))) return null;
  // "Tokens" as a counted noun is worded for one shape only (D-369): "Zombie tokens you control", "creature tokens you control"; "nontoken" is worded below (D-133).
  if (filter.token === true) return tokenGroup(filter, plural);
  const zone = filter.zone ?? 'battlefield';
  // D-145: a commander is worded on the battlefield only; a card of a commander in a graveyard or hand is not said.
  if (filter.commander === true && zone !== 'battlefield') return null;
  // D-149: "your commander" is a card the player owns and designated, wherever it is controlled: not a "commanders you control".
  if (filter.commander === 'yours') return null;
  const who = filter.controller ?? 'any';
  const subtypeList = filter.subtypes ?? [];
  // D-151 (CR 205.3i): "you control a Mountain": a basic land type with no card type names lands.
  const types =
    filter.types === undefined &&
    subtypeList.length > 0 &&
    subtypeList.every((t) => BASIC_LAND_TYPES.has(t))
      ? (['land'] as const)
      : (filter.types ?? []);
  // "Zombies you control", not "Zombie creatures": a subtype names its type (CR 205.3). The plural of every
  // creature type is `pluralSubtype` ("Elves", "Wolves", "Merfolk").
  const lone = types.length === 1 && subtypeList.length > 0 && zone === 'battlefield';
  const last = subtypeList[subtypeList.length - 1] ?? '';
  // D-145 (CR 903.3): "commanders you control", "creature commanders you control". A subtype before it stays an adjective.
  const commander = filter.commander === true;
  const asNoun = lone && !commander;
  const subtypes = (asNoun ? subtypeList.slice(0, -1) : subtypeList).join(' ');
  const s = plural ? 's' : '';
  const adjectives = [
    filter.other === true ? 'other' : '',
    filter.attacking === true ? 'attacking' : '',
    filter.tapped === true ? 'tapped' : filter.tapped === false ? 'untapped' : '',
    filter.token === false ? 'nontoken' : '',
    (filter.notTypes ?? []).map((t) => `non${t}`).join(' '),
    // D-135 (CR 205.4): "nonbasic lands", "nonlegendary creatures".
    (filter.notSupertypes ?? []).map((t) => `non${t}`).join(' '),
    (filter.notSubtypes ?? []).map((t) => `non-${t}`).join(' '),
    filter.colorless === true ? 'colorless' : '',
    (filter.colors ?? []).map((c) => COLOR_NAMES[c] ?? c).join(' and '),
    (filter.supertypes ?? []).join(' '),
    subtypes,
  ].filter((w) => w !== '');
  let noun: string;
  let place: string;
  if (zone === 'battlefield') {
    noun = commander
      ? `${types.map((t) => `${t} `).join('')}commander${s}`
      : asNoun
        ? plural
          ? pluralSubtype(last)
          : last
        : (types.length === 0 ? ['permanent'] : types).map((t) => `${t}${s}`).join(' or ');
    place =
      who === 'you'
        ? ' you control'
        : who === 'opponent'
          ? ' an opponent controls'
          : who === 'triggerPlayer'
            ? ' that opponent controls'
            : who === 'defendingPlayer'
              ? ' defending player controls'
              : filter.attacking === true ||
                  filter.attackingYou === true ||
                  filter.attackingOpponents === true ||
                  filter.attackingOrBlocking === true
                ? ''
                : ' on the battlefield';
  } else if (zone === 'stack') {
    noun = `${types.length === 0 ? '' : `${types.join(' or ')} `}spell${s}`;
    place = ' on the stack';
  } else {
    const words = ZONE_WORDS[zone];
    if (words === undefined) return null;
    noun = `${types.length === 0 ? '' : `${types.join(' or ')} `}card${s}`;
    place = ` ${words[who === 'triggerPlayer' || who === 'defendingPlayer' ? 'opponent' : who]}`;
  }
  // The adjectives of "other creatures" and "white creatures" go before the noun.
  // CR 508.1b (D-131): "creatures attacking you", the attackers whose target is the player.
  const attackers =
    filter.attackingOrBlocking === true
      ? ' that is attacking or blocking'
      : filter.attackingYou === true
        ? ' attacking you'
        : filter.attackingOpponents === true
          ? ' attacking your opponents and/or planeswalkers they control'
          : '';
  // D-422 (CR 303.4): "creatures that aren't enchanted" names its objects by what is attached to them, so no "on the battlefield".
  const attached = attachedToWords(filter);
  if (attached === null) return null;
  const enchanted = enchantedWords(filter, plural);
  const where =
    (attached !== '' || enchanted !== '') && place === ' on the battlefield' ? '' : place;
  return `${[...adjectives, noun].join(' ')}${where}${attackers}${withText(filter)}${attached}${enchanted}`;
}

/**
 * "Aura attached to it", "Auras you control that are attached to a creature", "other Aura and Equipment attached to it" (D-422, CR 301.5, 303.4): the attachable permanents a filter
 * names by their subtype, with who controls them and what they are attached to. Null for any other field of the filter.
 */
function attachedThings(filter: ObjectFilter, plural: boolean): string | null {
  const {
    anyOf: _anyOf,
    subtypes: _subtypes,
    controller,
    other,
    attachedTo: _to,
    ...rest
  } = filter;
  if (Object.keys(rest).some((k) => k !== 'zone' || filter.zone !== 'battlefield')) return null;
  const noun = attachableNouns(filter, plural);
  const to = attachedToWords(filter);
  if (noun === null || to === null) return null;
  const control =
    controller === 'you'
      ? ' you control'
      : controller === 'opponent'
        ? ' an opponent controls'
        : '';
  if (controller !== undefined && controller !== 'you' && controller !== 'opponent') return null;
  // "that's attached to a creature" says "that are" of a plural group.
  const tail = plural ? to.replace(" that's attached", ' that are attached') : to;
  return `${other === true ? 'other ' : ''}${noun}${control}${tail}`;
}

/**
 * "the number of artifacts you control", "the number of cards in your hand", "the number of other
 * creatures you control": what a `countOf` counts. Null when the filter has a field the words cannot say.
 */
export function countPhrase(filter: ObjectFilter): string | null {
  const things = thingsPhrase(filter, true);
  return things === null ? null : `the number of ${things}`;
}
