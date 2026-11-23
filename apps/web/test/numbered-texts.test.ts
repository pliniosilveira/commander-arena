// The singular texts of the app with several opponents (issue 537, phase 4): with three or four seats "Opponent" and "the opponent" cannot tell the opponents apart, so the log, the
// decision labels, the drag labels, the emblem strips, the exile chips and the priority prompt name them "Opponent 1" to "Opponent 3" (the numbering of #536: in seat order, skipping the
// viewer). With two seats every string is the 1v1 one, which the other tests of this app pin. The views are real: three seats from the scenario DSL.
import { type GameEvent, type GameState, getView } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { describeEvent } from '../src/game/describe';
import {
  bareMidPossessiveOf,
  midNameOf,
  midPossessiveOf,
  startNameOf,
  startPossessiveOf,
} from '../src/game/seat-name';
import { emblemCaption, emblemStripLabel } from '../src/ui/board/emblems';
import { shareLabel } from '../src/ui/decisions/copy-division';
import { attackTargetLabel, recipientLabel, seatLabel } from '../src/ui/decisions/lookup';
import { poisonChipLabel } from '../src/ui/decisions/permanents-angels';
import { priorityPrompt } from '../src/ui/decisions/priority';
import { dragSpec } from '../src/ui/dnd/model';
import { groupHeading } from '../src/ui/panels/log-model';

const LIBRARY = Array.from({ length: 6 }, () => 'Island');

/** A real game of `seats` seats at the first main phase of seat 0. */
function table(seats: 2 | 3 | 4) {
  const b = scenario({ seats })
    .seat(0)
    .library(...LIBRARY);
  for (let seat = 1; seat < seats; seat += 1) b.seat(seat).library(...LIBRARY);
  return b.at('precombatMain', { active: 0, turn: 3 }).build();
}

describe('the sentence forms of a seat name', () => {
  test('two seats keep the 1v1 words, more seats number the opponents (no article)', () => {
    expect(startNameOf(1, 0, 2)).toBe('The opponent');
    expect(midNameOf(1, 0, 2)).toBe('the opponent');
    expect(startPossessiveOf(1, 0, 2)).toBe("The opponent's");
    expect(midPossessiveOf(1, 0, 2)).toBe("the opponent's");
    expect(bareMidPossessiveOf(1, 0, 2)).toBe("opponent's");
    expect(startNameOf(2, 0, 3)).toBe('Opponent 2');
    expect(midNameOf(2, 0, 3)).toBe('Opponent 2');
    expect(startPossessiveOf(2, 0, 3)).toBe("Opponent 2's");
    expect(midPossessiveOf(1, 0, 3)).toBe("Opponent 1's");
    expect(bareMidPossessiveOf(3, 0, 4)).toBe("Opponent 3's");
  });

  test('the viewer is always "you" and the numbering skips the viewer', () => {
    expect(startNameOf(1, 1, 3)).toBe('You');
    expect(midNameOf(1, 1, 3)).toBe('you');
    expect(startPossessiveOf(1, 1, 3)).toBe('Your');
    expect(midPossessiveOf(1, 1, 3)).toBe('your');
    // Viewer seat 1: seat 0 is Opponent 1 and seat 2 is Opponent 2.
    expect(startNameOf(0, 1, 3)).toBe('Opponent 1');
    expect(startNameOf(2, 1, 3)).toBe('Opponent 2');
  });
});

