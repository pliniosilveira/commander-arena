/**
 * Ability lowerings: keyword lines, enters replacements and spell text (activated and mana
 * abilities are in activated.ts). Each declares the engine features it needs (`needs`) and is
 * checked against SUPPORTED_FEATURES before anything is built, so an ability the engine cannot run
 * is reported with what is missing.
 */
import type { Ability, Color, Cost, Keyword, ObjectFilter } from '@commander-arena/engine';
import type { IrAbility, IrCost, IrKeyword } from '../ir/types';
import {
  isGrantable,
  keywordKind,
  landwalkOf,
  plainKeyword,
  typecyclingFilter,
} from '../rules/keyword/vocabulary';
import { lowerAmount } from './amounts';
import { lowerEnchant } from './attachments';
import { lowerCondition } from './conditions';
import { lowerCost } from './costs';
import { lowerClause } from './effects';
import { type FeatureRef, missingFeatures } from './features';
import { lowerModes } from './modal';
import { colorLetter, lowerFilter } from './nouns';
import { lowerSentences } from './sentences';
import {
  type LowerContext,
  type LowerFailure,
  type LowerResult,
  newContext,
  type SpellParts,
} from './types';

type At = { readonly span: { start: number; end: number }; readonly rule: string };

function failure(node: At, needs: readonly FeatureRef[] = []): LowerFailure {
  return { ok: false, needs, at: node.span, rule: node.rule };
}

/** Fails at `node` naming the missing features, or null when the engine runs all of them. */
function gate(node: At, needs: readonly FeatureRef[]): LowerFailure | null {
  const missing = missingFeatures(needs);
  return missing.length > 0 ? failure(node, missing) : null;
}

// ---------------------------------------------------------------- keywords

/** The id of the rule that reads each costed keyword (Cumulative upkeep's id is hyphenated). */
const KEYWORD_RULE = {
  cycling: 'keyword.cycling',
  equip: 'keyword.equip',
  kicker: 'keyword.kicker',
  multikicker: 'keyword.multikicker',
  flashback: 'keyword.flashback',
  unearth: 'keyword.unearth',
  encore: 'keyword.encore',
  echo: 'keyword.echo',
  cumulativeUpkeep: 'keyword.cumulative-upkeep',
  ward: 'keyword.ward',
  replicate: 'keyword.replicate',
  escalate: 'keyword.escalate',
} as const;

type CostedKeyword =
  | 'cycling'
  | 'equip'
  | 'kicker'
  | 'multikicker'
  | 'flashback'
  | 'unearth'
  | 'encore'
  | 'echo'
  | 'cumulativeUpkeep'
  | 'ward'
  | 'replicate'
  | 'escalate';

/**
 * "Cycling {2}" (CR 702.29a), "Equip {1}" (CR 702.6a), "Kicker {2}" (CR 702.33a), "Multikicker {2}"
 * (CR 702.33c), "Flashback {2}{B}" (CR 702.34a) and "Unearth {R}" (CR 702.84a, stage P23): the keyword
 * carries its cost, and the engine expands or runs it (Cycling works from the hand, Equip attaches at sorcery
 * speed, Kicker is asked as the spell is cast and Multikicker asks how many times, Flashback casts from the
 * graveyard, Unearth works from the graveyard), "Echo {3}{W}{W}" (CR 702.30a) and "Cumulative upkeep {1}"
 * (CR 702.24a), stage P25 (D-127: the engine expands each into the triggered ability of the upkeep). The
 * engine pays mana or life for Cycling, Equip and Kicker, mana for Multikicker (the only cost the grammar
 * reads for it) and only mana for Flashback, Unearth, Echo and Cumulative upkeep (the grammar reads no
 * other cost for the last two, though the engine could pay life or a discard for Cumulative upkeep); any
 * other cost, and a list of costs, is not lowered.
 */
