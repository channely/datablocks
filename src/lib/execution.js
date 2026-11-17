/**
 * Execution engine for the Javascript block.
 *
 * A hidden same-origin iframe hosts user code and third-party dependencies. The engine assigns
 * the block inputs (`a`, `b`) as iframe globals and evaluates an async function wrapper.
 *
 * Security: the iframe is deliberately NOT sandboxed, because the parent must inject variables
 * and call `eval` from this origin. Treat it as a convenience boundary, not a security boundary
 * against a malicious flow author. Dependencies are loaded from a configurable CDN; keep names
 * pinned (versioned) so builds are reproducible.
 */
const IFRAME_ID = "use-execution-iframe";
const DEPENDENCY_ATTR = "data-dependency";

const DEPENDENCY_CDN = (import.meta.env.VITE_DEPENDENCY_CDN || "https://unpkg.com/").replace(
  /\/?$/,
  "/",
);
// Allow scoped packages and optional version tags; reject anything that looks like a URL.
const DEPENDENCY_NAME = /^(@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*(@[\w.^~-]+)?$/i;

const getDocument = () => (typeof document !== "undefined" ? document : null);

function createIframe() {
  const doc = getDocument();
  if (!doc) return null;
  const existing = doc.getElementById(IFRAME_ID);
  if (existing) return existing;
  const iframe = doc.createElement("iframe");
  iframe.style.display = "none";
  iframe.id = IFRAME_ID;
  doc.body.appendChild(iframe);
  return iframe;
}

function cleanupDependencies(iframe, dependencies = []) {
  const scripts = iframe.contentWindow.document.querySelectorAll(`[${DEPENDENCY_ATTR}]`);
  [].forEach.call(scripts, (script) => {
    const name = script.getAttribute(DEPENDENCY_ATTR);
    if (!dependencies.includes(name)) {
      iframe.contentWindow.document.body.removeChild(script);
    }
  });
}

class ExecutionEngine {
  constructor(dependencies = ["lodash@4.17.21"]) {
    this.iFrame = createIframe();
    this.updateDependencies(dependencies);
  }

  updateDependencies(dependencies) {
    const valid = (dependencies || []).filter((name) => DEPENDENCY_NAME.test(name));
    if (!valid.length) {
      cleanupDependencies(this.iFrame, valid);
    }
    valid.forEach((dependency) => {
      const iframe = this.iFrame;
      new Promise((resolve) => {
        const doc = iframe.contentWindow.document;
        const src = `${DEPENDENCY_CDN}${dependency}`;
        const existing = doc.querySelector(`[${DEPENDENCY_ATTR}='${dependency}']`);
        if (existing) {
          resolve(existing);
        } else {
          const script = doc.createElement("script");
          script.setAttribute(DEPENDENCY_ATTR, dependency);
          doc.body.appendChild(script);
          script.onload = () => resolve(script);
          script.onerror = resolve;
          script.src = src;
        }
      });
    });
    cleanupDependencies(this.iFrame, valid);
  }

  /**
   * Runs `code` inside the iframe with `variables` exposed as globals.
   * @param {string} code JavaScript evaluated in an async wrapper.
   * @param {Record<string, unknown>} variables Inputs for the block (`a`, `b`).
   * @returns {Promise<unknown>} Result of the user code.
   */
  execute(code, variables = {}) {
    if (!this.iFrame) throw new Error("No Iframe created.");
    Object.keys(variables).forEach((key) => {
      this.iFrame.contentWindow[key] = variables[key];
    });
    return this.iFrame.contentWindow.eval(code);
  }
}

const execution = new ExecutionEngine();
export default execution;
