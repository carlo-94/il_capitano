/* =========================================================
   IL CAPITANO — catalogo.js
   Unico file JS per:
   - index.html (catalogo con sidebar + mega overlay foto2)
   - prodotto.html (scheda prodotto)
   Supporta export Danea con righe "Categoria: ..."
========================================================= */

(function(){
  "use strict";

  const Catalogo = {};
window.CapitanoCatalogo = Catalogo;
window.Catalogo = Catalogo; // <-- AGGIUNGI QUESTO


  // ---------------- utils base ----------------
  const norm = (s)=> String(s ?? "").replace(/\s+/g," ").trim();

  function esc(s){
    return String(s ?? "")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

  function euro(n){
    const num = Number(n);
    if(!Number.isFinite(num)) return "—";
    return num.toLocaleString("it-IT", { style:"currency", currency:"EUR" });
  }

  function parsePrice(v){
    if (v === null || v === undefined) return NaN;
    if (typeof v === "number") return v;
    let s = String(v).trim();
    if(!s) return NaN;
    s = s.replace(/\s/g,"").replace("€","");
    // "10,00" -> 10.00 ; "1.234,50" -> 1234.50
    if (s.includes(",")){
      s = s.replace(/\./g,"");
      s = s.replace(",",".");
    } else {
      s = s.replace(/,/g,"");
    }
    const num = Number(s);
    return Number.isFinite(num) ? num : NaN;
  }

  function splitParts(full){
    return String(full ?? "")
      .replace(/\s*»\s*/g, "»")
      .split("»")
      .map(x=>norm(x))
      .filter(Boolean);
  }

  function slugify(s){
    return String(s ?? "")
      .toLowerCase()
      .trim()
      .replaceAll("»", ">")
      .replaceAll("&", "e")
      .replace(/[^a-z0-9\s>-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-");
  }

  function qs(name){
    return new URLSearchParams(location.search).get(name);
  }

  async function fetchCatalogJson(candidates){
    const tries = (candidates || []).length ? candidates : [
      "./data/products.json",
      "data/products.json",
      "/data/products.json"
    ];

    let lastErr = null;
    for(const u of tries){
      const url = new URL(u, location.href).toString();
      try{
        const res = await fetch(url, { cache:"no-store" });
        if(!res.ok) throw new Error(`HTTP ${res.status} su ${url}`);
        const data = await res.json();
        if(!Array.isArray(data)) throw new Error("products.json non è un array");
        console.log("✅ Catalogo caricato da:", url);
        return data;
      }catch(e){
        lastErr = e;
        console.warn("❌ tentativo fallito:", e.message);
      }
    }
    throw lastErr || new Error("Impossibile caricare products.json");
  }

  // ---------------- parse Danea ----------------
  function parseDaneaRows(rows){
    let currentCategory = "Senza categoria";
    const out = [];

    for(const row of rows){
      const marker = norm(row[""]);

      // RIGA "Categoria: XYZ"
      if(marker.toLowerCase().startsWith("categoria")){
        const parts = marker.split(":");
        const found = norm(parts.length > 1 ? parts.slice(1).join(":") : "");
        if(found) currentCategory = found;
        continue;
      }

      const sku = norm(row["Cod."]);
      if(!sku) continue;

      const title = norm(row["Descrizione"]) || "(Senza nome)";
      const brand = norm(row["Produttore"]);
      const catRow = norm(row["Categoria"]);
      const category = norm(catRow || currentCategory || "Senza categoria");

      const parts = splitParts(category);
      const macro = parts[0] || "Senza categoria";
      const micro = (parts.length ? parts[parts.length - 1] : macro) || "SENZA CATEGORIA";
      const catLine = parts.join(" » ");

      let priceNum = parsePrice(row["Listino 1 (ivato)"]);
      // nel tuo export ci sono prezzi negativi: li rendiamo positivi
      if(Number.isFinite(priceNum) && priceNum < 0) priceNum = Math.abs(priceNum);

      out.push({
        sku,                         // mantiene zeri "0016189"
        title,
        brand,
        category,
        catLine,
        macro,
        microBadge: micro,
        catSlug: slugify(category),
        macroSlug: slugify(macro),
        price: priceNum,
        priceLabel: euro(priceNum)
      });
    }

    return out;
  }

  // ---------------- model categorie ----------------
  function buildModel(ALL){
    const macroMap = new Map();

    for(const p of ALL){
      const macro = p.macro || "Senza categoria";
      if(!macroMap.has(macro)) macroMap.set(macro, new Map());
      const m = macroMap.get(macro);
      m.set(p.category, (m.get(p.category) || 0) + 1);
    }

    const macros = [...macroMap.entries()].map(([macro, cats])=>{
      let total = 0;
      for(const c of cats.values()) total += c;

      const catsSorted = [...cats.entries()]
        .sort((a,b)=>b[1]-a[1])
        .map(([full, count])=>{
          const parts = splitParts(full);
          const short = parts.length ? parts[parts.length-1] : full;
          return { full, short, slug: slugify(full), count };
        });

      return {
        macro,
        macroSlug: slugify(macro),
        total,
        cats: catsSorted
      };
    }).sort((a,b)=>b.total - a.total);

    return macros;
  }

  // ---------------- mega columns (foto2) ----------------
  function splitIntoColumnsPhoto2(macros, cols=3){
    const columns = Array.from({length: cols}, ()=>({items:[], w:0}));
    const sorted = macros.slice().sort((a,b)=>(b.total||0)-(a.total||0));

    for(const m of sorted){
      columns.sort((a,b)=>a.w-b.w);
      columns[0].items.push(m);
      columns[0].w += (m.total||0);
    }
    return columns.map(c=>c.items);
  }

  // =========================================================
  // INDEX PAGE
  // =========================================================
  Catalogo.initIndexPage = async function initIndexPage(opts){
    const cfg = Object.assign({
      placeholder: "assets/img/prodotti/placeholder.jpg",
      dataCandidates: [
        "./data/products.json",
        "data/products.json",
        "/data/products.json"
      ],
      productPage: "prodotto.html",
      // IDs (devono esistere nel tuo HTML)
      ids: {
        y:"y",
        tree:"tree",
        grid:"grid",
        search:"search",
        countPill:"countPill",
        metaHead:"metaHead",
        metaTop:"metaTop",
        metaBottom:"metaBottom",
        crumbLabel:"crumbLabel",
        titleLabel:"titleLabel",
        sort:"sort",
        perPage:"perPage",
        btnGrid:"btnGrid",
        btnList:"btnList",
        pgBtns:"pgBtns",
        resetAll:"resetAll",
        megaBtn:"megaBtn",
        megaClose:"megaClose",
        megaAll:"megaAll",
        catOverlay:"catOverlay",
        catCount:"catCount",
        megaGrid:"megaGrid"
      }
    }, opts || {});

    const $ = (id)=> document.getElementById(id);

    // refs
    const tree = $(cfg.ids.tree);
    const grid = $(cfg.ids.grid);
    const search = $(cfg.ids.search);
    const countPill = $(cfg.ids.countPill);

    const metaHead = $(cfg.ids.metaHead);
    const metaTop = $(cfg.ids.metaTop);
    const metaBottom = $(cfg.ids.metaBottom);

    const crumbLabel = $(cfg.ids.crumbLabel);
    const titleLabel = $(cfg.ids.titleLabel);

    const sortSel = $(cfg.ids.sort);
    const perPageSel = $(cfg.ids.perPage);

    const btnGrid = $(cfg.ids.btnGrid);
    const btnList = $(cfg.ids.btnList);

    const pgBtns = $(cfg.ids.pgBtns);
    const resetAll = $(cfg.ids.resetAll);

    const megaBtn = $(cfg.ids.megaBtn);
    const megaClose = $(cfg.ids.megaClose);
    const megaAll = $(cfg.ids.megaAll);

    const catOverlay = $(cfg.ids.catOverlay);
    const catCount = $(cfg.ids.catCount);
    const megaGrid = $(cfg.ids.megaGrid);

    if($(cfg.ids.y)) $(cfg.ids.y).textContent = new Date().getFullYear();

    let ALL = [];
    let model = [];

    const state = {
      q: "",
      macro: "tutti",
      sub: "tutti",
      macroLabel: "Tutti",
      subLabel: "",
      view: "grid",
      sort: "rel",
      perPage: 12,
      page: 1,
      openMacros: new Set()
    };

    function currentLabel(){
      if (state.macro === "tutti") return "Home";
      if (state.sub === "tutti") return state.macroLabel || "Categoria";
      return state.subLabel || state.macroLabel || "Categoria";
    }

    function matches(p){
      const q = state.q.trim().toLowerCase();

      const macroOk = (state.macro === "tutti") || (p.macroSlug === state.macro);
      if(!macroOk) return false;

      const subOk = (state.sub === "tutti") || (p.catSlug === state.sub);
      if(!subOk) return false;

      if(!q) return true;
      const hay = (p.title + " " + (p.brand||"") + " " + p.sku + " " + p.category).toLowerCase();
      return hay.includes(q);
    }

    function sortList(list){
      if(state.sort === "az"){
        return list.slice().sort((a,b)=>a.title.localeCompare(b.title, "it"));
      }
      if(state.sort === "priceUp"){
        return list.slice().sort((a,b)=>(a.price||Infinity) - (b.price||Infinity));
      }
      if(state.sort === "priceDown"){
        return list.slice().sort((a,b)=>(b.price||-Infinity) - (a.price||-Infinity));
      }
      return list;
    }

    function card(p){
      const badge = p.microBadge ? String(p.microBadge).toUpperCase().slice(0,22) : "SENZA CATEGORIA";
      const brandLine = (p.brand && p.brand.trim()) ? esc(p.brand) : "";
      const meta = esc(p.catLine || p.category || "");

      return `
        <article class="card" role="link" tabindex="0" data-sku="${esc(p.sku)}" aria-label="Apri ${esc(p.title)}">
          <div class="thumb">
            <span class="badge">${esc(badge)}</span>
            <div class="photoFrame">
              <img src="${esc(cfg.placeholder)}" alt="${esc(p.title)}" onerror="this.src='${esc(cfg.placeholder)}'">
            </div>
          </div>

          <div class="content">
            <h3 class="title">${esc(p.title)}</h3>

            <div class="metaLine">${meta}</div>
            ${brandLine ? `<div class="metaLine" style="min-height:0; margin-top:6px; letter-spacing:.12em;">${brandLine}</div>` : ``}

            <div class="bottomRow">
              <div class="price">${esc(p.priceLabel)}</div>
              <span class="openBtn">Apri →</span>
            </div>
          </div>
        </article>
      `;
    }

    function openProduct(sku){
      window.location.href = `${cfg.productPage}?sku=${encodeURIComponent(sku)}`;
    }

    function goPage(p){
      state.page = p;
      render();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }

    function buildPager(pages){
      const cur = state.page;

      const btn = (label, page, opts={}) => {
        const cls = ["pgBtn"];
        if(opts.num) cls.push("num");
        if(opts.active) cls.push("active");
        const disabled = opts.disabled ? "disabled" : "";
        const data = (page != null) ? `data-page="${page}"` : "";
        return `<button class="${cls.join(" ")}" type="button" ${disabled} ${data}>${label}</button>`;
      };

      let html = "";
      html += btn("←", cur-1, {disabled: cur<=1});

      const addDots = ()=> html += `<span class="dots">…</span>`;
      const pushNum = (p)=> html += btn(String(p), p, {num:true, active: p===cur});

      if(pages <= 7){
        for(let p=1;p<=pages;p++) pushNum(p);
      } else {
        pushNum(1);

        const w = 2;
        let start = Math.max(2, cur - w);
        let end = Math.min(pages-1, cur + w);

        if(start > 2) addDots();
        for(let p=start; p<=end; p++) pushNum(p);
        if(end < pages-1) addDots();

        pushNum(pages);
      }

      html += btn("→", cur+1, {disabled: cur>=pages});

      pgBtns.innerHTML = html;

      pgBtns.querySelectorAll("button[data-page]").forEach(b=>{
        b.addEventListener("click", ()=>{
          const p = Number(b.getAttribute("data-page"));
          if(Number.isFinite(p)) goPage(Math.max(1, Math.min(p, pages)));
        });
      });
    }

    function render(){
      const label = currentLabel();
      crumbLabel.textContent = label;
      titleLabel.textContent = label;

      let list = ALL.filter(matches);
      list = sortList(list);

      const total = list.length;
      const per = state.perPage;
      const pages = Math.max(1, Math.ceil(total / per));
      state.page = Math.min(state.page, pages);

      const startIdx = (state.page - 1) * per;
      const endIdx = Math.min(total, startIdx + per);
      const slice = list.slice(startIdx, endIdx);

      const metaText = total
        ? `Mostro ${startIdx + 1}-${endIdx} di ${total} prodotto(i)`
        : `Mostro 0-0 di 0 prodotto(i)`;

      metaHead.textContent = metaText;
      metaTop.textContent = metaText;
      metaBottom.textContent = metaText;

      countPill.textContent = `${ALL.length} prodotti`;
      grid.classList.toggle("list", state.view === "list");

      if(total === 0){
        grid.innerHTML = `
          <div class="emptyState">
            <div>
              <h3 style="margin:0 0 8px; font-size:18px; font-weight:1000;">Nessun prodotto trovato</h3>
              <div style="opacity:.8">Prova a cambiare ricerca o categoria.</div>
            </div>
          </div>
        `;
        pgBtns.innerHTML = "";
        return;
      }

      grid.innerHTML = slice.map(card).join("");

      grid.querySelectorAll(".card").forEach(el=>{
        const sku = el.getAttribute("data-sku");
        el.addEventListener("click", ()=> openProduct(sku));
        el.addEventListener("keydown", (e)=>{
          if(e.key === "Enter" || e.key === " "){
            e.preventDefault();
            openProduct(sku);
          }
        });
      });

      buildPager(pages);
    }

    function renderTree(){
      let html = "";

      html += `
        <div class="treeItem ${state.macro === "tutti" ? "active" : ""}">
          <div class="treeRow">
            <div class="treeLeft">
              <button class="tri" type="button" data-action="noop" aria-label="tri">
                <span class="triBox">▶</span>
              </button>
              <button class="macroBtn" type="button" data-action="selectAll">Tutti</button>
            </div>
            <span class="cnt">${ALL.length}</span>
          </div>
        </div>
      `;

      for(const m of model){
        const isOpen = state.openMacros.has(m.macroSlug);
        const activeMacro = (state.macro === m.macroSlug && state.sub === "tutti");
        const triChar = isOpen ? "▼" : "▶";

        html += `
          <div class="treeItem ${isOpen ? "open" : ""} ${activeMacro ? "active" : ""}" data-macro="${esc(m.macroSlug)}">
            <div class="treeRow">
              <div class="treeLeft">
                <button class="tri" type="button" data-action="toggle" data-macro="${esc(m.macroSlug)}" aria-label="Apri/chiudi">
                  <span class="triBox">${triChar}</span>
                </button>
                <button class="macroBtn" type="button"
                        data-action="selectMacro"
                        data-macro="${esc(m.macroSlug)}"
                        data-macro-label="${esc(m.macro)}">${esc(m.macro)}</button>
              </div>
              <span class="cnt">${m.total}</span>
            </div>

            <div class="children">
              ${m.cats.map(c=>{
                const active = (state.macro === m.macroSlug && state.sub === c.slug) ? "active" : "";
                return `
                  <div class="subBtn ${active}"
                       data-action="selectSub"
                       data-macro="${esc(m.macroSlug)}"
                       data-macro-label="${esc(m.macro)}"
                       data-sub="${esc(c.slug)}"
                       data-sub-label="${esc(c.short)}"
                       title="${esc(c.full)}">
                    <span>${esc(c.short)}</span>
                    <small>${c.count}</small>
                  </div>
                `;
              }).join("")}
            </div>
          </div>
        `;
      }

      tree.innerHTML = html;
    }

    function setFilterAll(){
      state.macro = "tutti";
      state.sub = "tutti";
      state.macroLabel = "Tutti";
      state.subLabel = "";
      state.page = 1;
      renderTree();
      render();
    }

    function setFilterMacro(macroSlug, label){
      state.macro = macroSlug;
      state.sub = "tutti";
      state.macroLabel = label || "";
      state.subLabel = "";
      state.page = 1;
      state.openMacros.add(macroSlug);
      renderTree();
      render();
    }

    function setFilterSub(macroSlug, macroLabel, subSlug, subLabel){
      state.macro = macroSlug;
      state.sub = subSlug;
      state.macroLabel = macroLabel || "";
      state.subLabel = subLabel || "";
      state.page = 1;
      state.openMacros.add(macroSlug);
      renderTree();
      render();
    }

    function toggleMacro(macroSlug){
      if(state.openMacros.has(macroSlug)) state.openMacros.delete(macroSlug);
      else state.openMacros.add(macroSlug);
      renderTree();
    }

    // ---------------- mega overlay stile foto2 + SCROLL FIX ----------------
    function injectMegaScrollFix(){
      if(document.getElementById("megaScrollFix")) return;
      const st = document.createElement("style");
      st.id = "megaScrollFix";
      st.textContent = `
        .catPanel{display:flex !important; flex-direction:column !important;}
        .catBody{flex:1 1 auto !important; min-height:0 !important; overflow:auto !important; -webkit-overflow-scrolling:touch;}
        .catCols{overflow:visible !important;}
      `;
      document.head.appendChild(st);
    }

    function renderMegaPhoto2(){
      injectMegaScrollFix();

      if(catCount) catCount.textContent = `${ALL.length} prodotti`;

      const cols = splitIntoColumnsPhoto2(model, 3);

      megaGrid.innerHTML = `
        <div class="mega2">
          ${cols.map(col => `
            <div>
              ${col.map(m => `
                <div class="mega2-colTitle">${esc(m.macro)}</div>
                <div class="mega2-list">
                  ${m.cats.map(c => `
                    <div class="mega2-item"
                         data-act="sub"
                         data-m="${esc(m.macroSlug)}"
                         data-ml="${esc(m.macro)}"
                         data-s="${esc(c.slug)}"
                         data-sl="${esc(c.short)}"
                         title="${esc(c.full)}">
                      <span class="mega2-arrow">›</span>
                      <span class="mega2-label">${esc(c.short)}</span>
                      <span class="mega2-count">${c.count}</span>
                    </div>
                  `).join("")}
                </div>
                <div style="height:18px"></div>
              `).join("")}
            </div>
          `).join("")}
        </div>
      `;

      megaGrid.onclick = (e)=>{
        const el = e.target.closest("[data-act]");
        if(!el) return;

        setFilterSub(
          el.getAttribute("data-m"),
          el.getAttribute("data-ml"),
          el.getAttribute("data-s"),
          el.getAttribute("data-sl")
        );
        closeMega();
        document.querySelector("#catalogo")?.scrollIntoView({behavior:"smooth"});
      };
    }

    function openMega(){
      catOverlay.classList.add("open");
      megaBtn.setAttribute("aria-expanded","true");
      document.body.style.overflow = "hidden";
      renderMegaPhoto2();
    }
    function closeMega(){
      catOverlay.classList.remove("open");
      megaBtn.setAttribute("aria-expanded","false");
      document.body.style.overflow = "";
    }
    function toggleMega(){
      catOverlay.classList.contains("open") ? closeMega() : openMega();
    }

    // ---------------- boot ----------------
    try{
      countPill.textContent = "Carico...";
      metaHead.textContent = "Caricamento catalogo…";
      metaTop.textContent = "Caricamento…";

      const raw = await fetchCatalogJson(cfg.dataCandidates);
      ALL = parseDaneaRows(raw).map(p => Object.assign({ cover: cfg.placeholder }, p));
      model = buildModel(ALL);

      // default: apri prime 2 macro
      state.openMacros = new Set(model.slice(0,2).map(x=>x.macroSlug));

      renderTree();
      render();

      // sidebar click
      tree.addEventListener("click", (e)=>{
        const el = e.target.closest("[data-action]");
        if(!el) return;

        const action = el.getAttribute("data-action");

        if(action === "toggle"){
          toggleMacro(el.getAttribute("data-macro"));
          return;
        }
        if(action === "selectAll"){
          setFilterAll();
          return;
        }
        if(action === "selectMacro"){
          setFilterMacro(el.getAttribute("data-macro"), el.getAttribute("data-macro-label"));
          return;
        }
        if(action === "selectSub"){
          setFilterSub(
            el.getAttribute("data-macro"),
            el.getAttribute("data-macro-label"),
            el.getAttribute("data-sub"),
            el.getAttribute("data-sub-label")
          );
          return;
        }
      });

      // search debounce
      let t;
      search.addEventListener("input", ()=>{
        clearTimeout(t);
        t = setTimeout(()=>{
          state.q = search.value;
          state.page = 1;
          render();
        }, 140);
      });

      sortSel.addEventListener("change", ()=>{
        state.sort = sortSel.value;
        state.page = 1;
        render();
      });

      perPageSel.addEventListener("change", ()=>{
        state.perPage = Number(perPageSel.value) || 12;
        state.page = 1;
        render();
      });

      btnGrid.addEventListener("click", ()=>{
        state.view = "grid";
        btnGrid.classList.add("active");
        btnList.classList.remove("active");
        render();
      });

      btnList.addEventListener("click", ()=>{
        state.view = "list";
        btnList.classList.add("active");
        btnGrid.classList.remove("active");
        render();
      });

      resetAll.addEventListener("click", setFilterAll);

      // overlay
      megaBtn?.addEventListener("click", toggleMega);
      megaClose?.addEventListener("click", closeMega);

      megaAll?.addEventListener("click", ()=>{
        setFilterAll();
        closeMega();
        document.querySelector("#catalogo")?.scrollIntoView({behavior:"smooth"});
      });

      catOverlay?.addEventListener("click", (e)=>{
        if(e.target === catOverlay) closeMega();
      });

      document.addEventListener("keydown", (e)=>{
        if(e.key === "Escape") closeMega();
      });

    }catch(err){
      console.error(err);
      countPill.textContent = "Errore";
      metaHead.textContent = "Errore: non riesco a caricare il catalogo.";
      tree.innerHTML = `<div style="padding:12px; font-weight:950;">Errore caricamento categorie.</div>`;
      grid.innerHTML = `
        <div class="emptyState">
          <div>
            <h3 style="margin:0 0 8px; font-size:18px; font-weight:1000;">Errore caricamento</h3>
            <div style="opacity:.8">Apri la console (F12) per vedere il dettaglio.</div>
          </div>
        </div>
      `;
      metaTop.textContent = "Errore";
      metaBottom.textContent = "Errore";
      pgBtns.innerHTML = "";
    }
  };

  // =========================================================
  // PRODUCT PAGE
  // =========================================================
  Catalogo.initProductPage = async function initProductPage(opts){
    const cfg = Object.assign({
      placeholder: "assets/img/prodotti/placeholder.jpg",
      dataCandidates: [
        "./data/products.json",
        "data/products.json",
        "/data/products.json"
      ],
      whatsappNumber: "390000000000",
      whatsappText: "Ciao! Mi dai info su questo prodotto?",
      ids: {
        y:"y",
        crumbPill:"crumbPill",
        badge:"badge",
        title:"title",
        desc:"desc",
        price:"price",
        skuLine:"skuLine",
        catLabel:"catLabel",
        brandLabel:"brandLabel",
        buy:"buy",
        wa:"wa",
        thumbs:"thumbs",
        heroImg:"heroImg",
        qty:"qty",
        qtyPlus:"qtyPlus",
        qtyMinus:"qtyMinus",
        addCart:"addCart",
        toast:"toast",
        empty:"empty",
        pLayout:"pLayout"
      }
    }, opts || {});

    const $ = (id)=> document.getElementById(id);
    if($(cfg.ids.y)) $(cfg.ids.y).textContent = new Date().getFullYear();

    function toast(msg){
      const t = $(cfg.ids.toast);
      if(!t) return;
      t.textContent = msg;
      t.classList.add("show");
      clearTimeout(toast._t);
      toast._t = setTimeout(()=>t.classList.remove("show"), 1600);
    }

    function setActiveThumb(idx){
      document.querySelectorAll(".thumb").forEach((t,i)=>{
        t.classList.toggle("active", i === idx);
      });
    }

    function setHero(src, alt){
      const heroImg = $(cfg.ids.heroImg);
      heroImg.src = src || cfg.placeholder;
      heroImg.alt = alt || "Immagine prodotto";
      heroImg.onerror = ()=>{ heroImg.src = cfg.placeholder; };
    }

    function makeImagesForProduct(p){
      // Se un giorno metti immagini vere:
      // assets/img/prodotti/<SKU>-1.jpg, -2.jpg, -3.jpg
      return [
        `assets/img/prodotti/${p.sku}-1.jpg`,
        `assets/img/prodotti/${p.sku}-2.jpg`,
        `assets/img/prodotti/${p.sku}-3.jpg`,
        cfg.placeholder
      ];
    }

    function renderProduct(p){
      document.title = `${p.title} • Il Capitano`;

      if($(cfg.ids.crumbPill)) $(cfg.ids.crumbPill).textContent = p.catLine || "Prodotto";
      $(cfg.ids.badge).textContent = p.microBadge || "PRODOTTO";
      $(cfg.ids.title).textContent = p.title || "(Senza nome)";

      // descrizione (non esiste nel json): fallback coerente
      const fallbackDesc = `Prodotto selezionato dal catalogo Il Capitano. Codice: ${p.sku}.`;
      $(cfg.ids.desc).textContent = fallbackDesc;

      $(cfg.ids.price).textContent = p.priceLabel || "—";
      $(cfg.ids.skuLine).textContent = `SKU: ${p.sku || "—"}`;

      $(cfg.ids.catLabel).textContent = p.catLine || p.category || "—";
      $(cfg.ids.brandLabel).textContent = (p.brand && p.brand.trim()) ? p.brand : "—";

      // eBay: ricerca
      const q = encodeURIComponent(`${p.title} ${p.sku}`.trim());
      $(cfg.ids.buy).href = `https://www.ebay.it/sch/i.html?_nkw=${q}`;

      // WhatsApp
      const msg = encodeURIComponent(`${cfg.whatsappText}\n\nProdotto: ${p.title}\nCodice: ${p.sku}`);
      $(cfg.ids.wa).href = `https://wa.me/${cfg.whatsappNumber}?text=${msg}`;

      // Gallery
      const imgs = makeImagesForProduct(p);
      setHero(imgs[0], p.title);

      const thumbs = $(cfg.ids.thumbs);
      thumbs.innerHTML = imgs.map((src,i)=>`
        <div class="thumb ${i===0 ? "active":""}" role="button" tabindex="0" data-i="${i}" aria-label="Foto ${i+1}">
          <div class="frame">
            <img src="${esc(src)}" alt="${esc(p.title)} foto ${i+1}" onerror="this.src='${esc(cfg.placeholder)}'">
          </div>
        </div>
      `).join("");

      thumbs.querySelectorAll(".thumb").forEach(el=>{
        const activate = ()=>{
          const i = Number(el.getAttribute("data-i"));
          setHero(imgs[i], p.title);
          setActiveThumb(i);
        };
        el.addEventListener("click", activate);
        el.addEventListener("keydown", (e)=>{
          if(e.key === "Enter" || e.key === " "){
            e.preventDefault();
            activate();
          }
        });
      });

      // quantità + carrello
      const qtyInput = $(cfg.ids.qty);
      const plus = $(cfg.ids.qtyPlus);
      const minus = $(cfg.ids.qtyMinus);

      const clampQty = ()=>{
        let v = Number(qtyInput.value);
        if(!Number.isFinite(v) || v < 1) v = 1;
        qtyInput.value = String(v);
        return v;
      };

      plus.onclick = ()=>{ qtyInput.value = String(clampQty()+1); };
      minus.onclick = ()=>{ qtyInput.value = String(Math.max(1, clampQty()-1)); };
      qtyInput.addEventListener("change", clampQty);

      $(cfg.ids.addCart).onclick = ()=>{
        const qty = clampQty();
        const cart = JSON.parse(localStorage.getItem("cart_ic") || "[]");

        const idx = cart.findIndex(x => String(x.sku) === String(p.sku));
        if(idx >= 0){
          cart[idx].qty = (Number(cart[idx].qty)||0) + qty;
        }else{
          cart.push({
            sku: p.sku,
            title: p.title,
            price: p.price || null,
            priceLabel: p.priceLabel || "—",
            microBadge: p.microBadge || "PRODOTTO",
            catLine: p.catLine || "",
            brand: p.brand || "",
            qty
          });
        }
        localStorage.setItem("cart_ic", JSON.stringify(cart));
        toast(`Aggiunto al carrello: ${qty} × ${p.title}`);
      };
    }

    try{
      const skuParam = norm(qs("sku") || qs("id") || "");

      const raw = await fetchCatalogJson(cfg.dataCandidates);
      const ALL = parseDaneaRows(raw);

      let p = ALL.find(x => String(x.sku) === String(skuParam));
      if(!p && skuParam){
        p = ALL.find(x => String(x.sku).includes(skuParam) || skuParam.includes(String(x.sku)));
      }

      if(!p){
        if($(cfg.ids.pLayout)) $(cfg.ids.pLayout).style.display = "none";
        if($(cfg.ids.empty)) $(cfg.ids.empty).style.display = "block";
        if($(cfg.ids.crumbPill)) $(cfg.ids.crumbPill).textContent = "Prodotto non trovato";
        setHero(cfg.placeholder, "Prodotto non trovato");
        return;
      }

      renderProduct(p);
    }catch(err){
      console.error(err);
      if($(cfg.ids.crumbPill)) $(cfg.ids.crumbPill).textContent = "Errore";
      $(cfg.ids.title).textContent = "Errore caricamento prodotto";
      $(cfg.ids.desc).textContent = "Non riesco a caricare il catalogo. Apri la console (F12) per vedere il dettaglio.";
      $(cfg.ids.price).textContent = "—";
      setHero(cfg.placeholder, "Errore");
    }
  };

     // =========================================================
  // API PUBBLICA RICHIESTA (window.Catalogo)
  // =========================================================

  Catalogo.norm = norm;
  Catalogo.slugify = slugify;
  Catalogo.buildModel = buildModel;

  Catalogo.loadCatalog = async function loadCatalog({ dataUrlCandidates, placeholderCover } = {}){
    const raw = await fetchCatalogJson(dataUrlCandidates);
    const ALL = parseDaneaRows(raw).map(p => Object.assign({ cover: placeholderCover }, p));
    return { ALL };
  };

  // Export globale richiesto
  window.Catalogo = Catalogo;


})();