/** The equip cost that is a mana cost and a payment of life: the engine pays both as the ability is activated (CR 602.2b, 118.1). */
function lowerEquipCosts(
  ability: IrKeyword,
  written: readonly IrCost[],
): LowerResult<readonly Ability[]> {
  const kinds = written.map((c) => c.kind);
  if (kinds.length !== 2 || !kinds.includes('mana') || !kinds.includes('payLife')) {
    return failure(ability);
  }
  const costs: Cost[] = [];
  for (const item of written) {
    const lowered = lowerCost(item);
    if (!lowered.ok) return lowered;
    costs.push(lowered.value);
  }
  const blocked = gate(ability, [
    'ability:keyword',
    'keyword:equip',
    ...costs.map((c) => `cost:${c.kind}` as FeatureRef),
  ]);
  if (blocked !== null) return blocked;
  return {
    ok: true,
    value: [{ kind: 'keyword', keyword: { kind: 'equip', cost: costs } }],
    rule: KEYWORD_RULE.equip,
  };
}

function lowerCostedKeyword(
  ability: IrKeyword,
  name: CostedKeyword,
): LowerResult<readonly Ability[]> {
  const [only, ...more] = ability.cost ?? [];
  // "Equip—{2}, Pay 2 life." (stage P35, D-176, CR 702.6a): a mana cost and a payment of life, each once.
  if (name === 'equip' && only !== undefined && more.length === 1 && ability.params.length === 0) {
    return lowerEquipCosts(ability, [only, ...more]);
  }
  if (only === undefined || more.length > 0 || ability.params.length > 0) return failure(ability);
  // A cost the engine does not pay for this keyword is refused at the keyword, whatever else it is.
  // Ward's cost is paid as its ability resolves (CR 702.21a); a sacrifice is read and the engine's
  // own check says it does not pay one, a discard is paid since D-095.
  const kinds =
    name === 'flashback' ||
    name === 'multikicker' ||
    name === 'unearth' ||
    name === 'encore' ||
    name === 'echo' ||
    name === 'cumulativeUpkeep' ||
    name === 'replicate' ||
    name === 'escalate'
      ? ['mana']
      : name === 'ward'
        ? ['mana', 'payLife', 'sacrifice', 'discard']
        : ['mana', 'payLife'];
  if (!kinds.includes(only.kind)) return failure(ability);
  const cost = lowerCost(only);
  if (!cost.ok) return cost;
  const blocked = gate(ability, [
    'ability:keyword',
    `keyword:${name}`,
    `cost:${cost.value.kind}` as FeatureRef,
  ]);
  if (blocked !== null) return blocked;
  // "Equip Wizard {1}" (stage P67, D-220, CR 702.6c): the creature type the equip ability attaches to.
  if ((ability.quality !== undefined || ability.commanderOnly === true) && name !== 'equip') {
    return failure(ability);
  }
  return {
    ok: true,
    value: [
      {
        kind: 'keyword',
        keyword: {
          kind: name,
          cost: [cost.value],
          ...(ability.quality === undefined
            ? {}
            : { restriction: { subtypes: [ability.quality] } }),
          // "Equip commander {3}" (stage P70, D-259, CR 702.6c, 903.3): a creature that is a commander.
          ...(ability.commanderOnly === true ? { restriction: { commander: true } } : {}),
        } as Keyword,
      },
    ],
    rule: KEYWORD_RULE[name],
  };
}

/**
 * "Suspend 2—{1}{B}" (CR 702.62a, stage P26, D-128): the keyword with its number of time counters and its cost.
 * The engine runs the special action and the two abilities from it. Plain mana without {X} (the only cost
 * `validateCard` accepts for it) and a positive whole number; whether the face can have it (not a land, one
 * per face) is `validateCard`'s refusal.
 */
function lowerSuspend(ability: IrKeyword): LowerResult<readonly Ability[]> {
  const [count, ...rest] = ability.params;
  const [only, ...more] = ability.cost ?? [];
  if (count?.kind !== 'number' || rest.length > 0) return failure(ability);
  if (!Number.isSafeInteger(count.value) || count.value < 1) return failure(ability);
  if (only?.kind !== 'mana' || more.length > 0) return failure(ability);
  const cost = lowerCost(only);
  if (!cost.ok) return cost;
  const blocked = gate(ability, [
    'ability:keyword',
    'keyword:suspend',
    'keyword:storm',
    'keyword:replicate',
    `cost:${cost.value.kind}` as FeatureRef,
  ]);
  if (blocked !== null) return blocked;
  return {
    ok: true,
    value: [
      { kind: 'keyword', keyword: { kind: 'suspend', count: count.value, cost: [cost.value] } },
    ],
    rule: 'keyword.suspend',
  };
}

