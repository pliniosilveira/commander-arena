// Parsed text is only worth something if the engine runs it as written (stage P3). These tests
// import SYNTHETIC cards through the grammar (never through a fixture), define them in an engine
// scenario and play them through applyAction: an Aura cast on a creature, an Equipment equipped, an
// anthem, a lord. Every card name starts with "SYNTHETIC"; the Oracle text is template text from the
// corpus backlog (reports/backlog.md) or marked SYNTHETIC where no real line has the shape.
import type { CardDefinition } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const aura = (name: string, text: string): CardDefinition =>
  parsed(name, 'Enchantment — Aura', text, { manaCost: '{G}' });
const equipment = (name: string, text: string): CardDefinition =>
  parsed(name, 'Artifact — Equipment', text, { manaCost: '{1}' });
const elf = (name: string): CardDefinition =>
  parsed(name, 'Creature — Elf', '', { manaCost: '{G}', power: '1', toughness: '1' });

const BEARS = 'Grizzly Bears'; // 2/2
const ISAMARU = 'Isamaru, Hound of Konda'; // 2/2
const YARGLE = 'Yargle, Glutton of Urborg'; // 9/3

const keywordsOf = (g: ScenarioGame, name: string, seat: 0 | 1 = 0) =>
  g.view(seat).battlefield.find((o) => o.name === name)?.keywords;

/** The targets offered for the first target slot of the pending decision, as card names. */
function offered(g: ScenarioGame): string[] {
  const d = g.state.pending;
  if (d?.kind !== 'targets') throw new Error(`expected a targets decision, got ${d?.kind}`);
  return (d.specs[0]?.legal ?? []).map((t) =>
    t.kind === 'object'
      ? (g.view(0).battlefield.find((o) => o.id === t.id)?.name ?? '?')
      : 'player',
  );
}

