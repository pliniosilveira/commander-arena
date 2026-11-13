/**
 * The words of a triggered ability's condition ("Whenever you draw a card", "At the beginning of
 * combat on your turn"), read from its `Trigger` AST (CR 603.1). Used wherever a trigger is named:
 * the stack panel, the target prompt of a trigger and the ability gist. Pure functions.
 *
 * Honesty (AGENTS.md): a shape the words do not cover (a filter field they cannot say, a trigger kind
 * added later) gives `null`, never a guess; the caller then names the source instead.
 */
import {
  CREATURE_TYPES,
  type NumberComparison,
  type ObjectFilter,
  type Trigger,
  type TriggerStep,
  type TriggerSubject,
  type Zone,
} from '@commander-arena/engine';
import { romanNumeral } from './saga';
import { COLOR_NAMES, SMALL_COUNT_WORDS } from './words';

/** What the words need to know about the ability's source. */
export interface TriggerContext {
  /** The name of the source, for "Whenever X leaves the battlefield". */
  readonly self: string;
  /** The source's subtypes, to tell "equipped creature" (Equipment) from "enchanted ..." (Aura). */
  readonly subtypes?: readonly string[];
}

const ORDINALS = [
  'zeroth',
  'first',
  'second',
  'third',
  'fourth',
  'fifth',
  'sixth',
  'seventh',
  'eighth',
  'ninth',
  'tenth',
];

const STEP_WORDS: Readonly<Record<TriggerStep, string>> = {
  upkeep: 'upkeep',
  draw: 'draw step',
  main1: 'precombat main phase',
  beginCombat: 'combat',
  combatEnd: 'end of combat',
  main2: 'postcombat main phase',
  endStep: 'end step',
};

const withArticle = (noun: string): string => (/^[aeiou]/i.test(noun) ? `an ${noun}` : `a ${noun}`);

/** "power 4 or greater", "toughness 2 or less", "mana value 3". */
function comparisonText(what: string, c: NumberComparison): string {
  const tail = c.cmp === 'atLeast' ? ' or greater' : c.cmp === 'atMost' ? ' or less' : '';
  return `${what} ${c.value}${tail}`;
}

/** The parts of a filter the words below can say; any other field makes the phrase unknowable. */
const SAYABLE: ReadonlySet<string> = new Set([
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
  'chosenType',
  'chosenColor',
  'anyOf',
  'stackKind',
  'zone',
  'attacking',
  'powerLessThanSource',
  // D-133: nontoken, non-Zombie, colorless, with and without a keyword.
  'token',
  'notSubtypes',
  'colorless',
  'keywords',
  'notKeywords',
  // D-139: "with two or more colors", "with mana value X", "whose controller was dealt combat damage by this creature this turn".
  'colorCount',
  'manaValueX',
  'controllerDealtDamageBySource',
  // D-145: "a commander", "a creature with a counter on it".
  'commander',
  'hasCounter',
]);

/** The noun of a filter with its adjectives and no article: "nonland permanent", "red Goblin creature". */
function nounCore(filter: ObjectFilter, base: string): string | null {
  if (Object.keys(filter).some((k) => !SAYABLE.has(k))) return null;
  // A zone other than the battlefield (a spell on the stack, a card in a graveyard) is not said here.
  if (filter.zone !== undefined && filter.zone !== 'battlefield' && filter.zone !== 'stack') {
    return null;
  }
  const members = filter.anyOf ?? [];
  let nouns: string;
  if (members.length > 0) {
    const parts = members.map((m) => nounCore(m, base));
    if (parts.some((p) => p === null)) return null;
    nouns = [...new Set(parts)].join(' or ');
  } else {
    nouns = (filter.types ?? []).join(' ') || base;
  }
  // D-145 (CR 903.3): "commander" names the card a player designated; a type before it is a kind of commander
  // ("creature commander"), and a filter with no type is just "commander".
  if (filter.commander !== undefined) nouns = [...(filter.types ?? []), 'commander'].join(' ');
  // "a nontoken Zombie", not "a nontoken Zombie creature": a creature type names its type (CR 205.3m).
  const subtypes = filter.subtypes ?? [];
  const bare =
    members.length === 0 && subtypes.length > 0 && filter.token !== true && nouns === 'creature';
  const adjectives = [
    filter.tapped === true ? 'tapped' : filter.tapped === false ? 'untapped' : '',
    filter.attacking === true ? 'attacking' : '',
    filter.token === false ? 'nontoken' : '',
    (filter.notTypes ?? []).map((t) => `non${t}`).join(' '),
    // D-135 (CR 205.4): "a nonbasic land".
    (filter.notSupertypes ?? []).map((t) => `non${t}`).join(' '),
    (filter.notSubtypes ?? []).map((t) => `non-${t}`).join(' '),
    filter.colorless === true ? 'colorless' : '',
    (filter.colors ?? []).map((c) => COLOR_NAMES[c] ?? c).join(' and '),
    (filter.supertypes ?? []).join(' '),
    (bare ? subtypes.slice(0, -1) : subtypes).join(' '),
  ].filter((w) => w !== '');
  // "of the chosen type" is said after the noun, as the cards print it.
  const chosen =
    filter.chosenType === true
      ? ' of the chosen type'
      : filter.chosenColor === true
        ? ' of the chosen color'
        : '';
  // "Creature token": a token is named after what it is.
  const kind =
    filter.token === true
      ? `${nouns} token`
      : bare
        ? (subtypes[subtypes.length - 1] ?? nouns)
        : nouns;
  return `${[...adjectives, kind].join(' ')}${chosen}`;
}

