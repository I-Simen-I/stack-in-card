// Only what the card uses. The card passes `hass` on to the stack, and only
// reads the entity ids for the card picker's preview.
export interface HomeAssistant {
  states: Record<string, unknown>;
  [key: string]: unknown;
}

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

export interface KeepConfig {
  background?: boolean;
  border?: boolean;
  border_radius?: boolean;
  box_shadow?: boolean;
  margin?: boolean;
  outer_padding?: boolean;
}

export interface StackInCardConfig {
  type: string;
  title?: string;
  mode?: "vertical" | "horizontal";
  cards: LovelaceCardConfig[];
  keep?: KeepConfig;
}

export interface NormalizedConfig extends StackInCardConfig {
  mode: "vertical" | "horizontal";
  keep: Required<KeepConfig>;
}
