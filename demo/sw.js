const CACHE="ks-btp-demo-offline-v6";
const ASSETS=["./","./index.html","./style.css","./app.js","./offline-storage.js","./offline-bootstrap.js","./manifest.webmanifest"];

self.addEventListener("install",event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)));
});

self.addEventListener("message",event=>{
  if(event.data&&event.data.type==="SKIP_WAITING")self.skipWaiting();
});

self.addEventListener("activate",event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(key=>key.startsWith("ks-btp-demo-offline-")&&key!==CACHE).map(key=>caches.delete(key))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener("fetch",event=>{
  const request=event.request;
  if(request.method!=="GET")return;

  event.respondWith((async()=>{
    const cached=await caches.match(request);
    if(cached)return cached;

    try{
      const response=await fetch(request);
      if(response.ok&&new URL(request.url).origin===self.location.origin){
        const copy=response.clone();
        caches.open(CACHE).then(cache=>cache.put(request,copy)).catch(()=>{});
      }
      return response;
    }catch(error){
      if(request.mode==="navigate"){
        const offlinePage=await caches.match("./index.html");
        if(offlinePage)return offlinePage;
      }
      return new Response("Cette ressource n’est pas disponible hors connexion.",{
        status:503,
        statusText:"Service Unavailable",
        headers:{"Content-Type":"text/plain; charset=utf-8"}
      });
    }
  })());
});