const COUNT_WORDS: readonly string[] = ['zero', 'one', 'two', 'three', 'four', 'five'];

/**
 * "two or more colors", "exactly one color", "colorless" (D-139, CR 105.2): the number of colors an object has. Pure.
 */
export function colorCountText(c: NumberComparison): string {
  const n = COUNT_WORDS[c.value] ?? String(c.value);
  const colors = c.value === 1 ? 'color' : 'colors';
  if (c.cmp === 'atLeast') return `${n} or more colors`;
  if (c.cmp === 'atMost') return `${n} or fewer ${colors}`;
  return c.value === 0 ? 'no colors' : `exactly ${n} ${colors}`;
}

/**
 * " with power 4 or greater and toughness 2 or less", or ''. D-139 adds "with mana value X", "with two or more colors"
 * and, after them, "whose controller was dealt combat damage by this creature this turn".
 */
export function withText(filter: ObjectFilter): string {
  const parts = [
    filter.power === undefined ? '' : comparisonText('power', filter.power),
    filter.toughness === undefined ? '' : comparisonText('toughness', filter.toughness),
    filter.manaValue === undefined ? '' : comparisonText('mana value', filter.manaValue),
    filter.manaValueX === true ? 'mana value X' : '',
    filter.colorCount === undefined ? '' : colorCountText(filter.colorCount),
    // D-145 (CR 122.1): "with a counter on it", "with a stun counter on it".
    filter.hasCounter === undefined ? '' : counterOnIt(filter.hasCounter),
    // Mentor (CR 702.134a): "target attacking creature with power less than this creature's power".
    filter.powerLessThanSource === true ? "power less than this creature's power" : '',
    (filter.keywords ?? []).map(keywordWords).join(' and '),
  ].filter((p) => p !== '');
  const without = (filter.notKeywords ?? []).map(keywordWords).join(' or ');
  // CR 510.2 (D-139): the players this creature dealt combat damage to this turn.
  const whose =
    filter.controllerDealtDamageBySource === true
      ? ' whose controller was dealt combat damage by this creature this turn'
      : '';
  return `${parts.length === 0 ? '' : ` with ${parts.join(' and ')}`}${without === '' ? '' : ` without ${without}`}${whose}`;
}

/** "a counter on it" for any counter, "a stun counter on it" for a named kind (D-145, CR 122.1). */
function counterOnIt(counter: true | string): string {
  return counter === true ? 'a counter on it' : `a ${counter} counter on it`;
}

/** "first strike" for `firstStrike`: a keyword as the cards print it, lower case. */
export const keywordWords = (kind: string): string => kind.replace(/([A-Z])/g, ' $1').toLowerCase();

/** " you control" / " an opponent controls", or ''. */
function controlText(filter: ObjectFilter): string {
  switch (filter.controller) {
    case 'you':
      return ' you control';
    case 'opponent':
      return ' an opponent controls';
    case 'triggerPlayer':
      // D-151 (Parapet Thrasher): "target artifact that opponent controls", the player the event is about.
      return ' that opponent controls';
    case 'defendingPlayer':
      // D-151: "target creature defending player controls", read from the combat the source is in.
      return ' defending player controls';
    default:
      return '';
  }
}

const CREATURE_TYPE_SET: ReadonlySet<string> = new Set(CREATURE_TYPES);

