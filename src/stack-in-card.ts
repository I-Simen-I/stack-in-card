import { LitElement, PropertyValues, css, html, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";

import {
  CardHelpers,
  HomeAssistant,
  LovelaceCard,
  LovelaceCardConfig,
  NormalizedConfig,
  StackInCardConfig,
} from "./types";

declare global {
  interface Window {
    loadCardHelpers?: () => Promise<CardHelpers>;
    customCards?: Array<{
      type: string;
      name: string;
      preview: boolean;
      description: string;
    }>;
  }
}

const MODES = ["vertical", "horizontal"];

// Buttons in the card picker's preview when there aren't enough lights or
// switches to show
const STUB_ICONS = ["mdi:lightbulb", "mdi:power-socket-eu", "mdi:fan"];

// Child cards are styled once they have rendered, and again after this
// delay, for cards that render late (custom cards that are still loading)
// or set `--keep-background` / `--keep-border` late (card-mod).
const RESTYLE_DELAY = 500;

let cardHelpers: Promise<CardHelpers> | undefined;

const loadCardHelpers = (): Promise<CardHelpers> => {
  if (!window.loadCardHelpers) {
    return Promise.reject(
      new Error("Home Assistant's card helpers are missing"),
    );
  }
  cardHelpers ??= window.loadCardHelpers();
  return cardHelpers;
};

// Lit elements, like Home Assistant's cards, render asynchronously
const afterUpdate = async (element: Element): Promise<void> => {
  await (element as Partial<LitElement>).updateComplete;
};

// A child card opts out of a style change with a CSS variable set to true,
// for example `--keep-background: true` with card-mod or button-card styles
const hasFlag = (element: Element, name: string): boolean =>
  getComputedStyle(element).getPropertyValue(name).trim() === "true";

const computeCardSize = (card: LovelaceCard): number | Promise<number> => {
  if (typeof card.getCardSize === "function") return card.getCardSize();
  if (customElements.get(card.localName)) return 1;
  return customElements
    .whenDefined(card.localName)
    .then(() => computeCardSize(card));
};

@customElement("stack-in-card")
export class StackInCard extends LitElement {
  @state() private _config?: NormalizedConfig;
  @state() private _card?: LovelaceCard;

  private _hass?: HomeAssistant;
  private _preview = false;
  private _cardPromise?: Promise<LovelaceCard>;
  private _restyleTimer?: number;

  static styles = css`
    ha-card {
      overflow: hidden;
    }
  `;

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
    const keep = {
      background: false,
      border: false,
      border_radius: false,
      box_shadow: false,
      margin: false,
      ...config.keep,
    };
    this._config = {
      ...config,
      mode,
      keep: { ...keep, outer_padding: keep.outer_padding ?? keep.margin },
    };
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
      <ha-card header=${this._config.title ?? nothing}>${this._card}</ha-card>
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
    const { keep } = this._config!;
    this._styleTree(card, false);
    if (keep.outer_padding) {
      afterUpdate(card).then(() => {
        const root = card.shadowRoot?.getElementById("root");
        if (root) root.style.padding = "8px";
      });
    }
    clearTimeout(this._restyleTimer);
    this._restyleTimer = setTimeout(() => {
      if (card === this._card) this._styleTree(card, true);
    }, RESTYLE_DELAY);
  }

  // Walks down through stacks and other cards that hold cards, and styles
  // every `ha-card` it finds. Nested stack-in-cards style themselves.
  private async _styleTree(
    element: Element,
    withBackground: boolean,
  ): Promise<void> {
    await afterUpdate(element);
    const { keep } = this._config!;
    const shadow = element.shadowRoot;

    if (shadow) {
      const haCard = shadow.querySelector<HTMLElement>("ha-card");
      if (haCard) {
        this._styleHaCard(haCard, withBackground);
        return;
      }
      const container =
        shadow.getElementById("root") ?? shadow.getElementById("card");
      if (!container) return;
      // Stacks space their cards with `gap` since Home Assistant 2024.3
      if (!keep.margin) container.style.gap = "0";
      this._styleChildren(container, withBackground);
      return;
    }

    const haCard = element.querySelector<HTMLElement>("ha-card");
    if (haCard) this._styleHaCard(haCard, withBackground);
    this._styleChildren(element, withBackground);
  }

  private _styleChildren(parent: Element, withBackground: boolean): void {
    const { keep } = this._config!;
    for (const child of Array.from(parent.children)) {
      if (!(child instanceof HTMLElement)) continue;
      if (child.localName === "stack-in-card") continue;
      if (!keep.margin) child.style.margin = "0px";
      this._styleTree(child, withBackground);
    }
  }

  private _styleHaCard(card: HTMLElement, withBackground: boolean): void {
    const { keep } = this._config!;
    if (!keep.box_shadow) card.style.boxShadow = "none";
    if (!keep.border_radius) card.style.borderRadius = "0";
    // Cards have a border since Home Assistant 2022.11
    if (!keep.border && !hasFlag(card, "--keep-border")) {
      card.style.border = "none";
    }
    if (
      withBackground &&
      !keep.background &&
      !hasFlag(card, "--keep-background")
    ) {
      card.style.background = "transparent";
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
