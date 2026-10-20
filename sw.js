/* Aimpire service worker. Maal: andre aapning paa 3G er oeyeblikkelig, og guiden
   virker uten nett. Regler:
   - HTML: nett foerst (saa oppdateringer kommer fram), cache hvis nettet svikter.
   - Spraakpakker (hash i URL) og bilder: cache foerst.
   - Google-fonter: cache foerst (gstatic er uforanderlig), CSS-en oppdateres i bakgrunnen.
   - ALDRI cache: godkjent-lista (Google-arket), ledere.txt, skjemaet. De skal vaere ferske.
   Cachenavnet baerer bygg-id, saa hver publisering rydder den forrige. */
const BUILD = "f8a9a24e5b";
const CACHE = "aimpire-" + BUILD;
const SHELL = ["./", "./ledere.html"];

self.addEventListener("install", function(e){
  e.waitUntil(caches.open(CACHE).then(function(c){
    return c.addAll(SHELL.map(function(u){ return new Request(u, { cache: "reload" }); }));
  }).then(function(){ return self.skipWaiting(); }));
});

self.addEventListener("activate", function(e){
  e.waitUntil(caches.keys().then(function(keys){
    return Promise.all(keys.filter(function(k){ return k.indexOf("aimpire-") === 0 && k !== CACHE; })
      .map(function(k){ return caches.delete(k); }));
  }).then(function(){ return self.clients.claim(); }));
});

function aldriCache(url){
  return url.hostname === "docs.google.com"
      || /\/ledere\.txt(\?|$)/.test(url.pathname + url.search)
      || url.pathname.indexOf("/formResponse") !== -1;
}

self.addEventListener("fetch", function(e){
  const req = e.request;
  if(req.method !== "GET") return;
  let url; try{ url = new URL(req.url); }catch(err){ return; }
  if(aldriCache(url)) return;

  /* Sidevisning: nett foerst, cache bare naar nettet er for tregt.
     Ledersiden sender et skjema som maa matche Googles felt, saa der venter vi
     lenge (20 s) foer vi tyr til en gammel kopi; medlemssiden 6 s. (16.10: en leder
     satt paa gammel side og fikk soeknaden stille avvist.) */
  if(req.mode === "navigate"){
    e.respondWith((function(){
      const erLedere = /ledere\.html$/.test(url.pathname);
      const fallback = erLedere ? "./ledere.html" : "./";
      const nett = fetch(req).then(function(r){
        if(r && r.ok){ const kopi = r.clone(); caches.open(CACHE).then(function(c){ c.put(fallback, kopi); }); }
        return r;
      });
      /* Ytelse 19.10 (maalt: 1,4 s til foerste byte paa ny URL, opptil 6 s paa tregt nett): har medlemssiden
         en lagret kopi, vises den etter maks 0,8 s, og nettversjonen lagres i bakgrunnen til neste gang.
         Uten lagret kopi ventes det paa nettet som foer. Ledersiden beholder 20 s (skjemaet maa matche Google). */
      return caches.match(fallback).then(function(lagret){
        /* Bare forsiden (/ og /index.html, med eller uten ?l=) faar hurtigvisning. Navnelenker (/asma/) og
           404.html maa alltid naa nettet - en lagret forside der ville mistet sponsoren (#169). */
        const erRot = url.pathname === "/" || /\/index\.html$/.test(url.pathname);
        const ms = erLedere ? 20000 : (lagret && erRot ? 800 : 6000);
        const frist = new Promise(function(res){ setTimeout(function(){ res(null); }, ms); });
        return Promise.race([nett.catch(function(){ return null; }), frist]).then(function(r){
          return r || lagret || caches.match(fallback).then(function(c){ return c || nett; });
        });
      });
    })());
    return;
  }

  const sammeOpphav = url.origin === self.location.origin;
  const erPakke = sammeOpphav && url.pathname.indexOf("/lang/") !== -1;
  const erAsset = sammeOpphav && url.pathname.indexOf("/assets/") !== -1;
  const erApp = sammeOpphav && /\/app-[a-z]\.[0-9a-f]{10}\.js$/.test(url.pathname);   /* #100: hash i navnet = trygt aa cache foerst */
  const erFont = url.hostname === "fonts.gstatic.com";
  const erFontCss = url.hostname === "fonts.googleapis.com";

  if(erPakke || erAsset || erApp || erFont){
    e.respondWith(caches.match(req).then(function(c){
      if(c) return c;
      return fetch(req).then(function(r){
        if(r && (r.ok || r.type === "opaque")){ const kopi = r.clone(); caches.open(CACHE).then(function(cc){ cc.put(req, kopi); }); }
        return r;
      });
    }));
    return;
  }
  if(erFontCss){
    e.respondWith(caches.match(req).then(function(c){
      const nett = fetch(req).then(function(r){
        if(r && r.ok){ const kopi = r.clone(); caches.open(CACHE).then(function(cc){ cc.put(req, kopi); }); }
        return r;
      }).catch(function(){ return c; });
      return c || nett;
    }));
  }
});
