/**
 * Builds, for the pending decision, the `Interaction` the board reads and the action bar's model
 * (prompt, buttons, cancel). Pure functions of the view, the local state and a controller, so
 * they are unit tested without a DOM. `handleDecision` makes every decision kind compile-checked.
 */
import {
  type Action,
  type DecisionHandlers,
  type GameView,
  handleDecision,
  type ObjectId,
  type PendingDecision,
  type SeatId,
} from '@commander-arena/engine';
import { canPassTurn } from '../../policy/should-stop';
import type { Interaction } from '../interaction';
import { arrangeAction, arrangeDetail, arrangementComplete, arrangePrompt } from './arrange';
import {
  allOut,
  attackableSeats,
  attackButtonLabel,
  attackedSeats,
  isRequiredAttacker,
  mustAttackText,
  retargetToSeat,
  toggleAttacker,
} from './attack';
import { attackTargetPrompt } from './attack-target';
import { taxDetail, taxRows } from './attack-tax';
import {
  blockableAttackers,
  blockButtonLabel,
  blockersOn,
  blockProblems,
  clickAttacker,
  clickBlocker,
} from './block';
import { blockRefusals, blockRefusalText } from './block-reasons';
import { blockCostDetail, blockCostHint, blockCostRow } from './block-tax';
import { toggleCard } from './cards';
import {
  cardsPrompt,
  confirmLabel,
  foundBadge,
  foundDetail,
  foundHint,
  foundReady,
  lookTakeDestination,
  toggleFound,
} from './cards-picker';
import { keptDivisionText } from './copy-division';
import { divisionComplete } from './damage';
import { divisionHint, divisionLine, sharesLeft } from './divide';
import { castBadge } from './flashback';
import { type Index, nameOf, objectIndex, plural } from './lookup';
import {
  modesDetail,
  modesHint,
  modesPrompt,
  modesSelectionLegal,
  sortedModes,
} from './modes-picker';
import { optionPrompt } from './option-picker';
import { optionalAsk } from './optional';
import { engineOrder } from './order';
import {
  candidatesInOrder,
  confirmText,
  isLegalPick,
  payDetail,
  payHint,
  payOptionsPrompt,
} from './pay-options';
import {
  clickSource,
  payBarPrompt,
  payCancelLabel,
  payLabel,
  payLifeDetail,
  tapBadges,
} from './payment';
import {
  choosePermanentPrompt,
  chosenBadge,
  permanentsDetail,
  permanentsHint,
  permanentsReady,
  togglePermanent,
} from './permanents';
import { amassDetail, isAmass } from './permanents-amass';
import {
  angelsBadge,
  angelsPermanentPrompt,
  isProliferate,
  proliferateAnswer,
  proliferateConfirmLabel,
  proliferateDetail,
  proliferatePlayers,
  proliferatePrompt,
  togglePlayer,
} from './permanents-angels';
import { entersCopyConfirm, entersCopyDetail, isEntersCopy } from './permanents-dragons';
import { isRingBearer, ringBearerDetail } from './permanents-ring';
import { isSoulbond, soulbondConfirm, soulbondDetail } from './permanents-soulbond';
import {
  clickOutcome,
  PASS_TURN_LABEL,
  PASS_TURN_NAME,
  passLabel,
  passTurnHint,
  passTurnIsPrimary,
  playableObjects,
  priorityDetail,
  priorityPrompt,
} from './priority';
import { slotLabel, targetsPrompt } from './target-prompt';
import {
  answerTargets,
  chosenObjects,
  chosenSeats,
  clickableTargets,
  currentSlot,
  sameTargets,
  slotStatuses,
  targetsReady,
  toggleTarget,
} from './targeting';
import type { UiState } from './ui-state';
import { isUntapChoice, UNTAP_PROMPT, untapButtonLabel, untapDetail } from './untap';
import {
  drawUpToButtonText,
  isDrawUpTo,
  isMultikicker,
  isPayAnyAmount,
  isReplicate,
  kickButtonText,
  payAmountButtonText,
  replicateButtonText,
  xPrompt,
} from './x-picker';

