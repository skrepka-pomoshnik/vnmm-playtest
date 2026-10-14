const cacheName = "infinite-session-web-gzip-v2";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((names) =>
        Promise.all(
          names
            .filter(
              (name) =>
                name.startsWith("infinite-session-web-gzip-") && name !== cacheName,
            )
            .map((name) => caches.delete(name)),
        ),
      ),
    ]),
  );
});

let addToCache = false;

function engineAsset(request) {
  if (request.method !== "GET") {
    return null;
  }

  const path = new URL(request.url).pathname;
  if (path.endsWith("/renpy.wasm")) {
    return { contentType: "application/wasm" };
  }
  if (path.endsWith("/renpy.data")) {
    return { contentType: "application/octet-stream" };
  }

  return null;
}

async function fetchNetworkResponse(request) {
  const asset = engineAsset(request);
  let networkRequest = request;

  if (asset) {
    const compressedUrl = new URL(request.url);
    compressedUrl.pathname += ".gz";
    networkRequest = new Request(compressedUrl, request);
  }

  const response = await fetch(networkRequest);
  if (!asset || !response.ok) {
    return response;
  }

  let body = response.body;
  if (!response.headers.has("Content-Encoding")) {
    body = body.pipeThrough(new DecompressionStream("gzip"));
  }

  const headers = new Headers(response.headers);
  headers.delete("Content-Encoding");
  headers.delete("Content-Length");
  headers.set("Content-Type", asset.contentType);

  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function fetchAndCache(request) {
  const cache = await caches.open(cacheName);
  const cachedResponse = await cache.match(request);

  try {
    if (request.url.endsWith("?cached")) {
      request = new Request(request.url.replace("?cached", "?uncached"), request);
      const cached = await cache.match(request);
      return cached ?? new Response("Not found in cache.", { status: 404 });
    }

    let networkRequest = request;
    if (cachedResponse) {
      const headers = new Headers(request.headers);
      const lastModified = cachedResponse.headers.get("Last-Modified");
      const etag = cachedResponse.headers.get("ETag");
      if (lastModified) {
        headers.set("If-Modified-Since", lastModified);
      }
      if (etag) {
        headers.set("If-None-Match", etag);
      }
      networkRequest = new Request(request, { headers });
    }

    const response = await fetchNetworkResponse(networkRequest);
    if (cachedResponse && response.status === 304) {
      return cachedResponse;
    }

    if (addToCache && response.status === 200) {
      await cache.put(request, response.clone());
    }

    return response;
  } catch (error) {
    if (cachedResponse) {
      return cachedResponse;
    }
    throw error;
  }
}

self.addEventListener("fetch", (event) => {
  event.respondWith(fetchAndCache(event.request));
});

self.addEventListener("message", (event) => {
  if (event.data[0] === "clearCache") {
    event.waitUntil(caches.delete(cacheName));
    addToCache = false;
  } else if (event.data[0] === "loadCache") {
    addToCache = true;
  }
});
