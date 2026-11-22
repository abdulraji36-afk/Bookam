"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { DRINKS_WORDS, sayer, type DepotWords } from "@/lib/depot-words";

const WordsContext = createContext<DepotWords>(DRINKS_WORDS);

/** Gives every form in a business its words (RGB or Returnable, Empties or its own name). */
export function WordsProvider({ words, children }: { words: DepotWords; children: ReactNode }) {
  return <WordsContext.Provider value={words}>{children}</WordsContext.Provider>;
}

/** t("RGB orders") in the business's own words, inside a form in the browser. */
export function useSay() {
  const words = useContext(WordsContext);
  return useMemo(() => sayer(words), [words]);
}

/** The business's word list itself, for choices that differ between drinks and goods. */
export function useWords() {
  return useContext(WordsContext);
}
