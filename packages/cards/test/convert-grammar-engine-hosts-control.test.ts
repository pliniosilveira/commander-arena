// Hosts of Mordor deck (issue 150), the control and evasion group: Troll of Khazad-dûm, Corsairs of Umbar, Subjugate the Hobbits, Wake the Dragon, In the Darkness Bind Them and
// Grishnákh, Brash Instigator, read from their real Oracle text. Pins: CR 509.1b (blocking restrictions, read as blockers are declared), CR 613.1b and 611.2 (control-changing effects),
// CR 603.12 (reflexive triggered abilities), CR 701.47a (amass). The CR text was not available in this environment: numbers are the ones the engine's comments cite.
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { real } from './agatha-helpers';

const BEARS = 'Grizzly Bears';

describe('Troll of Khazad-dûm', () => {
  const TROLL = real('Troll of Khazad-dûm');

  test('three blockers are needed: two are refused, three are accepted (CR 509.1b)', () => {
    const blockers = [BEARS, 'SYNTHETIC Vanilla 3/3', 'SYNTHETIC Vanilla 2/2'] as const;
    const g = scenario()
      .define(TROLL)
      .seat(0)
      .battlefield(TROLL.name)
      .seat(1)
      .battlefield(...blockers)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack([TROLL.name]);
    g.advanceTo('declareBlockers');
    const block = (n: number) =>
      blockers.slice(0, n).map((blocker) => ({ blocker, attacker: TROLL.name }));
    expect(g.act(1).try.declareBlockers(block(1)).ok).toBe(false);
    expect(g.act(1).try.declareBlockers(block(2)).ok).toBe(false);
    expect(g.act(1).try.declareBlockers(block(3)).ok).toBe(true);
  });
});
