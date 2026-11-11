// Scenario 21 (SPEC 12): a commander changing zones.
// Pins: CR 903.9a (Commander) and CR 704.6d (State-Based Actions): a commander in a graveyard or in
// exile that was put there since the last check may be put into the command zone by its owner, a
// state-based action; CR 903.9b: if a commander would be put into its owner's hand or library from
// anywhere, its owner may put it into the command zone instead, a replacement effect; CR 701.6a
// (Counter): a countered spell is put into its owner's graveyard; CR 400.7 (General): the commander
// is a new object after every move.
// "SYNTHETIC Exile Creature" is an invented card (not real data) used for the exile half of 903.9a.
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import { scenario } from '../src/testing/index';

const ISAMARU = 'Isamaru, Hound of Konda';

const exileCreature = singleFace({
  name: 'SYNTHETIC Exile Creature',
  manaCost: ['1', 'W'],
  types: ['instant'],
  colors: ['W'],
  colorIdentity: ['W'],
  oracleText: 'Exile target creature.',
  spell: {
    targets: [
      { id: 't1', what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } } },
    ],
    effect: { kind: 'exile', objects: { kind: 'target', id: 't1' } },
  },
});

/** Seat 0's commander is on the battlefield; seat 1 holds priority and a removal spell. */
function removalGame(spell: string, lands: readonly string[]) {
  const b = scenario()
    .define(exileCreature)
    .seat(0)
    .battlefield(ISAMARU, { commander: true, label: 'cmd' })
    .seat(1)
    .hand(spell);
  for (const land of lands) b.battlefield(land);
  const g = b.at('precombatMain', { active: 0, priority: 1 }).build();
  g.act(1).cast(spell, { targets: [{ name: ISAMARU }], pay: true });
  return g;
}

describe('CR 903.9a (Commander): a destroyed commander, as a state-based action', () => {
  test('the owner is asked after the destroy resolves, and may put it in the command zone', () => {
    const g = removalGame('Murder', ['Swamp', 'Swamp', 'Swamp']);
    const before = g.id('cmd');
    g.passAll();
    g.expect.pending('commanderZone', 0);
    expect(g.state.pending).toMatchObject({ kind: 'commanderZone', from: 'graveyard' });
    // It died (battlefield to graveyard) and is in the graveyard until the owner chooses.
    g.expect.zone(ISAMARU, 'graveyard', { seat: 0 });
    g.expect.eventLog([{ kind: 'died', cardName: ISAMARU }]);
    g.act(0).sendToCommandZone();
    g.expect.zone(ISAMARU, 'command', { seat: 0 });
    g.expect.noObject(ISAMARU, { zone: 'graveyard' });
    expect(g.id('cmd')).not.toBe(before);
    g.expect.eventLog([{ kind: 'commanderMovedToCommandZone', from: 'graveyard' }]);
    g.expect.pending('priority', 0);
    g.expect.stack([]);
  });

  test('the owner may decline, and the commander stays in the graveyard', () => {
    const g = removalGame('Murder', ['Swamp', 'Swamp', 'Swamp']);
    g.passAll();
    g.expect.pending('commanderZone', 0);
    g.act(0).declineCommandZone();
    g.expect.zone(ISAMARU, 'graveyard', { seat: 0 });
    g.expect.noObject(ISAMARU, { zone: 'command' });
    g.expect.noEvent({ kind: 'commanderMovedToCommandZone' });
    g.expect.pending('priority', 0);
  });

  test('a declined commander is not asked about again at later checks', () => {
    const g = removalGame('Murder', ['Swamp', 'Swamp', 'Swamp']);
    g.passAll();
    g.act(0).declineCommandZone();
    expect(g.state.commanderWatch).toEqual([]);
    g.passAll();
    g.passAll();
    expect(g.state.pending?.kind).toBe('priority');
    g.expect.zone(ISAMARU, 'graveyard', { seat: 0 });
  });

  test('a commander exiled is offered the choice too, from exile', () => {
    const g = removalGame('SYNTHETIC Exile Creature', ['Plains', 'Plains']);
    g.passAll();
    g.expect.pending('commanderZone', 0);
    expect(g.state.pending).toMatchObject({ kind: 'commanderZone', from: 'exile' });
    g.expect.zone(ISAMARU, 'exile', { seat: 0 });
    g.act(0).sendToCommandZone();
    g.expect.zone(ISAMARU, 'command', { seat: 0 });
    g.expect.noEvent({ kind: 'died' });
  });

  test('declining after exile leaves it in exile', () => {
    const g = removalGame('SYNTHETIC Exile Creature', ['Plains', 'Plains']);
    g.passAll();
    g.act(0).declineCommandZone();
    g.expect.zone(ISAMARU, 'exile', { seat: 0 });
  });

  test('a commander controlled by the opponent is the owner choice, in the owner zones', () => {
    const g = scenario()
      .seat(0)
      .battlefield(ISAMARU, { commander: true, controller: 1 })
      .seat(1)
      .hand('Murder')
      .battlefield('Swamp', { count: 3 })
      .at('precombatMain', { active: 1, priority: 1 })
      .build();
    g.act(1).cast('Murder', { targets: [{ name: ISAMARU }], pay: true });
    g.passAll();
    // Seat 0 owns it, so seat 0 decides even though seat 1 controlled it and cast the Murder.
    g.expect.pending('commanderZone', 0);
    g.expect.zone(ISAMARU, 'graveyard', { seat: 0 });
    g.act(0).sendToCommandZone();
    g.expect.zone(ISAMARU, 'command', { seat: 0 });
  });

  test('a card that is not a commander dying is never offered anything', () => {
    const g = scenario()
      .seat(0)
      .battlefield('Grizzly Bears')
      .seat(1)
      .hand('Murder')
      .battlefield('Swamp', { count: 3 })
      .at('precombatMain', { active: 0, priority: 1 })
      .build();
    g.act(1).cast('Murder', { targets: [{ name: 'Grizzly Bears' }], pay: true });
    g.passAll();
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 0 });
    g.expect.pending('priority', 0);
  });
});

