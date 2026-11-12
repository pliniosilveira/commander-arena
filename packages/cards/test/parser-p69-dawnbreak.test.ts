// Stage P69: the Bruna deck program (issue 5), Dawnbreak Reclaimer: "At the beginning of your end step, choose a creature card in an opponent's graveyard, then that player chooses
// a creature card in your graveyard. You may return those cards to the battlefield under their owners' control." (D-951). The line is the real Oracle text of the acceptance card
// of the golden corpus; the others are SYNTHETIC siblings and near misses the grammar must not read. CR 608.2c, 608.2d (who chooses, and what is impossible), 110.2a, 400.3.
import { describe, expect, test } from 'vitest';
import { dropped, readAll } from './parser-p5-helpers';

const TRIGGER = 'At the beginning of your end step, ';
const PAIR = (type = 'creature', article = 'a') =>
  `choose ${article} ${type} card in an opponent's graveyard, then that player chooses ${article} ${type} card in your graveyard. You may return those cards to the battlefield under their owners' control.`;
const RECLAIMER = `Flying\n${TRIGGER}${PAIR()}`;
const EFFECT = { kind: 'returnGraveyardPair', cardType: 'creature' };

describe('Dawnbreak Reclaimer', () => {
  test('flying, and a trigger of your end step with the one effect', () => {
    const parsed = readAll(RECLAIMER, 'creature', ['Angel']);
    expect(parsed.abilities).toEqual([
      { kind: 'keyword', keyword: { kind: 'flying' } },
      { kind: 'triggered', trigger: { kind: 'endStep', whose: 'you' }, effect: EFFECT },
    ]);
  });

  test('it is not optional as a whole: the "you may" is inside the effect, for both cards', () => {
    const parsed = readAll(`${TRIGGER}${PAIR()}`, 'creature');
    expect(JSON.stringify(parsed.abilities)).not.toContain('"optional"');
    expect(JSON.stringify(parsed.abilities)).not.toContain('"kind":"may"');
  });
});

describe('what the wording leaves open stays what the text says (SYNTHETIC)', () => {
  test('the trigger is the one the text names: each opponent’s end step is read as that, never as yours', () => {
    const parsed = readAll(`At the beginning of each opponent's end step, ${PAIR()}`, 'creature');
    expect(parsed.abilities).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'step', step: 'endStep', whose: 'opponent' },
        effect: EFFECT,
      },
    ]);
  });

  test('"each end step" is its own trigger', () => {
    const parsed = readAll(`At the beginning of each end step, ${PAIR()}`, 'creature');
    expect(JSON.stringify(parsed.abilities)).toContain('"whose":"each"');
  });

  test('another card type, with its article, as a sorcery', () => {
    expect(readAll(PAIR('artifact', 'an').replace(/^c/, 'C'), 'sorcery').spell).toEqual({
      effect: { kind: 'returnGraveyardPair', cardType: 'artifact' },
    });
    expect(readAll(PAIR('land').replace(/^c/, 'C'), 'sorcery').spell).toEqual({
      effect: { kind: 'returnGraveyardPair', cardType: 'land' },
    });
  });

  test('a sentence after it is a second instruction, in order', () => {
    const parsed = readAll(`${TRIGGER}${PAIR()} You gain 2 life.`, 'creature');
    expect(parsed.abilities).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'endStep', whose: 'you' },
        effect: {
          kind: 'sequence',
          effects: [EFFECT, expect.objectContaining({ kind: 'gainLife' })],
        },
      },
    ]);
  });
});

describe('near misses are dropped, never guessed (SYNTHETIC)', () => {
  const miss = (text: string) => dropped(`${TRIGGER}${text}`, 'creature').reason;
  const base = PAIR();

  test('a different chooser of the second card', () => {
    expect(miss(base.replace('then that player chooses', 'then you choose'))).toBeDefined();
    expect(
      miss(base.replace('then that player chooses', 'then an opponent chooses')),
    ).toBeDefined();
    expect(
      miss(base.replace('then that player chooses', 'then each opponent chooses')),
    ).toBeDefined();
  });

  test('a different graveyard or player for either choice', () => {
    expect(
      miss(base.replace("an opponent's graveyard", "each opponent's graveyard")),
    ).toBeDefined();
    expect(
      miss(base.replace("an opponent's graveyard", "target opponent's graveyard")),
    ).toBeDefined();
    expect(miss(base.replace("an opponent's graveyard", 'a graveyard'))).toBeDefined();
    expect(miss(base.replace('in your graveyard', 'in their graveyard'))).toBeDefined();
    expect(miss(base.replace('in your graveyard', 'in that graveyard'))).toBeDefined();
    expect(miss(base.replace('in your graveyard', 'in a graveyard'))).toBeDefined();
  });

  test('a different or mixed kind of card, a count, or a word the engine does not name', () => {
    expect(miss(base.replace('a creature card in your', 'an artifact card in your'))).toBeDefined();
    expect(miss(base.replace(/creature card/g, 'nonland card'))).toBeDefined();
    expect(miss(base.replace(/a creature card/g, 'a permanent card'))).toBeDefined();
    expect(miss(base.replace(/a creature card/g, 'two creature cards'))).toBeDefined();
    expect(miss(base.replace(/a creature card/g, 'a creature'))).toBeDefined();
  });

  test('an instant or a sorcery card cannot enter the battlefield (CR 304.4, 307.4), so it is not read', () => {
    expect(miss(PAIR('instant', 'an'))).toBeDefined();
    expect(miss(PAIR('sorcery'))).toBeDefined();
    expect(dropped(PAIR('instant', 'an').replace(/^c/, 'C'), 'sorcery').reason).toBeDefined();
    expect(dropped(PAIR('sorcery').replace(/^c/, 'C'), 'sorcery').reason).toBeDefined();
  });

  test('a mandatory return, another place or control, or a part of them', () => {
    expect(miss(base.replace('You may return', 'Return'))).toBeDefined();
    expect(miss(base.replace("under their owners' control", 'under your control'))).toBeDefined();
    expect(miss(base.replace("under their owners' control", 'tapped'))).toBeDefined();
    expect(miss(base.replace('to the battlefield', 'to your hand'))).toBeDefined();
    expect(miss(base.replace('to the battlefield', 'to their owners’ hands'))).toBeDefined();
    expect(miss(base.replace('those cards', 'one of those cards'))).toBeDefined();
    expect(miss(base.replace('those cards', 'that card'))).toBeDefined();
  });

  test('an optional choice, or the first sentence alone', () => {
    expect(miss(`you may ${base}`)).toBeDefined();
    expect(miss(base.split('. ')[0] ?? base)).toBeDefined();
  });

  test('something added to the return is not dropped silently', () => {
    expect(miss(base.replace(/\.$/, ' and you gain 2 life.'))).toBeDefined();
    expect(miss(base.replace(/\.$/, ', then those creatures gain haste.'))).toBeDefined();
  });
});
