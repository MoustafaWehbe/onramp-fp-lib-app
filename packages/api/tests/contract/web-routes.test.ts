import fs from "node:fs";
import path from "node:path";
import { app } from "../../app";

// The web/API contract: every request path the frontend issues must resolve
// against a route the API actually registers. This exists because the metrics
// page 404'd for weeks — analytics.test.ts exercised /analytics/summary while
// the hook requested /analytics, and nothing compared the two.
//
// Frontend paths come from a source scan of apiClient calls; template
// literals normalise to :param segments (`/books/${id}` -> `/books/:param`,
// never truncated — truncation is what made the crude version of this test
// noisy). The route table comes from walking the mounted express app itself,
// so a route that moves or unmounts fails the test without any list to
// hand-maintain.

const WEB_SRC = path.resolve(__dirname, "../../../web/src");

interface FrontendCall {
  method: string;
  path: string;
  file: string;
}

/** `${anything}` becomes `:param`; quotes and backticks are stripped. */
function normaliseArg(raw: string): string {
  return raw
    .replace(/\$\{[^}]*\}/g, ":param")
    .replace(/^[`'"]|[`'"]$/g, "")
    .trim();
}

function scanWebSources(): FrontendCall[] {
  const calls: FrontendCall[] = [];
  const files: string[] = [];
  (function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(entry.name)) files.push(full);
    }
  })(WEB_SRC);

  // apiClient.get<...>("/path"...) — the generic parameter is optional, the
  // first argument is a string or template literal. Template literals may
  // carry quotes INSIDE ${...} (`/x/${a ? "y" : "z"}`), so each quote style
  // is matched to its own closer rather than to any quote character.
  const firstArg = `(\`[^\`]*\`|'[^']*'|"[^"]*")`;
  const callRe = new RegExp(
    `apiClient\\.(get|post|put|patch|delete)(?:<[^>]*>)?\\(\\s*${firstArg}`,
    "g",
  );
  // The refresh interceptor uses raw axios with an absolute /api path.
  const axiosRe = new RegExp(
    `axios\\.(get|post|put|patch|delete)(?:<[^>]*>)?\\(\\s*${firstArg}`,
    "g",
  );

  for (const file of files) {
    const src = fs.readFileSync(file, "utf8");
    for (const re of [callRe, axiosRe]) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src)) !== null) {
        let p = normaliseArg(m[2]!);
        if (p.startsWith("/api/")) p = p.slice(4); // absolute axios calls
        if (!p.startsWith("/")) continue;
        calls.push({
          method: m[1]!.toUpperCase(),
          path: p,
          file: path.relative(WEB_SRC, file),
        });
      }
    }
  }
  return calls;
}

interface RegisteredRoute {
  method: string;
  path: string;
}

/** Recover a mount prefix ("/books", "/shelves/:shelfId/shares") from the
 *  layer regexp express keeps, using layer.keys for param names. */
function mountPathOf(layer: {
  regexp: RegExp;
  keys?: { name: string | number }[];
}): string {
  // Express 4 mounts look like ^\/shelves(?:\/([^/]+?))\/shares\/?(?=\/|$) —
  // the param group swallows its own slash, so the replacement restores it.
  let src = layer.regexp.source
    .replace(/^\^/, "")
    .replace(/\\\/\?\(\?=\\\/\|\$\)$/, "")
    .replace(/\$\/?$/, "");
  const keys = layer.keys ?? [];
  let i = 0;
  src = src.replace(/\(\?:\\\/\(\[\^\\?\/\]\+\?\)\)/g, () => {
    const key = keys[i++];
    return `/:${String(key?.name ?? "param")}`;
  });
  src = src.replace(/\\\//g, "/");
  return src === "/" ? "" : src;
}

function walkRouter(
  stack: {
    route?: { path: string; methods: Record<string, boolean> };
    name: string;
    handle: { stack?: unknown[] };
    regexp: RegExp;
    keys?: { name: string | number }[];
  }[],
  prefix: string,
  out: RegisteredRoute[],
): void {
  for (const layer of stack) {
    if (layer.route) {
      for (const method of Object.keys(layer.route.methods)) {
        out.push({
          method: method.toUpperCase(),
          path: prefix + (layer.route.path === "/" ? "" : layer.route.path),
        });
      }
    } else if (layer.name === "router" && layer.handle.stack) {
      walkRouter(
        layer.handle.stack as Parameters<typeof walkRouter>[0],
        prefix + mountPathOf(layer),
        out,
      );
    }
  }
}

function registeredRoutes(): RegisteredRoute[] {
  const out: RegisteredRoute[] = [];
  const root = (app as unknown as { _router: { stack: unknown[] } })._router;
  walkRouter(root.stack as Parameters<typeof walkRouter>[0], "", out);
  // The frontend addresses routes relative to the /api mount.
  return out
    .filter((r) => r.path.startsWith("/api/"))
    .map((r) => ({ method: r.method, path: r.path.slice(4) }));
}

/** A frontend path matches a route when every segment lines up: literal to
 *  literal, or a param on either side. A frontend :param is allowed to stand
 *  in for a literal route segment — `/shares/${accept ? "accept" : "decline"}`
 *  legitimately targets two literal routes. Path drift is still caught by
 *  literal mismatches and segment counts. */
function matches(front: string, route: string): boolean {
  const f = front.split("/").filter(Boolean);
  const r = route.split("/").filter(Boolean);
  if (f.length !== r.length) return false;
  return f.every((seg, i) => {
    const rseg = r[i]!;
    if (rseg.startsWith(":") || seg.startsWith(":")) return true;
    return seg === rseg;
  });
}

describe("web/API route contract", () => {
  const routes = registeredRoutes();
  const calls = scanWebSources();

  it("finds a plausible number of calls and routes", () => {
    // Guards against the scan or the walker silently matching nothing.
    expect(calls.length).toBeGreaterThan(25);
    expect(routes.length).toBeGreaterThan(30);
  });

  it("every frontend request resolves against a registered route", () => {
    const misses = calls.filter(
      (c) => !routes.some((r) => r.method === c.method && matches(c.path, r.path)),
    );
    const detail = misses
      .map((m) => `${m.method} ${m.path}  (${m.file})`)
      .join("\n");
    expect(misses.map((m) => `${m.method} ${m.path}`).join("\n")).toBe("");
    if (misses.length > 0) {
      throw new Error(`unmatched frontend calls:\n${detail}`);
    }
  });
});