/**
 * "Storm" (CR 702.40a, stage P27, D-129): the keyword with no data; the engine expands it into the trigger of the
 * spell that copies it for each spell cast before it this turn. Whether the face can have it is `validateCard`'s
 * business.
 */
function lowerStorm(ability: IrKeyword): LowerResult<readonly Ability[]> {
  if (ability.params.length > 0 || (ability.cost ?? []).length > 0) return failure(ability);
  const blocked = gate(ability, ['ability:keyword', 'keyword:storm']);
  if (blocked !== null) return blocked;
  return {
    ok: true,
    value: [{ kind: 'keyword', keyword: { kind: 'storm' } }],
    rule: 'keyword.storm',
  };
}

/**
 * "Gift a card" (CR 702.174, stage P30, D-135): the keyword with what is given. The engine asks the question as the spell is cast and
 * writes the two abilities the keyword stands for (the card the chosen opponent draws, as the permanent enters or before an instant's
 * or a sorcery's other effects); whether the face can have it (one, not on a land, not on a modal spell) is `validateCard`'s refusal.
 */
function lowerGift(ability: IrKeyword): LowerResult<readonly Ability[]> {
  if (ability.params.length > 0 || (ability.cost ?? []).length > 0) return failure(ability);
  const blocked = gate(ability, ['ability:keyword', 'keyword:gift']);
  if (blocked !== null) return blocked;
  return {
    ok: true,
    value: [{ kind: 'keyword', keyword: { kind: 'gift', gift: 'card' } }],
    rule: 'keyword.gift',
  };
}

/**
 * "Living weapon" (CR 702.92a, stage P31, D-140): the engine writes the triggered ability the keyword stands for (the Germ token and the
 * attach). Only an Equipment has it (CR 702.92a: "this Equipment"); on any other face it is read and not run.
 */
function lowerLivingWeapon(ability: IrKeyword, ctx: LowerContext): LowerResult<readonly Ability[]> {
  if (ability.params.length > 0 || (ability.cost ?? []).length > 0) return failure(ability);
  if (!ctx.faceSubtypes.includes('Equipment')) return failure(ability);
  // Job select (CR 702.182a, stage P49, D-206) has the same shape: a token, then the Equipment attached to it.
  const job = ability.name === 'jobSelect';
  const blocked = gate(ability, [
    'ability:keyword',
    job ? 'keyword:jobSelect' : 'keyword:livingWeapon',
  ]);
  if (blocked !== null) return blocked;
  return {
    ok: true,
    value: [{ kind: 'keyword', keyword: { kind: job ? 'jobSelect' : 'livingWeapon' } }],
    rule: job ? 'keyword.job-select' : 'keyword.living-weapon',
  };
}

/**
 * "~ can be your commander." (stage P47, D-200, CR 903.3, 113.6n): a deck-construction ability with no effect in the game, as Partner.
 * The engine's `canBeCommander`; it is read on any face and says nothing about whether the card is a legal commander (`packages/cards` decides).
 */
function lowerCanBeCommander(ability: IrKeyword): LowerResult<readonly Ability[]> {
  if (ability.params.length > 0 || (ability.cost ?? []).length > 0) return failure(ability);
  const blocked = gate(ability, ['ability:keyword', 'keyword:canBeCommander']);
  if (blocked !== null) return blocked;
  return {
    ok: true,
    value: [{ kind: 'keyword', keyword: { kind: 'canBeCommander' } }],
    rule: 'keyword.can-be-commander',
  };
}

/**
 * "Crew 3" (CR 702.122a): the keyword with its number; the engine expands it into the activated
 * ability. Only a Vehicle has it (CR 301.7), so another face is read and refused with no gap named.
 */
