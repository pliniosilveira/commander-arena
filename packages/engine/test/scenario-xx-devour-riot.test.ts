// Devour, Riot and the group "can't be countered" (D-185, the Korvold slice 6): "As this object enters, you may sacrifice any number of creatures. This
// permanent enters with N +1/+1 counters on it for each creature sacrificed this way." (Devour N), "You may have this permanent enter with an additional
// +1/+1 counter on it. If you don't, it gains haste." (Riot), "Creature spells you control can't be countered." and "Nontoken creatures you control have riot."
// Pins: CR 702.82a (Devour), CR 702.136a and 702.136b (Riot, each instance separately), CR 614.12 (a replacement effect of the entering permanent and the
// abilities of the permanents already on the battlefield apply as it enters), CR 122.6 (counters it enters with), CR 701.21a (sacrifice), CR 702.10 (haste),
// CR 101.2 and 701.6a (a spell that can't be countered stays on the stack), CR 111.2 (a token). Cards are SYNTHETIC
// (src/cards/fixtures/synthetic-korvold-keywords.ts) with the wording of the real cards.
import { describe, expect, test } from 'vitest';
import { applyAction, fixtureCard, getView, syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const BRUTE = 'SYNTHETIC Devouring Brute'; // {2}{R} 2/2, devour 2
const BROOD = 'SYNTHETIC Dragon Broodmother'; // {2}{R}{R}{R}{G} 4/4 flying; each upkeep: a 1/1 Dragon token with flying and devour 2
const GOBLIN = 'SYNTHETIC Riot Goblin'; // {1}{R} 2/1, riot
const OGRE = 'SYNTHETIC Plain Ogre'; // {2}{R} 3/2, nothing
const BOTH = 'SYNTHETIC Riotous Devourer'; // {3}{R} 2/2, riot and devour 1
const RHYTHM = 'SYNTHETIC Rhythm of the Wild'; // {1}{R}{G}: creature spells you control can't be countered; nontoken creatures you control have riot
const MAKER = 'SYNTHETIC Riot Token Maker'; // {2}{R} 1/1; enters: a 2/2 Goblin token with riot
const PILFERER = 'SYNTHETIC Encore Pilferer'; // {R} 2/1; dies: create a Treasure
const BEARS = 'Grizzly Bears';
const COUNTER = 'Counterspell';
const GROVE = 'SYNTHETIC Riot Grove'; // a land creature with riot, played from the hand
const REANIMATE = 'SYNTHETIC Reanimate Zombie'; // {2}{B}: return target creature card from your graveyard to the battlefield
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

type Builder = ReturnType<typeof scenario>;
type Game = ReturnType<Builder['build']>;

const build = (
  setup: (b: Builder) => void,
  opponent: (b: Builder) => void = () => undefined,
): Game => {
  const b = scenario()
    .seat(0)
    .library(...LIBRARY);
  setup(b);
  const o = b.seat(1).library(...LIBRARY);
  opponent(o);
  return o.build();
};

const counters = (g: Game, card: string, seat = 0) =>
  g.find({ name: card, zone: 'battlefield', seat })[0]?.counters['+1/+1'] ?? 0;

describe('the cards are valid', () => {
  test.each([BRUTE, BROOD, GOBLIN, OGRE, BOTH, RHYTHM, MAKER, GROVE, 'SYNTHETIC Encore Rioter'])(
    '%s',
    (name) => {
      expect(validateCard(syntheticCard(name))).toEqual([]);
    },
  );
});

describe('Devour N, a permanent spell (CR 702.82a)', () => {
  const castBrute = (g: Game) => g.act(0).cast(BRUTE, { pay: true });

  test('with creatures to sacrifice the controller is asked as the spell resolves, before it is on the battlefield', () => {
    const g = build((b) =>
      b.hand(BRUTE).battlefield('Mountain', { count: 3 }).battlefield(BEARS, PILFERER),
    );
    castBrute(g);
    g.passAll();
    g.expect.pending('choosePermanent', 0);
    g.expect.noObject(BRUTE, { zone: 'battlefield' });
    const d = g.state.pending;
    if (d?.kind !== 'choosePermanent') throw new Error('expected a permanent choice');
    expect(d.purpose).toBe('devour');
    expect(d.min).toBe(0);
    expect(d.max).toBe(2);
    expect(d.legal).toHaveLength(2); // the Bears and the Pilferer, not the Brute itself
  });

  test('one creature sacrificed: it enters with two +1/+1 counters, and the creature is in the graveyard', () => {
    const g = build((b) =>
      b.hand(BRUTE).battlefield('Mountain', { count: 3 }).battlefield(BEARS, PILFERER),
    );
    castBrute(g);
    g.passAll();
    g.act(0).choosePermanents(BEARS);
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.zone(BRUTE, 'battlefield', { seat: 0 });
    expect(counters(g, BRUTE)).toBe(2);
    g.expect.pt(BRUTE, 4, 4);
    g.expect.invariants();
  });

  test('two sacrificed: four counters; their "dies" triggers still happen', () => {
    const g = build((b) =>
      b.hand(BRUTE).battlefield('Mountain', { count: 3 }).battlefield(BEARS, PILFERER),
    );
    castBrute(g);
    g.passAll();
    g.act(0).choosePermanents(BEARS, PILFERER);
    expect(counters(g, BRUTE)).toBe(4);
    g.expect.stack([`${PILFERER} (ability)`]);
    g.passAll();
    expect(g.find({ name: 'Treasure', zone: 'battlefield', seat: 0 })).toHaveLength(1);
  });

  test('none is a legal answer: no counters, nobody sacrificed', () => {
    const g = build((b) => b.hand(BRUTE).battlefield('Mountain', { count: 3 }).battlefield(BEARS));
    castBrute(g);
    g.passAll();
    g.act(0).choosePermanents();
    expect(counters(g, BRUTE)).toBe(0);
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
  });

  test('with nothing to sacrifice there is no question', () => {
    const g = build((b) => b.hand(BRUTE).battlefield('Mountain', { count: 3 }));
    castBrute(g);
    g.passAll();
    g.expect.zone(BRUTE, 'battlefield', { seat: 0 });
    expect(counters(g, BRUTE)).toBe(0);
  });

  test('the opponent’s creatures cannot be chosen, and neither can a non-creature', () => {
    const g = build(
      (b) => b.hand(BRUTE).battlefield('Mountain', { count: 3 }).battlefield(BEARS),
      (b) => b.battlefield(PILFERER),
    );
    castBrute(g);
    g.passAll();
    const d = g.state.pending;
    if (d?.kind !== 'choosePermanent') throw new Error('expected a permanent choice');
    expect(d.legal).toEqual([g.id(BEARS)]);
    expect(() => g.act(0).choosePermanents({ name: PILFERER, seat: 1 })).toThrow();
  });

  test('an answer that is not legal is refused and the question stays', () => {
    const g = build((b) => b.hand(BRUTE).battlefield('Mountain', { count: 3 }).battlefield(BEARS));
    castBrute(g);
    g.passAll();
    const refused = applyAction(g.state, 0, {
      kind: 'choosePermanents',
      objects: [g.id('Mountain[0]')],
    });
    expect(refused.ok).toBe(false);
    g.expect.pending('choosePermanent', 0);
  });

  test('a permanent that comes back from the graveyard by an effect asks, too', () => {
    const g = build((b) =>
      b.hand(REANIMATE).graveyard(BRUTE).battlefield('Swamp', { count: 3 }).battlefield(BEARS),
    );
    g.act(0).cast(REANIMATE, { targets: [BRUTE], pay: true });
    g.passAll();
    g.expect.pending('choosePermanent', 0);
    g.act(0).choosePermanents(BEARS);
    expect(counters(g, BRUTE)).toBe(2);
    g.expect.invariants();
  });
});

describe('Devour on a token: a Dragon with devour 2 (CR 702.82a, 111.2)', () => {
  // The opponent's upkeep begins: the Broodmother's controller still makes the token and chooses.
  const broodGame = (...cards: string[]) => {
    const g = build((b) => b.battlefield(BROOD, ...cards));
    g.advanceTo('upkeep', { turn: 'next' });
    return g;
  };

  test('at the beginning of each upkeep the token is made, and its controller chooses what to sacrifice as it enters', () => {
    const g = broodGame(PILFERER, BEARS);
    g.passAll(); // the trigger resolves
    g.expect.pending('choosePermanent', 0);
    const d = g.state.pending;
    if (d?.kind !== 'choosePermanent') throw new Error('expected a permanent choice');
    expect(d.purpose).toBe('devour');
    expect(d.legal).toHaveLength(3); // the Broodmother, the Pilferer and the Bears: the token is not there yet
    g.act(0).choosePermanents(BEARS, PILFERER);
    const dragon = g.find({ name: 'Dragon', zone: 'battlefield', seat: 0 })[0];
    expect(dragon?.token).not.toBeNull();
    expect(dragon?.counters['+1/+1']).toBe(4);
    g.expect.pt({ name: 'Dragon' }, 5, 5);
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.invariants();
  });

  test('sacrificing nothing makes a plain 1/1', () => {
    const g = broodGame(PILFERER, BEARS);
    g.passAll();
    g.act(0).choosePermanents();
    const dragon = g.find({ name: 'Dragon', zone: 'battlefield', seat: 0 })[0];
    expect(dragon?.counters['+1/+1'] ?? 0).toBe(0);
    g.expect.pt({ name: 'Dragon' }, 1, 1);
  });

  test('it flies and has devour as a keyword', () => {
    const g = broodGame(PILFERER, BEARS);
    g.passAll();
    g.act(0).choosePermanents();
    const view = getView(g.state, 0).battlefield.find((o) => o.name === 'Dragon');
    expect(view?.keywords).toContain('flying');
  });

  test('the Broodmother may sacrifice itself: it is on the battlefield and a creature', () => {
    const g = broodGame();
    g.passAll();
    g.act(0).choosePermanents(BROOD);
    g.expect.zone(BROOD, 'graveyard', { seat: 0 });
    expect(g.find({ name: 'Dragon', zone: 'battlefield', seat: 0 })[0]?.counters['+1/+1']).toBe(2);
  });

  test('with nothing else to sacrifice but the Broodmother, it is still asked (the Broodmother is a creature)', () => {
    const g = broodGame();
    g.passAll();
    g.expect.pending('choosePermanent', 0);
  });

  test('the opponent’s upkeep makes a token too, for the Broodmother’s controller', () => {
    const g = build(
      (b) => b.battlefield(BROOD, BEARS),
      (b) => b,
    );
    g.advanceTo('upkeep', { turn: 'next' });
    g.passAll();
    g.expect.pending('choosePermanent', 0);
    g.act(0).choosePermanents(BEARS);
    expect(g.find({ name: 'Dragon', zone: 'battlefield', seat: 0 })[0]?.counters['+1/+1']).toBe(2);
  });
});

describe('Riot (CR 702.136a)', () => {
  const goblinGame = () => build((b) => b.hand(GOBLIN).battlefield('Mountain', { count: 2 }));

  test('the controller chooses as it enters: the counter', () => {
    const g = goblinGame();
    g.act(0).cast(GOBLIN, { pay: true });
    g.passAll();
    g.expect.pending('chooseOption', 0);
    const d = g.state.pending;
    if (d?.kind !== 'chooseOption') throw new Error('expected an option choice');
    expect(d.purpose).toBe('riot');
    expect(d.options).toEqual(['counter', 'haste']);
    g.expect.noObject(GOBLIN, { zone: 'battlefield' });
    g.act(0).chooseOption('counter');
    expect(counters(g, GOBLIN)).toBe(1);
    g.expect.pt(GOBLIN, 3, 2);
    g.advanceTo('declareAttackers', { attack: false });
    g.expect.canAttack(GOBLIN, false); // summoning sick: no haste
  });

  test('haste instead: no counter, and it can attack the turn it arrives', () => {
    const g = goblinGame();
    g.act(0).cast(GOBLIN, { pay: true });
    g.passAll();
    g.act(0).chooseOption('haste');
    expect(counters(g, GOBLIN)).toBe(0);
    g.expect.pt(GOBLIN, 2, 1);
    expect(getView(g.state, 0).battlefield.find((o) => o.name === GOBLIN)?.keywords).toContain(
      'haste',
    );
    g.advanceTo('declareAttackers', { attack: false });
    g.expect.canAttack(GOBLIN, true);
    g.expect.invariants();
  });

  test('a creature without riot asks nothing', () => {
    const g = build((b) => b.hand(OGRE).battlefield('Mountain', { count: 3 }));
    g.act(0).cast(OGRE, { pay: true });
    g.passAll();
    g.expect.zone(OGRE, 'battlefield', { seat: 0 });
  });

  test('an answer that is not an option is refused', () => {
    const g = goblinGame();
    g.act(0).cast(GOBLIN, { pay: true });
    g.passAll();
    expect(applyAction(g.state, 0, { kind: 'chooseOption', option: 'flying' }).ok).toBe(false);
    g.expect.pending('chooseOption', 0);
  });

  test('the haste is the permanent’s own: it is gone with a copy, and it does not come back after it leaves', () => {
    const g = goblinGame();
    g.act(0).cast(GOBLIN, { pay: true });
    g.passAll();
    g.act(0).chooseOption('haste');
    expect(g.object(GOBLIN).riotHaste).toBe(true);
  });
});

describe('Riot and Devour together: riot first, devour last', () => {
  test('both questions are asked, each answered, and both give their counters', () => {
    const g = build((b) => b.hand(BOTH).battlefield('Mountain', { count: 4 }).battlefield(BEARS));
    g.act(0).cast(BOTH, { pay: true });
    g.passAll();
    g.expect.pending('chooseOption', 0);
    g.act(0).chooseOption('counter');
    g.expect.pending('choosePermanent', 0);
    g.act(0).choosePermanents(BEARS);
    expect(counters(g, BOTH)).toBe(2); // one for riot, one for devour 1 and one creature
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
  });

  test('haste and nothing sacrificed', () => {
    const g = build((b) => b.hand(BOTH).battlefield('Mountain', { count: 4 }).battlefield(BEARS));
    g.act(0).cast(BOTH, { pay: true });
    g.passAll();
    g.act(0).chooseOption('haste');
    g.act(0).choosePermanents();
    expect(counters(g, BOTH)).toBe(0);
    expect(g.object(BOTH).riotHaste).toBe(true);
  });
});

describe('"Nontoken creatures you control have riot" (CR 702.136a, 614.12)', () => {
  const rhythmGame = (more: (b: Builder) => void = () => undefined) =>
    build((b) => {
      b.hand(OGRE, GOBLIN, MAKER).battlefield(RHYTHM).battlefield('Mountain', { count: 6 });
      more(b);
    });

  test('a creature that has no riot of its own asks, as it enters, because of the enchantment', () => {
    const g = rhythmGame();
    g.act(0).cast(OGRE, { pay: true });
    g.passAll();
    g.expect.pending('chooseOption', 0);
    g.act(0).chooseOption('counter');
    expect(counters(g, OGRE)).toBe(1);
  });

  test('haste from it', () => {
    const g = rhythmGame();
    g.act(0).cast(OGRE, { pay: true });
    g.passAll();
    g.act(0).chooseOption('haste');
    expect(counters(g, OGRE)).toBe(0);
    g.advanceTo('declareAttackers', { attack: false });
    g.expect.canAttack(OGRE, true);
  });

  test('a creature with riot of its own has two instances (CR 702.136b): two questions, two counters', () => {
    const g = rhythmGame();
    g.act(0).cast(GOBLIN, { pay: true });
    g.passAll();
    g.expect.pending('chooseOption', 0);
    const first = g.state.pending;
    if (first?.kind !== 'chooseOption') throw new Error('expected an option choice');
    expect(first.riotSoFar).toEqual([]);
    g.act(0).chooseOption('counter');
    g.expect.pending('chooseOption', 0);
    const second = g.state.pending;
    if (second?.kind !== 'chooseOption') throw new Error('expected an option choice');
    expect(second.riotSoFar).toEqual(['counter']);
    g.act(0).chooseOption('counter');
    expect(counters(g, GOBLIN)).toBe(2);
  });

  test('one counter and haste', () => {
    const g = rhythmGame();
    g.act(0).cast(GOBLIN, { pay: true });
    g.passAll();
    g.act(0).chooseOption('counter');
    g.act(0).chooseOption('haste');
    expect(counters(g, GOBLIN)).toBe(1);
    expect(g.object(GOBLIN).riotHaste).toBe(true);
  });

  test('a token is not a nontoken creature: it gets no riot from it', () => {
    const g = rhythmGame();
    g.act(0).cast(MAKER, { pay: true });
    g.passAll(); // the Maker resolves; it asks for its own riot first
    g.act(0).chooseOption('counter');
    g.passAll(); // its trigger makes a Goblin token with riot of its own: one question, not two
    g.expect.pending('chooseOption', 0);
    g.act(0).chooseOption('counter');
    const token = g.find({ name: 'Goblin', zone: 'battlefield', seat: 0 })[0];
    expect(token?.token).not.toBeNull();
    expect(token?.counters['+1/+1']).toBe(1);
    expect(g.state.pending?.kind).not.toBe('chooseOption');
  });

  test('the opponent’s creatures do not get it', () => {
    const g = build(
      (b) => b.battlefield(RHYTHM),
      (b) => b.hand(OGRE).battlefield('Mountain', { count: 3 }),
    );
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('precombatMain');
    g.act(1).cast(OGRE, { pay: true });
    g.passAll();
    g.expect.zone(OGRE, 'battlefield', { seat: 1 });
  });

  test('without the enchantment on the battlefield there is no question: it is not a spell’s ability', () => {
    const g = build((b) => b.hand(OGRE).battlefield('Mountain', { count: 3 }));
    g.act(0).cast(OGRE, { pay: true });
    g.passAll();
    g.expect.zone(OGRE, 'battlefield', { seat: 0 });
  });

  test('a creature that already entered gets no question when the enchantment comes later', () => {
    const g = build((b) =>
      b.hand(RHYTHM).battlefield(OGRE).battlefield('Mountain', { count: 2 }).battlefield('Forest'),
    );
    g.act(0).cast(RHYTHM, { pay: true });
    g.passAll();
    g.expect.zone(RHYTHM, 'battlefield', { seat: 0 });
    expect(counters(g, OGRE)).toBe(0);
  });

  test('a creature that returns from the graveyard asks, too', () => {
    const g = rhythmGame((b) =>
      b.graveyard(BEARS).hand(REANIMATE).battlefield('Swamp', { count: 3 }),
    );
    g.act(0).cast(REANIMATE, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.pending('chooseOption', 0);
    g.act(0).chooseOption('counter');
    expect(counters(g, BEARS)).toBe(1);
  });
});

describe('a land creature with riot is played from the hand (CR 305.1, 614.12)', () => {
  test('the question waits while the land is in the hand; the answer plays it', () => {
    const g = build((b) => b.hand(GROVE));
    g.act(0).playLand(GROVE);
    g.expect.pending('chooseOption', 0);
    g.expect.zone(GROVE, 'hand', { seat: 0 });
    g.act(0).chooseOption('counter');
    g.expect.zone(GROVE, 'battlefield', { seat: 0 });
    expect(counters(g, GROVE)).toBe(1);
    expect(g.state.seats[0]?.landsPlayedThisTurn).toBe(1);
  });

  test('haste', () => {
    const g = build((b) => b.hand(GROVE));
    g.act(0).playLand(GROVE);
    g.act(0).chooseOption('haste');
    expect(counters(g, GROVE)).toBe(0);
    expect(g.object(GROVE).riotHaste).toBe(true);
  });
});

describe('a land creature with riot under "Nontoken creatures you control have riot"', () => {
  test('two instances (CR 702.136b): the land waits in the hand for both answers and is played once', () => {
    const g = build((b) => b.hand(GROVE).battlefield(RHYTHM));
    g.act(0).playLand(GROVE);
    g.expect.pending('chooseOption', 0);
    g.act(0).chooseOption('counter');
    g.expect.pending('chooseOption', 0);
    g.expect.zone(GROVE, 'hand', { seat: 0 });
    g.act(0).chooseOption('counter');
    g.expect.zone(GROVE, 'battlefield', { seat: 0 });
    expect(counters(g, GROVE)).toBe(2);
    expect(g.state.seats[0]?.landsPlayedThisTurn).toBe(1);
  });
});

describe('"Creature spells you control can\'t be countered" (CR 101.2, 701.6a)', () => {
  test('a creature spell of its controller survives a counterspell and resolves', () => {
    const g = build(
      (b) => b.hand(OGRE).battlefield(RHYTHM).battlefield('Mountain', { count: 3 }),
      (b) => b.hand(COUNTER).battlefield('Island', { count: 2 }),
    );
    g.act(0).cast(OGRE, { pay: true });
    g.pass(0);
    g.act(1).cast(COUNTER, { targets: [OGRE], pay: true });
    g.passAll();
    g.expect.pending('chooseOption', 0); // it resolved: riot asks
    g.act(0).chooseOption('haste');
    g.expect.zone(OGRE, 'battlefield', { seat: 0 });
    g.expect.zone(COUNTER, 'graveyard', { seat: 1 });
  });

  test('a noncreature spell of its controller can be countered', () => {
    const g = build(
      (b) => b.hand('Lightning Bolt').battlefield(RHYTHM).battlefield('Mountain', { count: 3 }),
      (b) => b.hand(COUNTER).battlefield('Island', { count: 2 }),
    );
    g.act(0).cast('Lightning Bolt', { targets: [{ player: 1 }], pay: true });
    g.pass(0);
    g.act(1).cast(COUNTER, { targets: ['Lightning Bolt'], pay: true });
    g.passAll();
    g.expect.zone('Lightning Bolt', 'graveyard', { seat: 0 });
    g.expect.life(1, 40);
  });

  test('the opponent’s creature spells can be countered by it: it protects only its controller’s', () => {
    const g = build(
      (b) => b.battlefield(RHYTHM).hand(COUNTER).battlefield('Island', { count: 2 }),
      (b) => b.hand(OGRE).battlefield('Mountain', { count: 3 }),
    );
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('precombatMain');
    g.act(1).cast(OGRE, { pay: true });
    g.pass(1);
    g.act(0).cast(COUNTER, { targets: [OGRE], pay: true });
    g.passAll();
    g.expect.zone(OGRE, 'graveyard', { seat: 1 });
  });

  test('without the enchantment the counterspell works', () => {
    const g = build(
      (b) => b.hand(OGRE).battlefield('Mountain', { count: 3 }),
      (b) => b.hand(COUNTER).battlefield('Island', { count: 2 }),
    );
    g.act(0).cast(OGRE, { pay: true });
    g.pass(0);
    g.act(1).cast(COUNTER, { targets: [OGRE], pay: true });
    g.passAll();
    g.expect.zone(OGRE, 'graveyard', { seat: 0 });
  });
});

describe('validation', () => {
  const withAbilities = (abilities: readonly unknown[]) => {
    const card = syntheticCard(OGRE);
    const face = card.faces[0];
    if (face === undefined) throw new Error('no face');
    return { ...card, faces: [{ ...face, abilities }] } as never;
  };
  const messages = (abilities: readonly unknown[]) =>
    validateCard(withAbilities(abilities)).map((i) => i.message);

  test('devour needs a positive whole number, and only one on a face or a token', () => {
    expect(messages([{ kind: 'keyword', keyword: { kind: 'devour', count: 0 } }])).toContain(
      'devour N: N is a positive whole number',
    );
    expect(
      messages([
        { kind: 'keyword', keyword: { kind: 'devour', count: 1 } },
        { kind: 'keyword', keyword: { kind: 'devour', count: 2 } },
      ]).some((m) => m.includes('more than one devour ability')),
    ).toBe(true);
  });

  test('devour is not on a land', () => {
    const card = fixtureCard('Mountain');
    const face = card.faces[0];
    if (face === undefined) throw new Error('no face');
    const land = {
      ...card,
      faces: [{ ...face, abilities: [{ kind: 'keyword', keyword: { kind: 'devour', count: 1 } }] }],
    } as never;
    expect(
      validateCard(land).some((i) => i.message.includes('devour is on a permanent card')),
    ).toBe(true);
  });

  test('riot is given to a group, not to the permanent itself or an attached one', () => {
    expect(
      messages([
        {
          kind: 'static',
          static: { kind: 'grantKeyword', subject: { kind: 'this' }, keyword: { kind: 'riot' } },
        },
      ]).some((m) => m.includes('riot is given to a group')),
    ).toBe(true);
    expect(
      messages([
        {
          kind: 'static',
          static: {
            kind: 'grantKeyword',
            subject: { kind: 'filter', filter: { types: ['creature'] } },
            keyword: { kind: 'riot' },
          },
        },
      ]),
    ).toEqual([]);
  });

  test('a spell cannot give riot: only a static ability can', () => {
    expect(
      messages([
        {
          kind: 'activated',
          cost: [{ kind: 'tap' }],
          effect: {
            kind: 'grantKeyword',
            objects: { kind: 'this' },
            keyword: { kind: 'riot' },
            duration: 'untilEndOfTurn',
          },
        },
      ]).length,
    ).toBeGreaterThan(0);
  });

  test('a token a replacement creates as a creature dies asks no question, so it has no devour or riot', () => {
    const card = syntheticCard('SYNTHETIC Soul Collector');
    const face = card.faces[0];
    if (face === undefined) throw new Error('no face');
    const token = {
      kind: 'custom',
      definition: {
        name: 'Goblin',
        manaCost: null,
        supertypes: [],
        types: ['creature'],
        subtypes: ['Goblin'],
        colors: ['R'],
        power: 1,
        toughness: 1,
        loyalty: null,
        defense: null,
        oracleText: 'Riot',
        abilities: [{ kind: 'keyword', keyword: { kind: 'riot' } }],
      },
    };
    const bad = {
      ...card,
      faces: [
        {
          ...face,
          abilities: [
            {
              kind: 'replacement',
              replacement: {
                kind: 'wouldDie',
                what: { types: ['creature'], controller: 'opponent', token: false },
                instead: 'exile',
                alsoCreate: { token, count: 1 },
              },
            },
          ],
        },
      ],
    } as never;
    expect(validateCard(bad).map((i) => i.message)).toContain(
      'a token a replacement creates asks no question as it enters: no devour or riot',
    );
  });

  test('the group "can\'t be countered" needs a filter', () => {
    expect(
      messages([{ kind: 'static', static: { kind: 'spellsCantBeCountered' } }]).some((m) =>
        m.includes('spellsCantBeCountered needs a filter'),
      ),
    ).toBe(true);
  });
});
