/**
 * Continuous effects from static abilities of permanents (CR 604, 611.3), as `derive` needs them:
 * which permanents give "+N/+N" (layer 7c, CR 613.4c), keywords or mana abilities (layer 6, CR
 * 613.1f, D-099) to a given
 * permanent, and which Auras and Equipment are attached to it. A permanent that has lost all its
 * abilities (CR 613.1f, a `loseAllAbilities` effect on it) gives nothing: its printed static
 * abilities are among what it lost.
 *
 * CR 611.3a: such an effect is not locked in; it applies at any given moment to whatever its text
 * indicates. So nothing is stored: each call looks at the battlefield as it is. The abilities that
 * count are the printed ones (a card's face, or a token's), read here without `derive`, because
 * `derive` calls this and a static ability cannot grant a static ability (only keywords and mana
 * abilities are granted, which never carry a static ability).
 *
 * The scan is the same for every permanent, so it is done once per game state and kept in a
 * `WeakMap` keyed by the state's object table, checked against the battlefield, the card
 * definitions and the continuous effects (a scenario may patch those without touching the table).
 * The cache only saves work: it holds nothing that `state` does not determine.
 */
import type {
  Ability,
  Amount,
  Condition,
  Keyword,
  ObjectFilter,
  Restriction,
  StaticEffect,
} from '../ast/types';
import type { ObjectId, SeatId } from '../ids';
import type { GameObject, GameState } from '../state/types';
import { colorsNotInCommanderIdentity } from './commander-colors';
import { controllerOf } from './control';
import { copiableValues } from './copiable';
import { characteristicPtOf, staticAmountOf } from './derive-count';
import { linkedCardOf, topCardOf } from './derive-group-types';
import type { StaticGrant } from './derive-layers';
import { emblemsOf } from './emblem';
import { type FilterContext, type FilterSubject, matchesFilterWith } from './filter-match';
import { hasLostAbilities } from './lost-abilities';
import { isCommanderCardId } from './melded';
import { staticConditionHolds } from './static-conditions';
import { subjectAffects, subjectContextOf } from './static-subject';

type Modifier = Extract<
  StaticEffect,
  {
    kind:
      | 'modifyPt'
      | 'grantKeyword'
      | 'grantAbility'
      | 'restriction'
      | 'goaded'
      | 'setPt'
      | 'cantBeBlockedBy'
      | 'takeFromLinkedExile'
      | 'grantActivatedAbilitiesOfTopCard'
      | 'loseAllAbilities';
  }
> & {
  /**
   * "As long as ..." (D-133): the ability applies only while the condition holds for its permanent, read each time
   * the effects on a permanent are worked out (CR 611.3a).
   */
  readonly condition?: Condition;
  /** `JSON.stringify(condition)`, made once when the index is built: the key the answers are kept under. */
  readonly conditionKey?: string;
};

interface ModifierSource {
  readonly object: GameObject;
  readonly modifiers: readonly Modifier[];
  /** What the filters of its abilities read of the permanent, made once with the index (`subjectContextOf`). */
  readonly context: FilterContext;
}

/** One static ability of one permanent, with what the order of applying it depends on (D-111, D-149), made once with the index. */
interface ModifierEntry {
  readonly source: ModifierSource;
  readonly mod: Modifier;
  /** Its subject compares power or toughness: it applies after the effects that change them (CR 613.8a). */
  readonly pt: boolean;
  /** Its subject names a keyword: it applies after the effects that give keywords (CR 613.8a). */
  readonly keywords: boolean;
  /**
   * A "+N/+N" static ability whose subject names a keyword (D-149): layer 7c depends on layer 6 (CR 613.1f, 613.4c), so it applies
   * after every effect of layer 6 has, to the keywords the target has then.
   */
  readonly late: boolean;
  /** Its place in the order the static abilities are applied in (battlefield order). */
  readonly seq: number;
}

/**
 * The static abilities of one kind of order (see `BoardIndex.immediate`), split by whom they can affect: a "this" subject affects only its
 * own permanent and an "attached" subject only the permanent it is attached to (CR 303.4, 301.5), so those are listed under that
 * permanent and tried for it alone; the abilities with a filter subject can affect any permanent and are tried for all.
 */
interface EntryLists {
  readonly common: readonly ModifierEntry[];
  readonly byTarget: ReadonlyMap<ObjectId, readonly ModifierEntry[]>;
}

/** The abilities to try for the permanent `id`, in the order they apply in. */
function entriesFor(lists: EntryLists, id: ObjectId): readonly ModifierEntry[] {
  const own = lists.byTarget.get(id);
  if (own === undefined) return lists.common;
  return [...lists.common, ...own].sort((a, b) => a.seq - b.seq);
}

function listEntries(entries: readonly ModifierEntry[]): EntryLists {
  const common: ModifierEntry[] = [];
  const byTarget = new Map<ObjectId, ModifierEntry[]>();
  for (const entry of entries) {
    const subject = entry.mod.subject;
    const target =
      subject.kind === 'this'
        ? entry.source.object.id
        : subject.kind === 'attached' && !('andThis' in subject && subject.andThis === true)
          ? entry.source.object.attachedTo
          : undefined;
    if (target === undefined) common.push(entry);
    // An Aura or Equipment that is attached to nothing affects nothing.
    else if (target !== null) {
      const list = byTarget.get(target);
      if (list === undefined) byTarget.set(target, [entry]);
      else list.push(entry);
    }
  }
  return { common, byTarget };
}

