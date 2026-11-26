import { loadCardHelpers } from "./card-helpers";
import "./editor";
import {
  HomeAssistant,
  LovelaceCard,
  LovelaceCardConfig,
  MODES,
  Mode,
  StackInCardConfig,
} from "./types";

declare global {
  interface Window {
    customCards?: Array<{
      type: string;
      name: string;
      preview: boolean;
      description: string;
    }>;
  }
}

// Buttons in the card picker's preview when there aren't enough lights or
// switches to show
const STUB_ICONS = ["mdi:lightbulb", "mdi:power-socket-eu", "mdi:fan"];

// Child cards are styled once they have rendered, and again after this
// delay, for cards that render late (custom cards that are still loading)
const RESTYLE_DELAY = 500;

// Home Assistant's cards are Lit elements, which render asynchronously
const afterUpdate = async (element: Element): Promise<void> => {
  await (element as { updateComplete?: Promise<unknown> }).updateComplete;
};

// Home Assistant's cards and stacks read these variables, so they are
// merged from their first paint. The card doesn't clip what's inside it
// (no overflow: hidden), so menus and tooltips of the cards inside can reach
// outside it; the cards in its corners get its rounded corners instead (see
// _styleTree). Styles set after they have rendered (see
// _styleTree) show their borders first, fading out with ha-card's 0.3s
// transition. The variables only reach the cards inside, not this card's
// own ha-card.
const STYLES = `
  /* Fill the height a sections dashboard gives the card (its rows) */
  :host {
    display: block;
    height: 100%;
  }
  ha-card {
    display: flex;
    flex-direction: column;
    height: 100%;
  }
  .stack {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;
    --ha-card-background: transparent;
    --ha-card-border-width: 0px;
    --ha-card-border-radius: 0px;
    --ha-card-box-shadow: none;
    --stack-card-gap: 0px;
    --vertical-stack-card-gap: 0px;
    --horizontal-stack-card-gap: 0px;
    --grid-card-gap: 0px;
  }
  .stack > * {
    flex: 1;
    min-height: 0;
  }
`;

const mergeHaCard = (card: HTMLElement): void => {
  card.style.background = "transparent";
  // Cards have a border since Home Assistant 2022.11
  card.style.border = "none";
  // The corners _styleTree gives the card, or none
  card.style.borderRadius = "var(--ha-card-border-radius, 0px)";
  card.style.boxShadow = "none";
};

// Radius of each corner: top left, top right, bottom right, bottom left
type Corners = [string, string, string, string];

const NO_CORNERS: Corners = ["0px", "0px", "0px", "0px"];

// The corners of a stack that the card at `index` touches
const childCorners = (
  corners: Corners,
  layout: Mode | undefined,
  index: number,
  count: number,
): Corners => {
  const first = index === 0;
  const last = index === count - 1;
  const [tl, tr, br, bl] = corners;
  const pick = (corner: string, touches: boolean) => (touches ? corner : "0px");
  if (layout === "vertical") {
    return [pick(tl, first), pick(tr, first), pick(br, last), pick(bl, last)];
  }
  if (layout === "horizontal") {
    return [pick(tl, first), pick(tr, last), pick(br, last), pick(bl, first)];
  }
  // Grids and unknown containers: only a single card fills the corners
  return count === 1 ? corners : NO_CORNERS;
};

const STACK_LAYOUTS: Record<string, Mode> = {
  "hui-vertical-stack-card": "vertical",
  "hui-horizontal-stack-card": "horizontal",
};

// How much of a stack a card inside takes, from its own grid_options:
// `columns` in a horizontal stack, `rows` in a vertical one, as relative
// weights, like nested-lovelace-card. Anything but a positive number
// ("full", "auto") counts as not set.
const GRID_SIZE: Record<Mode, "columns" | "rows"> = {
  horizontal: "columns",
  vertical: "rows",
};

const sizeOf = (huiCard: Element, layout: Mode): number | undefined => {
  const { config } = huiCard as { config?: LovelaceCardConfig };
  const options = config?.grid_options as Record<string, unknown> | undefined;
  const size = Number(options?.[GRID_SIZE[layout]]);
  return size > 0 ? size : undefined;
};

