import { CardHelpers } from "./types";

declare global {
  interface Window {
    loadCardHelpers?: () => Promise<CardHelpers>;
  }
}

let cardHelpers: Promise<CardHelpers> | undefined;

// Home Assistant's own helpers to create cards, loaded once
export const loadCardHelpers = (): Promise<CardHelpers> => {
  if (!window.loadCardHelpers) {
    return Promise.reject(
      new Error("Home Assistant's card helpers are missing"),
    );
  }
  cardHelpers ??= window.loadCardHelpers();
  return cardHelpers;
};