/**
 * A static ability of a permanent that reduces what spells cost (`costReduction` with a filter,
 * D-095): read by `rules/cast-cost.ts`, not by `derive`. A permanent that lost all its abilities has
 * none (CR 613.1f).
 */
export interface CostReductionSource {
  readonly object: GameObject;
  readonly spells: ObjectFilter;
  readonly amount: Amount;
}

/**
 * A static ability of a permanent that reduces what the Equip abilities its controller activates cost when they target a kind of object (`abilityCostReduction`, D-425): read
 * by `rules/activate-adjust.ts`, not by `derive`. A permanent that lost all its abilities has none (CR 613.1f).
 */
export interface AbilityReductionSource {
  readonly object: GameObject;
  /** The Equip abilities that target an object this matches (D-425); absent for a reduction of the abilities of some objects. */
  readonly targeting?: ObjectFilter;
  /** The objects whose activated abilities cost less, cards in a graveyard (D-461); absent for an Equip reduction. */
  readonly objects?: ObjectFilter;
  readonly amount: Amount;
}

/**
 * A static ability of a permanent that lets its controller cast the spells `spells` names as though they had flash (`castAsThoughFlash`,
 * D-139): read by `rules/legality.ts`, not by `derive`. A permanent that lost all its abilities has none (CR 613.1f).
 */
export interface FlashPermissionSource {
  readonly object: GameObject;
  readonly spells: ObjectFilter;
  /** "Any player may cast ..." (CR 601.3b): the permission is every player's, not the controller's alone. */
  readonly anyPlayer: boolean;
}

/**
 * A static ability of a permanent that lets its controller cast spells from the top of their library (`castFromTopOfLibrary`, D-151): read by
 * `rules/legality.ts`, not by `derive`. A permanent that lost all its abilities has none (CR 613.1f).
 */
export interface LibraryCastSource {
  readonly object: GameObject;
  readonly spells: ObjectFilter;
  readonly gainsHaste: boolean;
  /** The permanent sacrificed as an additional cost of a spell cast this way ("by sacrificing a nonland permanent"); absent for none. */
  readonly sacrifice?: ObjectFilter;
}

/**
 * A static ability of a permanent that lets its controller, once during each of their turns, play a land or cast a spell from their graveyard
 * (`playFromGraveyardOnceEachTurn`, D-232): read by `rules/graveyard-play.ts`. A permanent that lost all its abilities has none (CR 613.1f).
 */
export interface GraveyardPlaySource {
  readonly object: GameObject;
  readonly cast: ObjectFilter | undefined;
  readonly land: boolean;
  readonly entersTapped: boolean;
  readonly gains: Ability | undefined;
  /** `playLandsFromGraveyard`: the land cards that may be played (any land when absent); the permission is not used up by a use. */
  readonly lands?: ObjectFilter;
  readonly unlimited?: true;
}

/**
 * A static ability of a permanent that gives the cards in its controller's hand a keyword (`grantKeywordToHandCards`, issue 104, CR 702.29a, 613.1f): read by `staticEffectsOn` for a
 * card in a hand. A permanent that lost all its abilities has none (CR 613.1f).
 */
interface HandGrantSource {
  readonly object: GameObject;
  readonly what: ObjectFilter;
  readonly keyword: Extract<Keyword, { readonly kind: 'cycling' }>;
  readonly condition?: Condition;
  readonly conditionKey?: string;
}

/**
 * A static ability of a permanent that gives a keyword to the spells its controller casts (`grantKeywordToSpells`, issue 145, CR 702.144a, 702.51a, 613.1f): read by `staticEffectsOn`
 * for a spell on the stack. A permanent that lost all its abilities has none (CR 613.1f).
 */
interface SpellGrantSource {
  readonly object: GameObject;
  readonly what: ObjectFilter;
  readonly keyword: Extract<Keyword, { readonly kind: 'demonstrate' | 'convoke' }>;
  readonly condition?: Condition;
  readonly conditionKey?: string;
}

/** A static ability of a permanent that gives flashback to the cards of its controller's graveyard (`grantFlashbackToGraveyardCards`, CR 702.34a, 613.1f). */
export interface FlashbackGrantSource {
  readonly object: GameObject;
  readonly what: ObjectFilter;
  readonly condition?: Condition;
}

interface BoardIndex {
  readonly battlefield: readonly ObjectId[];
  readonly definitions: GameState['definitions'];
  readonly effects: GameState['continuousEffects'];
  /** The static abilities of `sources` that do not depend on others, in battlefield order (the order they are applied in). */
  readonly immediate: EntryLists;
  /** The static abilities that depend on power, toughness or keywords, in battlefield order (applied after `immediate`). */
  readonly deferred: EntryLists;
  /** The "+N/+N" static abilities whose subject names a keyword, in battlefield order (applied after `deferred`, D-149). */
  readonly late: EntryLists;
  /** Permanents with a `costReduction` static ability that names spells by a filter, in battlefield order. */
  readonly reductions: readonly CostReductionSource[];
  /** Whether any permanent has a `costIncrease` static ability, its own or one a `grantAbility` gives (D-149): only then are the derived abilities read for a tax. */
  readonly hasCostIncrease: boolean;
  /** Permanents with an `abilityCostReduction` static ability, in battlefield order (D-425). */
  readonly abilityReductions: readonly AbilityReductionSource[];
  /** Permanents with a `castAsThoughFlash` static ability, in battlefield order (D-139). */
  readonly flashes: readonly FlashPermissionSource[];
  /** Permanents with a `castFromTopOfLibrary` static ability, in battlefield order (D-151). */
  readonly libraryCasts: readonly LibraryCastSource[];
  /** Permanents with a `playFromGraveyardOnceEachTurn` static ability, in battlefield order (D-232). */
  readonly graveyardPlays: readonly GraveyardPlaySource[];
  /** Permanents with a `grantKeywordToHandCards` static ability, in battlefield order (issue 104). */
  readonly handGrants: readonly HandGrantSource[];
  /** Permanents with a `grantKeywordToSpells` static ability, in battlefield order (issue 145). */
  readonly spellGrants: readonly SpellGrantSource[];
  /** Permanents with a `grantFlashbackToGraveyardCards` static ability, in battlefield order. */
  readonly flashbackGrants: readonly FlashbackGrantSource[];
  /** Permanents attached to each permanent, in battlefield order. */
  readonly attachments: ReadonlyMap<ObjectId, readonly ObjectId[]>;
}

