// Issue 89 (Silverquill Influence), "Whenever one or more creatures that are enchanted by an Aura you control attack, draw a card." (D-651; Killian, Decisive Mentor).
// Pins: CR 603.2c (the ability triggers once for the declaration however many creatures match), CR 508.1 (attackers are declared together, whoever declares them),
// CR 303.4e (an Aura's controller is separate from the enchanted creature's: only an Aura I control counts).
// Cards: the SYNTHETIC Mentor and Aura of this file, the real Grizzly Bears, Healer's Hawk and Llanowar Elves.
import { describe, expect, test } from 'vitest';
import { scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const MENTOR = 'SYNTHETIC Aura Mentor'; // Whenever one or more creatures that are enchanted by an Aura you control attack, draw a card.
const AURA = 'SYNTHETIC Plain Aura';
const BEARS = 'Grizzly Bears';
const HAWK = "Healer's Hawk";
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

const mentor = singleFaceCard({
  name: MENTOR,
  manaCost: ['2', 'W'],
  types: ['creature'],
  subtypes: ['Cleric'],
  colors: ['W'],
  colorIdentity: ['W'],
  power: 2,
  toughness: 4,
  oracleText:
    'Whenever one or more creatures that are enchanted by an Aura you control attack, draw a card.',
  abilities: [
    {
      kind: 'triggered',
      trigger: {
        kind: 'attackBatch',
        who: 'any',
        atLeast: 1,
        what: { types: ['creature'], enchantedByYou: true },
      },
      effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
    },
  ],
});

const aura = singleFaceCard({
  name: AURA,
  manaCost: ['1', 'W'],
  types: ['enchantment'],
  subtypes: ['Aura'],
  colors: ['W'],
  colorIdentity: ['W'],
  oracleText: 'Enchant creature',
  abilities: [{ kind: 'keyword', keyword: { kind: 'enchant', filter: { types: ['creature'] } } }],
});

/** Seat 0 has the Mentor and its Aura on `mine`; seat 1 has Bears and Hawk, with their own Aura on `theirs`. It is seat 1's turn. */
function theirAttack(opts: { mine: string | null; theirs: string | null; attackers: string[] }) {
  const b = scenario()
    .seat(0)
    .define(mentor)
    .define(aura)
    .library(...LIBRARY)
    .battlefield(MENTOR)
    .seat(1)
    .library(...LIBRARY)
    .battlefield(BEARS, HAWK);
  const withMine = opts.mine === null ? b : b.seat(0).battlefield(AURA, { attachedTo: opts.mine });
  const withTheirs =
    opts.theirs === null
      ? withMine
      : withMine.seat(1).battlefield(AURA, { attachedTo: opts.theirs });
  const g = withTheirs.at('precombatMain', { active: 1 }).build();
  g.advanceTo('declareAttackers', { attack: false });
  g.act(1).attack(opts.attackers);
  return g;
}

describe('"whenever one or more creatures that are enchanted by an Aura you control attack"', () => {
  test('an enchanted creature of an opponent attacks: I draw a card', () => {
    const g = theirAttack({ mine: BEARS, theirs: null, attackers: [BEARS] });
    g.expect.stack([`${MENTOR} (ability)`]);
    g.passAll();
    g.expect.handSize(0, 1);
  });

  test('two enchanted creatures attack: it triggers once (CR 603.2c)', () => {
    const g = theirAttack({ mine: BEARS, theirs: HAWK, attackers: [BEARS, HAWK] });
    expect(g.state.stack).toHaveLength(1);
  });

  test('a creature enchanted only by an Aura its own controller controls does not count (CR 303.4e)', () => {
    const g = theirAttack({ mine: null, theirs: BEARS, attackers: [BEARS] });
    g.expect.stack([]);
  });

  test('an unenchanted creature attacks: nothing', () => {
    const g = theirAttack({ mine: BEARS, theirs: null, attackers: [HAWK] });
    g.expect.stack([]);
  });
});
