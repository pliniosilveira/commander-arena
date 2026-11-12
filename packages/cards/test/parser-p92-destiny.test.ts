// D-269: the Bruna deck program (issue 5), Angel of Destiny. The lines are the real Oracle text of the acceptance card of the golden corpus, with the nodes the grammar
// produces; the other lines are SYNTHETIC siblings and the near misses the grammar must not read: "loses the game" of any other player word, "each player ~ attacked this
// turn" in another place, another verb or another span, "you and that player" with no player behind "that player".
import { describe, expect, test } from 'vitest';
import { dropped, read, readAll } from './parser-p5-helpers';

const YOU = { kind: 'you' } as const;
const FIFTEEN_ABOVE = {
  kind: 'lifeTotal',
  compare: { cmp: 'atLeast', value: 15 },
  aboveStarting: true,
} as const;
const ATTACKED = { kind: 'attackedPlayers', of: { kind: 'this' } } as const;

const GAIN_LINE =
  'Whenever a creature you control deals combat damage to a player, you and that player each gain that much life.';
const LOSS_LINE =
  'At the beginning of your end step, if you have at least 15 life more than your starting life total, each player this creature attacked this turn loses the game.';

describe('Angel of Destiny', () => {
  test('flying, double strike, the shared gain and the loss', () => {
    const parsed = readAll(`Flying, double strike\n${GAIN_LINE}\n${LOSS_LINE}`, 'creature', [
      'Angel',
      'Cleric',
    ]);
    expect(parsed.abilities).toEqual([
      { kind: 'keyword', keyword: { kind: 'flying' } },
      { kind: 'keyword', keyword: { kind: 'doubleStrike' } },
      {
        kind: 'triggered',
        trigger: {
          kind: 'dealsCombatDamage',
          what: { types: ['creature'], controller: 'you' },
          to: 'player',
        },
        effect: {
          kind: 'gainLife',
          player: { kind: 'all', of: [YOU, { kind: 'triggerPlayer' }] },
          amount: { kind: 'triggerDamage' },
        },
      },
      {
        kind: 'triggered',
        trigger: { kind: 'endStep', whose: 'you' },
        effect: { kind: 'loseGame', player: ATTACKED },
        interveningIf: FIFTEEN_ABOVE,
      },
    ]);
  });

  test('the name of the card and "this permanent" are the same permanent as "this creature" (SYNTHETIC)', () => {
    for (const who of ['this permanent', 'SYNTHETIC Card']) {
      const parsed = readAll(
        `At the beginning of your end step, each player ${who} attacked this turn loses the game.`,
        'creature',
      );
      expect(parsed.abilities, who).toMatchObject([
        { kind: 'triggered', effect: { kind: 'loseGame', player: ATTACKED } },
      ]);
    }
  });
});

describe('"you and that player each" (D-269)', () => {
  test('the player the trigger is about (SYNTHETIC siblings)', () => {
    const draw = readAll(
      'Whenever a creature you control deals combat damage to a player, you and that player each draw a card.',
      'creature',
    );
    expect(draw.abilities).toMatchObject([
      {
        effect: { kind: 'draw', player: { kind: 'all', of: [YOU, { kind: 'triggerPlayer' }] } },
      },
    ]);
    const batch = readAll(
      'Whenever one or more creatures you control deal combat damage to a player, you and that player each gain 1 life.',
      'creature',
    );
    expect(batch.abilities).toMatchObject([
      {
        trigger: { kind: 'combatDamageBatch' },
        effect: { player: { kind: 'all', of: [YOU, { kind: 'triggerPlayer' }] }, amount: 1 },
      },
    ]);
    const opponents = readAll(
      "At the beginning of each opponent's end step, you and that player each draw a card.",
      'creature',
    );
    expect(opponents.abilities).toMatchObject([
      { effect: { player: { kind: 'all', of: [YOU, { kind: 'triggerPlayer' }] } } },
    ]);
  });

  test('a player the spell targets (SYNTHETIC)', () => {
    const parsed = readAll(
      'Target opponent loses 2 life. You and that player each draw a card.',
      'instant',
    );
    expect(parsed.spell).toMatchObject({
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'loseLife' },
          {
            kind: 'draw',
            player: { kind: 'all', of: [YOU, { kind: 'target', id: 't1' }] },
          },
        ],
      },
    });
  });

  test('"that player" with no player behind it, or the same player as "you", is not read (SYNTHETIC)', () => {
    // a trigger that is about no player
    expect(
      dropped('Whenever ~ dies, you and that player each draw a card.', 'creature').reason,
    ).toBe('unboundReference');
    // the damaged creature is not a player
    expect(
      dropped(
        'Whenever a creature you control deals combat damage to a creature, you and that player each draw a card.',
        'creature',
      ).reason,
    ).toBe('unboundReference');
    // an instruction with no earlier player: "you" is not who "that player" points back to
    expect(
      dropped('You gain 2 life. You and that player each draw a card.', 'instant').needs,
    ).toEqual(['selector:bound']);
    // "that player" is you in your own step and when you gained the life: "you and you" is not what the text says
    for (const text of [
      'At the beginning of your end step, you and that player each draw a card.',
      'Whenever you gain life, you and that player each gain 1 life.',
    ]) {
      expect(read(text, 'creature').abilities, text).toEqual([]);
      expect(dropped(text, 'creature').reason, text).toBeDefined();
    }
  });

  test('the other words around the list stay unread (SYNTHETIC)', () => {
    for (const text of [
      'Whenever a creature you control deals combat damage to a player, you and that player gain that much life.',
      'Whenever a creature you control deals combat damage to a player, that player and you each gain that much life.',
      'Whenever a creature you control deals combat damage to a player, you and those players each gain that much life.',
      'Whenever a creature you control deals combat damage to a player, you and that creature each gain that much life.',
    ]) {
      expect(read(text, 'creature').abilities, text).toEqual([]);
    }
  });
});