const cache = new WeakMap<object, BoardIndex>();

/** The abilities an object has before any effect but a copy effect changes them (CR 613.1, 707.2). */
export function printedAbilities(state: GameState, obj: GameObject): readonly Ability[] {
  if (obj.card === null && obj.token === null && obj.copyOf === undefined) return [];
  return copiableValues(state, obj).abilities;
}

function isModifier(a: Ability): a is Extract<Ability, { kind: 'static' }> & { static: Modifier } {
  return (
    a.kind === 'static' &&
    (a.static.kind === 'modifyPt' ||
      a.static.kind === 'grantKeyword' ||
      a.static.kind === 'grantAbility' ||
      a.static.kind === 'restriction' ||
      a.static.kind === 'goaded' ||
      a.static.kind === 'setPt' ||
      a.static.kind === 'cantBeBlockedBy' ||
      a.static.kind === 'takeFromLinkedExile' ||
      a.static.kind === 'grantActivatedAbilitiesOfTopCard' ||
      a.static.kind === 'loseAllAbilities')
  );
}

const modifiersOf = {
  battlefield: new WeakMap<readonly Ability[], readonly Modifier[]>(),
  graveyard: new WeakMap<readonly Ability[], readonly Modifier[]>(),
};

/**
 * The static modifiers of an ability list that work in `zone`. The list is the printed abilities of a card face or of a token (which
 * are never changed), so the answer is made once for each list, by its identity; the entries are shared by every index built from it.
 */
function staticModifiers(
  abilities: readonly Ability[],
  zone: 'battlefield' | 'graveyard' = 'battlefield',
): readonly Modifier[] {
  const known = modifiersOf[zone].get(abilities);
  if (known !== undefined) return known;
  const made = abilities
    .filter(isModifier)
    // D-151: an ability that works from the graveyard does not work on the battlefield, and the other way round (CR 113.6b).
    .filter((a) => (a.functionsIn ?? 'battlefield') === zone)
    .map((a) =>
      a.condition === undefined
        ? a.static
        : { ...a.static, condition: a.condition, conditionKey: JSON.stringify(a.condition) },
    );
  modifiersOf[zone].set(abilities, made);
  return made;
}

function costReductionsOf(
  object: GameObject,
  abilities: readonly Ability[],
  /** Eminence (CR 113.6): only the reductions that also work in the command zone. */
  commandZone = false,
): CostReductionSource[] {
  const out: CostReductionSource[] = [];
  for (const a of abilities) {
    if (a.kind !== 'static' || a.static.kind !== 'costReduction') continue;
    if (commandZone && a.static.inCommandZone !== true) continue;
    // `this` is the spell's own ability, which works on the stack only (CR 113.6d).
    if ('kind' in a.static.spells) continue;
    out.push({ object, spells: a.static.spells, amount: a.static.amount });
  }
  return out;
}

function abilityReductionsOf(
  object: GameObject,
  abilities: readonly Ability[],
): AbilityReductionSource[] {
  const out: AbilityReductionSource[] = [];
  for (const a of abilities) {
    if (a.kind === 'static' && a.static.kind === 'abilityCostReduction') {
      out.push(
        a.static.abilities === 'ofObjects'
          ? { object, objects: a.static.objects, amount: a.static.amount }
          : { object, targeting: a.static.targeting, amount: a.static.amount },
      );
    }
  }
  return out;
}

function flashesOf(object: GameObject, abilities: readonly Ability[]): FlashPermissionSource[] {
  const out: FlashPermissionSource[] = [];
  for (const a of abilities) {
    // D-408: `spells: this` is the spell's own permission (`rules/flash-targets.ts`), not a permanent's.
    if (
      a.kind === 'static' &&
      a.static.kind === 'castAsThoughFlash' &&
      !('kind' in a.static.spells)
    ) {
      out.push({ object, spells: a.static.spells, anyPlayer: a.static.anyPlayer === true });
    }
  }
  return out;
}

function libraryCastsOf(object: GameObject, abilities: readonly Ability[]): LibraryCastSource[] {
  const out: LibraryCastSource[] = [];
  for (const a of abilities) {
    if (a.kind === 'static' && a.static.kind === 'castFromTopOfLibrary') {
      out.push({
        object,
        spells: a.static.spells,
        gainsHaste: a.static.gainsHaste === true,
        ...(a.static.sacrifice === undefined ? {} : { sacrifice: a.static.sacrifice }),
      });
    }
  }
  return out;
}

