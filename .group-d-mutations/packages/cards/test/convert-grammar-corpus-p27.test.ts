// The template corpus of stage P27: the copy slice of the engine (D-129, ENGINE_VERSION 27). The lines are the real
// shapes of reports/templates.json ("Storm", "Replicate {M}", "Copy target instant or sorcery spell. You may choose
// new targets for the copy.", "{M}, {T}: Copy target instant or sorcery spell you control. You may choose new
// targets for the copy.", "When ~ enters, copy target instant or sorcery spell. You may choose new targets for the
// copy." and "Whenever you cast a spell of the chosen type, copy that spell."); everything else is SYNTHETIC (the
// Oracle text of the cards that have them is not in the repository). No real card is marked supported here except
// through the golden corpus. Each line says whether it must import as supported, or where and why it stops, so a
// change that makes the grammar read less OR more than it should fails here. The kinds of expectation are those of
// convert-grammar-corpus.test.ts.
import { type Line, NONE, no, OK, runCorpus } from './convert-grammar-corpus-helpers';

const SUPPORTED: readonly Line[] = [
  {
    kind: 'sorcery',
    text: 'Draw a card.\nStorm',
    expect: OK,
    note: 'the real line (33 cards: Grapeshot, Tendrils of Agony, ...); SYNTHETIC card and spell text around it',
  },
  {
    kind: 'instant',
    text: 'Storm\nDraw a card.',
    expect: OK,
    note: 'SYNTHETIC: Storm first, the spell text after it',
  },
  {
    kind: 'creature',
    text: 'Storm',
    expect: OK,
    note: 'SYNTHETIC: Storm on a permanent spell (the copies become tokens)',
  },
  {
    kind: 'sorcery',
    text: 'Replicate {2}\nDraw a card.',
    expect: OK,
    note: 'the real line (16 cards: Changing Loyalty, Pyromatics, ...); SYNTHETIC card and spell text around it',
  },
  {
    kind: 'instant',
    text: 'Replicate {U}\nDestroy target creature.',
    expect: OK,
    note: 'SYNTHETIC: a single-symbol cost and a spell with a target',
  },
  {
    kind: 'sorcery',
    text: 'Kicker {1}\nReplicate {R}\nDraw a card.',
    expect: OK,
    note: 'SYNTHETIC: Replicate beside Kicker',
  },
  {
    kind: 'sorcery',
    text: 'Replicate {1}{R}\nStorm\nDraw a card.',
    expect: OK,
    note: 'SYNTHETIC: both keywords on one card',
  },
  {
    kind: 'instant',
    text: 'Copy target instant or sorcery spell. You may choose new targets for the copy.',
    expect: OK,
    note: 'the real line (6 cards: Reverberate, Twincast, Fury Storm, ...); SYNTHETIC card around it',
  },
  {
    kind: 'instant',
    text: 'Copy target instant or sorcery spell.',
    expect: OK,
    note: 'SYNTHETIC: no sentence about new targets, so the copy has the targets of the original',
  },
  {
    kind: 'instant',
    text: 'Copy target spell. You may choose new targets for the copy.',
    expect: OK,
    note: 'SYNTHETIC: any spell',
  },
  {
    kind: 'artifact',
    text: '{7}, {T}: Copy target instant or sorcery spell you control. You may choose new targets for the copy.',
    expect: OK,
    note: 'the real line (Twinning Staff, Lithoform Engine); SYNTHETIC card around it',
  },
  {
    kind: 'creature',
    text: 'When ~ enters, copy target instant or sorcery spell. You may choose new targets for the copy.',
    expect: OK,
    note: 'the real line (Dualcaster Mage); SYNTHETIC card around it',
  },
  {
    kind: 'enchantment',
    text: 'As ~ enters, choose a creature type.\nWhenever you cast a spell of the chosen type, copy that spell.',
    expect: OK,
    note: 'the real second line (Reflections of Littjara); SYNTHETIC first line and card',
  },
  {
    kind: 'enchantment',
    text: 'As ~ enters, choose a creature type.\nWhenever you cast a creature spell of the chosen type, copy that spell.',
    expect: OK,
    note: 'SYNTHETIC: creature spells only',
  },
  {
    kind: 'enchantment',
    text: 'Whenever you cast an instant or sorcery spell, copy that spell. You may choose new targets for the copy.',
    expect: OK,
    note: 'SYNTHETIC: the cast trigger with new targets for the copy',
  },
];

