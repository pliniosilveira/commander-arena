# Design: parser architecture for scalable card support

IMPLEMENTED. Decisions D-063 to D-069 in `docs/DECISIONS.md` record what was built (the two-stage parser, parser stages P0 onward); `docs/ARCHITECTURE.md`, "Parser pipeline", describes the code as it is. Kept as the design record; where it and the code differ, the code and the decisions win.

Status: APPROVED 2026-10-21 by the owner ("approve all, with 7 earlier"), with two amendments recorded in D-063: boolean combinators in conditions and object filters from P0, and Flash, hexproof and shroud in the keyword slice (see the first corpus run, an analysis note removed in the docs cleanup), not S3. Decisions D-063 to D-069 in `docs/DECISIONS.md`. Raised after the owner's first real deck import (77 of 100 cards unsupported; the analysis note of that deck was removed in the docs cleanup) and the worry "the parser is not scalable; I do not want to request hundreds of individual cards". Planning only; no source file changes. Companion documents: `scaling-card-support.md` (APPROVED, engine slices S1 to S6) and `triggered-abilities.md` (APPROVED, slice S2, in progress).

Oracle texts quoted below for cards other than Korvold are written from memory to illustrate the pipeline. They are not data: every golden fixture must come from Scryfall text the owner exports (section 5), and the Korvold text is the one in `card-requests/done/2026-10-21-korvold-fae-cursed-king.json`.

## 0. Recommendation in one paragraph

Keep the M4 combinator kit as the phrase-level parsing tool and stop writing whole-ability rules on it. Put a typed intermediate representation (the "clause IR") between the text and the engine AST: a segmenter splits an ability into its skeleton (trigger, costs, condition, sentences, clauses, modal bullets, restrictions), small phrase rules fill each slot (one family per slot: trigger, cost, effect verb, noun phrase, amount, duration, condition, keyword), a binding pass resolves `it`, `that creature`, `those cards`, `target ...` to ids, and a separate lowering step turns IR into engine `Ability` and `SpellText` nodes while checking `SUPPORTED_FEATURES`. The grammar then grows per vocabulary item (one rule per new verb or noun), not per combination, and a card can be reported as "recognised but not runnable: needs `effect:createToken`", which is what the backlog needs to tell grammar gaps from engine gaps. Overrides keyed by `oracle_id`, pinned to the Oracle text they were written for, cover the long tail. No new dependency, no grammar DSL.

## 1. Diagnosis: why the M4 framework as written does not scale

The M4 framework (`packages/cards/src/convert/parser/`) is sound where it is small: normalization, splitting into abilities, "consume the whole ability or report where you stopped", stable rule ids, `SUPPORTED_FEATURES` as the gate. The problem is the unit of a rule: a `GrammarRule` is a parser for a whole ability that builds `Ability[]` inline (`keyword.line`, `mana.tap-add`, and the trigger rule ids proposed in `triggered-abilities.md`: `trigger.enters-or-attacks`, `effect.sacrifice-another-permanent`).