/** True for a filter that names creature types and no card type (and no union of kinds): its objects are creatures (CR 205.3m). */
function onlyCreatureTypes(filter: ObjectFilter): boolean {
  const subtypes = filter.subtypes ?? [];
  return (
    filter.types === undefined &&
    filter.anyOf === undefined &&
    subtypes.length > 0 &&
    subtypes.every((t) => CREATURE_TYPE_SET.has(t))
  );
}

/**
 * A filter as a noun phrase with its article: "a creature you control", "another creature",
 * "a creature with power 4 or greater", "a noncreature spell". `base` is the noun when the filter
 * names no type ("permanent", or "spell" for a cast trigger). Null when a field cannot be said.
 */
export function filterPhrase(given: ObjectFilter, base = 'permanent'): string | null {
  // D-151: "a Dragon you control enters": a creature type and no card type names creatures, not "Dragon permanents".
  const filter =
    base === 'permanent' && onlyCreatureTypes(given)
      ? { ...given, types: ['creature' as const] }
      : given;
  const core = nounCore(filter, base);
  if (core === null) return null;
  // D-149 (CR 903.3): "your commander" is the card the player owns and designated: "Whenever your commander enters or attacks".
  if (filter.commander === 'yours') return `your ${core}${withText(filter)}`;
  const noun = filter.other === true ? `another ${core}` : withArticle(core);
  // "a creature you control with power 4 or greater": whose, then what it has.
  return `${noun}${controlText(filter)}${withText(filter)}`;
}

/** The permanent a trigger is about, as the words name it. Null when it cannot be said. */
function subjectPhrase(what: TriggerSubject, ctx: TriggerContext): string | null {
  if ('kind' in what) {
    if (what.kind === 'this') return ctx.self;
    const subtypes = ctx.subtypes ?? [];
    if (subtypes.includes('Equipment')) return 'equipped creature';
    if (subtypes.includes('Aura')) return 'enchanted permanent';
    return 'the permanent this is attached to';
  }
  return filterPhrase(what);
}

const WHOSE_STEP: Readonly<Record<'you' | 'each' | 'opponent', string>> = {
  you: 'your',
  each: "each player's",
  opponent: "each opponent's",
};

/** "At the beginning of combat on your turn", "At the beginning of each opponent's upkeep". */
function stepWording(step: TriggerStep, whose: 'you' | 'each' | 'opponent'): string {
  // The two steps that are not "<player>'s <step>" read "on <player's> turn".
  if (step === 'beginCombat' || step === 'combatEnd') {
    const word = step === 'beginCombat' ? 'combat' : 'the end of combat';
    if (whose === 'each') {
      return `At the beginning of each ${step === 'beginCombat' ? 'combat' : 'end of combat'}`;
    }
    return `At the beginning of ${word} on ${whose === 'you' ? 'your' : "each opponent's"} turn`;
  }
  const w = STEP_WORDS[step];
  if (whose === 'each') return `At the beginning of each ${w}`;
  return `At the beginning of ${WHOSE_STEP[whose]} ${w}`;
}

const ZONE_WORDS: Readonly<Partial<Record<Zone, string>>> = {
  graveyard: 'is put into a graveyard',
  exile: 'is put into exile',
  hand: "is put into its owner's hand",
  library: "is put into its owner's library",
  command: 'is put into the command zone',
};

const BY_WORDS = { you: 'you', opponent: 'an opponent', any: 'a player' } as const;

/**
 * The condition of a triggered ability as a sentence start, capitalised: "Whenever you draw a card".
 * Null for a shape the words do not cover.
 */
