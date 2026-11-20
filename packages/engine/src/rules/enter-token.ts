/**
 * A token that asks a question as it is created: "As this enters, choose a creature type / a color" (CR 614.12: "An effect creates a token that's
 * a copy of Voice of All. As that token is created, the token's controller chooses a color for it", D-100), and, as D-185 adds, the questions of
 * devour (CR 702.82a) and riot (CR 702.136a), which a permanent applies as it enters. Such a token is made by one `enterToken` instruction each,
 * so that the resolution can stop for the question and go on with the answer, like a permanent that enters from a card (`zones.ts`). A token that
 * asks nothing is created at once (`tokens.ts`). A copy that Encore makes (CR 702.141a) is made the same way, and is then bound to the opponent it
 * was made for (`rules/encore.ts`).
 */
import type { TokenDefinition } from '../ast/types';
import type { ObjectId, SeatId } from '../ids';
import type { NewDecision } from '../state/decisions';
import type { GameEvent } from '../state/events';
import { getSeat, loseLifeBy } from '../state/ops';
import type { GameState, Instruction, ResolutionContext } from '../state/types';
import { attachEntered } from './attach';
import { optionsFor } from './chosen';
import { type OrderFlow, quietFlow } from './damage-order';
import { bindEncoreToken } from './encore';
import {
  entersChoice,
  entersColorExcept,
  entersCopyOf,
  entersOptions,
  entersPayment,
  entersReveal,
  entersTapped,
  lifeOf,
} from './enters';
import { becomeCopyAsItEnters, copyCandidates } from './enters-copy';
import {
  devourCandidates,
  devourDecision,
  devourOf,
  keywordEntryCounters,
  riotDecision,
  riotGivesHaste,
  riotInstances,
} from './enters-keywords';
import { canReveal, revealChoices, revealEvents, revealQuestion } from './enters-reveal';
import { lifeTotalIsLocked } from './player-lock';
import { matchesFilter } from './select';
import { done, type StepOutcome } from './step-outcome';
import { settleTokens } from './token-replacement';
import { hypotheticalToken, makeTokens } from './tokens';
import { sacrificeForDevour } from './zones';

type EnterToken = Extract<Instruction, { kind: 'enterToken' }>;

/**
 * Whether a token with `definition`, created for `seat`, asks a question as it enters: a choice, riot (its own or a permanent's on the battlefield
 * gives it) or devour with a creature to sacrifice.
 */
export function tokenAsks(state: GameState, seat: SeatId, definition: TokenDefinition): boolean {
  return (
    auraEnchantFilter(definition) !== null ||
    entersChoice(definition.abilities) !== null ||
    // D-225 (CR 614.12, 707.9): a token that is a copy of a permanent that may enter as a copy of a creature asks which, when there is one.
    tokenCopyCandidates(state, seat, definition, null).length > 0 ||
    // D-211 (CR 614.12): a token that is a copy of a shock land or of a land that asks for a card to reveal asks as a permanent does.
    entersPayment(definition.abilities) !== null ||
    entersReveal(definition.abilities) !== null ||
    riotInstances(state, definition.abilities, hypotheticalToken(seat, definition)) > 0 ||
    (devourOf(definition.abilities) > 0 && devourCandidates(state, seat).length > 0)
  );
}

/** CR 303.4a, 702.5a (D-668): the enchant filter of a token that is an Aura (a copy of one), or null. */
function auraEnchantFilter(definition: TokenDefinition) {
  if (!definition.subtypes.includes('Aura')) return null;
  for (const a of definition.abilities) {
    if (a.kind === 'keyword' && a.keyword.kind === 'enchant') return a.keyword.filter;
  }
  return null;
}

/**
 * CR 303.4f, 303.4g (issue 89): whether the Aura token with `definition` created for `seat` by `source` can enter attached to `host`, the object the effect names: a permanent its
 * enchant ability allows, read as the token's controller (hexproof and shroud do not matter, CR 303.4c).
 */
