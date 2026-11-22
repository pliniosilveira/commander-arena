/**
 * The companion deck check (SPEC 5.8, CR 702.139). Every deck here is SYNTHETIC; the companion's Oracle text is the real Jegantha wording (data from the golden corpus).
 */
import { describe, expect, test } from 'vitest';
import { selectCompanion } from '../src/decklist/index';
import { parseDecklist } from '../src/index';
import type { StoredCard } from '../src/types';
import {
  COMPANION_BANNED_IN_COMMANDER,
  companionIssues,
  companionsIssues,
  manaSymbolsOf,
  repeatedManaSymbols,
  validateDeck,
} from '../src/validate/index';
import { card, face, fullMain, legend, ONE } from './validate-helpers';

const JEGANTHA_TEXT =
  "Companion — No card in your starting deck has more than one of the same mana symbol in its mana cost. (If this card is your chosen companion, you may put it into your hand from outside the game for {3} as a sorcery.)\n{T}: Add {W}{U}{B}{R}{G}. This mana can't be spent to pay generic mana costs.";

const jegantha = (identity: StoredCard['colorIdentity'] = ['W', 'U', 'B', 'R', 'G']) =>
  legend('Jegantha, the Wellspring', identity, {
    text: JEGANTHA_TEXT,
    manaCost: '{4}{R/G}',
    keywords: ['Companion'],
  });

const commander = (
  cost = '{2}{R}{G}',
  identity: StoredCard['colorIdentity'] = ['W', 'U', 'B', 'R', 'G'],
) => legend('Synthetic Commander', identity, { manaCost: cost });
const spell = (name: string, cost: string) => card(name, { manaCost: cost, typeLine: 'Sorcery' });

const codes = (issues: readonly { code: string }[]) => issues.map((i) => i.code);

function check(companion: StoredCard, cmdr: StoredCard, extras: StoredCard[] = []) {
  return companionIssues({
    companion,
    commanders: [cmdr],
    main: extras.map((c) => ONE(c)),
  });
}

describe('manaSymbolsOf and repeatedManaSymbols', () => {
  test('reads the exact printed symbols', () => {
    expect(manaSymbolsOf(spell('S', '{X}{X}{R}'))).toEqual(['{X}', '{X}', '{R}']);
    expect(repeatedManaSymbols(spell('S', '{X}{X}{R}'))).toEqual(['{X}']);
    expect(repeatedManaSymbols(spell('S', '{R/G}{R/G}'))).toEqual(['{R/G}']);
  });

  test('a hybrid symbol is the same symbol however its parts are written', () => {
    expect(repeatedManaSymbols(spell('S', '{R/G}{G/R}'))).toEqual(['{R/G}']);
    expect(repeatedManaSymbols(spell('S', '{2/W}{W/2}'))).toEqual(['{2/W}']);
  });

  test('different symbols are not repeats: {2} and {1}{1}, {R} and {R/G}, {C} and {1}', () => {
    expect(repeatedManaSymbols(spell('S', '{2}{R}{R/G}'))).toEqual([]);
    expect(repeatedManaSymbols(spell('S', '{C}{1}'))).toEqual([]);
    expect(repeatedManaSymbols(spell('S', '{1}{1}'))).toEqual(['{1}']);
    expect(repeatedManaSymbols(spell('S', ''))).toEqual([]);
  });

  test('a split card has both halves, as separate symbols (CR 709.4b: Fire // Ice has {1} twice)', () => {
    const split = card('Synthetic Left // Synthetic Right', {
      layout: 'split',
      faces: [
        face('Synthetic Left', { manaCost: '{1}{R}' }),
        face('Synthetic Right', { manaCost: '{1}{U}' }),
      ],
    });
    expect(manaSymbolsOf(split)).toEqual(['{1}', '{R}', '{1}', '{U}']);
    expect(repeatedManaSymbols(split)).toEqual(['{1}']);
  });

  test('a split card whose halves share no symbol is fine', () => {
    const split = card('Synthetic Left // Synthetic Right', {
      layout: 'split',
      faces: [
        face('Synthetic Left', { manaCost: '{R}' }),
        face('Synthetic Right', { manaCost: '{U}' }),
      ],
    });
    expect(repeatedManaSymbols(split)).toEqual([]);
  });

  test.each(['transform', 'modal_dfc', 'adventure', 'meld'])(
    'a %s card counts its front face only (CR 712.8a, 715.4)',
    (layout) => {
      const multi = card('Synthetic Front // Synthetic Back', {
        layout,
        faces: [
          face('Synthetic Front', { manaCost: '{1}{R}' }),
          face('Synthetic Back', { manaCost: '{1}{U}' }),
        ],
      });
      expect(manaSymbolsOf(multi)).toEqual(['{1}', '{R}']);
      expect(repeatedManaSymbols(multi)).toEqual([]);
    },
  );
});