// Gives a card in a stack its share. Horizontal: cards without `columns`
// get 1, so they keep equal widths. Vertical: cards without `rows` keep
// their own height, and the cards with `rows` share the rest and fill it.
const setSize = (
  huiCard: HTMLElement,
  layout: Mode,
  size: number | undefined,
): void => {
  const card = huiCard.firstElementChild as HTMLElement | null;
  if (layout === "horizontal") {
    // hui-card is display: contents here, so the card is the flex item
    const weight = size ?? 1;
    card?.style.setProperty("flex", `${weight} ${weight} 0`);
    return;
  }
  huiCard.style.flex = size ? `${size} ${size} 0` : "0 0 auto";
  huiCard.style.minHeight = "0";
  if (size) card?.style.setProperty("height", "100%");
};

const computeCardSize = (card: LovelaceCard): number | Promise<number> => {
  if (typeof card.getCardSize === "function") return card.getCardSize();
  if (customElements.get(card.localName)) return 1;
  return customElements
    .whenDefined(card.localName)
    .then(() => computeCardSize(card));
};

export class StackInCard extends HTMLElement {
  private _config?: StackInCardConfig;
  private _card?: LovelaceCard;
  private _hass?: HomeAssistant;
  private _preview = false;
  private _cardPromise?: Promise<LovelaceCard>;
  private _restyleTimer?: number;

  // HA's stack editor for the cards, with a field for the mode
  static getConfigElement(): HTMLElement {
    return document.createElement("stack-in-card-editor");
  }

  // Shown in the card picker and used as the starting config: a weather
  // card above three buttons side by side, so the preview shows them all
  // merged into one card. Uses the entities the picker suggests first, like
  // Home Assistant's own weather and button cards. Without a weather entity
  // the weather card is left out; without lights or switches the buttons
  // only show an icon.
  static getStubConfig(
    hass?: HomeAssistant,
    entities: string[] = [],
    entitiesFallback: string[] = [],
  ): Partial<StackInCardConfig> {
    const candidates = [
      ...new Set([
        ...entities,
        ...entitiesFallback,
        ...Object.keys(hass?.states ?? {}),
      ]),
    ];
    const weather = candidates.find((id) => id.startsWith("weather."));
    const switches = candidates.filter((id) => /^(light|switch)\./.test(id));
    const buttons = {
      type: "horizontal-stack",
      cards: STUB_ICONS.map((icon, i) =>
        switches[i]
          ? { type: "button", entity: switches[i] }
          : { type: "button", icon },
      ),
    };
    return {
      cards: weather
        ? [{ type: "weather-forecast", entity: weather }, buttons]
        : [buttons],
    };
  }

  set hass(hass: HomeAssistant) {
    this._hass = hass;
    if (this._card) this._card.hass = hass;
  }

  // Set by the card editor's preview; the stack shows "Empty card" then
  set preview(preview: boolean) {
    this._preview = preview;
    if (this._card) this._card.preview = preview;
  }

  setConfig(config: StackInCardConfig): void {
    if (!config || !Array.isArray(config.cards)) {
      throw new Error("Add the cards to stack under `cards`");
    }
    const mode = config.mode ?? "vertical";
    if (!MODES.includes(mode)) {
      throw new Error(`Unknown mode: ${mode}. Use vertical or horizontal`);
    }
    this._config = config;
    this._createStack({ type: `${mode}-stack`, cards: config.cards });
  }

  async getCardSize(): Promise<number> {
    const card = await this._cardPromise;
    return card ? computeCardSize(card) : 0;
  }

  // Dashboards render cards before they're on the page and move them
  // around (masonry columns, views), which stops the second styling pass.
  // The corners can only be read on the page, so style again here.
  connectedCallback(): void {
    if (this._card) this._styleStack(this._card);
  }

  disconnectedCallback(): void {
    clearTimeout(this._restyleTimer);
  }

  private async _createStack(config: LovelaceCardConfig): Promise<void> {
    const promise = loadCardHelpers().then((helpers) =>
      helpers.createCardElement(config),
    );
    this._cardPromise = promise;
    const card = await promise;
    // setConfig ran again while this stack was created
    if (promise !== this._cardPromise) return;
    card.addEventListener(
      "ll-rebuild",
      (ev) => {
        ev.stopPropagation();
        if (card === this._card) this._createStack(config);
      },
      { once: true },
    );
    // hass and preview may have been set while the card helpers loaded
    if (this._hass) card.hass = this._hass;
    card.preview = this._preview;
    this._card = card;
    this._render(card);
  }

