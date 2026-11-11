// The SYNTHETIC template corpus of stage P4: Kicker, Flashback, "if ~ was kicked", the intervening
// "if" of a triggered ability, the host type of an attached subject, and Food and Clue. Each line is
// a template written after a real shape of the backlog (reports/backlog.md and the templates behind
// it; the count is in the note, as the report prints it) or marked SYNTHETIC; none is a real card's
// text. Each line says whether it must import as supported, or where and why it stops, so a change
// that makes the grammar read less OR more than it should fails here. The kinds of expectation are
// those of convert-grammar-corpus.test.ts.
import { describe, expect, test } from 'vitest';
import { type Line, no, OK, runCorpus } from './convert-grammar-corpus-helpers';

const NOT_RUNNABLE = { reason: 'notRunnable' } as const;

const KICKER: readonly Line[] = [
  {
    kind: 'sorcery',
    text: 'Kicker {1}{B}\nDraw a card.',
    expect: OK,
    note: 'backlog: Kicker {M} 187 cards',
  },
  {
    kind: 'sorcery',
    text: 'Kicker—Pay 3 life\nDraw a card.',
    expect: OK,
    note: 'SYNTHETIC; a life kicker cost',
  },
  {
    kind: 'sorcery',
    text: 'Kicker {2}\n~ deals 2 damage to target creature. If ~ was kicked, it deals 4 damage instead.',
    expect: OK,
    note: 'SYNTHETIC; the pair merges into one conditional',
  },
  {
    kind: 'instant',
    text: 'Kicker {1}\nYou gain 2 life. If ~ was kicked, draw a card.',
    expect: OK,
    note: 'SYNTHETIC; a sentence only a kicked spell adds',
  },
  {
    kind: 'sorcery',
    text: 'Kicker {3}\nDraw a card. If ~ was kicked, you gain 4 life instead.',
    expect: OK,
    note: 'SYNTHETIC; "instead" with a full sentence',
  },
  {
    kind: 'creature',
    text: 'Kicker {2}\nWhen ~ enters, if it was kicked, put two +1/+1 counters on ~.',
    expect: OK,
    note: 'SYNTHETIC; an intervening if that does not trigger when unkicked',
  },
  {
    kind: 'creature',
    text: 'Kicker {2}\nWhen ~ enters, if ~ was kicked, you gain 3 life.',
    expect: OK,
    note: 'SYNTHETIC',
  },
  {
    kind: 'creature',
    text: 'Kicker {2}\nWhen ~ enters, you gain 1 life. If ~ was kicked, you gain 5 life instead.',
    expect: OK,
    note: 'SYNTHETIC; a conditional inside a triggered ability',
  },
  {
    kind: 'sorcery',
    text: 'Multikicker {1}{G}\nDraw a card.',
    expect: OK,
    note: 'backlog: Multikicker {M} 19 cards; read since stage P17 (the engine asks how many times, D-110)',
  },
  {
    kind: 'sorcery',
    text: 'Kicker {W} and/or {B}\nDraw a card.',
    expect: no('Kicker {W} and/or {B}', 'keyword.kicker-and-or', NOT_RUNNABLE),
    note: 'SYNTHETIC; two kicker costs (CR 702.33b)',
  },
  {
    kind: 'sorcery',
    text: 'Kicker—Sacrifice a creature\nDraw a card.',
    expect: no('Kicker—Sacrifice a creature', 'keyword.kicker', NOT_RUNNABLE),
    note: 'SYNTHETIC; the engine pays mana and life for kicker, nothing else',
  },
  {
    kind: 'sorcery',
    text: 'Kicker {X}\nDraw a card.',
    expect: no('{X}', 'keyword.kicker'),
    note: 'SYNTHETIC',
  },
  {
    kind: 'sorcery',
    text: 'Draw a card. If ~ was kicked, draw a card.',
    expect: { engine: 'needs a kicker ability' },
    note: 'SYNTHETIC; read, and the engine refuses a kicked condition with no kicker (CR 702.33d)',
  },
  {
    kind: 'sorcery',
    text: 'Kicker {2}\nDraw a card. If ~ was kicked, destroy target creature.',
    expect: OK,
    note: "SYNTHETIC; read since stage P38 (D-182): a target only a kicked spell would have is the engine's `ifKicked` slot (CR 702.33g)",
  },
  {
    kind: 'sorcery',
    text: 'Kicker {2}\nIf ~ was kicked, draw a card instead.',
    expect: no('If ~ was kicked, draw a card instead.', 'effect.draw', NOT_RUNNABLE),
    note: 'SYNTHETIC; nothing before it to replace',
  },
  {
    kind: 'sorcery',
    text: 'Kicker {2}\nYou gain 2 life and draw a card. If ~ was kicked, draw three cards instead.',
    expect: no('If ~ was kicked, draw three cards instead.', 'effect.draw', NOT_RUNNABLE),
    note: 'SYNTHETIC; it would drop one of the two instructions before it',
  },
  {
    kind: 'sorcery',
    text: 'Kicker {2}\nDraw a card. If ~ was kicked, it deals 4 damage instead.',
    expect: no('If ~ was kicked, it deals 4 damage instead.', 'effect.damage-it', NOT_RUNNABLE),
    note: 'SYNTHETIC; "it deals" replaces a damage sentence, nothing else',
  },
  {
    kind: 'sorcery',
    text: 'It deals 2 damage.',
    expect: no('It deals 2 damage.', 'effect.damage-it', NOT_RUNNABLE),
    note: 'SYNTHETIC; "it" has nothing to mean',
  },
  {
    kind: 'sorcery',
    text: 'Draw a card instead.',
    expect: no('instead.', 'effect.draw'),
    note: 'SYNTHETIC; "instead" needs an "if" before it',
  },
  {
    kind: 'sorcery',
    text: 'If you control two or more creatures, draw a card.',
    expect: OK,
    note: "SYNTHETIC; read since stage P32 (D-147): a count of permanents may start a sentence (the engine's `controlsAtLeast`)",
  },
  {
    kind: 'creature',
    text: 'Kicker {2}\nIf ~ was kicked, it enters with two +1/+1 counters on it.',
    expect: no(
      'If ~ was kicked, it enters with two +1/+1 counters on it.',
      'replacement.enters-with-counters-kicked',
      NOT_RUNNABLE,
    ),
    note: 'SYNTHETIC; the engine has no conditional replacement',
  },
  {
    kind: 'creature',
    text: 'Kicker {1}\n~ enters with a charge counter on it for each time it was kicked.',
    expect: no('for each time it was kicked.', 'replacement.enters-with-counters'),
    note: 'backlog: 1 card',
  },
];