describe('companionIssues', () => {
  test('a deck whose cards repeat no symbol passes', () => {
    expect(
      check(jegantha(), commander(), [
        spell('Synthetic A', '{1}{R}{G}'),
        spell('Synthetic B', '{W/U}{B/R}'),
        card('Synthetic Land', { typeLine: 'Land' }),
      ]),
    ).toEqual([]);
  });

  test('{X}{X}{R} fails the condition, and the message names the card and the symbol', () => {
    const issues = check(jegantha(), commander(), [spell('Synthetic Doubler', '{X}{X}{R}')]);
    expect(codes(issues)).toEqual(['companion-condition']);
    expect(issues[0]?.cards).toEqual(['Synthetic Doubler']);
    expect(issues[0]?.message).toContain('Synthetic Doubler ({X})');
  });

  test('{R/G}{R/G} fails the condition (the ruling: exact symbols)', () => {
    const issues = check(jegantha(), commander(), [spell('Synthetic Hybrid', '{R/G}{R/G}')]);
    expect(codes(issues)).toEqual(['companion-condition']);
  });

  test('the same symbol twice in the COMMANDER fails it (CR 702.139b: the starting deck includes it)', () => {
    const issues = check(jegantha(), commander('{3}{R}{R}'), []);
    expect(codes(issues)).toEqual(['companion-condition']);
    expect(issues[0]?.cards).toEqual(['Synthetic Commander']);
  });

  test('a commander with no repeat passes even when every card of the main deck is fine', () => {
    expect(check(jegantha(), commander('{4}{R}{G}'), [])).toEqual([]);
  });

  test('a split card in the deck whose halves repeat a symbol fails it', () => {
    const split = card('Synthetic Left // Synthetic Right', {
      layout: 'split',
      faces: [
        face('Synthetic Left', { manaCost: '{1}{R}' }),
        face('Synthetic Right', { manaCost: '{1}{U}' }),
      ],
    });
    expect(codes(check(jegantha(), commander(), [split]))).toEqual(['companion-condition']);
  });

  test('a transform card in the deck counts its front face only', () => {
    const dfc = card('Synthetic Front // Synthetic Back', {
      layout: 'transform',
      faces: [
        face('Synthetic Front', { manaCost: '{1}{R}' }),
        face('Synthetic Back', { manaCost: '{1}{R}' }),
      ],
    });
    expect(check(jegantha(), commander(), [dfc])).toEqual([]);
  });

  test('a companion outside the commander color identity is refused', () => {
    expect(codes(check(jegantha(), commander()))).toEqual([]);
    const narrow = legend('Synthetic Narrow Companion', ['W'], {
      text: JEGANTHA_TEXT,
      keywords: ['Companion'],
    });
    const off = check(jegantha(), commander('{2}{R}{G}', ['R', 'G']));
    expect(codes(off)).toEqual(['companion-color-identity']);
    expect(off[0]?.message).toContain('WUB');
    expect(codes(check(narrow, commander('{2}{R}{G}', ['R', 'G'])))).toEqual([
      'companion-color-identity',
    ]);
  });

  test('with two commanders the identities combine', () => {
    const second = legend('Synthetic Partner', ['W'], { manaCost: '{W}' });
    const narrow = legend('Synthetic Narrow Companion', ['W'], {
      text: JEGANTHA_TEXT,
      keywords: ['Companion'],
    });
    const first = commander('{2}{R}{G}', ['R', 'G']);
    const issues = companionIssues({ companion: narrow, commanders: [first, second], main: [] });
    expect(issues).toEqual([]);
  });

  test('the banned companion is refused by name, and the list is data of its own', () => {
    expect(COMPANION_BANNED_IN_COMMANDER).toEqual(['Lutri, the Spellchaser']);
    const lutri = legend('Lutri, the Spellchaser', ['R', 'G'], {
      text: JEGANTHA_TEXT,
      keywords: ['Companion'],
    });
    expect(codes(check(lutri, commander()))).toEqual(['companion-banned']);
  });

  test('a card without the companion ability is refused', () => {
    const issues = check(legend('Synthetic Plain', ['R']), commander());
    expect(codes(issues)).toEqual(['companion-ability']);
  });

  test('a companion whose condition the engine does not know is refused, not guessed', () => {
    const other = legend('Synthetic Other Companion', ['R'], {
      text: 'Companion — SYNTHETIC unknown condition.',
      keywords: ['Companion'],
    });
    expect(codes(check(other, commander()))).toEqual(['companion-condition-unsupported']);
  });

  test('two companions are refused', () => {
    const issues = companionsIssues([jegantha(), jegantha()], {
      commanders: [commander()],
      main: [],
    });
    expect(codes(issues)).toEqual(['companion-count']);
    expect(companionsIssues([jegantha()], { commanders: [commander()], main: [] })).toEqual([]);
    expect(companionsIssues([], { commanders: [commander()], main: [] })).toEqual([]);
  });
});