  private _render(card: LovelaceCard): void {
    const shadow = this.shadowRoot ?? this.attachShadow({ mode: "open" });
    if (!shadow.firstChild) {
      shadow.innerHTML = `<style>${STYLES}</style><ha-card><div class="stack"></div></ha-card>`;
    }
    const haCard = shadow.querySelector("ha-card")!;
    const title = this._config?.title;
    if (title) haCard.setAttribute("header", title);
    else haCard.removeAttribute("header");
    haCard.firstElementChild!.replaceChildren(card);
    this._styleStack(card);
  }

  private _styleStack(card: LovelaceCard): void {
    this._styleTree(card, this._corners());
    clearTimeout(this._restyleTimer);
    this._restyleTimer = setTimeout(() => {
      if (card === this._card) this._styleTree(card, this._corners());
    }, RESTYLE_DELAY);
  }

  // The rounded corners of this card's ha-card that the cards inside reach:
  // all of them, except the top ones under a title. Read from the rendered
  // card, so they follow the theme, and a nested stack-in-card gets the
  // corners the outer one gave it.
  private _corners(): Corners {
    const haCard = this.shadowRoot?.querySelector("ha-card");
    if (!haCard?.isConnected) return NO_CORNERS;
    const style = getComputedStyle(haCard);
    const radius = (corner: string) => style.getPropertyValue(corner) || "0px";
    const top = !haCard.hasAttribute("header");
    return [
      top ? radius("border-top-left-radius") : "0px",
      top ? radius("border-top-right-radius") : "0px",
      radius("border-bottom-right-radius"),
      radius("border-bottom-left-radius"),
    ];
  }

  // Walks down through stacks and other cards that hold cards, and merges
  // every `ha-card` it finds into this one: no background, border, rounded
  // corners, shadow or space between them. That's the point of the card, so
  // none of it can be turned off. The CSS variables in `STYLES` already do
  // this for cards that use them; this catches the cards that set their own
  // styles, like custom cards.
  //
  // It also gives every card the corners of this card it touches, as
  // --ha-card-border-radius, so pictures in the corners follow its rounded
  // corners without it clipping them.
  private async _styleTree(element: Element, corners: Corners): Promise<void> {
    await afterUpdate(element);
    const shadow = element.shadowRoot;

    if (shadow) {
      // Also a nested stack-in-card, which merges its own cards
      const haCard = shadow.querySelector<HTMLElement>("ha-card");
      if (haCard) {
        mergeHaCard(haCard);
        return;
      }
      const container =
        shadow.getElementById("root") ?? shadow.getElementById("card");
      if (!container) return;
      // Stacks space their cards with `gap` since Home Assistant 2024.3
      container.style.gap = "0";
      this._styleChildren(container, corners, STACK_LAYOUTS[element.localName]);
      return;
    }

    // A wrapper like hui-card: its card fills the same corners
    const haCard = element.querySelector<HTMLElement>("ha-card");
    if (haCard) mergeHaCard(haCard);
    this._styleChildren(element, corners, undefined, true);
  }

  private _styleChildren(
    parent: Element,
    corners: Corners,
    layout?: Mode,
    wrapper = false,
  ): void {
    const children = Array.from(parent.children).filter(
      (child): child is HTMLElement => child instanceof HTMLElement,
    );
    // Only when a card inside sets its size, so stacks without stay as
    // Home Assistant lays them out
    const sizes = layout ? children.map((child) => sizeOf(child, layout)) : [];
    const sized = sizes.some((size) => size !== undefined);
    children.forEach((child, index) => {
      if (layout && sized) setSize(child, layout, sizes[index]);
      const own = wrapper
        ? corners
        : childCorners(corners, layout, index, children.length);
      child.style.margin = "0px";
      child.style.setProperty("--ha-card-border-radius", own.join(" "));
      this._styleTree(child, own);
    });
  }
}

customElements.define("stack-in-card", StackInCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "stack-in-card",
  name: "Stack In Card",
  preview: true,
  description: "Group several cards into one card, without borders",
});

console.info(
  `%c Stack In Card %c ${__VERSION__} `,
  "background-color: #555;color: #fff;padding: 3px 2px 3px 3px;border-radius: 14px 0 0 14px;font-family: DejaVu Sans,Verdana,Geneva,sans-serif;text-shadow: 0 1px 0 rgba(1, 1, 1, 0.3)",
  "background-color: #e68a00;color: #fff;padding: 3px 3px 3px 2px;border-radius: 0 14px 14px 0;font-family: DejaVu Sans,Verdana,Geneva,sans-serif;text-shadow: 0 1px 0 rgba(1, 1, 1, 0.3)",
);
