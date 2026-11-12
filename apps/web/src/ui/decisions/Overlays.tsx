/**
 * The decision overlays: modal ones (mulligan, discard, commander zone, damage) and the dock panels
 * that sit above the action bar (target list, attack targets, payment, mana color chooser).
 */
import {
  type Action,
  type DecisionHandlers,
  type GameView,
  handleDecision,
  type ObjectId,
  type PendingDecision,
} from '@commander-arena/engine';
import type { ReactNode } from 'react';
import { specialPayDetail } from '../../game/later-text';
import { ManaCost } from '../mana';
import { ArrangePanel } from './ArrangePanel';
import { AttackTargetDialog } from './AttackTargetDialog';
import { setAttackTarget } from './attack';
import { attackTaxDetail, taxRows, taxRowText, taxRowWarning } from './attack-tax';
import { BarButtons } from './BarButtons';
import { blockCostRow, blockCostText, blockCostWarning, blockTaxDetail } from './block-tax';
import { CardPickerPanel } from './CardPickerPanel';
import { toggleCard } from './cards';
import { commanderZoneDetail } from './commander-zone';
import { DamagePanel } from './DamagePanel';
import { Dialog } from './Dialog';
import { attackTargetLabel, myHand, nameOf, objectIndex, plural, sameAttackTarget } from './lookup';
import { MiniCard } from './MiniCard';
import { ModesDialog } from './ModesDialog';
import type { DecisionModel } from './model';
import { NamedOptionDialog } from './NamedOptionDialog';
import { OptionalDialog } from './OptionalDialog';
import { OptionDialog } from './OptionDialog';
import { OrderPanel } from './OrderPanel';
import { PassingDamagePanel } from './PassingDamagePanel';
import { PayOptionsDialog } from './PayOptionsDialog';
import { PermanentPanel } from './PermanentPanel';
import { PilesDialog } from './PilesDialog';
import { ProliferateDialog } from './ProliferateDialog';
import { sacrificesWhenTapped } from './payment';
import { isProliferate } from './permanents-angels';
import { TargetsPanel } from './TargetsPanel';
import { UntapDialog } from './UntapDialog';
import type { UiState } from './ui-state';
import { isUntapChoice } from './untap';
import { XDialog } from './XDialog';

export interface OverlayProps {
  readonly view: GameView;
  readonly pending: PendingDecision;
  readonly ui: UiState;
  readonly model: DecisionModel;
  readonly update: (change: (ui: UiState) => UiState) => void;
  /** Sends an action to the engine (the dialogs that draw their own choices answer with it). */
  readonly act: (action: Action) => void;
  readonly error: string | null;
}

const none = () => null;

function Hand({
  view,
  ids,
  selected,
  onPick,
}: {
  view: GameView;
  ids: readonly ObjectId[];
  selected: readonly ObjectId[];
  onPick?: (id: ObjectId) => void;
}) {
  const cards = myHand(view).filter((o) => ids.includes(o.id));
  // Everything fits on one row of the overlay: shrink the cards for big hands.
  const width = Math.max(
    64,
    Math.min(100, Math.floor((730 - 8 * (cards.length - 1)) / Math.max(1, cards.length))),
  );
  return (
    <div className="dec-hand">
      {cards.map((card) => (
        <MiniCard
          key={card.id}
          card={card}
          width={width}
          selected={selected.includes(card.id)}
          onClick={onPick === undefined ? undefined : () => onPick(card.id)}
        />
      ))}
    </div>
  );
}

function ErrorLine({ error }: { error: string | null }) {
  return error === null ? null : (
    <p className="dec-error" role="alert">
      {error}
    </p>
  );
}