function lowerCrew(ability: IrKeyword, ctx: LowerContext): LowerResult<readonly Ability[]> {
  const [power, ...more] = ability.params;
  if (power?.kind !== 'number' || more.length > 0 || !Number.isSafeInteger(power.value)) {
    return failure(ability);
  }
  if (power.value < 1 || !ctx.faceSubtypes.includes('Vehicle')) return failure(ability);
  const blocked = gate(ability, ['ability:keyword', 'keyword:crew']);
  if (blocked !== null) return blocked;
  return {
    ok: true,
    value: [{ kind: 'keyword', keyword: { kind: 'crew', power: power.value } }],
    rule: 'keyword.crew',
  };
}

/**
 * "Toxic 1" (CR 702.164a), "Annihilator 2" (CR 702.86a), "Bushido 1" (CR 702.45a) and "Devour 2" (CR 702.82a, D-186): the keyword with its
 * number, a positive whole number. The engine reads Toxic where combat damage is dealt and expands
 * Annihilator and Bushido into their triggered abilities, so the lowering only builds the keyword.
 */
function lowerNumbered(
  ability: IrKeyword,
  kind: 'toxic' | 'annihilator' | 'bushido' | 'hideaway' | 'devour' | 'backup',
): LowerResult<readonly Ability[]> {
  const [count, ...more] = ability.params;
  if (count?.kind !== 'number' || more.length > 0 || ability.cost !== undefined) {
    return failure(ability);
  }
  if (!Number.isSafeInteger(count.value) || count.value < 1) return failure(ability);
  const blocked = gate(ability, ['ability:keyword', `keyword:${kind}`]);
  if (blocked !== null) return blocked;
  return {
    ok: true,
    value: [{ kind: 'keyword', keyword: { kind, count: count.value } }],
    rule: 'keyword.line',
  };
}

/**
 * "Affinity for artifacts" (CR 702.41a, stage P21): the keyword with the filter of what it counts. The
 * engine counts the permanents the caster controls on the battlefield (`affinity` is a static cost
 * reduction of the spell itself), so the filter names card types and subtypes and nothing else: the
 * grammar already refuses a controller, a color or a quality, and this lowering refuses what the
 * engine's `validateCard` would (an empty filter).
 */
function lowerAffinity(ability: IrKeyword): LowerResult<readonly Ability[]> {
  const [what, ...more] = ability.params;
  if (what?.kind !== 'noun' || more.length > 0 || ability.cost !== undefined) {
    return failure(ability);
  }
  const { zone: _zone, ...rest } = what.filter;
  void _zone;
  const filter = lowerFilter({ ...what, filter: rest });
  if (!filter.ok) return filter;
  if (Object.keys(filter.value).length === 0) return failure(ability);
  const blocked = gate(ability, ['ability:keyword', 'keyword:affinity']);
  if (blocked !== null) return blocked;
  return {
    ok: true,
    value: [{ kind: 'keyword', keyword: { kind: 'affinity', filter: filter.value } }],
    rule: 'keyword.line',
  };
}

/**
 * "Basic landcycling {1}", "Islandcycling {2}" (CR 702.29e): the keyword with the filter of the
 * search and the cost of the ability without the discard; the engine expands it into an activated
 * ability that works from the hand (CR 702.29f). Only a plain mana cost, the one the grammar reads.
 */
function lowerTypecycling(
  ability: IrKeyword,
  filter: ObjectFilter,
): LowerResult<readonly Ability[]> {
  const [only, ...more] = ability.cost ?? [];
  if (only?.kind !== 'mana' || more.length > 0 || ability.params.length > 0) {
    return failure(ability);
  }
  const cost = lowerCost(only);
  if (!cost.ok) return cost;
  const blocked = gate(ability, [
    'ability:keyword',
    'keyword:typecycling',
    `cost:${cost.value.kind}` as FeatureRef,
  ]);
  if (blocked !== null) return blocked;
  return {
    ok: true,
    value: [{ kind: 'keyword', keyword: { kind: 'typecycling', filter, cost: [cost.value] } }],
    rule: 'keyword.typecycling',
  };
}

