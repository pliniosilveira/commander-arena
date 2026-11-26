/**
 * The tunable numbers of the HeuristicAgent (issue 624, phase 2): the board evaluator's constants and
 * the thresholds and margins of the `heuristic-*.ts` decisions, in one typed, readonly object. The agent
 * takes them in its options (`HeuristicAgentOptions.weights`) and hands them down to every function that
 * reads one; nothing here is module state. `DEFAULT_WEIGHTS` is the agent as it plays today, and
 * `withWeights` builds a variant from a partial override (what the benchmark's `--candidate-weights`
 * reads).
 *
 * Not weights: the numbers the Comprehensive Rules fix (21 commander damage, 10 poison, the maximum hand
 * size of seven), what a lost game is worth (`LOSS`), the time shares of the budget and the bounds of a
 * search (how many sets, sources or steps are tried).
 */

/** How one keyword adds to a creature of power p and toughness t: `base + power * p + toughness * t`. */
export interface KeywordWeight {
  readonly base: number;
  readonly power: number;
  readonly toughness: number;
}

export interface EvaluatorWeights {
  /** The most the life curve is worth (`cap * (1 - e^(-life / tau))`). */
  readonly lifeCap: number;
  /** How fast the life curve flattens, in life points. */
  readonly lifeTau: number;
  /** What a full commander damage clock costs (scaled by the square of the fraction to 21). */
  readonly commanderClock: number;
  /** What a full poison clock costs (scaled by the square of the fraction to 10). */
  readonly poisonClock: number;
  /** A token's share of the value of the same creature card. */
  readonly tokenFactor: number;
  /** A tapped creature's share of its value. */
  readonly tappedFactor: number;
  /** A summoning-sick creature's share of its value. */
  readonly sickFactor: number;
  /** What a full clock of power against the weakest opponent's life is worth. */
  readonly pressure: number;
  /** Each card in hand up to the maximum hand size. */
  readonly handCard: number;
  /** Each card in hand past the maximum hand size. */
  readonly handExtra: number;
  /** Each land up to `landsFull`. */
  readonly land: number;
  /** The land count past which a land is worth only `landExtra`. */
  readonly landsFull: number;
  /** Each land past `landsFull`. */
  readonly landExtra: number;
  /** Each permanent that is neither a creature nor a land. */
  readonly otherPermanent: number;
  /** A token's share of `otherPermanent`. */
  readonly otherTokenFactor: number;
  /** Each loyalty counter on a planeswalker. */
  readonly loyalty: number;
  /** A creature body's flat value. */
  readonly bodyBase: number;
  /** A creature body's value per point of power. */
  readonly bodyPower: number;
  /** A creature body's value per point of toughness left (damage marked counts against it). */
  readonly bodyToughness: number;
  /** The keywords the evaluator values, by the engine's keyword names. */
  readonly keywords: Readonly<Record<string, KeywordWeight>>;
}

export interface AttackWeights {
  /** An attack must beat staying home by this much. */
  readonly margin: number;
  /** The share of a crack-back's life loss that counts. */
  readonly crackWeight: number;
  /** The share of a lost game a lethal crack-back costs. */
  readonly crackLethalShare: number;
  /** What a crack-back that leaves the agent in danger adds. */
  readonly crackDanger: number;
  /** Points per life the opponent loses, at full urgency of the library clock. */
  readonly desperation: number;
  /** The library size at which an agent that decks first is at full urgency. */
  readonly urgentLibrary: number;
  /**
   * Combat look-ahead (`heuristic-combat-look.ts`, two players): "no attack" and the best two other attacks whose
   * score is within this many points of the best are played on to the start of the agent's next turn.
   */
  readonly lookMargin: number;
}

export interface BlockWeights {
  /** A block must beat not blocking by this much. */
  readonly margin: number;
  /**
   * Combat look-ahead (`heuristic-combat-look.ts`, two players): "no block" and the best two block plans whose
   * score is within this many points of the best are played on to the start of the agent's next turn.
   */
  readonly lookMargin: number;
}

