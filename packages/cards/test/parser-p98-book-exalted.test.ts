// Stage P69 (D-276): the Bruna deck program (issue 5), The Book of Exalted Deeds: an object gains a static ability for good, "It gains \"You can't lose the game and
// your opponents can't win the game.\"" (CR 611.2a, 613.1f, 104.3), and the "Activate only as a sorcery" that follows a sentence that ends with a quote. The lines
// are the real Oracle text of the acceptance card of the golden corpus, with the nodes the grammar produces; the other lines are SYNTHETIC siblings and the near
// misses the grammar must not read.
import { describe, expect, test } from 'vitest';
import { splitSentences } from '../src/convert/parser/segment';
import { dropped, read, readAll } from './parser-p5-helpers';

const T1 = { kind: 'target', id: 't1' } as const;
const ANGEL_TARGET = [
  { id: 't1', what: { kind: 'object', filter: { zone: 'battlefield', subtypes: ['Angel'] } } },
] as const;
const PROTECTION = [
  { kind: 'static', static: { kind: 'cantLoseGame' } },
  { kind: 'static', static: { kind: 'opponentsCantWin' } },
] as const;
const COST = [{ kind: 'mana', symbols: ['W', 'W', 'W'] }, { kind: 'tap' }, { kind: 'exileThis' }];
const QUOTE = '"You can\'t lose the game and your opponents can\'t win the game."';

describe('The Book of Exalted Deeds', () => {
  test('the first ability is the life trigger', () => {
    const parsed = readAll(
      'At the beginning of your end step, if you gained 3 or more life this turn, create a 3/3 white Angel creature token with flying.',
      'artifact',
    );
    expect(parsed.abilities).toHaveLength(1);
    expect(parsed.abilities[0]).toMatchObject({ kind: 'triggered' });
  });

  test('the second ability: a counter, the grant with no duration, and sorcery timing', () => {
    const parsed = readAll(
      `{W}{W}{W}, {T}, Exile ~: Put an enlightened counter on target Angel. It gains ${QUOTE} Activate only as a sorcery.`,
      'artifact',
    );
    expect(parsed.abilities).toEqual([
      {
        kind: 'activated',
        cost: COST,
        targets: ANGEL_TARGET,
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'addCounters', objects: T1, counter: 'enlightened', count: 1 },
            { kind: 'grantAbility', objects: T1, abilities: PROTECTION, duration: 'permanent' },
          ],
        },
        timing: 'sorcery',
      },
    ]);
  });

  test('the whole card reads: two abilities', () => {
    const parsed = readAll(
      `At the beginning of your end step, if you gained 3 or more life this turn, create a 3/3 white Angel creature token with flying.\n{W}{W}{W}, {T}, Exile ~: Put an enlightened counter on target Angel. It gains ${QUOTE} Activate only as a sorcery.`,
      'artifact',
    );
    expect(parsed.abilities.map((a) => a.kind)).toEqual(['triggered', 'activated']);
  });
});