export function triggerWording(trigger: Trigger, ctx: TriggerContext): string | null {
  switch (trigger.kind) {
    case 'step':
      return stepWording(trigger.step, trigger.whose);
    case 'upkeep':
      return stepWording('upkeep', trigger.whose);
    case 'endStep':
      return stepWording('endStep', trigger.whose);
    case 'drawn': {
      const nth = trigger.nth;
      if (nth === undefined) {
        return `Whenever ${trigger.who === 'you' ? 'you draw' : `${BY_WORDS[trigger.who]} draws`} a card`;
      }
      const card = `${ORDINALS[nth] ?? `${nth}th`} card each turn`;
      if (trigger.who === 'you') return `Whenever you draw your ${card}`;
      return `Whenever ${BY_WORDS[trigger.who]} draws their ${card}`;
    }
    case 'entersBattlefield': {
      const what = subjectPhrase(trigger.what, ctx);
      if (what === null) return null;
      // D-135 (CR 603.6a): "enters untapped" / "enters tapped", how it came in.
      const state = trigger.tapped === undefined ? '' : trigger.tapped ? ' tapped' : ' untapped';
      return `Whenever ${what} enters${state}`;
    }
    case 'dies': {
      const what = subjectPhrase(trigger.what, ctx);
      return what === null ? null : `Whenever ${what} dies`;
    }
    case 'attacks': {
      const what = subjectPhrase(trigger.what, ctx);
      if (what === null) return null;
      // D-133 (CR 508.1b): whom it is aimed at.
      const aim =
        trigger.at === 'you'
          ? ' you'
          : trigger.at === 'youOrPlaneswalkers'
            ? ' you or a planeswalker you control'
            : '';
      // D-151 (CR 500.8): "attacks for the first time each turn", not again in an additional combat phase.
      const first = trigger.firstTimeEachTurn === true ? ' for the first time each turn' : '';
      return `Whenever ${what} attacks${aim}${trigger.alone ? ' alone' : ''}${first}`;
    }
    case 'dealtDamage': {
      // D-133 (CR 120.3): once for each source that damages the permanent.
      const what = subjectPhrase(trigger.what, ctx);
      return what === null
        ? null
        : `Whenever ${what} is dealt ${trigger.combat === true ? 'combat ' : ''}damage`;
    }
    case 'blocks': {
      // CR 509.1g (D-120): once for each creature declared as a blocker.
      const what = subjectPhrase(trigger.what, ctx);
      return what === null ? null : `Whenever ${what} blocks`;
    }
    case 'becomesBlocked': {
      // CR 509.1h (D-120): once for each attacking creature that has a blocker.
      const what = subjectPhrase(trigger.what, ctx);
      return what === null ? null : `Whenever ${what} becomes blocked`;
    }
    case 'becomesTapped': {
      const what = subjectPhrase(trigger.what, ctx);
      return what === null ? null : `Whenever ${what} becomes tapped`;
    }
    case 'becomesUntapped': {
      // D-206 (CR 701.26a): "Whenever this artifact becomes untapped".
      const what = subjectPhrase(trigger.what, ctx);
      return what === null ? null : `Whenever ${what} becomes untapped`;
    }
    case 'discarded': {
      // D-206 (CR 701.9a): "Whenever you discard a card".
      const who =
        trigger.who === 'you' ? 'you' : trigger.who === 'opponent' ? 'an opponent' : 'a player';
      // D-374 (CR 702.29a: cycling is discarding): "another card" leaves out the card with the ability.
      return `Whenever ${who} discard${trigger.who === 'you' ? '' : 's'} ${trigger.another === true ? 'another' : 'a'} card`;
    }
    case 'diesBatch': {
      // D-206 (CR 603.2c): "Whenever one or more other creatures and/or artifacts you control die".
      const core = nounCore(trigger.what, 'permanent');
      if (core === null) return null;
      const things = `${core.endsWith('s') ? core : `${core}s`}${controlText(trigger.what)}${withText(trigger.what)}`;
      return `Whenever one or more ${trigger.what.other === true ? 'other ' : ''}${things} die`;
    }
    case 'leftGraveyard':
      // D-229 (CR 400.7, 603.2c).
      return 'Whenever one or more cards leave your graveyard';
    case 'exiledFromLibraryOrGraveyard':
      // D-229 (CR 400.7, 603.2c).
      return 'Whenever one or more cards are put into exile from your library and/or your graveyard';
    case 'entersBatch': {
      // D-218 (CR 603.2c): "Whenever one or more tokens you control enter".
      const core = nounCore(trigger.what, 'permanent');
      const tokens = trigger.what.token === true;
      // A group of tokens: "tokens" or "creature tokens" (the type word of the filter, when there is one).
      const kind = trigger.what.types?.length === 1 ? trigger.what.types[0] : null;
      const base = tokens ? `${kind === null ? '' : `${kind} `}tokens` : core;
      if (base === null) return null;
      const things = `${base.endsWith('s') ? base : `${base}s`}${controlText(trigger.what)}${withText(trigger.what)}`;
      return `Whenever one or more ${things} enter`;
    }
    case 'becomesTarget': {
      const what = subjectPhrase(trigger.what, ctx);
      if (what === null) return null;
      const by =
        trigger.by === 'you'
          ? ' you control'
          : trigger.by === 'opponent'
            ? ' an opponent controls'
            : '';
      // D-177 (CR 603.2): "of a spell" is only a spell, not an ability.
      return `Whenever ${what} becomes the target of a spell${trigger.spellOnly === true ? '' : ' or ability'}${by}`;
    }
    case 'leavesBattlefield': {
      const what = subjectPhrase(trigger.what, ctx);
      if (what === null) return null;
      // D-135: one zone, or several, which read as one clause: "dies or is put into exile from the battlefield".
      if (typeof trigger.to === 'object') {
        // "Dies" (the graveyard) comes first, as the cards print it.
        const zones = [...trigger.to].sort(
          (a, b) => Number(b === 'graveyard') - Number(a === 'graveyard'),
        );
        const words = zones.map((zone) => (zone === 'graveyard' ? 'dies' : ZONE_WORDS[zone]));
        if (words.some((word) => word === undefined)) return null;
        return `Whenever ${what} ${words.join(' or ')} from the battlefield`;
      }
      const to = trigger.to === undefined ? undefined : ZONE_WORDS[trigger.to];
      if (trigger.to !== undefined && to === undefined) return null;
      return `Whenever ${what} leaves the battlefield${to === undefined ? '' : ` and ${to}`}`;
    }
    case 'dealsCombatDamage': {
      const what = subjectPhrase(trigger.what, ctx);
      if (what === null) return null;
      const head = `Whenever ${what} deals combat damage`;
      if (trigger.to === 'any') return head;
      if (trigger.to === 'player') return `${head} to a player`;
      if (trigger.to === 'opponent') return `${head} to an opponent`;
      // D-373 (CR 120.2a): a player, or a planeswalker.
      if (trigger.to === 'playerOrPlaneswalker') return `${head} to a player or planeswalker`;
      const victim =
        trigger.filter === undefined ? 'a creature' : filterPhrase(trigger.filter, 'creature');
      return victim === null ? null : `${head} to ${victim}`;
    }
    case 'noncombatDamageDealt': {
      // D-333 (CR 120.2b, 603.2c): "Whenever a source you control deals noncombat damage to an opponent".
      const source = trigger.by === 'you' ? 'a source you control' : 'a source';
      return `Whenever ${source} deals noncombat damage to ${trigger.to === 'opponent' ? 'an opponent' : 'a player'}`;
    }
    case 'castSpell': {
      // CR 601.2i, 603.2 (D-183): the spell's own ability, "When you cast this spell".
      if (trigger.self === true) return 'When you cast this spell';
      const spell = filterPhrase(trigger.filter, 'spell');
      if (spell === null) return null;
      // D-218 (CR 707.10): Magecraft's "cast or copy".
      const who = trigger.by === 'you' ? 'you cast' : `${BY_WORDS[trigger.by]} casts`;
      // D-229 (CR 601.2i): "their second spell each turn".
      if (trigger.nth !== undefined) {
        const ordinal =
          ['', 'first', 'second', 'third', 'fourth'][trigger.nth] ?? `${trigger.nth}th`;
        return `Whenever ${who} ${trigger.by === 'you' ? 'your' : 'their'} ${ordinal} spell each turn`;
      }
      return `Whenever ${trigger.orCopy === true ? who.replace(/casts?$/, (m) => `${m} or cop${m === 'cast' ? 'y' : 'ies'}`) : who} ${spell}`;
    }
    case 'landfall':
      return 'Whenever a land enters under your control';
    case 'cycled':
      // D-179 (CR 702.29c): the card that was cycled.
      return 'When you cycle this card';
    case 'ringTempted':
      // D-196 (CR 701.54d): each time the Ring tempts you, whatever you could choose.
      return 'Whenever the Ring tempts you';
    case 'permanentSacrificed': {
      const what = trigger.filter === undefined ? 'a permanent' : filterPhrase(trigger.filter);
      if (what === null) return null;
      return `Whenever ${trigger.by === 'you' ? 'you sacrifice' : 'a player sacrifices'} ${what}`;
    }
    case 'lifeGained': {
      // D-149 (CR 119.9): "Whenever you gain life", once for each gain; with "for the first time each turn" only the first.
      const who = trigger.who === 'you' ? 'you gain' : `${BY_WORDS[trigger.who]} gains`;
      return `Whenever ${who} life${trigger.firstEachTurn === true ? ' for the first time each turn' : ''}`;
    }
    case 'countersAdded': {
      // D-149 (CR 122.6): "Whenever you put one or more +1/+1 counters on this creature".
      const what = subjectPhrase(trigger.what, ctx);
      if (what === null) return null;
      const kind = trigger.counter === undefined ? '' : `${trigger.counter} `;
      return trigger.by === 'you'
        ? `Whenever you put one or more ${kind}counters on ${what}`
        : `Whenever one or more ${kind}counters are put on ${what}`;
    }
    case 'attackBatch': {
      // D-149 (CR 508.1): "Whenever you attack with two or more creatures", "Whenever another player attacks with two or more creatures".
      const core = trigger.what === undefined ? 'creature' : nounCore(trigger.what, 'creature');
      if (core === null) return null;
      const things =
        trigger.what === undefined
          ? 'creatures'
          : `${core.endsWith('s') ? core : `${core}s`}${withText(trigger.what)}`;
      // D-187: "Whenever you attack" is one creature or more, said without the count.
      // D-218: "Whenever one or more creatures attack" (any player).
      if (trigger.who === 'any') return `Whenever one or more ${things} attack`;
      if (trigger.atLeast === 1 && trigger.what === undefined) {
        return `Whenever ${trigger.who === 'you' ? 'you attack' : 'another player attacks'}`;
      }
      const words = SMALL_COUNT_WORDS[trigger.atLeast] ?? String(trigger.atLeast);
      return `Whenever ${trigger.who === 'you' ? 'you attack' : 'another player attacks'} with ${words} or more ${things}`;
    }
    case 'combatDamageBatch': {
      // D-139 (CR 603.2c): "Whenever one or more creatures you control deal combat damage to a player".
      const core = nounCore(trigger.what, 'creature');
      if (core === null) return null;
      const things = `${core.endsWith('s') ? core : `${core}s`}${controlText(trigger.what)}${withText(trigger.what)}`;
      const words = SMALL_COUNT_WORDS[trigger.atLeast ?? 1] ?? String(trigger.atLeast);
      return `Whenever ${words} or more ${things} deal combat damage to ${trigger.to === 'opponent' ? 'an opponent' : 'a player'}`;
    }
    case 'tappedForMana': {
      // D-139 (CR 605.1b): "Whenever you tap a creature for mana".
      // "a Forest", not "a Forest land": a land type names its type (CR 205.3i), as on the cards. `nounCore`
      // leaves the type noun out after a subtype for a creature only, so the land's subtype is worded as one.
      const { types, subtypes, ...rest } = trigger.what;
      const landType =
        types?.length === 1 && types[0] === 'land' && subtypes !== undefined && subtypes.length > 0
          ? filterPhrase({ ...rest, types: ['creature'], subtypes })
          : null;
      const what = landType ?? filterPhrase(trigger.what);
      if (what === null) return null;
      return `Whenever you tap ${what} for ${trigger.mana === undefined ? 'mana' : `{${trigger.mana}}`}`;
    }
    case 'tapsForMana': {
      // D-189 (CR 106.12, 603.2): "Whenever an opponent taps an artifact for mana".
      const { types, subtypes, ...rest } = trigger.what;
      const landType =
        types?.length === 1 && types[0] === 'land' && subtypes !== undefined && subtypes.length > 0
          ? filterPhrase({ ...rest, types: ['creature'], subtypes })
          : null;
      const what = landType ?? filterPhrase(trigger.what);
      if (what === null) return null;
      const who =
        trigger.who === 'you'
          ? 'you tap'
          : trigger.who === 'opponent'
            ? 'an opponent taps'
            : 'a player taps';
      return `Whenever ${who} ${what} for mana`;
    }
    case 'state':
      // D-139 (CR 603.8): the condition itself is worded by `condition-text.ts`, which this module cannot import (it imports this one).
      return 'When a condition this permanent watches for becomes true';
    case 'chapter': {
      const chapters: string[] = [];
      for (let n = trigger.from; n <= trigger.to; n += 1) chapters.push(romanNumeral(n));
      return `${chapters.length === 1 ? 'Chapter' : 'Chapters'} ${chapters.join(', ')}`;
    }
    default:
      return null;
  }
}

/** The same words with a lower-case first letter, for the middle of a sentence. */
export function triggerWordingInline(trigger: Trigger, ctx: TriggerContext): string | null {
  const text = triggerWording(trigger, ctx);
  return text === null ? null : `${text.charAt(0).toLowerCase()}${text.slice(1)}`;
}
