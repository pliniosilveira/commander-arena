// The meld ability (CR 701.42, 712.4a, 712.14c, 603.4; D-992): "At the beginning of your end step, if you both own and control this creature and a creature
// named X, exile them, then meld them into Y." The two cards are exiled and then enter the battlefield as one melded permanent: one object, one "enters"
// event for the permanent (CR 712.14c). What can't be melded stays where it is (CR 701.42c); only the two cards of one meld pair can be (CR 701.42b).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-meld.ts).
import { describe, expect, test } from 'vitest';
import { checkInvariants } from '../src/index';
import { meldPairIssue } from '../src/rules/melded';
import { scenario } from '../src/testing/index';
import { viewOf } from './layout-helpers';
import { settle } from './meld-helpers';

const DUSK = 'SYNTHETIC Dusk Squire'; // the meld ability, melds with Dawn Squire into Twilight Titan
const DAWN = 'SYNTHETIC Dawn Squire';
const TITAN = 'SYNTHETIC Twilight Titan';
const EMBER = 'SYNTHETIC Ember Squire'; // the meld ability, melds with Ash Squire
const ASH = 'SYNTHETIC Ash Squire';
const STRAY = 'SYNTHETIC Stray Squire';
const WATCHER = 'SYNTHETIC Meld Watcher'; // a creature dies +1 life, leaves the battlefield +10, a creature enters +100

const base = () =>
  scenario()
    .seat(0)
    .battlefield('Island', 'Island', 'Island')
    .library('Island', { count: 8 })
    .seat(1)
    .library('Island', { count: 8 });

describe('at the beginning of your end step (CR 701.42a, 712.14c)', () => {
  test('both cards are exiled and enter as one melded permanent: one object, the combined face, one enters event', () => {
    const g = base().seat(0).battlefield(DUSK).battlefield(DAWN).battlefield(WATCHER).build();
    const life = g.state.seats[0]?.life ?? 0;
    const mark = g.mark();
    g.advanceTo('end');
    settle(g);
    const v = viewOf(g, DUSK);
    expect(v.name).toBe(TITAN);
    expect(g.object(DUSK)).toBe(g.object(DAWN));
    expect(g.object(DUSK).zone).toBe('battlefield');
    expect(g.object(DUSK).face).toBe(1);
    expect(v.meld?.components.map((c) => c.name)).toEqual([DUSK, DAWN]);
    expect(v.meld?.manaValue).toBe(5);
    g.expect.pt(DUSK, 8, 8);
    const events = g.eventsSince(mark);
    expect(events.filter((e) => e.kind === 'melded')).toHaveLength(1);
    // The permanent enters once: a creature entering +100, the Titan's own "when this enters" +3; the two permanents that were exiled each left: +10 each.
    expect(g.state.seats[0]?.life).toBe(life + 100 + 3 + 10 + 10);
    expect(
      events.filter((e) => e.kind === 'zoneChanged' && e.toZone === 'battlefield'),
    ).toHaveLength(2); // the first card's event and the second card's flagged one
    expect(
      events.filter((e) => e.kind === 'zoneChanged' && e.toZone === 'battlefield' && e.component),
    ).toHaveLength(1);
    // Only the permanent is there: no object for the second card is left anywhere.
    expect(g.state.exile).toHaveLength(0);
    expect(checkInvariants(g.state)).toEqual([]);
  });

  test('it enters under the control of the player who controls the ability, summoning sick (CR 302.6) like any permanent that just entered', () => {
    const g = base().seat(0).battlefield(DUSK).battlefield(DAWN).build();
    g.advanceTo('end');
    settle(g);
    expect(g.object(DUSK).controller).toBe(0);
    expect(g.object(DUSK).owner).toBe(0);
    expect(g.object(DUSK).tapped).toBe(false);
  });

  test('the other half of the pair carries no ability of its own: the permanent made by the half that has none is the same permanent', () => {
    const g = base().seat(0).battlefield(EMBER).battlefield(ASH).build();
    g.advanceTo('end');
    settle(g);
    expect(viewOf(g, EMBER).name).toBe('SYNTHETIC Cinder Titan');
    expect(g.object(ASH)).toBe(g.object(EMBER));
  });
});