function graveyardPlaysOf(
  object: GameObject,
  abilities: readonly Ability[],
): GraveyardPlaySource[] {
  const out: GraveyardPlaySource[] = [];
  for (const a of abilities) {
    if (a.kind === 'static' && a.static.kind === 'playFromGraveyardOnceEachTurn') {
      out.push({
        object,
        cast: a.static.cast,
        land: a.static.land === true,
        entersTapped: a.static.entersTapped === true,
        gains: a.static.gains,
      });
    }
    // CR 305.1: "You may play Forests from your graveyard.": a permission of lands only, never used up.
    if (a.kind === 'static' && a.static.kind === 'playLandsFromGraveyard') {
      out.push({
        object,
        cast: undefined,
        land: true,
        entersTapped: false,
        gains: undefined,
        unlimited: true,
        ...(a.static.lands === undefined ? {} : { lands: a.static.lands }),
      });
    }
  }
  return out;
}

function handGrantsOf(object: GameObject, abilities: readonly Ability[]): HandGrantSource[] {
  const out: HandGrantSource[] = [];
  for (const a of abilities) {
    // A static ability of a permanent works on the battlefield, unless it says otherwise (CR 113.6b).
    if (
      a.kind === 'static' &&
      a.static.kind === 'grantKeywordToHandCards' &&
      (a.functionsIn ?? 'battlefield') === 'battlefield'
    ) {
      out.push({
        object,
        what: a.static.what,
        keyword: a.static.keyword,
        ...(a.condition === undefined
          ? {}
          : { condition: a.condition, conditionKey: JSON.stringify(a.condition) }),
      });
    }
  }
  return out;
}

function spellGrantsOf(object: GameObject, abilities: readonly Ability[]): SpellGrantSource[] {
  const out: SpellGrantSource[] = [];
  for (const a of abilities) {
    // A static ability of a permanent works on the battlefield, unless it says otherwise (CR 113.6b).
    if (
      a.kind === 'static' &&
      a.static.kind === 'grantKeywordToSpells' &&
      (a.functionsIn ?? 'battlefield') === 'battlefield'
    ) {
      out.push({
        object,
        what: a.static.what,
        keyword: a.static.keyword,
        ...(a.condition === undefined
          ? {}
          : { condition: a.condition, conditionKey: JSON.stringify(a.condition) }),
      });
    }
  }
  return out;
}

function flashbackGrantsOf(
  object: GameObject,
  abilities: readonly Ability[],
): FlashbackGrantSource[] {
  const out: FlashbackGrantSource[] = [];
  for (const a of abilities) {
    // A static ability of a permanent works on the battlefield, unless it says otherwise (CR 113.6b).
    if (
      a.kind === 'static' &&
      a.static.kind === 'grantFlashbackToGraveyardCards' &&
      (a.functionsIn ?? 'battlefield') === 'battlefield'
    ) {
      out.push({
        object,
        what: a.static.what,
        ...(a.condition === undefined ? {} : { condition: a.condition }),
      });
    }
  }
  return out;
}

function buildIndex(state: GameState): BoardIndex {
  const sources: ModifierSource[] = [];
  const reductions: CostReductionSource[] = [];
  let hasCostIncrease = false;
  const abilityReductions: AbilityReductionSource[] = [];
  const flashes: FlashPermissionSource[] = [];
  const libraryCasts: LibraryCastSource[] = [];
  const graveyardPlays: GraveyardPlaySource[] = [];
  const handGrants: HandGrantSource[] = [];
  const spellGrants: SpellGrantSource[] = [];
  const flashbackGrants: FlashbackGrantSource[] = [];
  const attachments = new Map<ObjectId, ObjectId[]>();
  for (const id of state.battlefield) {
    const object = state.objects[id];
    if (object === undefined) continue;
    // CR 613.1f: a permanent that lost all abilities has no static ability left to apply.
    const printed = hasLostAbilities(state, id) ? [] : printedAbilities(state, object);
    const modifiers = staticModifiers(printed);
    if (modifiers.length > 0)
      sources.push({ object, modifiers, context: subjectContextOf(state, object) });
    if (printed.some(givesCostIncrease)) hasCostIncrease = true;
    reductions.push(...costReductionsOf(object, printed));
    abilityReductions.push(...abilityReductionsOf(object, printed));
    flashes.push(...flashesOf(object, printed));
    libraryCasts.push(...libraryCastsOf(object, printed));
    graveyardPlays.push(...graveyardPlaysOf(object, printed));
    handGrants.push(...handGrantsOf(object, printed));
    spellGrants.push(...spellGrantsOf(object, printed));
    flashbackGrants.push(...flashbackGrantsOf(object, printed));
    if (object.attachedTo !== null) {
      const list = attachments.get(object.attachedTo);
      if (list === undefined) attachments.set(object.attachedTo, [id]);
      else list.push(id);
    }
  }
  // CR 114.4 (D-201): the static abilities of an emblem work from the command zone, for as long as the game lasts.
  for (const id of emblemsOf(state)) {
    const object = state.objects[id];
    if (object === undefined) continue;
    const printed = printedAbilities(state, object);
    const modifiers = staticModifiers(printed);
    if (modifiers.length > 0) {
      sources.push({ object, modifiers, context: subjectContextOf(state, object) });
    }
    reductions.push(...costReductionsOf(object, printed));
    flashes.push(...flashesOf(object, printed));
  }
  // CR 113.6, 903.8 (issue 81, Eminence): a commander in the command zone has the cost reductions that say they work there.
  for (const seat of state.seats) {
    for (const id of seat.command) {
      const object = state.objects[id];
      if (object === undefined || object.emblem === true || object.zone !== 'command') continue;
      if (!isCommanderCardId(state, object.card)) continue;
      reductions.push(...costReductionsOf(object, printedAbilities(state, object), true));
    }
  }
  // CR 113.6b, 604.2 (D-151): "As long as this card is in your graveyard ...": the abilities of the cards in the graveyards that work there.
  for (const seat of state.seats) {
    for (const id of seat.graveyard) {
      const object = state.objects[id];
      if (object === undefined) continue;
      const modifiers = staticModifiers(printedAbilities(state, object), 'graveyard');
      if (modifiers.length > 0) {
        sources.push({ object, modifiers, context: subjectContextOf(state, object) });
      }
    }
  }
  const immediate: ModifierEntry[] = [];
  const deferred: ModifierEntry[] = [];
  const late: ModifierEntry[] = [];
  let seq = 0;
  for (const source of sources) {
    for (const mod of source.modifiers) {
      const pt = dependsOnPt(mod);
      const keywords = dependsOnKeywords(mod);
      const isLate = keywords && mod.kind === 'modifyPt';
      (isLate ? late : pt || keywords ? deferred : immediate).push({
        source,
        mod,
        pt,
        keywords,
        late: isLate,
        seq,
      });
      seq += 1;
    }
  }
  return {
    battlefield: state.battlefield,
    definitions: state.definitions,
    effects: state.continuousEffects,
    immediate: listEntries(immediate),
    deferred: listEntries(deferred),
    late: listEntries(late),
    reductions,
    hasCostIncrease,
    abilityReductions,
    flashes,
    libraryCasts,
    graveyardPlays,
    handGrants,
    spellGrants,
    flashbackGrants,
    attachments,
  };
}

