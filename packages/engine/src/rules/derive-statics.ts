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
import type { ObjectId } from '../ids';
import type { GameObject, GameState } from '../state/types';
import { colorsNotInCommanderIdentity } from './commander-colors';
import { controllerOf } from './control';
import { copiableValues } from './copiable';
import { characteristicPtOf, staticAmountOf } from './derive-count';
import { linkedCardOf } from './derive-group-types';
import type { StaticGrant } from './derive-layers';
import { emblemsOf } from './emblem';
import type { FilterContext, FilterSubject } from './filter-match';
import { hasLostAbilities } from './lost-abilities';
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
      | 'setPt'
      | 'cantBeBlockedBy'
      | 'takeFromLinkedExile'
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
        : subject.kind === 'attached'
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
  readonly targeting: ObjectFilter;
  readonly amount: Amount;
}

/**
 * A static ability of a permanent that lets its controller cast the spells `spells` names as though they had flash (`castAsThoughFlash`,
 * D-139): read by `rules/legality.ts`, not by `derive`. A permanent that lost all its abilities has none (CR 613.1f).
 */
export interface FlashPermissionSource {
  readonly object: GameObject;
  readonly spells: ObjectFilter;
}

/**
 * A static ability of a permanent that lets its controller cast spells from the top of their library (`castFromTopOfLibrary`, D-151): read by
 * `rules/legality.ts`, not by `derive`. A permanent that lost all its abilities has none (CR 613.1f).
 */
export interface LibraryCastSource {
  readonly object: GameObject;
  readonly spells: ObjectFilter;
  readonly gainsHaste: boolean;
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
}

interface BoardIndex {
  readonly battlefield: readonly ObjectId[];
  readonly definitions: GameState['definitions'];
  readonly effects: GameState['continuousEffects'];
  /** The static abilities of `sources` that do not depend on others, in battlefield order (the order they are applied in). */
  readonly immediate: EntryLists;
  /** The static abilities that depend on power, toughness or keywords, in battlefield order (applied after `immediate`). */
  readonly deferred: EntryLists;
  /** Permanents with a `costReduction` static ability that names spells by a filter, in battlefield order. */
  readonly reductions: readonly CostReductionSource[];
  /** Permanents with an `abilityCostReduction` static ability, in battlefield order (D-425). */
  readonly abilityReductions: readonly AbilityReductionSource[];
  /** Permanents with a `castAsThoughFlash` static ability, in battlefield order (D-139). */
  readonly flashes: readonly FlashPermissionSource[];
  /** Permanents with a `castFromTopOfLibrary` static ability, in battlefield order (D-151). */
  readonly libraryCasts: readonly LibraryCastSource[];
  /** Permanents with a `playFromGraveyardOnceEachTurn` static ability, in battlefield order (D-232). */
  readonly graveyardPlays: readonly GraveyardPlaySource[];
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
      a.static.kind === 'setPt' ||
      a.static.kind === 'cantBeBlockedBy' ||
      a.static.kind === 'takeFromLinkedExile' ||
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
): CostReductionSource[] {
  const out: CostReductionSource[] = [];
  for (const a of abilities) {
    if (a.kind !== 'static' || a.static.kind !== 'costReduction') continue;
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
      out.push({ object, targeting: a.static.targeting, amount: a.static.amount });
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
      out.push({ object, spells: a.static.spells });
    }
  }
  return out;
}

function libraryCastsOf(object: GameObject, abilities: readonly Ability[]): LibraryCastSource[] {
  const out: LibraryCastSource[] = [];
  for (const a of abilities) {
    if (a.kind === 'static' && a.static.kind === 'castFromTopOfLibrary') {
      out.push({ object, spells: a.static.spells, gainsHaste: a.static.gainsHaste === true });
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
  }
  return out;
}

function buildIndex(state: GameState): BoardIndex {
  const sources: ModifierSource[] = [];
  const reductions: CostReductionSource[] = [];
  const abilityReductions: AbilityReductionSource[] = [];
  const flashes: FlashPermissionSource[] = [];
  const libraryCasts: LibraryCastSource[] = [];
  const graveyardPlays: GraveyardPlaySource[] = [];
  const attachments = new Map<ObjectId, ObjectId[]>();
  for (const id of state.battlefield) {
    const object = state.objects[id];
    if (object === undefined) continue;
    // CR 613.1f: a permanent that lost all abilities has no static ability left to apply.
    const printed = hasLostAbilities(state, id) ? [] : printedAbilities(state, object);
    const modifiers = staticModifiers(printed);
    if (modifiers.length > 0)
      sources.push({ object, modifiers, context: subjectContextOf(state, object) });
    reductions.push(...costReductionsOf(object, printed));
    abilityReductions.push(...abilityReductionsOf(object, printed));
    flashes.push(...flashesOf(object, printed));
    libraryCasts.push(...libraryCastsOf(object, printed));
    graveyardPlays.push(...graveyardPlaysOf(object, printed));
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
  let seq = 0;
  for (const source of sources) {
    for (const mod of source.modifiers) {
      const pt = dependsOnPt(mod);
      const keywords = dependsOnKeywords(mod);
      (pt || keywords ? deferred : immediate).push({ source, mod, pt, keywords, seq });
      seq += 1;
    }
  }
  return {
    battlefield: state.battlefield,
    definitions: state.definitions,
    effects: state.continuousEffects,
    immediate: listEntries(immediate),
    deferred: listEntries(deferred),
    reductions,
    abilityReductions,
    flashes,
    libraryCasts,
    graveyardPlays,
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

/**
 * The static effects on `target`, whose characteristics after layers 4 and 5 are `base`. Only a permanent
 * on the battlefield is affected (CR 611.3b: a static ability of a permanent works there); for any
 * other object the result is empty.
 */
export function staticEffectsOn(
  state: GameState,
  target: GameObject,
  base: StaticBase,
): StaticEffects {
  if (target.zone !== 'battlefield') {
    return {
      grants: [],
      power: 0,
      toughness: 0,
      sets: [],
      blockLimits: [],
      restrictions: [],
      attachments: NONE,
      attachedTo: null,
    };
  }
  const index = indexOf(state);
  const grants: StaticGrant[] = [];
  let power = 0;
  let toughness = 0;
  const restrictions: Restriction[] = [];
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
    } else {
      // CR 613.4c: sublayer 7c holds only additions, which commute, so the timestamp order that
      // CR 613.7 gives (an Aura's or Equipment's own timestamp) does not change the sum. A counted amount
      // is worked out now, from the board as it is (CR 611.3a, D-115).
      power += staticAmountOf(state, mod.power, source.object, target);
      toughness += staticAmountOf(state, mod.toughness, source.object, target);
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
  const host = target.attachedTo === null ? undefined : state.objects[target.attachedTo];
  return {
    grants,
    power,
    toughness,
    sets,
    blockLimits,
    restrictions,
    attachments: index.attachments.get(target.id) ?? NONE,
    attachedTo: host?.zone === 'battlefield' ? host.id : null,
  };
}
