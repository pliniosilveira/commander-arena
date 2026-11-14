/**
 * The questions of the Dragons slice rendered (D-151): the chapter and the name dialogs, Behold in the dock with its two places, the
 * stepper of "pay any amount" with no Cancel, the discard of any number of cards, a mode that may not repeat, a permanent that copies, the
 * Cascade question of Discover, the chips of the cards castable from exile and from the top of the library, and the marked mana in a pool.
 * Some are drawn from fixed-seed games of the hidden SYNTHETIC decks; the others from their own shapes over a small view.
 */
import type {
  ChooseModesDecision,
  ChoosePermanentDecision,
  ConfirmOptionalDecision,
  GameView,
  ObjectView,
  PendingDecision,
  SeatView,
} from '@commander-arena/engine';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test, vi } from 'vitest';
import { GameHost } from '../src/game/host';
import { createAppStore } from '../src/store';
import { OtherZonesStrip } from '../src/ui/board/OtherZonesStrip';
import { ManaPool, PlayerStrip } from '../src/ui/board/PlayerStrip';
import { DecisionLayer } from '../src/ui/decisions/DecisionLayer';
import { objectIndex } from '../src/ui/decisions/lookup';
import { ModesDialog } from '../src/ui/decisions/ModesDialog';
import { buildModel, type Controller } from '../src/ui/decisions/model';
import { OptionalDialog } from '../src/ui/decisions/OptionalDialog';
import { PermanentPanel } from '../src/ui/decisions/PermanentPanel';
import { initialUi } from '../src/ui/decisions/ui-state';
import { StoreProvider } from '../src/ui/store-context';
import {
  asksAnyDiscard,
  asksBeholdBoth,
  asksChapter,
  asksNamedOption,
  asksPayAny,
  DRAGONS_DECK,
  type DragonsStore,
  mayCastFromTop,
  mayPlayFromExile,
  reachDragonsStore,
} from './dragons-decks';

// The host-backed cases pin their verified seeds and fail if a checkpoint moves.
vi.setConfig({ testTimeout: 300_000 });

const none = () => {};

/** Server rendering reads zustand's initial state, so report the current one instead. */
const live = (store: DragonsStore) => ({ ...store, getInitialState: () => store.getState() });

async function must(
  accept: (view: GameView) => boolean,
  want: RegExp,
  opts: Parameters<typeof reachDragonsStore>[2] = {},
): Promise<DragonsStore> {
  const found = await reachDragonsStore(accept, want, opts);
  if (found === null)
    throw new Error(
      opts.seed === undefined ? 'no seed reaches the situation' : `seed ${opts.seed} missed the situation`,
    );
  return found.store;
}

const layer = (store: DragonsStore, children: React.ReactNode = <div />) =>
  renderToStaticMarkup(
    <StoreProvider store={live(store)}>
      <DecisionLayer>{children}</DecisionLayer>
    </StoreProvider>,
  );

describe('the dialogs of a name and of a chapter', () => {
  test('read ahead: the chapters with their words, no way out', async () => {
    const store = await must(asksChapter, /Reading Rite/, { seed: 2 });
    const html = layer(store);
    expect(html).toContain('aria-label="Choose a chapter"');
    expect(html).toContain('>SYNTHETIC Reading Rite</h2>');
    expect(html).toContain('Choose a chapter to start with for SYNTHETIC Reading Rite.');
    expect(html).toContain('It enters with that many lore counters.');
    expect(html).toContain('data-option="1"');
    expect(html).toContain('>Chapter I</span>');
    expect(html).toContain('>Chapter III</span>');
    expect(html).toContain('Discard any number of cards, then draw that many cards.');
    expect(html).not.toContain('>Cancel<');
    // The creature type picker is not used.
    expect(html).not.toContain('Search creature types');
  });

  test('Khans or Dragons: one button for each name', async () => {
    const store = await must(asksNamedOption, /Siege of Choices/, {
      seed: 40,
      human: DRAGONS_DECK,
      ai: DRAGONS_DECK,
      seeds: 40,
    });
    const html = layer(store);
    expect(html).toContain('aria-label="Choose an option"');
    expect(html).toContain('As SYNTHETIC Siege of Choices enters, choose Khans or Dragons.');
    expect(html).toContain('data-option="Khans"');
    expect(html).toContain('data-option="Dragons"');
    expect(html).not.toContain('It enters with that many lore counters.');
  });
});