describe('CR 903.9b (Commander): a bounced commander, as a replacement effect', () => {
  function bounce() {
    const g = removalGame('Unsummon', ['Island']);
    g.passAll();
    return g;
  }

  test('the owner is asked in the middle of the resolution', () => {
    const g = bounce();
    g.expect.pending('commanderZone', 0);
    expect(g.state.pending).toMatchObject({ kind: 'commanderZone', from: 'hand' });
    // Still resolving: Unsummon is on the stack and nothing has moved yet (replacement, not a result).
    g.expect.stack(['Unsummon']);
    expect(g.state.resolution).not.toBeNull();
    g.expect.zone(ISAMARU, 'battlefield', { seat: 0 });
  });

  test('moving it to the command zone instead: it never reaches the hand', () => {
    const g = bounce();
    g.act(0).sendToCommandZone();
    g.expect.zone(ISAMARU, 'command', { seat: 0 });
    g.expect.noObject(ISAMARU, { zone: 'hand' });
    g.expect.noObject(ISAMARU, { zone: 'graveyard' });
    g.expect.noEvent({ kind: 'zoneChanged', toZone: 'hand' });
    g.expect.noEvent({ kind: 'died' });
    // The resolution carried on: Unsummon finished and went to the graveyard; seat 0 has priority.
    g.expect.zone('Unsummon', 'graveyard', { seat: 1 });
    g.expect.stack([]);
    g.expect.pending('priority', 0);
    expect(g.state.resolution).toBeNull();
  });

  test('declining: it goes to the hand', () => {
    const g = bounce();
    g.act(0).declineCommandZone();
    g.expect.zone(ISAMARU, 'hand', { seat: 0 });
    g.expect.noObject(ISAMARU, { zone: 'command' });
    g.expect.zone('Unsummon', 'graveyard', { seat: 1 });
    g.expect.pending('priority', 0);
  });

  test('a commander in the hand is not offered anything at the next checks (not graveyard or exile)', () => {
    const g = bounce();
    g.act(0).declineCommandZone();
    g.passAll();
    g.passAll();
    expect(g.state.pending?.kind).toBe('priority');
    g.expect.zone(ISAMARU, 'hand', { seat: 0 });
  });

  test('a bounced card that is not a commander goes to the hand with no question', () => {
    const g = scenario()
      .seat(0)
      .battlefield('Grizzly Bears')
      .seat(1)
      .hand('Unsummon')
      .battlefield('Island')
      .at('precombatMain', { active: 0, priority: 1 })
      .build();
    const before = g.id('Grizzly Bears');
    g.act(1).cast('Unsummon', { targets: [{ name: 'Grizzly Bears' }], pay: true });
    g.passAll();
    g.expect.zone('Grizzly Bears', 'hand', { seat: 0 });
    expect(g.id('Grizzly Bears')).not.toBe(before);
    g.expect.pending('priority', 0);
  });
});

