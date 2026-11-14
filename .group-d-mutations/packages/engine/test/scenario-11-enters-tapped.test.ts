// Scenario 11 (SPEC 12): a land that enters tapped.
// Pins: CR 614.1c / 614.12 (Replacement Effects): "this permanent enters tapped" is a replacement
// effect, so the land is never untapped on the battlefield (no untap-then-tap), and nothing that
// watches the battlefield sees it untapped; CR 605.3b / 602.2 (Mana Abilities): a {T} cost needs an
// untapped permanent, so a tapped land can't be activated for mana, by hand or in the middle of
// paying a cost; CR 502.3 (Untap Step): it untaps in its controller's next untap step; CR 701.26b
// (Untap Effects): an effect can untap it earlier, and only then can it produce mana.
// Cards: SYNTHETIC Tapped Land ("enters tapped. {T}: Add {G}") and SYNTHETIC Basic Check Land
// (enters tapped unless you control two or more basic lands), both from src/cards/fixtures, plus an
// invented untap instant defined in this file.
import { describe, expect, test } from 'vitest';
import { type Action, getLegalActions } from '../src/index';
import { scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const TAPPED_LAND = 'SYNTHETIC Tapped Land';
const CHECK_LAND = 'SYNTHETIC Basic Check Land';
const ELVES = 'Llanowar Elves'; // {G}

const UNTAP = 'SYNTHETIC Untap Land';
const untapLand = singleFaceCard({
  name: UNTAP,
  manaCost: ['U'],
  types: ['instant'],
  colors: ['U'],
  colorIdentity: ['U'],
  oracleText: 'Untap target land.',
  spell: {
    targets: [
      { id: 't1', what: { kind: 'object', filter: { zone: 'battlefield', types: ['land'] } } },
    ],
    effect: { kind: 'untap', objects: { kind: 'target', id: 't1' } },
  },
});

/** Seat 0 has the land in hand, no other mana, and Elves ({G}) to try to cast with it. */
function withTappedLand(land = TAPPED_LAND) {
  const g = scenario()
    .seat(0)
    .hand(land, ELVES)
    .library('Forest', 'Forest', 'Forest')
    .seat(1)
    .library('Swamp', 'Swamp', 'Swamp')
    .build();
  g.act(0).playLand(land);
  return g;
}

describe('SPEC scenario 11: enters tapped (CR 614.1c, 605.3b)', () => {
  test('the land enters the battlefield tapped, and was never untapped there', () => {
    const g = withTappedLand();
    g.expect.zone(TAPPED_LAND, 'battlefield', { seat: 0 });
    g.expect.tapped(TAPPED_LAND, true);
    // A replacement effect: no untapped moment, so no "untapped" or "tapped" event for it at all.
    g.expect.noEvent({ kind: 'untapped' });
    g.expect.noEvent({ kind: 'tapped' });
  });

  test('it cannot be tapped for mana: the activation is refused and the pool stays empty', () => {
    const g = withTappedLand();
    const r = g.act(0).try.tapForMana(TAPPED_LAND);
    expect(r.ok).toBe(false);
    g.expect.pool(0, '');
    g.expect.tapped(TAPPED_LAND, true);
    const land = g.id(TAPPED_LAND);
    expect(
      getLegalActions(g.state, 0).some(
        (a: Action) => a.kind === 'activateAbility' && a.source === land,
      ),
    ).toBe(false);
  });

  test('it cannot pay for a spell that turn: Elves ({G}) are not castable with it as the only source', () => {
    const g = withTappedLand();
    const elves = g.id({ name: ELVES, zone: 'hand', seat: 0 });
    expect(
      getLegalActions(g.state, 0).some((a: Action) => a.kind === 'castSpell' && a.object === elves),
    ).toBe(false);
    expect(g.act(0).try.cast(ELVES).ok).toBe(false);
    g.expect.zone(ELVES, 'hand', { seat: 0 });
  });

  test('an effect that untaps it makes the mana available', () => {
    const g = scenario()
      .seat(0)
      .hand(TAPPED_LAND, ELVES, UNTAP)
      .battlefield('Island')
      .define(untapLand)
      .seat(1)
      .build();
    g.act(0).playLand(TAPPED_LAND);
    g.act(0).cast(UNTAP, { targets: [TAPPED_LAND], pay: true });
    g.passAll();
    g.expect.tapped(TAPPED_LAND, false);
    const land = g.id(TAPPED_LAND);
    expect(
      getLegalActions(g.state, 0).some(
        (a: Action) => a.kind === 'activateAbility' && a.source === land,
      ),
    ).toBe(true);
    g.act(0).tapForMana(TAPPED_LAND);
    g.expect.pool(0, 'G');
    g.act(0).cast(ELVES, { pay: true });
    g.passAll();
    g.expect.zone(ELVES, 'battlefield', { seat: 0 });
  });

  test('without such an effect it untaps in its controller next untap step and then works', () => {
    const g = withTappedLand();
    g.advanceTo('upkeep', { turn: 5 });
    g.expect.tapped(TAPPED_LAND, false);
    g.act(0).tapForMana(TAPPED_LAND);
    g.expect.pool(0, 'G');
  });

  test('the same holds for a land that enters tapped only under a condition (CR 614.12)', () => {
    const g = withTappedLand(CHECK_LAND);
    // No basic lands: the condition fails, so it enters tapped and cannot make mana.
    g.expect.tapped(CHECK_LAND, true);
    g.expect.noEvent({ kind: 'untapped' });
    expect(g.act(0).try.tapForMana(CHECK_LAND).ok).toBe(false);
    g.expect.pool(0, '');
  });
});