describe('Behold in the dock', () => {
  test('the cards of the hand and the permanents you control, each under its own words', async () => {
    const store = await must(asksBeholdBoth, /Dragon Scout/, { seed: 2 });
    const html = layer(store);
    expect(html).toContain('aria-label="Cards to behold"');
    expect(html).toContain('>Behold a Dragon</h3>');
    expect(html).toContain('data-behold-zone="hand"');
    expect(html).toContain('In your hand, revealed when chosen:');
    expect(html).toContain('data-behold-zone="battlefield"');
    expect(html).toContain('On the battlefield, only chosen:');
    expect(html).toContain(
      'Reveal a Dragon card from your hand or choose a Dragon you control on the battlefield',
    );
    expect(html).toContain('>Behold</button>');
    // There is nothing to cancel: the ability is resolving.
    expect(html).not.toContain('>Cancel<');
  });
});

describe('any number of cards, and any amount of mana', () => {
  test('the discard says that none is an answer, and Confirm says what it does', async () => {
    // The plain bot starts the Saga at chapter I; chapter II comes with the lore counter of the next turn.
    const store = await must(asksAnyDiscard, /Reading Rite/, { seed: 2 });
    const html = layer(store);
    expect(html).toContain('Discard any number of cards');
    expect(html).toContain('Discard none');
    expect(html).toContain('Confirm to discard none');
  });

  test('pay any amount: a stepper from 0, the symbol, no Cancel', async () => {
    const store = await must(asksPayAny, /Ember Tyrant/, { seed: 5, manual: true });
    const html = layer(store);
    expect(html).toContain('aria-label="Pay any amount"');
    expect(html).toContain(
      'Pay any amount of {R} for SYNTHETIC Ember Tyrant&#x27;s ability. You can pay up to',
    );
    expect(html).toContain('aria-label="Pay less"');
    expect(html).toContain('aria-label="Pay more"');
    expect(html).toContain('aria-label="Times paid"');
    expect(html).toContain('Not paying.');
    expect(html).toContain('>Don&#x27;t pay</button>');
    expect(html).not.toContain('>Cancel<');
  });
});

describe('cast from exile and from the top of the library', () => {
  test('a card exiled to be played is a chip above the hand', async () => {
    const store = await must(mayPlayFromExile, /Impulse Rite/, { seed: 3 });
    const view = store.getState().snapshot?.view as GameView;
    const html = layer(store, <OtherZonesStrip view={view} />);
    expect(html).toContain('aria-label="Cast from exile"');
    expect(html).toMatch(/(Cast|Play) from exile<\/span>/);
  });

  test('the top card of the library: its own chip, and the card beside the library count can be clicked', async () => {
    const store = await must(mayCastFromTop, /Seer Drake/, { seed: 5 });
    const view = store.getState().snapshot?.view as GameView;
    const seat = view.seats[view.viewer] as SeatView;
    const top = seat.libraryTop as ObjectView;
    const html = layer(
      store,
      <>
        <OtherZonesStrip view={view} />
        <PlayerStrip view={view} seat={seat} onOpenZone={none} />
      </>,
    );
    expect(html).toContain('aria-label="Cast from the top of your library"');
    expect(html).toContain(`Top card of your library: ${top.name}, can be cast`);
    expect(html).toMatch(/board-top-card is-clickable/);
    expect(html).toContain('Cast from the top of your library</span>');
  });
});

