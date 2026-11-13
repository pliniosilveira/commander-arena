import type { ChoosePermanentDecision, GameView } from '@commander-arena/engine';
import { useHoverProps } from './hover';
import { nameOf, objectIndex } from './lookup';
import {
  chosenCount,
  crewChipLabel,
  crewNeeded,
  crewPower,
  crewTotal,
  crewTotalText,
  fightTitle,
  isBounceCost,
  isCrew,
  isDefendingSacrifice,
  isEffectChoice,
  isFight,
  isLegendRule,
  isSpellCost,
  isTapCost,
  legalNoun,
  legendLabels,
  permanentLabels,
  sacrificeCause,
  tapEffectOf,
  togglePermanent,
} from './permanents';
import { AMASS_TITLE, isAmass } from './permanents-amass';
import { auraHostTitle, isAuraHost, isSpellTap, spellTapTitle } from './permanents-angels';
import { entersCopyTitle, isEntersCopy } from './permanents-dragons';
import { isRingBearer, RING_BEARER_TITLE } from './permanents-ring';
import { isSoulbond, SOULBOND_TITLE } from './permanents-soulbond';
import { isUntapChoice, UNTAP_CHOICE_TITLE } from './permanents-untap';
import type { UiState } from './ui-state';

/**
 * The dock panel of a choosePermanent decision: what is being sacrificed for (or what an effect
 * makes the player choose for; for the legend rule, the rule's own prompt; for a crew, the Vehicle and the creatures to tap with their power
 * and a running total against N), and a chip per legal permanent. Clicking a chip does what
 * clicking the permanent on the board does, so the choice can be made from the keyboard too.
 */
export function PermanentPanel({
  decision,
  view,
  ui,
  update,
}: {
  decision: ChoosePermanentDecision;
  view: GameView;
  ui: UiState;
  update: (change: (ui: UiState) => UiState) => void;
}) {
  const index = objectIndex(view);
  const legend = isLegendRule(decision);
  const crew = isCrew(decision);
  const effect = isEffectChoice(decision);
  // D-145 (CR 701.14): "Each of those tokens fights a different one of those creatures".
  const fight = isFight(decision);
  const tap = isTapCost(decision);
  // D-149: the host of an Aura that enters by an effect (CR 303.4f), a spell cast by tapping creatures.
  const auraHost = isAuraHost(decision);
  // D-151 (CR 707.9): the creature a permanent that enters becomes a copy of.
  const copy = isEntersCopy(decision);
  const spellTap = isSpellTap(decision, index);
  // D-139: the return cost of an ability, and an effect's "tap any number of untapped Myr you control".
  const bounce = isBounceCost(decision);
  const tapEffect = tapEffectOf(decision, index) !== null;
  const labels = (legend ? legendLabels : permanentLabels)(decision.legal, index);
  const hoverProps = useHoverProps();
  // The legend rule has no spell or ability behind it: its `source` is just the first permanent.
  const source = legend ? undefined : index.get(decision.source);
  const vehicle = nameOf(index, decision.source);
  // D-196 (CR 701.54a): the creature that becomes the Ring-bearer.
  const ring = isRingBearer(decision);
  // D-286 (CR 702.95a): the creature a soulbond creature is paired with.
  const soulbond = isSoulbond(decision);
  // D-216 (CR 701.26a): the permanents an effect untaps.
  const untapChoice = isUntapChoice(decision);
  // D-1123 (CR 701.47a): the Army an amass puts its counters on.
  const amass = isAmass(decision);
  const title = ring
    ? RING_BEARER_TITLE
    : amass
      ? AMASS_TITLE
      : soulbond
        ? SOULBOND_TITLE
        : untapChoice
          ? UNTAP_CHOICE_TITLE
          : copy
            ? entersCopyTitle(legalNoun(decision.legal, index))
            : auraHost
              ? auraHostTitle(decision, index)
              : spellTap
                ? spellTapTitle(decision, index)
                : legend
                  ? 'Legend rule'
                  : fight
                    ? fightTitle(decision, index)
                    : crew
                      ? `Crew ${vehicle}`
                      : tap
                        ? `Tap to pay for ${vehicle}`
                        : bounce
                          ? `Return to pay for ${vehicle}`
                          : tapEffect
                            ? `Tap for ${vehicle}`
                            : effect
                              ? `Choose for ${vehicle}`
                              : isSpellCost(decision, index)
                                ? `Sacrifice to cast ${vehicle}`
                                : isDefendingSacrifice(decision, index)
                                  ? `Defending player sacrifices for ${vehicle}`
                                  : `Sacrifice ${decision.forCost === true ? 'to pay for' : 'for'} ${vehicle}`;
  const cause = sacrificeCause(decision, index, view.viewer);
  return (
    <section
      className="dec-panel dec-permanents"
      aria-label={
        ring
          ? 'Creatures to be the Ring-bearer'
          : amass
            ? 'Armies to amass on'
            : soulbond
              ? 'Creatures to pair'
              : untapChoice
                ? 'Permanents to untap'
                : copy
                  ? 'Permanents to copy'
                  : auraHost
                    ? 'Permanents to enchant'
                    : legend
                      ? 'Legend rule'
                      : fight
                        ? 'Creatures to fight'
                        : crew
                          ? title
                          : tap || tapEffect
                            ? 'Permanents to tap'
                            : bounce
                              ? 'Permanents to return'
                              : effect
                                ? 'Permanents to choose'
                                : 'Permanents to sacrifice'
      }
    >
      <h3 className="dec-panel-title">{title}</h3>
      {source === undefined || source.oracleText === '' ? null : (
        <p className="dec-source-text" title={source.oracleText}>
          {source.oracleText}
        </p>
      )}
      {cause === null ? null : (
        <p className="dec-sub dec-left" data-sacrifice-cause>
          {cause}
        </p>
      )}
      <ul className="dec-target-list">
        {decision.legal.map((id) => {
          const label = labels.get(id) ?? nameOf(index, id);
          return (
            <li key={id}>
              <button
                type="button"
                className="dec-chip"
                aria-pressed={ui.permanents.includes(id)}
                onClick={() =>
                  update((u) => ({ ...u, permanents: togglePermanent(u.permanents, decision, id) }))
                }
                {...hoverProps(id)}
              >
                {crew ? crewChipLabel(label, crewPower(decision, id)) : label}
              </button>
            </li>
          );
        })}
      </ul>
      {crew ? (
        <p
          className="dec-sub dec-left dec-crew-total"
          data-valid={crewTotal(ui.permanents, decision) >= crewNeeded(decision)}
        >
          {crewTotalText(ui.permanents, decision)}
        </p>
      ) : (
        <p className="dec-sub dec-left">{chosenCount(ui.permanents, decision)}</p>
      )}
    </section>
  );
}
