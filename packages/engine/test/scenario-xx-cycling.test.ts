// Cycling (CR 702.29): "Cycling [cost]" means "[Cost], Discard this card: Draw a card."
// Pins: CR 702.29a (an activated ability that functions only from the hand), CR 702.29b (it
// continues to exist elsewhere, but cannot be activated there), CR 113.6b (an ability that states
// the zones it functions in functions only from those zones), CR 602.2 (activation), CR 903.9a (a
// commander put into a graveyard may go to the command zone). Cards are SYNTHETIC.
import { describe, expect, test } from 'vitest';
import { type Action, getLegalActions } from '../src/index';
import { derive } from '../src/rules/derive';
import { type ScenarioGame, scenario } from '../src/testing/index';

const CYCLER = 'SYNTHETIC Cycling Bear';
const LAND = 'SYNTHETIC Cycling Land';
const LIFE_CYCLER = 'SYNTHETIC Life Cycler';

const activates = (g: ScenarioGame, seat: 0 | 1 = 0): Action[] =>
  getLegalActions(g.state, seat).filter((a) => a.kind === 'activate');

describe('CR 702.29a (Cycling): from the hand, pay, discard, draw', () => {
  const build = () =>
    scenario()
      .seat(0)
      .hand(CYCLER)
      .battlefield('Forest', 'Forest')
      .library('Plains', 'Island')
      .seat(1)
      .build();

  test('the card is discarded as a cost, then the ability on the stack draws a card', () => {
    const g = build();
    const bear = g.id(CYCLER);
    const mark = g.mark();
    g.act(0).activate(CYCLER, { pay: true });
    // The discard was paid before the ability went on the stack: the card is already in the graveyard.
    g.expect.zone(CYCLER, 'graveyard', { seat: 0 });
    g.expect.handSize(0, 0);
    g.expect.stack([`${CYCLER} (ability)`]);
    g.expect.eventLog(
      [
        { kind: 'zoneChanged', fromZone: 'hand', toZone: 'graveyard' },
        { kind: 'discarded', seat: 0, object: bear },
        { kind: 'tapped' },
        { kind: 'tapped' },
        { kind: 'abilityActivated', seat: 0, source: bear },
      ],
      { since: mark },
    );
    g.passAll();
    g.expect.handSize(0, 1);
    g.expect.zone('Plains', 'hand', { seat: 0 }); // the top card of the library
    g.expect.librarySize(0, 1);
  });

  test('it works at instant speed, on either turn, with something on the stack', () => {
    for (const [step, active] of [
      ['upkeep', 1],
      ['beginningOfCombat', 0],
      ['end', 1],
    ] as const) {
      const g = scenario()
        .seat(0)
        .hand(CYCLER)
        .battlefield('Forest', 'Forest')
        .library('Plains')
        .seat(1)
        .at(step, { active, priority: 0 })
        .build();
      expect(activates(g), `${step} ${active}`).toHaveLength(1);
    }
    const g = scenario()
      .seat(0)
      .hand(CYCLER, 'Lightning Bolt')
      .battlefield('Forest', 'Forest', 'Mountain')
      .library('Plains')
      .seat(1)
      .build();
    g.act(0)
      .cast('Lightning Bolt', { targets: [{ player: 1 }] })
      .payManual(['Mountain']);
    g.expect.stack(['Lightning Bolt']);
    expect(activates(g)).toHaveLength(1);
    g.act(0).activate(CYCLER, { pay: true });
    g.expect.stack([`${CYCLER} (ability)`, 'Lightning Bolt']);
  });

  test('it needs its cost: not offered without the mana, refused with a reason', () => {
    const g = scenario()
      .seat(0)
      .hand(CYCLER)
      .battlefield('Forest')
      .library('Plains')
      .seat(1)
      .build();
    expect(activates(g)).toEqual([]);
    expect(g.act(0).try.activate(CYCLER)).toMatchObject({
      ok: false,
      error: expect.stringContaining('mana'),
    });
  });

  test('it can be activated from the hand only: not the battlefield, graveyard or exile', () => {
    for (const zone of ['battlefield', 'graveyard', 'exile'] as const) {
      const g = scenario().seat(0)[zone](CYCLER).battlefield('Forest', 'Forest').seat(1).build();
      expect(activates(g), zone).toEqual([]);
      expect(
        g.act(0).try.action({ kind: 'activate', object: g.id(CYCLER), abilityIndex: 1 }).ok,
        zone,
      ).toBe(false);
    }
  });

  test('only the owner cycles: the opponent never sees it, even with priority', () => {
    const g = scenario()
      .seat(0)
      .hand(CYCLER)
      .seat(1)
      .battlefield('Forest', 'Forest')
      .at('precombatMain', { active: 0, priority: 1 })
      .build();
    expect(activates(g, 1)).toEqual([]);
    const r = g.act(1).try.action({ kind: 'activate', object: g.id(CYCLER), abilityIndex: 1 });
    expect(r.ok).toBe(false);
  });

  test('a card with no library to draw from still cycles (the draw is what fails, CR 704.5b)', () => {
    const g = scenario().seat(0).hand(CYCLER).battlefield('Forest', 'Forest').seat(1).build();
    expect(activates(g)).toHaveLength(1);
    g.act(0).activate(CYCLER, { pay: true });
    g.passAll();
    g.expect.hasLost(0);
  });
});

