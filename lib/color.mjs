/**
 * ANSI colour. Off by default so piped output, CI logs and tests stay plain text;
 * the bin turns it on when it is talking to a real terminal.
 */
let enabled = false;

export function setColor(on) {
    enabled = Boolean(on);
}

/** A real terminal, unless the environment says otherwise. Honours NO_COLOR and FORCE_COLOR. */
export function detectColor(stream = process.stdout, env = process.env) {
    if (env.NO_COLOR !== undefined && env.NO_COLOR !== "") return false;
    if (env.FORCE_COLOR !== undefined && env.FORCE_COLOR !== "0") return true;
    if (env.TERM === "dumb") return false;
    return Boolean(stream && stream.isTTY);
}

const wrap = (open, close) => (text) => (enabled ? `\x1b[${open}m${text}\x1b[${close}m` : String(text));

export const red = wrap(31, 39);
export const green = wrap(32, 39);
export const yellow = wrap(33, 39);
export const dim = wrap(2, 22);
export const bold = wrap(1, 22);

/** 1 is a problem, 3 is a compromise, 5 is done. The bars carry that without a legend. */
export function byScore(score, text) {
    if (score >= 5) return green(text);
    if (score >= 3) return yellow(text);
    return red(text);
}
