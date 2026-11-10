/**
 * Focus mode, browser half.
 *
 * Shift+Enter toggles a reading view that keeps only the conversation text:
 * the sidebar, right panel, header, composer, message actions and tool-process
 * rows are hidden, and the conversation column expands to the page width.
 * Escape (or Shift+Enter again) restores the normal shell.
 *
 * This file is a hand-written client bundle. `dsh-client-modules` serves it as
 * the package's `./client` export, and the loader expects this exact
 * `window.__ModuleLoader__.load({ id, factory })` wrapper.
 */

const PLUGIN_ID = "dsh-plugin-focus-mode";
const ROOT_ATTR = "data-dsh-focus-mode";
const FRAME_ATTR = "data-dsh-focus-frame";
const CENTER_ATTR = "data-dsh-focus-center";
const CHAT_ATTR = "data-dsh-focus-chat";
const CONVERSATION_ATTR = "data-dsh-focus-conversation";

/** Default readable width, still capped for very wide monitors. */
const CONTENT_WIDTH = "min(calc(100vw - 64px), 1400px)";

/** Persisted reading size, in percent of the app's own font-size settings. */
const FONT_SCALE_KEY = "dsh.focusMode.fontScale.v1";
const FONT_SCALE_DEFAULT = 100;
const FONT_SCALE_MIN = 80;
const FONT_SCALE_MAX = 200;
const FONT_SCALE_STEP = 10;
const FONT_VARIABLES = [
  ["--dsh-content-font-size", 14],
  ["--dsh-code-font-size", 11],
  ["--dsh-terminal-font-size", 13]
];

const STYLE = `
html[${ROOT_ATTR}] [${FRAME_ATTR}] {
  grid-template-columns: 0 minmax(0, 1fr) 0 !important;
  transition: none !important;
  background: var(--dsw-alias-bg-base, #fff) !important;
}

html[${ROOT_ATTR}] [${FRAME_ATTR}]::before,
html[${ROOT_ATTR}] [${FRAME_ATTR}]::after {
  display: none !important;
}

/* Keep the overlay layer: dialogs and other app-level prompts still need to
   appear while the reading view is active. */
html[${ROOT_ATTR}] [${FRAME_ATTR}] > :not([${CENTER_ATTR}]):not([data-shell-overlay]) {
  display: none !important;
}

html[${ROOT_ATTR}] [${CENTER_ATTR}] {
  grid-area: 1 / 2 !important;
  border-left: 0 !important;
  border-right: 0 !important;
  background: var(--dsw-alias-bg-base, #fff) !important;
}

/* The Conversation root has exactly two children: its header and its body.
   Hide the header and every other sibling, leaving the chat body alone. */
html[${ROOT_ATTR}] [${CONVERSATION_ATTR}] > :not([${CHAT_ATTR}]) {
  display: none !important;
}

html[${ROOT_ATTR}] [${CONVERSATION_ATTR}] {
  --dsh-chat-user-width: var(--dsh-focus-content-width, ${CONTENT_WIDTH}) !important;
}

html[${ROOT_ATTR}] [${CHAT_ATTR}] {
  --dsh-chat-content-width: var(--dsh-focus-content-width, ${CONTENT_WIDTH}) !important;
}

html[${ROOT_ATTR}] [data-composer-seat],
html[${ROOT_ATTR}] [data-conversation-composer-overlay],
html[${ROOT_ATTR}] [data-composer-overlay],
html[${ROOT_ATTR}] [data-width-handle],
html[${ROOT_ATTR}] [data-conversation-header-leading],
html[${ROOT_ATTR}] [data-conversation-header-corner],
html[${ROOT_ATTR}] [data-conversation-tabs] {
  display: none !important;
}

/* Tool calls, reasoning process rows, timings, usage details and message
   action buttons are application chrome rather than conversation text. */
html[${ROOT_ATTR}] [data-chat-flow-kind="turn-process"],
html[${ROOT_ATTR}] [data-chat-flow-kind="turn-tail"],
html[${ROOT_ATTR}] [data-chat-flow-kind="turn-trigger"],
html[${ROOT_ATTR}] [data-turn-process],
html[${ROOT_ATTR}] [data-step-process],
html[${ROOT_ATTR}] [data-chat-turn-spacer],
html[${ROOT_ATTR}] [data-assistant-timing],
html[${ROOT_ATTR}] [data-turn-usage-details],
html[${ROOT_ATTR}] [data-actions-reveal],
html[${ROOT_ATTR}] [data-clock],
html[${ROOT_ATTR}] [data-chat-running],
html[${ROOT_ATTR}] [data-shimmer="true"],
html[${ROOT_ATTR}] [class*="toBottomSlot"],
html[${ROOT_ATTR}] [class*="_older"],
html[${ROOT_ATTR}] [${CHAT_ATTR}] nav[class*="_frame"] {
  display: none !important;
}

/* The transcript still scrolls, but its scrollbar and turn-marker rail are
   navigation chrome rather than reading matter. */
html[${ROOT_ATTR}] [data-conversation-scroll] {
  scrollbar-width: none !important;
  scrollbar-gutter: auto !important;
}

html[${ROOT_ATTR}] [data-conversation-scroll]::-webkit-scrollbar {
  width: 0 !important;
  height: 0 !important;
}

html[${ROOT_ATTR}] [data-conversation-scroll]:focus {
  outline: none !important;
}

/* User messages keep their text and attachments but lose the bubble chrome,
   so the reading surface is closer to plain text on both sides. */
html[${ROOT_ATTR}] [data-message-bubble] {
  background: transparent !important;
  border-color: transparent !important;
  box-shadow: none !important;
  color: inherit !important;
}

html[${ROOT_ATTR}] [data-message-bubble]::before,
html[${ROOT_ATTR}] [data-message-bubble]::after {
  display: none !important;
}
`;