export interface DangerWeights {
  /** A defender is in danger when this much life or less would be left. */
  readonly life: number;
  /** ... or this many poison counters would be on it. */
  readonly poison: number;
  /** ... or one commander would have dealt this much damage to it. */
  readonly commander: number;
}

export interface MainWeights {
  /** A trick, a window removal or a face-up turn must beat passing by this much. */
  readonly trickMargin: number;
  /** A play is dropped when its board delta is below minus this. */
  readonly deltaFloor: number;
  /** The commander at a high tax is not cast when the board score is below this. */
  readonly losing: number;
  /** A commander is valued as a creature plus this much. */
  readonly commanderBonus: number;
  /** The commander tax (CR 903.8) from which the commander is held back unless mana is spare. */
  readonly highTax: number;
  /** The commander at a high tax is cast only when the best set without it uses less than this share of the mana. */
  readonly spareShare: number;
  /** A removal spell's worth as a share of its best target's value. */
  readonly removalShare: number;
  /** A spell that is neither a creature nor removal: its flat worth. */
  readonly spellBase: number;
  /** ... and its worth per point of mana value. */
  readonly spellPerMana: number;
  /** A counterspell is cast only at a spell of at least this mana value. */
  readonly counterMinValue: number;
}

export interface PlanWeights {
  /** Another line of the turn planner must beat today's line by this much to replace it. */
  readonly margin: number;
  /** A threat category (`heuristic-threats.ts`) gets a scenario of its own from this chance that the opponent holds one. */
  readonly minThreatChance: number;
  /**
   * Against an aggro deck (`heuristic-profile.ts`), which taps out on its own turn, a counterspell, a trick or a flash
   * creature gets a scenario only from this many times `minThreatChance`: its open mana is respected less.
   */
  readonly aggroOpenMana: number;
  /** How much of the gap between a line's weighted mean and its worst scenario is taken off its value. */
  readonly riskAversion: number;
  /**
   * Selective deepening (two players only, `heuristic-plan-deep.ts`): the lines whose value is within this many
   * points of the best line's (today's line always) are played one turn further, to the start of the agent's
   * turn after next. The more, the more lines are looked at and the more work it costs.
   */
  readonly deepMargin: number;
  /**
   * How much the deeper value counts in a deepened line's value: `(1 - deepBlend) * v1 + deepBlend * v2`, with
   * v1 the value to the next turn and v2 the value to the turn after. 0 turns the deepening off.
   */
  readonly deepBlend: number;
}

export interface RemovalWeights {
  /** The opposing commander is taken first when its value is at least this share of the best target's. */
  readonly nearEqual: number;
  /** A planeswalker target's flat value. */
  readonly walkerBase: number;
  /** ... and its value per loyalty counter. */
  readonly walkerLoyalty: number;
}

export interface ThreatWeights {
  /** A trade with an opposing commander is worth this much more than its body: it comes back (CR 903.9a). */
  readonly commander: number;
  /** An opposing commander whose next hit brings the agent to 21 commander damage (CR 903.10a) is worth this much more. */
  readonly lethal: number;
}

export interface ProtectionWeights {
  /** A protection play must beat passing by this much. */
  readonly margin: number;
  /** A commander is worth this much more than a creature of its value. */
  readonly commanderBonus: number;
  /** What a permanent that is not a creature is worth next to a creature. */
  readonly permanentValue: number;
  /** A creature is worth holding protection mana for from this value. */
  readonly saveValue: number;
}

export interface MulliganWeights {
  /** The fewest lands of a hand that is kept. */
  readonly minLands: number;
  /** The most lands of a hand that is kept. */
  readonly maxLands: number;
}

export interface AgentWeights {
  readonly evaluator: EvaluatorWeights;
  readonly attacks: AttackWeights;
  readonly blocks: BlockWeights;
  readonly danger: DangerWeights;
  readonly main: MainWeights;
  readonly plan: PlanWeights;
  readonly removal: RemovalWeights;
  readonly threat: ThreatWeights;
  readonly protection: ProtectionWeights;
  readonly mulligan: MulliganWeights;
}

/** A partial override of `AgentWeights`, at any depth. */
export type PartialWeights = {
  readonly [K in keyof AgentWeights]?: {
    readonly [F in keyof AgentWeights[K]]?: AgentWeights[K][F] extends number
      ? number
      : { readonly [Kw: string]: Partial<KeywordWeight> };
  };
};

