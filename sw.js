if (typeof window === "undefined") {
  const MIME = {
    html: "text/html", htm: "text/html", css: "text/css", js: "application/javascript",
    mjs: "application/javascript", json: "application/json", png: "image/png",
    jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", svg: "image/svg+xml",
    webp: "image/webp", mp3: "audio/mpeg", mp4: "video/mp4", webm: "video/webm",
    wasm: "application/wasm", txt: "text/plain", xml: "application/xml",
    pdf: "application/pdf", zip: "application/zip", ico: "image/x-icon",
  };

  const HOSTS = {
    github: (o, r, b, f) => `https://raw.githubusercontent.com/${o}/${r}/${b}/${f}`,
    jsdelivr: (o, r, b, f) => `https://fastly.jsdelivr.net/gh/${o}/${r}@${b}/${f}`,
    jsdelivr2: (o, r, b, f) => `https://cdn.jsdelivr.net/gh/${o}/${r}@${b}/${f}`,
    statically: (o, r, b, f) => `https://cdn.statically.io/gh/${o}/${r}@${b}/${f}`,
  };

  const SHORT_ROUTES = {
    "/m": "github", "/n": "jsdelivr", "/p": "jsdelivr2", "/o": "statically",
    "/m-b": "github", "/n-b": "jsdelivr", "/p-b": "jsdelivr2", "/o-b": "statically",
  };

  const GH_ROUTES = {
    "/gh": "github", "/gh2": "jsdelivr", "/gh3": "statically", "/gh4": "jsdelivr2",
    "/gh-b": "github", "/gh2-b": "jsdelivr", "/gh3-b": "statically", "/gh4-b": "jsdelivr2",
  };

  const mime = (p) => MIME[p.split(/[?#]/)[0].split(".").pop().toLowerCase()] || "application/octet-stream";

  const coiHeaders = (res, filePath) => {
    if (!res.ok && res.status === 0) return res;
    const h = new Headers(res.headers);
    h.set("Cross-Origin-Embedder-Policy", "require-corp");
    h.set("Cross-Origin-Opener-Policy", "same-origin");
    h.set("Cross-Origin-Resource-Policy", "same-origin");
    if (filePath) {
      h.set("Content-Type", mime(filePath));
      h.set("Access-Control-Allow-Origin", "*");
    }
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
  };

  const fetchRepo = (owner, repo, branch, filePath, svc) =>
    fetch(HOSTS[svc](owner, repo, branch, filePath))
      .then((r) => coiHeaders(r, filePath))
      .catch((e) => new Response(`${svc} Error: ${e.message}`, { status: 500 }));

  const parseShort = (rest, hasBranchFlag) => {
    let branch = "main", repo = "e", filePath = "index.html";
    const parts = rest.split("/").filter(Boolean);

    if (parts[0]?.startsWith("@")) {
      branch = parts.shift().slice(1);
    } else if (hasBranchFlag && parts.length > 1) {
      repo = parts.shift();
      branch = parts.shift();
    } else if (parts[0]?.includes("@")) {
      const [r, b] = parts.shift().split("@");
      repo = r;
      if (b) branch = b;
    } else if (parts.length > 1 && !parts[0].includes(".")) {
      repo = parts.shift();
    }

    if (parts.length) filePath = parts.join("/");
    return { owner: "sigmiliarity", repo, branch, filePath };
  };

  const parseGh = (rest, hasBranchFlag) => {
    let branch = "main", owner = "", repo = "", filePath = "index.html";
    const parts = rest.split("/").filter(Boolean);

    if (parts[0]?.startsWith("@")) branch = parts.shift().slice(1);

    if (parts.length >= 2) {
      owner = parts.shift();
      repo = parts.shift();
      if (repo.includes("@")) {
        const [r, b] = repo.split("@");
        repo = r;
        if (b) branch = b;
      } else if (hasBranchFlag && parts.length > 0) {
        branch = parts.shift();
      }
    } else if (parts.length === 1) {
      owner = "sigmiliarity";
      repo = parts.shift();
    }

    if (parts.length) filePath = parts.join("/");
    return { owner, repo, branch, filePath };
  };

  const matchPrefix = (path, map) => {
    for (const [prefix, svc] of Object.entries(map)) {
      if (path === prefix || path.startsWith(prefix + "/")) {
        return { prefix, svc, hasBranchFlag: prefix.endsWith("-b"), rest: path.slice(prefix.length) };
      }
    }
    return null;
  };

  self.addEventListener("install", () => self.skipWaiting());
  self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

  self.addEventListener("fetch", (event) => {
    const req = event.request;
    const url = new URL(req.url);
    let path = url.pathname;

    if (!req.url.startsWith(self.location.origin)) return event.respondWith(fetch(req));
    if (req.cache === "only-if-cached" && req.mode !== "same-origin") return;
    if (path.startsWith("/d/")) return event.respondWith(fetch(req));

    if (path.endsWith("/")) path += "index.html";

    if (path === "/" || path === "/index.html") {
      return event.respondWith(fetchRepo("sigmiliarity", "e", "main", "index.html", "github"));
    }

    const shortHit = matchPrefix(path, SHORT_ROUTES);
    if (shortHit) {
      const { owner, repo, branch, filePath } = parseShort(shortHit.rest, shortHit.hasBranchFlag);
      return event.respondWith(fetchRepo(owner, repo, branch, filePath, shortHit.svc));
    }

    const ghHit = matchPrefix(path, GH_ROUTES);
    if (ghHit) {
      const { owner, repo, branch, filePath } = parseGh(ghHit.rest, ghHit.hasBranchFlag);
      if (!owner || !repo) {
        return event.respondWith(new Response("Invalid GitHub path. Expected: /gh/{owner}/{repo}/{path}", { status: 400 }));
      }
      return event.respondWith(fetchRepo(owner, repo, branch, filePath, ghHit.svc));
    }

    if (path.startsWith("/base/")) {
      let target = path.slice(6);
      if (!/^https?:\/\//i.test(target)) target = "https://" + target;
      const fileName = target.split("/").pop() || "file";
      return event.respondWith(
        fetch(target).then((r) => coiHeaders(r, fileName)).catch((e) => new Response(`Fetch Error: ${e.message}`, { status: 500 }))
      );
    }

    if (!path.includes("/", 1) && path.includes(".")) {
      return event.respondWith(fetchRepo("sigmiliarity", "e", "main", path.slice(1), "github"));
    }

    event.respondWith(
      fetch(req).then((r) => coiHeaders(r)).catch((e) => { console.error(e); throw e; })
    );
  });
} else if (!window.crossOriginIsolated && window.isSecureContext && "serviceWorker" in navigator) {
  const reloaded = sessionStorage.getItem("petari-coi-reload");
  navigator.serviceWorker.register(document.currentScript.src).then((reg) => {
    if (reloaded) return;
    const reload = () => {
      sessionStorage.setItem("petari-coi-reload", "1");
      window.location.reload();
    };
    if (reg.active && !navigator.serviceWorker.controller) reload();
    else reg.addEventListener("updatefound", () => {
      reg.installing.addEventListener("statechange", (e) => {
        if (e.target.state === "activated") reload();
      });
    });
  });
} else {
  sessionStorage.removeItem("petari-coi-reload");
}