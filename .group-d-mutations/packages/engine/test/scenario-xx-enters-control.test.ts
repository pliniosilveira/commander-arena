// Who controls an object an effect puts onto the battlefield (CR 110.2a).
// Pins: CR 110.2a ("If an effect instructs a player to put an object onto the battlefield, that
// object enters the battlefield under that player's control unless the effect states otherwise"),
// CR 108.3 (the owner is the player who started the game with the card), CR 400.7 (a new object).
// Cards are defined in this file and are SYNTHETIC.
import { describe, expect, test } from 'vitest';
import type { Effect } from '../src/ast/types';
import { singleFace } from '../src/cards/fixtures/helpers';
import { scenario } from '../src/testing/index';

const BEARS = 'Grizzly Bears';

/** "Put target creature card from a graveyard onto the battlefield" with the control as given. */
function reanimator(name: string, controller?: 'owner' | 'you') {
  return singleFace({
    name,
    manaCost: ['B'],
    types: ['sorcery'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText: 'SYNTHETIC: put target creature card from a graveyard onto the battlefield.',
    spell: {
      targets: [
        { id: 't1', what: { kind: 'object', filter: { zone: 'graveyard', types: ['creature'] } } },
      ],
      effect: {
        kind: 'moveToZone',
        objects: { kind: 'target', id: 't1' },
        to: 'battlefield',
        ...(controller === undefined ? {} : { controller }),
      },
    },
  });
}

const DEFAULT = reanimator('SYNTHETIC Reanimate Default');
const YOU = reanimator('SYNTHETIC Reanimate You', 'you');
const OWNER = reanimator('SYNTHETIC Reanimate Owner', 'owner');

/** Seat 0 casts `card` on the creature in seat 1's graveyard. */
function stealFromGraveyard(card: typeof DEFAULT) {
  const g = scenario()
    .define(card)
    .seat(0)
    .hand(card.name)
    .pool('B')
    .seat(1)
    .graveyard(BEARS)
    .build();
  g.act(0).cast(card.name, { targets: [BEARS], pay: true });
  g.passAll();
  return g;
}

describe('moveToZone to the battlefield: the player performing the effect controls it (CR 110.2a)', () => {
  test('with no control stated, the caster controls a card from the opponent graveyard', () => {
    const g = stealFromGraveyard(DEFAULT);
    const bears = g.object(BEARS);
    expect(bears.zone).toBe('battlefield');
    expect(bears.owner).toBe(1);
    expect(bears.controller).toBe(0);
  });

  test("'you' says the same thing explicitly", () => {
    const g = stealFromGraveyard(YOU);
    expect(g.object(BEARS).controller).toBe(0);
    expect(g.object(BEARS).owner).toBe(1);
  });

  test("'owner' is the explicit exception: the owner gets it back", () => {
    const g = stealFromGraveyard(OWNER);
    expect(g.object(BEARS).controller).toBe(1);
    expect(g.object(BEARS).owner).toBe(1);
  });

  test('a card from your own graveyard is yours either way', () => {
    const g = scenario()
      .define(DEFAULT)
      .seat(0)
      .hand(DEFAULT.name)
      .pool('B')
      .graveyard(BEARS)
      .seat(1)
      .build();
    g.act(0).cast(DEFAULT.name, { targets: [BEARS], pay: true });
    g.passAll();
    expect(g.object(BEARS).controller).toBe(0);
  });

  test('other destinations ignore the control: a card goes to its owner hand', () => {
    const bounce: Effect = {
      kind: 'moveToZone',
      objects: { kind: 'target', id: 't1' },
      to: 'hand',
    };
    const card = singleFace({
      name: 'SYNTHETIC Return From Graveyard',
      manaCost: ['B'],
      types: ['sorcery'],
      colors: ['B'],
      colorIdentity: ['B'],
      oracleText: 'SYNTHETIC: return target creature card from a graveyard to its owner hand.',
      spell: {
        targets: [
          {
            id: 't1',
            what: { kind: 'object', filter: { zone: 'graveyard', types: ['creature'] } },
          },
        ],
        effect: bounce,
      },
    });
    const g = scenario()
      .define(card)
      .seat(0)
      .hand(card.name)
      .pool('B')
      .seat(1)
      .graveyard(BEARS)
      .build();
    g.act(0).cast(card.name, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'hand', { seat: 1 });
  });
});
