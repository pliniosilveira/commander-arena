// Most Wanted deck, group 1 ("outlaw", CR 700.12: an object that has the Assassin, Mercenary, Pirate, Rogue and/or Warlock creature types; CR 700.12a: "outlaws you control" are
// permanents). The lines of Back in Town, Charred Graverobber, Shoot the Sheriff, Olivia, Opulent Outlaw, Dead Before Sunrise and Vihaan, Goldwaker ("Other outlaws you control have
// vigilance and haste.") are read through the grammar only and run through applyAction. The cards are SYNTHETIC: the Oracle lines are the real ones, the card faces (name, cost,
// type line, power and toughness) are made up, because the golden corpus does not hold these cards yet.
import { type CardDefinition, isOutlaw, OUTLAW_CREATURE_TYPES } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed, parseOnly, spellCard } from './convert-grammar-helpers';
import { syntheticCard } from './convert-helpers';

const creature = (name: string, types: string, power = '2', toughness = '2') =>
  parsed(name, `Creature — ${types}`, '', { power, toughness, manaCost: '{1}{B}' });

const ROGUE = creature('SYNTHETIC Rogue', 'Human Rogue');
const PIRATE = creature('SYNTHETIC Pirate', 'Human Pirate');
const WARLOCK = creature('SYNTHETIC Warlock', 'Human Warlock');
const MERCENARY = creature('SYNTHETIC Mercenary', 'Human Mercenary');
const ASSASSIN = creature('SYNTHETIC Assassin', 'Human Assassin');
const ELF = creature('SYNTHETIC Elf', 'Elf Druid');
const ELF_ROGUE = creature('SYNTHETIC Elf Rogue', 'Elf Rogue');
const OUTLAWS = [ROGUE, PIRATE, WARLOCK, MERCENARY, ASSASSIN];
const ALL = [...OUTLAWS, ELF, ELF_ROGUE];
const defineAll = (b: ReturnType<typeof scenario>, extra: readonly CardDefinition[] = []) =>
  [...ALL, ...extra].reduce((acc, card) => acc.define(card), b);
const LIBRARY = Array.from({ length: 10 }, () => 'Plains');

const BACK = parsed(
  'SYNTHETIC Back',
  'Sorcery',
  'Return X target outlaw creature cards from your graveyard to the battlefield.',
  { manaCost: '{X}{W}{W}', colors: ['W'] },
);
const GRAVEROBBER = parsed(
  'SYNTHETIC Graverobber',
  'Creature — Human Rogue',
  'When ~ enters, return target outlaw card from your graveyard to your hand.',
  { manaCost: '{1}{B}', power: '2', toughness: '2', colors: ['B'] },
);
const SHERIFF = parsed('SYNTHETIC Sheriff', 'Instant', 'Destroy target non-outlaw creature.', {
  manaCost: '{1}{B}',
  colors: ['B'],
});
const OLIVIA = parsed(
  'SYNTHETIC Olivia',
  'Legendary Creature — Vampire Rogue',
  'Whenever one or more outlaws you control deal combat damage to a player, create a Treasure token.',
  { manaCost: '{2}{B}', power: '3', toughness: '3', colors: ['B'] },
);
const SUNRISE = parsed(
  'SYNTHETIC Sunrise',
  'Instant',
  'Until end of turn, outlaw creatures you control get +1/+0 and gain "{T}: This creature deals damage equal to its power to target creature."',
  { manaCost: '{1}{R}', colors: ['R'] },
);
const VIHAAN = parsed(
  'SYNTHETIC Vihaan',
  'Legendary Creature — Human Rogue',
  'Other outlaws you control have vigilance and haste.',
  { manaCost: '{2}{R}', power: '3', toughness: '3', colors: ['R'] },
);