function indexOf(state: GameState): BoardIndex {
  const hit = cache.get(state.objects);
  if (
    hit !== undefined &&
    hit.battlefield === state.battlefield &&
    hit.definitions === state.definitions &&
    hit.effects === state.continuousEffects
  ) {
    return hit;
  }
  const fresh = buildIndex(state);
  cache.set(state.objects, fresh);
  return fresh;
}

/** Whether an ability is a `costIncrease` or a static ability that gives one (D-149). */
function givesCostIncrease(a: Ability): boolean {
  return (
    a.kind === 'static' &&
    (a.static.kind === 'costIncrease' ||
      (a.static.kind === 'grantAbility' &&
        a.static.ability.kind === 'static' &&
        a.static.ability.static.kind === 'costIncrease'))
  );
}

/** Whether a permanent on the battlefield may have a spell tax (`costIncrease`) after the layers (D-149); read before looking at any permanent's derived abilities. */
export function hasCostIncreaseSources(state: GameState): boolean {
  return indexOf(state).hasCostIncrease;
}

/** The cost-reducing static abilities of the permanents on the battlefield (D-095). */
export function costReductionSources(state: GameState): readonly CostReductionSource[] {
  return indexOf(state).reductions;
}

/** The cost-reducing static abilities of the permanents on the battlefield that name the Equip abilities a kind of object is the target of (D-425). */
export function abilityReductionSources(state: GameState): readonly AbilityReductionSource[] {
  return indexOf(state).abilityReductions;
}

/** The permission "You may cast creature spells ... from the top of your library" of the permanents on the battlefield (D-151). */
export function libraryCastSources(state: GameState): readonly LibraryCastSource[] {
  return indexOf(state).libraryCasts;
}

/** The permission "Once during each of your turns, you may play a land or cast a spell from your graveyard" of the permanents on the battlefield (D-232). */
export function graveyardPlaySources(state: GameState): readonly GraveyardPlaySource[] {
  return indexOf(state).graveyardPlays;
}

/** The static abilities of the permanents on the battlefield that give flashback to the cards of their controller's graveyard (CR 702.34a). */
export function flashbackGrantSources(state: GameState): readonly FlashbackGrantSource[] {
  return indexOf(state).flashbackGrants;
}

/** The permission "You may cast artifact spells as though they had flash" of the permanents on the battlefield (D-139). */
export function flashPermissionSources(state: GameState): readonly FlashPermissionSource[] {
  return indexOf(state).flashes;
}

/** A static "has base power and toughness N/N" (layer 7b, D-139) with the timestamp of the permanent that has it. */
export interface StaticSet {
  readonly timestamp: number;
  readonly power: number;
  readonly toughness: number;
}

/** "Can't be blocked by Walls" (D-139): the blockers a filter names, relative to the controller of the permanent with the ability. */
export interface BlockLimit {
  readonly filter: ObjectFilter;
  readonly controller: GameObject['controller'];
  readonly source: GameObject['id'];
}