describe('the condition (CR 603.4: an intervening "if")', () => {
  test('without the other card on the battlefield the ability does not trigger', () => {
    const g = base().seat(0).battlefield(DUSK).hand(DAWN).build();
    const mark = g.mark();
    g.advanceTo('end');
    settle(g);
    expect(g.eventsSince(mark).filter((e) => e.kind === 'abilityTriggered')).toHaveLength(0);
    g.expect.zone(DUSK, 'battlefield');
    g.expect.zone(DAWN, 'hand');
  });

  test('the other card under an opponent control does not count: "you both own and control"', () => {
    const g = base().seat(0).battlefield(DUSK).seat(1).battlefield(DAWN).build();
    g.advanceTo('end');
    settle(g);
    g.expect.zone(DUSK, 'battlefield', { seat: 0 });
    g.expect.zone(DAWN, 'battlefield', { seat: 1 });
  });

  test('a card the player owns but an opponent controls does not count', () => {
    const g = base().seat(0).battlefield(DUSK).battlefield(DAWN, { controller: 1 }).build();
    g.advanceTo('end');
    settle(g);
    expect(g.object(DUSK).zone).toBe('battlefield');
    expect(g.object(DUSK).face).toBe(0);
    expect(g.object(DAWN).controller).toBe(1);
  });

  test('a card of another pair does not count, whatever its name', () => {
    const g = base().seat(0).battlefield(DUSK).battlefield(ASH).build();
    g.advanceTo('end');
    settle(g);
    expect(g.object(DUSK).face).toBe(0);
    g.expect.zone(ASH, 'battlefield');
  });

  test('it is the beginning of your end step only: not at an opponent end step', () => {
    const g = base()
      .seat(0)
      .battlefield(DUSK)
      .battlefield(DAWN)
      .at('precombatMain', { active: 1, turn: 4, priority: 1 })
      .build();
    g.advanceTo('end');
    settle(g);
    expect(g.object(DUSK).face).toBe(0);
  });

  test('the other card leaves in response: the condition is checked again as the ability resolves and nothing is exiled', () => {
    const g = base().seat(0).battlefield(DUSK).battlefield(DAWN).hand('Unsummon').build();
    g.advanceTo('end');
    expect(g.state.stack.length).toBe(1);
    g.act(0).cast('Unsummon', { targets: [DAWN], pay: true });
    settle(g);
    g.expect.zone(DAWN, 'hand', { seat: 0 });
    expect(g.object(DUSK).zone).toBe('battlefield');
    expect(g.object(DUSK).face).toBe(0);
    expect(g.state.exile).toHaveLength(0);
  });
});

describe('only the two cards of one meld pair can be melded (CR 701.42b)', () => {
  const pairs = () =>
    base()
      .seat(0)
      .battlefield(DUSK, { label: 'dusk' })
      .battlefield(DAWN, { label: 'dawn' })
      .battlefield(ASH, { label: 'ash' })
      .battlefield(STRAY, { label: 'stray' })
      .battlefield('Grizzly Bears', { label: 'bears' })
      .build();

  test('a pair is fine; another pair, a card with no counterpart in the game and a card that is not a meld card are not', () => {
    const g = pairs();
    const at = (label: string) => g.object(label);
    expect(meldPairIssue(g.state, at('dusk'), at('dawn'))).toBeNull();
    expect(meldPairIssue(g.state, at('dawn'), at('dusk'))).toBeNull();
    expect(meldPairIssue(g.state, at('dusk'), at('ash'))).toMatch(
      /not the two cards of one meld pair/,
    );
    expect(meldPairIssue(g.state, at('dusk'), at('stray'))).toMatch(
      /not the two cards of one meld pair/,
    );
    expect(meldPairIssue(g.state, at('dusk'), at('bears'))).toMatch(/not a meld card/);
    expect(meldPairIssue(g.state, at('dusk'), at('dusk'))).toMatch(/itself/);
  });

  test('a token is not a card: a token, even one with the right name, can not be melded', () => {
    const g = pairs();
    const token = { ...g.object('dawn'), token: { characteristics: {}, abilities: [] } };
    expect(meldPairIssue(g.state, g.object('dusk'), token as never)).toMatch(/token/);
  });

  test('the two cards must have the same owner (the ability says "you both own")', () => {
    const g = scenario()
      .seat(0)
      .battlefield(DUSK, { label: 'dusk' })
      .seat(1)
      .battlefield(DAWN, { label: 'dawn' })
      .build();
    expect(meldPairIssue(g.state, g.object('dusk'), g.object('dawn'))).toMatch(/different owners/);
  });
});

