// Lords: static "+N/+N" and keyword grants over a filter, and grants until end of turn to a filter (D-133). The
// engine already ran these shapes; the tests pin the rules they rest on so the parser can lower the real wordings.
// Pins: CR 611.3a (a continuous effect from a static ability is not locked in: it applies to whatever its text
// describes at any moment), CR 613.4c (+N/+N in layer 7c) and CR 613.1f (keyword grants in layer 6), CR 613.7
// (timestamps), CR 611.2c (a continuous effect from a resolving spell or ability changes only the objects it
// affected when it began), CR 613.4b (layer 7b before 7c), CR 205.3m (creature types).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-subjects.ts) or real fixtures.
import { describe, test } from 'vitest';
import { twoSeatGame } from './two-seat-helpers';

const LORD = 'SYNTHETIC Undead Lord'; // 2/2 Zombie: other Zombie creatures get +1/+1 (every controller)
const BARON = 'SYNTHETIC Bone Baron'; // 2/2 Zombie: Skeletons you control and other Zombies you control get +1/+1 and have deathtouch
const ACCURSED = 'SYNTHETIC Accursed Lord'; // 2/2 Zombie: {1}{B},{T}: All Zombies gain menace until end of turn
const RALLIER = 'SYNTHETIC Big Rallier'; // 3/3 Zombie: attacks: creatures you control with power 3 or greater get +1/+1 and trample
const ZOMBIE = 'SYNTHETIC Plain Zombie'; // 2/2
const SKELETON = 'SYNTHETIC Plain Skeleton'; // 1/1
const BEARS = 'Grizzly Bears'; // 2/2

describe('"Other Zombie creatures get +1/+1": a lord over a filter of every controller (CR 611.3a, 613.4c)', () => {
  test('it affects the Zombies of both players and not itself or a non-Zombie', () => {
    const g = twoSeatGame(
      (b) => b.battlefield(LORD).battlefield(ZOMBIE).battlefield(BEARS),
      (b) => b.battlefield(ZOMBIE),
    );
    g.expect.pt(LORD, 2, 2);
    g.expect.pt({ name: ZOMBIE, seat: 0 }, 3, 3);
    g.expect.pt({ name: ZOMBIE, seat: 1 }, 3, 3);
    g.expect.pt(BEARS, 2, 2);
  });

  test('two lords each affect the other, and the bonuses add up', () => {
    const g = twoSeatGame(
      (b) => b.battlefield(LORD).battlefield(ZOMBIE),
      (b) => b.battlefield(LORD),
    );
    g.expect.pt({ name: LORD, seat: 0 }, 3, 3);
    g.expect.pt({ name: LORD, seat: 1 }, 3, 3);
    g.expect.pt({ name: ZOMBIE, seat: 0 }, 4, 4);
  });

  test('it follows the board: a Zombie that enters later is affected at once, and the bonus ends when the lord leaves mid-turn', () => {
    const g = twoSeatGame((b) =>
      b.hand('Murder').battlefield('Swamp', { count: 3 }).battlefield(LORD).battlefield(ZOMBIE),
    );
    g.expect.pt(ZOMBIE, 3, 3);
    g.act(0).cast('Murder', { targets: [LORD], pay: true });
    g.passAll();
    g.expect.zone(LORD, 'graveyard', { seat: 0 });
    g.expect.pt(ZOMBIE, 2, 2);
    g.expect.invariants();
  });

  test('damage already marked stays when the lord leaves (CR 120.6): the toughness drop can kill', () => {
    const g = twoSeatGame((b) =>
      b
        .hand('Murder')
        .battlefield('Swamp', { count: 3 })
        .battlefield(LORD)
        .battlefield(ZOMBIE, { damage: 2 }),
    );
    g.expect.pt(ZOMBIE, 3, 3);
    g.act(0).cast('Murder', { targets: [LORD], pay: true });
    g.passAll();
    // 2 damage on a 2/2 once the lord is gone: state-based actions destroy it (CR 704.5g).
    g.expect.zone(ZOMBIE, 'graveyard', { seat: 0 });
  });
});

describe('"Skeletons you control and other Zombies you control get +1/+1 and have deathtouch" (anyOf, CR 613.1f)', () => {
  test('the union of two subtypes, mine only, the lord itself left out', () => {
    const g = twoSeatGame(
      (b) => b.battlefield(BARON).battlefield(ZOMBIE).battlefield(SKELETON).battlefield(BEARS),
      (b) => b.battlefield(ZOMBIE).battlefield(SKELETON),
    );
    g.expect.pt(BARON, 2, 2);
    g.expect.pt({ name: ZOMBIE, seat: 0 }, 3, 3);
    g.expect.pt({ name: SKELETON, seat: 0 }, 2, 2);
    g.expect.pt(BEARS, 2, 2);
    g.expect.pt({ name: ZOMBIE, seat: 1 }, 2, 2);
    g.expect.pt({ name: SKELETON, seat: 1 }, 1, 1);
    g.expect.derived({ name: ZOMBIE, seat: 0 }, { keywords: ['deathtouch'] });
    g.expect.derived({ name: SKELETON, seat: 0 }, { keywords: ['deathtouch'] });
    g.expect.derived({ name: ZOMBIE, seat: 1 }, { keywords: [] });
    g.expect.derived(BEARS, { keywords: [] });
    g.expect.derived(BARON, { keywords: [] });
  });
});

describe('"All Zombies gain menace until end of turn" (CR 611.2c, 514.2)', () => {
  test('it grants menace to the Zombies there are as it resolves, of both players', () => {
    const g = twoSeatGame(
      (b) =>
        b
          .battlefield('Swamp', { count: 2 })
          .battlefield(ACCURSED)
          .battlefield(ZOMBIE)
          .battlefield(BEARS),
      (b) => b.battlefield(ZOMBIE),
    );
    g.act(0).activate(ACCURSED, { pay: true });
    g.passAll();
    g.expect.derived(ACCURSED, { keywords: ['menace'] });
    g.expect.derived({ name: ZOMBIE, seat: 0 }, { keywords: ['menace'] });
    g.expect.derived({ name: ZOMBIE, seat: 1 }, { keywords: ['menace'] });
    g.expect.derived(BEARS, { keywords: [] });
  });

  test('a Zombie that enters after it resolved does not get it, and it ends with the turn', () => {
    const g = twoSeatGame(
      (b) => b.battlefield('Swamp', { count: 2 }).battlefield(ACCURSED).battlefield(ZOMBIE),
      (b) => b,
    );
    g.act(0).activate(ACCURSED, { pay: true });
    g.passAll();
    g.expect.derived(ZOMBIE, { keywords: ['menace'] });
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.derived(ZOMBIE, { keywords: [] });
  });
});

describe('"each creature you control with power 3 or greater gets +1/+1 and gains trample until end of turn"', () => {
  test('the set is chosen as the ability resolves, by the power each creature has then', () => {
    const g = twoSeatGame((b) => b.battlefield(RALLIER).battlefield(ZOMBIE).battlefield(BEARS));
    g.advanceTo('declareAttackers');
    g.act(0).attack(RALLIER);
    g.passAll();
    g.expect.pt(RALLIER, 4, 4);
    g.expect.derived(RALLIER, { keywords: ['trample'] });
    g.expect.pt(ZOMBIE, 2, 2);
    g.expect.derived(ZOMBIE, { keywords: [] });
  });
});
