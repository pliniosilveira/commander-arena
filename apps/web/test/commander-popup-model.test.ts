import type { GameView, ObjectView, SeatView } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { commanderPopup } from '../src/ui/board/commander-popup-model';

/** SYNTHETIC views: only the fields the popup reads. */
const commander = (id: string, owner: number, name: string, zone = 'command'): ObjectView =>
  ({ id, owner, controller: owner, name, zone, isCommander: true }) as unknown as ObjectView;

const seat = (id: number, command: ObjectView[] = [], patch: Partial<SeatView> = {}): SeatView =>
  ({
    id,
    hasLost: false,
    command,
    graveyard: [],
    hand: null,
    commanderTax: {},
    ...patch,
  }) as unknown as SeatView;

const view = (seats: SeatView[], commanderDamage: Record<string, number> = {}): GameView =>
  ({
    viewer: 0,
    seats,
    battlefield: [],
    stack: [],
    exile: [],
    commanderDamage,
  }) as unknown as GameView;

describe('commanderPopup', () => {
  const seats = [
    seat(0, [commander('o1', 0, 'Isamaru')], { commanderTax: { c1: 2 } }),
    seat(1, [commander('o2', 1, 'Yargle')]),
    seat(2, [commander('o3', 2, 'Troyan')]),
    seat(3, [commander('o4', 3, 'Serra')], { hasLost: true }),
  ];

  test('the commander, its tax and every other player with their commander, in seat order', () => {
    const popup = commanderPopup(view(seats), seats[0] as SeatView);
    expect(popup.commanders.map((c) => c.name)).toEqual(['Isamaru']);
    expect(popup.taxes).toEqual([2]);
    expect(popup.others.map((o) => [o.label, o.commanders])).toEqual([
      ['Opponent 1', ['Yargle']],
      ['Opponent 2', ['Troyan']],
      ['Opponent 3', ['Serra']],
    ]);
    expect(popup.others.map((o) => o.lost)).toEqual([false, false, true]);
  });

  test("an opponent's popup lists you, by that name, among the others", () => {
    const popup = commanderPopup(view(seats), seats[2] as SeatView);
    expect(popup.others.map((o) => o.label)).toEqual(['You', 'Opponent 1', 'Opponent 3']);
    expect(popup.others[0]?.commanders).toEqual(['Isamaru']);
  });

  test('the commander is found wherever it is, not only in the command zone', () => {
    const onField = [seat(0), seat(1, [], {}), seat(2)];
    const v = {
      ...view(onField),
      battlefield: [commander('o9', 0, 'Isamaru', 'battlefield')],
    } as GameView;
    const popup = commanderPopup(v, onField[0] as SeatView);
    expect(popup.commanders.map((c) => c.name)).toEqual(['Isamaru']);
  });

  test('a commander in a hidden zone is not named, and the row says so with an empty list', () => {
    const hidden = [seat(0, [commander('o1', 0, 'Isamaru')]), seat(1, []), seat(2)];
    const popup = commanderPopup(view(hidden), hidden[0] as SeatView);
    expect(popup.others.map((o) => o.commanders)).toEqual([[], []]);
  });

  test('each other player carries the commander damage their commanders dealt to this seat', () => {
    const v = {
      ...view(seats, { '0:c2': 7, '0:c3': 3 }),
      commanderDamageSources: { '0:c2': 1, '0:c3': 2 },
    } as unknown as GameView;
    const popup = commanderPopup(v, seats[0] as SeatView);
    expect(popup.others.map((o) => o.damage)).toEqual([7, 3, 0]);
  });
});