State of the working tree on 2026-10-21 (the GRAMMAR agent's S1 work, uncommitted, read for this plan): `parser/effects/` already splits the spell grammar into phrase-level parts (`amounts.ts`, `objects.ts`, `players.ts`, `refs.ts`, `clauses.ts`, `draft.ts`, `spell-text.ts`), `combinators.ts` gained `named()` so a failure reports the innermost named part (`spell.destroy`) rather than the whole rule, and `EffectDraft` defers target numbering until the whole text is read. That is two thirds of the way to this design, and this plan keeps it. What it still lacks, by its own doc comment in `spell-effect.ts`: modal text, "up to", anaphora ("It", "that creature"), conditions, "may", disjunctions, tokens, search, discard, +N/+N; and structurally: a representation of meaning separate from the AST building, a binding pass, and the distinction between "not recognised" and "recognised but the engine cannot run it" (`CLAUSES` filters by `SUPPORTED_FEATURES.effectKinds` at inclusion time, so a sentence with `create a Treasure token` is reported as unrecognised text, not as a missing engine feature). Measured against the 77 cards:

| Concern | What the 77 cards contain (my reading, not machine output) | What happens with whole-ability rules |
| --- | --- | --- |
| Composition trigger x effect x target x duration | 41 trigger cards use about 13 trigger shapes (enters, attacks, enters-or-attacks, dies, another creature you control dies, you sacrifice, a player sacrifices, landfall, your upkeep, you cast, becomes the target, end step, deals combat damage) and about 20 effect shapes (create N tokens, +1/+1 counter, draw, damage to any target, sacrifice, search, gain life, exile graveyard, ...) | Rules multiply: 13 x 20 whole rules for this deck alone, 260 rules, each one a new file. With phrase rules the same coverage is 13 + 20 rules, and every new effect unlocks every trigger at once. |
| Reference resolution | About 25 to 30 of the 77 use `it`, `that player`, `those cards`, `them`, `the other`, `another` (every fetch land, Cultivate, Farseek, Harrow, Farhaven Elf, Lavalanche, Tear Asunder, Atsushi, ...) | Nothing in the framework binds pronouns. Each rule would hand-write `{ kind: 'target', id: 't1' }` and remember by itself what `it` was. A7 (D-007) requires every pronoun bound to an antecedent; that needs one binding pass over a structure, not per-rule discipline. |
| Diagnostics | The support loop needs "which slot is missing": for `When ~ enters, exile target player's graveyard.` the useful report is "trigger recognised, effect `exile <noun>` recognised, noun `target player's graveyard` not recognised" | `named()` now reports the innermost named part that got farthest (`spell.exile`), which is the right idea, but it names one part, not the slot family being filled, nor the parts that succeeded before it. Grouping by `templateOf` then still puts "the effect vocabulary is missing" and "the noun is missing" in the same bucket. |
| Recognised versus runnable | 19 token cards, 19 search cards, 13 static cards are shapes the grammar could read today but the engine cannot run | The gates are `validateCard` after the AST is built, and inclusion-time filters (`keyword.line` by `keywordKinds`, `CLAUSES` by `effectKinds`). A filtered-out shape is reported as unrecognised text. There is no way to say "understood, engine feature X missing", so the backlog cannot separate engine work from grammar work, which is the ranking `scaling-card-support.md` depends on. |
| Ambiguity | Oracle text is close to unambiguous, but rules overlap (`{T}: Add {G}.` is a mana ability and also an activated ability; `Sacrifice a creature: ...` is a cost, `sacrifice a creature.` an effect) | `matchAbility` returns the first rule in `DEFAULT_RULES` that consumes everything. A later rule that also matches is silently shadowed; nothing detects it. Order becomes a hidden semantic. |
| Backtracking and cost | 30,000 cards, about 75,000 ability lines | Every rule is tried on every line from position 0. Cheap today (2 rules), linear in the number of rules later (300 rules x 75k lines is still fine, about 20 M attempts, most failing at the first literal), so performance is not the reason to change. Exponential backtracking is impossible as long as `choice` stays ordered and there is no unbounded `many(choice(...))` of overlapping items; that must stay a rule of the kit. |
| Numbers, X, "where X is", "up to", "each", "other than", "you may", "if you do", "instead", "until end of turn", "as long as", modal bullets, costs, activation restrictions, em-dash ability words, reminder text, delayed and reflexive triggers | All present in the 77 (4 modal, 4 additional-cost, at least 8 "you may", 4 "enters tapped", `Landfall —` on Tireless Provisioner and Scute Swarm, delayed "until the end of your next turn" on Atsushi, reflexive "when you do" on Thrakkus-like cards) | Each is a slot modifier that applies to any clause. In a whole-ability rule each modifier doubles the number of rules that must know about it. In an IR they are fields on `IrClause` (`optional`, `condition`, `duration`) parsed once by the segmenter. |

The engine, not the grammar, is the first limit for 49 of the 77 (`scaling-card-support.md` is right). But the grammar is the second limit, and it is structural: without an IR, the slices S2 to S6 would each produce a crop of whole-ability rules that cannot be reused by the next slice. The time to fix this is now, while two rules exist.

What the M4 framework and the S1 work get right and this design keeps unchanged: `normalizeOracleText` and `splitAbilities`, the combinator kit with `farthest` tracking and `named()`, the phrase parts in `effects/` (noun phrases with filters, player subjects, amounts, clause verbs), `EffectDraft` as the way target ids are numbered after the whole text is read, `GrammarRule.id` stability, `importCard`'s contract (`{definition, support}`), `UnparsedAbility`'s existing fields, the fixture-as-override verification in `override.ts`, `PARSER_VERSION` and the support cache, `templateOf`, and `tools/corpus/` with its baseline check.

## 2. Alternatives

| Criterion | (a) Extend combinators, whole-ability rules | (b) Declarative grammar (PEG or Earley) in a DSL | (c) Segmenter + clause IR + typed lowering (recommended) | (d) Template tables with slots | (e) Per-card AST overrides by an agent |
| --- | --- | --- | --- | --- | --- |
| Effort to 60% of top 500 | High: combinations written out by hand; realistic estimate 300+ rules | Medium-high: a PEG engine in TypeScript is 1 to 2 sessions, an Earley engine 2 to 3; then the grammar; then a typed-action layer because a DSL's actions are strings | Medium: 2 sessions for the skeleton, then about 60 to 80 phrase rules and 25 lowerings | Low at first, then explodes: each combination is a row; "unless", "you may", durations multiply rows | Linear in cards: about 0.3 session per card, 300 cards = 90 sessions |
| Marginal cost per new template | One rule per combination (file, parser, AST building, tests) | One production per vocabulary item if the grammar is factored; same as (c) but in a second language | One phrase rule (10 to 30 lines, examples inline) or one lowering (one engine node) | One row, until the row needs a modifier the table cannot express | One file per card, never amortised |
| Diagnostics | Position and whole-rule id | PEG: farthest failure; Earley: the set of expected symbols at the failure point (best of all) | Slot (family) at the failure point, rules recognised before it, and "recognised, needs engine feature X" | Poor: no row matched, whole text | None (the override exists or not) |
| Ambiguity control | Ordered choice, shadowing undetected | PEG: ordered, same issue; Earley: all parses enumerated, then a disambiguation policy is needed | Ordered choice inside a family plus a meta test: every golden example must match exactly one rule of its family | Overlapping rows undetected | n/a |
| Performance | Linear in rules x lines | PEG linear with memoization; Earley O(n^3) worst case, fine for 60-character sentences but a packed forest per line | Linear: segmenter is one pass; phrase rules dispatched by family and first word | Linear | n/a |
| Testability | Per rule, whole examples | Per production; grammar files are easy to diff | Per phrase rule (golden examples inside the rule), IR snapshots, lowering unit tests, corpus snapshot | Per row | Scenario test per card |
| Maintainability by an agent in short sessions | Medium: one more combination file each time; ordering is tribal knowledge | Low-medium: a second language, a build step, and semantic actions that TypeScript cannot type-check | High: a new rule is a small typed TypeScript object with its examples beside it; the compiler checks the IR it yields | High until rows conflict | High per card, but the knowledge does not accumulate (SPEC 8.1 is violated) |
| Risk of silently wrong semantics | Medium: AST built inline inside each rule; gate only at `validateCard` | Medium: actions are the same inline AST building | Low: IR is meaning, lowering is one place per engine node, gated by `needs`; an unbound pronoun is a hard failure | High: the same slot lowered differently per row | High: hand-written ASTs are where subtle mistakes live; mitigated by text pinning and scenario tests |
| New dependency | No | Yes, or 1 to 3 sessions to write one; needs a D-entry | No | No | No |

Honest note on (a) versus (c): disciplined use of (a) with phrase parsers and a structure between them is (c). The difference is making the IR explicit, typed and tested, so that the discipline is enforced by the compiler and the meta tests rather than by review. (b) is the right choice for a language with real ambiguity; Oracle text is written by Wizards' templating to be unambiguous, so a chart parser buys enumeration we do not need and costs a DSL the agent must learn. (d) is used in (c) for leaf vocabulary only: keyword names, predefined tokens (CR 111.10), counter names, card types, number words. (e) is the long tail, section 6, and never the primary mechanism.

Decision asked of the owner: approve (c).

## 3. The recommended architecture

### 3.1 Pipeline

```text
Oracle text (per face)
  │ normalizeOracleText (kept) + ability-word prefix stripped (CR 207.2c), "enters the battlefield" → "enters"
  ▼
ability lines (splitAbilities, kept; bullets stay with "Choose one —")
  │ segment()                      skeleton only, no vocabulary
  ▼
AbilitySkeleton { head: keyword | triggered | activated | static | spell | modal | replacement, slots with spans }
  │ phrase rules per family       trigger, cost, effect, noun, amount, duration, condition, keyword, static, token
  ▼
IrAbility (typed, spans, rule ids on every node)
  │ bind()                        ~, target..., it, that creature, those cards, that player → ids
  ▼
bound IrAbility                   or Diagnostic { reason: 'unrecognised' | 'unboundReference' | 'ambiguous' }
  │ lower()                       one lowering per IR verb or node, each declaring needs: FeatureRef[]
  ▼
Ability[] | SpellText              or Diagnostic { reason: 'notRunnable', needs: [...] }
  │ validateCard (engine, kept)
  ▼
support status: supported | unsupported, with UnparsedAbility v2 per failed ability
```

Every stage is pure and deterministic; the same code runs in the browser (deck import) and in Node (corpus tools).

### 3.2 File layout

```text
packages/cards/src/convert/
  import-card.ts                   unchanged contract; calls parser/parse-face.ts
  override.ts                      OverrideRegistry interface (kept) + composition with overrides/
  overrides/
    index.ts                       createOracleIdRegistry(), DEFAULT_OVERRIDES = fixtures then oracle-id
    define.ts                      defineOverride() with text pinning
    cards/<slug>.ts                one file per override (section 6)
  parser/
    combinators.ts                 kept; add optional(), many1(), word(), lookahead(), notFollowedBy()
    normalize.ts                   kept; add ability-word stripping and the "enters the battlefield" compat map
    segment.ts                     ability line → AbilitySkeleton (section 3.4)
    ir/types.ts                    the IR (section 3.3)
    ir/bind.ts                     reference resolution (section 3.7)
    rules/registry.ts              defineRule(), RuleFamily, index by family and first word
    rules/trigger/*.ts             trigger.enters, trigger.dies, trigger.attacks, trigger.sacrifice, ...
    rules/cost/*.ts                cost.mana, cost.tap, cost.sacrifice, cost.discard, ...
    rules/effect/*.ts              effect.draw, effect.destroy, effect.create-token, effect.search, ...
    rules/noun/*.ts                noun.self, noun.target, noun.each, noun.a, noun.anaphor, noun.player, ...
    rules/amount/*.ts              amount.number, amount.x, amount.count-of, amount.power-of
    rules/duration/*.ts, rules/condition/*.ts, rules/keyword/*.ts, rules/static/*.ts, rules/token/*.ts
    parse-ability.ts               skeleton + rules → IrAbility | Diagnostic
    parse-face.ts                  kept name; now parse + bind + lower per line
    diagnostics.ts                 UnparsedAbility v2 builder (section 3.6)
  lower/
    features.ts                    FeatureRef, isRunnable(), needs checking against SUPPORTED_FEATURES
    index.ts                       lower(IrAbility, ctx) → LowerResult<Ability[] | SpellText>
    effects.ts, triggers.ts, costs.ts, nouns.ts, amounts.ts, keywords.ts, statics.ts, tokens.ts
  template.ts                      kept; templateOf() refined by slot (section 5)
packages/cards/test/parser/        golden tests per family; ir-snapshots; corpus snapshot
packages/cards/test/fixtures/corpus/golden.jsonl, golden.expected.json
```

Each file stays under about 400 lines; a family that outgrows one file splits by verb group.

Where the S1 work lands in this layout (a move, not a rewrite): `effects/objects.ts` → `rules/noun/` (its `permanentPhrase`, `graveyardPhrase`, `targetPhrase`, `massPhrase` are the `noun.target`, `noun.each`, `noun.card-filter` rules, yielding `IrNoun` instead of `Ref<ObjectSelector>`); `effects/players.ts` → `rules/noun/players.ts` and `rules/effect/player-verbs.ts`; `effects/amounts.ts` → `rules/amount/`; `effects/clauses.ts` → `rules/effect/` with each `named('spell.destroy', ...)` becoming `defineRule({ id: 'effect.destroy', ... })` (ids lose the `spell.` prefix because the same verbs serve triggered and activated bodies); `effects/draft.ts` and `refs.ts` → `lower/draft.ts`: the lowering produces `EffectDraft`s and `finishSpell`/`finishAbility` number the targets, exactly as today. `GrammarRule` and `SpellRule` collapse into the skeleton heads of the segmenter: an instant or sorcery face has a `spell` head, a permanent face never does.

### 3.3 IR types (`parser/ir/types.ts`)

```ts
/** Character offsets into the normalized ability text. Every node carries one for diagnostics. */
export interface Span {
  readonly start: number;
  readonly end: number;
}

interface IrNode {
  readonly span: Span;
  /** The stable id of the phrase rule that produced this node ('effect.draw'). */
  readonly rule: string;
}

export type RuleFamily =
  | 'trigger' | 'cost' | 'effect' | 'noun' | 'amount' | 'duration'
  | 'condition' | 'keyword' | 'static' | 'token' | 'restriction' | 'replacement';

/** A noun phrase, before engine resolution: who or what a clause acts on. */
export interface IrNoun extends IrNode {
  readonly kind: 'noun';
  readonly det:
    | 'self'            // ~
    | 'target'          // target creature, up to two target lands, target player
    | 'each'            // each creature, all creatures, each opponent
    | 'a'               // a creature (the acting player chooses: "sacrifice a creature")
    | 'anaphor'         // it, that creature, that player, those cards, them, the other
    | 'you' | 'eachPlayer' | 'eachOpponent'
    | 'controllerOf' | 'ownerOf'   // its controller, that card's owner (with `of`)
    | 'enchanted' | 'equipped'     // enchanted creature, equipped creature
    | 'triggerSubject' | 'triggerActor'; // filled by bind for "it" inside a trigger body
  readonly filter: IrFilter;
  readonly count?: IrAmount;      // "up to two", "X", "one or more"
  readonly upTo: boolean;
  readonly plural: boolean;
  readonly other: boolean;        // another, other than ~
  readonly of?: IrNoun;           // "target player's graveyard" → of = target player
  /** Set by bind(): 't1' for targets, 'b1' for bound results, 'trig' for the trigger subject. */
  readonly ref?: string;
}

export interface IrFilter {
  readonly types?: readonly string[];
  readonly notTypes?: readonly string[];
  readonly supertypes?: readonly string[];
  readonly subtypes?: readonly string[];
  readonly colors?: readonly string[];
  readonly controller?: 'you' | 'opponent' | 'any' | { readonly noun: IrNoun };
  readonly zone?: 'battlefield' | 'graveyard' | 'library' | 'hand' | 'exile' | 'stack';
  readonly card?: boolean;        // "land card" (in a non-battlefield zone) vs "land"
  readonly token?: boolean;
  readonly tapped?: boolean;
  readonly powerAtLeast?: IrAmount;
  readonly stackKind?: 'spell' | 'ability';
  /** The words the filter was read from, for diagnostics and templateOf. */
  readonly raw: string;
}

export type IrAmount =
  | { readonly kind: 'number'; readonly value: number; readonly span: Span }
  | { readonly kind: 'x'; readonly span: Span }
  | { readonly kind: 'countOf'; readonly of: IrNoun; readonly span: Span }     // "for each creature you control"
  | { readonly kind: 'powerOf'; readonly of: IrNoun; readonly span: Span };

export interface IrDuration extends IrNode {
  readonly kind: 'duration';
  readonly scope: 'untilEndOfTurn' | 'untilYourNextTurn' | 'untilEndOfNextTurn' | 'asLongAs' | 'thisTurn';
  readonly condition?: IrCondition;    // "for as long as you control a Dragon"
}

export interface IrCondition extends IrNode {
  readonly kind: 'condition';
  readonly test:
    | { readonly kind: 'control'; readonly noun: IrNoun; readonly atLeast?: IrAmount }  // if you control six or more lands
    | { readonly kind: 'didPrevious' }                                                     // if you do
    | { readonly kind: 'unlessPays'; readonly who: IrNoun; readonly cost: readonly IrCost[] }
    | { readonly kind: 'cardsInGraveyard'; readonly who: IrNoun; readonly atLeast: IrAmount } // threshold
    | { readonly kind: 'raw'; readonly text: string };   // recognised as a condition, not understood
}

export type IrCost = IrNode & (
  | { readonly kind: 'mana'; readonly symbols: readonly string[] }
  | { readonly kind: 'tap' } | { readonly kind: 'untap' }
  | { readonly kind: 'sacrifice'; readonly what: IrNoun }
  | { readonly kind: 'payLife'; readonly amount: IrAmount }
  | { readonly kind: 'discard'; readonly what: IrNoun }
  | { readonly kind: 'exile'; readonly what: IrNoun }
  | { readonly kind: 'removeCounters'; readonly counter: string; readonly amount: IrAmount }
);

/** One instruction: a verb with named arguments, plus the modifiers that apply to any verb. */
export interface IrClause extends IrNode {
  readonly kind: 'clause';
  readonly verb: string;   // 'draw' | 'destroy' | 'exile' | 'createToken' | 'search' | 'dealDamage' | 'addCounters' | ...
  readonly args: Readonly<Record<string, IrArg>>;
  readonly optional: boolean;            // "you may"
  readonly condition?: IrCondition;      // "if you control ...", "if you do", "unless ..."
  readonly duration?: IrDuration;        // "until end of turn"
  readonly connector?: 'and' | 'then';   // how it joins the next clause
}

export type IrArg = IrNoun | IrAmount | IrToken | IrCounterSpec | IrManaSpec | IrZoneSpec | IrQuotedAbility | IrDestinationList;

export interface IrToken extends IrNode {
  readonly kind: 'token';
  readonly predefined?: 'Treasure' | 'Food' | 'Clue' | 'Map' | 'Blood';   // CR 111.10
  readonly power?: number; readonly toughness?: number;
  readonly colors?: readonly string[]; readonly types?: readonly string[]; readonly subtypes?: readonly string[];
  readonly abilities?: readonly IrQuotedAbility[];     // 'with "..."' and keyword lists
  readonly count: IrAmount;
}

/** A nested ability in quotes, parsed by the same pipeline (Goldspan's grant, token abilities). */
export interface IrQuotedAbility extends IrNode { readonly kind: 'quoted'; readonly ability: IrAbility }

export interface IrSentence extends IrNode { readonly kind: 'sentence'; readonly clauses: readonly IrClause[] }
export interface IrBody extends IrNode { readonly kind: 'body'; readonly sentences: readonly IrSentence[] }

export interface IrTrigger extends IrNode {
  readonly kind: 'trigger';
  readonly event: string;             // 'enters' | 'dies' | 'attacks' | 'sacrifice' | 'landfall' | 'upkeep' | 'cast' | 'becomesTarget' | ...
  readonly subject?: IrNoun;          // what enters, dies, attacks ("~", "another creature you control")
  readonly actor?: IrNoun;            // who does it ("you sacrifice", "a player sacrifices")
  readonly args: Readonly<Record<string, IrArg>>;
  readonly alternatives?: readonly IrTrigger[];   // "enters or attacks": one ability, two events (CR 603.2c)
}

export interface IrRestriction extends IrNode {
  readonly kind: 'restriction';
  readonly timing?: 'sorcery';          // Activate only as a sorcery.
  readonly perTurn?: number;            // Activate only once each turn.
}

export interface IrStatic extends IrNode {
  readonly kind: 'static';
  readonly subject: IrNoun;             // enchanted creature, creatures you control, Treasures you control
  readonly effects: readonly IrStaticEffect[];
  readonly condition?: IrCondition;     // as long as ...
}
export type IrStaticEffect =
  | { readonly kind: 'pt'; readonly power: number; readonly toughness: number }
  | { readonly kind: 'grantKeyword'; readonly keyword: string; readonly params?: readonly IrArg[] }
  | { readonly kind: 'grantAbility'; readonly ability: IrQuotedAbility }
  | { readonly kind: 'cantBeBlocked' } | { readonly kind: 'noMaxHandSize' }
  | { readonly kind: 'raw'; readonly text: string };

export type IrAbility = IrNode & (
  | { readonly kind: 'keyword'; readonly name: string; readonly params: readonly IrArg[] }
  | { readonly kind: 'triggered'; readonly trigger: IrTrigger; readonly interveningIf?: IrCondition; readonly body: IrBody }
  | { readonly kind: 'activated'; readonly costs: readonly IrCost[]; readonly body: IrBody; readonly restrictions: readonly IrRestriction[] }
  | { readonly kind: 'static'; readonly statement: IrStatic }
  | { readonly kind: 'replacement'; readonly event: IrClause; readonly instead: IrBody }   // "If ~ would ..., instead ..."
  | { readonly kind: 'spell'; readonly body: IrBody }
  | { readonly kind: 'modal'; readonly choose: { readonly min: number; readonly max: number }; readonly modes: readonly IrBody[] }
);
```

Design rules for the IR: it describes what the text says, never how the engine runs it (no `TargetSpec`, no `ObjectRef`); every node has a span and a rule id; `raw` variants exist only so a recognised-but-not-understood piece can be reported precisely, and lowering always rejects them.

### 3.4 Segmenter (`parser/segment.ts`)

The segmenter knows no vocabulary. It recognises the skeleton of an ability from a short list of signals and hands each slot's span to the right rule family:

- `^When |^Whenever |^At ` → triggered; the trigger slot ends at the first `, ` not inside a noun phrase; an `if ...,` immediately after the trigger is the intervening-if (CR 603.4 (Handling Triggered Abilities)); the rest is the body.
- `^(cost list): ` where the cost list contains `{`, `Sacrifice`, `Discard`, `Pay`, `Remove`, `Exile` → activated; trailing sentences `Activate only ...` are restrictions.
- `^Choose (one|two|one or both|any number) —` followed by bullet lines → modal; each bullet is a body. "Choose one. If ..." and "Choose one or more" forms are added when the corpus shows them.
- A sentence containing ` would ` and ` instead` → replacement (CR 614.1a (Replacement Effects)); `~ enters tapped.` and `~ enters with N ... counters` are replacement heads by table.
- A line that is a comma-separated list of known keyword words (from the keyword family's vocabulary) → keyword line. A keyword with parameters (`Ward {2}`, `Equip {1}`, `Enchant creature`, `Protection from red`) is one keyword ability.
- `<Subject> (gets|has|have|can't|don't|costs) ...` → static.
- Otherwise → spell body (instants and sorceries), or static if the face is a permanent (the owner of the skeleton is passed in from the face's types).
- Bodies split into sentences on `. ` outside quotes, sentences into clauses on `, then `, ` and `, `, and ` when both sides start with an effect verb, with `you may` and `if ...` as clause prefixes and `until end of turn` as a clause suffix.

An em-dash ability word (`Landfall — Whenever ...`, CR 207.2c (Text Box)) is stripped by `normalize.ts` using the list of ability words copied from CR 207.2c with its rule number in a comment; the list is data from the CR file, not invented. The 2024 templating change (`enters the battlefield` → `enters`) is a compatibility map in `normalize.ts`, tested with both spellings as SPEC 7.2 asks.

### 3.5 Rule registration API (`parser/rules/registry.ts`)

```ts
import type { Parser } from '../combinators';

export interface PhraseRule<T> {
  /** Stable id, `<family>.<name>`; renaming needs a PARSER_VERSION bump and a note. */
  readonly id: string;
  readonly family: RuleFamily;
  /** First words that can start a match, for dispatch; [] means "try always". */
  readonly leading: readonly string[];
  readonly parse: Parser<T>;
  /** Golden examples: each must parse completely with this rule and with no other rule of the family. */
  readonly examples: readonly string[];
  /** Texts this rule must NOT consume completely (shapes a neighbouring rule owns, or not yet supported). */
  readonly rejects?: readonly string[];
  /** CR citations for the reading this rule encodes, by number and title. */
  readonly cites: readonly string[];
}

export function defineRule<T>(rule: PhraseRule<T>): PhraseRule<T>;

export interface RuleSet {
  readonly byFamily: ReadonlyMap<RuleFamily, readonly PhraseRule<unknown>[]>;
  /** The rule of a family to try at a position: those whose `leading` matches the next word, then the "always" ones. */
  candidates(family: RuleFamily, text: string, pos: number): readonly PhraseRule<unknown>[];
}

export function buildRuleSet(rules: readonly PhraseRule<unknown>[]): RuleSet;
```

`defineRule` wraps `parse` in `named(id, ...)`, so the existing innermost-rule diagnostics keep working, and records the family so `slot()` can report which family was being filled. A family parser (`parseFamily(family, ctx, pos)`) tries the candidates in registration order and returns the first complete match of the slot; the meta test (section 5) proves that for every golden example exactly one rule of its family matches, so order never carries meaning. Worked example, the effect verb Korvold needs:

```ts
// parser/rules/effect/counters.ts
export const EFFECT_ADD_COUNTERS = defineRule<IrClause>({
  id: 'effect.add-counters',
  family: 'effect',
  leading: ['put'],
  cites: ['CR 122.6 (Counters)'],
  examples: [
    'put a +1/+1 counter on ~',
    'put two +1/+1 counters on target creature',
    'put a -1/-1 counter on each creature you control',
    'put X +1/+1 counters on it',
  ],
  rejects: ['put a card from your hand onto the battlefield'],   // owned by effect.put-onto-battlefield
  parse: clause('addCounters', seq(
    lit('put '), slot('count', amount.articleOrNumber),
    slot('counter', counterSpec), lit(' on '), slot('objects', noun.any),
  )),
});
```

`clause(verb, parser)` wraps a sequence into an `IrClause` with the named slots and the span; `slot(name, familyParser)` records the family being filled, which is what the diagnostic reports when the slot fails.

### 3.6 Lowering, feature gating and the diagnostic format

```ts
// lower/features.ts
export type FeatureRef =
  | `ability:${Ability['kind']}` | `effect:${string}` | `trigger:${string}` | `keyword:${string}`
  | `replacement:${string}` | `cost:${string}` | `selector:${string}` | `condition:${string}`
  | `duration:${string}` | `amount:${string}` | `static:${string}` | `token:${string}` | `layout:${string}`;

/** True when the engine declares the feature in SUPPORTED_FEATURES (extended, see below). */
export function isRunnable(ref: FeatureRef): boolean;

// lower/index.ts
export interface LowerContext {
  readonly owner: 'ability' | 'spell';
  readonly faceTypes: readonly string[];
  readonly targets: TargetSpec[];        // accumulated in order of appearance (t1, t2, ...)
}
export type LowerResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly needs: readonly FeatureRef[]; readonly at: Span; readonly rule: string };

export interface Lowering<I, A> {
  /** The IR head this lowering handles: a verb for clauses, a kind for the rest. */
  readonly head: string;
  /** Every engine feature the produced node can use; checked before lower() runs. */
  readonly needs: readonly FeatureRef[];
  lower(node: I, ctx: LowerContext): LowerResult<A>;
}
export function lower(ir: IrAbility, ctx: LowerContext): LowerResult<readonly Ability[] | SpellText>;
```

`needs` is declared, not inferred: a lowering for `createToken` declares `['effect:createToken', 'token:predefined']`; if any is not runnable, `lower` returns `notRunnable` with the missing refs without building a node. A unit test walks every lowering and asserts that each `FeatureRef` names a key and value the engine could declare (the engine exports the list of feature dimensions), so a misspelt ref fails the build. `validateCard` stays as the last gate (D-007), so a lowering bug still cannot mark a card supported.

Engine changes this needs (small, in `packages/engine/src/ast/features.ts`): `SUPPORTED_FEATURES` gains `costKinds` (activated-ability costs), `selectorKinds`, `conditionKinds`, `durationKinds`, `staticKinds`, `tokenKinds` and `amountKinds`, each empty until the slice that implements it, and `FEATURE_DIMENSIONS` as a const list for the test above. Each slice adds to these in the same change as its tests (D-007 unchanged). New engine nodes the IR will target are listed per slice in section 7; the lowering for each exists only once the node exists.

The diagnostic extends `UnparsedAbility` (schema 1 fields kept, new fields optional, request schema 2 accepts both):

```ts
export interface UnparsedAbility {
  readonly face: number;
  readonly ability: number;
  readonly text: string;
  readonly stoppedAt: string;        // kept: text from the failure position
  readonly closestRule: string;      // kept: deepest rule id that was being tried ('effect.add-counters' or 'none')
  readonly reason?: 'unrecognised' | 'notRunnable' | 'unboundReference' | 'ambiguous';
  /** The slot being filled when matching stopped ('noun'), for unrecognised. */
  readonly slot?: RuleFamily;
  /** Rule ids that matched before the stop, in order ('trigger.enters', 'effect.exile'). */
  readonly recognised?: readonly string[];
  /** Engine features missing, for notRunnable ('effect:createToken'). */
  readonly needs?: readonly FeatureRef[];
  /** The unbound word, for unboundReference ('those cards'). */
  readonly reference?: string;
  /** templateOf(text), computed once so reports group without re-parsing. */
  readonly template?: string;
}
```

`reasons` on `SupportReport` keeps carrying non-parse causes (layout, type, `*`, fixture mismatch). The "Why unsupported?" dialog shows `notRunnable` as "The parser understood this ability; the engine cannot run: create a token" and `unrecognised` as the highlighted text with "stopped while reading a <slot>".

### 3.7 Reference resolution (`parser/ir/bind.ts`)

One pass over a parsed `IrAbility`, in text order, with a scope that lives for the whole ability (sentences in order; modal modes are separate scopes):

1. `~` → `self` (lowered to `{kind:'this'}` in abilities, `{kind:'thisSpell'}` in spell text).
2. `target <filter>` → a new `TargetSpec` id `t<n>` in order of appearance; `up to N` → `min: 0, max: N`; `any target` → `anyTarget`. The same phrase repeated in one ability ("target creature ... that creature") is one target.
3. Anaphors bind to the most recent compatible antecedent: `it`, `that creature`, `that land`, `that card` → the most recent singular object noun whose filter is compatible (a `creature` anaphor needs an antecedent that is a creature, `anyTarget` or unfiltered); `that player`, `they` → the most recent player noun; `those cards`, `them` → the most recent plural noun; `the other` → the second item of a `count: 2` noun. In a triggered ability, the trigger's `subject` and `actor` are the first antecedents, so `Whenever a creature you control dies, return it ...` binds `it` to `triggerSubject`, and `Whenever an opponent casts a spell, that player ...` binds to `triggerActor`.
4. A noun that is the result of a previous clause (`search ... for a basic land card, put it onto the battlefield`) binds to a `b<n>` binding id: the search clause declares a binding for its result and the next clause refers to it.
5. Unbound → `Diagnostic { reason: 'unboundReference', reference }`. Never guessed.

Engine primitives this requires (P class, in the slice that first needs them): `ObjectRef` gains `{ kind: 'triggerSubject' }`, `{ kind: 'bound'; id: string }`; `PlayerSelector` gains `{ kind: 'triggerActor' }`; `ObjectFilter.controller` and a new `ObjectFilter.owner` accept an `ObjectRef` or `PlayerSelector` (for `target player's graveyard`, `creatures that player controls`); the resolution context carries named bindings written by `searchLibrary` and friends. These are listed under S2 and S5 in section 7.

### 3.8 How each ability kind fits

| Kind | Segmenter head | Phrase families | Lowering target | Notes |
| --- | --- | --- | --- | --- |
| Mana ability | activated (`cost: Add ...`) | cost, effect (`addMana`) | `Ability{kind:'mana'}` when no target and the effect is only `addMana` (CR 605.1a (Mana Abilities)); else `activated` | `mana.tap-add` becomes `cost.tap` + `effect.add-mana`; sacrifice-cost mana (Treasure, Eldrazi Spawn) waits on `cost:sacrifice` in `manaAbilityCostKinds` |
| Activated with costs | activated | cost, effect, noun, restriction | `Ability{kind:'activated', cost, targets, effect, timing}` | Equip is `keyword.equip` lowered to the activated ability CR 702.6a (Equip) defines; restrictions `Activate only as a sorcery` → `timing:'sorcery'`, `once each turn` needs `restriction:oncePerTurn` (S3) |
| Triggered with condition | triggered | trigger, condition, effect, noun | `Ability{kind:'triggered', trigger, targets, effect, optional, condition}` | `interveningIf` lowers to a `condition` field on the ability (new, S2, CR 603.4); `enters or attacks` lowers to two triggered abilities sharing one effect, or one ability with an `anyOf` trigger (engine choice in S2; the IR does not care) |
| Static and layers | static | noun, static, keyword, quoted | `Ability{kind:'static', subject, modifications, condition}` (new, S4) | `Enchanted creature gets +2/+0 and has trample` → one static with two modifications, layers 7c and 6 (CR 613) applied by `derive` |
| Replacement | replacement | effect, noun | `Replacement` kinds (`entersTapped`, `entersWithCounters`, then `wouldDieExileInstead`, damage prevention, S4) | `~ enters tapped.` is a one-rule table entry on the existing node (the GRAMMAR agent's work, kept) |
| Modal spell | modal | everything, per mode | `SpellText{modes, chooseModes}` | engine: the `modes` decision kind (S6); a modal triggered ability (Atsushi) needs `modes` on triggered abilities too |
| Tokens | noun `token` | token, keyword, quoted | `Effect{kind:'createToken', token: TokenDefinition, count}` (S2) | predefined tokens from a table written from CR 111.10 with the rule cited; inline definitions parse P/T, colors, types, keywords and quoted abilities through the same pipeline |
| Search and zones | effect `search`, `mill`, `scry`, `surveil`, `reveal`, `return` | noun (`card` filters), destination list | `Effect{kind:'searchLibrary', filter, max, destinations, reveal, shuffle}` (S5) with the `librarySearch` decision | `then shuffle` is part of the search clause; `put it onto the battlefield tapped` and `the other into your hand` are the destination list |
| Keywords with parameters | keyword | keyword, cost, noun | `Keyword` union (ward, protection, equip, enchant, kicker, cycling, crew, flashback) | each parameterised keyword is one `keyword.<name>` rule; `Enchant creature` lowers to `{kind:'enchant', filter}` which the engine uses as the Aura's target restriction (CR 702.5a (Enchant), S6) |
| Delayed and reflexive triggers | effect verbs `delayed`, `reflexive` | trigger (reused), effect | `Effect{kind:'createDelayedTrigger'}` (later, S-class) | recognised at IR level now, reported `notRunnable` until the engine has them (CR 603.7, 603.12) |

### 3.9 Ambiguity handling

Ordered choice inside a family, and three meta tests over the whole rule set: (1) every `examples` entry matches exactly one rule of its family completely; (2) every `rejects` entry does not match its own rule completely; (3) every example of a family, run through the other families, does not produce a second full parse of the same ability skeleton (catches "cost versus effect" overlaps). A real ambiguity found later is reported as `reason: 'ambiguous'` with both rule ids, never resolved by order at runtime.

### 3.10 `PARSER_VERSION`, the support cache and overrides

`PARSER_VERSION` goes to 2 with the first merge of this design (the diagnostic shape changes, so cached reports are stale). Policy: any change to `normalize.ts`, `segment.ts`, a rule, a lowering, the engine's `SUPPORTED_FEATURES` or an override bumps it. A snapshot test records `{ parserVersion, ruleIds, overrideOracleIds }`; a rule or override change therefore forces a snapshot update, and the reviewer checks the version moved with it. The support cache (`support-cache.ts`) is unchanged. Overrides take precedence over the parser exactly as fixtures do today, through `OverrideRegistry`, and are part of the parser version.

## 4. Worked examples

Format: normalized line → skeleton → IR (abbreviated) → bound → lowered → status. Rule ids are the proposed ones.

### 4.1 Korvold, Fae-Cursed King (text from the request file)

Line 1 `Flying` → keyword line → `keyword.flying` → `{kind:'keyword', keyword:{kind:'flying'}}` → runnable today.

Line 2 `Whenever ~ enters or attacks, sacrifice another permanent.`
- skeleton: triggered; trigger span `~ enters or attacks`; body `sacrifice another permanent.`
- IR: `trigger.enters-or-attacks`? No: `trigger.enters` with `subject: self` and `alternatives: [trigger.attacks subject self]` (one rule `trigger.or` joins two subject-sharing events, CR 603.2c). Body: one clause `effect.sacrifice` with `object: noun.a { filter: {types:['permanent']}, other: true }`.
- bind: `self` → this; `another permanent` is a `det:'a'` noun (the controller chooses), no target.
- lower: `needs: ['ability:triggered', 'trigger:entersBattlefield', 'trigger:attacks', 'effect:sacrifice', 'selector:choose']` → `{kind:'triggered', trigger:{kind:'anyOf', triggers:[entersBattlefield this, attacks this]}, effect:{kind:'sacrifice', objects:{kind:'choose', filter:{types:['permanent'], controller:'you', other:true}, count:1}}}`.
- status: `notRunnable` until S2 lands `ability:triggered`, the two trigger kinds and the `choose` selector (`choosePermanent` decision); then supported.

Line 3 `Whenever you sacrifice a permanent, put a +1/+1 counter on ~ and draw a card.`
- IR: `trigger.sacrifice { actor: you, subject: noun.a permanent }`; body: clauses `effect.add-counters {count:1, counter:'+1/+1', objects:self}` connector `and`, `effect.draw {player: you, amount: 1}`.
- lower: `trigger:permanentSacrificed` (by you), `sequence[addCounters this, draw you 1]` (both effects runnable today).
- status: supported once S2 lands. The request's two `closestRule: 'none'` diagnostics become `notRunnable, needs: ['ability:triggered', 'trigger:entersBattlefield', ...]` on the day the IR merges, before the engine work finishes, which is already more useful to the backlog.

### 4.2 Atsushi, the Blazing Sky (text from memory)

`Trample` → keyword. `When ~ dies, choose one —\n• Exile the top two cards of your library. Until the end of your next turn, you may play those cards.\n• Create three Treasure tokens.`
- skeleton: triggered whose body is modal (`choose one —` after the trigger comma, bullets joined by `splitAbilities`).
- IR: `trigger.dies {subject:self}`; `modal {choose:{min:1,max:1}, modes:[body1, body2]}`. Mode 2: `effect.create-token {token:{predefined:'Treasure', count:3}}`. Mode 1: sentence 1 `effect.exile-top {player:you, count:2}` declares binding `b1` (the exiled cards); sentence 2: clause `effect.play-from-exile {cards: anaphor 'those cards' → b1, duration: untilEndOfNextTurn, optional:true}`.
- bind: `those cards` → `b1`. Good.
- lower: mode 2 needs `effect:createToken`, `token:Treasure` (S2). Mode 1 needs `effect:exileTop`, `effect:grantPlayFromExile`, `duration:untilEndOfNextTurn`, `amount:bound` (S-class: playing cards from exile is a permission effect, see `docs/ROADMAP.md`). The modal trigger needs `ability:triggered` with modes (S6's modes decision).
- status: `notRunnable, needs: ['trigger:dies', 'effect:createToken', 'effect:grantPlayFromExile', 'duration:untilEndOfNextTurn', 'modes:triggered']`. The ability is fully recognised, so the backlog counts Atsushi against those engine features, not against the grammar. It stays unsupported until the play-from-exile permission exists; that is correct and precise.

### 4.3 Evolving Wilds and Jund Panorama: one rule family, two cards (texts from memory)

Evolving Wilds: `{T}, Sacrifice ~: Search your library for a basic land card, put it onto the battlefield tapped, then shuffle.`
Jund Panorama: `{T}: Add {C}.` and `{1}, {T}, Sacrifice ~: Search your library for a basic Swamp, Mountain, or Forest card, put it onto the battlefield, then shuffle.`
- skeleton: activated; costs `{T}, Sacrifice ~` (and `{1}` for the Panorama); body one sentence, three clauses.
- IR costs: `cost.tap`, `cost.sacrifice {what:self}`, `cost.mana {symbols:['1']}`. Body: `effect.search {zone: library, of: you, what: noun.a {filter:{card:true, supertypes:['basic'], types:['land']}}}` declaring `b1`; `effect.put-onto-battlefield {what: anaphor it → b1, tapped: true|false}`; `effect.shuffle {player: you}`. The Panorama's filter is `{card:true, supertypes:['basic'], subtypes:['Swamp','Mountain','Forest']}` from the same `noun.card-filter` rule, which reads `basic <Type>, <Type>, or <Type> card` (`or` inside the list is a choice of subtypes). The same four rules (`cost.sacrifice`, `effect.search`, `effect.put-onto-battlefield`, `effect.shuffle`) read Terramorphic Expanse, Fabled Passage (plus `condition.control-count` for "if you control four or more lands, untap it", whose `it` binds to `b1`), Promising Vein, Mountain Valley, Rocky Tar Pit, Sakura-Tribe Elder, Escape Tunnel, Cabaretti Courtyard, Maestros Theater and Riveteers Overlook: eleven cards from one family, as the deck analysis predicted.
- lower: `Ability{kind:'activated', cost:[tap, sacrifice this, mana?], effect: sequence[searchLibrary{filter, max:1, destinations:[{zone:'battlefield', tapped}]}, shuffle you]}`; `needs: ['ability:activated', 'cost:sacrifice', 'effect:searchLibrary', 'decision:librarySearch']` (S3 and S5).
- status: `notRunnable` with those needs until S3 and S5; then supported, and SPEC scenario test 25 (fetch land uses the stack, shuffles after) is the acceptance test. The Panorama's first line lowers to a mana ability today.

### 4.4 Cultivate and Farseek: one search rule family (texts from memory)

Cultivate: `Search your library for up to two basic land cards, reveal those cards, put one onto the battlefield tapped and the other into your hand, then shuffle.`
Farseek: `Search your library for a Plains, Island, Swamp, or Mountain card, put it onto the battlefield tapped, then shuffle.`
- skeleton: spell body (sorcery face), one sentence, clauses split on `, `.
- Cultivate IR: `effect.search {what: noun.a {count: 2, upTo: true, plural: true, filter: basic land card}}` declares `b1`; `effect.reveal {what: anaphor 'those cards' → b1}`; `effect.put-onto-battlefield {what: 'one' of b1, tapped}`; `effect.put-into-hand {what: anaphor 'the other' → second of b1}`; `effect.shuffle`. The split destination ("one ... and the other ...") is a `destinations` list on the search lowering: `[{zone:'battlefield', tapped:true, count:1}, {zone:'hand', count:1}]`, with `reveal: true`.
- Farseek IR: same family; the filter is `{card:true, subtypes:['Plains','Island','Swamp','Mountain']}` without `basic`, which matters (a Tundra is legal) and is why the filter keeps `supertypes` separate from `subtypes`.
- lower: `SpellText{effect: sequence[searchLibrary{...}, shuffle]}`; `needs: ['effect:searchLibrary', 'decision:librarySearch', 'selector:boundSplit']`.
- status: `notRunnable` until S5; then both supported from one family. Harrow and Far Wanderings join when `cost:additionalSacrifice` (S3) and `condition.threshold` (S4) exist.

### 4.5 Goldspan Dragon (text from memory)

`Flying, haste` → two keywords. `Whenever ~ attacks or becomes the target of a spell, create a Treasure token.` → `trigger.attacks {subject:self}` with `alternatives:[trigger.becomes-target {subject:self, filter:{spell}}]`; body `effect.create-token {Treasure, 1}`. `Treasures you control have "{T}, Sacrifice this artifact: Add two mana of any one color."` → static: subject `noun.each {filter:{subtypes:['Treasure'], controller:'you'}}`, effect `grantAbility(quoted)`; the quoted text goes through the whole pipeline (normalization maps `this artifact` to `~`): activated `cost.tap, cost.sacrifice self`, `effect.add-mana {amount:2, choice:'anyOneColor'}` → a mana ability.
- status: trigger line `notRunnable` (`trigger:attacks` S2, `trigger:becomesTarget` S2-later, `effect:createToken` S2); static line `notRunnable` (`static:grantAbility` S4, `cost:sacrifice` for mana abilities S3, `mana:anyOneColorN` P). All recognised. Supported after S4.

### 4.6 Rancor (text from memory)

`Enchant creature` → `keyword.enchant {filter: creature}`. `Enchanted creature gets +2/+0 and has trample.` → static: subject `noun.enchanted`, effects `[pt(+2,+0), grantKeyword(trample)]`. `When ~ is put into a graveyard from the battlefield, return ~ to its owner's hand.` → `trigger.dies` (the family recognises both `dies` and `is put into a graveyard from the battlefield`, CR 700.4 (Dies)); body `effect.return-to-hand {what: self, to: ownerOf(self)}` → `moveToZone this → hand` (runnable today). Rancor returns itself from the graveyard, so the lowering uses `this` under last-known information (CR 603.10), which the engine keeps (D-004).
- status: `notRunnable` needing `keyword:enchant` and `layout:aura` (S6 Auras: attach, the enchant target restriction, SBA 704.5m), `static:pt`, `static:grantKeyword` (S4), `trigger:dies` (S2). Supported after S6.

### 4.7 Bojuka Bog (text from memory)

`~ enters tapped.` → replacement table → `{kind:'replacement', replacement:{kind:'entersTapped'}}`, runnable today (the GRAMMAR agent's rule). `When ~ enters, exile target player's graveyard.` → `trigger.enters {self}`; body `effect.exile {what: noun.each {filter:{zone:'graveyard', owner:{noun: target player}}}}`: the rule `noun.players-graveyard` reads `<player noun>'s graveyard` as "each card in that player's graveyard". bind: `target player` → `t1`.
- lower: `{kind:'triggered', trigger: entersBattlefield this, targets:[{id:'t1', what:{kind:'player', filter:'any'}}], effect: exile {kind:'each', filter:{zone:'graveyard', owner:{kind:'target', id:'t1'}}}}`; `needs: ['trigger:entersBattlefield', 'selector:ownerRef']`.
- status: supported as soon as S2 adds `ObjectFilter.owner` by reference (a P-class primitive of a few lines in `select.ts`).

### 4.8 A card that must come out unsupported with a precise diagnostic: Emissary Green

Text from memory, shape only: `Flash` then `When ~ enters, starting with you, each player votes for a creature they control. ...` (voting, CR 701.38 (Vote)).
- `Flash` → keyword; `keyword:flash` is in the AST but not in `SUPPORTED_FEATURES.keywordKinds` → `notRunnable, needs: ['keyword:flash']` (K class, S3: casting at instant speed).
- The trigger line: skeleton triggered, `trigger.enters {self}` recognised; body sentence 1: no effect rule has `leading` `starting` or `each player votes`; `noun.each` would read `each player` but no verb follows that any `effect.*` rule owns.
- Diagnostic: `{ reason: 'unrecognised', slot: 'effect', recognised: ['trigger.enters'], closestRule: 'trigger.enters', stoppedAt: 'starting with you, each player votes for a creature they control. ...', template: 'When ~ enters, starting with you, each player votes for a creature they control. ...' }`.
- status: unsupported. The backlog lists the template once, with the cards it blocks (the vote family: council's dilemma and will of the council cards), classified S (a voting decision kind and the vote-counting effect). That is a proposal, not a rule, and until then the card is an override candidate only if the owner wants it (section 6). Nothing is guessed.

## 5. How the tooling closes the loop

- **Corpus reports (`tools/corpus/`, built; `docs/CORPUS.md`).** `pnpm corpus:templates` and `pnpm coverage:cards` already rank unparsed shapes by `1 / edhrecRank` and list "solo blockers" (shapes that are a card's only blocker). With diagnostics v2 the backlog gains a second table: *engine gaps* (notRunnable, grouped by `FeatureRef`, so "effect:createToken blocks 1,240 cards, 310 in the top 1,000" is one row), beside the *grammar gaps* table (unrecognised, grouped by `slot` + `templateOf(stoppedAt)`, so "effect: `starting with you, each player votes ...`" and "noun: `target player's graveyard`" are separate rows). `templates.json` gains `reason`, `slot` and `needs` per entry. `templateOf` is refined to run on the failing slot's text only and to replace recognised noun phrases by their family (`<noun>`), so shapes group by what is missing. Request counts enter the rank once `card-requests/` is read by the tool (SPEC 7.3's `(requests + 1) x popularity`).
- **Authoring a rule.** One file: `defineRule` with `examples` (training texts, see hold-out below), `rejects`, `cites`; one lowering if a new engine node is targeted; one golden test entry `golden('effect.draw', { unlocks: ['Divination', 'Korvold, Fae-Cursed King'] })` that asserts those names in the golden corpus flip to supported in `golden.expected.json` (the snapshot is updated in the same commit and reviewed as a diff). Every rule id and every `FeatureRef` must appear in at least one scenario test (A8, D-008): a meta test lists rule ids without a scenario tag and fails.
- **Golden corpus.** `packages/cards/test/fixtures/corpus/golden.jsonl`: about 150 to 300 real cards (name, oracle_id, type line, mana cost, Oracle text, edhrec_rank) exported by the owner with `pnpm corpus:extract --names <file>` from the bulk file, starting with the 77 and the fixture cards, growing with every slice. `golden.expected.json` records each card's status, its diagnostics and a hash of its AST. The test fails when a supported card becomes unsupported, when an AST changes, or when a diagnostic changes, unless the snapshot is updated. This is the CI coverage non-regression gate that can run without network.
- **Full-corpus numbers.** The owner runs `pnpm coverage:cards --file <bulk> --check` then `--update-baseline` locally before each slice merges (`docs/CORPUS.md`) and commits `reports/`. `reports/coverage-baseline.json` gains `parserVersion`; a test asserts it equals `PARSER_VERSION`, so a parser change without a fresh local run fails CI, which is the honest substitute for running `--check` in CI (the bulk file is unreachable there). The golden corpus above is the gate that does run in CI.
- **Overfitting.** Deterministic split by `oracle_id`: the last hex digit `0` to `b` is training (75%), `c` to `f` is hold-out (25%). Rule `examples` and golden `unlocks` may use training cards only (a test checks the golden corpus entries used in `unlocks`); `reports/coverage.md` prints training and hold-out coverage side by side (two more `Share` rows in `CoverageStats`), and the gap is tracked: a hold-out share more than 5 points under training means rules are being written to examples rather than to templates, and the next session widens rules instead of adding them. The 77 cards of the owner's deck are exempt from the split (they are acceptance cards, listed as such).
- **Requests map onto rule families.** A `CardSupportRequest` v2 carries the v2 diagnostics. The intake step of the playbook groups requests by `(reason, slot, template)` for grammar gaps and by `needs` for engine gaps, so three requests with `needs: ['effect:createToken']` are one work item, and a second request of a shape already in `reports/backlog.md` adds to its rank instead of opening new work. The "Your requests" screen marks a request resolved when the card's cached status flips after a `PARSER_VERSION` bump (unchanged).
- **Performance budget.** `docs/CORPUS.md` measured about 0.6 ms per card for the import on a 30,000-card SYNTHETIC file (text no rule can read, so every rule runs to failure). Budget: at most 1 ms per card averaged over the real corpus as the grammar grows (about 35 s for the whole run including I/O), reported in `reports/coverage.md`'s header; a 100-card deck in under 100 ms in the browser; the golden corpus parsed 20 times in under 2 s in a CI test (loose, to catch a pathological rule, not a slow machine). Rules of the kit that keep this: no `many(choice(...))` over overlapping alternatives, no regex with nested quantifiers, dispatch by first word so a line tries only the rules that can start it.

## 6. The long tail: overrides

What stays per card: text no general rule would reuse (O class), and S-class mechanics the owner wants playable before the subsystem exists only if the engine has primitives that run them legally (never a half-implementation). Format:

```ts
// packages/cards/src/convert/overrides/cards/<slug>.ts
export default defineOverride({
  oracleId: '<uuid from Scryfall>',
  name: '<name>',
  /** Normalized Oracle text per face, as exported from Scryfall; a mismatch disables the override. */
  text: [['Flash', 'When ~ enters, ...']],
  gapClass: 'O',
  why: 'Voting (CR 701.38) is a subsystem with no general rule; approved by the owner on <date>.',
  faces: [{ abilities: [/* engine AST */], spell: null }],
});
```

`createOracleIdRegistry` reuses `fixtureDifferences` to compare the stored card with the pinned text and printed characteristics; a difference yields `kind: 'mismatch'` with reasons, the parser decides, and the card is unsupported with a reason that names the stale override. An override is verified by: `validateCard` clean (a test over all overrides), the pinned text, and at least one scenario test that plays the card (A8 allows rule-level coverage for parser output; an override is hand-written, so it gets its own test). Overrides count in `PARSER_VERSION` and in the ruleset snapshot. Cost envelope: about 0.3 to 0.5 agent-session per override including its scenario test; a cap of 10% of supported cards being overrides, reported in `reports/coverage.md`; any override whose text is a template the corpus shows on three or more cards is a grammar gap and goes to the backlog instead. A card the owner pastes with "just make it work" that needs an S-class mechanic still gets a proposal first (SPEC 8.3 step 4).

## 7. Staged plan

Sequenced with the engine slices; a lowering may target an engine node only once it exists with tests. Effort is in agent-sessions of one to three hours. The "cards" column names cards of the 77 expected to flip to supported by the end of the stage, with the engine work they also depend on; the numbers are expectations, the golden corpus measures them.

| Stage | What is built | Engine slice it needs | Cards of the 77 expected | Tests | Effort | Risk |
| --- | --- | --- | --- | --- | --- | --- |
| P0 Skeleton (this week) | `segment.ts`, `ir/types.ts`, `ir/bind.ts`, `rules/registry.ts`, `lower/` (with `draft.ts` moved in), `diagnostics.ts` v2, request schema 2; migration of `keyword.line`, `mana.tap-add`, the two enters replacements and the S1 `effects/` parts into phrase rules + lowerings (section 3.2); the three meta tests; golden harness with the fixture cards and the 77 as `golden.jsonl` (owner exports); `PARSER_VERSION` 2; "Why unsupported?" shows reason and needs | none (lowerings for existing nodes only) | 0 new; every card of the 77 gets a precise diagnostic; the S1 spells keep parsing | existing parser and grammar tests pass through the new pipeline (`matchAbility` and `parseFaceText` stay as façades); IR snapshots; meta tests | 2 sessions, half of it the migration | Medium: the segmenter's clause splitting must be conservative (fail to `unrecognised`, never mis-split silently); test it on all 77 lines |
| P1 Spell effects and nouns (S1, the rest) | effect family additions: discard, +N/+N until end of turn, add counters, return "under your control"; noun family additions: `up to`, `any target` as a noun, disjunctions (`creature or planeswalker` as a filter union), each over graveyards with owner by reference, anaphor; amount: X, `countOf`; `you may`; `and`/`then` sequencing already exists | S1 selector work: `ObjectFilter.owner` and `controller` by reference, filter unions, X spells, `modifyPt` already exists | Decimate, Rise of the Dark Realms, Splendid Reclamation, Overkill (if its text is only pt and destroy), Lavalanche (X and `that player` once `controller: ref` exists); the four `enters tapped` lands lose that line from their diagnostics | golden per rule; SPEC tests 2 and 3 for targets; scenario tests for every new selector | 1 to 2 sessions | Low |
| P2 Triggers and tokens (S2) | trigger family: enters, dies (both spellings), attacks, you sacrifice, a player sacrifices, another creature you control dies, landfall, your upkeep, end step, you cast, becomes the target; `or` alternatives; intervening-if with `condition.control-count`; `you may`; token family (predefined from CR 111.10, inline P/T, colors, types, keywords, quoted abilities) | S2 (in progress): triggered abilities, ordering, `choosePermanent`, `sacrificed` event; plus `createToken`, `trigger:dies`, `trigger:landfall`, `trigger:upkeep`, `triggerSubject` and `triggerActor` refs, `condition` on triggered abilities | Korvold, Mayhem Devil, Mazirek, Pitiless Plunderer, Dragonmaster Outcast, Nesting Dragon (token with a dies trigger), Bojuka Bog (owner by reference), Farhaven Elf waits for P4 | the proposal's Korvold scenarios; SPEC test 18; a scenario per trigger kind; token SBA tests | 3 sessions (grammar) alongside the TRIGGERS agent's engine sessions | Medium: trigger-body sequencing and `it` binding to the trigger subject |
| P3 Activated abilities and costs (S3) | cost family: mana, tap, untap, sacrifice (self, a noun), discard, pay life, exile from graveyard, remove counters; restrictions (sorcery, once each turn); mana abilities with sacrifice costs (Treasure); keyword with cost parameters: equip, ward, kicker, cycling, flashback, crew; `keyword:flash`, hexproof, shroud, protection (targeting restrictions) | S3: activation on the stack, cost payment for non-mana costs, `manaAbilityCostKinds` sacrifice, instant-speed casting for flash, targeting restrictions | Awakening Zone (token with a sacrifice mana ability), Cindervines, Sylvan Safekeeper (if its cost and the hexproof-until-end-of-turn grant are both in), Swiftfoot Boots waits for P5 (equip attaches), Beledros and Prossh wait for tokens plus costs (in this stage if S2 landed) | SPEC tests 1, 9, 19; a scenario per cost kind | 3 sessions | Medium: costs with choices (`sacrifice a creature`) reuse `choosePermanent` |
| P4 Search and zone effects (S5) | effect.search with destination lists, reveal, bound results; mill, scry, surveil; exile top N; return from graveyard; `the other`, `those cards` bindings | S5: `searchLibrary` and the `librarySearch` decision, `bound` refs in the resolution context, scry and surveil decisions | Evolving Wilds, Terramorphic Expanse, Fabled Passage, Jund Panorama, Mountain Valley, Rocky Tar Pit, Promising Vein, Sakura-Tribe Elder, Cultivate, Farseek, Harrow (with `cost:additionalSacrifice`), Farhaven Elf, Escape Tunnel and the three NCC lands if their extra clause is in the effect family | SPEC test 25; searches with zero matches; "then shuffle" ordering; hidden-information audit for reveals | 2 sessions | Low-medium |
| P5 Static effects, layers, Auras and Equipment (S4, part of S6) | static family: pt, grant keyword, grant ability (quoted), can't be blocked, no maximum hand size, cost reduction, `as long as`; `enchant`, `equip`; replacement family beyond enters-tapped | S4: `static` ability kind, layers in `derive`, replacement library; S6: attach, Aura and Equipment SBAs | Rancor, Garruk's Uprising, Goldspan Dragon, Swiftfoot Boots, Reliquary Tower, Marwyn, Saryth, Bootleggers' Stash, Gilt-Leaf's Embrace, Rhythm of the Wild (riot is K), Temur Battle Rage (ferocious condition), Coin of Mastery (if its clauses are all in) | SPEC tests 14 to 17, 20; a scenario per static effect kind | 3 sessions | High: layers are the hardest engine work; the grammar part is small |
| P6 Modal, X, layouts (S6) | modal spells and modal triggers, `choose one or both`, adventure and saga segmentation (chapter lines `I —`, `II —`), transform and modal_dfc faces | S6: `modes` decision, X on spells, adventure, saga and transform rules | Crux of Fate, Golgari Charm (regenerate is K), Bushwhack, Atsushi (still needs play-from-exile), Decadent Dragon, The Mending of Dominaria, There and Back Again | SPEC test 3 with adventures; saga chapter tests | 2 sessions | Medium |
| Long tail | overrides and S-class proposals: votes (Emissary Green), copy (Gogo, Scute Swarm), control change (Treasure Nabber, Kaervek), extra combat (Moraug), mana that persists (Savage Ventmaw), play from exile (Atsushi, Dragonhawk), delayed and reflexive triggers (Thrakkus, Dragon Tempest), Lotus Field, Bolt Bend, Haven of the Spirit Dragon, Immersturm Predator, Spelunking, Swashbuckler Extraordinaire, Ziatora, Kardur | per proposal | the remaining 20 to 28, one at a time, ordered by the backlog | per override and per subsystem | 0.3 to 0.5 session per override; 2 to 4 per subsystem | Known |

Expected result: after P4 roughly 35 to 40 of the 77 supported; after P5 about 50; after P6 about 57; the rest is the long tail. The corpus numbers for the top 500 are measured, not predicted; the slices are reordered if the backlog says so.

**What to do first, this week:**

1. P0 by one agent, now: the skeleton, the migration of the two rules, diagnostics v2 and the golden harness. Publish the two contracts the other agents code against on day one: `UnparsedAbility` v2 (for the CORPUS agent's reports) and `FeatureRef` with the extended `SUPPORTED_FEATURES` dimensions (for the TRIGGERS agent, which adds `abilityKinds: ['triggered']`, `triggerKinds` and the `choose` selector in its own change).
2. The GRAMMAR agent's in-flight S1 work is **kept and adapted**, not replaced: `effects/` is the seed of the noun, amount and effect families and `EffectDraft` is the lowering's output model. Let it finish and commit on the current `GrammarRule`/`SpellRule` shape; P0 performs the move of section 3.2 afterwards, in one change, with its tests kept (they assert text in, AST out, through `matchAbility` and `parseFaceText`, which P0 keeps as façades over segment + rules + bind + lower). Instruction to that agent for the remaining S1 time: no new whole-line rules; each new verb or noun phrase is a `named()` part in `effects/` with its examples in the test file, and `CLAUSES`' inclusion filter stays as it is until P0 replaces it with `needs`.
3. The TRIGGERS agent keeps building the engine (`sacrifice.ts`, `source-info.ts`, the trigger scan are in flight); its proposed grammar rule ids (`trigger.enters-or-attacks`, `effect.sacrifice-another-permanent`) become `trigger.enters`, `trigger.attacks`, `trigger.or`, `effect.sacrifice` + `noun.a` in P2, written by the grammar side on the IR, not inside the engine change. The engine change does add the `SUPPORTED_FEATURES` entries and the `choose` selector that P2's lowerings will declare in `needs`.
4. The CORPUS agent's tool is built; next for it: `corpus:extract --names <file>` (the golden corpus exporter, section 5), the `parserVersion` field in `coverage-baseline.json`, and the engine-gaps table once diagnostics v2 exist. The owner runs the first real `pnpm coverage:cards --download --update-baseline` now, before P0, so the baseline exists, and commits `golden.jsonl` for the 77 plus the fixtures once `corpus:extract` exists.
5. Owner decisions in section 8 before P1 starts.

## 8. Risks, open questions, decisions needed

Risks:
- The segmenter splits a clause wrongly and a rule reads a half sentence as a full one (silently wrong semantics). Mitigation: a rule must consume its slot exactly; the three meta tests; golden IR snapshots for all 77 lines; `rejects` lists on every rule.
- Anaphora binding picks the wrong antecedent on an unusual sentence. Mitigation: bind only to compatible filters, prefer the trigger subject, and fail rather than guess; IR snapshots show every binding.
- `FeatureRef` strings drift from the engine's registry. Mitigation: the dimension test and `validateCard` as the last gate.
- Rule growth makes `examples` the de facto spec and overfits the training split. Mitigation: hold-out coverage in every report.
- The golden corpus commits real Oracle text. Mitigation: it is the same category of data already in `card-requests/` and the fixtures; the owner decides the size (below).
- Three agents touch `packages/cards/src/convert/` this week. Mitigation: P0 owns the directory for two sessions; GRAMMAR delivers phrase parsers into `rules/` only; TRIGGERS touches only the engine.

Open questions for the owner:
1. Approve architecture (c) and the file layout, so P0 starts.
2. May a golden corpus of about 150 to 300 real cards' Oracle text be committed under `packages/cards/test/fixtures/corpus/`? Alternative: keep it out of the repository and run golden tests only locally (weaker CI).
3. Approve request schema 2 (optional v2 fields; schema 1 still accepted). SPEC 8.2 shows schema 1, so this is a SPEC amendment candidate (A30).
4. Approve the hold-out policy (25% by `oracle_id` hash, the 77 exempt) and the CI gate semantics (golden corpus in CI; full-corpus numbers committed by the owner per slice; `coverage.json` must match `PARSER_VERSION`).
5. Approve the override cap (10% of supported cards) and that an S-class card gets a proposal before an override, even when requested with "just make it work".
6. Performance budget: 15 s for the full corpus in Node and 100 ms per deck in the browser.
7. Confirm that `Flash`, `hexproof` and `shroud` move to the engine in S3 (targeting restrictions and instant-speed casting) rather than earlier; 8 of the 77 have one of them.

Proposed decision entries (text to be written on approval):
- **D-063 Two-stage parser: clause IR and typed lowering.** Context: the 77-card analysis and section 1. Decision: architecture (c); whole-ability rules are retired; phrase rules per family with examples, rejects and citations; lowering declares `needs`. Alternatives: (a), (b), (d), (e) as in section 2. Consequences: grammar grows per vocabulary item; `matchAbility` becomes a façade; `PARSER_VERSION` 2.
- **D-064 Diagnostics v2 and request schema 2.** Reason, slot, recognised rules, needs, template; schema 1 fields kept; `validateRequest` accepts 1 and 2.
- **D-065 Rule authoring contract and meta tests.** `defineRule` fields; one rule per family matches each golden example; rule ids and feature refs need scenario tests (A8).
- **D-066 Golden corpus, snapshot gate and hold-out split.** Real Oracle text for 150 to 300 cards in the repository; `golden.expected.json` as the CI coverage gate; 75/25 split by `oracle_id`; `reports/coverage.json` pinned to `PARSER_VERSION`.
- **D-067 Overrides keyed by `oracle_id` with text pinning.** `defineOverride`, mismatch disables, scenario test required, 10% cap, grammar-gap rule.
- **D-068 `SUPPORTED_FEATURES` gains dimensions and `FeatureRef`.** Costs, selectors, conditions, durations, statics, tokens, amounts; each slice fills its own in the change that tests it (D-007 unchanged).
- **D-069 No grammar DSL and no new parsing dependency.** The combinator kit stays the only parsing tool; a dependency would need a new entry.