const FLASHBACK: readonly Line[] = [
  {
    kind: 'instant',
    text: 'Destroy target creature.\nFlashback {2}{B}',
    expect: OK,
    note: 'backlog: Flashback {M} 189 cards',
  },
  {
    kind: 'sorcery',
    text: 'Draw a card.\nFlashback {4}{U}',
    expect: OK,
    note: 'backlog: Flashback {M}',
  },
  {
    kind: 'sorcery',
    text: 'Kicker {1}\n~ deals 1 damage to each opponent. If ~ was kicked, it deals 3 damage instead.\nFlashback {2}{R}',
    expect: OK,
    note: 'SYNTHETIC; kicker and flashback on one card',
  },
  {
    kind: 'sorcery',
    text: 'Draw a card.\nFlashback—{1}{U}, Pay 3 life.',
    expect: no('Flashback—{1}{U}, Pay 3 life.', 'keyword.flashback', NOT_RUNNABLE),
    note: 'SYNTHETIC; the engine pays a mana cost for flashback, nothing else',
  },
  {
    kind: 'sorcery',
    text: 'Draw a card.\nFlashback—Sacrifice three creatures.',
    expect: no('Flashback—Sacrifice three creatures.', 'keyword.flashback', NOT_RUNNABLE),
    note: 'backlog: Flashback—Sacrifice N creatures. 1 card (the dash form ends with a period)',
  },
  {
    kind: 'sorcery',
    text: 'Draw a card.\nFlashback—Sacrifice a creature',
    expect: no('Flashback—Sacrifice a creature', 'keyword.flashback', NOT_RUNNABLE),
    note: 'SYNTHETIC; the period is optional',
  },
  {
    kind: 'sorcery',
    text: 'Draw a card.\nFlashback {X}{R}',
    expect: no('{X}{R}', 'keyword.flashback'),
    note: 'SYNTHETIC',
  },
  {
    kind: 'creature',
    text: 'Flashback {2}{G}',
    expect: { engine: 'flashback is on an instant or a sorcery' },
    note: 'SYNTHETIC; read on any face, the engine says why a permanent cannot',
  },
];

