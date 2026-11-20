// Issue 144: the engine runs what the grammar reads for Arena of Glory ("{R}, {T}, Exert ~: Add {R}{R}. If any of that mana is spent on a creature spell, it gains haste until
// end of turn.") and Throne of Eldraine (mana of the chosen color, restricted to monocolored spells of that color; an ability paid with the chosen color only). The texts are the
// real wording under SYNTHETIC names.
import { scenario } from '@commander-arena/engine/testing';
import { describe, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;

const ARENA = parsed(
  'SYNTHETIC Arena',
  'Land',
  '~ enters tapped unless you control a Mountain.\n{T}: Add {R}.\n{R}, {T}, Exert ~: Add {R}{R}. If any of that mana is spent on a creature spell, it gains haste until end of turn.',
);
const BEAR = parsed('SYNTHETIC Red Bear', 'Creature — Bear', '', {
  manaCost: '{R}{R}',
  power: '2',
  toughness: '2',
  colors: ['R'],
});
const SPARK = parsed('SYNTHETIC Red Spark', 'Instant', 'You gain 2 life.', {
  manaCost: '{R}{R}',
  colors: ['R'],
});

describe('"{R}, {T}, Exert ~: Add {R}{R}. If any of that mana is spent on a creature spell, it gains haste until end of turn." (CR 701.43a, 106.6, 702.10)', () => {
  const ready = () =>
    scenario()
      .define(ARENA)
      .define(BEAR)
      .define(SPARK)
      .seat(0)
      .life(20)
      .battlefield(ARENA.name, 'Mountain')
      .hand(BEAR.name, SPARK.name)
      .library(...FILLER)
      .seat(1)
      .life(20)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();

  test('a creature cast with that mana has haste until end of turn', () => {
    const g = ready();
    g.act(0)
      .cast(BEAR.name)
      .payManual(['Mountain', { source: ARENA.name, ability: 2 }]);
    g.passAll();
    g.advanceTo('declareAttackers', { attack: false });
    g.expect.canAttack(BEAR.name);
    g.expect.tapped(ARENA.name, true);
    g.expect.invariants();
  });

  test('a noncreature spell cast with that mana gives nothing haste', () => {
    const g = ready();
    g.act(0)
      .cast(SPARK.name)
      .payManual(['Mountain', { source: ARENA.name, ability: 2 }]);
    g.passAll();
    g.expect.life(0, 22);
    g.expect.invariants();
  });

  test("the land is exerted: it does not untap during its controller's next untap step, and untaps in the one after", () => {
    const g = ready();
    g.act(0)
      .cast(BEAR.name)
      .payManual(['Mountain', { source: ARENA.name, ability: 2 }]);
    g.passAll();
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.tapped('Mountain', false);
    g.expect.tapped(ARENA.name, true);
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.tapped(ARENA.name, false);
  });

  test('it is not offered while the land is tapped', () => {
    const g = scenario()
      .define(ARENA)
      .seat(0)
      .battlefield(ARENA.name, { tapped: true })
      .battlefield('Mountain')
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
    g.expect.illegal(0, { tap: ARENA.name });
  });
});

const THRONE = parsed(
  'SYNTHETIC Throne',
  'Legendary Artifact',
  'As ~ enters, choose a color.\n{T}: Add four mana of the chosen color. Spend this mana only to cast monocolored spells of that color.\n{3}, {T}: Draw two cards. Spend only mana of the chosen color to activate this ability.',
  { manaCost: '{3}' },
);
const BLUE_FOUR = parsed('SYNTHETIC Blue Four', 'Creature — Bear', '', {
  manaCost: '{4}',
  power: '1',
  toughness: '1',
  colors: ['U'],
});
const RED_FOUR = parsed('SYNTHETIC Red Four', 'Creature — Bear', '', {
  manaCost: '{4}',
  power: '1',
  toughness: '1',
  colors: ['R'],
});
const BLUE_RED_FOUR = parsed('SYNTHETIC Blue Red Four', 'Creature — Bear', '', {
  manaCost: '{4}',
  power: '1',
  toughness: '1',
  colors: ['U', 'R'],
});
const COLORLESS_FOUR = parsed('SYNTHETIC Colorless Four', 'Artifact', '', { manaCost: '{4}' });

describe('Throne of Eldraine: "Add four mana of the chosen color" for monocolored spells of that color (CR 106.6, 105.2a, 607.2d)', () => {
  const ready = () =>
    scenario()
      .define(THRONE)
      .define(BLUE_FOUR)
      .define(RED_FOUR)
      .define(BLUE_RED_FOUR)
      .define(COLORLESS_FOUR)
      .seat(0)
      .life(20)
      .battlefield(THRONE.name, { chosen: { color: 'U' } })
      .hand(BLUE_FOUR.name, RED_FOUR.name, BLUE_RED_FOUR.name, COLORLESS_FOUR.name)
      .library(...FILLER)
      .seat(1)
      .life(20)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();

  test('cast from the hand it asks for the color as it enters, and then makes mana of that color', () => {
    const g = scenario()
      .define(THRONE)
      .seat(0)
      .hand(THRONE.name)
      .battlefield('Plains', 'Plains', 'Plains')
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(THRONE.name, { pay: true });
    g.passAll();
    g.act(0).chooseOption('G');
    g.expect.chosen(THRONE.name, { color: 'G' });
    g.act(0).tapForMana(THRONE.name);
    g.expect.pool(0, { G: 4 });
  });

  test('tapping it makes four mana of the chosen color', () => {
    const g = ready();
    g.act(0).tapForMana(THRONE.name);
    g.expect.pool(0, { U: 4 });
  });

  test('the mana pays for a spell that is exactly the chosen color', () => {
    const g = ready();
    g.act(0).cast(BLUE_FOUR.name, { pay: true });
    g.passAll();
    g.expect.zone(BLUE_FOUR.name, 'battlefield', { seat: 0 });
    g.expect.tapped(THRONE.name, true);
  });

  test('it cannot pay for a spell of another color, of two colors, or of none', () => {
    const g = ready();
    g.expect.illegal(0, { cast: RED_FOUR.name });
    g.expect.illegal(0, { cast: BLUE_RED_FOUR.name });
    g.expect.illegal(0, { cast: COLORLESS_FOUR.name });
  });

  test('the mana waits in the pool and still pays only for such a spell', () => {
    const g = ready();
    g.act(0).tapForMana(THRONE.name);
    g.expect.illegal(0, { cast: RED_FOUR.name });
    g.expect.legal(0, { cast: BLUE_FOUR.name });
  });

  test('the color is the one the permanent chose as it entered: another choice, another color', () => {
    const g = scenario()
      .define(THRONE)
      .define(BLUE_FOUR)
      .define(RED_FOUR)
      .seat(0)
      .battlefield(THRONE.name, { chosen: { color: 'R' } })
      .hand(BLUE_FOUR.name, RED_FOUR.name)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
    g.expect.legal(0, { cast: RED_FOUR.name });
    g.expect.illegal(0, { cast: BLUE_FOUR.name });
  });
});

describe('Throne of Eldraine: "{3}, {T}: Draw two cards. Spend only mana of the chosen color to activate this ability." (CR 602.2b)', () => {
  const ready = (lands: readonly string[]) =>
    scenario()
      .define(THRONE)
      .seat(0)
      .life(20)
      .battlefield(THRONE.name, { chosen: { color: 'U' } })
      .battlefield(...lands)
      .library(...FILLER)
      .seat(1)
      .life(20)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();

  test('three mana of the chosen color pay for it, and two cards are drawn', () => {
    const g = ready(['Island', 'Island', 'Island']);
    g.act(0).activate(THRONE.name, { ability: 2, pay: true });
    g.passAll();
    g.expect.handSize(0, 2);
    g.expect.tapped(THRONE.name, true);
    g.expect.invariants();
  });

  test('mana of another color does not', () => {
    const g = ready(['Mountain', 'Mountain', 'Mountain']);
    g.expect.illegal(0, { activate: THRONE.name, ability: 2 });
  });

  test('a mix of the chosen color and another is not enough', () => {
    const g = ready(['Island', 'Island', 'Mountain']);
    g.expect.illegal(0, { activate: THRONE.name, ability: 2 });
  });

  test('extra mana of another color is not spent on it: the chosen color pays the whole cost', () => {
    const g = ready(['Island', 'Island', 'Island', 'Mountain', 'Mountain']);
    g.act(0).activate(THRONE.name, { ability: 2, pay: true });
    g.passAll();
    g.expect.handSize(0, 2);
    g.expect.tapped('Mountain[0]', false);
    g.expect.tapped('Mountain[1]', false);
  });
});
