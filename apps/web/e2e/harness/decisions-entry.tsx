// Mounts the real game screen on a store holding the view of one decision. Each state is built
// with the engine's scenario DSL (SYNTHETIC cards of the engine fixtures, or real fixtures), so a
// decision that is hard to reach by playing against the AI can still be drawn and photographed.
import { type CardDefinition, type GameView, getView } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { createRoot } from 'react-dom/client';
import { App } from '../../src/App';
import { GameHost } from '../../src/game/host';
import { createAppStore } from '../../src/store';
import { StoreProvider } from '../../src/ui/store-context';
import '../../src/styles.css';

const FILLER = Array.from({ length: 12 }, () => 'Island');

/** "As this artifact enters, pay any amount of life." (SYNTHETIC; same shape as the engine test of CR 119.4.) */
const LIFE_PRESS: CardDefinition = {
  oracleId: null,
  name: 'SYNTHETIC Life Press',
  layout: 'normal',
  faces: [
    {
      name: 'SYNTHETIC Life Press',
      manaCost: ['1'],
      supertypes: [],
      types: ['artifact'],
      subtypes: [],
      colors: [],
      power: null,
      toughness: null,
      loyalty: null,
      defense: null,
      oracleText: 'SYNTHETIC: As this artifact enters, pay any amount of life.',
      abilities: [
        { kind: 'replacement', replacement: { kind: 'asEntersChoose', what: 'lifePaid' } },
      ],
      spell: null,
    },
  ],
  colorIdentity: [],
  support: 'supported',
} as unknown as CardDefinition;

/** A SYNTHETIC creature of the given types, for the party question. */
const creature = (name: string, subtypes: readonly string[]): CardDefinition =>
  ({
    oracleId: null,
    name,
    layout: 'normal',
    faces: [
      {
        name,
        manaCost: ['1'],
        supertypes: [],
        types: ['creature'],
        subtypes,
        colors: [],
        power: 1,
        toughness: 1,
        loyalty: null,
        defense: null,
        oracleText: 'SYNTHETIC',
        abilities: [],
        spell: null,
      },
    ],
    colorIdentity: [],
    support: 'supported',
  }) as unknown as CardDefinition;

/** "Each player chooses a party from among creatures they control, then sacrifices the rest." (SYNTHETIC) */
const PARTY_PURGE: CardDefinition = {
  oracleId: null,
  name: 'SYNTHETIC Party Purge',
  layout: 'normal',
  faces: [
    {
      name: 'SYNTHETIC Party Purge',
      manaCost: ['1'],
      supertypes: [],
      types: ['sorcery'],
      subtypes: [],
      colors: [],
      power: null,
      toughness: null,
      loyalty: null,
      defense: null,
      oracleText:
        'Each player chooses a party from among creatures they control, then sacrifices the rest.',
      abilities: [],
      spell: { effect: { kind: 'chooseParty', players: { kind: 'eachPlayer' } } },
    },
  ],
  colorIdentity: [],
  support: 'supported',
} as unknown as CardDefinition;

const PARTY_MEMBERS: readonly CardDefinition[] = [
  creature('SYNTHETIC Cleric', ['Human', 'Cleric']),
  creature('SYNTHETIC Second Cleric', ['Human', 'Cleric']),
  creature('SYNTHETIC Rogue', ['Human', 'Rogue']),
  creature('SYNTHETIC Warrior', ['Human', 'Warrior']),
  creature('SYNTHETIC Wizard', ['Human', 'Wizard']),
  creature('SYNTHETIC Bear', ['Bear']),
];

const PILE = 'SYNTHETIC Pile Reading';
const PILE_TOP = ['Grizzly Bears', 'Giant Spider', 'Serra Angel', 'Lightning Bolt', 'Sol Ring'];

function piles(): ScenarioGame {
  const b = scenario().seat(0).hand(PILE).battlefield('Island', 'Island', 'Island', 'Island');
  for (const name of PILE_TOP) b.library(name);
  const g = b.seat(1).library('Island', 'Island').at('precombatMain').build();
  g.act(0).cast(PILE, { pay: true });
  g.passAll();
  return g;
}

