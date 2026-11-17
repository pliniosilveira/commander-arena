import { describe, expect, test } from 'vitest';
import { fixtureCard, validateCard } from '../src/index';
import { scenario } from '../src/testing';

const WARDEN = 'Fandaniel, Telophoroi Ascian';
const SPELLS_IN_GRAVEYARD = ['Lightning Bolt', 'Divination'] as const;

const game = (...opponentPermanents: string[]) =>
  scenario()
    .seat(0)
    .graveyard(...SPELLS_IN_GRAVEYARD)
    .battlefield(WARDEN)
    .seat(1)
    .battlefield(...opponentPermanents)
    .at('precombatMain', { active: 0 })
    .build();

describe('the player who declines a choice', () => {
  test('loses life based on the ability controller’s graveyard', () => {
    const g = game('Grizzly Bears');
    g.advanceTo('end');
    g.expect.stack([`${WARDEN} (ability)`]);
    g.passAll();

    expect(g.state.pending).toMatchObject({ kind: 'confirmOptional', seat: 1 });
    g.act(1).decline();
    g.expect.life(1, 36);
    g.expect.zone('Grizzly Bears', 'battlefield', { seat: 1 });
    g.expect.invariants();
  });

  test('is automatically treated as declining when no nontoken creature can be sacrificed', () => {
    const g = game();
    g.advanceTo('end');
    g.passAll();

    g.expect.life(1, 36);
    expect(g.state.pending?.kind).not.toBe('confirmOptional');
    g.expect.invariants();
  });

  test('accepting the choice sacrifices the chosen creature without life loss', () => {
    const g = game('Grizzly Bears');
    g.advanceTo('end');
    g.passAll();

    g.act(1).accept();
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 1 });
    g.expect.life(1, 40);
    g.expect.invariants();
  });
});

test('the real-card fixture is well formed', () => {
  const card = fixtureCard(WARDEN);
  expect(card.name).toBe(WARDEN);
  expect(validateCard(card)).toEqual([]);
});