/** What the static abilities of the battlefield do to one permanent, and what is attached to it. */
export interface StaticEffects {
  /**
   * Keywords granted in layer 6 (CR 613.1f), in battlefield order, each with the timestamp of the
   * permanent whose static ability grants it (CR 613.7a), which orders it among the continuous
   * effects of layer 6.
   */
  readonly grants: readonly StaticGrant[];
  /** The sum of the "+N/+N" effects in layer 7c (CR 613.4c). */
  readonly power: number;
  readonly toughness: number;
  /** The "base power and toughness N/N" effects (layer 7b, CR 613.4b, D-139), in battlefield order. */
  readonly sets: readonly StaticSet[];
  /** The creatures this one can't be blocked by (CR 509.1b, D-139). */
  readonly blockLimits: readonly BlockLimit[];
  /**
   * The restrictions its static abilities, and those of the permanents that affect it, give it
   * (D-094; `derive` adds the ones continuous effects give). Read where the rule acts, not in a layer.
   */
  readonly restrictions: readonly Restriction[];
  /** The players that goad this permanent (issue 201, CR 701.15): the controllers of the permanents whose `goaded` static ability applies to it. */
  readonly goadedBy: readonly SeatId[];
  /** Permanents on the battlefield attached to this one. */
  readonly attachments: readonly ObjectId[];
  /** The permanent this one is attached to, when it is still on the battlefield. */
  readonly attachedTo: ObjectId | null;
}

const NONE: readonly ObjectId[] = [];

/**
 * What `staticEffectsOn` knows of the target before static abilities change its power and toughness:
 * `ptWith` gives the target's own power and toughness after its effects of resolved spells and its
 * counters, with the given sums of "+N/+N" static abilities added (layers 7a to 7c, CR 613.4).
 */
export interface StaticBase extends FilterSubject {
  /**
   * The keywords without parameters the target has after layer 6 with the given grants of static abilities applied (D-149): what
   * a static ability reads that grants a keyword to "creatures you control with flying" (CR 613.8a, 613.8b).
   */
  readonly keywordsWith: (grants: readonly StaticGrant[]) => readonly Keyword['kind'][];
  /**
   * The keywords without parameters another object has after layer 6 (D-149): what a "+N/+N for each other creature you control with
   * flying" counts (CR 613.4c reads layer 6, 613.8). Left out where no count names a keyword.
   */
  readonly keywordsOf?: (other: GameObject) => readonly Keyword['kind'][];
  /**
   * Set while only layer 6 is wanted (`keywordsAfterLayer6`): the "+N/+N" static abilities (layer 7c) are not applied, which is what
   * keeps a count of keywords from reading itself.
   */
  readonly layer6Only?: boolean;
  readonly ptWith: (
    power: number,
    toughness: number,
    sets?: readonly StaticSet[],
  ) => { readonly power: number | null; readonly toughness: number | null };
}

/** Whether a filter, or a member of its `anyOf`, reads what `test` looks for. */
function filterReads(f: ObjectFilter, test: (f: ObjectFilter) => boolean): boolean {
  return test(f) || (f.anyOf?.some((m) => filterReads(m, test)) ?? false);
}

/** Whether a static ability's subject compares power or toughness (D-111). */
function dependsOnPt(mod: Modifier): boolean {
  return (
    mod.subject.kind === 'filter' &&
    filterReads(mod.subject.filter, (f) => f.power !== undefined || f.toughness !== undefined)
  );
}

/**
 * Whether a static ability's subject names a keyword the target has or lacks (D-149, "creatures you control with flying"): it depends
 * on the effects that give keywords (CR 613.8a), so it applies after the ones that do not.
 */
function dependsOnKeywords(mod: Modifier): boolean {
  return (
    mod.subject.kind === 'filter' &&
    filterReads(mod.subject.filter, (f) => f.keywords !== undefined || f.notKeywords !== undefined)
  );
}

/**
 * Conditions are read many times while one state is looked at (once for each permanent derived, for each conditional
 * ability): the answers are kept for that state. A state is never changed in place, so they cannot go stale.
 */
const conditionAnswers = new WeakMap<object, Map<string, boolean>>();

function conditionHolds(
  state: GameState,
  condition: Condition,
  conditionKey: string,
  source: GameObject,
): boolean {
  let answers = conditionAnswers.get(state);
  if (answers === undefined) {
    answers = new Map();
    conditionAnswers.set(state, answers);
  }
  const key = `${source.id}#${conditionKey}`;
  const known = answers.get(key);
  if (known !== undefined) return known;
  const holds = staticConditionHolds(state, condition, source);
  answers.set(key, holds);
  return holds;
}

/** What the static abilities do to an object that is not a permanent: nothing but the keywords given to a card in a hand (`handGrantsOn`). */
function otherZoneEffects(grants: readonly StaticGrant[]): StaticEffects {
  return {
    grants,
    power: 0,
    toughness: 0,
    sets: [],
    blockLimits: [],
    restrictions: [],
    goadedBy: [],
    attachments: NONE,
    attachedTo: null,
  };
}

/**
 * The keywords the static abilities of the permanents on the battlefield give to `target`, a card in a hand (issue 104, `grantKeywordToHandCards`, CR 702.29a, 613.1f): "Each creature
 * card in your hand has cycling {1}{U}." The hand is the one of the permanent's controller, and `what` is read against the card as it is after layers 4 and 5 (`base`).
 */
function handGrantsOn(state: GameState, target: GameObject, base: StaticBase): StaticGrant[] {
  const grants: StaticGrant[] = [];
  for (const source of indexOf(state).handGrants) {
    if (target.owner !== controllerOf(state, source.object)) continue;
    if (
      source.condition !== undefined &&
      !conditionHolds(state, source.condition, source.conditionKey ?? '', source.object)
    ) {
      continue;
    }
    const filter: ObjectFilter = { ...source.what, zone: 'hand' };
    if (
      !matchesFilterWith(state, target, () => base, filter, subjectContextOf(state, source.object))
    ) {
      continue;
    }
    grants.push({
      ability: { kind: 'keyword', keyword: source.keyword },
      timestamp: source.object.timestamp,
    });
  }
  return grants;
}

