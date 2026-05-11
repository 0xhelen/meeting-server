import sanitizeHtml from "sanitize-html";

const SANITIZE_OPTS = {
  allowedTags: ["b", "strong", "i", "em", "u", "br", "p", "div", "ul", "ol", "li"],
  allowedAttributes: {},
};

export function sanitizeAnswerHtml(html) {
  if (typeof html !== "string") return "";
  return sanitizeHtml(html, SANITIZE_OPTS).trim();
}

export function sanitizeAnswersObject(answers) {
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) return {};
  const out = {};
  for (const [k, v] of Object.entries(answers)) {
    if (typeof v === "string") out[k] = sanitizeAnswerHtml(v);
    else out[k] = v;
  }
  return out;
}

/** Plain text for validation (Node, no DOM). */
export function htmlToPlainTextServer(html) {
  if (typeof html !== "string") return "";
  const safe = sanitizeAnswerHtml(html);
  return safe
    .replace(/<[^>]*>/g, "")
    .replace(/\u00a0/g, " ")
    .trim();
}
