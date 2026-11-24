// Draconic Dissent, group misc-templates: wordings read by the grammar and played through applyAction. Every card is a SYNTHETIC
// card whose text is the wording of the real card of the golden corpus (name replaced by ~).
import { scenario } from '@commander-arena/engine/testing';
import { describe, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;

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
    .at('precombatMain')
    .build();
}

describe('"{2}, {T}: You may put a basic land card from your hand onto the battlefield tapped." (CR 205.4, 608.2d)', () => {
  const generator = parsed(
    'SYNTHETIC Parsed Generator',
    'Land',
    '{T}: Add {C}.\n{2}, {T}: You may put a basic land card from your hand onto the battlefield tapped.',
  );

  test('a basic land of the hand is put onto the battlefield tapped', () => {
    const g = main((b) =>
      b.define(generator).battlefield(generator.name).battlefield('Plains', { count: 2 }).hand('Forest'),
    );
    g.act(0).activate(generator.name, { pay: true });
    g.passAll();
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards('Forest');
    g.expect.zone('Forest', 'battlefield', { seat: 0 });
    g.expect.tapped('Forest');
    g.expect.invariants();
  });

  test('a land that is not basic is no candidate: nothing is put onto the battlefield', () => {
    const g = main((b) =>
      b
        .define(generator)
        .battlefield(generator.name)
        .battlefield('Plains', { count: 2 })
        .hand('SYNTHETIC Drowsy Land'),
    );
    g.act(0).activate(generator.name, { pay: true });
    g.passAll();
    g.expect.zone('SYNTHETIC Drowsy Land', 'hand', { seat: 0 });
    g.expect.invariants();
  });
});