let active = false;
let currentLayout = null;
let restoreTarget = null;
let focusedScroller = null;
let scrollerTabindexAdded = false;
let rafId = 0;
let fontScale = readStoredFontScale();
let savedFonts = null;
let fontBases = null;

/** Return a visible Conversation body, or null when there is nothing to read. */
function findLayout() {
  const chat = document.querySelector('[data-conversation-region="chat"]');
  if (!chat || !chat.getAttribute("data-conversation-session")) return null;
  /* Do not turn an empty hero session into a blank page: focus mode is for
     reading an existing transcript. */
  if (chat.querySelector("[data-chat-flow-key]") === null) return null;
  if (typeof chat.getBoundingClientRect === "function") {
    const rect = chat.getBoundingClientRect();
    if (!(rect.width > 0 && rect.height > 0)) return null;
  }

  let frame = chat.parentElement;
  while (frame && frame !== document.body) {
    if (Array.from(frame.children).some((child) => child.hasAttribute("data-shell-overlay"))) break;
    frame = frame.parentElement;
  }
  if (!frame || frame === document.body) return null;

  let center = chat;
  while (center.parentElement && center.parentElement !== frame) center = center.parentElement;
  if (center.parentElement !== frame) return null;

  return { frame, center, chat, conversation: chat.parentElement };
}

/** Put the focus markers on the live frame, center column and conversation. */
function markLayout(layout) {
  layout.frame.setAttribute(FRAME_ATTR, "");
  layout.center.setAttribute(CENTER_ATTR, "");
  layout.chat.setAttribute(CHAT_ATTR, "");
  if (layout.conversation) layout.conversation.setAttribute(CONVERSATION_ATTR, "");
}

/** Remove every marker, including markers left on nodes React has replaced. */
function clearMarkers() {
  for (const attr of [FRAME_ATTR, CENTER_ATTR, CHAT_ATTR, CONVERSATION_ATTR]) {
    for (const element of document.querySelectorAll(`[${attr}]`)) element.removeAttribute(attr);
  }
}

function sameLayout(left, right) {
  return (
    left.frame === right.frame &&
    left.center === right.center &&
    left.chat === right.chat &&
    left.conversation === right.conversation
  );
}

function rememberAndBlur() {
  const focused = document.activeElement;
  if (focused && focused !== document.body && typeof focused.blur === "function") {
    restoreTarget = focused;
    focused.blur();
  } else {
    restoreTarget = null;
  }
}

function restoreFocus() {
  const target = restoreTarget;
  restoreTarget = null;
  if (!target || !target.isConnected || typeof target.focus !== "function") return;
  try {
    target.focus({ preventScroll: true });
  } catch {
    target.focus();
  }
}

