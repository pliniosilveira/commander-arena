// The five most requested unsupported cards of the "deck support" issues (Explore, Krosan Verge, Unclaimed Territory, Return to Dust, Opal Palace), run as written. Each group imports
// SYNTHETIC cards through the grammar (never through a fixture), defines them in an engine scenario and plays them through applyAction. Every card name starts with "SYNTHETIC"; the
// wording of each text is that of the real card, taken from the card data of the issue's comment. No real card's text is claimed beyond that.
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
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

const handSize = (g: ScenarioGame, seat: 0 | 1 = 0) => g.view(seat).seats[seat]?.handCount;

// ---- Explore: "You may play an additional land this turn. Draw a card." (CR 305.2).

const EXPLORE = parsed(
  'SYNTHETIC Parsed Explore',
  'Sorcery',
  'You may play an additional land this turn.\nDraw a card.',
  { manaCost: '{1}{G}', colors: ['G'] },
);

describe('"You may play an additional land this turn." (CR 305.2)', () => {
  test('the card draws and the controller plays two lands this turn, not three', () => {
    const g = main((b) =>
      b
        .define(EXPLORE)
        .hand(EXPLORE.name)
        .hand('Forest', { count: 3 })
        .battlefield('Forest', { count: 2 }),
    );
    g.act(0).cast(EXPLORE.name, { pay: true });
    g.passAll();
    expect(g.state.turn.extraLandDrops).toBe(1);
    g.act(0).playLand('Forest[0]');
    g.act(0).playLand('Forest[0]');
    g.expect.illegal(0, { playLand: 'Forest[0]' });
    // one card drawn from the library: 3 Forests − 2 played + 1 drawn
    expect(handSize(g)).toBe(2);
    g.expect.invariants();
  });
});

// ---- Krosan Verge: "Search your library for a Forest card and a Plains card, put them onto the battlefield tapped, then shuffle." (CR 701.23, 701.24).

const VERGE = parsed(
  'SYNTHETIC Parsed Verge',
  'Land',
  'This land enters tapped.\n{T}: Add {C}.\n{2}, {T}, Sacrifice this land: Search your library for a Forest card and a Plains card, put them onto the battlefield tapped, then shuffle.',
);

describe('a search for a card of each of two kinds (CR 701.23)', () => {
  const run = (library: readonly string[]) =>
    scenario()
      .seat(0)
      .life(20)
      .define(VERGE)
      .battlefield(VERGE.name)
      .battlefield('Forest', { count: 2 })
      .library(...library)
      .seat(1)
      .life(20)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();

  test('both lands arrive tapped, the land is sacrificed and the library is shuffled', () => {
    const g = run(['Island', 'Forest', 'Plains', 'Swamp']);
    g.act(0).activate(VERGE.name);
    g.act(0).payAuto();
    g.passAll();
    g.act(0).chooseCards('Forest');
    g.act(0).chooseCards({ name: 'Plains', seat: 0, zone: 'library' });
    g.expect.zone('Plains', 'library', { seat: 0, count: 0 });
    g.expect.zone('Forest', 'battlefield', { seat: 0, count: 3 });
    g.expect.zone('Plains', 'battlefield', { seat: 0, count: 1 });
    g.expect.zone(VERGE.name, 'graveyard', { seat: 0 });
    g.expect.tapped({ name: 'Plains', seat: 0, zone: 'battlefield' }, true);
    g.expect.invariants();
  });

  test('with no Plains in the library it finds the Forest only (CR 701.23b)', () => {
    const g = run(['Island', 'Forest', 'Swamp']);
    g.act(0).activate(VERGE.name);
    g.act(0).payAuto();
    g.passAll();
    g.act(0).chooseCards('Forest');
    g.expect.zone('Plains', 'battlefield', { seat: 0, count: 0 });
    g.expect.zone('Forest', 'battlefield', { seat: 0, count: 3 });
    g.expect.invariants();
  });
});

// ---- Unclaimed Territory: "As this land enters, choose a creature type." and mana only for a creature spell of that type (CR 106.6, 607.2d, 614.12).

const TERRITORY = parsed(
  'SYNTHETIC Parsed Territory',
  'Land',
  'As this land enters, choose a creature type.\n{T}: Add {C}.\n{T}: Add one mana of any color. Spend this mana only to cast a creature spell of the chosen type.',
);
const ELF = parsed('SYNTHETIC Parsed Elf', 'Creature — Elf', '', {
  manaCost: '{W}',
  colors: ['W'],
  power: '1',
  toughness: '1',
});
const GOBLIN = parsed('SYNTHETIC Parsed Goblin', 'Creature — Goblin', '', {
  manaCost: '{W}',
  colors: ['W'],
  power: '1',
  toughness: '1',
});
const CHARM = parsed('SYNTHETIC Parsed Charm', 'Sorcery', 'Draw a card.', { manaCost: '{1}' });
const OMEN = parsed('SYNTHETIC Parsed Omen', 'Sorcery', 'Draw a card.', {
  manaCost: '{W}',
  colors: ['W'],
});