export function auraTokenCanEnterAttached(
  state: GameState,
  seat: SeatId,
  definition: TokenDefinition,
  source: ObjectId,
  host: ObjectId,
): boolean {
  const enchant = auraEnchantFilter(definition);
  const obj = state.objects[host];
  return (
    enchant !== null &&
    obj !== undefined &&
    obj.zone === 'battlefield' &&
    matchesFilter(state, obj, { ...enchant, zone: 'battlefield' }, { controller: seat, source })
  );
}

/** The permanents a token with `definition` may become a copy of as it is created (CR 614.12, 707.9: "As this enters, you may have it become a copy of ..."); none when it has no such ability. */
function tokenCopyCandidates(
  state: GameState,
  seat: SeatId,
  definition: TokenDefinition,
  source: ObjectId | null,
): readonly ObjectId[] {
  const rule = entersCopyOf(definition.abilities);
  return rule === null ? [] : copyCandidates(state, seat, rule, source);
}

/** The instructions that create `count` tokens for `seat`, when the definition asks a question. */
export function enterTokenInstructions(
  seat: SeatId,
  definition: TokenDefinition,
  count: number,
  tapped = false,
  settled = false,
): EnterToken[] {
  return Array.from({ length: Math.max(count, 0) }, () => ({
    kind: 'enterToken' as const,
    seat,
    definition,
    chosen: null,
    ...(tapped ? { tapped: true as const } : {}),
    ...(settled ? { settled: true as const } : {}),
  }));
}