const obj = (id: string, extra: Partial<ObjectView> = {}): ObjectView =>
  ({
    id,
    name: `Card ${id}`,
    controller: 0,
    owner: 0,
    types: ['creature'],
    subtypes: [],
    counters: {},
    zone: 'battlefield',
    oracleText: '',
    keywords: [],
    colors: [],
    manaCost: null,
    support: 'supported',
    targets: [],
    ...extra,
  }) as unknown as ObjectView;

const viewOf = (objects: readonly ObjectView[], pending: PendingDecision | null): GameView =>
  ({
    viewer: 0,
    turn: 3,
    activeSeat: 0,
    step: 'main1',
    battlefield: objects.filter((o) => o.zone === 'battlefield'),
    stack: objects.filter((o) => o.zone === 'stack'),
    exile: objects.filter((o) => o.zone === 'exile'),
    combat: null,
    seats: [
      { id: 0, hand: [], graveyard: [], command: [], mulligans: 0, poison: 0, manaPool: [] },
      { id: 1, hand: null, graveyard: [], command: [], mulligans: 0, poison: 0, manaPool: [] },
    ],
    pending,
  }) as unknown as GameView;

describe('a mode that may not repeat', () => {
  const trigger = obj('o9', {
    name: 'Thrashing Wyrm',
    zone: 'stack',
    abilitySource: 'o8',
    ability: {
      kind: 'triggered',
      trigger: { kind: 'combatDamageBatch', what: {}, to: 'opponent' },
      effect: { kind: 'sequence', effects: [] },
      chooseModes: { min: 1, max: 1, notRepeatedThisTurn: true },
      modes: [],
    },
  } as never);
  const d = {
    kind: 'chooseModes',
    id: 'd1',
    seat: 0,
    source: 'o9',
    sourceName: 'Thrashing Wyrm',
    sourceOracleText: '',
    purpose: 'trigger',
    modes: [
      { index: 0, text: 'Destroy target artifact.', legal: false },
      { index: 1, text: 'Deal 4 damage to each other opponent.', legal: true },
    ],
    min: 1,
    max: 1,
    sets: [[1]],
    forTrigger: true,
  } as unknown as ChooseModesDecision;

  const render = (withIndex: boolean) => {
    const view = viewOf([trigger], d);
    const ui = initialUi(d);
    const ctl: Controller = { act: none, update: none, openChooser: none };
    return renderToStaticMarkup(
      <ModesDialog
        d={d}
        ui={ui}
        model={buildModel(view, d, ui, ctl)}
        update={none}
        {...(withIndex ? { index: objectIndex(view) } : {})}
      />,
    );
  };

  test('the heading and the reason: already chosen this turn', () => {
    const out = render(true);
    expect(out).toContain('Choose one that hasn&#x27;t been chosen this turn');
    expect(out).toContain('data-legal="false"');
    expect(out).toContain('Already chosen this turn, or no legal target');
    // The reason of an ordinary mode is the targets.
    const plain = render(false);
    expect(plain).toContain('No legal target');
    expect(plain).not.toContain('been chosen this turn');
  });
});

describe('a permanent that copies', () => {
  const glass = obj('o5', {
    name: 'Cursed Looking Glass',
    zone: 'stack',
    types: ['artifact'],
    oracleText:
      'As this artifact enters, you may have it become a copy of any creature on the battlefield until end of turn, except it has haste.',
  });
  const bears = obj('o1', { name: 'Grizzly Bears' });
  const d = {
    kind: 'choosePermanent',
    id: 'd1',
    seat: 0,
    source: 'o5',
    subject: 'o5',
    purpose: 'entersCopy',
    min: 0,
    max: 1,
    legal: ['o1'],
  } as unknown as ChoosePermanentDecision;

  test('the panel says what is copied and offers the creature', async () => {
    const store = createAppStore({ client: new GameHost({ clock: () => 0 }) });
    await store
      .getState()
      .startGame({ seed: 7, humanDeck: 'white-knights', aiDeck: 'swamp-forest' });
    const out = renderToStaticMarkup(
      <StoreProvider store={live(store)}>
        <PermanentPanel
          decision={d}
          view={viewOf([bears, glass], d)}
          ui={initialUi(d)}
          update={none}
        />
      </StoreProvider>,
    );
    expect(out).toContain('aria-label="Permanents to copy"');
    expect(out).toContain('Copy a creature');
    expect(out).toContain('Grizzly Bears');
    expect(out).toContain('become a copy of any creature');
    expect(out).not.toContain('Sacrifice');
  });
});

