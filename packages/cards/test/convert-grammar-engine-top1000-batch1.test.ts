// Batch 1 of the unsupported cards among the 1,000 most popular Commander cards (issue 279), run as written. Each group imports SYNTHETIC cards through the grammar (never through a
// fixture), defines them in an engine scenario and plays them through applyAction. Every card name starts with "SYNTHETIC"; the wording of each text is that of the real card, taken
// from the card data of the issue's comment. No real card's text is claimed beyond that.
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;

type Builder = ReturnType<typeof scenario>;

function main(mine: (b: Builder) => Builder, theirs: (b: Builder) => Builder = (b) => b) {
  const a = mine(
    scenario()
      .seat(0)
      .life(20)
      .library(...FILLER),
  );
  return theirs(
    a
      .seat(1)
      .life(20)
      .library(...FILLER),
  )
    .at('precombatMain', { active: 0 })
    .build();
}

// ---- Secluded Courtyard: mana only for a creature spell of the chosen type or an ability of a creature source of that type (CR 106.6, 607.2d, 614.12).

const COURTYARD = parsed(
  'SYNTHETIC Parsed Courtyard',
  'Land',
  'As this land enters, choose a creature type.\n{T}: Add {C}.\n{T}: Add one mana of any color. Spend this mana only to cast a creature spell of the chosen type or activate an ability of a creature source of the chosen type.',
);
const GOBLIN_PUMPER = parsed(
  'SYNTHETIC Parsed Goblin Pumper',
  'Creature — Goblin',
  '{R}: ~ gets +1/+0 until end of turn.',
  { manaCost: '{1}', power: '1', toughness: '1' },
);
const ELF_PUMPER = parsed(
  'SYNTHETIC Parsed Elf Pumper',
  'Creature — Elf',
  '{R}: ~ gets +1/+0 until end of turn.',
  { manaCost: '{1}', power: '1', toughness: '1' },
);
const GOBLIN_SPELL = parsed('SYNTHETIC Parsed Goblin Spell', 'Creature — Goblin', '', {
  manaCost: '{R}',
  colors: ['R'],
  power: '1',
  toughness: '1',
});
const ELF_SPELL = parsed('SYNTHETIC Parsed Elf Spell', 'Creature — Elf', '', {
  manaCost: '{R}',
  colors: ['R'],
  power: '1',
  toughness: '1',
});