const keyword = (base: number, power: number, toughness = 0): KeywordWeight => ({
  base,
  power,
  toughness,
});

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const v of Object.values(value)) deepFreeze(v);
    Object.freeze(value);
  }
  return value;
}

/** The weights of the agent as it plays today. */
export const DEFAULT_WEIGHTS: AgentWeights = deepFreeze({
  evaluator: {
    lifeCap: 36,
    lifeTau: 18,
    commanderClock: 30,
    poisonClock: 24,
    tokenFactor: 0.6,
    tappedFactor: 0.8,
    sickFactor: 0.9,
    pressure: 10,
    handCard: 1.2,
    handExtra: 0.2,
    land: 1.5,
    landsFull: 8,
    landExtra: 0.3,
    otherPermanent: 1,
    otherTokenFactor: 0.5,
    loyalty: 0.3,
    bodyBase: 1,
    bodyPower: 0.8,
    bodyToughness: 0.6,
    keywords: {
      flying: keyword(0.5, 0.4),
      menace: keyword(0.3, 0.25),
      trample: keyword(0.2, 0.2),
      firstStrike: keyword(0.3, 0.3),
      doubleStrike: keyword(0.5, 0.9),
      deathtouch: keyword(1.2, 0.15),
      lifelink: keyword(0.3, 0.5),
      hexproof: keyword(1, 0),
      indestructible: keyword(1.5, 0.25, 0.25),
      vigilance: keyword(0.2, 0.1),
      haste: keyword(0.3, 0.1),
      reach: keyword(0.3, 0),
    },
  },
  attacks: {
    margin: 0.05,
    crackWeight: 0.5,
    crackLethalShare: 0.4,
    crackDanger: 3,
    desperation: 1,
    urgentLibrary: 14,
    lookMargin: 3,
  },
  blocks: { margin: 0.05, lookMargin: 3 },
  danger: { life: 6, poison: 7, commander: 15 },
  main: {
    trickMargin: 0.5,
    deltaFloor: 0.5,
    losing: -8,
    commanderBonus: 4,
    highTax: 4,
    spareShare: 0.5,
    removalShare: 0.8,
    spellBase: 1,
    spellPerMana: 0.8,
    counterMinValue: 2,
  },
  plan: {
    margin: 0.5,
    minThreatChance: 0.1,
    aggroOpenMana: 2,
    riskAversion: 0.25,
    deepMargin: 1.5,
    deepBlend: 0.5,
  },
  removal: { nearEqual: 0.8, walkerBase: 6, walkerLoyalty: 0.6 },
  threat: { commander: 2, lethal: 20 },
  protection: { margin: 0.5, commanderBonus: 4, permanentValue: 3, saveValue: 6 },
  mulligan: { minLands: 2, maxLands: 5 },
});

const isRecord = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);

/** `base` with `override` merged in; a key `base` does not have, or a value of another shape, throws. */
function merge(base: unknown, override: unknown, path: string): unknown {
  if (override === undefined) return base;
  if (typeof base === 'number') {
    if (typeof override !== 'number' || !Number.isFinite(override)) {
      throw new Error(`weights: ${path} must be a finite number`);
    }
    return override;
  }
  if (!isRecord(base) || !isRecord(override)) throw new Error(`weights: ${path} must be an object`);
  for (const key of Object.keys(override)) {
    if (!Object.hasOwn(base, key)) throw new Error(`weights: unknown field ${path}.${key}`);
  }
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(base)) {
    out[key] = merge(value, override[key], `${path}.${key}`);
  }
  return out;
}

/**
 * `DEFAULT_WEIGHTS` (or `base`) with `partial` merged in at every depth; neither input is changed. An
 * unknown field or a value that is not a finite number throws, so a typo in a weights file is not
 * silently ignored.
 */
export function withWeights(
  partial: PartialWeights,
  base: AgentWeights = DEFAULT_WEIGHTS,
): AgentWeights {
  return deepFreeze(merge(base, partial, 'weights') as AgentWeights);
}
