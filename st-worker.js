// The site's Python (web/, calc/, review/, bucket/) in a web worker, via Pyodide. The page talks to it through
// st-runtime.js: {id, op, args} in, {id, ok, result | error} out, plus {report} messages while recompute runs.
/* global importScripts, loadPyodide */
const PYODIDE = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/";
importScripts(PYODIDE + "pyodide.js");

self.stReport = (text) => self.postMessage({ report: JSON.parse(text) });

const ready = (async () => {
  const py = await loadPyodide({ indexURL: PYODIDE });
  const version = (await (await fetch("/py/version.json", { cache: "no-cache" })).json()).version;
  const zip = await (await fetch(`/py/bundle.zip?v=${version}`)).arrayBuffer();
  py.FS.mkdirTree("/st");
  py.unpackArchive(zip, "zip", { extractDir: "/st" });
  // the code checks that an icon exists before it links one: an empty file per asset is enough
  const assets = await (await fetch(`/py/assets.txt?v=${version}`)).text();
  for (const rel of assets.split("\n").filter(Boolean)) {
    const dir = "/st/" + rel.split("/").slice(0, -1).join("/");
    py.FS.mkdirTree(dir);
    py.FS.writeFile("/st/" + rel, "");
  }
  py.runPython("import sys; sys.path.insert(0, '/st'); import stsite");
  const st = py.pyimport("stsite");
  st.VERSION = version; // the extension scripts the pages load get ?v=<bundle version>
  return st;
})();

const OPS = {
  api: (st, [method, url, body]) => JSON.parse(st.api(method, url, body ?? null)),
  load: (st, [user, derived]) => JSON.parse(st.load(JSON.stringify(user || {}), derived ? JSON.stringify(derived) : null)),
  put: (st, [rel, text]) => st.put(rel, text ?? null),
  userFiles: (st) => JSON.parse(st.user_files()),
  derivedFiles: (st) => JSON.parse(st.derived_files()),
  recompute: (st) => JSON.parse(st.recompute()),
  catalog: (st) => JSON.parse(st.catalog()),
  boot: (st) => { st.boot(); return true; },
};

self.onmessage = async (e) => {
  const { id, op, args } = e.data;
  try {
    const st = await ready;
    self.postMessage({ id, ok: true, result: OPS[op](st, args || []) });
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err && err.message || err) });
  }
};
