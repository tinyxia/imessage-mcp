import { COCOA_EPOCH_OFFSET_S } from "./constants.js";

export function cocoaDateToISO(cocoaNs) {
  if (!cocoaNs || cocoaNs <= 0) return null;
  const unixMs = (cocoaNs / 1_000_000_000 + COCOA_EPOCH_OFFSET_S) * 1000;
  return new Date(unixMs).toISOString();
}

export function isoToCocoaNs(isoString) {
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return null;
  return Math.floor((d.getTime() / 1000 - COCOA_EPOCH_OFFSET_S) * 1_000_000_000);
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function log(level, msg, data = null) {
  const ts = new Date().toISOString();
  const line = data
    ? `[${ts}] [${level}] ${msg} ${JSON.stringify(data)}`
    : `[${ts}] [${level}] ${msg}`;
  console.error(line);
}

export const LOG = {
  info: (m, d) => log("INFO", m, d),
  warn: (m, d) => log("WARN", m, d),
  error: (m, d) => log("ERROR", m, d),
  debug: (m, d) => log("DEBUG", m, d),
};

export function truncate(str, maxLen = 5000, suffix = "\n\n... (truncated)") {
  if (!str || str.length <= maxLen) return str;
  return str.substring(0, maxLen) + suffix;
}

export function splitLongReply(text, maxPartLen = 300) {
  if (text.length <= maxPartLen) return [text];
  const sentences = text.split(/(?<=[。！？\n])/);
  const parts = [];
  let current = "";
  for (const s of sentences) {
    if (current.length + s.length > maxPartLen && current.length > 0) {
      parts.push(current.trim());
      current = s;
    } else {
      current += s;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts.length ? parts : [text.substring(0, maxPartLen)];
}