/** What the model needs from the layer: send an action, change the local state. */
export interface Controller {
  act(action: Action): void;
  update(change: (ui: UiState) => UiState): void;
  /** Opens the color popover under a source; `abilityIndex` names the ability being asked about. */
  openChooser(id: ObjectId, abilityIndex?: number): void;
  /** Tells the player why a click did nothing (a creature that must attack stays in the attack). */
  explain?(message: string): void;
  /**
   * "Pass turn" (issue 46): pass until the end of the player's turn. A controller without it (a
   * unit-test host) passes once.
   */
  passTurn?(): void;
  /** True when Full Control is on, which the "Pass turn" tooltip mentions. */
  fullControl?: boolean;
}

export interface ButtonSpec {
  readonly key: string;
  readonly label: string;
  readonly variant: 'primary' | 'secondary';
  readonly disabled: boolean;
  /** The accessible name when it must say more than the label ("Pass turn: skip to the end of my turn"). */
  readonly ariaLabel?: string;
  /** Why the button is disabled (or what it does), shown as its tooltip and in the bar. */
  readonly hint: string | null;
  readonly run: () => void;
}

export interface BarModel {
  /** One line telling the player what to do now. */
  readonly prompt: string;
  /** A second line: the reason a button is disabled, or a count. */
  readonly detail: string | null;
  /** Buttons, the primary one first. Space and Enter press the primary button. */
  readonly buttons: readonly ButtonSpec[];
  /** Esc: cancels the cast in progress (targets and payment). */
  readonly cancel: ButtonSpec | null;
  /** True when an overlay draws the buttons itself (mulligan, discard, damage, commander zone). */
  readonly inOverlay: boolean;
}

export interface DecisionModel {
  readonly interaction: Interaction;
  readonly bar: BarModel;
}

const EMPTY_OBJECTS: ReadonlySet<ObjectId> = new Set();
const EMPTY_SEATS: ReadonlySet<SeatId> = new Set();

const button = (
  key: string,
  label: string,
  run: () => void,
  opts: { primary?: boolean; disabled?: boolean; hint?: string | null; ariaLabel?: string } = {},
): ButtonSpec => ({
  key,
  label,
  run,
  ...(opts.ariaLabel === undefined ? {} : { ariaLabel: opts.ariaLabel }),
  variant: opts.primary === true ? 'primary' : 'secondary',
  disabled: opts.disabled === true,
  hint: opts.hint ?? null,
});

function interaction(parts: Partial<Interaction>): Interaction {
  return {
    clickable: EMPTY_OBJECTS,
    selected: EMPTY_OBJECTS,
    clickableSeats: EMPTY_SEATS,
    selectedSeats: EMPTY_SEATS,
    dimOthers: false,
    onObject: () => {},
    onSeat: () => {},
    badge: () => null,
    ...parts,
  };
}

/**
 * The priority buttons (issue 46). The primary one names its single pass ("To Combat") or, in the
 * first main phase with nothing able to attack, is the real "Pass Turn". In the main phases of the
 * viewer's turn with an empty stack a separate "Pass Turn" button sits next to it, also when
 * creatures could attack (it skips combat and the later steps).
 */
function priorityButtons(view: GameView, ctl: Controller): readonly ButtonSpec[] {
  const passTurn = () => (ctl.passTurn === undefined ? ctl.act({ kind: 'pass' }) : ctl.passTurn());
  const passTurnSpec = (primary: boolean): ButtonSpec =>
    button('passTurn', PASS_TURN_LABEL, passTurn, {
      primary,
      ariaLabel: PASS_TURN_NAME,
      hint: passTurnHint(ctl.fullControl === true),
    });
  if (passTurnIsPrimary(view)) return [passTurnSpec(true)];
  const one = button('pass', passLabel(view), () => ctl.act({ kind: 'pass' }), { primary: true });
  return canPassTurn(view) ? [one, passTurnSpec(false)] : [one];
}

const bar = (
  prompt: string,
  buttons: readonly ButtonSpec[],
  extra: { detail?: string | null; cancel?: ButtonSpec | null; inOverlay?: boolean } = {},
): BarModel => ({
  prompt,
  detail: extra.detail ?? null,
  buttons,
  cancel: extra.cancel ?? null,
  inOverlay: extra.inOverlay ?? false,
});

