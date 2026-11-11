/**
 * Words for the "cast later" family (D-128): Suspend (CR 702.62), Madness (CR 702.35), Foretell
 * (CR 702.143) and the delayed triggered ability of an effect (CR 603.7). Everything here is read from
 * the view's fields (`ObjectView.specialActions`, `counters.time`, `faceDown`, `foretold`, the AST of an
 * ability on the stack) and never from a card's name or Oracle text, except the one cosmetic read of
 * `delayedWording` (see there). Pure functions, tested in `test/later-model.test.ts`.
 *
 * Hidden information: a foretold card is face down in exile (CR 702.143a). Its owner's view has the whole
 * card; every other view has a placeholder named "Face-down card". The words below never ask for more
 * than the view has, so the other player's page cannot show what the card is.
 */
import type { ObjectView, StackAbility, TriggerStep } from '@commander-arena/engine';

export type SpecialAction = NonNullable<ObjectView['specialActions']>[number];

/** The name the engine gives a face-down card to a viewer who may not look at it. */
export const FACE_DOWN_NAME = 'Face-down card';

/** "{1}{B}": mana symbols as text; the empty cost is {0}. */
export function manaText(symbols: readonly string[]): string {
  return symbols.length === 0 ? '{0}' : symbols.map((s) => `{${s}}`).join('');
}

/** "1 time counter", "2 time counters". */
export function timeCounters(count: number): string {
  return `${count} time counter${count === 1 ? '' : 's'}`;
}

/**
 * The button of a special action of a card in the hand: "Suspend 2 — {1}{B}" (the counters and the cost
 * to exile it) and "Foretell {2}". A card whose view does not list the action gets the bare word.
 */
export function specialActionLabel(
  kind: SpecialAction['kind'],
  card: ObjectView | undefined,
): string {
  const entry = card?.specialActions?.find((a) => a.kind === kind);
  if (kind === 'foretell') {
    return entry === undefined ? 'Foretell' : `Foretell ${manaText(entry.cost)}`;
  }
  if (entry === undefined) return 'Suspend';
  const counters = entry.counters === undefined ? '' : ` ${entry.counters}`;
  return `Suspend${counters} — ${manaText(entry.cost)}`;
}

/** The line under the button: what the action does, from the same fields. */
export function specialActionDetail(
  kind: SpecialAction['kind'],
  card: ObjectView | undefined,
): string {
  const entry = card?.specialActions?.find((a) => a.kind === kind);
  if (kind === 'suspend') {
    return entry?.counters === undefined
      ? 'Exile it with time counters. Cast it for free when the last is gone.'
      : `Exile it with ${timeCounters(entry.counters)}. Cast it for free when the last is gone.`;
  }
  return entry?.castCost === undefined
    ? 'Exile it face down. Cast it later for its foretell cost.'
    : `Exile it face down. Cast it from a later turn for ${manaText(entry.castCost)}.`;
}

/**
 * The prompt of the payment of a special action: "Pay {1}{B} to suspend Name with 2 time counters" and
 * "Pay {2} to foretell Name". `name` is the card in the hand (the viewer's own).
 */
export function specialPayPrompt(
  purpose: 'suspend' | 'foretell',
  cost: readonly string[],
  name: string,
  card: ObjectView | undefined,
): string {
  if (purpose === 'foretell') return `Pay ${manaText(cost)} to foretell ${name}`;
  const counters = card?.specialActions?.find((a) => a.kind === 'suspend')?.counters;
  return `Pay ${manaText(cost)} to suspend ${name}${counters === undefined ? '' : ` with ${timeCounters(counters)}`}`;
}

/** The dock line of the payment: what happens once it is paid, and what Cancel does. */
export function specialPayDetail(
  purpose: 'suspend' | 'foretell',
  name: string,
  card: ObjectView | undefined,
): string {
  const entry = card?.specialActions?.find((a) => a.kind === purpose);
  if (purpose === 'suspend') {
    const counters = entry?.counters === undefined ? '' : ` with ${timeCounters(entry.counters)}`;
    return `Once this is paid, ${name} is exiled${counters}. Cancel keeps it in your hand.`;
  }
  const cast = entry?.castCost === undefined ? '' : ` for ${manaText(entry.castCost)}`;
  return `Once this is paid, ${name} is exiled face down; from a later turn you may cast it${cast}. Cancel keeps it in your hand.`;
}

/** The label of Cancel at the payment of a special action: nothing has happened, priority comes back. */
export const SPECIAL_CANCEL = 'Cancel';

