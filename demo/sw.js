const CACHE="ks-btp-demo-offline-v20";
const ASSETS=["./","./index.html","./style.css","./app.js","./offline-storage.js","./offline-bootstrap.js","./manifest.webmanifest","./icon.svg"];

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
    const cache=await caches.open(CACHE);
    const cached=await cache.match(request);
    if(cached)return cached;

    // Les navigations vers /demo/ et /demo/index.html doivent toutes
    // retomber sur la page locale précachée, même après fermeture de Chrome.
    if(request.mode==="navigate"){
      const indexUrl=new URL("./index.html",self.registration.scope).href;
      const rootUrl=new URL("./",self.registration.scope).href;
      const offlinePage=await cache.match(indexUrl)||await cache.match(rootUrl);
      if(offlinePage){
        try{
          const response=await fetch(request);
          if(response.ok)return response;
        }catch(_){}
        return offlinePage;
      }
    }

    try{
      const response=await fetch(request);
      if(response.ok&&new URL(request.url).origin===self.location.origin){
        const copy=response.clone();
        cache.put(request,copy).catch(()=>{});
      }
      return response;
    }catch(error){
      return new Response("Cette ressource n’est pas disponible hors connexion.",{
        status:503,
        statusText:"Service Unavailable",
        headers:{"Content-Type":"text/plain; charset=utf-8"}
      });
    }
  })());
});
