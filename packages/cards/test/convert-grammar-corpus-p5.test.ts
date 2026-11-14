// The SYNTHETIC template corpus of stage P5: keyword gains and pumps, the Turn to Frog shape, the
// flicker sentence, Prowess, the pronoun "it" and the dash forms of Cycling and Equip. Each line is
// a template written after a real shape of the backlog (reports/backlog.md and the templates behind
// it; the count is in the note, as the report prints it, parser version 4) or marked SYNTHETIC;
// none is a real card's text, and Giant Growth, Turn to Frog and Cloudshift are not marked
// supported here. Each line says whether it must import as supported, or where and why it stops,
// so a change that makes the grammar read less OR more than it should fails here. The kinds of
// expectation are those of convert-grammar-corpus.test.ts.
import { describe, expect, test } from 'vitest';
import { type Line, NONE, no, OK, runCorpus } from './convert-grammar-corpus-helpers';

const GAINS: readonly Line[] = [
  {
    kind: 'instant',
    text: 'Target creature gains flying until end of turn.',
    expect: OK,
    note: 'SYNTHETIC; the shape of the engine fixture Gust of Wings',
  },
  {
    kind: 'instant',
    text: 'Target creature gets +3/+1 and gains trample until end of turn.',
    expect: OK,
    note: 'backlog: 22 cards (a pump and a keyword)',
  },
  {
    kind: 'instant',
    text: 'Target creature gets +2/+2 and gains first strike until end of turn.',
    expect: OK,
    note: 'SYNTHETIC; D-083: a sequence of modifyPt and grantKeyword',
  },
  {
    kind: 'instant',
    text: 'Target creature gains flying, first strike, and vigilance until end of turn.',
    expect: OK,
    note: 'SYNTHETIC; one grantKeyword per keyword',
  },
  {
    kind: 'instant',
    text: 'Creatures you control gain indestructible until end of turn.',
    expect: OK,
    note: 'backlog: 2 cards',
  },
  {
    kind: 'instant',
    text: 'Permanents you control gain hexproof and indestructible until end of turn.',
    expect: OK,
    note: 'backlog: 1 card',
  },
  {
    kind: 'instant',
    text: 'Creatures you control get +1/+1 and gain haste until end of turn.',
    expect: OK,
    note: 'SYNTHETIC',
  },
  {
    kind: 'creature',
    text: '{1}: ~ gains flying until end of turn.',
    expect: OK,
    note: 'backlog: 31 cards',
  },
  {
    kind: 'creature',
    text: '{2}: ~ gains deathtouch until end of turn.',
    expect: OK,
    note: 'backlog: 20 cards',
  },
  {
    kind: 'creature',
    text: '{R}: ~ gains first strike until end of turn.',
    expect: OK,
    note: 'backlog: 28 cards ({R/W} in some of them, which is not read)',
  },
  {
    kind: 'creature',
    text: '{R/W}: ~ gains first strike until end of turn.',
    expect: OK,
    note: 'backlog: part of the 28; read since stage P15 (the engine pays a hybrid symbol of an activation cost with its planner, as for a mana ability, D-099)',
  },
  {
    kind: 'creature',
    text: '{3}{B}{B}: Creatures you control gain lifelink until end of turn.',
    expect: OK,
    note: 'backlog: 1 card',
  },
  {
    kind: 'creature',
    text: 'Whenever ~ attacks, ~ gains lifelink until end of turn.',
    expect: OK,
    note: 'SYNTHETIC',
  },
  {
    kind: 'instant',
    // Feather deck group 1 (D-452): protection from a color is read now; a quality that is not a color is not.
    text: 'Target creature gains protection from artifacts until end of turn.',
    expect: no('protection from artifacts until end of turn.', 'effect.gain-keyword'),
    note: 'backlog: 7 cards; a keyword with a parameter is not read',
  },
  {
    kind: 'instant',
    text: 'Target legendary creature gains fear until end of turn.',
    expect: OK,
    note: 'backlog: 1 card; read since the engine runs fear (D-094, stage P11)',
  },
  {
    kind: 'instant',
    text: 'Target creature gains storm until end of turn.',
    expect: no('storm until end of turn.', 'effect.gain-keyword'),
    note: 'SYNTHETIC; the engine has no storm (D-118), so no word of the grant list names it',
  },
  {
    kind: 'instant',
    text: 'Target creature gains skulk until end of turn.',
    expect: OK,
    note: 'SYNTHETIC; skulk is grantable since the engine lists it (D-120, stage P21)',
  },
  {
    kind: 'instant',
    text: 'Target creature gains prowess until end of turn.',
    expect: OK,
    note: 'SYNTHETIC; read since D-149: the engine expands a granted prowess into its triggered ability (CR 702.108b)',
  },
  {
    kind: 'instant',
    text: 'Target creature you control gets +X/+X and gains hexproof and indestructible until end of turn, where X is the number of creatures you control.',
    expect: OK,
    note: 'SYNTHETIC; read since stage P28 (D-131): X is the count, written into the pump (the backlog line without the "where X is" is read since stage P20)',
  },
  {
    kind: 'instant',
    text: 'Creatures you control gain trample and get +X/+X until end of turn, where X is the number of creatures you control.',
    expect: OK,
    note: 'backlog: 1 card; read since stage P64 (D-217): the keywords first, then the pump',
  },
];