/**
 * The keywords the static abilities of the permanents on the battlefield give to `target`, a spell on the stack (issue 145, `grantKeywordToSpells`, CR 702.144a, 702.51a, 613.1f):
 * "Creature spells you cast have demonstrate." The spell is the one its controller cast, so `what` is read with the permanent's controller as "you" against the spell as it is after
 * layers 4 and 5 (`base`). A copy of a spell is not cast (CR 707.10) and an ability on the stack is no spell: neither gets a keyword. The object may be the card as it is cast
 * (`castAs`, no stack data yet), which is how the cost of a spell and the question whether it can be paid see a granted Convoke.
 */
function spellGrantsOn(state: GameState, target: GameObject, base: StaticBase): StaticGrant[] {
  const sources = indexOf(state).spellGrants;
  if (sources.length === 0) return [];
  if (target.copyOf !== undefined || (target.stack !== null && target.stack.kind !== 'spell')) {
    return [];
  }
  const grants: StaticGrant[] = [];
  for (const source of sources) {
    if (
      source.condition !== undefined &&
      !conditionHolds(state, source.condition, source.conditionKey ?? '', source.object)
    ) {
      continue;
    }
    const filter: ObjectFilter = { ...source.what, zone: 'stack' };
    // "You" is the permanent's controller, read against the controller of the spell.
    if (
      !matchesFilterWith(state, target, () => base, filter, subjectContextOf(state, source.object))
    ) {
      continue;
    }
    grants.push({
      ability: { kind: 'keyword', keyword: source.keyword },
      timestamp: source.object.timestamp,
    });
  }
  return grants;
}

/**
 * The static effects on `target`, whose characteristics after layers 4 and 5 are `base`. Only a permanent
 * on the battlefield is affected (CR 611.3b: a static ability of a permanent works there); for any
 * other object the result is empty, but for the keywords a permanent gives to the cards of its controller's hand
 * (issue 104, CR 702.29a).
 */