/** Centered modal overlays. Returns null for kinds that have none. */
export function ModalOverlay(props: OverlayProps): ReactNode {
  const { view, pending, ui, model, update, act } = props;
  const index = objectIndex(view);
  const handlers: DecisionHandlers<ReactNode> = {
    priority: none,
    targets: none,
    payMana: none,
    declareAttackers: none,
    declareBlockers: none,
    choosePermanent: (d) =>
      isUntapChoice(d) ? (
        <UntapDialog key={d.id} d={d} view={view} ui={ui} model={model} update={update} />
      ) : isProliferate(d) ? (
        // Proliferate (CR 701.34a, D-149): permanents and players, any number, in a dialog of its own.
        <ProliferateDialog key={d.id} d={d} view={view} ui={ui} model={model} update={update} />
      ) : null,
    chooseCards: none,
    orderTriggers: none,

    arrangeCards: (d) => (
      <ArrangePanel key={d.id} decision={d} view={view} ui={ui} model={model} update={update} />
    ),

    mulligan: (d) => {
      const taken = view.seats[view.viewer]?.mulligans ?? 0;
      return (
        <Dialog label="Opening hand" className="dec-mulligan">
          <h2 className="dec-title">Your opening hand</h2>
          <p className="dec-sub">
            {taken === 0 ? 'First hand.' : `Mulligans taken: ${taken}.`}{' '}
            {d.bottomCount === 0
              ? 'If you keep, no cards go to the bottom of your library.'
              : `If you keep, you put ${plural(d.bottomCount, 'card')} on the bottom of your library.`}
          </p>
          <Hand view={view} ids={d.hand} selected={[]} />
          <BarButtons buttons={model.bar.buttons} />
          {d.canMulligan ? null : <p className="dec-sub">No more mulligans are possible.</p>}
        </Dialog>
      );
    },

    mulliganBottom: (d) => (
      <Dialog label={model.bar.prompt} className="dec-mulligan">
        <h2 className="dec-title">{model.bar.prompt}</h2>
        <p className="dec-sub dec-pick-hint">
          Click {d.count === 1 ? 'the card' : `${d.count} cards`} below to choose, then press
          Confirm.
        </p>
        <Hand
          view={view}
          ids={d.hand}
          selected={ui.cards}
          onPick={(id) =>
            update((u) => ({ ...u, cards: toggleCard(u.cards, d.hand, id, d.count) }))
          }
        />
        <p className="dec-sub">{model.bar.detail}</p>
        <BarButtons buttons={model.bar.buttons} />
      </Dialog>
    ),

    discard: (d) => (
      <Dialog label={model.bar.prompt} className="dec-mulligan">
        <h2 className="dec-title">{model.bar.prompt}</h2>
        <p className="dec-sub dec-pick-hint">
          Click {d.count === 1 ? 'the card' : `${d.count} cards`} below to choose, then press
          Confirm.
        </p>
        <Hand
          view={view}
          ids={d.hand}
          selected={ui.cards}
          onPick={(id) =>
            update((u) => ({ ...u, cards: toggleCard(u.cards, d.hand, id, d.count) }))
          }
        />
        <p className="dec-sub">{model.bar.detail}</p>
        <BarButtons buttons={model.bar.buttons} />
      </Dialog>
    ),

    commanderZone: (d) => (
      <Dialog label="Command zone" className="dec-small">
        <h2 className="dec-title">{model.bar.prompt}</h2>
        <p className="dec-sub">
          {commanderZoneDetail(
            nameOf(index, d.object),
            d.from,
            index.get(d.object)?.zone,
            index.get(d.object)?.meld,
          )}
        </p>
        <BarButtons buttons={model.bar.buttons} />
      </Dialog>
    ),

    confirmOptional: (d) => <OptionalDialog d={d} model={model} index={index} />,

    chooseOption: (d) =>
      // D-139 (CR 508.7): the attack target of a creature has its own dialog, not the creature-type picker.
      d.purpose === 'attackTarget' ? (
        <AttackTargetDialog key={d.id} d={d} view={view} act={act} />
      ) : d.purpose === 'pile' ? (
        // D-971 (CR 700.3): the two piles the other player made, with their cards.
        <PilesDialog key={d.id} d={d} view={view} act={act} />
      ) : d.purpose === 'option' ||
        d.purpose === 'effect' ||
        d.purpose === 'riot' ||
        d.purpose === 'replacement' ||
        d.purpose === 'meldOrder' ||
        d.purpose === 'vote' ? (
        // D-151 (CR 614.12a, 702.155b): a name the card gives, or the chapter a Saga with read ahead starts with; D-175 (CR 608.2d): the
        // instruction an effect offers; D-191 (CR 616.1): which of several prevention effects to apply first to a damage event; D-194 (CR 701.38a): a vote.
        <NamedOptionDialog key={d.id} d={d} act={act} />
      ) : (
        <OptionDialog key={d.id} d={d} view={view} act={act} />
      ),

    chooseX: (d) => <XDialog key={d.id} d={d} ui={ui} model={model} update={update} act={act} />,

    chooseModes: (d) => (
      <ModesDialog key={d.id} d={d} ui={ui} model={model} update={update} index={index} />
    ),

    choosePayOptions: (d) => (
      <PayOptionsDialog key={d.id} d={d} view={view} ui={ui} model={model} update={update} />
    ),

    // The division of combat damage is a dock panel, so the board stays visible (issue 92).
    assignDamage: none,
  };
  return handleDecision(pending, handlers);
}

