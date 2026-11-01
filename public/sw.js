const CACHE="book-formatter-auth-v1";
self.addEventListener("install",event=>event.waitUntil(self.skipWaiting()));
self.addEventListener("activate",event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith("book-formatter-"))await caches.delete(key);await self.clients.claim();})()));
self.addEventListener("fetch",event=>{
 const u=new URL(event.request.url);
 if(event.request.mode==="navigate"||u.pathname.startsWith("/api/")||u.pathname.startsWith("/auth/"))return;
 if(event.request.method!=="GET"||u.origin!==location.origin)return;
 event.respondWith((async()=>{const cache=await caches.open(CACHE);const cached=await cache.match(event.request);
 if(cached)return cached;
 try{const response=await fetch(event.request);if(response.ok&&u.pathname!=="/"&&u.pathname!=="/help/")await cache.put(event.request,response.clone());return response;}catch{return cached||Response.error();}
 })());
});