/** Give the transcript keyboard focus so PageUp/PageDown and arrows scroll it. */
function focusScroller(chat) {
  const scroller = chat.querySelector("[data-conversation-scroll]");
  if (!scroller) return;
  focusedScroller = scroller;
  if (!scroller.hasAttribute("tabindex")) {
    scroller.setAttribute("tabindex", "-1");
    scrollerTabindexAdded = true;
  }
  try {
    scroller.focus({ preventScroll: true });
  } catch {
    scroller.focus();
  }
}

function releaseScroller() {
  if (focusedScroller !== null && scrollerTabindexAdded && focusedScroller.isConnected) {
    focusedScroller.removeAttribute("tabindex");
  }
  focusedScroller = null;
  scrollerTabindexAdded = false;
}

/** Keep the reading size on a 10% grid, within the supported range. */
function normalizeFontScale(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return FONT_SCALE_DEFAULT;
  const rounded = Math.round(numeric / FONT_SCALE_STEP) * FONT_SCALE_STEP;
  return Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, rounded));
}

function readStoredFontScale() {
  try {
    const raw = globalThis.localStorage.getItem(FONT_SCALE_KEY);
    if (raw === null) return FONT_SCALE_DEFAULT;
    return normalizeFontScale(Number.parseInt(raw, 10));
  } catch {
    return FONT_SCALE_DEFAULT;
  }
}

function saveFontScale() {
  try {
    globalThis.localStorage.setItem(FONT_SCALE_KEY, String(fontScale));
  } catch {
    /* Private mode or a blocked storage area: the in-page value still works. */
  }
}

/** Read the app's current font settings once, before overriding them. */
function captureFontBases() {
  if (!document.body) return;
  const style = getComputedStyle(document.body);
  fontBases = FONT_VARIABLES.map(([name, fallback]) => {
    const value = Number.parseFloat(style.getPropertyValue(name));
    return { name, base: Number.isFinite(value) && value > 0 ? value : fallback };
  });
}

/**
 * The theme derives every secondary size and line height from these three
 * variables on <body>, so scaling them reflows headings, code and prose
 * together instead of stretching only one of them.
 */
function applyFontScale() {
  if (!fontBases || !document.body) return;
  const factor = fontScale / 100;
  for (const { name, base } of fontBases) {
    document.body.style.setProperty(name, `${(base * factor).toFixed(2)}px`);
  }
}

function beginFontScale() {
  if (!document.body) return;
  endFontScale();
  savedFonts = FONT_VARIABLES.map(([name]) => ({
    name,
    value: document.body.style.getPropertyValue(name),
    priority: document.body.style.getPropertyPriority(name)
  }));
  captureFontBases();
  applyFontScale();
}

function endFontScale() {
  if (savedFonts && document.body) {
    for (const { name, value, priority } of savedFonts) {
      if (value === "") document.body.style.removeProperty(name);
      else document.body.style.setProperty(name, value, priority);
    }
  }
  savedFonts = null;
  fontBases = null;
}

function changeFontScale(delta) {
  const next = normalizeFontScale(fontScale + delta);
  if (next === fontScale) return false;
  fontScale = next;
  applyFontScale();
  saveFontScale();
  return true;
}

function resetFontScale() {
  if (fontScale === FONT_SCALE_DEFAULT) return false;
  fontScale = FONT_SCALE_DEFAULT;
  applyFontScale();
  saveFontScale();
  return true;
}

/**
 * Enter or leave the reading view.
 * @param {boolean} next wanted state
 * @returns {boolean} whether the state changed (entering needs a visible chat)
 */
function setFocus(next) {
  if (next === active) return true;

  if (next) {
    const layout = findLayout();
    if (layout === null) return false;
    clearMarkers();
    markLayout(layout);
    currentLayout = layout;
    active = true;
    document.documentElement.setAttribute(ROOT_ATTR, "");
    beginFontScale();
    rememberAndBlur();
    focusScroller(layout.chat);
  } else {
    document.documentElement.removeAttribute(ROOT_ATTR);
    active = false;
    currentLayout = null;
    endFontScale();
    releaseScroller();
    clearMarkers();
    restoreFocus();
  }
  return true;
}

