/* assets/js/catalogo.js
   Catalogo Danea compatibile con:
   - righe separatore: row[""] = "Categoria : ...."
   - prodotti: row["Cod."], row["Descrizione"], row["Categoria"], row["Listino 1 (ivato)"], row["Produttore"]
*/
(function (global) {
  "use strict";

  const DEFAULT_DATA_URL_CANDIDATES = [
    "./data/products.json",
    "data/products.json",
    "/data/products.json",
    "./assets/data/products.json",
    "/assets/data/products.json",
  ];

  function norm(s) {
    return String(s ?? "").replace(/\s+/g, " ").trim();
  }

  function esc(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function euro(n) {
    const num = Number(n);
    if (!Number.isFinite(num)) return "—";
    return num.toLocaleString("it-IT", { style: "currency", currency: "EUR" });
  }

  function parsePrice(v, { absNegative = true } = {}) {
    if (v === null || v === undefined) return NaN;
    if (typeof v === "number") return absNegative ? Math.abs(v) : v;

    let s = String(v).trim();
    if (!s) return NaN;

    s = s.replace(/\s/g, "").replace("€", "");

    // "10.00" -> 10
    // "10,00" -> 10
    if (s.includes(",")) {
      s = s.replace(/\./g, "");
      s = s.replace(",", ".");
    }

    const num = Number(s);
    if (!Number.isFinite(num)) return NaN;
    return absNegative ? Math.abs(num) : num;
  }

  function splitParts(full) {
    return String(full ?? "")
      .replace(/\s*»\s*/g, "»")
      .split("»")
      .map((x) => norm(x))
      .filter(Boolean);
  }

  function slugify(s) {
    return String(s ?? "")
      .toLowerCase()
      .trim()
      .replaceAll("»", ">")
      .replaceAll("&", "e")
      .replace(/[^a-z0-9\s>-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-");
  }

  async function fetchJsonWithFallback(candidates = DEFAULT_DATA_URL_CANDIDATES) {
    const tries = candidates.map((u) => new URL(u, location.href).toString());
    let lastErr = null;

    for (const url of tries) {
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status} su ${url}`);
        const data = await res.json();
        if (!Array.isArray(data)) throw new Error(`products.json non è un array (${url})`);
        return { data, url };
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr || new Error("Impossibile caricare products.json");
  }

  function normalizeRowsToProducts(rows, opts = {}) {
    const {
      placeholderCover = "assets/img/logo/logo-transparent.svg",
      absNegativePrices = true,
    } = opts;

    const out = [];

    for (const row of rows) {
      const marker = norm(row[""]);
      const isCategoryRow = marker.toLowerCase().startsWith("categoria");
      if (isCategoryRow) continue;

      const sku = norm(row["Cod."]);
      if (!sku) continue; // righe vuote

      const title = norm(row["Descrizione"]) || "(Senza nome)";
      const brand = norm(row["Produttore"]);
      const category = norm(row["Categoria"]) || "Senza categoria";

      const parts = splitParts(category);
      const macro = parts[0] || "Senza categoria";
      const micro = (parts.length ? parts[parts.length - 1] : macro) || "PRODOTTO";
      const catLine = parts.join(" » ");

      const priceNum = parsePrice(row["Listino 1 (ivato)"], { absNegative: absNegativePrices });

      out.push({
        // base
        sku,                 // mantiene zeri "0016189"
        title,
        brand,
        category,
        catLine,

        // categorie per filtri
        macro,
        microBadge: micro,
        macroSlug: slugify(macro),
        catSlug: slugify(category),

        // prezzo
        price: priceNum,
        priceLabel: euro(priceNum),

        // immagine (se poi metti immagini reali, puoi sovrascrivere)
        cover: placeholderCover,
      });
    }

    return out;
  }

  function buildModel(products) {
    const macroMap = new Map();

    for (const p of products) {
      const macro = p.macro || "Senza categoria";
      if (!macroMap.has(macro)) macroMap.set(macro, new Map());
      const m = macroMap.get(macro);
      m.set(p.category, (m.get(p.category) || 0) + 1);
    }

    const macros = [...macroMap.entries()]
      .map(([macro, cats]) => {
        let total = 0;
        for (const c of cats.values()) total += c;

        const catsSorted = [...cats.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([full, count]) => {
            const parts = splitParts(full);
            const short = parts.length ? parts[parts.length - 1] : full;
            return { full, short, slug: slugify(full), count };
          });

        return { macro, macroSlug: slugify(macro), total, cats: catsSorted };
      })
      .sort((a, b) => b.total - a.total);

    return macros;
  }

  function findBySku(products, skuParam) {
    const sku = norm(skuParam);
    if (!sku) return null;

    let p = products.find((x) => String(x.sku) === String(sku));
    if (!p) {
      // fallback soft
      p = products.find(
        (x) => String(x.sku).includes(sku) || sku.includes(String(x.sku))
      );
    }
    return p || null;
  }

  // Cache globale (così index e prodotto non ricaricano 2 volte se nav interna)
  let _cache = null;

  async function loadCatalog(options = {}) {
    if (_cache && !_cache._stale) return _cache;

    const {
      dataUrlCandidates = DEFAULT_DATA_URL_CANDIDATES,
      placeholderCover = "assets/img/logo/logo-transparent.svg",
      absNegativePrices = true,
      forceReload = false,
    } = options;

    if (forceReload) _cache = null;

    const { data, url } = await fetchJsonWithFallback(dataUrlCandidates);
    const ALL = normalizeRowsToProducts(data, {
      placeholderCover,
      absNegativePrices,
    });

    const MODEL = buildModel(ALL);

    _cache = { ALL, MODEL, url, _stale: false };
    return _cache;
  }

  // Export
  global.Catalogo = {
    norm,
    esc,
    euro,
    parsePrice,
    splitParts,
    slugify,
    loadCatalog,
    buildModel,
    findBySku,
    normalizeRowsToProducts,
  };
})(window);