/** Panels docked above the action bar. Returns null for kinds that have none. */
export function DockPanel(props: OverlayProps): ReactNode {
  const { view, pending, ui, update, error } = props;
  const index = objectIndex(view);
  const handlers: DecisionHandlers<ReactNode> = {
    priority: none,
    mulligan: none,
    mulliganBottom: none,
    discard: none,
    commanderZone: none,
    assignDamage: (d) => (
      <DamagePanel
        step={d.step}
        choices={d.choices}
        view={view}
        ui={ui}
        update={update}
        error={error}
      />
    ),
    confirmOptional: none,
    // The choice is a modal: a search box and a list of about 325 types do not fit the dock.
    chooseOption: none,
    chooseX: none,
    // The modes are a modal: their texts do not fit the dock.
    chooseModes: none,
    // The creatures, artifacts or graveyard cards are a modal: their cards do not fit the dock.
    choosePayOptions: none,
    // The arrangement is a modal: card faces in two rows do not fit the dock.
    arrangeCards: none,

    // The untap step's checklist is a modal.
    choosePermanent: (d) =>
      isUntapChoice(d) || isProliferate(d) ? null : (
        <PermanentPanel decision={d} view={view} ui={ui} update={update} />
      ),

    chooseCards: (d) => <CardPickerPanel decision={d} view={view} ui={ui} update={update} />,

    orderTriggers: (d) => <OrderPanel decision={d} index={index} ui={ui} update={update} />,

    targets: (d) => <TargetsPanel decision={d} view={view} ui={ui} update={update} />,

    payMana: (d) => {
      // "Sacrifice this token" names the source; "Sacrifice a Spirit" (D-222) names the permanent the player chose for it.
      const sacrifices = ui.taps.flatMap((t) =>
        t.sacrifice !== undefined
          ? [nameOf(index, t.sacrifice)]
          : sacrificesWhenTapped(index.get(t.object))
            ? [nameOf(index, t.object)]
            : [],
      );
      return (
        <section className="dec-panel dec-pay" aria-label="Payment">
          <h3 className="dec-panel-title">
            Cost <ManaCost cost={d.totalCost} />
          </h3>
          {d.purpose === 'attackTax' ? (
            <p className="dec-sub dec-left" data-attack-tax>
              {attackTaxDetail(d, index)}
            </p>
          ) : null}
          {d.purpose === 'blockTax' ? (
            <p className="dec-sub dec-left" data-block-tax>
              {blockTaxDetail(d, index)}
            </p>
          ) : null}
          {d.purpose === 'suspend' || d.purpose === 'foretell' ? (
            <p className="dec-sub dec-left" data-special-pay>
              {specialPayDetail(d.purpose, nameOf(index, d.source), index.get(d.source))}
            </p>
          ) : null}
          <p className="dec-sub">
            {ui.taps.length === 0
              ? 'Click your glowing mana sources in the order to tap them. A source that costs mana (a Signet) goes after the sources that pay for it.'
              : `Tapping ${plural(ui.taps.length, 'source')} in order.`}
          </p>
          {sacrifices.length === 0 ? null : (
            <p className="dec-sub dec-left">{sacrifices.join(', ')} will be sacrificed.</p>
          )}
          <ErrorLine error={error} />
        </section>
      );
    },

    declareBlockers: (d) => {
      // D-149 (CR 509.1d): what blocking costs, the total for the chosen blockers and what the mana covers now.
      const row = blockCostRow(d, ui.block.blocks, index);
      const passing = <PassingDamagePanel view={view} decision={d} blocks={ui.block.blocks} />;
      if (row === null) return passing;
      const warning = blockCostWarning(row);
      return (
        <>
          {passing}
          <section className="dec-panel dec-block-cost" aria-label="Cost of blocking">
            <h3 className="dec-panel-title">Cost of blocking</h3>
            <p className="dec-sub dec-attack-cost-row" data-block-cost>
              {blockCostText(row)}
              {row.blockers > 0 ? (
                <span className="dec-block-total">
                  {row.blockers} chosen: <ManaCost cost={row.total} />
                </span>
              ) : null}
            </p>
            {warning === null ? null : (
              <p className="dec-sub dec-warn" role="status">
                {warning}
              </p>
            )}
          </section>
        </>
      );
    },

    declareAttackers: (d) => {
      const multi = ui.attacks.flatMap((pick) => {
        const candidate = d.candidates.find((c) => c.attacker === pick.attacker);
        return candidate !== undefined && candidate.targets.length > 1 ? [{ pick, candidate }] : [];
      });
      const taxes = taxRows(d, ui.attacks, index, view.viewer);
      const costs =
        taxes.length === 0 ? null : (
          <section className="dec-panel dec-attack-costs" aria-label="Cost of attacking">
            <h3 className="dec-panel-title">Cost of attacking</h3>
            {taxes.map((row) => {
              const warning = taxRowWarning(row);
              return (
                <div
                  key={row.target.kind === 'player' ? `p${row.target.seat}` : row.target.object}
                  data-attack-cost={row.label}
                >
                  <p className="dec-sub dec-attack-cost-row">
                    {taxRowText(row)}
                    {row.attackers > 0 ? (
                      <>
                        {' '}
                        {row.attackers} chosen: <ManaCost cost={row.total} />
                      </>
                    ) : null}
                  </p>
                  {warning === null ? null : (
                    <p className="dec-sub dec-warn" role="status">
                      {warning}
                    </p>
                  )}
                </div>
              );
            })}
          </section>
        );
      if (multi.length === 0) return costs;
      return (
        <>
          {costs}
          <section className="dec-panel dec-attack-targets" aria-label="Attack targets">
            <h3 className="dec-panel-title">Who is attacked</h3>
            {multi.map(({ pick, candidate }) => {
              const selectedIndex = candidate.targets.findIndex((t) =>
                sameAttackTarget(t, pick.target),
              );
              const name = nameOf(index, pick.attacker);
              return (
                <label key={pick.attacker} className="dec-attack-row">
                  <span>{name}</span>
                  <select
                    value={selectedIndex}
                    onChange={(e) => {
                      const target = candidate.targets[Number(e.target.value)];
                      if (target === undefined) return;
                      update((u) => ({
                        ...u,
                        attacks: setAttackTarget(u.attacks, d.candidates, pick.attacker, target),
                      }));
                    }}
                  >
                    {candidate.targets.map((t, i) => (
                      <option key={t.kind === 'player' ? `p${t.seat}` : t.object} value={i}>
                        {attackTargetLabel(t, index, view.viewer)}
                      </option>
                    ))}
                  </select>
                </label>
              );
            })}
          </section>
        </>
      );
    },
  };
  return handleDecision(pending, handlers);
}