/** Asks the question, or creates the token with the answer (CR 614.12a: the choice comes first). */
export function runEnterToken(
  state: GameState,
  res: ResolutionContext,
  instruction: EnterToken,
  flow: OrderFlow = quietFlow(),
): StepOutcome {
  const { seat, chosen } = instruction;
  // D-221 (CR 616.1, 616.1g): a token whose event nothing settled yet (Encore's copy) first has the replacement effects of its creation applied, the player
  // choosing their order; the tokens that come out are then made by one settled instruction each, in place of this one.
  if (instruction.settled !== true) {
    const settled = settleTokens(
      state,
      seat,
      res.source,
      [{ definition: instruction.definition, count: 1, original: true }],
      flow,
    );
    if (settled.kind === 'asked') return { state, events: [], front: [], needs: settled.decision };
    const made = settled.parts.flatMap((part) =>
      enterTokenInstructions(
        seat,
        part.definition,
        part.count,
        part.original && instruction.tapped === true,
        true,
      ).map((one) =>
        part.original && instruction.encoreFor !== undefined
          ? { ...one, encoreFor: instruction.encoreFor }
          : one,
      ),
    );
    return done(state, [], made);
  }
  const { definition } = instruction;
  // CR 614.12, 616.1c, 707.9 (D-225): "As this enters, you may have it become a copy of any creature on the battlefield": the first question a token asks,
  // answered with `entersCopy` of the resolution (none is a legal answer: "you may"). The token is made a copy once it exists.
  const copyRule = entersCopyOf(definition.abilities);
  const copyLegal = tokenCopyCandidates(state, seat, definition, res.object);
  if (copyRule !== null && copyLegal.length > 0 && res.entersCopy === undefined) {
    return {
      state,
      events: [],
      front: [],
      needs: {
        kind: 'choosePermanent',
        seat,
        source: res.object,
        subject: res.object,
        purpose: 'entersCopy',
        min: copyRule.optional === true ? 0 : 1,
        max: 1,
        legal: [...copyLegal],
      },
    };
  }
  const what = entersChoice(definition.abilities);
  const asked = (decision: NewDecision): StepOutcome => ({
    state,
    events: [],
    front: [],
    needs: decision,
  });
  if (what !== null && chosen === null) {
    return asked({
      kind: 'chooseOption',
      seat,
      purpose: what,
      options: optionsFor(
        what,
        entersOptions(definition.abilities),
        entersColorExcept(definition.abilities),
        lifeTotalIsLocked(state, seat) ? 0 : getSeat(state, seat).life,
      ),
      // Nothing exists yet: the question is about the token that the resolving spell or ability makes.
      source: res.object,
      sourceName: definition.name,
      sourceOracleText: definition.oracleText,
    });
  }
  // CR 614.12, 614.1c (D-211): "As this enters, you may pay 2 life. If you don't, it enters tapped" and "you may reveal a Mountain or Plains card from your hand":
  // the question of a land a token copies, asked of the player who creates it before the token exists; the answer is `entersPaid` of the resolution.
  const payment = entersPayment(definition.abilities);
  const reveal = revealQuestion(state, seat, entersReveal(definition.abilities), res.object);
  const alreadyTapped =
    instruction.tapped === true ||
    entersTapped(state, definition.abilities, { controller: seat, source: res.object });
  const answered = res.entersPaid ?? null;
  if (!alreadyTapped && answered === null) {
    if (reveal !== null && canReveal(state, seat, reveal, res.object)) {
      return asked({
        kind: 'confirmOptional',
        seat,
        source: res.object,
        sourceName: definition.name,
        sourceOracleText: definition.oracleText,
        reveal: {
          words: reveal.words,
          ...(reveal.fromBattlefield === true ? { behold: true as const } : {}),
        },
      });
    }
    if (
      payment !== null &&
      (lifeOf(payment) <= 0 ||
        (!lifeTotalIsLocked(state, seat) && getSeat(state, seat).life >= lifeOf(payment)))
    ) {
      return asked({
        kind: 'confirmOptional',
        seat,
        source: res.object,
        sourceName: definition.name,
        sourceOracleText: definition.oracleText,
        cost: payment,
      });
    }
  }
  let afterPay = state;
  const payEvents: GameEvent[] = [];
  let tappedByQuestion = false;
  if (!alreadyTapped && (reveal !== null || payment !== null)) {
    const askedReveal = reveal !== null && canReveal(state, seat, reveal, res.object);
    const askedPay =
      payment !== null &&
      (lifeOf(payment) <= 0 ||
        (!lifeTotalIsLocked(state, seat) && getSeat(state, seat).life >= lifeOf(payment))) &&
      !askedReveal;
    if (answered === true && askedReveal && reveal !== null) {
      // D-225 (CR 701.20a): with more than one card to reveal the player chooses which.
      if (
        revealChoices(state, seat, reveal, res.object).length > 1 &&
        instruction.revealed === undefined
      ) {
        return asked({
          kind: 'chooseCards',
          seat,
          source: res.object,
          purpose: 'reveal',
          zone: 'hand',
          legal: [...revealChoices(state, seat, reveal, res.object)],
          min: 1,
          max: 1,
          reveal: true,
          prompt: `Reveal ${reveal.words} from your hand for ${definition.name}.`,
        });
      }
      payEvents.push(...revealEvents(state, seat, reveal, res.object, instruction.revealed));
    } else if (answered === true && askedPay && payment !== null) {
      const had = getSeat(state, seat).life;
      afterPay = loseLifeBy(state, seat, lifeOf(payment));
      payEvents.push({ kind: 'lifeChanged', seat, from: had, to: had - lifeOf(payment) });
    } else {
      // "If you don't, it enters tapped": also when nothing could be revealed or paid.
      tappedByQuestion = true;
    }
  }
  // CR 702.136a, 702.136b (D-185): riot asks once for each instance.
  const riotAnswers = instruction.riot ?? [];
  if (
    riotAnswers.length <
    riotInstances(state, definition.abilities, hypotheticalToken(seat, definition))
  ) {
    return asked(
      riotDecision(seat, res.object, definition.name, definition.oracleText, riotAnswers),
    );
  }
  // CR 303.4f, 303.4g (D-668): a token that is an Aura enters under no spell, so its controller chooses what it enchants as it enters, among the permanents its enchant ability
  // allows; with none it does not enter (a token cannot stay in a zone it was never in). The one chosen is attached once the token exists.
  const enchant = auraEnchantFilter(definition);
  let host = instruction.host ?? null;
  if (enchant !== null && host === null) {
    const hosts = state.battlefield.filter((id) => {
      const obj = state.objects[id];
      return (
        obj !== undefined &&
        matchesFilter(
          state,
          obj,
          { ...enchant, zone: 'battlefield' },
          { controller: seat, source: res.object },
        )
      );
    });
    if (hosts.length === 0) return done(state);
    const only = hosts.length === 1 ? hosts[0] : undefined;
    if (only === undefined) {
      return asked({
        kind: 'choosePermanent',
        seat,
        source: res.object,
        purpose: 'auraHost',
        subject: res.object,
        min: 1,
        max: 1,
        legal: hosts,
      });
    }
    host = only;
  }
  // CR 702.82a (D-185): "you may sacrifice any number of creatures", the last question; none is asked when there is nothing to sacrifice.
  let devoured = instruction.devoured ?? null;
  if (devourOf(definition.abilities) > 0 && devoured === null) {
    const legal = devourCandidates(state, seat);
    if (legal.length > 0) return asked(devourDecision(seat, res.object, legal));
    devoured = [];
  }
  // CR 119.4, 614.12 (pay any amount of life): the life the token's controller chose to pay is lost as the token enters.
  if (what === 'lifePaid' && (chosen?.lifePaid ?? 0) > 0) {
    const had = getSeat(afterPay, seat).life;
    const paid = chosen?.lifePaid ?? 0;
    afterPay = loseLifeBy(afterPay, seat, paid);
    payEvents.push({ kind: 'lifeChanged', seat, from: had, to: had - paid });
  }
  const sacrificed = sacrificeForDevour(afterPay, devoured ?? [], seat);
  const made = makeTokens(
    sacrificed.state,
    seat,
    definition,
    1,
    chosen ?? undefined,
    instruction.tapped === true || tappedByQuestion,
    {
      counters: keywordEntryCounters(definition.abilities, riotAnswers, sacrificed.count),
      haste: riotGivesHaste(riotAnswers),
    },
  );
  // D-139: a token that asked is one more of what `moved` names after a `createToken` effect.
  const created = made.events.flatMap((e) => (e.kind === 'tokenCreated' ? [e.object] : []));
  // CR 707.9 (D-225): the token enters as a copy of the permanent chosen, so what triggers as it enters sees the copy.
  let copied = made.state;
  const copyEvents: GameEvent[] = [];
  const copiedFrom = res.entersCopy ?? null;
  const [token] = created;
  if (copyRule !== null && copiedFrom !== null && token !== undefined) {
    const became = becomeCopyAsItEnters(
      copied,
      token,
      copyRule,
      copiedFrom,
      seat,
      instruction.embalmed === true,
    );
    copied = became.state;
    copyEvents.push(...became.events, ...became.counterEvents);
  }
  // CR 303.4f (D-668): the Aura token enters attached to the permanent chosen.
  let hostEvents: GameEvent[] = [];
  if (host !== null && token !== undefined) {
    const attached = attachEntered(copied, token, host);
    copied = attached.state;
    hostEvents = attached.events;
  }
  // CR 702.141a (D-185): a copy Encore made is required to attack its opponent, has haste and is sacrificed at the next end step.
  const bound =
    instruction.encoreFor === undefined
      ? copied
      : created.reduce(
          (s, id) => bindEncoreToken(s, id, seat, instruction.encoreFor as SeatId),
          copied,
        );
  return {
    ...done(bound, [
      ...payEvents,
      ...sacrificed.events,
      ...made.events,
      ...copyEvents,
      ...hostEvents,
    ]),
    lastMoved: [...(res.lastMoved ?? []), ...created],
    performed: created.length,
  };
}