describe("Discover's question", () => {
  const card = obj('o3', { name: 'Lightning Bolt', zone: 'exile' });
  const d = {
    kind: 'confirmOptional',
    id: 'd1',
    seat: 0,
    source: 'o9',
    sourceName: 'Discovery Rite',
    sourceOracleText: 'Discover 10.',
    purpose: 'cascade',
    subject: 'o3',
  } as unknown as ConfirmOptionalDecision;
  const dialog = (source: ObjectView) => {
    const view = viewOf([source, card], d);
    const ctl: Controller = { act: none, update: none, openChooser: none };
    return renderToStaticMarkup(
      <OptionalDialog
        d={d}
        model={buildModel(view, d, initialUi(d), ctl)}
        index={objectIndex(view)}
      />,
    );
  };

  test('declining says that the card goes into your hand', () => {
    const out = dialog(obj('o9', { zone: 'stack', types: ['sorcery'] }));
    expect(out).toContain('aria-label="Cast without paying"');
    expect(out).toContain(
      'Cast Lightning Bolt without paying its mana cost, or put it into your hand?',
    );
    expect(out).toContain('>Cast it</button>');
    expect(out).toContain('>Put it into your hand</button>');
  });

  test('Cascade keeps its words', () => {
    const out = dialog(
      obj('o9', {
        zone: 'stack',
        abilitySource: 'o8',
        ability: { kind: 'triggered', trigger: {}, effect: { kind: 'cascade' } },
      } as never),
    );
    expect(out).toContain('aria-label="Cascade"');
    expect(out).toContain('Cascade: cast Lightning Bolt without paying its mana cost?');
    expect(out).toContain('>Don&#x27;t cast it</button>');
  });
});

describe('marked mana in a pool', () => {
  const mana = (color: string, extra: Record<string, unknown> = {}) => ({
    color,
    snow: false,
    source: 'o1',
    restriction: null,
    ...extra,
  });

  test('mana with a rider is outlined, and its tooltip says what it does', () => {
    const pool = [
      mana('R', { rider: { kind: 'haste', subtypes: ['Dragon'], types: ['creature'] } }),
      mana('R'),
    ] as unknown as SeatView['manaPool'];
    const out = renderToStaticMarkup(<ManaPool pool={pool} />);
    expect(out).toContain('data-pool="RR"');
    expect(out).toContain('data-pool-restricted="R"');
    expect(out).toContain(
      'title="If spent on a Dragon creature spell, it gains haste until end of turn"',
    );
  });

  test('mana for Dragons and their abilities says both', () => {
    const pool = [
      mana('G', { restriction: { kind: 'spellMatch', subtypes: ['Dragon'], alsoAbilities: true } }),
    ] as unknown as SeatView['manaPool'];
    const out = renderToStaticMarkup(<ManaPool pool={pool} />);
    expect(out).toContain(
      'title="Spend only to cast Dragon spells or activate abilities of Dragons"',
    );
  });

  test('both a restriction and a rider say both', () => {
    const pool = [
      mana('R', {
        restriction: { kind: 'spellMatch', subtypes: ['Dragon'] },
        rider: { kind: 'haste', subtypes: ['Dragon'] },
      }),
    ] as unknown as SeatView['manaPool'];
    const out = renderToStaticMarkup(<ManaPool pool={pool} />);
    expect(out).toContain(
      'Spend only to cast a Dragon spell. If spent on a Dragon spell, it gains haste until end of turn',
    );
  });
});