function scheduleReapply() {
  if (!active || rafId !== 0) return;
  rafId = window.requestAnimationFrame(() => {
    rafId = 0;
    if (!active) return;
    const layout = findLayout();
    if (layout === null) {
      setFocus(false);
      return;
    }
    if (
      currentLayout !== null &&
      sameLayout(currentLayout, layout) &&
      layout.frame.hasAttribute(FRAME_ATTR) &&
      layout.center.hasAttribute(CENTER_ATTR) &&
      layout.chat.hasAttribute(CHAT_ATTR) &&
      (layout.conversation === null || layout.conversation.hasAttribute(CONVERSATION_ATTR))
    ) {
      return;
    }
    clearMarkers();
    markLayout(layout);
    currentLayout = layout;
  });
}

/** A modal keeps its own Escape/accelerator behavior; do not steal input from it. */
function modalOpen() {
  return document.querySelector('[role="dialog"], [role="menu"], dialog[open]') !== null;
}

/** Never turn a typing key into a reading command inside a form control. */
function isEditableTarget(event) {
  const path = typeof event.composedPath === "function" ? event.composedPath() : [];
  let target = null;
  for (const node of path) {
    if (node && typeof node.closest === "function") {
      target = node;
      break;
    }
  }
  if (target === null) target = document.activeElement;
  return !!(target && typeof target.closest === "function" &&
    target.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]'));
}

/** + / = / numpad plus, but never Ctrl+Plus or AltGr+Plus. */
function isPlusKey(event) {
  if (event.ctrlKey || event.altKey || event.metaKey || isAltGraph(event)) return false;
  return event.key === "+" || event.key === "=" || event.code === "NumpadAdd";
}

/** - / numpad minus, without modifiers. */
function isMinusKey(event) {
  if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey || isAltGraph(event)) return false;
  return event.key === "-" || event.code === "NumpadSubtract";
}

/** 0 / numpad zero restores the 100% reading size. */
function isResetKey(event) {
  if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey || isAltGraph(event)) return false;
  return event.key === "0" || event.code === "Numpad0";
}

/** AltGr is reported as a dedicated AltGraph modifier or as Ctrl+Alt. */
function isAltGraph(event) {
  if (typeof event.getModifierState === "function" && event.getModifierState("AltGraph")) return true;
  return event.ctrlKey && event.altKey;
}

function onKeyDown(event) {
  if (event.isComposing || event.keyCode === 229 || event.repeat) return;

  if ((event.key === "Escape" || event.key === "Esc") && active) {
    if (modalOpen()) return;
    if (setFocus(false)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
    return;
  }

  /* Global reading-view toggle. Shift+Enter no longer inserts a newline. */
  if (
    event.key === "Enter" &&
    event.shiftKey &&
    !event.ctrlKey &&
    !event.altKey &&
    !event.metaKey &&
    !isAltGraph(event)
  ) {
    if (modalOpen()) return;
    if (setFocus(!active)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
    return;
  }

  if (!active || modalOpen() || isEditableTarget(event)) return;

  if (isPlusKey(event)) {
    changeFontScale(FONT_SCALE_STEP);
    event.preventDefault();
    event.stopImmediatePropagation();
    return;
  }

  if (isMinusKey(event)) {
    changeFontScale(-FONT_SCALE_STEP);
    event.preventDefault();
    event.stopImmediatePropagation();
    return;
  }

  if (isResetKey(event)) {
    resetFontScale();
    event.preventDefault();
    event.stopImmediatePropagation();
  }
}

/**
 * Client plugin body.
 * @param {import('@deepseek-ai/cordis').Context} ctx client root context
 */
function apply(ctx) {
  ctx.effect(() => {
    const tag = document.createElement("style");
    tag.dataset.plugin = PLUGIN_ID;
    tag.dataset.pluginCss = `${PLUGIN_ID}/focus-mode.css`;
    tag.textContent = STYLE;
    document.head.append(tag);
    return () => {
      tag.remove();
    };
  }, `${PLUGIN_ID}: styles`);

  ctx.effect(() => {
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, `${PLUGIN_ID}: keyboard`);

  ctx.effect(() => {
    const observer = new MutationObserver(scheduleReapply);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", scheduleReapply);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", scheduleReapply);
      if (rafId !== 0) {
        window.cancelAnimationFrame(rafId);
        rafId = 0;
      }
      setFocus(false);
    };
  }, `${PLUGIN_ID}: live layout`);
}

window.__ModuleLoader__.load({
  id: PLUGIN_ID,
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    exports.apply = apply;
    return module.exports;
  }
});