describe('what can not be melded stays where it is (CR 701.42b, 701.42c)', () => {
  test('a token copy named like the counterpart is melded only when no real card is there to take: here only the token, so both are exiled and the card stays exiled', () => {
    const g = base()
      .seat(0)
      .battlefield('Island', 'Island', 'Island', 'Island', 'Island')
      .battlefield(DUSK, { label: 'dusk' })
      .battlefield(DAWN, { label: 'dawn' })
      .hand('SYNTHETIC Echo Image', 'SYNTHETIC Meld Exile')
      .build();
    g.act(0).cast('SYNTHETIC Echo Image', { targets: ['dawn'], pay: true });
    settle(g);
    g.act(0).cast('SYNTHETIC Meld Exile', { targets: ['dawn'], pay: true });
    settle(g);
    g.expect.zone(DAWN, 'exile');
    const mark = g.mark();
    g.advanceTo('end');
    settle(g);
    // CR 701.42c: the card and the token were exiled and could not be melded; the card stays exiled, the token ceased to exist.
    g.expect.zone(DUSK, 'exile');
    expect(g.view(0).battlefield.filter((o) => o.name === DAWN)).toHaveLength(0);
    expect(g.eventsSince(mark).some((e) => e.kind === 'meldFailed')).toBe(true);
    expect(g.eventsSince(mark).some((e) => e.kind === 'melded')).toBe(false);
    expect(checkInvariants(g.state)).toEqual([]);
  });

  test('with the real card there too, the card is the one that melds, whichever the battlefield lists first', () => {
    const g = base()
      .seat(0)
      .battlefield('Island', 'Island', 'Island', 'Island')
      .battlefield(DUSK, { label: 'dusk' })
      .battlefield(DAWN, { label: 'dawn' })
      .hand('SYNTHETIC Echo Image')
      .build();
    g.act(0).cast('SYNTHETIC Echo Image', { targets: ['dawn'], pay: true });
    settle(g);
    g.advanceTo('end');
    settle(g);
    expect(viewOf(g, 'dusk').name).toBe(TITAN);
    expect(g.object('dawn')).toBe(g.object('dusk'));
    // The token copy of the counterpart was not touched.
    expect(g.view(0).battlefield.filter((o) => o.name === DAWN)).toHaveLength(1);
  });
});

describe('a commander that is the card without the meld ability (CR 903.3b)', () => {
  test('is still the commander of the melded permanent, and the first card of it', () => {
    const g = base()
      .seat(0)
      .battlefield(DUSK, { label: 'dusk' })
      .battlefield(DAWN, { label: 'dawn', commander: true })
      .build();
    g.advanceTo('end');
    settle(g);
    expect(viewOf(g, DUSK).name).toBe(TITAN);
    expect(viewOf(g, DUSK).isCommander).toBe(true);
    expect(g.state.cards[g.object(DUSK).card as never]?.isCommander).toBe(true);
    expect(g.state.commanderWatch).toEqual([]);
    expect(checkInvariants(g.state)).toEqual([]);
  });
});

describe('cast, copied, turned over (CR 712.8b, 712.9, 707.8, 712.16)', () => {
  test('a meld card is cast as its front face and enters as that card, not melded (CR 712.8b, 712.8a)', () => {
    const g = scenario()
      .seat(0)
      .hand(DUSK)
      .battlefield('Plains', 'Plains', 'Plains')
      .library('Island', { count: 8 })
      .seat(1)
      .library('Island', { count: 8 })
      .build();
    g.act(0).cast(DUSK, { pay: true });
    expect(viewOf(g, DUSK).name).toBe(DUSK);
    g.passAll();
    g.expect.zone(DUSK, 'battlefield', { seat: 0 });
    expect(g.object(DUSK).face).toBe(0);
    expect(g.object(DUSK).meldedWith).toBeUndefined();
    g.expect.pt(DUSK, 2, 2);
  });
});
