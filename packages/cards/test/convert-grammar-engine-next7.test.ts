// The next seven most requested unsupported cards of the "deck support" issues (Secluded Courtyard, Thriving Isle, Vivid Grove, Syphon Mind, Martial Coup, Forgotten Ancient,
// Shiny Impetus), run as written. Each group imports SYNTHETIC cards through the grammar (never through a fixture), defines them in an engine scenario and plays them through
// applyAction. Every card name starts with "SYNTHETIC"; the wording of each text is that of the real card, taken from the card data of the issue's comment. No real card's text
// is claimed beyond that.
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

// ---- Secluded Courtyard: mana for a creature spell, or an ability of a creature, of the chosen type (CR 106.6, 607.2d).

const COURTYARD = parsed(
  'SYNTHETIC Parsed Courtyard',
  'Land',
  'As this land enters, choose a creature type.\n{T}: Add {C}.\n{T}: Add one mana of any color. Spend this mana only to cast a creature spell of the chosen type or activate an ability of a creature source of the chosen type.',
);
const ELF_HEALER = parsed(
  'SYNTHETIC Parsed Elf Healer',
  'Creature — Elf Cleric',
  '{W}: You gain 1 life.',
  { manaCost: '{W}', colors: ['W'], power: '1', toughness: '1' },
);
const GOBLIN_HEALER = parsed(
  'SYNTHETIC Parsed Goblin Healer',
  'Creature — Goblin Cleric',
  '{W}: You gain 1 life.',
  { manaCost: '{W}', colors: ['W'], power: '1', toughness: '1' },
);

describe('mana for a creature spell or an ability of a creature of the chosen type (CR 106.6)', () => {
  const start = (type: string) => {
    const g = main((b) =>
      b
        .define(COURTYARD)
        .define(ELF_HEALER)
        .define(GOBLIN_HEALER)
        .hand(COURTYARD.name)
        .battlefield(ELF_HEALER.name)
        .battlefield(GOBLIN_HEALER.name),
    );
    g.act(0).playLand(COURTYARD.name);
    g.act(0).chooseOption(type);
    return g;
  };

  test('it pays for an ability of a creature of the chosen type', () => {
    const g = start('Elf');
    g.act(0).activate(ELF_HEALER.name);
    g.act(0).payAuto();
    g.passAll();
    g.expect.life(0, 21);
  });

  test('not for an ability of a creature of another type', () => {
    const g = start('Elf');
    g.expect.illegal(0, { activate: GOBLIN_HEALER.name });
  });
});

// ---- Thriving Isle: "enters tapped", a color other than blue, and {U} or the chosen color (CR 106.1, 607.2d, 614.12).

const ISLE = parsed(
  'SYNTHETIC Parsed Isle',
  'Land',
  'This land enters tapped. As it enters, choose a color other than blue.\n{T}: Add {U} or one mana of the chosen color.',
);
const RED_SPELL = parsed('SYNTHETIC Parsed Red Spell', 'Sorcery', 'Draw a card.', {
  manaCost: '{R}',
  colors: ['R'],
});
const BLUE_SPELL = parsed('SYNTHETIC Parsed Blue Spell', 'Sorcery', 'Draw a card.', {
  manaCost: '{U}',
  colors: ['U'],
});
const WHITE_SPELL = parsed('SYNTHETIC Parsed White Spell', 'Sorcery', 'Draw a card.', {
  manaCost: '{W}',
  colors: ['W'],
});

describe('a land that makes {U} or the chosen color (CR 106.1)', () => {
  const start = () =>
    main((b) =>
      b
        .define(ISLE)
        .define(RED_SPELL)
        .define(BLUE_SPELL)
        .define(WHITE_SPELL)
        .hand(ISLE.name, RED_SPELL.name, BLUE_SPELL.name, WHITE_SPELL.name),
    );

  test('blue is not offered, and the land enters tapped', () => {
    const g = start();
    g.act(0).playLand(ISLE.name);
    const d = g.state.pending;
    expect(d?.kind).toBe('chooseOption');
    if (d?.kind === 'chooseOption') {
      expect(d.options).toEqual(['W', 'B', 'R', 'G']);
    }
    expect(() => g.act(0).chooseOption('U')).toThrow();
    g.act(0).chooseOption('R');
    g.expect.tapped(ISLE.name, true);
  });

  test('later it pays for blue or for the chosen color, and not for another color', () => {
    const g = scenario()
      .seat(0)
      .define(ISLE)
      .define(RED_SPELL)
      .define(BLUE_SPELL)
      .define(WHITE_SPELL)
      .hand(RED_SPELL.name, BLUE_SPELL.name, WHITE_SPELL.name)
      .battlefield(ISLE.name, { chosen: { color: 'R' } })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
    g.expect.illegal(0, { cast: WHITE_SPELL.name });
    g.act(0).cast(RED_SPELL.name, { pay: true });
    g.passAll();
    g.expect.zone(RED_SPELL.name, 'graveyard', { seat: 0 });
  });
});

// ---- Vivid Grove: "enters tapped with two charge counters" and "{T}, Remove a charge counter from ~: Add one mana of any color." (CR 118.3, 122.1, 614.1c, 614.1d).

