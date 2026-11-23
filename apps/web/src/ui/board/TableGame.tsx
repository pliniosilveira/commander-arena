/**
 * The screen of a game with several opponents (docs/MORE_OPPONENTS_INVESTIGATION.md, "Board plan"):
 * the `Game` screen of App.tsx with `TableBoard` for `Board`. The flow cell of the board holds what
 * floats at the edges of `Game`: the turn box, the decision dock (drawn into `.game-dock-slot`, as in
 * `Game`) and the stack. The log, the settings and the report button stay where they are in a 1v1 game.
 */
import { useState } from 'react';
import { DecisionLayer } from '../decisions/DecisionLayer';
import { DockSlotContext } from '../decisions/dock-slot';
import { LogDock } from '../panels/LogDock';
import { ReportDock } from '../panels/ReportDock';
import { SettingsDock } from '../panels/SettingsDock';
import { StackPanel } from '../panels/StackPanel';
import { TurnTracker } from '../panels/TurnTracker';
import { GameOver } from '../screens/GameOver';
import { HonestyBanner } from '../screens/HonestyBanner';
import { CombatEffects } from './CombatEffects';
import { PreviewPanel } from './PreviewPanel';
import { TableBoard } from './TableBoard';

export function TableGame() {
  const [dockSlot, setDockSlot] = useState<HTMLElement | null>(null);
  return (
    <div className="game" data-testid="game-table-board">
      <DockSlotContext.Provider value={dockSlot}>
        <div className="game-main">
          <DecisionLayer>
            <TableBoard
              flow={
                <>
                  <TurnTracker />
                  <div className="game-dock-slot" ref={setDockSlot} />
                  <StackPanel />
                </>
              }
            />
          </DecisionLayer>
        </div>
      </DockSlotContext.Provider>
      <PreviewPanel />
      <LogDock />
      <SettingsDock />
      <ReportDock />
      <HonestyBanner />
      <GameOver />
      <CombatEffects />
    </div>
  );
}