describe('validateDeck with a companion', () => {
  const cmdr = commander();
  const main = fullMain(1);

  test('without a companion the result does not change', () => {
    const without = validateDeck({ commanders: [cmdr], main });
    expect(without.issues.some((i) => i.code.startsWith('companion'))).toBe(false);
  });

  test('a fulfilled companion adds no issue and does not count toward the 100 cards', () => {
    const result = validateDeck({ commanders: [cmdr], main, companion: jegantha() });
    expect(result.ok).toBe(true);
    expect(result.issues.some((i) => i.code === 'deck-size')).toBe(false);
  });

  test('an unfulfilled companion makes the deck invalid', () => {
    const result = validateDeck({
      commanders: [cmdr],
      main: fullMain(1, [ONE(spell('Synthetic Doubler', '{X}{X}{R}'))]),
      companion: jegantha(),
    });
    expect(result.ok).toBe(false);
    expect(result.issues.map((i) => i.code)).toContain('companion-condition');
  });
});

describe('a decklist with a Companion section', () => {
  test('yields exactly one companion entry', () => {
    const parsed = parseDecklist(
      'Commander\n1 Synthetic Commander\n\nDeck\n1 Synthetic A\n\nCompanion\n1 Jegantha, the Wellspring\n',
    );
    const selection = selectCompanion(parsed);
    expect(selection.entry?.name).toBe('Jegantha, the Wellspring');
    expect(selection.extra).toEqual([]);
    expect(selection.issues).toEqual([]);
  });

  test('no Companion section means no companion', () => {
    const selection = selectCompanion(parseDecklist('Deck\n1 Synthetic A\n'));
    expect(selection).toEqual({ entry: null, extra: [], issues: [] });
  });

  test('more than one companion line is reported', () => {
    const selection = selectCompanion(
      parseDecklist('Companion\n1 Jegantha, the Wellspring\n1 Synthetic Other\n'),
    );
    expect(selection.entry?.name).toBe('Jegantha, the Wellspring');
    expect(selection.extra.map((e) => e.name)).toEqual(['Synthetic Other']);
    expect(selection.issues.map((i) => i.code)).toEqual(['companion-count']);
  });

  test('a count above one is reported', () => {
    const selection = selectCompanion(parseDecklist('Companion\n2 Jegantha, the Wellspring\n'));
    expect(selection.issues.map((i) => i.code)).toEqual(['companion-count']);
  });
});
