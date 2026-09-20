/**
 * App identity, read from package.json at build time so the version is never
 * duplicated in the interface. Vite inlines these as constants.
 */

import { version, description } from "../../package.json";

export const APP_NAME = "MIDI Player";
export const APP_VERSION = version as string;
export const APP_DESCRIPTION = description as string;