/** "Protection from black" (CR 702.16, stage P68, D-229): the colors it names; the engine reads damage, enchanting, blocking and targeting. */
function lowerProtection(ability: IrKeyword): LowerResult<readonly Ability[]> {
  const words = ability.colors ?? [];
  const colors = words.map((w) => colorLetter(w));
  if (colors.length === 0 || colors.some((c) => c === undefined) || ability.params.length > 0) {
    return failure(ability);
  }
  const blocked = gate(ability, ['ability:keyword', 'keyword:protection']);
  if (blocked !== null) return blocked;
  return {
    ok: true,
    value: [
      {
        kind: 'keyword',
        keyword: { kind: 'protection', from: 'color', colors: colors as Color[] },
      },
    ],
    rule: 'keyword.line',
  };
}

/** `keyword.line`: one keyword ability per keyword (CR 702); `keyword.cycling` has its own. */
export function lowerKeyword(
  ability: IrKeyword,
  ctx: LowerContext,
): LowerResult<readonly Ability[]> {
  if (
    ability.name === 'cycling' ||
    ability.name === 'equip' ||
    ability.name === 'kicker' ||
    ability.name === 'multikicker' ||
    ability.name === 'flashback' ||
    ability.name === 'unearth' ||
    ability.name === 'encore' ||
    ability.name === 'echo' ||
    ability.name === 'cumulativeUpkeep' ||
    ability.name === 'replicate' ||
    ability.name === 'escalate' ||
    ability.name === 'ward'
  ) {
    return lowerCostedKeyword(ability, ability.name);
  }
  if (ability.name === 'suspend') return lowerSuspend(ability);
  if (ability.name === 'storm') return lowerStorm(ability);
  if (ability.name === 'gift') return lowerGift(ability);
  if (ability.name === 'livingWeapon' || ability.name === 'jobSelect') {
    return lowerLivingWeapon(ability, ctx);
  }
  if (ability.name === 'canBeCommander') return lowerCanBeCommander(ability);
  if (ability.name === 'crew') return lowerCrew(ability, ctx);
  if (ability.name === 'enchant') return lowerEnchant(ability);
  if (
    ability.name === 'toxic' ||
    ability.name === 'annihilator' ||
    ability.name === 'bushido' ||
    ability.name === 'hideaway' ||
    ability.name === 'devour' ||
    ability.name === 'backup'
  ) {
    return lowerNumbered(ability, ability.name);
  }
  if (ability.name === 'affinity') return lowerAffinity(ability);
  if (ability.name === 'protection') return lowerProtection(ability);
  const typeSearch = typecyclingFilter(ability.name);
  if (typeSearch !== undefined) return lowerTypecycling(ability, typeSearch);
  const landType = landwalkOf(ability.name);
  if (landType !== undefined && ability.params.length === 0) {
    // CR 702.14a (Landwalk): one keyword with the land type, or "nonbasic" (CR 702.14c).
    const blocked = gate(ability, ['ability:keyword', 'keyword:landwalk']);
    if (blocked !== null) return blocked;
    return {
      ok: true,
      value: [{ kind: 'keyword', keyword: { kind: 'landwalk', landType } }],
      rule: 'keyword.line',
    };
  }
  const kind = keywordKind(ability.name);
  if (kind === undefined || ability.params.length > 0) return failure(ability);
  const blocked = gate(ability, ['ability:keyword', `keyword:${kind}`]);
  if (blocked !== null) return blocked;
  return {
    ok: true,
    value: [{ kind: 'keyword', keyword: plainKeyword(kind) }],
    rule: 'keyword.line',
  };
}

// ---------------------------------------------------------------- replacements

type Replacement = Extract<IrAbility, { kind: 'replacement' }>;

/**
 * "~ enters tapped" (with or without "unless ..."), "~ enters with N counters" and "As ~ enters,
 * you may pay N life. If you don't, it enters tapped" (CR 614.1c, 614.1d, 614.12).
 */
