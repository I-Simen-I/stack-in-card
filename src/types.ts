// Only what the card uses. The card passes `hass` on to the stack; it reads
// the entity ids for the card picker and translations for the editor.
export interface HomeAssistant {
  states: Record<string, unknown>;
  localize?: (key: string) => string;
  [key: string]: unknown;
}

export const MODES = ["vertical", "horizontal"] as const;

export type Mode = (typeof MODES)[number];

export interface LovelaceCardConfig {
  type: string;
  [key: string]: unknown;
}

export interface LovelaceCard extends HTMLElement {
  hass?: HomeAssistant;
  preview?: boolean;
  setConfig(config: LovelaceCardConfig): void;
  getCardSize?(): number | Promise<number>;
}

// What Home Assistant's `window.loadCardHelpers()` resolves to
export interface CardHelpers {
  createCardElement(config: LovelaceCardConfig): LovelaceCard;
}

export interface StackInCardConfig {
  type: string;
  title?: string;
  mode?: Mode;
  cards: LovelaceCardConfig[];
}