describe('the grant of a static ability with no duration (D-276)', () => {
  test('a target says it, without a counter, at instant speed (SYNTHETIC)', () => {
    const parsed = readAll(`{T}: Target Angel gains ${QUOTE}`, 'artifact');
    expect(parsed.abilities).toEqual([
      {
        kind: 'activated',
        cost: [{ kind: 'tap' }],
        targets: ANGEL_TARGET,
        effect: { kind: 'grantAbility', objects: T1, abilities: PROTECTION, duration: 'permanent' },
      },
    ]);
  });

  test('a spell may give it too (SYNTHETIC)', () => {
    const parsed = readAll(`Target creature gains ${QUOTE}`, 'instant');
    expect(parsed.spell?.effect).toMatchObject({
      kind: 'grantAbility',
      duration: 'permanent',
      abilities: PROTECTION,
    });
  });

  test('each half alone is its own ability (SYNTHETIC)', () => {
    const lose = readAll('{T}: Target Angel gains "You can\'t lose the game."', 'artifact');
    expect(JSON.stringify(lose.abilities)).toContain(
      '"abilities":[{"kind":"static","static":{"kind":"cantLoseGame"}}]',
    );
    const win = readAll(
      '{T}: Target Angel gains "Your opponents can\'t win the game."',
      'artifact',
    );
    expect(JSON.stringify(win.abilities)).toContain(
      '"abilities":[{"kind":"static","static":{"kind":"opponentsCantWin"}}]',
    );
  });

  test('"that creature" and "it" name the target of the instruction before (SYNTHETIC)', () => {
    for (const subject of ['It', 'That creature']) {
      const parsed = readAll(
        `{T}: Put a +1/+1 counter on target Angel. ${subject} gains ${QUOTE}`,
        'artifact',
      );
      expect(JSON.stringify(parsed.abilities), subject).toContain(
        '"kind":"grantAbility","objects":{"kind":"target","id":"t1"}',
      );
    }
  });

  test('the near misses are not read (SYNTHETIC)', () => {
    const refused = [
      // a duration the engine does not run for this grant
      `{T}: Target Angel gains ${QUOTE} until end of turn`,
      `{T}: Until end of turn, target Angel gains ${QUOTE}`,
      // "has" is a state, not a change
      `{T}: Target Angel has ${QUOTE}`,
      // a group, another number, the source
      `{T}: Creatures you control gain ${QUOTE}`,
      `{T}: Each Angel you control gains ${QUOTE}`,
      `{T}: Target Angels gain ${QUOTE}`,
      `{T}: ~ gains ${QUOTE}`,
      // "it" with no instruction before it that chose an object
      `{T}: It gains ${QUOTE}`,
      `{T}: Draw a card. It gains ${QUOTE}`,
      `{T}: You gain 1 life. It gains ${QUOTE}`,
      // after the instruction that destroyed, exiled or returned the target "it" is a new object or a card elsewhere (CR 400.7)
      `{T}: Return target Angel card from your graveyard to the battlefield. It gains ${QUOTE}`,
      `{T}: Exile target Angel you control, then return it to the battlefield under your control. It gains ${QUOTE}`,
      `{T}: Destroy target Angel. It gains ${QUOTE}`,
      `{T}: Exile target Angel. It gains ${QUOTE}`,
      // a token the text made is a new object, not a target
      `{T}: Create a 3/3 white Angel creature token with flying. It gains ${QUOTE}`,
      `{T}: Create a 3/3 white Angel creature token with flying. That token gains ${QUOTE}`,
      // after a target, a token the text made is what "it" and "that creature" name, not the target (CR 111.1)
      `{T}: Put a +1/+1 counter on target Angel. Create a 3/3 white Angel creature token with flying. It gains ${QUOTE}`,
      `{T}: Put a +1/+1 counter on target Angel. Create a 3/3 white Angel creature token with flying. That creature gains ${QUOTE}`,
      `{T}: Put a +1/+1 counter on target Angel. Create a Treasure token. It gains ${QUOTE}`,
      `{T}: Put a +1/+1 counter on target Angel. Investigate. It gains ${QUOTE}`,
      `{T}: Put a +1/+1 counter on target Angel. Create a token that's a copy of target Angel. It gains ${QUOTE}`,
      // the object of a trigger is not a target the grant could fix
      `Whenever a creature you control dies, it gains ${QUOTE}`,
      // another static ability, or an ability that is not static
      '{T}: Target Angel gains "You have hexproof."',
      '{T}: Target Angel gains "Creatures you control get +1/+1."',
      '{T}: Target Angel gains "You can\'t lose the game as long as you control a Dragon."',
      '{T}: Target Angel gains "{T}: You gain 1 life."',
      '{T}: Target Angel gains "Whenever ~ attacks, you gain 1 life."',
      '{T}: Target Angel gains "Draw a card."',
      // other words around the quote
      `{T}: Target Angel gains ${QUOTE} and flying until end of turn`,
      `{T}: Target Angel gains flying and ${QUOTE}`,
      `{T}: Put a +1/+1 counter on target Angel. It gains ${QUOTE} Draw a card.`,
      '{T}: Target Angel gains "You can\'t lose the game and your opponents can\'t win the game"',
      // the other player of the same words
      '{T}: Target player gains "You can\'t lose the game."',
      '{T}: You gain "You can\'t lose the game."',
    ];
    for (const line of refused) {
      // Every line that does not end with a quote ends with its period, so none is refused for the missing one.
      const text = line.endsWith('"') || line.endsWith('.') ? line : `${line}.`;
      const parsed = read(text, 'artifact');
      expect(parsed.unparsed.length, text).toBeGreaterThan(0);
      expect(JSON.stringify(parsed.abilities), text).not.toContain('grantAbility');
    }
  });

  test('a grant that the engine does not run is reported as such, not as unread text (SYNTHETIC)', () => {
    const hexproof = dropped('{T}: Target Angel gains "You have hexproof."', 'artifact');
    expect(hexproof.closestRule).toBe('effect.gain-static-ability');
    expect(hexproof.reason).not.toBe('unrecognised');
  });

  test('the keyword grants with a duration read as before', () => {
    const parsed = readAll('{T}: Target Angel gains flying until end of turn.', 'artifact');
    expect(JSON.stringify(parsed.abilities)).toContain('grantKeyword');
  });
});

describe('"Activate only as a sorcery" after a sentence that ends with a quote (D-276)', () => {
  const slice = (t: string, s: { start: number; end: number }) => t.slice(s.start, s.end);

  test('the restriction is a sentence of its own', () => {
    const t = `Put a counter on target Angel. It gains ${QUOTE} Activate only as a sorcery.`;
    expect(splitSentences(t, 0, t.length).map((s) => slice(t, s))).toEqual([
      'Put a counter on target Angel.',
      `It gains ${QUOTE}`,
      'Activate only as a sorcery.',
    ]);
  });

  test('"This ability costs {1} less to activate" too (CR 601.2f)', () => {
    const t = `It gains ${QUOTE} This ability costs {1} less to activate if you control an Angel.`;
    expect(splitSentences(t, 0, t.length)).toHaveLength(2);
  });

  test('any other text after a quote stays in the sentence, as before (SYNTHETIC)', () => {
    const t = 'Create a token with "Draw a card. Gain 1 life." Draw a card.';
    expect(splitSentences(t, 0, t.length).map((s) => slice(t, s))).toEqual([t]);
  });

  test('a quote that does not end with a period is not an end (SYNTHETIC)', () => {
    const t = 'It gains "flying" Activate only as a sorcery.';
    expect(splitSentences(t, 0, t.length)).toHaveLength(1);
  });

  test('the restriction stays the restriction: only as a sorcery and the other restrictions read as before', () => {
    const parsed = readAll(
      `{T}: Put a +1/+1 counter on target Angel. It gains ${QUOTE} Activate only as a sorcery.`,
      'artifact',
    );
    expect(parsed.abilities[0]).toMatchObject({ timing: 'sorcery' });
    // "only once each turn" is a restriction the engine does not run on its own: the line stays unread
    const twice = read(
      `{T}: Put a +1/+1 counter on target Angel. It gains ${QUOTE} Activate only as a sorcery and only once each turn.`,
      'artifact',
    );
    expect(twice.unparsed.length).toBeGreaterThan(0);
  });
});
