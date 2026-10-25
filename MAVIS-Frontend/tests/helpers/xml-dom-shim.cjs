// Minimal XML DOM shim (test-only) — đủ cho drawio-document.ts: mxCell phẳng, getAttribute,
// :scope > mxGeometry, và nhánh text/html cho helper decode. Không phụ thuộc jsdom.
const decodeEntities = (v) =>
  String(v).replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#xa;/g, "\n").replace(/&amp;/g, "&");
const parseAttrs = (raw) => {
  const attrs = {};
  for (const m of raw.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)) attrs[m[1]] = decodeEntities(m[2]);
  return attrs;
};
const htmlText = (value) =>
  String(value ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#xa;/g, "\n")
    .replace(/&amp;/g, "&");
const matchesSelector = function (el, sel) {
  if (sel.indexOf(":scope > ") === 0) {
    const inner = sel.slice(9);
    if (!el.parentElement) return false;
    return el.parentElement.children.indexOf(el) >= 0 && matchesSelector(el, inner);
  }
  if (sel.charAt(0) === "[") {
    const name = sel.slice(1, -1);
    return Object.prototype.hasOwnProperty.call(el.attrs, name);
  }
  return el.tagName === sel;
};
function makeXmlElement(node) {
  const element = {
    tagName: node.tagName,
    localName: node.tagName,
    attrs: node.attrs,
    children: [],
    getAttribute: function (name) {
      return Object.prototype.hasOwnProperty.call(node.attrs, name) ? node.attrs[name] : null;
    },
  };
  for (const child of node.children) {
    if (child.tagName) {
      const childElement = makeXmlElement(child);
      childElement.parentElement = element;
      element.children.push(childElement);
    }
  }
  return element;
}
class DOMParserShim {
  parseFromString(text, kind) {
    if (kind === "text/html") {
      return {
        body: {
          textContent: htmlText(text),
          firstElementChild: { firstElementChild: { textContent: htmlText(text) } },
        },
      };
    }
    const root = { tagName: "#document", attrs: {}, children: [], parent: null };
    let current = root;
    const re = /<(\/?)([a-zA-Z_][\w.:-]*)((?:\s+[\w:-]+\s*=\s*"[^"]*")*)\s*(\/?)>|([^<]+)/g;
    let m;
    let __steps = 0;
    while ((m = re.exec(text)) !== null) {
      if (process.env.S2D_DEBUG && __steps < 40) { console.error('step ' + __steps + ': close=' + JSON.stringify(m[1]) + ' tag=' + JSON.stringify(m[2]) + ' self=' + JSON.stringify(m[4]) + ' text=' + JSON.stringify((m[5] || '').slice(0, 30)) + ' current=' + (current ? current.tagName : 'null')); }
      __steps++;
      if (m[5] !== undefined) {
        if (current) current.children.push({ text: m[5] });
        continue;
      }
      const attrs = parseAttrs(m[3]);
      if (m[1] === "/") {
        current = current.parent;
        continue;
      }
      const node = { tagName: m[2], attrs: attrs, children: [], parent: current };
      if (current) {
        current.children.push(node);
        node.parentElement = current;
      }
      if (m[4] !== "/") current = node;
    }
    const documentShim = makeXmlElement(root);
    const queryAll = function (el, sel) {
      const found = [];
      const walk = function (el) {
        el.children.forEach(function (c) {
          if (matchesSelector(c, sel)) found.push(c);
          walk(c);
        });
      };
      walk(el);
      return found;
    };
    documentShim.querySelectorAll = function (sel) {
      return queryAll(documentShim, sel);
    };
    documentShim.querySelector = function (sel) {
      return documentShim.querySelectorAll(sel)[0] || null;
    };
    return documentShim;
  }
}
module.exports = { DOMParser: DOMParserShim };
