// Agatha deck (issue 345), group 11: Duskwatch Recruiter // Krallenhorde Howler, "At the beginning of each upkeep, if no spells were cast last turn, transform ~." and the back face's
// "At the beginning of each upkeep, if a player cast two or more spells last turn, transform ~."
// Pins: CR 601.2i (a spell is cast once it is on the stack with its costs paid), CR 603.4 (intervening "if"), CR 701.28 (transform), CR 707.10 (a copy is not cast).
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { real } from './agatha-helpers';

const DUSK = real('Duskwatch Recruiter // Krallenhorde Howler');
const NAME = DUSK.name;
const BOLT = 'Lightning Bolt';

const game = (face: 0 | 1, ...hand: string[]) =>
  scenario()
    .define(DUSK)
    .seat(0)
    .battlefield(NAME, { face })
    .battlefield('Mountain', 'Mountain')
    .hand(...hand)
    .seat(1)
    .library('Forest', 'Forest', 'Forest')
    .build();

const faceOf = (g: ReturnType<typeof game>) => g.object(NAME).face;

describe('Duskwatch Recruiter // Krallenhorde Howler', () => {
  test('a turn with no spells flips it at the next upkeep', () => {
    const g = game(0);
    g.advanceTo('upkeep', { turn: 'next' });
    g.passAll();
    expect(faceOf(g)).toBe(1);
    g.expect.invariants();
  });

  test('a spell cast in the turn keeps it as it is', () => {
    const g = game(0, BOLT);
    g.act(0)
      .cast(BOLT)
      .targets([{ player: 1 }])
      .pay();
    g.passAll();
    g.advanceTo('upkeep', { turn: 'next' });
    g.passAll();
    expect(faceOf(g)).toBe(0);
  });

  test('the back face flips back when a player cast two or more spells last turn', () => {
    const g = game(1, BOLT, BOLT);
    g.act(0)
      .cast('Lightning Bolt[0]')
      .targets([{ player: 1 }])
      .pay();
    g.passAll();
    g.act(0)
      .cast('Lightning Bolt[0]')
      .targets([{ player: 1 }])
      .pay();
    g.passAll();
    g.advanceTo('upkeep', { turn: 'next' });
    g.passAll();
    expect(faceOf(g)).toBe(0);
  });

  test('one spell is not enough for the back face', () => {
    const g = game(1, BOLT);
    g.act(0)
      .cast(BOLT)
      .targets([{ player: 1 }])
      .pay();
    g.passAll();
    g.advanceTo('upkeep', { turn: 'next' });
    g.passAll();
    expect(faceOf(g)).toBe(1);
  });
});
