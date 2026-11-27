// Haldir, Lórien Lieutenant (Elven Council deck, issue 98), run through the engine as written: a SYNTHETIC card with the wording of the real one (name replaced by ~).
import { scenario } from '@commander-arena/engine/testing';
import { describe, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const BEARS = 'Grizzly Bears'; // 2/2
const ELVES = 'Llanowar Elves'; // 1/1 Elf Druid
const SIX_LANDS = ['Forest', 'Forest', 'Forest', 'Forest', 'Forest', 'Forest'] as const;
const FILLER = Array.from({ length: 8 }, () => 'Plains');

type Builder = ReturnType<typeof scenario>;

function main(mine: (b: Builder) => Builder) {
  return mine(
    scenario()
      .seat(0)
      .life(20)
      .library(...FILLER),
  )
    .seat(1)
    .life(20)
    .library(...FILLER)
    .at('precombatMain')
    .build();
}

describe('Haldir: "enters with X +1/+1 counters", and "{5}{G}: Until end of turn, other Elves you control gain vigilance and get +1/+1 for each +1/+1 counter on ~." (CR 611.2c, 613.1f, 613.4c)', () => {
  const haldir = () =>
    parsed(
      'SYNTHETIC Parsed Lieutenant',
      'Legendary Creature — Elf Soldier',
      '~ enters with X +1/+1 counters on it.\nVigilance\n{5}{G}: Until end of turn, other Elves you control gain vigilance and get +1/+1 for each +1/+1 counter on ~.',
      { manaCost: '{X}{G}', power: '0', toughness: '0', colors: ['G'] },
    );

  test('cast with X = 3, it enters with three counters', () => {
    const card = haldir();
    const g = main((b) =>
      b
        .define(card)
        .hand(card.name)
        .battlefield(...SIX_LANDS),
    );
    g.act(0).cast(card.name, { x: 3, pay: true });
    g.passAll();
    g.expect.counters(card.name, { '+1/+1': 3 });
    g.expect.pt(card.name, 3, 3);
  });

  test('the other Elves get vigilance and +1/+1 per counter; a non-Elf and Haldir itself do not', () => {
    const card = haldir();
    const g = main((b) =>
      b
        .define(card)
        .battlefield(card.name, { counters: { '+1/+1': 2 } })
        .battlefield(ELVES, { label: 'elf' })
        .battlefield(BEARS, { label: 'bears' })
        .battlefield(...SIX_LANDS),
    );
    g.act(0).activate(card.name, { pay: true });
    g.passAll();
    g.expect.pt('elf', 3, 3);
    g.expect.derived('elf', { keywords: ['vigilance'] });
    g.expect.pt('bears', 2, 2);
    g.expect.derived('bears', { keywords: [] });
    g.expect.pt(card.name, 2, 2);
  });

  test('the effect lasts through the turn: it is still there in combat (CR 611.2a)', () => {
    const card = haldir();
    const g = main((b) =>
      b
        .define(card)
        .battlefield(card.name, { counters: { '+1/+1': 2 } })
        .battlefield(ELVES, { label: 'elf' })
        .battlefield(...SIX_LANDS),
    );
    g.act(0).activate(card.name, { pay: true });
    g.passAll();
    g.expect.pt('elf', 3, 3);
    g.advanceTo('declareAttackers', { attack: false });
    g.expect.pt('elf', 3, 3);
    g.expect.derived('elf', { keywords: ['vigilance'] });
  });
});
