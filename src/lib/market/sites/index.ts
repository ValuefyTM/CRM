import { imobiliare } from "./imobiliare";
import { storia } from "./storia";
import { olx } from "./olx";
import { publi24 } from "./publi24";
import { homezz } from "./homezz";
import type { Site } from "./types";

export const SITES: Record<string, Site> = Object.fromEntries([imobiliare, storia, olx, publi24, homezz].map((x) => [x.name, x]));
export const SOURCES = Object.keys(SITES);
export type { Card, Detail, Site } from "./types";
