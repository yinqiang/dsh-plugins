/**
 * Host half of the solar-term badge.
 *
 * The plugin is browser-only: the Client bundle owns the astronomy, the clock,
 * and the rendering, so the Host registers nothing here. The empty apply keeps
 * the package a valid Loader entry, which is what puts its `dsh.client`
 * declaration into the boot graph.
 */

/** Register the browser half; the Loader row itself needs no Host behavior. */
export function apply() {}