/** What a suspend or madness question is about, for the log and the dialog. */
export function castNowPrompt(
  purpose: 'suspend' | 'madness',
  name: string,
  cost: readonly string[] | undefined,
): string {
  if (purpose === 'suspend') {
    return `Cast ${name} now without paying its mana cost? (its last time counter was removed)`;
  }
  return `Cast ${name} for its madness cost${cost === undefined ? '' : ` ${manaText(cost)}`}?`;
}

/** The two buttons of those questions, with what declining does to the card. */
export function castNowButtons(
  purpose: 'suspend' | 'madness',
  cost: readonly string[] | undefined,
): { readonly yes: string; readonly no: string } {
  return purpose === 'suspend'
    ? { yes: 'Cast it', no: "Don't cast it (it stays in exile)" }
    : {
        yes: cost === undefined ? 'Cast it' : `Cast it for ${manaText(cost)}`,
        no: "Don't cast it (it goes to the graveyard)",
      };
}

/**
 * What an engine ability of Suspend or Madness says on the stack: when it happened ("At the beginning of
 * your upkeep", "When the last time counter is removed from Name", "When Name is exiled with madness"; the
 * upkeep is the controller's) and what it does ("Remove a time counter from Name.", "Cast Name without
 * paying its mana cost.", "Cast Name for its madness cost."). Null for any other ability.
 */
export function laterAbilityWords(
  ability: StackAbility,
  name: string,
  mine: boolean,
): { readonly when: string; readonly does: string } | null {
  const { effect } = ability;
  if (effect.kind === 'removeTimeCounter') {
    return {
      when: `At the beginning of ${mine ? 'your' : "the opponent's"} upkeep`,
      does: `Remove a time counter from ${name}.`,
    };
  }
  if (effect.kind !== 'castExiled') return null;
  return effect.mode === 'suspend'
    ? {
        when: `When the last time counter is removed from ${name}`,
        does: `Cast ${name} without paying its mana cost.`,
      }
    : {
        when: `When ${name} is exiled with madness`,
        does: `Cast ${name} for its madness cost.`,
      };
}

/**
 * The wording of a waiting trigger of the engine's own (`abilityIndex` -1) whose source is a card in exile
 * (D-128): Suspend's upkeep tick says "At the beginning of your upkeep" while the card still has time
 * counters. The cast ability (last counter gone) and Madness's have no wording the decision could carry,
 * so they give null and the panel shows the card's text. Undefined when the trigger is not of that kind
 * and the usual words apply.
 */
export function laterOrderWording(
  abilityIndex: number,
  source: Pick<ObjectView, 'zone' | 'counters'> | undefined,
): string | null | undefined {
  if (abilityIndex !== -1 || source?.zone !== 'exile') return undefined;
  return timeCountersOn(source) > 0 ? 'At the beginning of your upkeep' : null;
}

const STEP_NAMES: Readonly<Record<TriggerStep, string>> = {
  upkeep: 'upkeep',
  draw: 'draw step',
  main1: 'precombat main phase',
  beginCombat: 'combat',
  combatEnd: 'end of combat',
  main2: 'postcombat main phase',
  endStep: 'end step',
};

/**
 * "At the beginning of the next turn's upkeep" for a delayed triggered ability of an effect (CR 603.7:
 * "You draw a card at the beginning of the next turn's upkeep"), "At the beginning of your next upkeep"
 * for the controller's own. The engine's delayed ability is a `step` trigger, the same node a permanent's
 * "At the beginning of each upkeep" is, and the view does not mark it as delayed; the one thing that
 * tells them apart is the source's own text, which says "next". A trigger that is not a step, or whose
 * source does not say "next", gets null and is worded as any trigger is (true either way, only less exact).
 */
export function delayedWording(ability: StackAbility, sourceText: string): string | null {
  if (ability.kind !== 'triggered' || ability.trigger.kind !== 'step') return null;
  if (!/\bnext\b/i.test(sourceText)) return null;
  const { step, whose } = ability.trigger;
  if (whose === 'opponent') return null;
  if (whose === 'you') return `At the beginning of your next ${STEP_NAMES[step]}`;
  return step === 'upkeep'
    ? "At the beginning of the next turn's upkeep"
    : `At the beginning of the next ${STEP_NAMES[step]}`;
}

/** "draw a card" from "You draw a card": the delayed sentence reads after a comma. */
export function dropYou(gist: string): string {
  return gist.startsWith('You ') ? gist.slice(4) : gist;
}

/**
 * True for the view of a face-down card that its viewer may not look at (a placeholder): a foretold card of the other player
 * (CR 702.143a) or a card Hideaway exiled (CR 702.75a, D-145) that the viewer may not look at. The engine names it "Face-down
 * card" and shows nothing else. The controller of a Hideaway permanent has `faceDown` too, with the whole card: not hidden.
 */