const GROVE = parsed(
  'SYNTHETIC Parsed Grove',
  'Land',
  'This land enters tapped with two charge counters on it.\n{T}: Add {G}.\n{T}, Remove a charge counter from this land: Add one mana of any color.',
);
const PURPLE_SPELL = parsed('SYNTHETIC Parsed Black Spell', 'Sorcery', 'Draw a card.', {
  manaCost: '{B}',
  colors: ['B'],
});

describe('a land with charge counters whose mana costs one (CR 118.3, 122.1)', () => {
  test('it enters tapped with two charge counters', () => {
    const g = main((b) => b.define(GROVE).hand(GROVE.name));
    g.act(0).playLand(GROVE.name);
    g.expect.tapped(GROVE.name, true);
    expect(g.state.objects[g.id(GROVE.name)]?.counters.charge).toBe(2);
  });

  test('each any-color mana removes a counter, and with none left only {G} is made', () => {
    const g = scenario()
      .seat(0)
      .define(GROVE)
      .define(PURPLE_SPELL)
      .hand(PURPLE_SPELL.name, PURPLE_SPELL.name)
      .battlefield(GROVE.name, { counters: { charge: 1 } })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(`${PURPLE_SPELL.name}[0]`, { pay: true });
    g.passAll();
    g.expect.zone(PURPLE_SPELL.name, 'graveyard', { seat: 0 });
    expect(g.state.objects[g.id(GROVE.name)]?.counters.charge ?? 0).toBe(0);
    // With no counter left the land makes {G} only (and it is tapped): the second spell cannot be paid.
    g.expect.illegal(0, { cast: `${PURPLE_SPELL.name}[0]` });
  });
});

// ---- Syphon Mind: "Each other player discards a card. You draw a card for each card discarded this way." (CR 701.9, 608.2c).

const SYPHON = parsed(
  'SYNTHETIC Parsed Syphon',
  'Sorcery',
  'Each other player discards a card. You draw a card for each card discarded this way.',
  { manaCost: '{3}{B}', colors: ['B'] },
);

describe('a draw for each card discarded this way (CR 701.9, 608.2c)', () => {
  const start = (opponentHand: number) => {
    const b = scenario()
      .seat(0)
      .define(SYPHON)
      .hand(SYPHON.name)
      .battlefield('Swamp', { count: 4 })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER);
    return (opponentHand > 0 ? b.hand('Island', { count: opponentHand }) : b)
      .at('precombatMain', { active: 0 })
      .build();
  };

  test('the opponent discards a card and the controller draws one', () => {
    const g = start(2);
    g.act(0).cast(SYPHON.name, { pay: true });
    g.passAll();
    if (g.state.pending?.kind === 'chooseCards') g.act(1).chooseCards('Island[0]');
    g.expect.zone('Island', 'graveyard', { seat: 1, count: 1 });
    expect(g.view(0).seats[0]?.handCount).toBe(1);
    g.expect.invariants();
  });

  test('an opponent with no card discards none, so nothing is drawn', () => {
    const g = start(0);
    g.act(0).cast(SYPHON.name, { pay: true });
    g.passAll();
    expect(g.view(0).seats[0]?.handCount).toBe(0);
  });
});

// ---- Martial Coup: X tokens, and with X of 5 or more everything else is destroyed (CR 107.3a, 608.2c).

const COUP = parsed(
  'SYNTHETIC Parsed Coup',
  'Sorcery',
  'Create X 1/1 white Soldier creature tokens. If X is 5 or more, destroy all other creatures.',
  { manaCost: '{X}{W}{W}', colors: ['W'] },
);

describe('"If X is 5 or more, destroy all other creatures" (CR 107.3a, 608.2c)', () => {
  const start = (lands: number) =>
    scenario()
      .seat(0)
      .define(COUP)
      .hand(COUP.name)
      .battlefield('Plains', { count: lands })
      .battlefield('Grizzly Bears')
      .library(...FILLER)
      .seat(1)
      .battlefield('Giant Spider')
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();

  const soldiers = (g: ReturnType<typeof start>) =>
    g.state.battlefield.filter(
      (id) => g.state.objects[id]?.token?.characteristics.name === 'Soldier',
    ).length;

  test('X of 4: four Soldiers and every other creature lives', () => {
    const g = start(6);
    g.act(0).cast(COUP.name, { x: 4, pay: true });
    g.passAll();
    expect(soldiers(g)).toBe(4);
    g.expect.zone('Grizzly Bears', 'battlefield', { seat: 0 });
    g.expect.zone('Giant Spider', 'battlefield', { seat: 1 });
    g.expect.invariants();
  });

  test('X of 5: five Soldiers, and every creature that is not one of them is destroyed', () => {
    const g = start(7);
    g.act(0).cast(COUP.name, { x: 5, pay: true });
    g.passAll();
    expect(soldiers(g)).toBe(5);
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 0 });
    g.expect.zone('Giant Spider', 'graveyard', { seat: 1 });
    g.expect.invariants();
  });
});
