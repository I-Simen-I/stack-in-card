import { LitElement, PropertyValues, css, html, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";

import { loadCardHelpers } from "./card-helpers";
import {
  HomeAssistant,
  LovelaceCard,
  LovelaceCardConfig,
  MODES,
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

// Lit elements, like Home Assistant's cards, render asynchronously
const afterUpdate = async (element: Element): Promise<void> => {
  await (element as Partial<LitElement>).updateComplete;
};

const mergeHaCard = (card: HTMLElement): void => {
  card.style.background = "transparent";
  // Cards have a border since Home Assistant 2022.11
  card.style.border = "none";
  card.style.borderRadius = "0";
  card.style.boxShadow = "none";
};

const computeCardSize = (card: LovelaceCard): number | Promise<number> => {
  if (typeof card.getCardSize === "function") return card.getCardSize();
  if (customElements.get(card.localName)) return 1;
  return customElements
    .whenDefined(card.localName)
    .then(() => computeCardSize(card));
};

@customElement("stack-in-card")
export class StackInCard extends LitElement {
  @state() private _config?: StackInCardConfig;
  @state() private _card?: LovelaceCard;

  private _hass?: HomeAssistant;
  private _preview = false;
  private _cardPromise?: Promise<LovelaceCard>;
  private _restyleTimer?: number;

  // Home Assistant's cards and stacks read these variables, so they are
  // merged from their first paint. Setting the styles after they have
  // rendered (below) shows their borders first, fading out with ha-card's
  // 0.3s transition. The variables only reach the cards inside, not this
  // card's own ha-card.
  static styles = css`
    ha-card {
      overflow: hidden;
    }
    .stack {
      --ha-card-background: transparent;
      --ha-card-border-width: 0px;
      --ha-card-border-radius: 0px;
      --ha-card-box-shadow: none;
      --stack-card-gap: 0px;
      --vertical-stack-card-gap: 0px;
      --horizontal-stack-card-gap: 0px;
      --grid-card-gap: 0px;
    }
  `;

  // HA's stack editor for the cards, with a field for the mode
  static async getConfigElement(): Promise<HTMLElement> {
    await import(/* webpackMode: "eager" */ "./editor");
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

  get hass(): HomeAssistant | undefined {
    return this._hass;
  }

  // Set by the card editor's preview; the stack shows "Empty card" then
  set preview(preview: boolean) {
    this._preview = preview;
    if (this._card) this._card.preview = preview;
  }

  get preview(): boolean {
    return this._preview;
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

  disconnectedCallback(): void {
    super.disconnectedCallback();
    clearTimeout(this._restyleTimer);
  }

  protected render() {
    if (!this._config || !this._card) return nothing;
    return html`
      <ha-card header=${this._config.title ?? nothing}>
        <div class="stack">${this._card}</div>
      </ha-card>
    `;
  }

  protected updated(changed: PropertyValues): void {
    super.updated(changed);
    if (this._card) this._styleStack(this._card);
  }

  private async _createStack(config: LovelaceCardConfig): Promise<void> {
    const promise = this._createCard(config);
    this._cardPromise = promise;
    const card = await promise;
    // setConfig ran again while this stack was created
    if (promise !== this._cardPromise) return;
    // hass and preview may have been set while the card helpers loaded
    if (this._hass) card.hass = this._hass;
    card.preview = this._preview;
    this._card = card;
  }

  private async _createCard(config: LovelaceCardConfig): Promise<LovelaceCard> {
    const helpers = await loadCardHelpers();
    const card = helpers.createCardElement(config);
    card.addEventListener(
      "ll-rebuild",
      (ev) => {
        ev.stopPropagation();
        if (card === this._card) this._createStack(config);
      },
      { once: true },
    );
    return card;
  }

  private _styleStack(card: LovelaceCard): void {
    this._styleTree(card);
    clearTimeout(this._restyleTimer);
    this._restyleTimer = setTimeout(() => {
      if (card === this._card) this._styleTree(card);
    }, RESTYLE_DELAY);
  }

  // Walks down through stacks and other cards that hold cards, and merges
  // every `ha-card` it finds into this one: no background, border, rounded
  // corners, shadow or space between them. That's the point of the card, so
  // none of it can be turned off. The CSS variables in `styles` already do
  // this for cards that use them; this catches the cards that set their own
  // styles, like custom cards.
  private async _styleTree(element: Element): Promise<void> {
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
      this._styleChildren(container);
      return;
    }

    const haCard = element.querySelector<HTMLElement>("ha-card");
    if (haCard) mergeHaCard(haCard);
    this._styleChildren(element);
  }

  private _styleChildren(parent: Element): void {
    for (const child of Array.from(parent.children)) {
      if (!(child instanceof HTMLElement)) continue;
      child.style.margin = "0px";
      this._styleTree(child);
    }
  }
}

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
