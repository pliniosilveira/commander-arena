// Encore (D-185, the Korvold slice 6): "[Cost], Exile this card from your graveyard: For each opponent, create a token that's a copy of this card that
// attacks that opponent this turn if able. The tokens gain haste. Sacrifice them at the beginning of the next end step. Activate only as a sorcery."
// Pins: CR 702.141a (the whole ability), CR 602.2 and 113.6b (an activated ability that works from the graveyard uses the stack and is not a spell), CR 602.5d
// (sorcery speed), CR 118.1 (exiling the card is a cost), CR 113.7a (the token copies the card as it last was in the graveyard), CR 707.2 and 111.4 (a token
// that is a copy), CR 508.1d (a requirement to attack is obeyed if able), CR 702.10 (haste), CR 603.7 (a delayed triggered ability), CR 701.21 (sacrifice),
// CR 400.7 (the exiled card is a new object). Cards are SYNTHETIC (src/cards/fixtures/synthetic-korvold-keywords.ts) with the wording of the real cards.
import { describe, expect, test } from 'vitest';
import { applyAction, getLegalActions, syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const PILFERER = 'SYNTHETIC Encore Pilferer'; // {R} 2/1; dies: create a Treasure; Encore {3}{R}
const BEAR = 'SYNTHETIC Encore Bear'; // {1}{G} 2/2; Encore {1}{G}
const BLOCKER = 'Grizzly Bears';

type Game = ReturnType<ReturnType<typeof scenario>['build']>;

const encoreGame = (extra?: (b: ReturnType<typeof scenario>) => void) => {
  const b = scenario().seat(0).graveyard(PILFERER).battlefield('Mountain', { count: 4 });
  extra?.(b);
  return b.seat(1).build();
};

const tokens = (g: Game, name = PILFERER) =>
  g.find({ name, zone: 'battlefield', seat: 0 }).filter((o) => o.token !== null);

describe('the cards are valid', () => {
  test.each([PILFERER, BEAR])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
});

describe('the activation: from the graveyard, at sorcery speed (CR 702.141a, 602.5d)', () => {
  test('a card with encore in the graveyard has an activate option when the cost can be paid', () => {
    const g = encoreGame();
    g.expect.legal(0, { activate: PILFERER });
  });

  test('without the mana there is no option', () => {
    const g = scenario()
      .seat(0)
      .graveyard(PILFERER)
      .battlefield('Mountain', { count: 3 })
      .seat(1)
      .build();
    g.expect.illegal(0, { activate: PILFERER });
  });

  test('from the hand, the battlefield or exile there is none', () => {
    for (const place of ['hand', 'battlefield', 'exile'] as const) {
      const b = scenario().seat(0);
      b[place](PILFERER);
      const g = b.battlefield('Mountain', { count: 4 }).seat(1).build();
      expect(getLegalActions(g.state, 0).filter((a) => a.kind === 'activate')).toEqual([]);
    }
  });

  test('another player’s graveyard is not an option', () => {
    const g = scenario()
      .seat(0)
      .battlefield('Mountain', { count: 4 })
      .seat(1)
      .graveyard(PILFERER)
      .build();
    expect(getLegalActions(g.state, 0).filter((a) => a.kind === 'activate')).toEqual([]);
  });

  test('only at sorcery speed: not in the opponent’s turn, not with something on the stack, not in combat', () => {
    const theirTurn = scenario()
      .seat(0)
      .graveyard(PILFERER)
      .battlefield('Mountain', { count: 4 })
      .seat(1)
      .at('precombatMain', { active: 1 })
      .build();
    expect(getLegalActions(theirTurn.state, 0).filter((a) => a.kind === 'activate')).toEqual([]);

    const stacked = scenario()
      .seat(0)
      .graveyard(PILFERER)
      .hand('Lightning Bolt')
      .battlefield('Mountain', { count: 5 })
      .seat(1)
      .build();
    stacked.act(0).cast('Lightning Bolt', { targets: [{ player: 1 }], pay: true });
    expect(getLegalActions(stacked.state, 0).filter((a) => a.kind === 'activate')).toEqual([]);

    const combat = scenario()
      .seat(0)
      .graveyard(PILFERER)
      .battlefield('Mountain', { count: 4 })
      .battlefield(BLOCKER)
      .seat(1)
      .build();
    combat.advanceTo('declareAttackers', { attack: false });
    expect(getLegalActions(combat.state, 0).filter((a) => a.kind === 'activate')).toEqual([]);
  });

  test('the second main phase is fine', () => {
    const g = encoreGame();
    g.advanceTo('postcombatMain');
    g.expect.legal(0, { activate: PILFERER });
  });
});

describe('the cost: the card is exiled as the ability is activated (CR 118.1, 602.2b)', () => {
  test('the card is in exile while the ability waits on the stack, and the mana is paid', () => {
    const g = encoreGame();
    g.act(0).activate(PILFERER, { pay: true });
    g.expect.stack([`${PILFERER} (ability)`]);
    g.expect.zone(PILFERER, 'exile', { seat: 0 });
    g.expect.noObject(PILFERER, { zone: 'graveyard' });
    g.expect.noEvent({ kind: 'spellCast' });
    expect(g.find({ name: 'Mountain', zone: 'battlefield' }).filter((o) => o.tapped)).toHaveLength(
      4,
    );
    g.expect.invariants();
  });

  test('a cancel before the cost is paid leaves everything as it was', () => {
    const g = encoreGame();
    const before = g.positionHash();
    g.act(0).activate(PILFERER);
    g.act(0).cancel();
    g.expect.position(before);
    g.expect.zone(PILFERER, 'graveyard', { seat: 0 });
  });

  test('the card cannot be used for encore again: it is in exile', () => {
    const g = encoreGame();
    g.act(0).activate(PILFERER, { pay: true });
    g.passAll();
    g.expect.noObject(PILFERER, { zone: 'graveyard' });
    expect(getLegalActions(g.state, 0).filter((a) => a.kind === 'activate')).toEqual([]);
  });
});

describe('resolving it: a token copy for each opponent (CR 702.141a, 707.2, 111.4)', () => {
  test('one opponent, one token that is a copy of the card, with haste, under the controller’s control', () => {
    const g = encoreGame();
    g.act(0).activate(PILFERER, { pay: true });
    g.passAll();
    const [token, ...rest] = tokens(g);
    expect(rest).toEqual([]);
    expect(token?.token?.characteristics).toMatchObject({
      name: PILFERER,
      power: 2,
      toughness: 1,
      subtypes: ['Goblin', 'Pirate'],
    });
    g.expect.zone(PILFERER, 'battlefield', { seat: 0 });
    g.advanceTo('declareAttackers', { attack: false });
    g.expect.canAttack({ name: PILFERER, zone: 'battlefield' }, true); // haste: it has not been there since the turn began
    g.expect.invariants();
  });

  test('the copy has the abilities of the card: a creature that dies makes a Treasure, token or not', () => {
    const g = encoreGame((b) => b.library('Plains'));
    g.act(0).activate(PILFERER, { pay: true });
    g.passAll();
    g.advanceTo('end');
    g.passAll(); // the delayed trigger: sacrifice the token
    expect(tokens(g)).toEqual([]);
    expect(g.find({ name: 'Treasure', zone: 'battlefield', seat: 0 })).toHaveLength(1);
  });

  test('it is a token, so it is not in the graveyard afterwards: only the exiled card remains', () => {
    const g = encoreGame();
    g.act(0).activate(PILFERER, { pay: true });
    g.passAll();
    g.advanceTo('end');
    g.passAll();
    g.expect.noObject(PILFERER, { zone: 'graveyard' });
    g.expect.noObject(PILFERER, { zone: 'battlefield' });
    g.expect.zone(PILFERER, 'exile', { seat: 0 });
  });
});

describe('attacks that opponent this turn if able (CR 508.1d)', () => {
  test('the declaration must include the token: no attackers is refused', () => {
    const g = encoreGame();
    g.act(0).activate(PILFERER, { pay: true });
    g.passAll();
    g.advanceTo('declareAttackers', { attack: false });
    const none = applyAction(g.state, 0, { kind: 'declareAttackers', attacks: [] });
    expect(none.ok).toBe(false);
    const legal = getLegalActions(g.state, 0).filter((a) => a.kind === 'declareAttackers');
    expect(legal.length).toBeGreaterThan(0);
    expect(legal.every((a) => a.kind === 'declareAttackers' && a.attacks.length === 1)).toBe(true);
  });

  test('attacking the opponent: the token deals its damage', () => {
    const g = encoreGame();
    g.act(0).activate(PILFERER, { pay: true });
    g.passAll();
    g.playCombat({ attack: [PILFERER], until: 'postcombatMain' });
    g.expect.life(1, 38);
  });

  test('the requirement and the haste end with the turn', () => {
    const g = scenario()
      .seat(0)
      .graveyard(PILFERER)
      .battlefield('Mountain', { count: 4 })
      .library('Plains', 'Plains', 'Plains')
      .seat(1)
      .library('Plains', 'Plains', 'Plains')
      .build();
    g.act(0).activate(PILFERER, { pay: true });
    g.passAll();
    expect(
      g.state.continuousEffects.filter((e) => e.change.kind === 'mustAttackPlayer'),
    ).toHaveLength(1);
    g.playCombat({ attack: [PILFERER], until: 'postcombatMain' });
    g.advanceTo('upkeep', { turn: 'next' });
    expect(g.state.continuousEffects.filter((e) => e.change.kind === 'mustAttackPlayer')).toEqual(
      [],
    );
    expect(g.state.continuousEffects.filter((e) => e.change.kind === 'grantKeyword')).toEqual([]);
  });

  test('a creature that was not made by encore is not required to attack', () => {
    const g = scenario()
      .seat(0)
      .graveyard(PILFERER)
      .battlefield('Mountain', { count: 4 })
      .battlefield(BLOCKER)
      .seat(1)
      .build();
    g.act(0).activate(PILFERER, { pay: true });
    g.passAll();
    g.advanceTo('declareAttackers', { attack: false });
    // Only the token is forced: the other creature may stay home, the declaration of the token alone is legal.
    const legal = getLegalActions(g.state, 0).filter((a) => a.kind === 'declareAttackers');
    expect(legal.length).toBeGreaterThan(0);
    expect(
      legal.every(
        (a) =>
          a.kind === 'declareAttackers' &&
          a.attacks.some(
            (x) => x.attacker === g.find({ name: PILFERER, zone: 'battlefield' })[0]?.id,
          ),
      ),
    ).toBe(true);
  });
});

describe('sacrifice at the beginning of the next end step (CR 702.141a, 603.7)', () => {
  test('a delayed triggered ability goes on the stack at the end step and sacrifices the token', () => {
    const g = encoreGame();
    g.act(0).activate(PILFERER, { pay: true });
    g.passAll();
    expect(g.state.delayedTriggers).toHaveLength(1);
    g.advanceTo('end');
    g.expect.stack([`${PILFERER} (ability)`]);
    g.expect.zone(PILFERER, 'battlefield', { seat: 0 });
    g.passAll();
    g.expect.noObject(PILFERER, { zone: 'battlefield' });
    expect(g.state.delayedTriggers).toEqual([]);
  });

  test('activated in the second main phase it is sacrificed at the end step of that turn', () => {
    const g = encoreGame();
    g.advanceTo('postcombatMain');
    g.act(0).activate(PILFERER, { pay: true });
    g.passAll();
    g.advanceTo('end');
    g.passAll();
    g.expect.noObject(PILFERER, { zone: 'battlefield' });
  });

  test('a token that left the battlefield before the end step leaves a delayed trigger that does nothing', () => {
    const g = scenario()
      .seat(0)
      .graveyard(PILFERER)
      .battlefield('Mountain', { count: 4 })
      .seat(1)
      .hand('Lightning Bolt')
      .battlefield('Mountain')
      .build();
    g.act(0).activate(PILFERER, { pay: true });
    g.passAll();
    g.pass(0);
    g.act(1).cast('Lightning Bolt', {
      targets: [{ name: PILFERER, zone: 'battlefield' }],
      pay: true,
    });
    g.passAll();
    g.expect.noObject(PILFERER, { zone: 'battlefield' });
    g.advanceTo('end');
    g.passAll();
    g.expect.stack([]);
  });
});

describe('a copy of the card as it was in the graveyard (CR 113.7a, 608.2h)', () => {
  test('a second encore card is a separate ability: the other card in the graveyard keeps its own', () => {
    const g = scenario()
      .seat(0)
      .graveyard(PILFERER, BEAR)
      .battlefield('Mountain', { count: 4 })
      .battlefield('Forest', { count: 2 })
      .seat(1)
      .build();
    g.act(0).activate(BEAR, { pay: true });
    g.passAll();
    expect(tokens(g, BEAR)).toHaveLength(1);
    g.expect.zone(PILFERER, 'graveyard', { seat: 0 });
  });
});

describe('a copy that asks a question as it enters (CR 614.12, 702.136a)', () => {
  test('the token of a card with riot asks, then it is bound to the opponent like any copy', () => {
    const g = scenario()
      .seat(0)
      .graveyard('SYNTHETIC Encore Rioter')
      .battlefield('Mountain', { count: 2 })
      .seat(1)
      .build();
    g.act(0).activate('SYNTHETIC Encore Rioter', { pay: true });
    g.passAll();
    g.expect.pending('chooseOption', 0);
    g.act(0).chooseOption('counter');
    const token = g.find({ name: 'SYNTHETIC Encore Rioter', zone: 'battlefield', seat: 0 })[0];
    expect(token?.token).not.toBeNull();
    expect(token?.counters['+1/+1']).toBe(1);
    expect(
      g.state.continuousEffects.filter((e) => e.change.kind === 'mustAttackPlayer'),
    ).toHaveLength(1);
    expect(g.state.delayedTriggers).toHaveLength(1);
    g.expect.invariants();
  });
});

describe('validation: where encore and the exile cost may stand', () => {
  test('the exile cost is paid from the graveyard or the battlefield, not the hand (D-229)', () => {
    const card = syntheticCard(PILFERER);
    const face = card.faces[0];
    if (face === undefined) throw new Error('no face');
    const bad = {
      ...card,
      faces: [
        {
          ...face,
          abilities: [
            {
              kind: 'activated' as const,
              cost: [{ kind: 'exileThis' as const }],
              functionsIn: 'hand' as const,
              effect: { kind: 'gainLife' as const, player: { kind: 'you' as const }, amount: 1 },
            },
          ],
        },
      ],
    };
    expect(validateCard(bad).map((i) => i.message)).toContain(
      'exileThis is paid from the graveyard or the battlefield, not the hand',
    );
  });

  test('the encore effect belongs to an ability that works from the graveyard', () => {
    const card = syntheticCard(PILFERER);
    const face = card.faces[0];
    if (face === undefined) throw new Error('no face');
    const bad = {
      ...card,
      faces: [
        {
          ...face,
          abilities: [
            {
              kind: 'activated' as const,
              cost: [{ kind: 'tap' as const }],
              effect: { kind: 'encore' as const },
            },
          ],
        },
      ],
    };
    expect(validateCard(bad).some((i) => i.message.includes('encore is the effect'))).toBe(true);
  });

  test('encore is on a permanent card, and its cost is mana without X', () => {
    const card = syntheticCard(PILFERER);
    const face = card.faces[0];
    if (face === undefined) throw new Error('no face');
    const sorcery = {
      ...card,
      faces: [
        {
          ...face,
          types: ['sorcery' as const],
          power: null,
          toughness: null,
          abilities: [],
          spell: null,
        },
      ],
    };
    // A sorcery with only the keyword.
    const withKeyword = {
      ...sorcery,
      faces: [
        {
          ...sorcery.faces[0],
          abilities: [
            {
              kind: 'keyword' as const,
              keyword: {
                kind: 'encore' as const,
                cost: [{ kind: 'mana' as const, symbols: ['R'] }],
              },
            },
          ],
        },
      ],
    };
    expect(
      validateCard(withKeyword as never).some((i) =>
        i.message.includes('encore is on a permanent card'),
      ),
    ).toBe(true);
    const xCost = {
      ...card,
      faces: [
        {
          ...face,
          abilities: [
            {
              kind: 'keyword' as const,
              keyword: {
                kind: 'encore' as const,
                cost: [{ kind: 'mana' as const, symbols: ['X', 'R'] }],
              },
            },
          ],
        },
      ],
    };
    expect(validateCard(xCost).some((i) => i.message.includes('X in an encore cost'))).toBe(true);
    const lifeCost = {
      ...card,
      faces: [
        {
          ...face,
          abilities: [
            {
              kind: 'keyword' as const,
              keyword: { kind: 'encore' as const, cost: [{ kind: 'payLife' as const, amount: 2 }] },
            },
          ],
        },
      ],
    };
    expect(
      validateCard(lifeCost).some((i) => i.message.includes('an encore cost may be mana only')),
    ).toBe(true);
  });
});