export function staticEffectsOn(
  state: GameState,
  target: GameObject,
  base: StaticBase,
): StaticEffects {
  if (target.zone === 'hand') return otherZoneEffects(handGrantsOn(state, target, base));
  if (target.zone === 'stack') return otherZoneEffects(spellGrantsOn(state, target, base));
  if (target.zone !== 'battlefield') return otherZoneEffects([]);
  const index = indexOf(state);
  const grants: StaticGrant[] = [];
  let power = 0;
  let toughness = 0;
  const restrictions: Restriction[] = [];
  const goadedBy: SeatId[] = [];
  const sets: StaticSet[] = [];
  const blockLimits: BlockLimit[] = [];
  const apply = (source: ModifierSource, mod: Modifier, view: FilterSubject): boolean => {
    if (!subjectAffects(state, source.object, mod.subject, target, view, source.context))
      return false;
    // D-133: "as long as ...": the permanent's condition, read as the effects are looked at (CR 611.3a, 613.8).
    if (
      mod.condition !== undefined &&
      !conditionHolds(state, mod.condition, mod.conditionKey ?? '', source.object)
    ) {
      return false;
    }
    if (mod.kind === 'grantKeyword') {
      let keyword: Keyword = mod.keyword;
      if (keyword.kind === 'protection' && keyword.from === 'colorsNotInCommanderIdentity') {
        // CR 903.4, 903.4f (D-259): "your" is the controller of the ability that gives it; no commander, or a commander of every color: nothing to give.
        const colors = colorsNotInCommanderIdentity(state, controllerOf(state, source.object));
        if (colors.length === 0) return true;
        keyword = { kind: 'protection', from: 'color', colors };
      } else if (keyword.kind === 'protection' && keyword.from === 'chosenColor') {
        // CR 702.16a, 607.2d (D-652): "the chosen color" is the choice of the permanent that gives the keyword; it chose none: nothing to give.
        const chosen = source.object.chosen?.color;
        if (chosen === undefined) return true;
        keyword = {
          kind: 'protection',
          from: 'color',
          colors: [chosen],
          ...(keyword.exceptSource === true ? { exceptSource: source.object.id } : {}),
        };
      } else if (keyword.kind === 'protection' && keyword.from === 'chosenCardType') {
        // CR 702.16a, 607.2d (D-376): "the chosen card type" is the choice of the permanent that gives the keyword; it chose none: nothing to give.
        const chosen = source.object.chosen?.cardType;
        if (chosen === undefined) return true;
        keyword = { kind: 'protection', from: 'cardType', types: [chosen] };
      }
      grants.push({
        ability: { kind: 'keyword', keyword },
        timestamp: source.object.timestamp,
      });
    } else if (mod.kind === 'loseAllAbilities') {
      // CR 613.1f (D-145): "Enchanted creature loses all abilities", layer 6, with the Aura's timestamp.
      grants.push({ ability: null, timestamp: source.object.timestamp });
    } else if (mod.kind === 'grantAbility') {
      // D-099: a mana ability given to the subject, in layer 6 like a keyword.
      grants.push({ ability: mod.ability, timestamp: source.object.timestamp });
    } else if (mod.kind === 'restriction') {
      // CR 613.11: a rules-modifying effect, read where the rule acts (no layer, no timestamp).
      if (!restrictions.includes(mod.restriction)) restrictions.push(mod.restriction);
    } else if (mod.kind === 'goaded') {
      // CR 701.15a (issue 201): goaded by the controller of the permanent with the ability: it attacks each combat if able and attacks a player other than them if able.
      if (!restrictions.includes('attacksEachCombat')) restrictions.push('attacksEachCombat');
      const goader = controllerOf(state, source.object);
      if (!goadedBy.includes(goader)) goadedBy.push(goader);
    } else if (mod.kind === 'setPt') {
      // CR 613.4b (D-139): "base power and toughness 5/3", layer 7b, with the permanent's timestamp.
      sets.push({ timestamp: source.object.timestamp, power: mod.power, toughness: mod.toughness });
    } else if (mod.kind === 'cantBeBlockedBy') {
      // CR 509.1b (D-139): read where blockers are declared, not in a layer.
      blockLimits.push({
        filter: mod.blockers,
        controller: controllerOf(state, source.object),
        source: source.object.id,
      });
    } else if (mod.kind === 'grantActivatedAbilitiesOfTopCard') {
      // CR 613.1f, 401.5 (issue 144): the activated and mana abilities of the top card of the controller's library, while it matches the filter, given in layer 6 with the
      // permanent's timestamp (read from the card as printed: it is in a library, so no layer but a copy effect changes it).
      const card = topCardOf(state, source.object, mod.card);
      if (card !== null) {
        for (const ability of printedAbilities(state, card)) {
          if (ability.kind === 'activated' || ability.kind === 'mana') {
            grants.push({ ability, timestamp: source.object.timestamp });
          }
        }
      }
    } else if (mod.kind === 'takeFromLinkedExile') {
      // CR 607.2a, 613.4b (D-139): the power and toughness of the last card exiled with it that the filter names (its types are
      // layer 4: `derive-group-types.ts`), a characteristic-defining '*' read as that card has it in exile.
      const card = linkedCardOf(state, source.object, mod.from);
      if (card !== null) {
        const printed = printedAbilities(state, card);
        const defined = characteristicPtOf(state, card, printed);
        const c = copiableValues(state, card).characteristics;
        const number = (value: number | '*' | null, own: number | null | undefined) =>
          value === '*' ? (own ?? 0) : (value ?? 0);
        sets.push({
          timestamp: source.object.timestamp,
          power: number(c.power, defined?.power),
          toughness: number(c.toughness, defined?.toughness),
        });
      }
    } else if (base.layer6Only === true) {
      // D-149: only layer 6 is wanted: no layer 7c effect is applied (see `StaticBase.layer6Only`).
      return true;
    } else {
      // CR 613.4c: sublayer 7c holds only additions, which commute, so the timestamp order that
      // CR 613.7 gives (an Aura's or Equipment's own timestamp) does not change the sum. A counted amount
      // is worked out now, from the board as it is (CR 611.3a, D-115).
      power += staticAmountOf(state, mod.power, source.object, target, base.keywordsOf);
      toughness += staticAmountOf(state, mod.toughness, source.object, target, base.keywordsOf);
    }
    return true;
  };
  // D-111, CR 613.8a: an effect whose subject compares power or toughness depends on the effects that
  // change them, so it applies after the ones that do not; among themselves they go in battlefield order
  // (timestamp order, CR 613.8b), each reading the target's power with what the ones before it added.
  // D-149 (CR 613.8a): the same for a subject that names a keyword ("creatures you control with flying"): it reads the keywords the
  // target has with what the effects before it granted. Effects that depend on one another are not put in dependency order: the
  // ones that did not apply are looked at again after the others, until none more applies, so a grant of flying that comes later on
  // the battlefield still reaches an effect that reads flying (a loop of dependencies, CR 613.8b, is not told apart; docs/ROADMAP.md).
  for (const { source, mod } of entriesFor(index.immediate, target.id)) apply(source, mod, base);
  let waiting = entriesFor(index.deferred, target.id);
  for (let progress = true; progress && waiting.length > 0; ) {
    const unapplied: ModifierEntry[] = [];
    for (const entry of waiting) {
      const { source, mod, pt, keywords } = entry;
      const applied = apply(source, mod, {
        ...base,
        ...(pt ? base.ptWith(power, toughness, sets) : {}),
        ...(keywords ? { keywords: base.keywordsWith(grants) } : {}),
      });
      if (!applied) unapplied.push(entry);
    }
    progress = unapplied.length < waiting.length;
    waiting = unapplied;
  }
  // D-149 (CR 613.1f, 613.4c): a "+N/+N" whose subject names a keyword applies once layer 6 is done: it reads the keywords the target
  // has then, whatever the order on the battlefield. Layer 7c effects commute (CR 613.4c), so the order among them does not matter.
  if (base.layer6Only !== true) {
    const keywordsNow = base.keywordsWith(grants);
    for (const { source, mod, pt } of entriesFor(index.late, target.id)) {
      apply(source, mod, {
        ...base,
        ...(pt ? base.ptWith(power, toughness, sets) : {}),
        keywords: keywordsNow,
      });
    }
  }
  const host = target.attachedTo === null ? undefined : state.objects[target.attachedTo];
  return {
    grants,
    power,
    toughness,
    sets,
    blockLimits,
    restrictions,
    goadedBy,
    attachments: index.attachments.get(target.id) ?? NONE,
    attachedTo: host?.zone === 'battlefield' ? host.id : null,
  };
}