describe('mana spent only on a creature spell of the chosen type (CR 106.6)', () => {
  const start = (type: string) => {
    const g = main((b) =>
      b
        .define(TERRITORY)
        .define(ELF)
        .define(GOBLIN)
        .define(OMEN)
        .define(CHARM)
        .hand(TERRITORY.name, ELF.name, GOBLIN.name, OMEN.name, CHARM.name),
    );
    g.act(0).playLand(TERRITORY.name);
    g.act(0).chooseOption(type);
    return g;
  };

  test('a creature spell of the chosen type can be paid with it, even in a color the land does not make', () => {
    const g = start('Goblin');
    g.act(0).cast(GOBLIN.name, { pay: true });
    g.passAll();
    g.expect.zone(GOBLIN.name, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('a creature spell of another type cannot (the mana is restricted)', () => {
    const g = start('Goblin');
    g.expect.illegal(0, { cast: OMEN.name });
    g.expect.illegal(0, { cast: ELF.name });
  });

  test('the colorless mana has no restriction: it pays for any spell', () => {
    const g = start('Goblin');
    g.act(0).cast(CHARM.name, { pay: true });
    g.passAll();
    g.expect.zone(CHARM.name, 'graveyard', { seat: 0 });
  });
});

// ---- Return to Dust: a second target only for a spell cast in its controller's main phase (CR 601.2c).

const DUST = parsed(
  'SYNTHETIC Parsed Dust',
  'Instant',
  'Exile target artifact or enchantment. If you cast this spell during your main phase, you may exile up to one other target artifact or enchantment.',
  { manaCost: '{2}{W}{W}', colors: ['W'] },
);

describe('"If you cast this spell during your main phase, you may exile up to one other target ..." (CR 601.2c)', () => {
  const start = (step: 'precombatMain' | 'beginningOfCombat') =>
    scenario()
      .seat(0)
      .define(DUST)
      .hand(DUST.name)
      .battlefield('Plains', { count: 4 })
      .library(...FILLER)
      .seat(1)
      .battlefield('Sol Ring', 'Sol Ring')
      .library(...FILLER)
      .at(step, { active: 0 })
      .build();

  test('in the main phase two permanents are exiled', () => {
    const g = start('precombatMain');
    g.act(0).cast(DUST.name);
    g.act(0).chooseTargets('Sol Ring[0]', 'Sol Ring[1]');
    g.act(0).payAuto();
    g.passAll();
    // "you may exile": the second exile is a choice made as the spell resolves (CR 608.2d).
    expect(g.state.pending?.kind).toBe('confirmOptional');
    g.act(0).accept();
    g.expect.zone('Sol Ring', 'exile', { count: 2 });
    g.expect.invariants();
  });

  test('in another step only the first is chosen, and only it is exiled', () => {
    const g = start('beginningOfCombat');
    g.act(0).cast(DUST.name);
    g.act(0).chooseTargets('Sol Ring[0]');
    g.act(0).payAuto();
    g.passAll();
    g.expect.zone('Sol Ring', 'exile', { count: 1 });
    g.expect.zone('Sol Ring', 'battlefield', { seat: 1, count: 1 });
  });
});

// ---- Opal Palace: mana of the commander's color identity, and counters on the commander it pays for (CR 106.6, 122.6, 903.8).

const PALACE = parsed(
  'SYNTHETIC Parsed Palace',
  'Land',
  "{T}: Add {C}.\n{1}, {T}: Add one mana of any color in your commander's color identity. If you spend this mana to cast your commander, it enters with a number of additional +1/+1 counters on it equal to the number of times it's been cast from the command zone this game.",
);

describe('mana that puts counters on the commander it casts (CR 122.6, 903.8)', () => {
  const start = (casts: number, plains: number) =>
    scenario()
      .seat(0)
      .define(PALACE)
      .commander('Isamaru, Hound of Konda', { casts, label: 'cmd' })
      .battlefield(PALACE.name)
      .battlefield('Plains', { count: plains })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();

  const counters = (g: ScenarioGame) => g.state.objects[g.id('cmd')]?.counters['+1/+1'] ?? 0;

  test('the commander enters with as many counters as it has been cast from the command zone (this cast included)', () => {
    const g = start(1, 3);
    g.act(0).tapForMana('Plains[0]');
    g.act(0).tapForMana(PALACE.name, { color: 'W', ability: 1 });
    g.act(0).cast('cmd');
    g.act(0).payAuto();
    g.passAll();
    g.expect.zone('Isamaru, Hound of Konda', 'battlefield', { seat: 0 });
    expect(counters(g)).toBe(2);
    g.expect.invariants();
  });

  test('cast for the first time it enters with one counter', () => {
    const g = start(0, 2);
    g.act(0).tapForMana('Plains[0]');
    g.act(0).tapForMana(PALACE.name, { color: 'W', ability: 1 });
    g.act(0).cast('cmd');
    g.act(0).payAuto();
    g.passAll();
    expect(counters(g)).toBe(1);
  });

  test('the colorless mana ability puts no counters', () => {
    const g = start(1, 3);
    g.act(0).cast('cmd');
    g.act(0).payAuto();
    g.passAll();
    g.expect.zone('Isamaru, Hound of Konda', 'battlefield', { seat: 0 });
    expect(counters(g)).toBe(0);
  });
});