export const STATES: Record<string, () => GameView> = {
  /** The player who separates the revealed cards into two piles (a dock panel). */
  'piles-separate': () => getView(piles().state, 1),
  /** The player who picks one of the two piles (a modal). */
  'piles-choose': () => {
    const g = piles();
    g.act(1).chooseCards({ name: 'Giant Spider', seat: 0 }, { name: 'Sol Ring', seat: 0 });
    return getView(g.state, 0);
  },
  /** The defender flashes in a Signpost and reselects what the attacking creature attacks. */
  'attack-target': () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .library(...FILLER)
      .battlefield('Grizzly Bears')
      .seat(1)
      .life(20)
      .library(...FILLER)
      .battlefield('SYNTHETIC Vanilla Planeswalker')
      .hand('SYNTHETIC Crooked Signpost')
      .battlefield('Island', { count: 3 })
      .at('precombatMain')
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).declareAttackers([{ attacker: 'Grizzly Bears' }]);
    g.act(0).pass();
    g.act(1).cast('SYNTHETIC Crooked Signpost', { pay: true });
    g.passAll();
    g.passAll();
    g.act(1).accept();
    return getView(g.state, 1);
  },
  /** "Pay any amount of life" as the artifact enters: a number, not a list of buttons. */
  'life-paid': () => {
    const g = scenario()
      .define(LIFE_PRESS)
      .seat(0)
      .life(40)
      .hand(LIFE_PRESS.name)
      .battlefield('Island', 'Island', 'Island')
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .build();
    g.act(0).cast(LIFE_PRESS.name, { pay: true });
    g.passAll();
    return getView(g.state, 0);
  },
  /** "You may choose not to untap" in the untap step: a checklist. */
  untap: () => {
    const g = scenario()
      .seat(0)
      .library(...FILLER)
      .battlefield('SYNTHETIC Drowsy Land', { tapped: true })
      .battlefield('SYNTHETIC Drowsy Rod', { tapped: true })
      .battlefield('Grizzly Bears', { tapped: true })
      .seat(1)
      .library(...FILLER)
      .at('end', { active: 1, turn: 2 })
      .build();
    g.advanceTo('untap', { turn: 'next' });
    return getView(g.state, 0);
  },
  /** "As this artifact enters, choose a nonland card name": a text box with suggestions. */
  'card-name': () => {
    const g = scenario()
      .seat(0)
      .hand('SYNTHETIC Name Chooser')
      .battlefield('Island', 'Island', 'Grizzly Bears', 'Sol Ring')
      .library(...FILLER)
      .seat(1)
      .battlefield('Serra Angel')
      .library(...FILLER)
      .build();
    g.act(0).cast('SYNTHETIC Name Chooser', { pay: true });
    g.passAll();
    return getView(g.state, 0);
  },
  /** "Choose a party from among creatures you control": a row for each of the four party types. */
  party: () => {
    let b = scenario();
    for (const card of [PARTY_PURGE, ...PARTY_MEMBERS]) b = b.define(card);
    const me = b
      .seat(0)
      .life(20)
      .library(...FILLER)
      .hand(PARTY_PURGE.name)
      .battlefield('Plains');
    for (const card of PARTY_MEMBERS) me.battlefield(card.name);
    const g = b
      .seat(1)
      .life(20)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).cast(PARTY_PURGE.name, { pay: true });
    g.passAll();
    return getView(g.state, 0);
  },
  /** No decision: a graveyard with cards, to open the zone viewer from the board. */
  graveyard: () =>
    getView(
      scenario()
        .seat(0)
        .library(...FILLER)
        .graveyard('Lightning Bolt', 'Grizzly Bears', 'Sol Ring', 'Serra Angel')
        .battlefield('Island', 'Island')
        .seat(1)
        .library(...FILLER)
        .at('precombatMain')
        .build().state,
      0,
    ),
};

export function mount(name: string): void {
  const make = STATES[name];
  if (make === undefined) throw new Error(`unknown state ${name}`);
  const view = make();
  const store = createAppStore({ client: new GameHost({ clock: () => 0 }) });
  store.setState({
    screen: 'playing',
    snapshot: {
      revision: 1,
      view,
      steps: [],
      log: [],
      actionCount: 0,
      aiFallbacks: 0,
      error: null,
      undoDepth: 0,
      logReset: null,
    },
  });
  const container = document.createElement('div');
  document.body.replaceChildren(container);
  createRoot(container).render(
    <StoreProvider store={{ ...store, getInitialState: store.getState }}>
      <App />
    </StoreProvider>,
  );
}