const BECOMES: readonly Line[] = [
  {
    kind: 'instant',
    text: 'Target creature loses all abilities and becomes a blue Frog with base power and toughness 1/1 until end of turn.',
    expect: OK,
    note: 'the engine fixture Frog Hex; the real Turn to Frog text is from memory, UNVERIFIED',
  },
  {
    kind: 'instant',
    text: 'Target creature loses all abilities until end of turn.',
    expect: OK,
    note: 'SYNTHETIC',
  },
  {
    kind: 'instant',
    text: 'Target creature becomes a Frog with base power and toughness 0/1 until end of turn.',
    expect: OK,
    note: 'SYNTHETIC',
  },
  {
    kind: 'instant',
    text: 'Target creature becomes red until end of turn.',
    expect: OK,
    note: 'SYNTHETIC',
  },
  {
    kind: 'instant',
    text: 'Target creature has base power and toughness 4/4 until end of turn.',
    expect: OK,
    note: 'SYNTHETIC',
  },
  {
    kind: 'artifact',
    text: '{T}: Target nonland permanent becomes an artifact in addition to its other types until end of turn.',
    expect: OK,
    note: 'backlog: 1 card; read since stage P6 (the additive setTypes, CR 205.1b)',
  },
  {
    kind: 'aura',
    text: 'Enchant creature\nEnchanted creature loses all abilities and is a green Elk creature with base power and toughness 3/3.',
    expect: OK,
    note: "backlog: 2 cards; read since stage P32 (D-147): the engine's `loseAllAbilities`, `setTypes`, `setColors` and `setPt` statics",
  },
  {
    kind: 'instant',
    text: 'Target creature becomes a blue Frog until end of turn. It loses all abilities.',
    expect: no('.', 'effect.loses-abilities'),
    note: 'SYNTHETIC; a pronoun subject has no verb "loses" rule for a second sentence of this shape',
  },
];

const FLICKER: readonly Line[] = [
  {
    kind: 'instant',
    text: "Exile target creature you control, then return it to the battlefield under its owner's control.",
    expect: OK,
    note: 'backlog: 2 cards (Momentary Blink with Flashback; the other has Rebound, unread)',
  },
  {
    kind: 'instant',
    text: 'Exile target creature you control, then return that card to the battlefield under your control.',
    expect: OK,
    note: 'backlog: 1 card',
  },
  {
    kind: 'instant',
    text: "Exile target creature you control, then return it to the battlefield under its owner's control.\nFlashback {3}{U}",
    expect: OK,
    note: 'SYNTHETIC; a flicker with flashback',
  },
  {
    kind: 'instant',
    text: "Exile target creature you control, then return it to the battlefield under its owner's control.\nRebound",
    expect: no('Rebound', NONE),
    note: 'backlog: 1 card; Rebound is not read',
  },
  {
    kind: 'instant',
    text: "Exile target creature. Return it to the battlefield under its owner's control at the beginning of the next end step.",
    expect: OK,
    note: 'SYNTHETIC; read since stage P48 (D-205): a delayed triggered ability that returns the exiled card (CR 603.7, 603.7c)',
  },
  {
    kind: 'instant',
    text: "Exile each creature you control, then return them to the battlefield under their owners' control.",
    expect: no("them to the battlefield under their owners' control.", 'effect.return'),
    note: 'SYNTHETIC; a group is not read: `moved` follows one exile',
  },
  {
    kind: 'instant',
    text: "Exile target permanent, then return it to the battlefield under its owner's control.",
    expect: OK,
    note: 'SYNTHETIC; read, and supported since D-149: an Aura returned by the effect enters and its controller chooses what it enchants (CR 303.4f, 303.4g)',
  },
  {
    kind: 'enchantment',
    text: 'At the beginning of your end step, you may exile target creature you control, then return that card to the battlefield under your command.',
    expect: no('under your command.', 'effect.return'),
    note: 'SYNTHETIC; a near miss of the flicker phrase (stage P33 reads "return that card to the battlefield" and stops at the control)',
  },
  {
    kind: 'enchantment',
    text: 'At the beginning of your end step, you may exile target creature you control, then return that card to the battlefield under your control.',
    expect: OK,
    note: 'backlog: 1 card; read, and the engine chooses its target as the trigger goes on the stack (CR 603.3d, D-089)',
  },
];