describe('Auras: "Enchant creature" and a static line', () => {
  test('"Enchant creature" offers every creature as the Aura\'s target, and no land or player', () => {
    const might = aura(
      'SYNTHETIC Parsed Might',
      'Enchant creature\nEnchanted creature gets +2/+2.',
    );
    const g = scenario()
      .define(might)
      .seat(0)
      .hand(might.name)
      .battlefield('Forest', 'Forest')
      .battlefield(BEARS)
      .seat(1)
      .battlefield(YARGLE)
      .build();
    g.act(0).cast(might.name);
    expect(offered(g).sort()).toEqual([BEARS, YARGLE]);
  });

  test('casting it on a creature: the Aura resolves, attaches, and the bonus shows', () => {
    const might = aura(
      'SYNTHETIC Parsed Might',
      'Enchant creature\nEnchanted creature gets +2/+2.',
    );
    const g = scenario()
      .define(might)
      .seat(0)
      .hand(might.name)
      .pool('G')
      .battlefield(BEARS)
      .seat(1)
      .build();
    g.act(0).cast(might.name, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.attached(might.name, BEARS);
    g.expect.pt(BEARS, 4, 4);
  });

  test('"Enchant creature you control" offers only your own creatures', () => {
    const loyal = aura(
      'SYNTHETIC Parsed Loyal',
      'Enchant creature you control\nEnchanted creature gets +1/+1 and has vigilance.',
    );
    const g = scenario()
      .define(loyal)
      .seat(0)
      .hand(loyal.name)
      .pool('G')
      .battlefield(BEARS)
      .seat(1)
      .battlefield(YARGLE)
      .build();
    g.act(0).cast(loyal.name);
    expect(offered(g)).toEqual([BEARS]);
  });

  test('"gets +1/+1 and has vigilance" is a bonus and a keyword, both from the one line', () => {
    const loyal = aura(
      'SYNTHETIC Parsed Loyal Two',
      'Enchant creature you control\nEnchanted creature gets +1/+1 and has vigilance.',
    );
    const g = scenario()
      .define(loyal)
      .seat(0)
      .hand(loyal.name)
      .pool('G')
      .battlefield(BEARS)
      .seat(1)
      .build();
    g.act(0).cast(loyal.name, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.pt(BEARS, 3, 3);
    expect(keywordsOf(g, BEARS)).toEqual(['vigilance']);
  });

  test('"Enchanted creature gets -2/-2." kills a 2/2 once attached (state-based actions)', () => {
    const curse = aura(
      'SYNTHETIC Parsed Curse',
      'Enchant creature\nEnchanted creature gets -2/-2.',
    );
    const g = scenario()
      .define(curse)
      .seat(0)
      .hand(curse.name)
      .pool('G')
      .seat(1)
      .battlefield(BEARS)
      .build();
    g.act(0).cast(curse.name, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.zone(curse.name, 'graveyard', { seat: 0 });
  });

  test('"Enchant land" offers lands only, and "Enchanted land has hexproof." grants it', () => {
    const shield = aura('SYNTHETIC Parsed Shield', 'Enchant land\nEnchanted land has hexproof.');
    const g = scenario()
      .define(shield)
      .seat(0)
      .hand(shield.name)
      .pool('G')
      .battlefield('Forest', BEARS)
      .seat(1)
      .build();
    g.act(0).cast(shield.name);
    expect(offered(g)).toEqual(['Forest']);
    const cast = scenario()
      .define(shield)
      .seat(0)
      .hand(shield.name)
      .pool('G')
      .battlefield('Forest', BEARS)
      .seat(1)
      .build();
    cast.act(0).cast(shield.name, { targets: ['Forest'], pay: true });
    cast.passAll();
    cast.expect.attached(shield.name, 'Forest');
    expect(keywordsOf(cast, 'Forest')).toEqual(['hexproof']);
    expect(keywordsOf(cast, BEARS)).toEqual([]);
  });
});

describe('Equipment: "Equip {M}" and a static line', () => {
  test('equipping pays, attaches at resolution, and the bonus follows the Equipment', () => {
    const blade = equipment('SYNTHETIC Parsed Blade', 'Equipped creature gets +2/+0.\nEquip {1}');
    const g = scenario()
      .define(blade)
      .seat(0)
      .battlefield(blade.name, 'Forest')
      .battlefield(BEARS)
      .seat(1)
      .build();
    g.expect.pt(BEARS, 2, 2);
    g.act(0).activate(blade.name, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.attached(blade.name, BEARS);
    g.expect.pt(BEARS, 4, 2);
    g.expect.tapped('Forest');
  });

  test('"Equip—Pay 2 life" costs life, not mana', () => {
    const blood = equipment(
      'SYNTHETIC Parsed Blood Blade',
      'Equipped creature gets +3/+0.\nEquip—Pay 2 life',
    );
    const g = scenario()
      .define(blood)
      .seat(0)
      .life(20)
      .battlefield(blood.name, BEARS)
      .seat(1)
      .build();
    g.act(0).activate(blood.name, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.life(0, 18);
    g.expect.pt(BEARS, 5, 2);
  });

  test('"Equipped creature gets +1/+1 and has trample and vigilance." is three abilities in text order', () => {
    const plate = equipment(
      'SYNTHETIC Parsed Plate',
      'Equipped creature gets +1/+1 and has trample and vigilance.\nEquip {2}',
    );
    const g = scenario()
      .define(plate)
      .seat(0)
      .battlefield(plate.name, { attachedTo: BEARS })
      .battlefield(BEARS)
      .seat(1)
      .build();
    g.expect.pt(BEARS, 3, 3);
    expect(keywordsOf(g, BEARS)).toEqual(['trample', 'vigilance']);
  });

  test('"Equipped creature has haste and shroud." grants both (backlog: Lightning Greaves shape)', () => {
    const boots = equipment(
      'SYNTHETIC Parsed Boots',
      'Equipped creature has haste and shroud.\nEquip {0}',
    );
    const g = scenario()
      .define(boots)
      .seat(0)
      .battlefield(boots.name, { attachedTo: BEARS })
      .battlefield(BEARS)
      .seat(1)
      .build();
    expect(keywordsOf(g, BEARS)).toEqual(['haste', 'shroud']);
  });

  test('when the Equipment is not attached, nothing changes', () => {
    const blade = equipment(
      'SYNTHETIC Parsed Idle Blade',
      'Equipped creature gets +2/+0.\nEquip {1}',
    );
    const g = scenario().define(blade).seat(0).battlefield(blade.name, BEARS).seat(1).build();
    g.expect.attached(blade.name, null);
    g.expect.pt(BEARS, 2, 2);
  });
});

describe('statics about a group', () => {
  test('"Creatures you control get +1/+1." affects your creatures and no one else\'s', () => {
    const anthem = parsed(
      'SYNTHETIC Parsed Anthem',
      'Enchantment',
      'Creatures you control get +1/+1.',
      { manaCost: '{2}{W}' },
    );
    const g = scenario()
      .define(anthem)
      .seat(0)
      .battlefield(anthem.name, BEARS, ISAMARU)
      .seat(1)
      .battlefield(YARGLE)
      .build();
    g.expect.pt(BEARS, 3, 3);
    g.expect.pt(ISAMARU, 3, 3);
    g.expect.pt(YARGLE, 9, 3);
  });

  test('"Other creatures you control get +1/+1 and have flying." leaves its source alone', () => {
    const lord = parsed(
      'SYNTHETIC Parsed Lord',
      'Creature — Soldier',
      'Other creatures you control get +1/+1 and have flying.',
      { manaCost: '{1}{W}', power: '2', toughness: '2' },
    );
    const g = scenario()
      .define(lord)
      .seat(0)
      .battlefield(lord.name, BEARS)
      .seat(1)
      .battlefield(YARGLE)
      .build();
    g.expect.pt(lord.name, 2, 2);
    g.expect.pt(BEARS, 3, 3);
    expect(keywordsOf(g, BEARS)).toEqual(['flying']);
    expect(keywordsOf(g, lord.name)).toEqual([]);
    g.expect.pt(YARGLE, 9, 3);
  });

  test('"Other Elves you control get +1/+1." counts creature types, not just creatures', () => {
    const lord = parsed(
      'SYNTHETIC Parsed Elf Lord',
      'Creature — Elf',
      'Other Elves you control get +1/+1.',
      { manaCost: '{1}{G}', power: '1', toughness: '1' },
    );
    const mine = elf('SYNTHETIC Parsed Elf Friend');
    const theirs = elf('SYNTHETIC Parsed Elf Rival');
    const g = scenario()
      .define(lord)
      .define(mine)
      .define(theirs)
      .seat(0)
      .battlefield(lord.name, mine.name, BEARS)
      .seat(1)
      .battlefield(theirs.name)
      .build();
    g.expect.pt(lord.name, 1, 1);
    g.expect.pt(mine.name, 2, 2);
    g.expect.pt(BEARS, 2, 2);
    g.expect.pt(theirs.name, 1, 1);
  });

  test('"Creatures your opponents control get -1/-1." shrinks their creatures only', () => {
    const banner = parsed(
      'SYNTHETIC Parsed Banner',
      'Enchantment',
      'Creatures your opponents control get -1/-1.',
      { manaCost: '{2}{B}' },
    );
    const g = scenario()
      .define(banner)
      .seat(0)
      .battlefield(banner.name, BEARS)
      .seat(1)
      .battlefield(YARGLE, ISAMARU)
      .build();
    g.expect.pt(BEARS, 2, 2);
    g.expect.pt(YARGLE, 8, 2);
    g.expect.pt(ISAMARU, 1, 1);
  });

  test('"Creatures you control have haste." is seen by the rules that read keywords', () => {
    const horn = parsed(
      'SYNTHETIC Parsed Horn',
      'Enchantment',
      'Creatures you control have haste.',
      { manaCost: '{2}{R}' },
    );
    const g = scenario().define(horn).seat(0).battlefield(horn.name, BEARS).seat(1).build();
    expect(keywordsOf(g, BEARS)).toEqual(['haste']);
  });
});