export function isHiddenFaceDown(o: Pick<ObjectView, 'faceDown' | 'foretold' | 'name'>): boolean {
  return o.faceDown === true && o.foretold !== true && o.name === FACE_DOWN_NAME;
}

/** True for a card the viewer may look at that Hideaway exiled face down (CR 702.75a, D-145): in exile, face down, not foretold. */
export function isOwnHideaway(
  o: Pick<ObjectView, 'faceDown' | 'foretold' | 'name' | 'zone' | 'exiledFaceDown'>,
): boolean {
  return (
    o.zone === 'exile' &&
    o.faceDown === true &&
    o.foretold !== true &&
    o.exiledFaceDown !== true &&
    !isHiddenFaceDown(o)
  );
}

/**
 * True for a card the viewer may look at that an effect exiled face down (CR 406.3, D-187: "Expensive Taste"): in exile, face down by an effect, the
 * whole card shown to its looker; every other player has the placeholder.
 */
export function isLookedAtFaceDown(
  o: Pick<ObjectView, 'faceDown' | 'name' | 'zone' | 'exiledFaceDown' | 'foretold'>,
): boolean {
  return o.zone === 'exile' && o.exiledFaceDown === true && !isHiddenFaceDown(o);
}

/** True for a foretold card of the viewer's in exile (CR 702.143a): the full card, face down. */
export function isOwnForetold(o: Pick<ObjectView, 'foretold' | 'zone'>): boolean {
  return o.foretold === true && o.zone === 'exile';
}

/** The time counters on a suspended card in exile (CR 702.62b); 0 for any other object. */
export function timeCountersOn(o: Pick<ObjectView, 'counters' | 'zone'>): number {
  return o.zone === 'exile' ? (o.counters.time ?? 0) : 0;
}

/** The foretell cost of a foretold card of the viewer's, as mana symbols; null when the view lacks it. */
export function foretellCost(o: Pick<ObjectView, 'alternativeCosts'>): readonly string[] | null {
  return o.alternativeCosts?.find((c) => c.kind === 'foretell')?.cost ?? null;
}

/**
 * The marks a card in exile shows in the exile viewer and the strip: "time 2" for a suspended card,
 * "Foretold" for the viewer's own foretold card (with the turn rule), "Foretold (face down)" for the
 * placeholder of the other player's. Empty for any other card.
 */
export function exileMarks(o: ObjectView): readonly string[] {
  if (o.zone !== 'exile') return [];
  if (isHiddenFaceDown(o)) return ['face down'];
  // D-145 (CR 702.75a): the card the viewer's own Hideaway permanent exiled.
  if (isOwnHideaway(o)) return ['Hideaway'];
  // D-187 (CR 406.3): exiled face down by an effect that lets the viewer look at it.
  if (isLookedAtFaceDown(o)) return ['face down, you may look'];
  const marks: string[] = [];
  const time = timeCountersOn(o);
  if (time > 0) marks.push(`time ${time}`);
  if (isOwnForetold(o)) marks.push('Foretold');
  return marks;
}

/** The facts the preview panel lists for such a card; empty for any other. */
export function laterFacts(o: ObjectView, viewer: number): readonly string[] {
  if (o.zone !== 'exile') return [];
  if (isHiddenFaceDown(o)) {
    return [
      // The view cannot tell a foretold card from one Hideaway exiled, and says neither (D-145).
      `A face-down card in exile: ${o.owner === viewer ? 'yours' : "the opponent's"}. You cannot look at it`,
    ];
  }
  if (isLookedAtFaceDown(o)) {
    return [
      `Exiled face down: only you can look at it, for as long as it stays in exile. You may play it from exile${o.owner === viewer ? '' : " (it is the opponent's card)"}`,
    ];
  }
  if (isOwnHideaway(o)) {
    return [
      'Exiled face down by Hideaway: only you can look at it, for as long as the permanent that exiled it stays on the battlefield. Its ability may let you play it without paying its mana cost',
    ];
  }
  const facts: string[] = [];
  const time = timeCountersOn(o);
  if (time > 0) {
    facts.push(
      `Suspended with ${timeCounters(time)}: one is removed at the beginning of its owner's upkeep, and when the last is gone it is cast without paying its mana cost`,
    );
  }
  if (isOwnForetold(o)) {
    const cost = foretellCost(o);
    facts.push(
      `Foretold: face down in exile, only you can look at it. From a later turn you may cast it${cost === null ? '' : ` for ${manaText(cost)}`}`,
    );
  }
  return facts;
}