export function lowerReplacement(ability: Replacement): LowerResult<readonly Ability[]> {
  const { event } = ability;
  if (ability.instead !== undefined) return failure(ability);
  const built = (replacement: Extract<Ability, { kind: 'replacement' }>['replacement']) =>
    ({
      ok: true,
      value: [{ kind: 'replacement', replacement }],
      rule: ability.rule,
    }) as const;
  if (event.verb === 'entersTapped') {
    const blocked = gate(ability, ['ability:replacement', 'replacement:entersTapped']);
    if (blocked !== null) return blocked;
    if (event.condition === undefined) return built({ kind: 'entersTapped' });
    // The IR says "applies when X is false"; the engine's `unless` is X itself (CR 614.12).
    const { test } = event.condition;
    if (test.kind !== 'not') return failure(ability);
    const unless = lowerCondition(test.term, true);
    if (!unless.ok) return unless;
    return built({ kind: 'entersTapped', unless: unless.value });
  }
  if (event.verb === 'lifeGainBonus') {
    // CR 119.10, 614.1a (stage P33, D-150): every gain of life of the controller is more by this number.
    const amount = event.args.amount;
    if (amount?.kind !== 'number' || amount.value < 1 || event.condition !== undefined) {
      return failure(ability);
    }
    const blocked = gate(ability, ['ability:replacement', 'replacement:lifeGainBonus']);
    if (blocked !== null) return blocked;
    return built({ kind: 'lifeGainBonus', amount: amount.value });
  }
  if (event.verb === 'entersTappedUnlessPays') {
    const amount = event.args.amount;
    if (amount?.kind !== 'number' || amount.value < 1) return failure(ability);
    const blocked = gate(ability, ['ability:replacement', 'replacement:entersTappedUnlessPays']);
    if (blocked !== null) return blocked;
    return built({
      kind: 'entersTappedUnlessPays',
      cost: [{ kind: 'payLife', amount: amount.value }],
    });
  }
  if (event.verb === 'entersPrepared') {
    // CR 722.3a (stage P56, D-214): the designation and the copy of the prepare spell; the engine checks the layout.
    const blocked = gate(ability, ['ability:replacement', 'replacement:entersPrepared']);
    if (blocked !== null) return blocked;
    return built({ kind: 'entersPrepared' });
  }
  if (event.verb === 'entersTappedUnlessReveals') {
    // D-208 (CR 701.20, 701.4): "you may reveal a Mountain or Plains card from your hand" / "you may behold a Jace".
    const spec = event.args.reveal;
    if (spec?.kind !== 'revealSpec' || spec.types.length < 1 || spec.types.length > 2) {
      return failure(ability);
    }
    const blocked = gate(ability, [
      'ability:replacement',
      'replacement:entersTappedUnlessReveals',
      'replacement:entersPrepared',
      ...(spec.types.length > 1 ? (['selector:anyOf'] as const) : []),
    ]);
    if (blocked !== null) return blocked;
    const [only] = spec.types;
    const filter =
      spec.types.length === 1 && only !== undefined
        ? { subtypes: [only] }
        : { anyOf: spec.types.map((t) => ({ subtypes: [t] })) };
    return built({
      kind: 'entersTappedUnlessReveals',
      filter,
      words: spec.words,
      ...(spec.behold ? { fromBattlefield: true as const } : {}),
    });
  }
  if (event.verb === 'entersChoose') {
    // D-100: "As ~ enters, choose a creature type / a color". On a permanent face only; the engine
    // refuses a second question on the same face (`validateCard`).
    const what = event.args.what;
    if (what?.kind !== 'choiceKind') return failure(ability);
    const blocked = gate(ability, ['ability:replacement', 'replacement:asEntersChoose']);
    if (blocked !== null) return blocked;
    // "As ~ enters, choose Khans or Dragons" (stage P34, D-152, CR 614.12, 607.2d): the names are the card's own.
    if (what.what === 'option') {
      return what.options === undefined || what.options.length < 2
        ? failure(ability)
        : built({ kind: 'asEntersChoose', what: 'option', options: [...what.options] });
    }
    return built({ kind: 'asEntersChoose', what: what.what });
  }
  if (event.verb === 'entersAsCopy') {
    // CR 614.12, 707.2, 707.9b (stage P34, D-152): the permanent enters as a copy of one the controller chooses, with the keywords the exception
    // gives it, until end of turn or for good. The kind describes a permanent on the battlefield.
    const what = event.args.what;
    const until = event.args.duration;
    const gained = event.args.gains;
    if (what?.kind !== 'noun' || until?.kind !== 'flag') return failure(ability);
    const blocked = gate(ability, ['ability:replacement', 'replacement:entersAsCopy']);
    if (blocked !== null) return blocked;
    const filter = lowerFilter(what);
    if (!filter.ok) return filter;
    const { zone, ...kind } = filter.value;
    void zone;
    const gains: Keyword[] = [];
    for (const name of gained?.kind === 'keywordList' ? gained.names : []) {
      const word = keywordKind(name);
      if (word === undefined || !isGrantable(word)) return failure(ability);
      gains.push(plainKeyword(word));
    }
    return built({
      kind: 'entersAsCopy',
      what: kind,
      optional: true,
      duration: until.value ? 'untilEndOfTurn' : 'permanent',
      ...(gains.length > 0 ? { gains } : {}),
    });
  }
  if (event.verb === 'tokensInstead') {
    // "If one or more artifact tokens would be created under your control, that many ... are created instead" (stage P66, D-219, CR 614.1a, 616.1): the engine's
    // `tokensInstead` of the permanent; the token is the one the text describes, its count is the rule's (`thatMany` or one more, `plus`).
    const objects = event.args.what;
    const token = event.args.token;
    if (objects?.kind !== 'noun' || token?.kind !== 'token') return failure(ability);
    const blocked = gate(ability, ['ability:replacement', 'replacement:tokensInstead']);
    if (blocked !== null) return blocked;
    const what = lowerFilter(objects);
    if (!what.ok) return what;
    const { zone, ...filter } = what.value;
    void zone;
    const made = lowerClause(
      { ...event, verb: 'createToken', args: { token } },
      newContext('ability', []),
    );
    if (!made.ok) return made;
    const [only, ...rest] = made.value;
    if (
      only?.kind !== 'createToken' ||
      rest.length > 0 ||
      only.token.kind === 'copyOf' ||
      only.tapped !== undefined ||
      only.controller !== undefined
    ) {
      return failure(ability);
    }
    return built({
      kind: 'tokensInstead',
      what: filter,
      mode: event.args.plus === undefined ? 'thatMany' : 'plus',
      token: only.token,
    });
  }
  if (event.verb === 'wouldDie') {
    // CR 614.1a, 700.4 (stage P29, D-133): a creature that would die is exiled instead; the controller of the permanent
    // creates the token. The creature phrase is relative to that controller.
    const objects = event.args.objects;
    const token = event.args.token;
    if (objects?.kind !== 'noun' || (token !== undefined && token.kind !== 'token')) {
      return failure(ability);
    }
    const blocked = gate(ability, ['ability:replacement', 'replacement:wouldDie']);
    if (blocked !== null) return blocked;
    const what = lowerFilter(objects);
    if (!what.ok) return what;
    // The permanent's own zone ("on the battlefield") is the engine's business, not the filter's.
    const { zone, ...filter } = what.value;
    void zone;
    if (token === undefined) {
      return built({ kind: 'wouldDie', what: filter, instead: 'exile' });
    }
    const made = lowerClause(
      { ...event, verb: 'createToken', args: { token } },
      newContext('ability', []),
    );
    if (!made.ok) return made;
    const [only, ...rest] = made.value;
    if (
      only?.kind !== 'createToken' ||
      rest.length > 0 ||
      typeof only.count !== 'number' ||
      only.token.kind === 'copyOf' ||
      only.tapped !== undefined ||
      only.controller !== undefined
    ) {
      return failure(ability);
    }
    return built({
      kind: 'wouldDie',
      what: filter,
      instead: 'exile',
      alsoCreate: { token: only.token, count: only.count },
    });
  }
  if (event.verb === 'entersWithCounters') {
    // The engine's replacement has no condition ("If ~ was kicked, it enters with ..."): read, not run.
    if (event.condition !== undefined) return failure(ability);
    const count = event.args.count;
    const counter = event.args.counter;
    if (counter?.kind !== 'counterSpec') return failure(ability);
    // "enters with X counters" (stage P16, D-103, CR 107.3m): the X of the spell the permanent came
    // from, so the card needs an {X} in its mana cost (`validateCard` checks it, CR 107.3g).
    if (count?.kind === 'x') {
      const blockedX = gate(ability, [
        'ability:replacement',
        'replacement:entersWithCounters',
        'amount:x',
      ]);
      if (blockedX !== null) return blockedX;
      return built({ kind: 'entersWithCounters', counter: counter.name, count: { kind: 'x' } });
    }
    // "for each Zombie card in your graveyard" (stage P28, D-131): counted as it enters, for its controller (CR 614.12).
    if (count?.kind === 'countOf') {
      const blocked = gate(ability, [
        'ability:replacement',
        'replacement:entersWithCounters',
        'amount:countOf',
      ]);
      if (blocked !== null) return blocked;
      const counted = lowerAmount(count, newContext('ability', []), ability.rule);
      if (!counted.ok) return counted;
      if (typeof counted.value !== 'object' || counted.value.kind !== 'countOf') {
        return failure(ability);
      }
      return built({ kind: 'entersWithCounters', counter: counter.name, count: counted.value });
    }
    // "enters with a charge counter on it for each time it was kicked" (D-254, CR 702.33c, 614.1c): the kicks of the spell it came from.
    if (count?.kind === 'timesKicked') {
      const blocked = gate(ability, [
        'ability:replacement',
        'replacement:entersWithCounters',
        'amount:timesKicked',
      ]);
      if (blocked !== null) return blocked;
      return built({
        kind: 'entersWithCounters',
        counter: counter.name,
        count: { kind: 'timesKicked' },
      });
    }
    if (count?.kind !== 'number') return failure(ability);
    const blocked = gate(ability, ['ability:replacement', 'replacement:entersWithCounters']);
    if (blocked !== null) return blocked;
    return built({ kind: 'entersWithCounters', counter: counter.name, count: count.value });
  }
  return failure(ability);
}

