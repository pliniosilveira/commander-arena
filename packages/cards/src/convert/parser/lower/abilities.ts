/**
 * Ability lowerings: keyword lines, enters replacements and spell text (activated and mana
 * abilities are in activated.ts). Each declares the engine features it needs (`needs`) and is
 * checked against SUPPORTED_FEATURES before anything is built, so an ability the engine cannot run
 * is reported with what is missing.
 */
import type {
  Ability,
  Amount,
  CardType,
  Color,
  Condition,
  Cost,
  Keyword,
  ObjectFilter,
  TokenPreset,
} from '@commander-arena/engine';
import { isNonCreatureSubtype } from '@commander-arena/engine';
import type { IrAbility, IrCost, IrKeyword } from '../ir/types';
import {
  isGrantable,
  keywordKind,
  landwalkOf,
  plainKeyword,
  typecyclingFilter,
} from '../rules/keyword/vocabulary';
import { lowerAmount } from './amounts';
import { lowerEnchant, lowerEnchantPlayer } from './attachments';
import { lowerCondition } from './conditions';
import { lowerQuotedCopyStatic } from './copy-statics';
import { lowerCost } from './costs';
import { lowerEntersRemoveCounters } from './counter-blitz-g';
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

/** The predefined tokens a replacement of "one of each" is read for (the engine's `tokensInstead` in `eachOf` mode). */
function isEachOfPreset(name: string): name is TokenPreset {
  return name === 'Clue' || name === 'Food' || name === 'Treasure';
}

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
  reconfigure: 'keyword.reconfigure',
  kicker: 'keyword.kicker',
  multikicker: 'keyword.multikicker',
  flashback: 'keyword.flashback',
  unearth: 'keyword.unearth',
  encore: 'keyword.encore',
  eternalize: 'keyword.eternalize',
  embalm: 'keyword.embalm',
  echo: 'keyword.echo',
  cumulativeUpkeep: 'keyword.cumulative-upkeep',
  ward: 'keyword.ward',
  replicate: 'keyword.replicate',
  escalate: 'keyword.escalate',
  buyback: 'keyword.buyback',
  offspring: 'keyword.offspring',
  plot: 'keyword.plot',
  ninjutsu: 'keyword.ninjutsu',
} as const;

type CostedKeyword =
  | 'cycling'
  | 'equip'
  | 'reconfigure'
  | 'kicker'
  | 'multikicker'
  | 'flashback'
  | 'unearth'
  | 'encore'
  | 'eternalize'
  | 'embalm'
  | 'echo'
  | 'cumulativeUpkeep'
  | 'ward'
  | 'replicate'
  | 'escalate'
  | 'buyback'
  | 'offspring'
  | 'plot'
  | 'ninjutsu';

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
/**
 * The equip cost that is a mana cost and a payment of life: the engine pays both as the ability is activated (CR 602.2b, 118.1). The same two costs make a ward cost, "Ward—{2}, Pay 2
 * life." (D-467, CR 702.21a): the engine pays the life and then the mana as the ward ability resolves (`rules/pay-unless.ts`).
 */
function lowerEquipCosts(
  ability: IrKeyword,
  written: readonly IrCost[],
  name: 'equip' | 'ward' | 'flashback' = 'equip',
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
    `keyword:${name}`,
    ...costs.map((c) => `cost:${c.kind}` as FeatureRef),
  ]);
  if (blocked !== null) return blocked;
  return {
    ok: true,
    value: [{ kind: 'keyword', keyword: { kind: name, cost: costs } }],
    rule: KEYWORD_RULE[name],
  };
}

/** The flashback cost that sacrifices permanents or exiles X cards of the graveyard: each of mana, life, one sacrifice and one exile at most once, as the engine's `checkFlashbackCost` takes them. */
function lowerFlashbackSacrifice(
  ability: IrKeyword,
  written: readonly IrCost[],
): LowerResult<readonly Ability[]> {
  const kinds = written.map((c) => c.kind);
  if (
    kinds.some((k) => k !== 'mana' && k !== 'payLife' && k !== 'sacrifice' && k !== 'exile') ||
    new Set(kinds).size !== kinds.length
  ) {
    return failure(ability);
  }
  const costs: Cost[] = [];
  for (const item of written) {
    const lowered = lowerCost(item, { flashback: true });
    if (!lowered.ok) return lowered;
    costs.push(lowered.value);
  }
  const blocked = gate(ability, [
    'ability:keyword',
    'keyword:flashback',
    ...costs.map((c) => `cost:${c.kind}` as FeatureRef),
  ]);
  if (blocked !== null) return blocked;
  return {
    ok: true,
    value: [{ kind: 'keyword', keyword: { kind: 'flashback', cost: costs } }],
    rule: KEYWORD_RULE.flashback,
  };
}

