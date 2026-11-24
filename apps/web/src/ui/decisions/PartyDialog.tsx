import type { ChoosePartyDecision, GameView } from '@commander-arena/engine';
import { useEffect, useRef } from 'react';
import { BarButtons } from './BarButtons';
import { Dialog } from './Dialog';
import { objectIndex } from './lookup';
import { MiniCard } from './MiniCard';
import type { DecisionModel } from './model';
import { filledBy, initialParty, togglePartyMember } from './party';
import type { UiState } from './ui-state';

type Update = (change: (ui: UiState) => UiState) => void;

/**
 * The modal of the `chooseParty` question (Stick Together, CR 700.8d): "Choose a party from among creatures you control": a row of creatures for each of Cleric, Rogue, Warrior and
 * Wizard, one of which may be picked, and a creature with several of the types may stand in any one place. What is left out is sacrificed, and the dialog says how many.
 * The autopilot never answers it.
 */
export function PartyDialog({
  d,
  view,
  ui,
  model,
  update,
}: {
  d: ChoosePartyDecision;
  view: GameView;
  ui: UiState;
  model: DecisionModel;
  update: Update;
}) {
  // The same question can come again (same id) with the picks of the first time still in the layer's state: the dialog starts with the fullest party.
  const latest = useRef({ update, start: initialParty(d) });
  latest.current = { update, start: initialParty(d) };
  useEffect(() => latest.current.update((u) => ({ ...u, party: latest.current.start })), []);

  const index = objectIndex(view);
  const owned = view.battlefield.filter(
    (o) => o.controller === d.seat && o.types.includes('creature'),
  );
  const sacrificed = owned.filter((o) => !ui.party.some((m) => m.object === o.id)).length;
  return (
    <Dialog label="Choose a party" className="dec-party">
      <h2 className="dec-title" data-party-title>
        {model.bar.prompt}
      </h2>
      <p className="dec-sub dec-pick-hint">
        Pick up to one creature for each type. A creature with several of the types fills only one
        place.
      </p>
      {d.slots.map((slot) => (
        <div key={slot.type} data-party-slot={slot.type}>
          <h3 className="dec-sub">{slot.type}</h3>
          <div className="dec-hand">
            {slot.legal.length === 0 ? (
              <p className="dec-sub">You control no {slot.type}.</p>
            ) : (
              slot.legal.flatMap((id) => {
                const card = index.get(id);
                if (card === undefined) return [];
                const here = filledBy(ui.party, slot.type) === id;
                return [
                  <MiniCard
                    key={id}
                    card={card}
                    width={84}
                    selected={here}
                    badge={here ? slot.type : null}
                    onClick={() =>
                      update((u) => ({ ...u, party: togglePartyMember(u.party, slot.type, id) }))
                    }
                  />,
                ];
              })
            )}
          </div>
        </div>
      ))}
      <p className="dec-sub" data-party-sacrificed aria-live="polite">
        {sacrificed === 0
          ? 'No creature of yours is sacrificed.'
          : `${sacrificed} of your creatures ${sacrificed === 1 ? 'is' : 'are'} sacrificed.`}
      </p>
      <BarButtons buttons={model.bar.buttons} />
    </Dialog>
  );
}