export function buildModel(
  view: GameView,
  pending: PendingDecision,
  ui: UiState,
  ctl: Controller,
): DecisionModel {
  const index = objectIndex(view);
  return handleDecision<DecisionModel>(pending, handlers(view, ui, ctl, index));
}

function handlers(
  view: GameView,
  ui: UiState,
  ctl: Controller,
  index: Index,
): DecisionHandlers<DecisionModel> {
  const { act, update } = ctl;
  return {
    priority: (d) => {
      const playable = playableObjects(d);
      return {
        interaction: interaction({
          clickable: playable,
          // Castable from elsewhere: "Flashback {cost}", "Escape {cost}, exile N other cards" or
          // "Unearth {cost}" in a graveyard, "Cast from exile" in exile.
          badge: (id) => castBadge(d, playable, index, id),
          onObject: (id) => {
            const outcome = clickOutcome(d, id, index);
            if (outcome.kind === 'act') act(outcome.action);
            else if (outcome.kind === 'choose' || outcome.kind === 'menu') ctl.openChooser(id);
          },
        }),
        bar: bar(priorityPrompt(view, index), priorityButtons(view, ctl), {
          detail: priorityDetail(view),
        }),
      };
    },

    mulligan: (d) => ({
      interaction: interaction({}),
      bar: bar(
        'Keep this hand or take a mulligan.',
        [
          button('keep', 'Keep', () => act({ kind: 'keepHand' }), { primary: true }),
          button('mulligan', 'Mulligan', () => act({ kind: 'takeMulligan' }), {
            disabled: !d.canMulligan,
            hint: d.canMulligan ? null : 'No more mulligans are possible',
          }),
        ],
        { inOverlay: true },
      ),
    }),

    mulliganBottom: (d) =>
      cardsModel(d.hand, d.count, 'Put', 'on the bottom of your library', ui, ctl),

    discard: (d) =>
      cardsModel(d.hand, d.count, 'Discard', 'to reach your maximum hand size', ui, ctl),

    targets: (d) => {
      const slot = currentSlot(d.specs, ui.targets);
      const ready = targetsReady(d.specs, ui.targets);
      const { objects, seats } = clickableTargets(d.specs, ui.targets);
      const slots = slotStatuses(d.specs, ui.targets);
      const need = slots.reduce((n, s) => n + Math.max(0, s.spec.min - s.count), 0);
      const prompt = targetsPrompt(d, index, slot);
      const kept = keptDivisionText(d, index, view.viewer);
      const detail = [
        ...slots.map((s, i) =>
          d.specs.length > 1
            ? `${slotLabel(d.specs, i)}: ${s.count} of ${rangeText(s.spec.min, s.spec.max)}`
            : `${s.count} of ${rangeText(s.spec.min, s.spec.max)} chosen${s.spec.onePerGroup === true ? ', at most one for each opponent' : ''}`,
        ),
        // D-149 (CR 707.10, 115.7f): a copy of a divided spell keeps the shares of the original.
        ...(kept === null ? [] : [kept]),
        // D-145 (CR 601.2d): how much of the divided damage is not yet given to a target.
        ...slots.flatMap((s) =>
          s.spec.divide !== undefined && s.count > 0
            ? [divisionLine(s.spec.divide, sharesLeft(d.specs, ui.targets, s.spec.specId))]
            : [],
        ),
      ].join('. ');
      return {
        interaction: interaction({
          clickable: objects,
          clickableSeats: seats,
          selected: chosenObjects(ui.targets),
          selectedSeats: chosenSeats(ui.targets),
          dimOthers: true,
          onObject: (id) =>
            update((u) => ({
              ...u,
              targets: toggleTarget(d.specs, u.targets, { kind: 'object', id, specId: '' }),
            })),
          onSeat: (seat) =>
            update((u) => ({
              ...u,
              targets: toggleTarget(d.specs, u.targets, { kind: 'player', seat, specId: '' }),
            })),
          badge: (id) => (chosenObjects(ui.targets).has(id) ? 'Target' : null),
        }),
        bar: bar(
          prompt,
          [
            button(
              'confirm',
              d.forCopy === true && sameTargets(ui.targets, d.current ?? [])
                ? 'Keep the targets'
                : 'Confirm',
              () => act({ kind: 'chooseTargets', targets: answerTargets(d.specs, ui.targets) }),
              {
                primary: true,
                disabled: !ready,
                hint: ready
                  ? null
                  : need > 0
                    ? `Choose ${plural(need, 'more target')}`
                    : (divisionHint(d.specs, ui.targets) ?? 'Choose the targets'),
              },
            ),
          ],
          {
            detail,
            // A trigger goes on the stack whether or not the player likes it (CR 603.3d): the
            // engine refuses `cancel` for it, so there is no button and Esc does nothing.
            // A copy of a spell is on the stack already (CR 707.10c): no cancel either.
            cancel:
              d.forTrigger === true || d.forCopy === true || d.forChange === true
                ? null
                : button('cancel', 'Cancel', () => act({ kind: 'cancel' })),
          },
        ),
      };
    },

    payMana: (d) => {
      const badges = tapBadges(ui.taps);
      const sources = new Set(d.manaSources.map((s) => s.object));
      return {
        interaction: interaction({
          clickable: sources,
          selected: new Set(ui.taps.map((t) => t.object)),
          dimOthers: true,
          onObject: (id) => {
            // An ability that offers several colors asks which one first.
            const click = clickSource(ui.taps, d.manaSources, id);
            if (click.kind === 'choose') {
              ctl.openChooser(id, click.abilityIndex);
              return;
            }
            const taps = click.taps;
            update((u) => ({ ...u, taps }));
          },
          badge: (id) => badges.get(id) ?? null,
        }),
        bar: bar(
          payBarPrompt(d, index),
          [
            button(
              'pay',
              payLabel(ui.taps.length),
              () => act({ kind: 'payManual', taps: ui.taps }),
              {
                primary: true,
              },
            ),
            button('auto', 'Auto-pay', () => act({ kind: 'payAuto' })),
          ],
          {
            detail: payLifeDetail(ui.taps, index),
            cancel: button('cancel', payCancelLabel(d), () => act({ kind: 'cancel' })),
          },
        ),
      };
    },

    choosePermanent: (d) => {
      // The untap step (CR 502.3, D-125): a checklist in a dialog, nothing to click on the board.
      if (isUntapChoice(d)) {
        const total = d.legal.length;
        const untapping = ui.permanents.length;
        return {
          interaction: interaction({}),
          bar: bar(
            UNTAP_PROMPT,
            [
              button(
                'confirm',
                untapButtonLabel(untapping, total),
                () => act({ kind: 'choosePermanents', objects: ui.permanents }),
                { primary: true },
              ),
            ],
            { detail: untapDetail(untapping, total), inOverlay: true },
          ),
        };
      }
      // Proliferate (CR 701.34a, D-149): any number of permanents with counters and of players with poison counters.
      if (isProliferate(d)) {
        return {
          interaction: interaction({
            clickable: new Set(d.legal),
            selected: new Set(ui.permanents),
            clickableSeats: new Set(proliferatePlayers(d)),
            selectedSeats: new Set(ui.players),
            dimOthers: true,
            onObject: (id) =>
              update((u) => ({ ...u, permanents: togglePermanent(u.permanents, d, id) })),
            onSeat: (seat) => update((u) => ({ ...u, players: togglePlayer(u.players, d, seat) })),
            badge: (id) => (ui.permanents.includes(id) ? 'Proliferate' : null),
          }),
          bar: bar(
            proliferatePrompt(d, index),
            [
              button(
                'confirm',
                proliferateConfirmLabel(ui.permanents.length, ui.players.length),
                () => act(proliferateAnswer(ui.permanents, ui.players)),
                { primary: true },
              ),
            ],
            { detail: proliferateDetail(ui.permanents.length, ui.players.length), inOverlay: true },
          ),
        };
      }
      const ready = permanentsReady(ui.permanents, d);
      return {
        interaction: interaction({
          clickable: new Set(d.legal),
          selected: new Set(ui.permanents),
          dimOthers: true,
          onObject: (id) =>
            update((u) => ({ ...u, permanents: togglePermanent(u.permanents, d, id) })),
          badge: (id) =>
            ui.permanents.includes(id)
              ? (angelsBadge(d, index) ?? chosenBadge(d, index))
              : // D-145 (CR 701.14): the creature that fights the one chosen, when several of the same name ask in turn.
                d.purpose === 'fight' && d.subject === id
                ? 'Fighter'
                : null,
        }),
        bar: bar(
          angelsPermanentPrompt(d, index) ?? choosePermanentPrompt(d, index),
          [
            button(
              'confirm',
              isEntersCopy(d)
                ? entersCopyConfirm(ui.permanents)
                : isSoulbond(d)
                  ? soulbondConfirm(ui.permanents)
                  : 'Confirm',
              () => act({ kind: 'choosePermanents', objects: ui.permanents }),
              { primary: true, disabled: !ready, hint: permanentsHint(ui.permanents, d) },
            ),
          ],
          {
            detail: isEntersCopy(d)
              ? entersCopyDetail(ui.permanents, d, index)
              : isRingBearer(d)
                ? ringBearerDetail(ui.permanents, index)
                : isAmass(d)
                  ? amassDetail(ui.permanents, index)
                  : isSoulbond(d)
                    ? soulbondDetail(ui.permanents, index)
                    : permanentsDetail(ui.permanents, d),
            // A sacrifice or a crew that is a cost of an ability being activated can be taken back:
            // Cancel rewinds the whole activation (CR 602.2b, 733), like cancelling a cast.
            cancel: d.forCost ? button('cancel', 'Cancel', () => act({ kind: 'cancel' })) : null,
          },
        ),
      };
    },

    chooseCards: (d) => {
      const ready = foundReady(ui.found, d);
      const to = lookTakeDestination(d, index);
      const label = confirmLabel(d, ui.found, to);
      return {
        interaction: interaction({
          clickable: new Set(d.legal),
          selected: new Set(ui.found),
          // A discard chooses among the cards of the hand, so the rest of the board steps back;
          // a library search has nothing on the board to point at.
          // A Behold chooses among the cards of the hand and the permanents you control (D-151), so the rest steps back too.
          dimOthers: d.zone === 'hand' || d.purpose === 'behold',
          onObject: (id) => update((u) => ({ ...u, found: toggleFound(u.found, d, id) })),
          badge: (id) => foundBadge(d, ui.found, id, to),
        }),
        bar: bar(
          cardsPrompt(d, index),
          [
            button('confirm', label, () => act({ kind: 'chooseCards', objects: ui.found }), {
              primary: true,
              disabled: !ready,
              hint: foundHint(ui.found, d),
            }),
          ],
          {
            detail: foundDetail(d, ui.found),
            // A discard that is a cost can be taken back: Cancel rewinds the whole cast or activation
            // (CR 733). Ward's discard has none: the payer already accepted.
            cancel:
              d.forCost === true ? button('cancel', 'Cancel', () => act({ kind: 'cancel' })) : null,
          },
        ),
      };
    },

    // The dialog draws the piles and the buttons (ArrangePanel); there is no way out, the effect is
    // resolving (CR 701.22a, 701.25a).
    arrangeCards: (d) => ({
      interaction: interaction({}),
      bar: bar(
        arrangePrompt(d),
        [
          button('confirm', 'Confirm', () => act(arrangeAction(ui.arrange, d)), {
            primary: true,
            disabled: !arrangementComplete(d, ui.arrange),
          }),
        ],
        { detail: arrangeDetail(d, ui.arrange), inOverlay: true },
      ),
    }),

    orderTriggers: (d) => ({
      interaction: interaction({}),
      bar: bar(
        'Order your triggered abilities.',
        [
          button(
            'confirm',
            'Confirm order',
            () => act({ kind: 'orderTriggers', order: engineOrder(ui.triggerOrder) }),
            { primary: true },
          ),
        ],
        {
          detail: `${plural(d.triggers.length, 'ability', 'abilities')} triggered. The top one resolves first, the bottom one last.`,
        },
      ),
    }),

    confirmOptional: (d) => {
      // Four questions share this decision (optional.ts): "you may", a shock land's "pay or enter
      // tapped", kicker (its Cancel rewinds the cast) and ward's "pay or it is countered".
      const ask = optionalAsk(d, index);
      return {
        interaction: interaction({}),
        bar: bar(
          ask.prompt,
          [
            button('yes', ask.yes, () => act({ kind: 'acceptOptional' }), { primary: true }),
            button('no', ask.no, () => act({ kind: 'declineOptional' })),
          ],
          {
            inOverlay: true,
            cancel: ask.cancellable
              ? button('cancel', 'Cancel', () => act({ kind: 'cancel' }))
              : null,
          },
        ),
      };
    },

    // The dialog draws the search box or the five colors itself (OptionDialog); there is no way out,
    // the permanent cannot enter before it is chosen (CR 614.12a).
    chooseOption: (d) => ({
      interaction: interaction({}),
      bar: bar(d.purpose === 'attackTarget' ? attackTargetPrompt(d, index) : optionPrompt(d), [], {
        inOverlay: true,
      }),
    }),

    // The dialog draws the number input (XDialog); Cancel rewinds the cast or activation (CR 733).
    chooseX: (d) => ({
      interaction: interaction({}),
      bar: bar(
        xPrompt(d),
        [
          button(
            'confirm',
            isMultikicker(d)
              ? kickButtonText(ui.x)
              : isReplicate(d)
                ? replicateButtonText(ui.x)
                : isPayAnyAmount(d)
                  ? payAmountButtonText(d, ui.x)
                  : isDrawUpTo(d)
                    ? drawUpToButtonText(ui.x)
                    : `Choose X = ${ui.x}`,
            () => act({ kind: 'chooseX', value: ui.x }),
            { primary: true },
          ),
        ],
        {
          inOverlay: true,
          // D-151: paying any amount has no way back, 0 is the way out (the engine lists no `cancel`).
          cancel:
            isPayAnyAmount(d) || isDrawUpTo(d)
              ? null
              : button('cancel', 'Cancel', () => act({ kind: 'cancel' })),
        },
      ),
    }),

    // The dialog draws the modes (ModesDialog); Cancel rewinds the cast or activation (CR 733) but a
    // triggered ability goes on the stack whether or not the player likes it (CR 603.3c): no way out.
    chooseModes: (d) => ({
      interaction: interaction({}),
      bar: bar(
        modesPrompt(d),
        [
          button(
            'confirm',
            'Confirm',
            () => act({ kind: 'chooseModes', modes: sortedModes(ui.modes) }),
            {
              primary: true,
              disabled: !modesSelectionLegal(d, ui.modes),
              hint: modesHint(d, ui.modes),
            },
          ),
        ],
        {
          detail: modesDetail(d, ui.modes),
          inOverlay: true,
          cancel:
            d.forTrigger === true
              ? null
              : button('cancel', 'Cancel', () => act({ kind: 'cancel' })),
        },
      ),
    }),

    // The dialog draws the candidates (PayOptionsDialog); Cancel rewinds the cast (CR 733). The engine's
    // listed answers decide whether Confirm is enabled: an answer that leaves a cost nothing can pay is
    // not one of them. The autopilot never answers it.
    choosePayOptions: (d) => ({
      interaction: interaction({}),
      bar: bar(
        payOptionsPrompt(d, index),
        [
          button(
            'confirm',
            confirmText(d, ui.payOptions),
            () =>
              act({
                kind: 'choosePayOptions',
                objects: candidatesInOrder(d, ui.payOptions),
              }),
            {
              primary: true,
              disabled: !isLegalPick(d, ui.payOptions),
              hint: payHint(d, ui.payOptions),
            },
          ),
        ],
        {
          detail: payDetail(d, ui.payOptions),
          inOverlay: true,
          cancel: button('cancel', 'Cancel', () => act({ kind: 'cancel' })),
        },
      ),
    }),

    commanderZone: (d) => ({
      interaction: interaction({}),
      bar: bar(
        `Move ${nameOf(index, d.object)} to the command zone?`,
        [
          button('yes', 'Yes', () => act({ kind: 'moveToCommandZone' }), { primary: true }),
          button('no', 'No', () => act({ kind: 'declineCommandZone' })),
        ],
        { inOverlay: true },
      ),
    }),

    declareAttackers: (d) => {
      const picked = new Set(ui.attacks.map((a) => a.attacker));
      const label = (id: ObjectId) => ui.attacks.find((a) => a.attacker === id);
      const seats = attackableSeats(d.candidates);
      // The cost of attacking (CR 508.1h, D-125): what the chosen attack would cost to pay.
      const taxLine = taxDetail(taxRows(d, ui.attacks, index, view.viewer));
      return {
        interaction: interaction({
          clickable: new Set(d.candidates.map((c) => c.attacker)),
          selected: picked,
          clickableSeats: seats,
          selectedSeats: attackedSeats(ui.attacks),
          dimOthers: true,
          onObject: (id) => {
            // CR 508.1d: a creature that attacks each combat if able stays in the attack.
            if (picked.has(id) && isRequiredAttacker(d, id)) {
              ctl.explain?.(mustAttackText([nameOf(index, id)]));
              return;
            }
            update((u) => ({
              ...u,
              attacks: toggleAttacker(u.attacks, d.candidates, id, u.preferredTarget, d.mustAttack),
            }));
          },
          onSeat: (seat) =>
            update((u) => ({
              ...u,
              preferredTarget: { kind: 'player', seat },
              attacks: retargetToSeat(u.attacks, d.candidates, seat),
            })),
          badge: (id) => {
            const pick = label(id);
            if (pick === undefined) return null;
            const must = isRequiredAttacker(d, id);
            if (pick.target.kind === 'permanent') {
              return `${must ? 'Must attack' : 'Attacks'} ${nameOf(index, pick.target.object)}`;
            }
            return must ? 'Must attack' : 'Attacking';
          },
        }),
        bar: bar(
          d.candidates.length === 0 ? 'No creature can attack.' : 'Declare attackers.',
          [
            button(
              'all-out',
              'Attack with all',
              () => update((u) => ({ ...u, attacks: allOut(d.candidates, u.preferredTarget) })),
              { disabled: d.candidates.length === 0 },
            ),
            button(
              'attack',
              attackButtonLabel(ui.attacks.length),
              () => act({ kind: 'declareAttackers', attacks: ui.attacks }),
              { primary: true },
            ),
          ],
          {
            detail:
              d.candidates.length === 0
                ? null
                : `${
                    ui.attacks.length === 0
                      ? 'Click creatures to attack with.'
                      : `${plural(ui.attacks.length, 'creature')} attacking.${
                          d.mustAttack.length === 0
                            ? ''
                            : ` ${mustAttackText(d.mustAttack.map((id) => nameOf(index, id)))}`
                        }`
                  }${taxLine === null ? '' : ` ${taxLine}`}`,
          },
        ),
      };
    },

    declareBlockers: (d) => {
      const problems = blockProblems(d.attackers, ui.block.blocks);
      const blockable = blockableAttackers(ui.block, d.candidates, d.attackers);
      const blockers = new Set(d.candidates.map((c) => c.blocker));
      const picked = ui.block.blocker;
      const names = (id: ObjectId) => nameOf(index, id);
      const firstProblem = problems[0];
      const refusal = picked === null ? null : blockRefusalOf(view, d, picked, blockable, index);
      // D-149 (CR 509.1d): "Creatures can't block unless their controller pays {1} for each of those creatures".
      const cost = blockCostRow(d, ui.block.blocks, index);
      const costLine = blockCostDetail(cost);
      const guidance =
        firstProblem === undefined
          ? picked !== null
            ? `${names(picked)} selected: click an attacker to block it.${refusal === null ? '' : ` ${refusal}`}`
            : d.candidates.length === 0
              ? null
              : 'Click a creature, then the attacker it blocks.'
          : `${names(firstProblem.attacker)} needs ${firstProblem.need} blockers (has ${firstProblem.have}). Add a blocker or release it.`;
      const detail =
        costLine === null ? guidance : guidance === null ? costLine : `${guidance} ${costLine}`;
      return {
        interaction: interaction({
          clickable: new Set([...blockers, ...blockable]),
          selected: new Set([
            ...ui.block.blocks.map((b) => b.blocker),
            ...(picked === null ? [] : [picked]),
          ]),
          dimOthers: true,
          pendingBlocks: ui.block.blocks,
          onObject: (id) =>
            update((u) => ({
              ...u,
              block: blockers.has(id)
                ? clickBlocker(u.block, d.candidates, id)
                : clickAttacker(u.block, d.candidates, id, d.attackers),
            })),
          badge: (id) => {
            const block = ui.block.blocks.find((b) => b.blocker === id);
            if (block !== undefined) {
              // The same number the board draws on the attacker and on this blocker (`combatRoles`).
              const n = d.attackers.findIndex((a) => a.attacker === block.attacker) + 1;
              return `Blocks #${n}`;
            }
            if (picked === id) return 'Choose attacker';
            const attacker = d.attackers.find((a) => a.attacker === id);
            if (attacker === undefined) return null;
            const n = blockersOn(ui.block.blocks, id);
            const most = attacker.maxBlockers;
            if (n === 0) {
              if (attacker.minBlockers > 1) return `needs ${attacker.minBlockers} blockers`;
              return most === undefined ? null : `at most ${plural(most, 'blocker')}`;
            }
            if (n < attacker.minBlockers) {
              return `${plural(n, 'blocker')}, needs ${attacker.minBlockers}`;
            }
            return most !== undefined && n >= most
              ? `${plural(n, 'blocker')}, the most`
              : plural(n, 'blocker');
          },
        }),
        bar: bar(
          d.candidates.length === 0 ? 'You have no creature that can block.' : 'Declare blockers.',
          [
            button(
              'block',
              blockButtonLabel(ui.block.blocks.length),
              () => act({ kind: 'declareBlockers', blocks: ui.block.blocks }),
              {
                primary: true,
                disabled: problems.length > 0 || cost?.over === true,
                hint:
                  problems.length > 0
                    ? 'An attacker with menace needs two blockers'
                    : blockCostHint(cost),
              },
            ),
          ],
          { detail },
        ),
      };
    },

    assignDamage: (d) => {
      const complete = divisionComplete(d.choices, ui.damage);
      return {
        interaction: interaction({}),
        bar: bar('Divide combat damage.', [
          button(
            'confirm',
            'Confirm',
            () => act({ kind: 'assignDamage', assignments: ui.damage }),
            {
              primary: true,
              disabled: !complete,
              hint: complete ? null : 'Assign all of the damage',
            },
          ),
        ]),
      };
    },
  };
}