function lowerCostedKeyword(
  ability: IrKeyword,
  name: CostedKeyword,
): LowerResult<readonly Ability[]> {
  const [only, ...more] = ability.cost ?? [];
  // "Equip—Pay {3} or remove a counter from ~." (Gavel of the Righteous, CR 702.6a, 702.6d, 118.3): a mana cost, or the removal of a counter from the Equipment itself.
  if (ability.orCost !== undefined) {
    const [other, ...extra] = ability.orCost;
    if (
      name !== 'equip' ||
      only?.kind !== 'mana' ||
      more.length > 0 ||
      extra.length > 0 ||
      other?.kind !== 'removeAnyCounters' ||
      ability.params.length > 0 ||
      ability.quality !== undefined ||
      ability.commanderOnly === true ||
      ability.legendaryOnly === true ||
      ability.costReducedIf !== undefined
    ) {
      return failure(ability);
    }
    const mana = lowerCost(only);
    if (!mana.ok) return mana;
    const removal = lowerCost(other);
    if (!removal.ok) return removal;
    const blocked = gate(ability, [
      'ability:keyword',
      'keyword:equip',
      `cost:${mana.value.kind}` as FeatureRef,
      `cost:${removal.value.kind}` as FeatureRef,
    ]);
    if (blocked !== null) return blocked;
    return {
      ok: true,
      value: [
        {
          kind: 'keyword',
          keyword: { kind: 'equip', cost: [mana.value], orCost: [removal.value] },
        },
      ],
      rule: KEYWORD_RULE.equip,
    };
  }
  // "Equip—{2}, Pay 2 life." (stage P35, D-176, CR 702.6a): a mana cost and a payment of life, each once.
  if (name === 'equip' && only !== undefined && more.length === 1 && ability.params.length === 0) {
    return lowerEquipCosts(ability, [only, ...more]);
  }
  // "Ward—{2}, Pay 2 life." (Gisa deck, D-467, CR 702.21a): a mana cost and a payment of life, each once.
  if (name === 'ward' && only !== undefined && more.length === 1 && ability.params.length === 0) {
    return lowerEquipCosts(ability, [only, ...more], 'ward');
  }
  // "Flashback—Sacrifice three creatures." (Dread Return, CR 702.34a, 118.9, 701.21a): one sacrifice of the caster's permanents, alone or with a mana cost or a payment of life.
  if (
    name === 'flashback' &&
    (ability.cost ?? []).some((c) => c.kind === 'sacrifice' || c.kind === 'exile') &&
    ability.params.length === 0
  ) {
    return lowerFlashbackSacrifice(ability, ability.cost ?? []);
  }
  // "Flashback—{1}{U}, Pay 3 life." (Grave Danger, issue 159, CR 702.34a): a mana cost and a payment of life, each once.
  if (
    name === 'flashback' &&
    only !== undefined &&
    more.length === 1 &&
    ability.params.length === 0
  ) {
    return lowerEquipCosts(ability, [only, ...more], 'flashback');
  }
  if (only === undefined || more.length > 0 || ability.params.length > 0) return failure(ability);
  // A cost the engine does not pay for this keyword is refused at the keyword, whatever else it is.
  // Ward's cost is paid as its ability resolves (CR 702.21a); a sacrifice is read and the engine's
  // own check says it does not pay one, a discard is paid since D-095.
  const kinds =
    name === 'flashback' ||
    name === 'reconfigure' ||
    name === 'multikicker' ||
    name === 'unearth' ||
    name === 'encore' ||
    name === 'eternalize' ||
    name === 'embalm' ||
    name === 'echo' ||
    name === 'cumulativeUpkeep' ||
    name === 'buyback' ||
    name === 'offspring' ||
    name === 'plot' ||
    name === 'ninjutsu'
      ? ['mana']
      : // CR 702.56a (Psionic Ritual): a replicate cost is mana or the tapping of an untapped permanent, paid once for each copy.
        // CR 702.120a (Collective Effort): "Escalate—Tap an untapped creature you control." is paid once for each mode chosen beyond the first.
        name === 'replicate' || name === 'escalate'
        ? ['mana', 'tapPermanents']
        : name === 'ward'
          ? ['mana', 'payLife', 'sacrifice', 'discard', 'blight']
          : // CR 702.33a, 118.8, 701.21a: "Kicker—Sacrifice a creature." is paid after the mana, as an additional cost's sacrifice is.
            name === 'kicker'
            ? ['mana', 'payLife', 'sacrifice']
            : ['mana', 'payLife'];
  if (!kinds.includes(only.kind)) return failure(ability);
  // "Kicker {X}. X can't be 0." (Thieving Skydiver, CR 702.33a, 107.3a): only the kicker keyword, and only with that sentence.
  if (ability.xNotZero === true && name !== 'kicker') return failure(ability);
  // Issue 81 (Shark Typhoon, "Cycling {X}{1}{U}", CR 702.29a, 107.3): the cycling ability is an activated ability, which announces its X.
  const cost = lowerCost(
    only,
    name === 'cycling' || (name === 'kicker' && ability.xNotZero === true)
      ? { x: true }
      : name === 'ward'
        ? { ward: true }
        : (name === 'replicate' && only.kind === 'tapPermanents') || name === 'escalate'
          ? { ordinary: true }
          : {},
  );
  if (!cost.ok) return cost;
  // A kicker that sacrifices names permanents by a filter, never the spell's own permanent or an "and" of several (`validateCard`).
  if (
    name === 'kicker' &&
    cost.value.kind === 'sacrifice' &&
    ('kind' in cost.value.what || cost.value.alongside !== undefined)
  ) {
    return failure(ability);
  }
  const blocked = gate(ability, [
    'ability:keyword',
    `keyword:${name}`,
    `cost:${cost.value.kind}` as FeatureRef,
    ...(name === 'escalate' && cost.value.kind === 'tapPermanents'
      ? (['ability:escalateTapCost'] as const)
      : []),
    ...(ability.xNotZero === true ? (['ability:kickerX'] as const) : []),
    ...(name === 'kicker' && cost.value.kind === 'sacrifice'
      ? (['ability:kickerSacrifice'] as const)
      : []),
  ]);
  if (blocked !== null) return blocked;
  // "Equip Wizard {1}" (stage P67, D-220, CR 702.6c): the creature type the equip ability attaches to.
  if (
    (ability.quality !== undefined ||
      ability.commanderOnly === true ||
      ability.legendaryOnly === true) &&
    name !== 'equip'
  ) {
    return failure(ability);
  }
  // "Equip {2}. This ability costs {2} less to activate if you have one or fewer cards in hand." (Ahoy Mateys group 10, CR 601.2f, 602.2b): the reduction of the equip ability.
  let costReducedIf: { generic: number; condition: Condition } | undefined;
  if (ability.costReducedIf !== undefined) {
    const { amount, condition } = ability.costReducedIf;
    if (name !== 'equip' || cost.value.kind !== 'mana' || amount.kind !== 'number') {
      return failure(ability);
    }
    const reduced = gate(ability, ['ability:costReducedIf']);
    if (reduced !== null) return reduced;
    const lowered = lowerCondition(condition);
    if (!lowered.ok) return lowered;
    costReducedIf = { generic: amount.value, condition: lowered.value };
  }
  return {
    ok: true,
    value: [
      {
        kind: 'keyword',
        keyword: {
          kind: name,
          cost: [cost.value],
          ...(costReducedIf === undefined ? {} : { costReducedIf }),
          ...(ability.quality === undefined
            ? {}
            : { restriction: { subtypes: [ability.quality] } }),
          // "Equip commander {3}" (stage P70, D-259, CR 702.6c, 903.3): a creature that is a commander.
          ...(ability.commanderOnly === true ? { restriction: { commander: true } } : {}),
          // "Equip legendary creature {3}" (issue 345, CR 702.6c, 205.4): a legendary creature.
          ...(ability.legendaryOnly === true
            ? { restriction: { types: ['creature'], supertypes: ['legendary'] } }
            : {}),
          ...(ability.xNotZero === true ? { xNotZero: true } : {}),
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
  const kind = ability.name === 'gravestorm' ? 'gravestorm' : 'storm';
  const blocked = gate(ability, ['ability:keyword', `keyword:${kind}`]);
  if (blocked !== null) return blocked;
  return {
    ok: true,
    value: [{ kind: 'keyword', keyword: { kind } }],
    rule: 'keyword.storm',
  };
}

/**
 * "Gift a card" or "Gift a tapped Fish" (CR 702.174, stage P30, D-135): the keyword with what is given. The engine asks the question as the spell is cast and
 * writes the two abilities the keyword stands for (the card the chosen opponent draws, as the permanent enters or before an instant's
 * or a sorcery's other effects); whether the face can have it (one, not on a land, not on a modal spell) is `validateCard`'s refusal.
 */
function lowerGift(ability: IrKeyword): LowerResult<readonly Ability[]> {
  if (ability.params.length > 0 || (ability.cost ?? []).length > 0) return failure(ability);
  const blocked = gate(ability, ['ability:keyword', 'keyword:gift']);
  if (blocked !== null) return blocked;
  return {
    ok: true,
    value: [{ kind: 'keyword', keyword: { kind: 'gift', gift: ability.gift ?? 'card' } }],
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
 * "Start your engines!" (issue 144, CR 702.179a, 704.5aa): the keyword, a static ability the engine runs as a state-based action. It is not granted (the engine's GRANTABLE_KEYWORDS leaves it out).
 */
function lowerStartYourEngines(ability: IrKeyword): LowerResult<readonly Ability[]> {
  if (ability.params.length > 0 || (ability.cost ?? []).length > 0) return failure(ability);
  const blocked = gate(ability, ['ability:keyword', 'keyword:startYourEngines']);
  if (blocked !== null) return blocked;
  return {
    ok: true,
    value: [{ kind: 'keyword', keyword: { kind: 'startYourEngines' } }],
    rule: 'keyword.start-your-engines',
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
 * "Station" (CR 702.184a): the keyword; the engine expands it into the activated ability. Only a station card has it (a Spacecraft or a Planet, CR 702.184b, 721.1), so another
 * face is read and refused with no gap named.
 */
function lowerStation(ability: IrKeyword, ctx: LowerContext): LowerResult<readonly Ability[]> {
  if (ability.params.length > 0) return failure(ability);
  if (!ctx.faceSubtypes.includes('Spacecraft') && !ctx.faceSubtypes.includes('Planet')) {
    return failure(ability);
  }
  const blocked = gate(ability, ['ability:keyword', 'keyword:station']);
  if (blocked !== null) return blocked;
  return {
    ok: true,
    value: [{ kind: 'keyword', keyword: { kind: 'station' } }],
    rule: 'keyword.station',
  };
}

/**
 * "Toxic 1" (CR 702.164a), "Annihilator 2" (CR 702.86a), "Bushido 1" (CR 702.45a) and "Devour 2" (CR 702.82a, D-186): the keyword with its
 * number, a positive whole number. The engine reads Toxic where combat damage is dealt and expands
 * Annihilator and Bushido into their triggered abilities, so the lowering only builds the keyword.
 */
function lowerNumbered(
  ability: IrKeyword,
  kind:
    | 'toxic'
    | 'annihilator'
    | 'firebending'
    | 'afflict'
    | 'dredge'
    | 'mobilize'
    | 'fabricate'
    | 'bushido'
    | 'hideaway'
    | 'vanishing'
    | 'devour'
    | 'backup',
): LowerResult<readonly Ability[]> {
  const [count, ...more] = ability.params;
  if (count?.kind !== 'number' || more.length > 0 || ability.cost !== undefined) {
    return failure(ability);
  }
  if (!Number.isSafeInteger(count.value) || count.value < 1) return failure(ability);
  const blocked = gate(ability, ['ability:keyword', `keyword:${kind}`]);
  if (blocked !== null) return blocked;
  // CR 702.82c, "Devour Food 3": the quality is an artifact type the engine reads (a subtype that is no creature type); any other word is not read.
  if (ability.quality !== undefined) {
    if (kind !== 'devour' || !isNonCreatureSubtype(ability.quality)) return failure(ability);
    return {
      ok: true,
      value: [{ kind: 'keyword', keyword: { kind, count: count.value, of: ability.quality } }],
      rule: 'keyword.line',
    };
  }
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
  if (ability.quality === 'multicolored' && ability.colors === undefined) {
    // CR 702.16a, 105.2: protection from sources of two or more colors.
    const blockedQuality = gate(ability, ['ability:keyword', 'keyword:protection']);
    if (blockedQuality !== null) return blockedQuality;
    return {
      ok: true,
      value: [{ kind: 'keyword', keyword: { kind: 'protection', from: 'multicolored' } }],
      rule: 'keyword.line',
    };
  }
  if (ability.manaValue !== undefined && ability.colors === undefined) {
    // CR 702.16a, 202.3: protection from sources whose mana value compares as stated.
    const blockedValue = gate(ability, ['ability:keyword', 'keyword:protection']);
    if (blockedValue !== null) return blockedValue;
    return {
      ok: true,
      value: [
        {
          kind: 'keyword',
          keyword: {
            kind: 'protection',
            from: 'manaValue',
            cmp: ability.manaValue.cmp,
            value: ability.manaValue.value,
          },
        },
      ],
      rule: 'keyword.line',
    };
  }
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
    ability.name === 'reconfigure' ||
    ability.name === 'kicker' ||
    ability.name === 'multikicker' ||
    ability.name === 'flashback' ||
    ability.name === 'unearth' ||
    ability.name === 'encore' ||
    ability.name === 'eternalize' ||
    ability.name === 'embalm' ||
    ability.name === 'echo' ||
    ability.name === 'cumulativeUpkeep' ||
    ability.name === 'replicate' ||
    ability.name === 'escalate' ||
    ability.name === 'buyback' ||
    ability.name === 'offspring' ||
    ability.name === 'plot' ||
    ability.name === 'ninjutsu' ||
    ability.name === 'ward'
  ) {
    return lowerCostedKeyword(ability, ability.name);
  }
  if (ability.name === 'suspend') return lowerSuspend(ability);
  if (ability.name === 'storm' || ability.name === 'gravestorm') return lowerStorm(ability);
  if (ability.name === 'gift') return lowerGift(ability);
  if (ability.name === 'livingWeapon' || ability.name === 'jobSelect') {
    return lowerLivingWeapon(ability, ctx);
  }
  if (ability.name === 'canBeCommander') return lowerCanBeCommander(ability);
  if (ability.name === 'startYourEngines') return lowerStartYourEngines(ability);
  if (ability.name === 'crew') return lowerCrew(ability, ctx);
  if (ability.name === 'station') return lowerStation(ability, ctx);
  if (ability.name === 'enchant') return lowerEnchant(ability);
  if (ability.name === 'enchantPlayer') return lowerEnchantPlayer(ability);
  if (
    ability.name === 'toxic' ||
    ability.name === 'annihilator' ||
    ability.name === 'firebending' ||
    ability.name === 'afflict' ||
    ability.name === 'dredge' ||
    ability.name === 'mobilize' ||
    ability.name === 'fabricate' ||
    ability.name === 'bushido' ||
    ability.name === 'hideaway' ||
    ability.name === 'vanishing' ||
    ability.name === 'devour' ||
    ability.name === 'backup'
  ) {
    return lowerNumbered(ability, ability.name);
  }
  if (ability.name === 'affinity') return lowerAffinity(ability);
  // CR 702.124j (D-490): "Partner with [name]": the keyword with the name; the engine builds its enters trigger.
  if (ability.name === 'partnerWith') {
    const [named] = ability.params;
    if (ability.params.length !== 1 || named?.kind !== 'name') return failure(ability);
    const blocked = gate(ability, ['ability:keyword', 'keyword:partnerWith']);
    if (blocked !== null) return blocked;
    return {
      ok: true,
      value: [{ kind: 'keyword', keyword: { kind: 'partnerWith', name: named.name } }],
      rule: 'keyword.partner-with',
    };
  }
  // CR 100.2a: "A deck can have up to nine cards named ~": a deck-construction line, no effect in a game.
  if (ability.name === 'deckLimit') {
    const [limit] = ability.params;
    if (ability.params.length !== 1 || limit?.kind !== 'number') return failure(ability);
    if (!Number.isSafeInteger(limit.value) || limit.value < 2) return failure(ability);
    const blocked = gate(ability, ['ability:keyword', 'keyword:deckLimit']);
    if (blocked !== null) return blocked;
    return {
      ok: true,
      value: [{ kind: 'keyword', keyword: { kind: 'deckLimit', limit: limit.value } }],
      rule: 'keyword.deck-limit',
    };
  }
  // CR 702.139a: "Companion — [condition]": a deck-construction line, no effect in a game; the condition is one of the closed set.
  if (ability.name === 'companion') {
    const [named] = ability.params;
    if (ability.params.length !== 1 || named?.kind !== 'name') return failure(ability);
    if (named.name !== 'noRepeatedManaSymbol') return failure(ability);
    const blocked = gate(ability, ['ability:keyword', 'keyword:companion']);
    if (blocked !== null) return blocked;
    return {
      ok: true,
      value: [
        {
          kind: 'keyword',
          keyword: { kind: 'companion', condition: { kind: 'noRepeatedManaSymbol' } },
        },
      ],
      rule: 'keyword.companion',
    };
  }
  if (ability.name === 'protection') return lowerProtection(ability);
  // A creature type ("Halflingcycling {4}", D-538) names its type in `quality`; the five land types and "basic land" are in the table.
  const typeSearch: ObjectFilter | undefined =
    ability.quality !== undefined && ability.name.endsWith('cycling')
      ? { subtypes: [ability.quality] }
      : typecyclingFilter(ability.name);
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
  // Counter Blitz deck, group G (Sin, Unending Cataclysm): two abilities from one line.
  if (event.verb === 'entersRemoveCounters') return lowerEntersRemoveCounters(ability);
  if (event.verb === 'entersTapped') {
    const blocked = gate(ability, ['ability:replacement', 'replacement:entersTapped']);
    if (blocked !== null) return blocked;
    if (event.condition === undefined) return built({ kind: 'entersTapped' });
    // The IR says "applies when X is false"; the engine's `unless` is X itself (CR 614.12).
    const { test } = event.condition;
    if (test.kind !== 'not') {
      // "If you control two or more other lands, ~ enters tapped." (CR 614.1c): it enters tapped when X holds, so it enters untapped (`unless`) when X does not.
      const applies = lowerCondition(event.condition, true);
      if (!applies.ok) return applies;
      return built({ kind: 'entersTapped', unless: { kind: 'not', term: applies.value } });
    }
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
  if (event.verb === 'damageBonus') {
    // CR 614.1a, 120.3 (Tannuk deck, issue 347): the damage a source the controller controls would deal to an opponent or their permanents is more by this number.
    const amount = event.args.amount;
    const sources = event.args.sources;
    if (
      amount?.kind !== 'number' ||
      amount.value < 1 ||
      sources?.kind !== 'noun' ||
      event.condition !== undefined
    ) {
      return failure(ability);
    }
    const blocked = gate(ability, ['ability:replacement', 'replacement:damageBonus']);
    if (blocked !== null) return blocked;
    const lowered = lowerFilter(sources);
    if (!lowered.ok) return lowered;
    const { zone, ...filter } = lowered.value;
    void zone;
    // Spiked Corridor (CR 120.2b): only noncombat damage, only to an opponent (not to their permanents).
    const noncombat = event.args.noncombatOnly?.kind === 'flag' && event.args.noncombatOnly.value;
    const playersOnly =
      event.args.opponentPlayersOnly?.kind === 'flag' && event.args.opponentPlayersOnly.value;
    return built({
      kind: 'damageBonus',
      sources: filter,
      amount: amount.value,
      ...(noncombat ? { noncombatOnly: true as const } : {}),
      ...(playersOnly ? { opponentPlayersOnly: true as const } : {}),
    });
  }
  if (event.verb === 'damageDouble') {
    // CR 614.1a, 120.3 (Angrath's Marauders): the damage a source the controller controls would deal to any permanent or player is doubled.
    const sources = event.args.sources;
    if (sources?.kind !== 'noun' || event.condition !== undefined) return failure(ability);
    const blocked = gate(ability, ['ability:replacement', 'replacement:damageDouble']);
    if (blocked !== null) return blocked;
    const lowered = lowerFilter(sources);
    if (!lowered.ok) return lowered;
    const { zone, ...filter } = lowered.value;
    void zone;
    return built({ kind: 'damageDouble', sources: filter });
  }
  if (event.verb === 'countersPlus') {
    // "If one or more +1/+1 counters would be put on a creature you control, that many plus one +1/+1 counters are put on it instead." (Quandrix Unlimited deck, group A,
    // CR 614.1a, 122.6): the engine's `countersPlus` of the permanent. The permanents are the noun's filter as they are on the battlefield (the controller's own, "another"
    // leaving the permanent out).
    const objects = event.args.what;
    const amount = event.args.amount;
    if (
      objects?.kind !== 'noun' ||
      amount?.kind !== 'number' ||
      amount.value < 1 ||
      event.condition !== undefined
    ) {
      return failure(ability);
    }
    const blocked = gate(ability, ['ability:replacement', 'replacement:countersPlus']);
    if (blocked !== null) return blocked;
    const what = lowerFilter(objects);
    if (!what.ok) return what;
    const { zone, ...filter } = what.value;
    void zone;
    return built({
      kind: 'countersPlus',
      what: objects.other ? { ...filter, other: true } : filter,
      counter: '+1/+1',
      extra: amount.value,
    });
  }
  if (event.verb === 'proliferateDouble') {
    // CR 701.34a, 614.1a, 614.5 (Tekuthal, Inquiry Dominus): the controller proliferates twice each time they would.
    if (event.condition !== undefined || Object.keys(event.args).length > 0)
      return failure(ability);
    const blocked = gate(ability, ['ability:replacement', 'replacement:proliferateDouble']);
    if (blocked !== null) return blocked;
    return built({ kind: 'proliferateDouble' });
  }
  if (event.verb === 'lifeGainDouble') {
    if (event.condition !== undefined || Object.keys(event.args).length > 0)
      return failure(ability);
    const blocked = gate(ability, ['ability:replacement', 'replacement:lifeGainDouble']);
    if (blocked !== null) return blocked;
    return built({ kind: 'lifeGainDouble' });
  }
  if (event.verb === 'skipDraw') {
    // CR 614.11, 121.6 (issue 25, D-332): every draw of the controller is skipped, or only while the plain condition holds.
    const blocked = gate(ability, ['ability:replacement', 'replacement:skipDraw']);
    if (blocked !== null) return blocked;
    if (event.condition === undefined) return built({ kind: 'skipDraw' });
    const when = lowerCondition(event.condition);
    return when.ok ? built({ kind: 'skipDraw', while: when.value }) : when;
  }
  if (event.verb === 'keepOneLoyalty') {
    // CR 614.1a, 120.3c (Deification): the damage dealt to the planeswalkers of the controller removes all but one loyalty counter instead of all of them.
    const walkers = event.args.planeswalkers;
    if (walkers?.kind !== 'noun') return failure(ability);
    const blocked = gate(ability, ['ability:replacement', 'replacement:keepOneLoyalty']);
    if (blocked !== null) return blocked;
    const lowered = lowerFilter(walkers);
    if (!lowered.ok) return lowered;
    const { zone, ...planeswalkers } = lowered.value;
    void zone;
    if (event.condition === undefined) return built({ kind: 'keepOneLoyalty', planeswalkers });
    const when = lowerCondition(event.condition);
    return when.ok ? built({ kind: 'keepOneLoyalty', planeswalkers, while: when.value }) : when;
  }
  if (event.verb === 'umbraArmor') {
    // CR 702.89a (Danitha deck, D-417): the keyword of an Aura; the engine checks that the face is one.
    const blocked = gate(ability, ['ability:replacement', 'replacement:umbraArmor']);
    if (blocked !== null) return blocked;
    return built({ kind: 'umbraArmor' });
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
    // "... or you control a Dragon": the IR says "applies when X is false"; the engine's `orIf` is X itself.
    let orIf: Condition | undefined;
    if (event.condition !== undefined) {
      if (event.condition.test.kind !== 'not' || spec.behold) return failure(ability);
      const lowered = lowerCondition(event.condition.test.term, true);
      if (!lowered.ok) return lowered;
      orIf = lowered.value;
    }
    return built({
      kind: 'entersTappedUnlessReveals',
      filter,
      words: spec.words,
      ...(spec.behold ? { fromBattlefield: true as const } : {}),
      ...(orIf === undefined ? {} : { orIf }),
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
    // CR 205.2a (Cloud Key): "choose artifact, creature, enchantment, instant, or sorcery": the card types the question offers.
    if (what.what === 'cardType' && what.options !== undefined) {
      return what.options.length < 2
        ? failure(ability)
        : built({ kind: 'asEntersChoose', what: 'cardType', options: [...what.options] });
    }
    return built({
      kind: 'asEntersChoose',
      what: what.what,
      ...(what.except === undefined ? {} : { except: what.except }),
    });
  }
  if (event.verb === 'entersAsCopy') {
    // CR 614.12, 707.2, 707.9b (stage P34, D-152): the permanent enters as a copy of one the controller chooses, with the keywords the exception
    // gives it, until end of turn or for good. The kind describes a permanent on the battlefield.
    const what = event.args.what;
    const until = event.args.duration;
    const gained = event.args.gains;
    if (what?.kind !== 'noun' || until?.kind !== 'flag') return failure(ability);
    const blocked = gate(ability, [
      'ability:replacement',
      'replacement:entersAsCopy',
      ...(event.args.withX === undefined ? [] : (['ability:copyEntersWithX'] as const)),
      ...(event.args.fromGraveyard === undefined
        ? []
        : (['ability:copyEntersFromGraveyard'] as const)),
      ...(event.args.exileTwo === undefined ? [] : (['ability:copyEntersExilesTwo'] as const)),
      ...(event.args.addTypes === undefined ? [] : (['ability:copyEntersAddsTypes'] as const)),
      ...(event.args.addStatic === undefined ? [] : (['ability:copyEntersAddsStatics'] as const)),
    ]);
    if (blocked !== null) return blocked;
    const filter = lowerFilter(what);
    if (!filter.ok) return filter;
    // CR 614.12, 707.9, 700.4: "a copy of any creature card in your graveyard that was put there from the battlefield this turn": the filter keeps its zone, the graveyard.
    const fromGraveyard =
      event.args.fromGraveyard?.kind === 'flag' && event.args.fromGraveyard.value;
    // CR 614.12, 707.9b (The Mimeoplasm): "exile two creature cards from graveyards": the creature cards of every graveyard, which the filter says by its zone.
    const exileTwo = event.args.exileTwo?.kind === 'flag' && event.args.exileTwo.value;
    const { zone, ...unzoned } = filter.value;
    if (
      fromGraveyard || exileTwo
        ? zone !== 'graveyard'
        : zone !== undefined && zone !== 'battlefield'
    ) {
      return failure(ability);
    }
    const kind = fromGraveyard || exileTwo ? filter.value : unzoned;
    const gains: Keyword[] = [];
    for (const name of gained?.kind === 'keywordList' ? gained.names : []) {
      const word = keywordKind(name);
      if (word === undefined || !isGrantable(word)) return failure(ability);
      gains.push(plainKeyword(word));
    }
    // Issue 103 (CR 707.9b): "except it's a Dragon in addition to its other types": creature types only.
    const exceptTypes = event.args.exceptTypes;
    if (
      exceptTypes !== undefined &&
      (exceptTypes.kind !== 'typeList' ||
        exceptTypes.additive !== true ||
        exceptTypes.cardTypes !== undefined ||
        exceptTypes.colors !== undefined ||
        exceptTypes.subtypes.length === 0)
    ) {
      return failure(ability);
    }
    // CR 707.9b, 205.1b (Phyrexian Metamorph): "except it's an artifact in addition to its other types": card types, in a list of their own.
    const addedTypes = event.args.addTypes;
    if (
      addedTypes !== undefined &&
      (addedTypes.kind !== 'typeList' ||
        addedTypes.additive !== true ||
        addedTypes.subtypes.length > 0 ||
        addedTypes.colors !== undefined ||
        addedTypes.cardTypes === undefined ||
        addedTypes.cardTypes.length === 0)
    ) {
      return failure(ability);
    }
    // CR 707.9b (Mocking Doppelganger): "except it has \"<static ability>\"": the quoted static ability, lowered like the static ability of a card.
    const addStatics: Ability[] = [];
    const quotedStatic = event.args.addStatic;
    if (quotedStatic !== undefined) {
      const lowered = lowerQuotedCopyStatic(quotedStatic, ability, newContext('ability', [], []));
      if (!lowered.ok) return lowered;
      addStatics.push(...lowered.value);
    }
    return built({
      kind: 'entersAsCopy',
      what: kind,
      optional: true,
      duration: until.value ? 'untilEndOfTurn' : 'permanent',
      ...(addStatics.length === 0 ? {} : { addStatics }),
      ...(addedTypes?.kind === 'typeList' && addedTypes.cardTypes !== undefined
        ? { addTypes: addedTypes.cardTypes as CardType[] }
        : {}),
      ...(gains.length > 0 ? { gains } : {}),
      ...(exceptTypes?.kind === 'typeList' ? { addSubtypes: [...exceptTypes.subtypes] } : {}),
      ...(fromGraveyard ? { fromGraveyard: true as const } : {}),
      // CR 614.12, 707.9b, 122.6: "... a number of additional +1/+1 counters on it equal to the power of the other card".
      ...(exileTwo ? { exileTwoFromGraveyards: { counter: '+1/+1' } } : {}),
      // CR 707.9a, 707.9b, 205.4a: "except her name is ~ and she's a legendary Trill in addition to her other types".
      ...(event.args.keepName?.kind === 'flag' && event.args.keepName.value
        ? { keepName: true as const }
        : {}),
      ...(event.args.addLegendary?.kind === 'flag' && event.args.addLegendary.value
        ? { addSupertypes: ['legendary' as const] }
        : {}),
      // CR 707.9b, 614.12, 205.4a (Spark Double): "... an additional +1/+1 counter if it's a creature, ... a loyalty counter if it's a planeswalker, and it isn't legendary".
      ...(event.args.extraCounters?.kind === 'flag' && event.args.extraCounters.value
        ? {
            extraCounters: [
              { type: 'creature' as const, counter: '+1/+1' },
              { type: 'planeswalker' as const, counter: 'loyalty' },
            ],
          }
        : {}),
      ...(event.args.notLegendary?.kind === 'flag' && event.args.notLegendary.value
        ? { notLegendary: true as const }
        : {}),
      // CR 707.9b, 107.3m: "except it enters with X additional +1/+1 counters on it".
      ...(event.args.withX?.kind === 'flag' && event.args.withX.value
        ? { withX: { counter: '+1/+1' } }
        : {}),
      // Issue 104 (CR 707.9b, 702.128b): "except if ~ was embalmed, the token has no mana cost, it's white, and it's a Zombie in addition to its other types".
      ...(event.args.embalmed?.kind === 'flag' && event.args.embalmed.value
        ? {
            ifEmbalmed: {
              setColors: ['W' as const],
              noManaCost: true as const,
              addSubtypes: ['Zombie'],
            },
          }
        : {}),
    });
  }
  if (event.verb === 'drawInstead') {
    // "If you would draw a card except the first one you draw in each of your draw steps, draw two cards instead." (Hashaton deck group 3, D-379, CR 614.1a, 614.11,
    // 504.1): the engine's `drawInstead` of the permanent, with the number of cards the text says.
    const amount = event.args.amount;
    if (amount?.kind !== 'number' || amount.value < 2 || event.condition !== undefined) {
      return failure(ability);
    }
    const blocked = gate(ability, ['ability:replacement', 'replacement:drawInstead']);
    if (blocked !== null) return blocked;
    return built({ kind: 'drawInstead', count: amount.value, exceptFirstInDrawStep: true });
  }
  if (event.verb === 'drawRedirect') {
    // "If an opponent would draw a card except the first one they draw in each of their draw steps, instead that player skips that draw and you draw a card." (Notion Thief, CR
    // 614.1a, 614.11, 504.1): the engine's `drawRedirect` of the permanent.
    if (event.condition !== undefined) return failure(ability);
    const blocked = gate(ability, ['ability:replacement', 'replacement:drawRedirect']);
    if (blocked !== null) return blocked;
    return built({ kind: 'drawRedirect', exceptFirstInDrawStep: true });
  }
  if (event.verb === 'tokensInstead' && event.args.eachOf !== undefined) {
    // "If you would create a Clue, Food, or Treasure token, instead create one of each." (Most Wanted deck group 2, Academy Manufactor, CR 614.1a, 614.5): the engine's
    // `tokensInstead` in `eachOf` mode, whose tokens are the predefined ones the members of the filter name.
    const objects = event.args.what;
    if (objects?.kind !== 'noun') return failure(ability);
    const blocked = gate(ability, ['ability:replacement', 'replacement:tokensInstead']);
    if (blocked !== null) return blocked;
    const what = lowerFilter(objects);
    if (!what.ok) return what;
    const { zone, ...filter } = what.value;
    void zone;
    const tokens = (filter.anyOf ?? []).flatMap((member) => member.subtypes ?? []);
    if (!tokens.every(isEachOfPreset)) return failure(ability);
    return built({ kind: 'tokensInstead', what: filter, mode: 'eachOf', tokens });
  }
  if (event.verb === 'tokensInstead' && event.args.double !== undefined) {
    // "If one or more tokens would be created under your control, twice that many of those tokens are created instead." (Hashaton deck group 3, D-378, CR 614.1a,
    // 614.5): the engine's `tokensInstead` in `double` mode of the permanent, which names the tokens and makes no token of its own.
    const objects = event.args.what;
    if (objects?.kind !== 'noun') return failure(ability);
    const blocked = gate(ability, ['ability:replacement', 'replacement:tokensInstead']);
    if (blocked !== null) return blocked;
    const what = lowerFilter(objects);
    if (!what.ok) return what;
    const { zone, ...filter } = what.value;
    void zone;
    return built({ kind: 'tokensInstead', what: filter, mode: 'double' });
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
      mode:
        event.args.plusThatMany !== undefined
          ? 'plusThatMany'
          : event.args.plus === undefined
            ? 'thatMany'
            : 'plus',
      token: only.token,
    });
  }
  // Issue 102 (Dauthi Voidwalker, CR 614.1a, 122.1): "instead exile it with a void counter on it".
  if (event.verb === 'wouldExileInsteadOfOpponentGraveyard') {
    const blocked = gate(ability, [
      'ability:replacement',
      'replacement:exileInsteadOfOpponentGraveyard',
    ]);
    if (blocked !== null) return blocked;
    return built({ kind: 'exileInsteadOfOpponentGraveyard', counter: 'void' });
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
    // The Darkness Crystal (CR 614.1a, 119.1): "instead exile it and you gain 2 life".
    const life = event.args.life;
    if (life !== undefined) {
      if (life.kind !== 'number' || life.value < 1 || token !== undefined) return failure(ability);
      return built({ kind: 'wouldDie', what: filter, instead: 'exile', alsoGainLife: life.value });
    }
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
  // Issue 245 (Vivid Grove): "~ enters tapped with two charge counters on it." is the replacement that makes it enter tapped and the one that gives it counters.
  if (event.verb === 'entersTappedWithCounters') {
    if (event.condition !== undefined) return failure(ability);
    const count = event.args.count;
    const counter = event.args.counter;
    if (counter?.kind !== 'counterSpec' || count?.kind !== 'number') return failure(ability);
    const blocked = gate(ability, [
      'ability:replacement',
      'replacement:entersTapped',
      'replacement:entersWithCounters',
    ]);
    if (blocked !== null) return blocked;
    return {
      ok: true,
      value: [
        { kind: 'replacement', replacement: { kind: 'entersTapped' } },
        {
          kind: 'replacement',
          replacement: { kind: 'entersWithCounters', counter: counter.name, count: count.value },
        },
      ],
      rule: ability.rule,
    };
  }
  if (event.verb === 'entersWithCounters') {
    // The engine's replacement has no condition ("If ~ was kicked, it enters with ..."): read, not run.
    if (event.condition !== undefined) return failure(ability);
    const count = event.args.count;
    const counter = event.args.counter;
    if (counter?.kind !== 'counterSpec') return failure(ability);
    // "~ escapes with two +1/+1 counters on it" (D-482, CR 702.138c): the counters of a permanent that escaped, a fixed number of them.
    if (event.args.escapes?.kind === 'flag') {
      if (count?.kind !== 'number') return failure(ability);
      const blocked = gate(ability, ['ability:replacement', 'replacement:entersWithCounters']);
      if (blocked !== null) return blocked;
      return built({
        kind: 'entersWithCounters',
        counter: counter.name,
        count: count.value,
        ifEscaped: true,
      });
    }
    // "enters with X counters" (stage P16, D-103, CR 107.3m): the X of the spell the permanent came
    // from, so the card needs an {X} in its mana cost (`validateCard` checks it, CR 107.3g).
    if (count?.kind === 'x') {
      const blockedX = gate(ability, [
        'ability:replacement',
        'replacement:entersWithCounters',
        'amount:x',
      ]);
      if (blockedX !== null) return blockedX;
      return built({
        kind: 'entersWithCounters',
        counter: counter.name,
        count: count.times === undefined ? { kind: 'x' } : { kind: 'x', times: count.times },
      });
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
    // "where X is the total toughness of other creatures you control" (Towering Titan, CR 614.12, 208.1): the total or greatest of a stat over a group, read as it enters.
    if (count?.kind === 'aggregate') {
      const blocked = gate(ability, [
        'ability:replacement',
        'replacement:entersWithCounters',
        'amount:aggregate',
      ]);
      if (blocked !== null) return blocked;
      const counted = lowerAmount(count, newContext('ability', []), ability.rule);
      if (!counted.ok) return counted;
      if (typeof counted.value !== 'object' || counted.value.kind !== 'aggregate') {
        return failure(ability);
      }
      return built({ kind: 'entersWithCounters', counter: counter.name, count: counted.value });
    }
    // "equal to the number of creatures that died this turn" (issue 101, Bone Devourer, CR 614.12, 700.4): read from the turn's history as it enters.
    if (count?.kind === 'diedThisTurn') {
      const blocked = gate(ability, [
        'ability:replacement',
        'replacement:entersWithCounters',
        'amount:diedThisTurn',
      ]);
      if (blocked !== null) return blocked;
      const counted = lowerAmount(count, newContext('ability', []), ability.rule);
      if (!counted.ok) return counted;
      if (typeof counted.value !== 'object' || counted.value.kind !== 'diedThisTurn') {
        return failure(ability);
      }
      return built({ kind: 'entersWithCounters', counter: counter.name, count: counted.value });
    }
    // "for each other Zombie you control and each Zombie card in your graveyard" (issue 159): each count as it enters, added.
    if (count?.kind === 'sum') {
      const blocked = gate(ability, [
        'ability:replacement',
        'replacement:entersWithCounters',
        'amount:countOf',
        'amount:sum',
      ]);
      if (blocked !== null) return blocked;
      const counted = lowerAmount(count, newContext('ability', []), ability.rule);
      if (!counted.ok) return counted;
      if (typeof counted.value !== 'object' || counted.value.kind !== 'sum') {
        return failure(ability);
      }
      const parts: Extract<Amount, { kind: 'countOf' }>[] = [];
      for (const part of counted.value.of) {
        if (typeof part !== 'object' || part.kind !== 'countOf') return failure(ability);
        parts.push(part);
      }
      return built({
        kind: 'entersWithCounters',
        counter: counter.name,
        count: { kind: 'sum', of: parts },
      });
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
    // "enters with a +1/+1 counter on it for each color of mana spent to cast it" (Converge, CR 105.1, 601.2h, 614.12): the colors of the mana spent on the spell the permanent
    // came from, counted as it enters. Only the colors of the permanent itself ("it" or "~"), nothing of another spell.
    if (count?.kind === 'manaSpent') {
      if (count.colors !== true || (count.who !== 'it' && count.who !== 'self')) {
        return failure(ability);
      }
      const blocked = gate(ability, [
        'ability:replacement',
        'replacement:entersWithCounters',
        'amount:manaSpent',
      ]);
      if (blocked !== null) return blocked;
      return built({
        kind: 'entersWithCounters',
        counter: counter.name,
        count: { kind: 'manaSpent', colors: true },
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
  const lowered = lowerModes(ability, ctx, true);
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
  'keyword:reconfigure',
  'keyword:kicker',
  'keyword:multikicker',
  'keyword:typecycling',
  'keyword:toxic',
  'keyword:annihilator',
  'keyword:firebending',
  'keyword:afflict',
  'keyword:dredge',
  'keyword:mobilize',
  'keyword:fabricate',
  'keyword:partnerWith',
  'keyword:deckLimit',
  'keyword:companion',
  'keyword:bushido',
  'keyword:affinity',
  'keyword:flashback',
  'keyword:unearth',
  'keyword:encore',
  'keyword:eternalize',
  'keyword:embalm',
  'keyword:devour',
  'keyword:riot',
  'keyword:sunburst',
  'keyword:suspend',
  'keyword:storm',
  'keyword:gift',
  'keyword:livingWeapon',
  'keyword:jobSelect',
  'keyword:canBeCommander',
  'keyword:startYourEngines',
  'keyword:hideaway',
  'keyword:vanishing',
  'keyword:escalate',
  'keyword:replicate',
  'keyword:buyback',
  'keyword:offspring',
  'keyword:plot',
  'keyword:ninjutsu',
  'keyword:echo',
  'keyword:cumulativeUpkeep',
  'keyword:ward',
  'keyword:crew',
  'keyword:station',
  'keyword:enchant',
  'keyword:landwalk',
  'ability:replacement',
  'amount:x',
  'replacement:entersTapped',
  'replacement:entersWithCounters',
  'replacement:wouldDie',
  'replacement:exileInsteadOfOpponentGraveyard',
  'replacement:entersTappedUnlessPays',
  'replacement:entersTappedUnlessReveals',
  'replacement:asEntersChoose',
  'replacement:asEntersRemoveCounters',
  'replacement:entersAsCopy',
  'replacement:skipDraw',
  'replacement:keepOneLoyalty',
  'replacement:tokensInstead',
  'replacement:countersPlus',
  'replacement:damageBonus',
  'replacement:damageDouble',
  'replacement:drawInstead',
  'replacement:drawRedirect',
  'replacement:umbraArmor',
];
