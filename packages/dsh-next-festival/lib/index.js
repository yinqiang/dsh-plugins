/**
 * Host half of the next-festival badge.
 *
 * The plugin is browser-only: the Client bundle owns the calendar, the region
 * preference and both slot registrations. The empty apply keeps the package a
 * valid Loader entry, which is what puts its `dsh.client` declaration into the
 * boot graph.
 */

/** Register the browser half; the Loader row itself needs no Host behavior. */
export function apply() {}
