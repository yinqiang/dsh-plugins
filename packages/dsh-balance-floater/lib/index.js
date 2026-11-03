/**
 * Host half of the sidebar balance floater.
 *
 * The plugin is browser-only: the client bundle renders the pill and talks to
 * the account Remote directly, so the Host registers nothing here. The empty
 * apply keeps the package a valid Loader entry, which is what puts its
 * `dsh.client` declaration into the boot graph.
 */

/** Register the browser half; the Loader row itself needs no Host behavior. */
export function apply() {}
