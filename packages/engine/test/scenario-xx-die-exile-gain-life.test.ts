// "If a nontoken creature an opponent controls would die, instead exile it and you gain 2 life" (The Darkness Crystal, Witch-king of Angmar deck): `wouldDie.alsoGainLife` and
// `linkExiled`. Pins: CR 614.1a (a replacement: the creature never dies), CR 700.4 (dies), CR 119.1 (life gain), CR 607.2a (linked abilities: "exiled with ~").
// The card is SYNTHETIC; defined here.
import { describe, test } from 'vitest';
import { scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const CRYSTAL = 'SYNTHETIC Dark Crystal';
const BOLT = 'Lightning Bolt';
const BEARS = 'Grizzly Bears';

const CRYSTAL_CARD = singleFaceCard({
  name: CRYSTAL,
  manaCost: ['2', 'B'],
  types: ['artifact'],
  colors: ['B'],
  colorIdentity: ['B'],
  oracleText:
    'If a nontoken creature an opponent controls would die, instead exile it and you gain 2 life.',
  abilities: [
    {
      kind: 'replacement',
      replacement: {
        kind: 'wouldDie',
        what: { types: ['creature'], token: false, controller: 'opponent' },
        instead: 'exile',
        alsoGainLife: 2,
      },
    },
  ],
});

describe('exile it instead and gain life (CR 614.1a)', () => {
  const board = () =>
    scenario()
      .define(CRYSTAL_CARD)
      .seat(0)
      .battlefield(CRYSTAL)
      .seat(1)
      .battlefield(BEARS)
      .hand(BOLT)
      .battlefield('Mountain')
      .at('precombatMain', { active: 1 })
      .build();

  test('a nontoken creature an opponent controls that would die is exiled and its replacer’s controller gains 2 life', () => {
    const g = board();
    g.act(1).cast(BOLT, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'exile', { seat: 1 });
    g.expect.life(0, 42);
    g.expect.noEvent({ kind: 'died' });
    g.expect.invariants();
  });
});