const REFUSED_BY_THE_ENGINE: readonly Line[] = [
  {
    kind: 'creature',
    text: 'Replicate {R}\nReplicate {1}{G}',
    expect: { engine: 'replicate' },
    note: 'SYNTHETIC: one replicate ability on a face (CR 702.56b is not built)',
  },
];

const UNREAD: readonly Line[] = [
  {
    kind: 'sorcery',
    text: 'Storm 2',
    expect: no('2', 'keyword.storm'),
    note: 'SYNTHETIC: Storm takes no number',
  },
  {
    kind: 'creature',
    text: 'Flying, storm',
    expect: no('storm', 'keyword.line'),
    note: 'SYNTHETIC: Storm is read on a line of its own, not in a keyword list',
  },
  {
    kind: 'sorcery',
    text: 'Replicate {X}{R}',
    expect: no('{X}{R}', 'keyword.replicate'),
    note: 'SYNTHETIC: X in the cost',
  },
  {
    kind: 'sorcery',
    text: 'Replicate {R/G}',
    expect: no('{R/G}', 'keyword.replicate'),
    note: 'SYNTHETIC: a hybrid symbol',
  },
  {
    kind: 'sorcery',
    text: 'Replicate—Pay 2 life.',
    expect: no('Replicate—Pay 2 life.', NONE),
    note: 'SYNTHETIC: a cost that is not mana',
  },
  {
    kind: 'instant',
    text: "Copy target instant or sorcery spell, then return it to its owner's hand. You may choose new targets for the copy.",
    expect: no(
      ", then return it to its owner's hand. You may choose new targets for the copy.",
      'effect.copy-spell',
    ),
    note: 'the real line (1 card): the second instruction has no way to run on the card the copy came from, so the line is not read',
  },
  {
    kind: 'instant',
    text: 'Copy target instant or sorcery spell. You may choose new targets for the copies.',
    expect: no('may choose new targets for the copies.', 'effect.player'),
    note: 'SYNTHETIC: another wording of the second sentence',
  },
  {
    kind: 'instant',
    text: 'Copy target instant or sorcery spell, activated ability, or triggered ability. You may choose new targets for the copy.',
    expect: no(
      ', activated ability, or triggered ability. You may choose new targets for the copy.',
      'effect.copy-spell',
    ),
    note: 'SYNTHETIC: copies of abilities are not built',
  },
  {
    kind: 'artifact',
    text: '{2}, {T}: Copy target triggered ability you control. You may choose new targets for the copy.',
    expect: no(
      'triggered ability you control. You may choose new targets for the copy.',
      'effect.copy-spell',
    ),
    note: 'the real line (1 card): copies of abilities are not built',
  },
  {
    kind: 'enchantment',
    text: 'Whenever you cast or copy an instant or sorcery spell, create a Treasure token.',
    expect: OK,
    note: 'the real line (6 cards): read since stage P65 (D-218): `trigger.cast-or-copy`, a cast trigger that also sees the copy',
  },
  {
    kind: 'instant',
    text: 'Copy it. You may choose new targets for the copy.',
    expect: no('it. You may choose new targets for the copy.', 'effect.copy-spell'),
    note: 'SYNTHETIC: "it" is not a spell the grammar can name here',
  },
];

runCorpus('stage P27: copy lines read and run', SUPPORTED);
runCorpus('stage P27: what stays unread', UNREAD);

runCorpus('stage P27: what the engine refuses', REFUSED_BY_THE_ENGINE);
