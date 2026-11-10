/**
 * Focus mode, host half.
 *
 * The feature is entirely browser-side. This empty host plugin exists so the
 * profile Loader has a row to mount; the browser bundle is discovered through
 * `exports["./client"]` and the package.json `dsh.client` declaration.
 */

/** Host plugin body — no host-side behavior for this UI-only plugin. */
export function apply() {}