// ---------------------------------------------------------------- spell text

type Spell = Extract<IrAbility, { kind: 'spell' }>;

/** The effects and targets of one line of an instant's or sorcery's text (CR 608.2). */
export function lowerSpell(ability: Spell, ctx: LowerContext): LowerResult<SpellParts> {
  const lowered = lowerSentences(ability.body.sentences, ctx);
  if (!lowered.ok) return lowered;
  return {
    ok: true,
    value: { targets: [...ctx.targets], effects: [...lowered.value], x: ctx.usesX },
    rule: 'spell.effect',
  };
}

/**
 * A modal spell (stage P19, CR 700.2): the modes and how many are chosen; the spell has no effect or
 * targets of its own. An X in a mode is the spell's one X (`x`).
 */
export function lowerModalSpell(
  ability: Extract<IrAbility, { kind: 'modal' }>,
  ctx: LowerContext,
): LowerResult<SpellParts> {
  const lowered = lowerModes(ability, ctx);
  if (!lowered.ok) return lowered;
  const { modes, chooseModes, usesX } = lowered.value;
  return {
    ok: true,
    value: { targets: [], effects: [], x: usesX, modal: { modes, chooseModes } },
    rule: ability.rule,
  };
}

/** Features the ability-level lowerings can name, for the dimension test. */
export const ABILITY_NEEDS: readonly FeatureRef[] = [
  'ability:keyword',
  'keyword:cycling',
  'keyword:equip',
  'keyword:kicker',
  'keyword:multikicker',
  'keyword:typecycling',
  'keyword:toxic',
  'keyword:annihilator',
  'keyword:bushido',
  'keyword:affinity',
  'keyword:flashback',
  'keyword:unearth',
  'keyword:encore',
  'keyword:devour',
  'keyword:riot',
  'keyword:suspend',
  'keyword:storm',
  'keyword:gift',
  'keyword:livingWeapon',
  'keyword:jobSelect',
  'keyword:canBeCommander',
  'keyword:hideaway',
  'keyword:escalate',
  'keyword:replicate',
  'keyword:echo',
  'keyword:cumulativeUpkeep',
  'keyword:ward',
  'keyword:crew',
  'keyword:enchant',
  'keyword:landwalk',
  'ability:replacement',
  'amount:x',
  'replacement:entersTapped',
  'replacement:entersWithCounters',
  'replacement:wouldDie',
  'replacement:entersTappedUnlessPays',
  'replacement:entersTappedUnlessReveals',
  'replacement:asEntersChoose',
  'replacement:entersAsCopy',
];
