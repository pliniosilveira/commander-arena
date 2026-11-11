import type { OrderTriggersDecision } from '@commander-arena/engine';
import { useEffect, useRef, useState } from 'react';
import { nounOfTypes, triggerWords } from '../../game/artifacts-text';
import { laterOrderWording } from '../../game/later-text';
import { inherentTriggerWording } from '../../game/monarch-text';
import { isReflexiveTrigger } from '../../game/recursion-text';
import { chapterWord } from '../../game/saga';
import { useHoverProps } from './hover';
import type { Index } from './lookup';
import { moveTrigger, resolvesLabel } from './order';
import type { UiState } from './ui-state';

/**
 * The dock panel of an orderTriggers decision. The list reads top to bottom in the order the
 * abilities will resolve, like the stack panel; each row says when it resolves and has buttons to
 * move it. After a move the focus follows the row, so the order can be set from the keyboard.
 */
export function OrderPanel({
  decision,
  index,
  ui,
  update,
}: {
  decision: OrderTriggersDecision;
  /** The objects in view, for what the trigger's words need to know of its source ("equipped creature"). */
  index: Index;
  ui: UiState;
  update: (change: (ui: UiState) => UiState) => void;
}) {
  const hoverProps = useHoverProps();
  const list = useRef<HTMLOListElement>(null);
  // Which button to focus after the next render: a row's index in `decision.triggers` and a direction.
  const [focus, setFocus] = useState<{ trigger: number; step: -1 | 1 } | null>(null);
  useEffect(() => {
    if (focus === null) return;
    const target = list.current?.querySelector<HTMLButtonElement>(
      `[data-trigger="${focus.trigger}"][data-step="${focus.step}"]:not(:disabled)`,
    );
    // At the end of the list that direction is disabled: land on the way back instead.
    (
      target ??
      list.current?.querySelector<HTMLButtonElement>(
        `[data-trigger="${focus.trigger}"]:not(:disabled)`,
      )
    )?.focus();
    setFocus(null);
  }, [focus]);

  const order = ui.triggerOrder;
  return (
    <section className="dec-panel dec-order" aria-label="Trigger order">
      <h3 className="dec-panel-title">Order triggers</h3>
      <p className="dec-sub dec-left">Top resolves first. Bottom resolves last.</p>
      <ol className="dec-order-list" ref={list}>
        {order.map((triggerIndex, position) => {
          const trigger = decision.triggers[triggerIndex];
          if (trigger === undefined) return null;
          const move = (step: -1 | 1) => {
            update((u) => ({ ...u, triggerOrder: moveTrigger(u.triggerOrder, position, step) }));
            setFocus({ trigger: triggerIndex, step });
          };
          // What sets it off, "Whenever you draw a card" (D-108); a shape the words do not cover (or a
          // trigger the decision does not carry) falls back to the source's name and rules text.
          // The monarch's abilities (CR 725.2, D-127) have no source: worded from the kind of trigger.
          const later = laterOrderWording(
            trigger.abilityIndex,
            trigger.source === null ? undefined : index.get(trigger.source),
          );
          const wording =
            later !== undefined
              ? later
              : isReflexiveTrigger(trigger.trigger, trigger.sourceOracleText)
                ? 'When you do'
                : trigger.trigger === undefined || trigger.trigger.kind === 'chapter'
                  ? null
                  : trigger.source === null
                    ? inherentTriggerWording(trigger.trigger, true)
                    : triggerWords(
                        trigger.trigger,
                        {
                          self: trigger.sourceName,
                          ...(trigger.source === null || index.get(trigger.source) === undefined
                            ? {}
                            : { subtypes: index.get(trigger.source)?.subtypes ?? [] }),
                        },
                        // D-139: a state trigger names its permanent ("this artifact").
                        nounOfTypes(
                          trigger.source === null ? [] : (index.get(trigger.source)?.types ?? []),
                        ),
                      );
          const label = `${trigger.sourceName}${trigger.count > 1 ? ` ×${trigger.count}` : ''}`;
          return (
            <li
              key={triggerIndex}
              className="dec-order-row"
              data-position={position}
              {...(trigger.source === null ? {} : hoverProps(trigger.source))}
            >
              <div className="dec-order-info">
                <span className="dec-order-when">{resolvesLabel(position, order.length)}</span>
                <span className="dec-order-name">
                  {trigger.sourceName}
                  {chapterWord(trigger.chapter) === null
                    ? null
                    : ` — ${chapterWord(trigger.chapter)}`}
                  {trigger.count > 1 ? <b className="dec-order-count"> ×{trigger.count}</b> : null}
                </span>
                {wording !== null ? (
                  <span
                    className="dec-source-text dec-order-wording"
                    data-trigger-wording
                    title={trigger.sourceOracleText}
                  >
                    {wording}
                  </span>
                ) : trigger.sourceOracleText === '' ? null : (
                  <span className="dec-source-text" title={trigger.sourceOracleText}>
                    {trigger.sourceOracleText}
                  </span>
                )}
              </div>
              <div className="dec-order-moves">
                <button
                  type="button"
                  className="dec-step"
                  aria-label={`Move ${label} up: resolve earlier`}
                  data-trigger={triggerIndex}
                  data-step={-1}
                  disabled={position === 0}
                  onClick={() => move(-1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="dec-step"
                  aria-label={`Move ${label} down: resolve later`}
                  data-trigger={triggerIndex}
                  data-step={1}
                  disabled={position === order.length - 1}
                  onClick={() => move(1)}
                >
                  ↓
                </button>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
