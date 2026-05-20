/** Cache tags shared between Server Components / route handlers and admin
 * mutations that need to invalidate them. Centralized so server components
 * don't have to import from a route file. */

export const RADIO_TRACKS_TAG = "radio-tracks";
export const RELEASES_TAG = "releases";
export const LINK_PAGES_TAG = "link-pages";
export const LINKS_TAG = "links";
