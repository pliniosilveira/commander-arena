// Issue 81 (Jace, Multiverse Architect): "At the beginning of combat on each opponent's turn, they may pay {2}. If they don't, creatures they control can't attack Jaces you control
// this turn." Pins: CR 508.1a (an attack restriction is about each defender), 506.3 (a planeswalker can be attacked), 118.12a (the payer is asked, the effect happens when they do not
// pay), 611.2a (until end of turn). Cards: the SYNTHETIC "Jace Warden" of this file, the SYNTHETIC Jace planeswalkers and the real Grizzly Bears, Mountain and Plains.
import { describe, test } from 'vitest';
import { scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const WARDEN = 'SYNTHETIC Jace Warden';
const JACE = 'SYNTHETIC Jace Walker';
const GIDEON = 'SYNTHETIC Gideon Walker';
const BEARS = 'Grizzly Bears';
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

const warden = singleFaceCard({
  name: WARDEN,
  manaCost: ['2', 'U'],
  types: ['enchantment'],
  colors: ['U'],
  colorIdentity: ['U'],
  oracleText:
    "At the beginning of combat on each opponent's turn, they may pay {2}. If they don't, creatures they control can't attack Jaces you control this turn.",
  abilities: [
    {
      kind: 'triggered',
      trigger: { kind: 'step', step: 'beginCombat', whose: 'opponent' },
      effect: {
        kind: 'unlessPays',
        player: { kind: 'triggerPlayer' },
        cost: [{ kind: 'mana', symbols: ['2'] }],
        effect: {
          kind: 'cantAttackPlaneswalkers',
          objects: {
            kind: 'each',
            filter: { zone: 'battlefield', types: ['creature'], controller: 'triggerPlayer' },
          },
          subtype: 'Jace',
        },
      },
    },
  ],
});
const walker = (name: string, subtype: string) =>
  singleFaceCard({
    name,
    manaCost: ['2'],
    types: ['planeswalker'],
    subtypes: [subtype],
    colors: [],
    colorIdentity: [],
    loyalty: 3,
    oracleText: '',
  });

function board() {
  const g = scenario()
    .seat(0)
    .define(warden)
    .define(walker(JACE, 'Jace'))
    .define(walker(GIDEON, 'Gideon'))
    .library(...LIBRARY)
    .battlefield(WARDEN, JACE, GIDEON)
    .seat(1)
    .library(...LIBRARY)
    .battlefield(BEARS, 'Mountain', 'Mountain')
    .at('upkeep', { active: 1 })
    .build();
  g.advanceTo('beginningOfCombat', { attack: false });
  g.passAll();
  return g;
}

describe('creatures can not attack Jaces unless their controller pays {2}', () => {
  test('declining: the Bears may attack the player and another planeswalker, not the Jace', () => {
    const g = board();
    g.expect.pending('confirmOptional', 1);
    g.act(1).decline();
    g.advanceTo('declareAttackers', { attack: false });
    g.expect.canAttack(BEARS);
    g.act(1).declareAttackers([{ attacker: BEARS, target: GIDEON }]);
    g.expect.combat({ attackers: [BEARS], targets: [{ attacker: BEARS, target: GIDEON }] });
  });

  test('declining: attacking the Jace is refused', () => {
    const g = board();
    g.act(1).decline();
    g.advanceTo('declareAttackers', { attack: false });
    g.expect.illegal(1, { declareAttackers: [{ attacker: BEARS, target: JACE }] });
  });

  test('paying: the Jace may be attacked', () => {
    const g = board();
    g.act(1).accept();
    g.act(1).payAuto();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(1).declareAttackers([{ attacker: BEARS, target: JACE }]);
    g.expect.combat({ attackers: [BEARS], targets: [{ attacker: BEARS, target: JACE }] });
    g.expect.invariants();
  });
});