describe('the predicate (CR 700.12)', () => {
  test('an object is an outlaw with at least one of the five creature types, and outlaw is no creature type', () => {
    expect(OUTLAW_CREATURE_TYPES).toEqual(['Assassin', 'Mercenary', 'Pirate', 'Rogue', 'Warlock']);
    for (const type of OUTLAW_CREATURE_TYPES) expect(isOutlaw([type])).toBe(true);
    expect(isOutlaw(['Elf', 'Rogue'])).toBe(true);
    expect(isOutlaw(['Elf', 'Druid'])).toBe(false);
    expect(isOutlaw([])).toBe(false);
    expect(isOutlaw(['Outlaw'])).toBe(false);
  });
});

describe('the grammar', () => {
  // `parsed` above requires every card to import as supported with nothing unparsed.
  test('"outlaw" is a flag of the filter, never a subtype (CR 700.12)', () => {
    const back = BACK.faces[0]?.spell?.targets?.[0];
    expect(back).toMatchObject({
      countX: true,
      what: { filter: { zone: 'graveyard', types: ['creature'], outlaw: true, controller: 'you' } },
    });
    expect(JSON.stringify(back)).not.toContain('subtypes');
    expect(SHERIFF.faces[0]?.spell?.targets?.[0]).toMatchObject({
      what: { filter: { zone: 'battlefield', types: ['creature'], outlaw: false } },
    });
    expect(GRAVEROBBER.faces[0]?.abilities[0]).toMatchObject({
      kind: 'triggered',
      targets: [{ what: { filter: { zone: 'graveyard', outlaw: true, controller: 'you' } } }],
      effect: { kind: 'moveToZone', to: 'hand' },
    });
    expect(OLIVIA.faces[0]?.abilities[0]).toMatchObject({
      kind: 'triggered',
      trigger: {
        kind: 'combatDamageBatch',
        what: { controller: 'you', outlaw: true },
        to: 'player',
      },
    });
  });

  test('the wording is read for outlaw cards, creatures and groups of permanents', () => {
    for (const [type, text] of [
      ['Sorcery', 'Return target outlaw creature card from your graveyard to your hand.'],
      ['Sorcery', 'Return target non-outlaw creature card from your graveyard to your hand.'],
      ['Instant', 'Destroy target outlaw creature.'],
      ['Enchantment', 'Outlaw creatures you control get +1/+1.'],
      ['Enchantment', 'Other outlaws you control get +1/+1.'],
      ['Enchantment', 'Other outlaw creatures you control have vigilance.'],
    ] as const) {
      const imported = parseOnly(
        syntheticCard({
          name: 'SYNTHETIC Outlaw Text',
          typeLine: type,
          oracleText: text,
          manaCost: '{1}{R}',
        }),
      );
      expect(imported.support.unparsed, text).toEqual([]);
      expect(imported.support.status, text).toBe('supported');
    }
    // Outlaw is not a creature type, so the capitalized word names nothing, and the singular alone is not a group of permanents.
    for (const text of ['Destroy target outlaws.']) {
      expect(parseOnly(spellCard('SYNTHETIC Outlaw Text', text)).support.status, text).toBe(
        'unsupported',
      );
    }
  });
});