const PRONOUNS: readonly Line[] = [
  { kind: 'creature', text: 'Prowess', expect: OK, note: 'backlog: 85 cards' },
  { kind: 'creature', text: 'Flying, prowess', expect: OK, note: 'SYNTHETIC' },
  {
    kind: 'creature',
    text: 'Prowess (Whenever you cast a noncreature spell, this creature gets +1/+1 until end of turn.)',
    expect: OK,
    note: 'the reminder text is stripped',
  },
  {
    kind: 'creature',
    text: 'When ~ enters, put two +1/+1 counters on it.',
    expect: OK,
    note: 'SYNTHETIC; "it" is ~ (D-082 follow-up)',
  },
  {
    kind: 'creature',
    text: 'Whenever ~ attacks, it gets +1/+0 until end of turn.',
    expect: OK,
    note: 'SYNTHETIC; "it" is ~',
  },
  {
    kind: 'creature',
    text: 'Whenever ~ enters or attacks, put a +1/+1 counter on it.',
    expect: OK,
    note: 'SYNTHETIC; every event is about ~',
  },
  {
    kind: 'creature',
    text: '{T}: Put a +1/+1 counter on ~. It gains flying until end of turn.',
    expect: OK,
    note: 'SYNTHETIC; "it" after ~ in an activated ability',
  },
  {
    kind: 'instant',
    text: 'Put a +1/+1 counter on target creature you control. It gains hexproof until end of turn.',
    expect: OK,
    note: 'backlog: 1 card; "it" after a target',
  },
  {
    kind: 'creature',
    text: 'Whenever another creature you control enters, put a +1/+1 counter on it.',
    expect: OK,
    note: 'SYNTHETIC; "it" is the other creature: the engine\'s `triggerSubject` since D-133',
  },
  {
    kind: 'creature',
    text: 'Whenever a creature you control attacks, it gets +1/+0 until end of turn.',
    expect: OK,
    note: 'backlog: the first half of 1 card (Shared Animosity); "it" is `triggerSubject` since D-133',
  },
  {
    kind: 'creature',
    text: 'When ~ dies, put a +1/+1 counter on it.',
    expect: OK,
    note: 'SYNTHETIC; after "dies" ~ is a card in a graveyard, a new object: the engine finds nothing to put the counter on (CR 608.2b)',
  },
  {
    kind: 'creature',
    text: 'When ~ enters, put a +1/+1 counter on that creature.',
    expect: no('that creature.', 'effect.add-counters'),
    note: 'SYNTHETIC; "that creature" is not read as a noun',
  },
  {
    kind: 'equipment',
    text: 'Equipped creature has flying.\nEquip—Pay 2 life.',
    expect: OK,
    note: 'SYNTHETIC; the dash form with its period',
  },
  {
    kind: 'creature',
    text: 'Cycling—Pay 2 life.',
    expect: OK,
    note: 'SYNTHETIC; the dash form with its period',
  },
  {
    kind: 'equipment',
    text: 'Equipped creature has prowess.\nEquip {1}',
    expect: OK,
    note: 'SYNTHETIC; read since D-149: a granted prowess is expanded by the engine (CR 702.108b)',
  },
];

runCorpus('keyword gains and pumps', GAINS);
runCorpus('Turn to Frog and its parts', BECOMES);
runCorpus('flicker', FLICKER);
runCorpus('Prowess, the pronoun "it" and the dash forms', PRONOUNS);

describe('the corpus lines are distinct', () => {
  test('no two lines are the same text on the same kind of card', () => {
    const all = [...GAINS, ...BECOMES, ...FLICKER, ...PRONOUNS].map((l) => `${l.kind}|${l.text}`);
    expect(new Set(all).size).toBe(all.length);
  });
});
