// A melded commander (CR 903.3b, 903.9a, 903.9b, 903.9c, 903.10a; D-277). If a player's commander is a meld card and it is melded with the other member of its pair,
// the melded permanent is that player's commander (CR 903.3b): it deals commander damage under the commander card, it is "a commander" to everything that asks,
// and when the player puts it into the command zone instead of their hand or library only the commander card goes there and the other card goes where the
// permanent would have gone (CR 903.9c). In a graveyard or exile each card is its own object and only the commander card may go to the command zone
// (CR 903.9a). Cards are SYNTHETIC (src/cards/fixtures/synthetic-meld.ts).
import { describe, expect, test } from 'vitest';
import { checkInvariants } from '../src/index';
import { scenario } from '../src/testing/index';
import { viewOf } from './layout-helpers';
import { settle } from './meld-helpers';

const DUSK = 'SYNTHETIC Dusk Squire'; // the commander card, {2}{W}
const DAWN = 'SYNTHETIC Dawn Squire'; // the other card
const EXILE = 'SYNTHETIC Meld Exile';
const TUCK = 'SYNTHETIC Meld Tuck';

const build = (...hand: string[]) =>
  scenario()
    .seat(0)
    .battlefield(DUSK, { label: 'dusk', meldedWith: 'dawn', commander: true })
    .battlefield(DAWN, { label: 'dawn' })
    .battlefield('Swamp', 'Swamp', 'Swamp', 'Plains', 'Island', 'Island')
    .hand(...hand)
    .library('Island', { count: 6 })
    .seat(1)
    .library('Island', { count: 6 })
    .build();

describe('the melded permanent is the commander (CR 903.3b)', () => {
  test('the view says so, and the commander card is the one the flag is on', () => {
    const g = build();
    expect(viewOf(g, 'dusk').isCommander).toBe(true);
    expect(g.state.cards[g.object('dusk').card as never]?.isCommander).toBe(true);
    expect(checkInvariants(g.state)).toEqual([]);
  });

  test('it deals commander damage under the commander card (CR 903.10a)', () => {
    const g = scenario()
      .seat(0)
      .battlefield(DUSK, { label: 'dusk', meldedWith: 'dawn', commander: true })
      .battlefield(DAWN, { label: 'dawn' })
      .library('Island', { count: 8 })
      .seat(1)
      .library('Island', { count: 8 })
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack('dusk');
    g.advanceTo('postcombatMain');
    g.expect.life(1, 32);
    g.expect.commanderDamage(1, DUSK, 8);
  });

  test('a melded commander on the battlefield is a commander you control, and the same when its other card is the one a spell names', () => {
    const g = build();
    expect(viewOf(g, DAWN).isCommander).toBe(true); // the one object that both cards are
  });
});

describe('it dies or is exiled: the commander card may go to the command zone (CR 903.9a)', () => {
  test('dies: two cards in the graveyard, one question about the commander card, and only it moves', () => {
    const g = build('Murder');
    g.act(0).cast('Murder', { targets: ['dusk'], pay: true });
    settle(g);
    g.expect.zone(DUSK, 'graveyard', { seat: 0 });
    g.expect.zone(DAWN, 'graveyard', { seat: 0 });
    g.expect.pending('commanderZone', 0);
    const d = g.state.pending;
    expect(d?.kind === 'commanderZone' && g.state.objects[d.object]?.card).toBe(
      g.state.cards[g.object(DUSK).card as never]?.id,
    );
    g.act(0).sendToCommandZone();
    g.expect.zone(DUSK, 'command', { seat: 0 });
    g.expect.zone(DAWN, 'graveyard', { seat: 0 }); // the other card stays
    expect(checkInvariants(g.state)).toEqual([]);
  });

  test('dies, declined: both cards stay in the graveyard', () => {
    const g = build('Murder');
    g.act(0).cast('Murder', { targets: ['dusk'], pay: true });
    settle(g);
    g.act(0).declineCommandZone();
    g.expect.zone(DUSK, 'graveyard', { seat: 0 });
    g.expect.zone(DAWN, 'graveyard', { seat: 0 });
  });

  test('exiled: the question is about the commander card alone', () => {
    const g = build(EXILE);
    g.act(0).cast(EXILE, { targets: ['dusk'], pay: true });
    settle(g);
    g.expect.pending('commanderZone', 0);
    g.act(0).sendToCommandZone();
    g.expect.zone(DUSK, 'command', { seat: 0 });
    g.expect.zone(DAWN, 'exile');
  });
});

describe('it would be put into its owner hand or library: the replacement effect (CR 903.9b, 903.9c)', () => {
  test('returned to hand, put into the command zone: the commander card goes there, the other card to the hand (CR 903.9c)', () => {
    const g = build('Unsummon');
    g.act(0).cast('Unsummon', { targets: ['dusk'], pay: true });
    settle(g);
    g.expect.pending('commanderZone', 0);
    g.act(0).sendToCommandZone();
    g.expect.zone(DUSK, 'command', { seat: 0 });
    g.expect.zone(DAWN, 'hand', { seat: 0 });
    expect(checkInvariants(g.state)).toEqual([]);
  });

  test('returned to hand, declined: both cards go to the hand', () => {
    const g = build('Unsummon');
    g.act(0).cast('Unsummon', { targets: ['dusk'], pay: true });
    settle(g);
    g.act(0).declineCommandZone();
    g.expect.zone(DUSK, 'hand', { seat: 0 });
    g.expect.zone(DAWN, 'hand', { seat: 0 });
  });

  test('put on top of the library, put into the command zone: the other card goes to the library', () => {
    const g = build(TUCK);
    g.act(0).cast(TUCK, { targets: ['dusk'], pay: true });
    settle(g);
    g.expect.pending('commanderZone', 0);
    g.act(0).sendToCommandZone();
    g.expect.zone(DUSK, 'command', { seat: 0 });
    g.expect.zone(DAWN, 'library', { seat: 0 });
    g.expect.librarySize(0, 7);
  });

  test('a commander of the opponent is theirs: its owner is asked, not the player who bounced it', () => {
    const g = scenario()
      .seat(0)
      .battlefield('Island')
      .hand('Unsummon')
      .library('Island', { count: 6 })
      .seat(1)
      .battlefield(DUSK, { label: 'dusk', meldedWith: 'dawn', commander: true })
      .battlefield(DAWN, { label: 'dawn' })
      .library('Island', { count: 6 })
      .build();
    g.act(0).cast('Unsummon', { targets: ['dusk'], pay: true });
    settle(g);
    g.expect.pending('commanderZone', 1);
    g.act(1).sendToCommandZone();
    g.expect.zone(DUSK, 'command', { seat: 1 });
    g.expect.zone(DAWN, 'hand', { seat: 1 });
  });
});