const TRIGGERS: readonly Line[] = [
  {
    kind: 'enchantment',
    text: 'At the beginning of your upkeep, if you control three or more artifacts, you gain 1 life.',
    expect: OK,
    note: 'backlog: 1 card (the shape with a count)',
  },
  {
    kind: 'creature',
    text: 'When ~ enters, if you control three or more artifacts, you gain 1 life.',
    expect: OK,
    note: 'SYNTHETIC',
  },
  {
    kind: 'creature',
    text: 'Whenever ~ attacks, if you control two or more other creatures, draw a card.',
    expect: OK,
    note: 'SYNTHETIC',
  },
  {
    kind: 'creature',
    text: 'When ~ enters, if you control no other creatures, put a +1/+1 counter on ~.',
    expect: OK,
    note: 'SYNTHETIC',
  },
  {
    kind: 'creature',
    text: 'When ~ enters, if you have two or more opponents, draw a card.',
    expect: OK,
    note: 'SYNTHETIC',
  },
  {
    kind: 'creature',
    text: 'When ~ dies, if you have two or more opponents, draw a card.',
    expect: OK,
    note: 'SYNTHETIC; a dies trigger may read opponents',
  },
  {
    kind: 'creature',
    text: 'When ~ dies, if you control two or more creatures, draw a card.',
    expect: { engine: 'CR 603.10a' },
    note: 'SYNTHETIC; a dies trigger looks back in time and the engine cannot count permanents then',
  },
  {
    kind: 'creature',
    text: 'Whenever ~ enters or attacks, if you control three or more artifacts, you gain 1 life.',
    expect: OK,
    note: 'SYNTHETIC; two abilities sharing one condition',
  },
  {
    kind: 'creature',
    text: 'Kicker {2}\nWhenever another creature you control enters, if it was kicked, you gain 1 life.',
    expect: no('it was kicked, you gain 1 life.', 'condition.kicked', NOT_RUNNABLE),
    note: 'SYNTHETIC; "it" is the other creature, whose kicked status is not the source',
  },
  {
    kind: 'creature',
    text: 'When ~ enters, if you control a creature with power 4 or greater, draw a card.',
    expect: OK,
    note: 'backlog: 2 cards; a filter compares power since stage P18 (D-111)',
  },
  {
    kind: 'creature',
    text: 'When ~ enters, if you cast it, you gain 1 life.',
    expect: no('you cast it, you gain 1 life.', 'ability.triggered'),
    note: 'backlog: 1 card',
  },
];

const HOSTS: readonly Line[] = [
  {
    kind: 'aura',
    text: 'Enchant permanent\nEnchanted creature gets +1/+1.',
    expect: OK,
    note: 'SYNTHETIC; a land host gets nothing (the engine checks the host type)',
  },
  {
    kind: 'aura',
    text: 'Enchant creature\nEnchanted legendary creature gets +2/+2.',
    expect: OK,
    note: 'SYNTHETIC',
  },
  {
    kind: 'aura',
    text: 'Enchant land\nEnchanted land has hexproof.',
    expect: OK,
    note: 'SYNTHETIC',
  },
  {
    kind: 'equipment',
    text: 'Equipped creature gets +1/+1.\nEquip {1}',
    expect: OK,
    note: 'backlog: Equipped creature gets +N/+N 172 cards',
  },
  {
    kind: 'equipment',
    text: 'Equipped legendary creature gets +1/+1.\nEquip {1}',
    expect: OK,
    note: 'SYNTHETIC',
  },
];

const TOKENS: readonly Line[] = [
  { kind: 'sorcery', text: 'Create a Food token.', expect: OK, note: 'Food runs since D-075' },
  { kind: 'sorcery', text: 'Create a Clue token.', expect: OK, note: 'Clue runs since D-075' },
  {
    kind: 'creature',
    text: 'When ~ enters, create a Clue token.',
    expect: OK,
    note: 'SYNTHETIC',
  },
];

runCorpus('Kicker and "if ~ was kicked"', KICKER);
runCorpus('Flashback', FLASHBACK);
runCorpus('the intervening "if"', TRIGGERS);
runCorpus('the host type of an attached subject', HOSTS);
runCorpus('Food and Clue', TOKENS);

describe('the corpus lines are distinct', () => {
  test('no two lines are the same text on the same kind of card', () => {
    const all = [...KICKER, ...FLASHBACK, ...TRIGGERS, ...HOSTS, ...TOKENS].map(
      (l) => `${l.kind}|${l.text}`,
    );
    expect(new Set(all).size).toBe(all.length);
  });
});
