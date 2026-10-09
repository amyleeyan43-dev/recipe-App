// 今天吃啥 · 主逻辑（纯静态，localStorage 持久化）
(function () {
  "use strict";

  /* ================= 存储 ================= */
  const P = "jctx_";
  const store = {
    get(k, def) {
      try {
        const v = localStorage.getItem(P + k);
        return v === null ? def : JSON.parse(v);
      } catch (e) { return def; }
    },
    set(k, v) {
      try { localStorage.setItem(P + k, JSON.stringify(v)); } catch (e) {}
    }
  };

  // week 兼容旧格式：单 id 字符串 -> 数组
  function normWeek(w) {
    const out = {};
    Object.keys(w || {}).forEach((k) => {
      const v = w[k];
      out[k] = Array.isArray(v) ? v : (v ? [v] : []);
    });
    return out;
  }

  const state = {
    owned: new Set(store.get("owned", [])),
    shop: store.get("shop", []),
    week: normWeek(store.get("week", {})),
    shows: store.get("shows", []),
    points: store.get("points", { total: 0, log: [] }),
    inviteCode: store.get("inviteCode", null),
    avatar: store.get("avatar", "🍳"),
    diet: new Set(store.get("diet", [])),
    expiry: store.get("expiry", []),   // [{name, date: "YYYY-MM-DD"}]
    showStars: 5,
    mealFilter: "all",
    searchKw: "",
    servings: 2
  };
  const saveOwned = () => store.set("owned", [...state.owned]);
  const saveShop = () => store.set("shop", state.shop);
  const saveWeek = () => store.set("week", state.week);
  const saveShows = () => store.set("shows", state.shows);
  const savePoints = () => store.set("points", state.points);
  const saveDiet = () => store.set("diet", [...state.diet]);
  const saveExpiry = () => store.set("expiry", state.expiry);

  if (!state.inviteCode) {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let c = "";
    for (let i = 0; i < 8; i++) c += chars[Math.floor(Math.random() * chars.length)];
    state.inviteCode = c;
    store.set("inviteCode", c);
  }

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  const todayStr = () => {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  };
  const recipeById = (id) => RECIPES.find((r) => r.id === id);
  const randOf = (arr) => arr[Math.floor(Math.random() * arr.length)];

  const CAT_EMOJI = { "荤菜": "🍖", "素菜": "🥬", "汤羹": "🍲", "主食": "🍚", "凉菜": "🥗", "早餐": "🍳" };
  const SPICY = ["香辣", "酸辣"];

  /* ================= 图片（含占位兜底） ================= */
  function imgWrap(r, hero) {
    const emoji = CAT_EMOJI[r.category] || "🍳";
    const cls = hero ? "detail-hero" : "recipe-thumb";
    const wrapCls = hero ? "detail-hero-wrap" : "recipe-img-wrap";
    return `<div class="${wrapCls}">
      <img class="${cls}" src="images/${r.id}.jpg" alt="${esc(r.name)}" loading="lazy" onerror="this.style.display='none'">
      <div class="recipe-img-fallback"><span class="fb-emoji">${emoji}</span><span>${esc(r.name)}</span></div>
    </div>`;
  }

  /* ================= 底部导航 ================= */
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tab-page").forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      $(btn.dataset.tab).classList.add("active");
      window.scrollTo(0, 0);
    });
  });
  function goTab(tabId) {
    const btn = document.querySelector(`.nav-btn[data-tab="${tabId}"]`);
    if (btn) btn.click();
  }

  /* ================= 忌口 & 保质期 ================= */
  function dietExclude(r) {
    if (state.diet.has("nospicy") && SPICY.includes(r.taste)) return true;
    if (state.diet.has("nocilantro") && r.ingredients.includes("香菜")) return true;
    if (state.diet.has("kidmeal") && SPICY.includes(r.taste)) return true;
    return false;
  }
  function soonExpiring() {
    const today = new Date(todayStr());
    return state.expiry.filter((e) => {
      const d = new Date(e.date);
      const diff = (d - today) / 86400000;
      return diff >= 0 && diff <= 3;
    }).map((e) => e.name);
  }
  function isStockRecipe(r) {
    const soon = soonExpiring();
    return soon.length > 0 && r.ingredients.some((i) => soon.includes(i));
  }

  /* ================= 首页：灵感 ================= */
  function matchScore(recipe) {
    const total = recipe.ingredients.length;
    const hit = recipe.ingredients.filter((i) => state.owned.has(i)).length;
    return { hit, total, pct: total ? Math.round((hit / total) * 100) : 0 };
  }

  function homeRecipes() {
    const kw = state.searchKw.trim();
    let list = RECIPES.filter((r) => !dietExclude(r));
    if (state.mealFilter !== "all") list = list.filter((r) => r.meals.includes(state.mealFilter));
    if (kw) {
      list = list.filter((r) =>
        r.name.includes(kw) || r.taste.includes(kw) ||
        r.ingredients.some((i) => i.includes(kw)));
    }
    return list
      .map((r) => {
        const s = matchScore(r);
        let boost = 0;
        if (isStockRecipe(r)) boost += 1000;
        if (state.diet.has("kidmeal") && ["清淡", "香甜", "鲜美"].includes(r.taste)) boost += 100;
        return { r, s, key: boost * 10000 + s.pct * 100 + s.hit };
      })
      .sort((a, b) => b.key - a.key);
  }

  function renderHome() {
    const list = $("homeList");
    const items = homeRecipes();
    const bits = [];
    bits.push(`共 ${items.length} 道菜`);
    if (state.owned.size) bits.push(`已按 ${state.owned.size} 种食材匹配`);
    if (soonExpiring().length) bits.push(`🍊 ${soonExpiring().length} 样食材快到期，相关菜已优先`);
    if (state.diet.size) bits.push(`🚫 忌口生效中`);
    $("homeHint").textContent = bits.join(" · ");

    if (!items.length) {
      list.innerHTML = `<div class="empty-tip">没有符合条件的菜谱，换个筛选试试～</div>`;
      return;
    }
    list.innerHTML = items.map(({ r, s }) => `
      <div class="recipe-card" data-id="${r.id}">
        ${imgWrap(r, false)}
        <div class="recipe-body">
          <div class="recipe-tagrow">
            <span class="pill pill-green pill-sm">${r.time} 分钟</span>
            <span class="pill pill-pink pill-sm">${esc(r.taste)}</span>
          </div>
          <p class="recipe-name">${esc(r.name)}${isStockRecipe(r) ? `<span class="stock-badge">清库存</span>` : ""}</p>
          <div class="recipe-tagrow">${r.meals.map((m) => `<span class="pill pill-green pill-sm">${m}</span>`).join("")}</div>
          <p class="recipe-desc">${esc(r.desc)}</p>
        </div>
      </div>`).join("");
    list.querySelectorAll(".recipe-card").forEach((card) => {
      card.addEventListener("click", () => openDetail(card.dataset.id));
    });
  }

  document.querySelectorAll("#mealFilters .chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      document.querySelectorAll("#mealFilters .chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      state.mealFilter = chip.dataset.f;
      renderHome();
    });
  });
  let searchTimer = null;
  $("searchInput").addEventListener("input", (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.searchKw = e.target.value;
      renderHome();
    }, 250);
  });

  /* ================= 菜谱详情 ================= */
  const timers = {}; // stepIdx -> {left, intId, running}

  function clearTimers() {
    Object.keys(timers).forEach((k) => clearInterval(timers[k].intId));
    Object.keys(timers).forEach((k) => delete timers[k]);
  }

  function parseMinutes(text) {
    const m = text.match(/(\d+)\s*分/);
    if (m) return Math.min(120, Math.max(1, parseInt(m[1], 10)));
    return 5;
  }
  function fmtTime(sec) {
    const m = Math.floor(sec / 60), s = sec % 60;
    return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
  }

  function videoLinks(name) {
    const q = encodeURIComponent(name + "做法");
    return [
      { label: "📺 哔哩哔哩", url: "https://search.bilibili.com/all?keyword=" + q },
      { label: "▶️ YouTube", url: "https://www.youtube.com/results?search_query=" + q }
    ];
  }

  function renderServings(r) {
    const n = state.servings;
    const kcal = Math.round(r.kcal * n);
    const pro = Math.round(r.protein * n);
    return `<div class="serv-row">
      <span style="font-weight:700">👥 份量：</span>
      <div class="serv-btns">${[1, 2, 3, 4, 5, 6].map((i) =>
        `<button data-n="${i}" class="${i === n ? "on" : ""}">${i}</button>`).join("")}
      </div>
      <span class="nutri-line">约 ${kcal} 千卡 · 蛋白质约 ${pro} 克（估算）</span>
    </div>`;
  }

  function openDetail(id) {
    const r = recipeById(id);
    if (!r) return;
    clearTimers();
    state.servings = 2;
    const missing = r.ingredients.filter((i) => !state.owned.has(i));
    const ingHtml = r.ingredients.map((i) =>
      state.owned.has(i) ? `<li class="have">✓ ${esc(i)}</li>` : `<li class="miss">${esc(i)}</li>`
    ).join("");
    const stepHtml = r.steps.map((s, i) => `
      <li>
        <div class="step-top">
          <span class="step-num">${i + 1}</span>
          <span class="step-text">${esc(s)}</span>
        </div>
        <div class="step-timer-row">
          <button class="timer-btn" data-step="${i}">⏱ 计时</button>
          <span class="timer-display" id="td${i}"></span>
        </div>
      </li>`).join("");
    const vids = videoLinks(r.name).map((v) =>
      `<a href="${v.url}" target="_blank" rel="noopener">${v.label}</a>`
    ).join("");

    $("detailContent").innerHTML = `
      ${imgWrap(r, true)}
      <div class="detail-body">
        <h2>${esc(r.name)}</h2>
        <div class="detail-tagrow">
          <span class="pill pill-green pill-sm">${r.time} 分钟</span>
          <span class="pill pill-pink pill-sm">${esc(r.taste)}</span>
          ${r.meals.map((m) => `<span class="pill pill-green pill-sm">${m}</span>`).join("")}
          <span class="pill pill-sm" style="background:#F5F5F5;color:#888">${esc(r.category)} · ${esc(r.difficulty)}</span>
        </div>
        <p class="recipe-desc">${esc(r.desc)}</p>
        <label class="bigtext-toggle"><input type="checkbox" id="bigTextCk"> 🔍 大字模式（做饭时远距离看）</label>

        <div class="detail-sec" id="servSec">
          <h3>🍽️ 营养与份量</h3>
          ${renderServings(r)}
        </div>

        <div class="detail-sec">
          <h3>🧂 所需食材（${r.ingredients.filter((i) => state.owned.has(i)).length}/${r.ingredients.length} 已有）</h3>
          <ul class="ing-list">${ingHtml}</ul>
          ${missing.length ? `<button class="primary-btn" id="addMissing">🛒 把缺的 ${missing.length} 样加入采买清单</button>` : `<p class="hint">🎉 食材齐了，直接开做吧！</p>`}
        </div>

        <div class="detail-sec">
          <h3>👩‍🍳 做法步骤</h3>
          <ol class="step-list">${stepHtml}</ol>
        </div>

        <div class="detail-sec">
          <h3>🎬 视频教程</h3>
          <div class="video-links">${vids}</div>
        </div>

        <button class="ghost-btn" id="detailCooked" style="width:100%">✅ 我做过这道菜，去晒单</button>
      </div>
    `;
    $("detailCard").classList.remove("big-text");
    $("recipeDetail").classList.remove("hidden");

    // 大字模式
    $("bigTextCk").addEventListener("change", (e) => {
      $("detailCard").classList.toggle("big-text", e.target.checked);
    });

    // 份量
    function bindServ() {
      $("servSec").querySelectorAll(".serv-btns button").forEach((bb) => {
        bb.addEventListener("click", () => {
          state.servings = parseInt(bb.dataset.n, 10);
          $("servSec").querySelector(".serv-row").outerHTML = renderServings(r);
          bindServ();
        });
      });
    }
    bindServ();

    // 计时器
    document.querySelectorAll(".timer-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const i = btn.dataset.step;
        const disp = $("td" + i);
        const t = timers[i];
        if (t && t.running) {
          // 暂停
          clearInterval(t.intId);
          t.running = false;
          btn.textContent = "▶️ 继续";
          return;
        }
        if (t && !t.running) {
          // 继续
          t.running = true;
          btn.textContent = "⏸ 暂停";
          t.intId = setInterval(() => tick(i), 1000);
          return;
        }
        // 新建
        const mins = parseMinutes(r.steps[parseInt(i, 10)]);
        timers[i] = { left: mins * 60, running: true, intId: null };
        disp.classList.remove("ringing");
        disp.textContent = fmtTime(timers[i].left);
        btn.textContent = "⏸ 暂停";
        timers[i].intId = setInterval(() => tick(i), 1000);
      });
    });
    function tick(i) {
      const t = timers[i];
      const disp = $("td" + i);
      if (!t) return;
      t.left -= 1;
      if (t.left <= 0) {
        clearInterval(t.intId);
        delete timers[i];
        if (disp) {
          disp.textContent = "⏰ 时间到！";
          disp.classList.add("ringing");
        }
        const btn = document.querySelector(`.timer-btn[data-step="${i}"]`);
        if (btn) btn.textContent = "⏱ 计时";
        try { navigator.vibrate && navigator.vibrate(300); } catch (e) {}
        return;
      }
      if (disp) disp.textContent = fmtTime(t.left);
    }

    const addBtn = $("addMissing");
    if (addBtn) addBtn.addEventListener("click", () => {
      let added = 0;
      missing.forEach((m) => {
        if (!state.shop.some((s) => s.name === m)) { state.shop.push({ name: m, done: false }); added++; }
      });
      saveShop(); renderShop();
      alert(`已把 ${added} 样食材加入采买清单 🛒`);
    });
    $("detailCooked").addEventListener("click", () => {
      closeDetail();
      $("showRecipe").value = r.name;
      goTab("tab-me");
    });
  }
  function closeDetail() {
    clearTimers();
    $("recipeDetail").classList.add("hidden");
  }
  $("closeDetail").addEventListener("click", closeDetail);
  $("recipeDetail").addEventListener("click", (e) => {
    if (e.target === $("recipeDetail")) closeDetail();
  });

  /* ================= 食材页 ================= */
  function renderIngredients() {
    const box = $("ingCategories");
    box.innerHTML = "";
    INGREDIENT_CATEGORIES.forEach((cat) => {
      const div = document.createElement("div");
      div.className = "cat-block";
      const chips = cat.items.map((it) =>
        `<button class="ing-chip${state.owned.has(it) ? " on" : ""}" data-ing="${esc(it)}">${esc(it)}</button>`
      ).join("");
      div.innerHTML = `<p class="cat-title">${esc(cat.name)}</p><div class="ing-grid">${chips}</div>`;
      box.appendChild(div);
    });
    box.querySelectorAll(".ing-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        const ing = chip.dataset.ing;
        if (state.owned.has(ing)) { state.owned.delete(ing); chip.classList.remove("on"); }
        else { state.owned.add(ing); chip.classList.add("on"); }
        saveOwned();
        updateIngCount();
        renderHome();
      });
    });
    updateIngCount();
  }
  function updateIngCount() {
    $("ingCount").textContent = `已选 ${state.owned.size} 种食材`;
  }
  $("clearIng").addEventListener("click", () => {
    state.owned.clear();
    saveOwned();
    renderIngredients();
    renderHome();
  });

  $("genRecipes").addEventListener("click", () => {
    if (state.owned.size === 0) {
      alert("先勾选几样你手头的食材吧 🧺");
      return;
    }
    state.mealFilter = "all";
    state.searchKw = "";
    $("searchInput").value = "";
    document.querySelectorAll("#mealFilters .chip").forEach((c) =>
      c.classList.toggle("active", c.dataset.f === "all"));
    renderHome();
    goTab("tab-home");
  });

  // 保质期
  function renderExpiry() {
    const box = $("expList");
    const today = todayStr();
    if (!state.expiry.length) {
      box.innerHTML = `<div class="empty-tip">还没登记，快到期的食材记在这里吧～</div>`;
      return;
    }
    const sorted = [...state.expiry].sort((a, b) => a.date.localeCompare(b.date));
    box.innerHTML = "";
    sorted.forEach((e, idx) => {
      const diff = Math.round((new Date(e.date) - new Date(today)) / 86400000);
      const tag = diff < 0 ? `<span class="soon">已过期${-diff}天</span>`
        : diff === 0 ? `<span class="soon">今天到期</span>`
        : diff <= 3 ? `<span class="soon">还剩${diff}天</span>`
        : `<span style="color:#999;font-size:13px">还剩${diff}天</span>`;
      const d = document.createElement("div");
      d.className = "expiry-item";
      d.innerHTML = `<span>${esc(e.name)}</span><span>${e.date} ${tag}</span>`;
      const del = document.createElement("button");
      del.className = "del";
      del.textContent = "✕";
      del.addEventListener("click", () => {
        state.expiry.splice(state.expiry.indexOf(e), 1);
        saveExpiry(); renderExpiry(); renderHome();
      });
      d.appendChild(del);
      box.appendChild(d);
    });
  }
  $("expAdd").addEventListener("click", () => {
    const name = $("expName").value.trim();
    const date = $("expDate").value;
    if (!name || !date) { alert("填上食材名和到期日期～"); return; }
    const i = state.expiry.findIndex((e) => e.name === name);
    if (i >= 0) state.expiry[i].date = date;
    else state.expiry.push({ name, date });
    saveExpiry();
    $("expName").value = "";
    $("expDate").value = "";
    renderExpiry(); renderHome();
  });

  // 忌口
  function renderDiet() {
    document.querySelectorAll("#dietRow .diet-chip").forEach((c) => {
      c.classList.toggle("on", state.diet.has(c.dataset.d));
    });
  }
  document.querySelectorAll("#dietRow .diet-chip").forEach((c) => {
    c.addEventListener("click", () => {
      const d = c.dataset.d;
      if (state.diet.has(d)) state.diet.delete(d);
      else state.diet.add(d);
      saveDiet(); renderDiet(); renderHome();
    });
  });

  /* ================= 一周 ================= */
  const DAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
  const MEALS = ["早餐", "午餐", "晚餐"];

  function renderWeek() {
    const box = $("weekPlan");
    box.innerHTML = "";
    DAYS.forEach((day, di) => {
      const d = document.createElement("div");
      d.className = "week-day";
      let html = `<h4>${day}</h4>`;
      MEALS.forEach((meal, mi) => {
        const key = di + "_" + mi;
        const dishes = state.week[key] || [];
        const rows = dishes.map((rid) => {
          const r = recipeById(rid);
          if (!r) return "";
          return `<div class="dish-row"><span>${esc(r.name)}</span><span style="color:#999;font-size:12px">${r.time}分钟</span><button class="rm" data-key="${key}" data-id="${rid}">✕</button></div>`;
        }).join("");
        html += `<div class="meal-block">
          <div class="meal-head"><span class="meal-label">${meal}</span>
            <button class="add-dish-btn" data-key="${key}">＋ 添加一道</button></div>
          <div class="dish-list">${rows}</div>
          <div class="dish-picker" id="pk_${key}" style="display:none">
            <select>${`<option value="">选择菜谱…</option>` + RECIPES.map((r) => `<option value="${r.id}">${esc(r.name)}</option>`).join("")}</select>
            <button class="primary-btn" style="padding:8px 14px">加</button>
          </div>
        </div>`;
      });
      d.innerHTML = html;
      box.appendChild(d);
    });

    // 移除
    box.querySelectorAll(".dish-row .rm").forEach((b) => {
      b.addEventListener("click", () => {
        const arr = state.week[b.dataset.key] || [];
        state.week[b.dataset.key] = arr.filter((id) => id !== b.dataset.id);
        saveWeek(); renderWeek();
      });
    });
    // 添加
    box.querySelectorAll(".add-dish-btn").forEach((b) => {
      b.addEventListener("click", () => {
        const pk = $("pk_" + b.dataset.key);
        pk.style.display = pk.style.display === "none" ? "flex" : "none";
      });
    });
    box.querySelectorAll(".dish-picker").forEach((pk) => {
      const sel = pk.querySelector("select");
      const btn = pk.querySelector("button");
      const key = pk.id.replace("pk_", "");
      btn.addEventListener("click", () => {
        if (!sel.value) return;
        if (!state.week[key]) state.week[key] = [];
        if (!state.week[key].includes(sel.value)) {
          state.week[key].push(sel.value);
          saveWeek(); renderWeek();
        } else {
          alert("这道菜已经加过了～");
        }
      });
    });
  }

  $("genShopFromWeek").addEventListener("click", () => {
    const dishIds = [];
    Object.values(state.week).forEach((arr) => dishIds.push(...arr));
    if (!dishIds.length) { alert("还没安排任何菜谱，先去加几道菜吧～"); return; }
    const need = new Set();
    let totalTime = 0;
    dishIds.forEach((rid) => {
      const r = recipeById(rid);
      if (!r) return;
      totalTime += r.time;
      r.ingredients.forEach((i) => { if (!state.owned.has(i)) need.add(i); });
    });
    let added = 0;
    need.forEach((n) => {
      if (!state.shop.some((s) => s.name === n)) { state.shop.push({ name: n, done: false }); added++; }
    });
    saveShop(); renderShop();
    const h = Math.floor(totalTime / 60), m = totalTime % 60;
    const timeStr = h ? `${h}小时${m}分钟` : `${m}分钟`;
    $("weekSummary").innerHTML = `<div class="card" style="margin-top:12px">
      <h3>📊 本周汇总</h3>
      <p style="margin:4px 0">共安排 <b>${dishIds.length}</b> 道菜，预计总烹饪时间 <b>${timeStr}</b></p>
      <p style="margin:4px 0;color:var(--muted);font-size:14px">已把 ${added} 样缺少的食材加入采买清单（家里已有的自动排除）</p>
    </div>`;
    alert(`已把 ${added} 样缺少的食材加入采买清单 🛒`);
  });

  /* ================= 采买清单 ================= */
  function renderShop() {
    const list = $("shopList");
    $("shopCount").textContent = state.shop.length ? state.shop.length + "样" : "";
    if (!state.shop.length) {
      list.innerHTML = `<div class="empty-tip">清单空空如也，去菜谱详情里一键加入缺的食材吧～</div>`;
      return;
    }
    list.innerHTML = "";
    state.shop.forEach((item, idx) => {
      const li = document.createElement("li");
      li.className = item.done ? "done" : "";
      li.innerHTML = `<span class="box">${item.done ? "✓" : ""}</span><span class="txt">${esc(item.name)}</span><button class="del">✕</button>`;
      li.addEventListener("click", (e) => {
        if (e.target.classList.contains("del")) return;
        item.done = !item.done;
        saveShop(); renderShop();
      });
      li.querySelector(".del").addEventListener("click", (e) => {
        e.stopPropagation();
        state.shop.splice(idx, 1);
        saveShop(); renderShop();
      });
      list.appendChild(li);
    });
  }
  $("shopAdd").addEventListener("click", () => {
    const inp = $("shopInput");
    const name = inp.value.trim();
    if (!name) return;
    if (state.shop.some((s) => s.name === name)) { alert("清单里已经有啦～"); return; }
    state.shop.push({ name, done: false });
    saveShop(); renderShop();
    inp.value = "";
  });
  $("shopInput").addEventListener("keydown", (e) => { if (e.key === "Enter") $("shopAdd").click(); });
  $("clearBought").addEventListener("click", () => {
    const n = state.shop.filter((s) => s.done).length;
    state.shop = state.shop.filter((s) => !s.done);
    saveShop(); renderShop();
    if (n) alert(`清空了 ${n} 样已买的，真棒！✨`);
  });
  $("downloadShop").addEventListener("click", () => {
    if (!state.shop.length) { alert("清单是空的，先加几样东西吧～"); return; }
    const lines = ["今天吃啥 · 采买清单", todayStr(), ""];
    state.shop.forEach((s, i) => lines.push(`${s.done ? "☑" : "☐"} ${i + 1}. ${s.name}`));
    lines.push("", "—— 祝做饭愉快！😋");
    const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "采买清单.txt";
    a.style.display = "none";
    document.body.appendChild(a);
    // 移动端兼容：用 dispatchEvent 触发点击，避免 alert 打断下载
    a.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 2000);
  });

  /* ================= 厨房助手 ================= */
  const AVATARS = ["🍳", "🐱", "🐶", "🐰", "🦊", "🐼", "🐷", "🌟"];
  const FRIENDS = [
    { emoji: "🐰", name: "小兔" },
    { emoji: "🐱", name: "阿喵" },
    { emoji: "🦊", name: "小狐" },
    { emoji: "🐼", name: "胖达" }
  ];
  const FRIEND_COMMENTS = [
    "看起来好好吃！求投喂！😋", "这色泽，专业水准啊👍", "我也要照着做一份！",
    "摆盘可以啊，有大厨那味了🍽️", "深夜看这个也太馋了…🤤", "下次做记得叫我！🙋"
  ];
  const PRAISES = [
    "你太厉害了！自己动手做饭的人最值得骄傲 🌟",
    "闻到香味了！今天又是被自己厨艺征服的一天 😋",
    "慢慢来，每一道菜都是进步，超棒的！💪",
    "会做饭的人最有魅力，你已经赢在起跑线啦 ✨"
  ];

  function renderAvatarChoices() {
    const box = $("avatarChoices");
    box.innerHTML = "";
    AVATARS.forEach((a) => {
      const b = document.createElement("button");
      b.className = "av-choice" + (a === state.avatar ? " on" : "");
      b.textContent = a;
      b.addEventListener("click", () => {
        state.avatar = a;
        store.set("avatar", a);
        renderAvatarChoices();
        botSay(`换好啦！我现在是 ${a} ，继续陪你下厨～💛`);
      });
      box.appendChild(b);
    });
  }
  function botSay(text) {
    const box = $("chatBox");
    const d = document.createElement("div");
    d.className = "msg bot";
    d.innerHTML = `${esc(state.avatar)} ${esc(text)}`;
    box.appendChild(d);
    box.scrollTop = box.scrollHeight;
  }
  function userSay(text) {
    const box = $("chatBox");
    const d = document.createElement("div");
    d.className = "msg user";
    d.textContent = text;
    box.appendChild(d);
    box.scrollTop = box.scrollHeight;
  }
  function recipeSummary(r) {
    const s = matchScore(r);
    return `「${r.name}」${r.taste}·约${r.time}分钟，需要：${r.ingredients.join("、")}。你已经有 ${s.hit}/${s.total} 样${s.hit === s.total ? "，食材齐了冲！🔥" : "，缺的可以去清单里看看～"}`;
  }
  function assistantReply(q) {
    const named = RECIPES.find((r) => q.includes(r.name));
    if (named) {
      const top = named.steps.slice(0, 3).join("；");
      return `包在我身上！${randOf(PRAISES)}\n\n${recipeSummary(named)}\n\n关键步骤：${top}…\n完整步骤去「灵感」页点这道菜看详情哦，加油！💛`;
    }
    const allIngs = [];
    INGREDIENT_CATEGORIES.forEach((c) => allIngs.push(...c.items));
    const hitIngs = allIngs.filter((i) => q.includes(i));
    if (hitIngs.length) {
      const scored = RECIPES
        .filter((r) => !dietExclude(r))
        .map((r) => ({ r, n: r.ingredients.filter((i) => hitIngs.includes(i)).length }))
        .filter((x) => x.n > 0)
        .sort((a, b) => b.n - a.n)
        .slice(0, 3);
      if (scored.length) {
        const names = scored.map((x) => `「${x.r.name}」（用到${x.n}样）`).join("、");
        return `有${hitIngs.join("、")}啊，太好了！我给你挑了最搭的：${names}。\n\n${randOf(PRAISES)} 快去「灵感」页看看详情吧～🍳`;
      }
    }
    const pool = RECIPES.filter((r) => !dietExclude(r));
    const r = randOf(pool.length ? pool : RECIPES);
    return `${randOf(PRAISES)}\n\n要不要试试「${r.name}」？${r.taste}·约${r.time}分钟，超适合练手！去「灵感」页搜它看详细步骤吧💛`;
  }
  function sendChat() {
    const inp = $("chatInput");
    const q = inp.value.trim();
    if (!q) return;
    inp.value = "";
    userSay(q);
    setTimeout(() => botSay(assistantReply(q)), 350);
  }
  $("chatSend").addEventListener("click", sendChat);
  $("chatInput").addEventListener("keydown", (e) => { if (e.key === "Enter") sendChat(); });

  /* ================= 我的：晒单 & 积分 ================= */
  function renderShowRecipeOptions() {
    $("showRecipe").innerHTML = RECIPES.map((r) =>
      `<option value="${esc(r.name)}">${esc(r.name)}</option>`).join("");
  }
  document.querySelectorAll("#showStars span").forEach((sp) => {
    sp.addEventListener("click", () => {
      state.showStars = parseInt(sp.dataset.v, 10);
      paintStars();
    });
  });
  function paintStars() {
    document.querySelectorAll("#showStars span").forEach((sp) => {
      sp.classList.toggle("lit", parseInt(sp.dataset.v, 10) <= state.showStars);
    });
  }
  function addPoints(delta, text) {
    state.points.total += delta;
    state.points.log.unshift({ text, delta, date: todayStr() });
    savePoints(); renderPoints();
  }
  $("showSubmit").addEventListener("click", () => {
    const name = $("showRecipe").value;
    const note = $("showNote").value.trim();
    const shuffled = [...FRIENDS].sort(() => Math.random() - 0.5);
    const friends = shuffled.slice(0, 2 + Math.floor(Math.random() * 2)).map((f) => ({
      emoji: f.emoji, name: f.name,
      stars: 4 + Math.floor(Math.random() * 2),
      text: randOf(FRIEND_COMMENTS)
    }));
    state.shows.unshift({
      id: "s" + Date.now(), name, stars: state.showStars, note,
      date: todayStr(), friends
    });
    saveShows();
    addPoints(5, `📸 晒单「${name}」`);
    $("showNote").value = "";
    state.showStars = 5; paintStars();
    renderWall();
    alert("晒单成功！积分 +5 🎉");
  });
  function renderWall() {
    const wall = $("showWall");
    if (!state.shows.length) {
      wall.innerHTML = `<div class="empty-tip">还没有晒单，快去做一道菜来晒晒吧～</div>`;
      return;
    }
    wall.innerHTML = "";
    state.shows.forEach((s) => {
      const d = document.createElement("div");
      d.className = "show-item";
      const frHtml = s.friends.map((f) =>
        `<div class="fr">${f.emoji} <b>${esc(f.name)}</b>：${"★".repeat(f.stars)} ${esc(f.text)}</div>`
      ).join("");
      d.innerHTML = `
        <div class="show-head"><span class="show-name">${esc(s.name)}</span><span class="show-date">${esc(s.date)}</span></div>
        <div class="show-stars">${"★".repeat(s.stars)}${"☆".repeat(5 - s.stars)}</div>
        ${s.note ? `<p class="show-note">${esc(s.note)}</p>` : ""}
        <div class="friend-ratings">
          <span class="demo-tag">🎭 演示：虚拟好友打分</span>
          ${frHtml}
        </div>`;
      wall.appendChild(d);
    });
  }
  function renderPoints() {
    $("pointsNum").textContent = state.points.total;
    $("inviteCode").textContent = state.inviteCode;
    const log = $("pointsLog");
    if (!state.points.log.length) {
      log.innerHTML = `<li><span style="color:#999">还没有积分记录</span><span></span></li>`;
      return;
    }
    log.innerHTML = state.points.log.map((e) =>
      `<li><span>${esc(e.text)}<br><small style="color:#999">${esc(e.date)}</small></span><span class="plus">+${e.delta}</span></li>`
    ).join("");
  }
  $("copyCode").addEventListener("click", () => {
    const done = () => alert("邀请码已复制！");
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(state.inviteCode).then(done).catch(() => prompt("复制邀请码：", state.inviteCode));
    } else {
      prompt("复制邀请码：", state.inviteCode);
    }
  });
  $("simInvite").addEventListener("click", () => {
    const f = randOf(FRIENDS);
    addPoints(10, `🎭演示：${f.emoji}${f.name}接受了你的邀请`);
    alert(`${f.emoji} ${f.name}（演示）接受了邀请，积分 +10！🎉`);
  });

  /* ================= 初始化 ================= */
  renderIngredients();
  renderExpiry();
  renderDiet();
  renderHome();
  renderAvatarChoices();
  renderShop();
  renderWeek();
  renderShowRecipeOptions();
  paintStars();
  renderWall();
  renderPoints();
  botSay(`嗨！我是你的厨房小助手 ${state.avatar}～今天想做什么好吃的？我会一直给你加油打气的！💛`);
})();