describe('mana spent only on a creature spell of the chosen type or an ability of a creature source of it (CR 106.6)', () => {
  const start = (type: string) => {
    const g = main((b) =>
      b
        .define(COURTYARD)
        .define(GOBLIN_PUMPER)
        .define(ELF_PUMPER)
        .define(GOBLIN_SPELL)
        .define(ELF_SPELL)
        .hand(COURTYARD.name, GOBLIN_SPELL.name, ELF_SPELL.name)
        .battlefield(GOBLIN_PUMPER.name, ELF_PUMPER.name),
    );
    g.act(0).playLand(COURTYARD.name);
    g.act(0).chooseOption(type);
    return g;
  };

  test('a creature spell of the chosen type is paid with it', () => {
    const g = start('Goblin');
    g.expect.legal(0, { cast: GOBLIN_SPELL.name });
    g.act(0).cast(GOBLIN_SPELL.name, { pay: true });
    g.passAll();
    g.expect.zone(GOBLIN_SPELL.name, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('a creature spell of another type cannot be', () => {
    const g = start('Goblin');
    g.expect.illegal(0, { cast: ELF_SPELL.name });
  });

  test('an ability of a creature of the chosen type is paid with it', () => {
    const g = start('Goblin');
    g.expect.legal(0, { activate: GOBLIN_PUMPER.name });
    g.act(0).activate(GOBLIN_PUMPER.name, { pay: true });
    g.passAll();
    g.expect.pt(GOBLIN_PUMPER.name, 2, 1);
    g.expect.invariants();
  });

  test('an ability of a creature of another type cannot be', () => {
    const g = start('Goblin');
    g.expect.illegal(0, { activate: ELF_PUMPER.name });
  });
});

// ---- Oran-Rief, the Vastwood: "Put a +1/+1 counter on each green creature that entered this turn." (CR 400.7, 122.1).

const ORAN = parsed(
  'SYNTHETIC Parsed Oran',
  'Land',
  'This land enters tapped.\n{T}: Add {G}.\n{T}: Put a +1/+1 counter on each green creature that entered this turn.',
);
const GREEN_BEAR = parsed('SYNTHETIC Parsed Green Bear', 'Creature — Bear', '', {
  manaCost: '{G}',
  colors: ['G'],
  power: '2',
  toughness: '2',
});
const RED_BEAR = parsed('SYNTHETIC Parsed Red Bear', 'Creature — Bear', '', {
  manaCost: '{R}',
  colors: ['R'],
  power: '2',
  toughness: '2',
});
const OLD_GREEN = parsed('SYNTHETIC Parsed Old Green', 'Creature — Bear', '', {
  manaCost: '{G}',
  colors: ['G'],
  power: '2',
  toughness: '2',
});

describe('"Put a +1/+1 counter on each green creature that entered this turn." (CR 400.7)', () => {
  const start = () =>
    main((b) =>
      b
        .define(ORAN)
        .define(GREEN_BEAR)
        .define(RED_BEAR)
        .define(OLD_GREEN)
        .hand(GREEN_BEAR.name, RED_BEAR.name)
        .battlefield(ORAN.name, { tapped: false })
        .battlefield(OLD_GREEN.name, 'Forest', 'Mountain'),
    );

  test('only the green creatures that entered this turn get a counter', () => {
    const g = start();
    // The two spells are paid from the basic lands: the land with the ability must stay untapped.
    g.act(0).tapForMana('Forest');
    g.act(0).cast(GREEN_BEAR.name, { pay: true });
    g.passAll();
    g.act(0).tapForMana('Mountain');
    g.act(0).cast(RED_BEAR.name, { pay: true });
    g.passAll();
    g.act(0).activate(ORAN.name);
    g.passAll();
    g.expect.pt(GREEN_BEAR.name, 3, 3);
    g.expect.pt(RED_BEAR.name, 2, 2);
    g.expect.pt(OLD_GREEN.name, 2, 2);
    g.expect.invariants();
  });
});

// ---- Windbrisk Heights: "{W}, {T}: You may play the exiled card without paying its mana cost if you attacked with three or more creatures this turn." (CR 508.1, 702.75a).

const WINDBRISK = parsed(
  'SYNTHETIC Parsed Windbrisk',
  'Land',
  'Hideaway 4 (When this land enters, look at the top four cards of your library, exile one face down, then put the rest on the bottom in a random order.)\nThis land enters tapped.\n{T}: Add {W}.\n{W}, {T}: You may play the exiled card without paying its mana cost if you attacked with three or more creatures this turn.',
);

describe('"... if you attacked with three or more creatures this turn" (CR 508.1)', () => {
  // The land enters tapped: it is played, then used in the controller's next turn, after a combat in which some creatures attack.
  const start = () => {
    const g = scenario()
      .seat(0)
      .hand(WINDBRISK.name)
      .battlefield('Plains', 'Grizzly Bears', 'Grizzly Bears', 'Grizzly Bears')
      .library('Giant Spider', 'Serra Angel', 'Swamp', 'Plains', 'Island')
      .seat(1)
      .library('Island', 'Island', 'Island', 'Island')
      .at('precombatMain', { active: 0 })
      .define(WINDBRISK)
      .build();
    g.act(0).playLand(WINDBRISK.name);
    g.passAll();
    g.act(0).chooseCards('Giant Spider');
    g.advanceTo('precombatMain', { turn: 'next' }).advanceTo('precombatMain', { turn: 'next' });
    return g;
  };

  test('with three attackers the hidden card is played', () => {
    const g = start();
    g.advanceTo('declareAttackers');
    g.act(0).attack(['Grizzly Bears[0]', 'Grizzly Bears[1]', 'Grizzly Bears[2]']);
    g.advanceTo('postcombatMain');
    g.act(0).activate(WINDBRISK.name, { pay: true });
    g.passAll();
    g.act(0).chooseCards('Giant Spider');
    g.passAll();
    g.expect.zone('Giant Spider', 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('with two attackers the card stays hidden', () => {
    const g = start();
    g.advanceTo('declareAttackers');
    g.act(0).attack(['Grizzly Bears[0]', 'Grizzly Bears[1]']);
    g.advanceTo('postcombatMain');
    g.act(0).activate(WINDBRISK.name, { pay: true });
    g.passAll();
    // The condition is false: the effect does nothing, so no card is offered to be played.
    expect(g.state.pending?.kind).toBe('priority');
    g.expect.zone('Giant Spider', 'exile', { seat: 0 });
    g.expect.invariants();
  });

  test('with no attack the card stays hidden', () => {
    const g = start();
    g.act(0).activate(WINDBRISK.name, { pay: true });
    g.passAll();
    expect(g.state.pending?.kind).toBe('priority');
    g.expect.zone('Giant Spider', 'exile', { seat: 0 });
  });
});