export { optionalPrompt, payPrompt } from './optional';

/**
 * Why the picked-up blocker cannot block the attackers the engine does not offer for it, when
 * evasion explains it (block-reasons.ts); null when there is nothing to say.
 */
function blockRefusalOf(
  view: GameView,
  d: Extract<PendingDecision, { kind: 'declareBlockers' }>,
  picked: ObjectId,
  blockable: readonly ObjectId[],
  index: Index,
): string | null {
  const blocker = index.get(picked);
  if (blocker === undefined) return null;
  const defending = view.battlefield.filter((o) => o.controller === blocker.controller);
  const refused = d.attackers.flatMap((a) => {
    const attacker = index.get(a.attacker);
    if (attacker === undefined || blockable.includes(a.attacker)) return [];
    // D-133: an attacker the engine lets this creature block, but that has its most blockers already.
    const full = d.candidates.find((c) => c.blocker === picked)?.canBlock.includes(a.attacker)
      ? a.maxBlockers
      : undefined;
    return [{ attacker, reasons: blockRefusals(attacker, blocker, defending, full) }];
  });
  return blockRefusalText(blocker, refused);
}

function rangeText(min: number, max: number): string {
  return min === max ? String(max) : `${min} to ${max}`;
}

/** mulliganBottom and discard: pick exactly `count` cards of the hand. */
function cardsModel(
  hand: readonly ObjectId[],
  count: number,
  verb: string,
  tail: string,
  ui: UiState,
  ctl: Controller,
): DecisionModel {
  const ready = ui.cards.length === count;
  return {
    interaction: interaction({
      clickable: new Set(hand),
      selected: new Set(ui.cards),
      onObject: (id) => ctl.update((u) => ({ ...u, cards: toggleCard(u.cards, hand, id, count) })),
      badge: (id) => (ui.cards.includes(id) ? verb : null),
    }),
    bar: bar(
      `${verb} ${plural(count, 'card')} ${tail}.`,
      [
        button('confirm', 'Confirm', () => ctl.act({ kind: 'chooseCards', objects: ui.cards }), {
          primary: true,
          disabled: !ready,
          hint: ready ? null : `Choose ${count - ui.cards.length} more`,
        }),
      ],
      { detail: `${ui.cards.length} of ${count} chosen`, inOverlay: true },
    ),
  };
}
