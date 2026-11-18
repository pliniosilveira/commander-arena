// The Prismari deck (issue 87), group 2: Leitmotif Composer, "{2}{U}: Creatures named ~ can't be blocked this turn." (SYNTHETIC Name Composer, src/cards/fixtures/synthetic-prismari-g2.ts).
// Pins: CR 201.2 (a name is a characteristic: every creature with that name, whoever controls it), CR 611.2c (a continuous effect from a resolving ability that changes the
// characteristics or restrictions of objects affects only the objects it found as it began), CR 509.1b (an evasion restriction: it can't be blocked), CR 611.2a and 514.2 (until end of
// turn), CR 707.2 (a token copy has the copied name).
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const COMPOSER = 'SYNTHETIC Name Composer';
const BEARS = 'Grizzly Bears';
const LIBRARY = Array.from({ length: 12 }, () => 'Island');

type Builder = ReturnType<typeof scenario>;

function build(extra: (b: Builder) => void = () => {}, opponent: (b: Builder) => void = () => {}) {
  const b = scenario()
    .seat(0)
    .library(...LIBRARY)
    .battlefield(COMPOSER, { label: 'mine' })
    .battlefield(BEARS, { label: 'bears' })
    .battlefield('Island', { count: 3 });
  extra(b);
  b.seat(1)
    .library(...LIBRARY)
    .battlefield(BEARS, { label: 'blocker' });
  opponent(b);
  return b.at('precombatMain', { active: 0 }).build();
}

const activate = (g: ReturnType<typeof build>) => {
  g.act(0).activate('mine', { pay: true });
  g.passAll();
};

describe('the card is valid', () => {
  test(COMPOSER, () => {
    expect(validateCard(syntheticCard(COMPOSER))).toEqual([]);
  });
});

describe('creatures named like it can’t be blocked this turn (CR 201.2, 611.2c)', () => {
  test('it can’t be blocked, another creature can', () => {
    const g = build();
    activate(g);
    g.advanceTo('declareAttackers');
    g.act(0).attack(['mine', 'bears']);
    g.advanceTo('declareBlockers');
    g.expect.canBlock('blocker', 'mine', false);
    g.expect.canBlock('blocker', 'bears', true);
    g.expect.invariants();
  });

  test('a creature of the opponent with the same name is affected too: the name is all that counts', () => {
    const g = build(undefined, (b) => b.battlefield(COMPOSER, { label: 'theirs' }));
    activate(g);
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('declareAttackers');
    g.act(1).attack('theirs');
    g.advanceTo('declareBlockers');
    // It is still the same turn only if the effect lasts: it is the opponent's turn now, so the effect ended with mine.
    g.expect.canBlock('mine', 'theirs', true);
  });

  test('both copies of the name on the battlefield when the ability resolves can’t be blocked this turn', () => {
    const g = build((b) => b.battlefield(COMPOSER, { label: 'second' }));
    activate(g);
    g.advanceTo('declareAttackers');
    g.act(0).attack(['mine', 'second']);
    g.advanceTo('declareBlockers');
    // Nothing can be blocked, so no blockers are declared at all.
    expect(g.state.pending?.kind).not.toBe('declareBlockers');
    expect(g.state.combat?.attackers).toHaveLength(2);
  });

  test('a creature with that name that enters afterwards is not affected: the set is fixed as the effect begins (CR 611.2c)', () => {
    const g = build((b) =>
      b.hand('SYNTHETIC Prismari Big Study').battlefield('Island', { count: 6 }),
    );
    activate(g);
    // The sorcery has mana value 6: the second ability makes a token copy of the Composer, which is a new creature named alike.
    g.act(0).cast('SYNTHETIC Prismari Big Study', { pay: true });
    g.passAll();
    const copies = g
      .find({ name: COMPOSER, zone: 'battlefield', seat: 0 })
      .filter((o) => o.token !== null);
    expect(copies).toHaveLength(1);
    // The effect names the one creature it found: the token is a new object and is not among them (it is summoning sick this turn, so the block cannot be shown).
    const restrict = g.state.continuousEffects.filter((e) => e.change.kind === 'restrict');
    expect(restrict).toHaveLength(1);
    expect(restrict[0]?.objects).toEqual([g.id('mine')]);
    expect(restrict[0]?.objects).not.toContain(copies[0]?.id);
  });

  test('without the activation nothing is unblockable', () => {
    const g = build();
    g.advanceTo('declareAttackers');
    g.act(0).attack('mine');
    g.advanceTo('declareBlockers');
    g.expect.canBlock('blocker', 'mine', true);
  });

  test('it ends with the turn: the next turn of the controller it can be blocked again', () => {
    const g = build();
    activate(g);
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('declareAttackers');
    g.act(0).attack('mine');
    g.advanceTo('declareBlockers');
    g.expect.canBlock('blocker', 'mine', true);
  });
});