describe('the log', () => {
  const life = (seat: number): GameEvent => ({ kind: 'lifeChanged', seat, from: 40, to: 37 });
  const reveal: GameEvent = {
    kind: 'cardsRevealed',
    seat: 2,
    cards: [],
    names: ['Island', 'Grizzly Bears'],
    from: 'library',
  };
  const state = (seats: 2 | 3 | 4): GameState => table(seats).state;

  test('three seats: the life line and the reveal line name the numbered opponent', () => {
    const s = state(3);
    expect(describeEvent(life(2), s, s, 0)?.text).toBe("Opponent 2's life: 40 to 37.");
    expect(describeEvent(life(1), s, s, 0)?.text).toBe("Opponent 1's life: 40 to 37.");
    expect(describeEvent(life(0), s, s, 0)?.text).toBe('Your life: 40 to 37.');
    expect(describeEvent(reveal, s, s, 0)?.text).toBe(
      'Opponent 2 reveals Island and Grizzly Bears.',
    );
  });

  test('the Ring and the damage recipient of a replacement name the numbered opponent too', () => {
    const s = state(3);
    const ring: GameEvent = { kind: 'ringTempted', seat: 2, times: 1, bearer: null };
    expect(describeEvent(ring, s, s, 0)?.text).toContain(
      'The Ring tempts Opponent 2 (the first time).',
    );
    expect(describeEvent(ring, s, s, 0)?.text).toContain('Opponent 2 controls no creature');
    const own: GameEvent = { kind: 'ringTempted', seat: 0, times: 1, bearer: null };
    expect(describeEvent(own, s, s, 0)?.text).toContain('The Ring tempts you (the first time).');
    const one = state(2);
    const theirs: GameEvent = { kind: 'ringTempted', seat: 1, times: 1, bearer: null };
    expect(describeEvent(theirs, one, one, 0)?.text).toContain('The Ring tempts the opponent');
  });

  test('two seats: the 1v1 words, unchanged', () => {
    const s = state(2);
    expect(describeEvent(life(1), s, s, 0)?.text).toBe("Opponent's life: 40 to 37.");
    expect(describeEvent({ ...reveal, seat: 1 }, s, s, 0)?.text).toBe(
      'Opponent reveals Island and Grizzly Bears.',
    );
  });

  test('the heading of a turn group names the numbered opponent', () => {
    const group = { turn: 5, activeSeat: 2, round: 2, entries: [] };
    expect(groupHeading(group, 0, 3)).toBe("Opponent 2's turn 2");
    expect(groupHeading(group, 0, 2)).toBe("Opponent's turn 2");
    expect(groupHeading(group, 0)).toBe("Opponent's turn 2");
    expect(groupHeading({ ...group, activeSeat: 0 }, 0, 3)).toBe('Your turn 2');
  });
});

describe('the labels of the decisions', () => {
  test('seatLabel, attack and damage targets and the poison chip', () => {
    expect(seatLabel(2, 0, 3)).toBe('Opponent 2');
    expect(seatLabel(1, 0)).toBe('Opponent');
    expect(attackTargetLabel({ kind: 'player', seat: 3 }, new Map(), 0, 4)).toBe('Opponent 3');
    expect(attackTargetLabel({ kind: 'player', seat: 1 }, new Map(), 0)).toBe('Opponent');
    expect(recipientLabel({ kind: 'player', seat: 2 }, new Map(), 0, 3)).toBe('Opponent 2');
    expect(recipientLabel({ kind: 'player', seat: 0 }, new Map(), 0, 3)).toBe('You');
    expect(poisonChipLabel(2, 0, 3, 3)).toBe('Opponent 2 (3 poison counters)');
    expect(poisonChipLabel(1, 0, 1)).toBe('Opponent (1 poison counter)');
    expect(shareLabel({ kind: 'player', seat: 2, specId: 's', share: 2 }, new Map(), 0, 3)).toBe(
      'Opponent 2 2',
    );
    expect(shareLabel({ kind: 'player', seat: 1, specId: 's', share: 2 }, new Map(), 0)).toBe(
      'Opponent 2',
    );
  });

  test('the drag label of an attack names the opponent attacked', () => {
    const pending = {
      kind: 'declareAttackers',
      id: 'd1',
      seat: 0,
      candidates: [
        {
          attacker: 'o1',
          targets: [
            { kind: 'player', seat: 1 },
            { kind: 'player', seat: 2 },
          ],
        },
      ],
      mustAttack: [],
    };
    const labels = (seatCount?: number) =>
      dragSpec(
        pending as never,
        { attacks: [] } as never,
        new Map([['o1', { id: 'o1', name: 'Grizzly Bears' } as never]]),
        0,
        'o1',
        'permanent',
        seatCount,
      )?.zones.map((z) => z.label);
    expect(labels(3)).toEqual(['Attack Opponent 1', 'Attack Opponent 2']);
    expect(labels()).toEqual(['Attack Opponent', 'Attack Opponent']);
  });
});

describe('the strips and the prompt of the board', () => {
  test('emblem labels and captions name the numbered opponent', () => {
    const view3 = getView(table(3).state, 0);
    expect(emblemStripLabel(view3, 2)).toBe("Opponent 2's emblems and designations");
    expect(emblemCaption(view3, 1)).toBe("Opponent 1's");
    expect(emblemCaption(view3, 0)).toBe('Yours');
    const view2 = getView(table(2).state, 0);
    expect(emblemStripLabel(view2, 1)).toBe("Opponent's emblems and designations");
    expect(emblemCaption(view2, 1)).toBe("Opponent's");
  });

  test('the priority prompt names whose turn it is', () => {
    const g = table(3);
    const view = getView(g.state, 0);
    expect(priorityPrompt(view, new Map())).toBe('Your turn, Main 1');
    const theirs = { ...view, activeSeat: 2 };
    expect(priorityPrompt(theirs, new Map())).toBe("Opponent 2's turn, Main 1");
    const two = { ...getView(table(2).state, 0), activeSeat: 1 };
    expect(priorityPrompt(two, new Map())).toBe("Opponent's turn, Main 1");
  });
});