describe('the keyword stays and the ability is added after the printed ones (CR 702.29b)', () => {
  test('derived abilities: the keyword first, then its expansion, which functions in the hand', () => {
    const g = scenario().seat(0).hand(CYCLER).seat(1).build();
    const abilities = derive(g.state, g.object(CYCLER)).abilities;
    expect(abilities).toEqual([
      { kind: 'keyword', keyword: { kind: 'cycling', cost: [{ kind: 'mana', symbols: ['2'] }] } },
      {
        kind: 'activated',
        cost: [
          { kind: 'mana', symbols: ['2'] },
          { kind: 'discardThis', cycling: true },
        ],
        effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
        functionsIn: 'hand',
      },
    ]);
  });

  test('printed abilities keep their indexes: the land has its mana ability at 0', () => {
    const g = scenario().seat(0).hand(LAND).battlefield('Forest').library('Plains').seat(1).build();
    const abilities = derive(g.state, g.object(LAND)).abilities;
    expect(abilities.map((a) => a.kind)).toEqual(['mana', 'keyword', 'activated']);
    expect(activates(g)).toEqual([{ kind: 'activate', object: g.id(LAND), abilityIndex: 2 }]);
    // The land on the battlefield taps for mana as usual and cannot cycle.
    const field = scenario().seat(0).battlefield(LAND, 'Forest').seat(1).build();
    expect(activates(field)).toEqual([]);
    field.act(0).tapForMana(LAND);
    field.expect.pool(0, 'G');
  });

  test('the view lists the activation for the card in hand and the keyword', () => {
    const g = scenario().seat(0).hand(CYCLER).seat(1).build();
    const view = g.view(0).seats[0]?.hand?.[0];
    expect(view?.keywords).toContain('cycling');
    expect(view?.activated).toHaveLength(1);
    expect(view?.activated?.[0]?.abilityIndex).toBe(1);
    // The opponent's hand is hidden: nothing about it is shown.
    expect(g.view(1).seats[0]?.hand).toBeNull();
  });
});

describe('other cycling costs and discarding a commander', () => {
  test('Cycling-Pay 2 life takes the life, and needs at least 2', () => {
    const g = scenario().seat(0).hand(LIFE_CYCLER).library('Plains').seat(1).build();
    g.act(0).activate(LIFE_CYCLER);
    g.expect.life(0, 38);
    g.expect.zone(LIFE_CYCLER, 'graveyard', { seat: 0 });
    const poor = scenario().seat(0).life(1).hand(LIFE_CYCLER).seat(1).build();
    expect(activates(poor)).toEqual([]);
  });

  test('a commander cycled to the graveyard may go to the command zone (CR 903.9a)', () => {
    const g = scenario()
      .seat(0)
      .hand(CYCLER, { commander: true })
      .battlefield('Forest', 'Forest')
      .library('Plains')
      .seat(1)
      .build();
    g.act(0).activate(CYCLER, { pay: true });
    g.expect.pending('commanderZone', 0);
    g.act(0).sendToCommandZone();
    g.expect.zone(CYCLER, 'command', { seat: 0 });
    g.expect.stack([`${CYCLER} (ability)`]);
    g.passAll();
    g.expect.handSize(0, 1);
  });
});
