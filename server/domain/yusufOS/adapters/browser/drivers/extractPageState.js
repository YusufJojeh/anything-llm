/**
 * The in-page extraction routine.
 *
 * This function is serialized and evaluated **inside the observed page** by the CDP driver, so it
 * must be self-contained and must not close over anything from the server.
 *
 * It is the one place browser JavaScript runs, and it exists precisely so that Agents never get to
 * run any: the broker executes this fixed, read-only routine and nothing else. It reads; it never
 * clicks, submits, navigates or writes.
 *
 * Its output is raw and untrusted — `pageSanitizer` cleans, clamps and attributes everything
 * afterwards. Nothing here is a security boundary.
 */
function extractPageState() {
  const MAX_NODES = 4000;
  const visible = [];
  const hidden = [];
  const headings = [];
  const links = [];
  const landmarks = [];

  const isHidden = (element) => {
    const style = window.getComputedStyle(element);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.opacity === "0"
    )
      return true;
    // Off-screen positioning and zero-size clipping are the usual ways to hide
    // injected instructions from a human while leaving them in the DOM.
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return true;
    if (rect.bottom < -500 || rect.right < -500) return true;
    // White-on-white and other same-colour tricks.
    if (
      style.color &&
      style.backgroundColor &&
      style.color === style.backgroundColor
    )
      return true;
    return false;
  };

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let seen = 0;
  let node = walker.nextNode();
  while (node && seen < MAX_NODES) {
    seen += 1;
    const text = (node.textContent || "").trim();
    if (text) {
      const parent = node.parentElement;
      const tag = parent ? parent.tagName.toLowerCase() : "";
      // Script and style bodies are code, never page content.
      if (tag !== "script" && tag !== "style" && tag !== "noscript") {
        if (parent && isHidden(parent)) hidden.push(text);
        else visible.push(text);
      }
    }
    node = walker.nextNode();
  }

  document.querySelectorAll("h1,h2,h3,h4,h5,h6").forEach((element) => {
    headings.push({
      level: Number(element.tagName.slice(1)),
      text: (element.textContent || "").trim(),
    });
  });

  document.querySelectorAll("a[href]").forEach((element) => {
    let crossOrigin = false;
    try {
      crossOrigin =
        new URL(element.href, window.location.href).origin !==
        window.location.origin;
    } catch {
      crossOrigin = true;
    }
    links.push({
      text: (element.textContent || "").trim(),
      href: element.href,
      crossOrigin,
    });
  });

  document
    .querySelectorAll("[role], main, nav, header, footer, aside")
    .forEach((element) => {
      landmarks.push({
        role: element.getAttribute("role") || element.tagName.toLowerCase(),
        label:
          element.getAttribute("aria-label") ||
          element.getAttribute("title") ||
          "",
      });
    });

  const frames = Array.from(document.querySelectorAll("iframe"));
  let hasCrossOriginFrames = false;
  for (const frame of frames) {
    try {
      const src = frame.src ? new URL(frame.src, window.location.href) : null;
      if (src && src.origin !== window.location.origin)
        hasCrossOriginFrames = true;
    } catch {
      hasCrossOriginFrames = true;
    }
  }

  return {
    url: window.location.href,
    title: document.title || "",
    visibleText: visible.join("\n"),
    hiddenText: hidden.join("\n"),
    headings,
    links,
    landmarks,
    frameCount: frames.length,
    hasCrossOriginFrames,
  };
}

module.exports = { extractPageState };