describe('CR 701.6a (Counter) and CR 903.9a: a countered commander spell', () => {
  function countered() {
    const g = scenario()
      .seat(0)
      .commander(ISAMARU, { label: 'cmd' })
      .battlefield('Plains', { count: 4 })
      .seat(1)
      .hand('Counterspell')
      .battlefield('Island', { count: 2 })
      .build();
    g.act(0).cast('cmd', { pay: true });
    g.expect.stack([ISAMARU]);
    g.act(0).pass();
    g.act(1).cast('Counterspell', { targets: [{ name: ISAMARU, zone: 'stack' }], pay: true });
    g.passAll();
    return g;
  }

  test('it goes to the graveyard first, then the owner may move it to the command zone', () => {
    const g = countered();
    g.expect.eventLog([
      { kind: 'countered', cardName: ISAMARU },
      { kind: 'zoneChanged', cardName: ISAMARU, fromZone: 'stack', toZone: 'graveyard' },
    ]);
    g.expect.pending('commanderZone', 0);
    g.expect.zone(ISAMARU, 'graveyard', { seat: 0 });
    // Not a "died" event: it was a spell, not a permanent (CR 700.4).
    g.expect.noEvent({ kind: 'died' });
    g.act(0).sendToCommandZone();
    g.expect.zone(ISAMARU, 'command', { seat: 0 });
    g.expect.noObject(ISAMARU, { zone: 'graveyard' });
  });

  test('the owner may leave it in the graveyard', () => {
    const g = countered();
    g.act(0).declineCommandZone();
    g.expect.zone(ISAMARU, 'graveyard', { seat: 0 });
    g.expect.noObject(ISAMARU, { zone: 'command' });
  });

  test('the cast still counts for the tax: it was cast from the command zone (CR 903.8)', () => {
    const g = countered();
    g.act(0).sendToCommandZone();
    const card = g.object('cmd').card;
    expect(card && g.state.commanderCasts[card]).toBe(1);
    // Recasting costs {W}{2}: three untapped Plains are left, exactly enough.
    g.expect.legal(0, { cast: 'cmd' });
  });
});

describe('CR 903.9a (Commander): "since the last time state-based actions were checked"', () => {
  test('a commander that was already in the graveyard is not offered the choice', () => {
    const g = scenario().seat(0).graveyard(ISAMARU, { commander: true }).seat(1).build();
    g.passAll();
    g.passAll();
    expect(g.state.pending?.kind).toBe('priority');
    g.expect.zone(ISAMARU, 'graveyard', { seat: 0 });
  });

  test('a commander that was already in exile is not offered the choice', () => {
    const g = scenario().seat(0).exile(ISAMARU, { commander: true }).seat(1).build();
    g.passAll();
    expect(g.state.pending?.kind).toBe('priority');
  });

  test('a commander that went to the command zone through 903.9b never visits a graveyard', () => {
    const g = removalGame('Unsummon', ['Island']);
    g.passAll();
    g.act(0).sendToCommandZone();
    g.expect.noEvent({ kind: 'zoneChanged', toZone: 'graveyard', cardName: ISAMARU });
    expect(g.state.commanderWatch).toEqual([]);
  });
});