describe('"loses the game" (D-269, CR 104.3e)', () => {
  test('each opponent, one player, the player of the trigger (SYNTHETIC)', () => {
    const each = readAll(
      'At the beginning of your end step, each opponent loses the game.',
      'creature',
    );
    expect(each.abilities).toMatchObject([
      { kind: 'triggered', effect: { kind: 'loseGame', player: { kind: 'eachOpponent' } } },
    ]);
    const hit = readAll(
      'Whenever a creature you control deals combat damage to a player, that player loses the game.',
      'creature',
    );
    expect(hit.abilities).toMatchObject([
      { effect: { kind: 'loseGame', player: { kind: 'triggerPlayer' } } },
    ]);
    const target = readAll('Target opponent loses the game.', 'instant');
    expect(target.spell).toMatchObject({
      targets: [{ id: 't1', what: { kind: 'player', filter: 'opponent' } }],
      effect: { kind: 'loseGame', player: { kind: 'target', id: 't1' } },
    });
    const both = readAll('Target opponent loses 3 life and loses the game.', 'instant');
    expect(both.spell).toMatchObject({
      effect: { kind: 'sequence', effects: [{ kind: 'loseLife' }, { kind: 'loseGame' }] },
    });
  });

  test('"you lose the game" is read too: the effect is not limited to other players (CR 104.3e)', () => {
    const upkeep = readAll('At the beginning of your upkeep, you lose the game.', 'creature');
    expect(upkeep.abilities).toMatchObject([
      { kind: 'triggered', effect: { kind: 'loseGame', player: { kind: 'you' } } },
    ]);
    const dies = readAll('Whenever a creature dies, you lose the game.', 'creature');
    expect(dies.abilities).toMatchObject([
      { kind: 'triggered', effect: { kind: 'loseGame', player: { kind: 'you' } } },
    ]);
  });

  test('the near misses are not read (SYNTHETIC)', () => {
    for (const text of [
      // winning is another thing: the engine ends a game only by losses and the last player left
      'At the beginning of your end step, you win the game.',
      'At the beginning of your end step, if you have at least 15 life more than your starting life total, you win the game.',
      'At the beginning of your end step, each opponent wins the game.',
      // a loss that waits, or is a "can't", is not an instant loss
      'At the beginning of your end step, each opponent loses the game at the beginning of the next turn.',
      'At the beginning of your end step, each opponent loses the game if able.',
      'At the beginning of your end step, each opponent loses the games.',
      'At the beginning of your end step, each opponent loses game.',
      'At the beginning of your end step, each opponent lose the game.',
      'At the beginning of your end step, you loses the game.',
      // a list of players says "each lose", which the grammar of a list does not read for this verb
      'At the beginning of your end step, you and target opponent each lose the game.',
      // a second instruction after it that names a player
      'At the beginning of your end step, each opponent loses the game. That player gains 2 life.',
    ]) {
      expect(read(text, 'creature').abilities, text).toEqual([]);
    }
  });
});

describe('"each player this creature attacked this turn" (D-269, CR 508.6)', () => {
  test('is the player of any player verb, said of the permanent of the ability (SYNTHETIC)', () => {
    const life = readAll(
      'At the beginning of your end step, each player ~ attacked this turn loses 2 life.',
      'creature',
    );
    expect(life.abilities).toMatchObject([
      { effect: { kind: 'loseLife', player: ATTACKED, amount: 2 } },
    ]);
    const hit = readAll(
      'Whenever a creature you control deals combat damage to a player, each player ~ attacked this turn loses the game.',
      'creature',
    );
    expect(hit.abilities).toMatchObject([{ effect: { kind: 'loseGame', player: ATTACKED } }]);
    const permanent = readAll('{T}: Each player ~ attacked this turn loses the game.', 'creature');
    expect(permanent.abilities).toMatchObject([{ kind: 'activated' }]);
  });

  test('a spell has attacked nothing: not read (SYNTHETIC)', () => {
    const spell = dropped('Each player ~ attacked this turn loses the game.', 'instant');
    expect(spell.reason).toBe('notRunnable');
  });

  test('another verb, another span or another group is not read (SYNTHETIC)', () => {
    for (const text of [
      'each player ~ attacked loses the game',
      'each player ~ attacked this combat loses the game',
      'each player ~ attacked last turn loses the game',
      'each player ~ attacks this turn loses the game',
      'each player ~ is attacking loses the game',
      'each opponent ~ attacked this turn loses the game',
      'each player that attacked this turn loses the game',
      'each player a creature attacked this turn loses the game',
      'each player ~ attacked this turn with a creature loses the game',
    ]) {
      expect(
        read(`At the beginning of your end step, ${text}.`, 'creature').abilities,
        text,
      ).toEqual([]);
    }
  });

  test('a later "that player" does not point at an earlier player: the group has no one player (SYNTHETIC)', () => {
    const parsed = read(
      'At the beginning of your end step, each player ~ attacked this turn loses 2 life. That player gains 2 life.',
      'creature',
    );
    expect(parsed.abilities).toEqual([]);
    expect(parsed.unparsed[0]?.needs).toEqual(['selector:bound']);
  });

  test('damage and "may" are not read for it (SYNTHETIC)', () => {
    for (const text of [
      'At the beginning of your end step, ~ deals 2 damage to each player ~ attacked this turn.',
      'At the beginning of your end step, each player ~ attacked this turn may draw a card.',
      'At the beginning of your end step, each player ~ attacked this turn becomes the monarch.',
    ]) {
      expect(read(text, 'creature').abilities, text).toEqual([]);
    }
  });
});