describe('Back in Town: X target outlaw creature cards from your graveyard to the battlefield', () => {
  const game = () =>
    defineAll(scenario(), [BACK])
      .seat(0)
      .library(...LIBRARY)
      .hand(BACK.name)
      .graveyard(ROGUE.name, PIRATE.name, WARLOCK.name, ELF.name, ELF_ROGUE.name)
      .battlefield('Plains', 'Plains', 'Plains', 'Plains', 'Plains')
      .seat(1)
      .library(...LIBRARY)
      .graveyard(MERCENARY.name)
      .at('precombatMain', { active: 0 })
      .build();

  test('X = 2 returns the two chosen outlaw cards, whatever their outlaw type, and leaves the others', () => {
    const g = game();
    g.act(0).cast(BACK.name, {
      x: 2,
      targets: [
        { name: PIRATE.name, zone: 'graveyard' },
        { name: ELF_ROGUE.name, zone: 'graveyard' },
      ],
      pay: true,
    });
    g.passAll();
    g.expect.zone(PIRATE.name, 'battlefield', { seat: 0 });
    g.expect.zone(ELF_ROGUE.name, 'battlefield', { seat: 0 });
    g.expect.zone(ROGUE.name, 'graveyard', { seat: 0 });
    g.expect.zone(WARLOCK.name, 'graveyard', { seat: 0 });
    g.expect.zone(ELF.name, 'graveyard', { seat: 0 });
    g.expect.invariants();
  });

  test('a card that is no outlaw, and an outlaw card in another graveyard, are no legal target (CR 700.12, 115.1)', () => {
    const g = game();
    expect(() =>
      g.act(0).cast(BACK.name, {
        x: 1,
        targets: [{ name: ELF.name, zone: 'graveyard' }],
        pay: true,
      }),
    ).toThrow();
    const h = game();
    expect(() =>
      h.act(0).cast(BACK.name, {
        x: 1,
        targets: [{ name: MERCENARY.name, zone: 'graveyard', seat: 1 }],
        pay: true,
      }),
    ).toThrow();
  });

  test.each(OUTLAWS.map((c) => c.name))('%s is a legal target', (name) => {
    const g = defineAll(scenario(), [BACK])
      .seat(0)
      .library(...LIBRARY)
      .hand(BACK.name)
      .graveyard(name)
      .battlefield('Plains', 'Plains', 'Plains')
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(BACK.name, { x: 1, targets: [{ name, zone: 'graveyard' }], pay: true });
    g.passAll();
    g.expect.zone(name, 'battlefield', { seat: 0 });
  });
});

describe('Charred Graverobber: return target outlaw card from your graveyard to your hand', () => {
  const game = (grave: readonly string[]) =>
    defineAll(scenario(), [GRAVEROBBER])
      .seat(0)
      .library(...LIBRARY)
      .hand(GRAVEROBBER.name)
      .graveyard(...grave)
      .battlefield('Swamp', 'Swamp')
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();

  test('with one outlaw card in the graveyard the enters trigger returns it to the hand', () => {
    const g = game([ELF.name, WARLOCK.name]);
    g.act(0).cast(GRAVEROBBER.name, { pay: true });
    g.passAll();
    g.expect.zone(WARLOCK.name, 'hand', { seat: 0 });
    g.expect.zone(ELF.name, 'graveyard', { seat: 0 });
  });

  test('with several outlaw cards the player chooses one, and a card that is no outlaw cannot be chosen', () => {
    const g = game([ELF.name, ROGUE.name, PIRATE.name]);
    g.act(0).cast(GRAVEROBBER.name, { pay: true });
    g.passAll();
    expect(() => g.act(0).chooseTargets({ name: ELF.name, zone: 'graveyard' })).toThrow();
    g.act(0).chooseTargets({ name: PIRATE.name, zone: 'graveyard' });
    g.passAll();
    g.expect.zone(PIRATE.name, 'hand', { seat: 0 });
    g.expect.zone(ROGUE.name, 'graveyard', { seat: 0 });
  });

  test('with no outlaw card in the graveyard the trigger has no target and does nothing', () => {
    const g = game([ELF.name]);
    g.act(0).cast(GRAVEROBBER.name, { pay: true });
    g.passAll();
    g.expect.zone(ELF.name, 'graveyard', { seat: 0 });
    g.expect.stack([]);
  });
});

describe('Shoot the Sheriff: destroy target non-outlaw creature', () => {
  const game = () =>
    defineAll(scenario(), [SHERIFF])
      .seat(0)
      .library(...LIBRARY)
      .hand(SHERIFF.name)
      .battlefield('Swamp', 'Swamp')
      .seat(1)
      .library(...LIBRARY)
      .battlefield(ELF.name, ELF_ROGUE.name, ROGUE.name)
      .at('precombatMain', { active: 0 })
      .build();

  test('a creature with no outlaw type is destroyed', () => {
    const g = game();
    g.act(0).cast(SHERIFF.name, { targets: [ELF.name], pay: true });
    g.passAll();
    g.expect.zone(ELF.name, 'graveyard', { seat: 1 });
  });

  test.each([ROGUE.name, ELF_ROGUE.name])(
    '%s has an outlaw type and cannot be targeted',
    (name) => {
      const g = game();
      expect(() => g.act(0).cast(SHERIFF.name, { targets: [name], pay: true })).toThrow();
    },
  );
});

