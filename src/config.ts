import { LovelaceCardConfig, Mode, StackInCardConfig } from "./types";

export const modeOf = (config: StackInCardConfig): Mode =>
  config.mode ?? "vertical";

// The Home Assistant stack the card wraps. Without the title, which the
// card shows itself.
export const stackConfigOf = (
  config: StackInCardConfig,
): LovelaceCardConfig => ({
  type: `${modeOf(config)}-stack`,
  cards: config.cards,
});