describe('Olivia, Opulent Outlaw: one or more outlaws you control deal combat damage to a player', () => {
  const game = (attackers: readonly string[], seats = 2) => {
    const b = defineAll(scenario({ seats: seats as 2 | 3 }), [OLIVIA])
      .seat(0)
      .library(...LIBRARY)
      .battlefield(OLIVIA.name, ...attackers)
      .seat(1)
      .library(...LIBRARY);
    const c = seats === 3 ? b.seat(2).library(...LIBRARY) : b;
    return c.at('precombatMain', { active: 0 }).build();
  };
  const treasures = (g: ReturnType<typeof game>) =>
    g.find({ name: 'Treasure', zone: 'battlefield', seat: 0 }).length;

  test('two outlaws deal damage together: one Treasure, not two (a batch of damage, CR 603.2c)', () => {
    const g = game([ROGUE.name, PIRATE.name]);
    g.advanceTo('declareAttackers');
    g.act(0).attack([ROGUE.name, PIRATE.name], { player: 1 });
    g.advanceTo('postcombatMain');
    g.expect.life(1, 36);
    expect(treasures(g)).toBe(1);
  });

  test('a creature that is no outlaw makes no Treasure', () => {
    const g = game([ELF.name]);
    g.advanceTo('declareAttackers');
    g.act(0).attack(ELF.name, { player: 1 });
    g.advanceTo('postcombatMain');
    g.expect.life(1, 38);
    expect(treasures(g)).toBe(0);
  });

  test('damage to any player counts: with three seats the outlaw attacks the third seat', () => {
    const g = game([WARLOCK.name, ELF.name], 3);
    g.advanceTo('declareAttackers');
    g.act(0).attack([WARLOCK.name, ELF.name], { player: 2 });
    g.advanceTo('postcombatMain');
    g.expect.life(2, 36);
    expect(treasures(g)).toBe(1);
  });

  test('an outlaw an opponent controls does not trigger it (it must be yours)', () => {
    const g = defineAll(scenario(), [OLIVIA])
      .seat(0)
      .library(...LIBRARY)
      .battlefield(OLIVIA.name)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(ROGUE.name)
      .at('precombatMain', { active: 1 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(1).attack(ROGUE.name, { player: 0 });
    g.advanceTo('postcombatMain');
    expect(treasures(g)).toBe(0);
  });
});

describe('Dead Before Sunrise: outlaw creatures you control get +1/+0 and gain a tap ability', () => {
  const game = () =>
    defineAll(scenario(), [SUNRISE])
      .seat(0)
      .library(...LIBRARY)
      .hand(SUNRISE.name)
      .battlefield('Mountain', 'Mountain', ROGUE.name, ELF.name, ELF_ROGUE.name)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(PIRATE.name, 'Serra Angel')
      .at('precombatMain', { active: 0 })
      .build();

  test('your outlaws get +1/+0 until end of turn; a non-outlaw and an opponent outlaw do not', () => {
    const g = game();
    g.act(0).cast(SUNRISE.name, { pay: true });
    g.passAll();
    g.expect.pt(ROGUE.name, 3, 2);
    g.expect.pt(ELF_ROGUE.name, 3, 2);
    g.expect.pt(ELF.name, 2, 2);
    g.expect.pt(PIRATE.name, 2, 2);
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.pt(ROGUE.name, 2, 2);
  });

  test("the granted ability deals damage equal to the creature's power to target creature", () => {
    const g = game();
    g.act(0).cast(SUNRISE.name, { pay: true });
    g.passAll();
    g.act(0).activate(ROGUE.name, { targets: ['Serra Angel'] });
    g.passAll();
    g.expect.tapped(ROGUE.name, true);
    g.expect.damage('Serra Angel', 3);
  });

  test('a creature that is no outlaw has no such ability', () => {
    const g = game();
    g.act(0).cast(SUNRISE.name, { pay: true });
    g.passAll();
    expect(() => g.act(0).activate(ELF.name)).toThrow();
  });

  test('the ability is gone when the turn ends', () => {
    const g = game();
    g.act(0).cast(SUNRISE.name, { pay: true });
    g.passAll();
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    expect(() => g.act(0).activate(ROGUE.name)).toThrow();
  });
});

describe('Vihaan, Goldwaker: other outlaws you control have vigilance and haste', () => {
  const game = () =>
    defineAll(scenario(), [VIHAAN])
      .seat(0)
      .library(...LIBRARY)
      .battlefield(VIHAAN.name, ROGUE.name, ELF.name)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(PIRATE.name)
      .at('precombatMain', { active: 0 })
      .build();

  test('another outlaw of yours has vigilance and haste', () => {
    const g = game();
    g.expect.derived(ROGUE.name, { keywords: ['vigilance', 'haste'] });
  });

  test('the source itself (other), a non-outlaw and an opponent outlaw do not', () => {
    const g = game();
    g.expect.derived(VIHAAN.name, { keywords: [] });
    g.expect.derived(ELF.name, { keywords: [] });
    g.expect.derived(PIRATE.name, { keywords: [] });
  });

  test('the card imports with the one line read', () => {
    const imported = parseOnly(
      syntheticCard({
        name: 'SYNTHETIC Vihaan Line',
        typeLine: 'Legendary Creature — Human Rogue',
        oracleText: 'Other outlaws you control have vigilance and haste.',
        power: '3',
        toughness: '3',
      }),
    );
    expect(imported.support.status).toBe('supported');
  });
});

describe('the predicate on a spell on the stack (CR 700.12)', () => {
  const WATCHER = parsed(
    'SYNTHETIC Watcher',
    'Enchantment',
    'Whenever you cast an outlaw spell, you gain 1 life.',
    { manaCost: '{1}{R}', colors: ['R'] },
  );
  const NEGATE = parsed('SYNTHETIC Negate', 'Instant', 'Counter target outlaw spell.', {
    manaCost: '{1}{U}',
    colors: ['U'],
  });
  const game = (cast: string) =>
    defineAll(scenario(), [WATCHER, NEGATE])
      .seat(0)
      .library(...LIBRARY)
      .hand(cast)
      .battlefield(WATCHER.name, 'Swamp', 'Swamp')
      .seat(1)
      .library(...LIBRARY)
      .hand(NEGATE.name)
      .battlefield('Island', 'Island')
      .at('precombatMain', { active: 0 })
      .build();

  test.each([ROGUE, ELF_ROGUE])('casting $name (an outlaw spell) gains 1 life', (card) => {
    const g = game(card.name);
    g.act(0).cast(card.name, { pay: true });
    g.passAll();
    g.expect.life(0, 41);
  });

  test('casting a creature spell with no outlaw type gains nothing', () => {
    const g = game(ELF.name);
    g.act(0).cast(ELF.name, { pay: true });
    g.passAll();
    g.expect.life(0, 40);
  });

  test('"counter target outlaw spell" counters a Warlock spell, and cannot target an Elf spell', () => {
    const g = game(WARLOCK.name);
    g.act(0).cast(WARLOCK.name, { pay: true });
    g.act(0).pass();
    g.act(1).cast(NEGATE.name, { targets: [WARLOCK.name], pay: true });
    g.passAll();
    g.expect.zone(WARLOCK.name, 'graveyard', { seat: 0 });
    const h = game(ELF.name);
    h.act(0).cast(ELF.name, { pay: true });
    h.act(0).pass();
    expect(() => h.act(1).cast(NEGATE.name, { targets: [ELF.name], pay: true })).toThrow();
  });
});
