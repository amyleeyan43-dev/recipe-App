// 小饭桌 · 食谱APP —— 主逻辑（纯静态，localStorage 持久化）
(function () {
  "use strict";

  /* ================= 存储 ================= */
  const P = "recipeApp_";
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

  const state = {
    owned: new Set(store.get("owned", [])),
    shop: store.get("shop", []),            // [{name, done}]
    week: store.get("week", {}),            // {"d_m": recipeId}
    shows: store.get("shows", []),          // [{id, name, stars, note, date, friends:[{emoji,name,stars,text}]}]
    points: store.get("points", { total: 0, log: [] }),
    inviteCode: store.get("inviteCode", null),
    avatar: store.get("avatar", "🍳"),
    showStars: 5,
    recipeFilter: "all",
    lastMatched: []                          // 最近一次匹配结果（recipe id 数组）
  };
  function saveOwned() { store.set("owned", [...state.owned]); }
  function saveShop() { store.set("shop", state.shop); }
  function saveWeek() { store.set("week", state.week); }
  function saveShows() { store.set("shows", state.shows); }
  function savePoints() { store.set("points", state.points); }

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
  const recipeByName = (n) => RECIPES.find((r) => r.name === n);

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
    document.querySelector(`.nav-btn[data-tab="${tabId}"]`).click();
  }

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
  });

  /* ================= 菜谱匹配 ================= */
  function matchScore(recipe) {
    const total = recipe.ingredients.length;
    const hit = recipe.ingredients.filter((i) => state.owned.has(i)).length;
    return { hit, total, pct: total ? Math.round((hit / total) * 100) : 0 };
  }
  function sortedRecipes() {
    return RECIPES
      .map((r) => ({ r, s: matchScore(r) }))
      .sort((a, b) => b.s.pct - a.s.pct || b.s.hit - a.s.hit);
  }

  $("genRecipes").addEventListener("click", () => {
    if (state.owned.size === 0) {
      alert("先勾选几样你手头的食材吧 🧺");
      return;
    }
    state.recipeFilter = "all";
    document.querySelectorAll("#recipeFilters .chip").forEach((c) =>
      c.classList.toggle("active", c.dataset.f === "all"));
    renderRecipes();
    goTab("tab-recipes");
  });

  document.querySelectorAll("#recipeFilters .chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      document.querySelectorAll("#recipeFilters .chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      state.recipeFilter = chip.dataset.f;
      renderRecipes();
    });
  });

  function renderRecipes() {
    const list = $("recipeList");
    const matched = sortedRecipes().filter(({ r }) =>
      state.recipeFilter === "all" || r.category === state.recipeFilter);
    state.lastMatched = sortedRecipes().map(({ r }) => r.id);

    if (state.owned.size === 0) {
      $("recipeHint").textContent = "先去「食材」页勾选你有的食材吧";
    } else {
      $("recipeHint").textContent = `已按你有的 ${state.owned.size} 种食材匹配，匹配度从高到低`;
    }

    if (!matched.length) {
      list.innerHTML = `<div class="empty-tip">这个分类下还没有菜谱，换个分类看看～</div>`;
      return;
    }
    list.innerHTML = matched.map(({ r, s }) => `
      <div class="recipe-card" data-id="${r.id}">
        <img class="recipe-thumb" src="images/${r.id}.jpg" alt="${esc(r.name)}" loading="lazy" onerror="this.style.display='none'">
        <div class="recipe-body">
        <div class="recipe-top">
          <p class="recipe-name">${esc(r.name)}</p>
          <span class="match-badge">匹配 ${s.pct}%</span>
        </div>
        <p class="recipe-meta">${esc(r.category)} · ${esc(r.difficulty)} · 约${r.time}分钟 · 已有 ${s.hit}/${s.total} 样食材</p>
        <div class="recipe-tags">${r.ingredients.slice(0, 5).map((i) => `<span class="tag">${esc(i)}</span>`).join("")}${r.ingredients.length > 5 ? `<span class="tag">+${r.ingredients.length - 5}</span>` : ""}</div>
        </div>
      </div>`).join("");
    list.querySelectorAll(".recipe-card").forEach((card) => {
      card.addEventListener("click", () => openDetail(card.dataset.id));
    });
  }

  /* ================= 菜谱详情 ================= */
  function videoLinks(name) {
    const q = encodeURIComponent(name + "做法");
    return [
      { label: "📕 小红书", url: "https://www.xiaohongshu.com/search_result?keyword=" + q },
      { label: "📺 哔哩哔哩", url: "https://search.bilibili.com/all?keyword=" + q },
      { label: "▶️ YouTube", url: "https://www.youtube.com/results?search_query=" + q }
    ];
  }

  function openDetail(id) {
    const r = recipeById(id);
    if (!r) return;
    const missing = r.ingredients.filter((i) => !state.owned.has(i));
    const ingHtml = r.ingredients.map((i) =>
      state.owned.has(i)
        ? `<li class="have ing-have">✓ ${esc(i)}</li>`
        : `<li class="miss ing-miss">✗ ${esc(i)}</li>`
    ).join("");
    const stepHtml = r.steps.map((s, i) =>
      `<li><span class="step-num">${i + 1}</span><span>${esc(s)}</span></li>`
    ).join("");
    const vids = videoLinks(r.name).map((v) =>
      `<a href="${v.url}" target="_blank" rel="noopener">${v.label}</a>`
    ).join("");

    $("detailContent").innerHTML = `
      <h2>${esc(r.name)}</h2>
      <img class="detail-hero" src="images/${r.id}.jpg" alt="${esc(r.name)}" onerror="this.style.display='none'">
      <p class="recipe-meta">${esc(r.category)} · ${esc(r.difficulty)} · 约${r.time}分钟</p>
      <h3 style="margin:12px 0 4px;font-size:15px;">🧂 所需食材（${r.ingredients.filter((i) => state.owned.has(i)).length}/${r.ingredients.length} 已有）</h3>
      <ul class="ing-list">${ingHtml}</ul>
      ${missing.length ? `<button class="primary-btn" id="addMissing">🛒 把缺的 ${missing.length} 样加入采买清单</button>` : `<p class="hint">🎉 食材齐了，直接开做吧！</p>`}
      <h3 style="margin:14px 0 4px;font-size:15px;">👩‍🍳 做法步骤</h3>
      <ol class="step-list">${stepHtml}</ol>
      <h3 style="margin:14px 0 4px;font-size:15px;">🎬 视频教程</h3>
      <div class="video-links">${vids}</div>
      <button class="ghost-btn" id="detailCooked">✅ 我做过这道菜，去晒单</button>
    `;
    $("recipeDetail").classList.remove("hidden");

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
      $("recipeDetail").classList.add("hidden");
      $("showRecipe").value = r.name;
      goTab("tab-me");
      window.scrollTo(0, 0);
    });
  }
  $("closeDetail").addEventListener("click", () => $("recipeDetail").classList.add("hidden"));
  $("recipeDetail").addEventListener("click", (e) => {
    if (e.target === $("recipeDetail")) $("recipeDetail").classList.add("hidden");
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
  const randOf = (arr) => arr[Math.floor(Math.random() * arr.length)];

  function recipeSummary(r) {
    const s = matchScore(r);
    return `「${r.name}」${r.difficulty}·约${r.time}分钟，需要：${r.ingredients.join("、")}。你已经有 ${s.hit}/${s.total} 样${s.hit === s.total ? "，食材齐了冲！🔥" : "，缺的可以去清单里看看～"}`;
  }

  function assistantReply(q) {
    // 1. 直接问某道菜
    const named = RECIPES.find((r) => q.includes(r.name));
    if (named) {
      const top = named.steps.slice(0, 3).join("；");
      return `包在我身上！${randOf(PRAISES)}\n\n${recipeSummary(named)}\n\n关键步骤：${top}…\n完整步骤去「菜谱」页看这道菜的详情哦，加油！💛`;
    }
    // 2. 按食材推荐
    const allIngs = [];
    INGREDIENT_CATEGORIES.forEach((c) => allIngs.push(...c.items));
    const hitIngs = allIngs.filter((i) => q.includes(i));
    if (hitIngs.length) {
      const scored = RECIPES
        .map((r) => ({ r, n: r.ingredients.filter((i) => hitIngs.includes(i)).length }))
        .filter((x) => x.n > 0)
        .sort((a, b) => b.n - a.n)
        .slice(0, 3);
      if (scored.length) {
        const names = scored.map((x) => `「${x.r.name}」（用到${x.n}样）`).join("、");
        return `有${hitIngs.join("、")}啊，太好了！我给你挑了最搭的：${names}。\n\n${randOf(PRAISES)} 快去「菜谱」页看看详情吧～🍳`;
      }
    }
    // 3. 鼓励 + 随机推荐
    const r = randOf(RECIPES);
    return `${randOf(PRAISES)}\n\n要不要试试「${r.name}」？${r.difficulty}·约${r.time}分钟，超适合练手！去「菜谱」页搜它看详细步骤吧💛`;
  }

  $("chatSend").addEventListener("click", sendChat);
  $("chatInput").addEventListener("keydown", (e) => { if (e.key === "Enter") sendChat(); });
  function sendChat() {
    const inp = $("chatInput");
    const q = inp.value.trim();
    if (!q) return;
    inp.value = "";
    userSay(q);
    setTimeout(() => botSay(assistantReply(q)), 350);
  }

  /* ================= 采买清单 ================= */
  function renderShop() {
    const list = $("shopList");
    $("shopCount").textContent = state.shop.length ? state.shop.length + "样" : "";
    if (!state.shop.length) {
      list.innerHTML = `<div class="empty-tip">清单空空如也，去菜谱里一键加入缺的食材吧～</div>`;
      return;
    }
    list.innerHTML = "";
    state.shop.forEach((item, idx) => {
      const li = document.createElement("li");
      li.className = item.done ? "done" : "";
      li.innerHTML = `<span class="box">${item.done ? "✓" : ""}</span><span class="txt">${esc(item.name)}</span><button class="del">✕</button>`;
      li.querySelector(".box").parentElement.addEventListener("click", (e) => {
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
  function addToShop(name) {
    name = name.trim();
    if (!name) return false;
    if (state.shop.some((s) => s.name === name)) return false;
    state.shop.push({ name, done: false });
    saveShop(); renderShop();
    return true;
  }
  $("shopAdd").addEventListener("click", () => {
    const inp = $("shopInput");
    if (addToShop(inp.value)) inp.value = "";
    else if (inp.value.trim()) alert("清单里已经有啦～");
  });
  $("shopInput").addEventListener("keydown", (e) => { if (e.key === "Enter") $("shopAdd").click(); });
  $("clearBought").addEventListener("click", () => {
    const n = state.shop.filter((s) => s.done).length;
    state.shop = state.shop.filter((s) => !s.done);
    saveShop(); renderShop();
    if (n) alert(`清空了 ${n} 样已买的，真棒！✨`);
  });

  /* ================= 一周菜谱 ================= */
  const DAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
  const MEALS = ["早餐", "午餐", "晚餐"];
  function renderWeek() {
    const box = $("weekPlan");
    box.innerHTML = "";
    const options = `<option value="">— 不安排 —</option>` +
      RECIPES.map((r) => `<option value="${r.id}">${esc(r.name)}</option>`).join("");
    DAYS.forEach((day, di) => {
      const d = document.createElement("div");
      d.className = "week-day";
      const rows = MEALS.map((meal, mi) => {
        const key = di + "_" + mi;
        return `<div class="meal-row"><span class="meal-label">${meal}</span>
          <select data-key="${key}">${options}</select></div>`;
      }).join("");
      d.innerHTML = `<h4>${day}</h4>${rows}`;
      box.appendChild(d);
    });
    box.querySelectorAll("select").forEach((sel) => {
      sel.value = state.week[sel.dataset.key] || "";
      sel.addEventListener("change", () => {
        if (sel.value) state.week[sel.dataset.key] = sel.value;
        else delete state.week[sel.dataset.key];
        saveWeek();
      });
    });
  }
  $("genShopFromWeek").addEventListener("click", () => {
    const need = new Set();
    Object.values(state.week).forEach((rid) => {
      const r = recipeById(rid);
      if (r) r.ingredients.forEach((i) => { if (!state.owned.has(i)) need.add(i); });
    });
    if (!need.size) { alert("这一周啥都不缺，或者还没安排菜谱～"); return; }
    let added = 0;
    need.forEach((n) => { if (addToShopSilent(n)) added++; });
    saveShop(); renderShop();
    alert(`已把 ${added} 样缺少的食材加入采买清单 🛒`);
  });
  function addToShopSilent(name) {
    if (state.shop.some((s) => s.name === name)) return false;
    state.shop.push({ name, done: false });
    return true;
  }

  /* ================= 我的：晒单 ================= */
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

  $("showSubmit").addEventListener("click", () => {
    const name = $("showRecipe").value;
    const note = $("showNote").value.trim();
    // 虚拟好友随机打分（明确标注演示）
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
    $("showNote").value = "";
    state.showStars = 5; paintStars();
    renderWall();
    botSay(`哇！「${name}」被你拿下了！${randOf(PRAISES)}`);
    alert("晒单成功！🎉");
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
        </div>
        <button class="ghost-btn share-btn">📤 分享这条晒单</button>`;
      d.querySelector(".share-btn").addEventListener("click", () => shareShow(s));
      wall.appendChild(d);
    });
  }

  function shareShow(s) {
    const text = `我在「小饭桌」做了「${s.name}」，给自己打了 ${s.stars} 颗星！${s.note ? "心得：" + s.note + " " : ""}快来一起做饭吧～ 🍳`;
    const done = () => alert("分享文案已复制，去粘贴给好友吧！📤");
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => prompt("复制这段文案分享给好友：", text));
    } else {
      prompt("复制这段文案分享给好友：", text);
    }
  }

  /* ================= 我的：积分 ================= */
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
    state.points.total += 10;
    state.points.log.unshift({ text: `🎭演示：${f.emoji}${f.name}接受了你的邀请`, delta: 10, date: todayStr() });
    savePoints(); renderPoints();
    alert(`${f.emoji} ${f.name}（演示）接受了邀请，积分 +10！🎉`);
  });

  /* ================= 初始化 ================= */
  renderIngredients();
  renderRecipes();
  renderAvatarChoices();
  renderShop();
  renderWeek();
  renderShowRecipeOptions();
  paintStars();
  renderWall();
  renderPoints();
  // 助手开场白（每次打开都有一句）
  botSay(`嗨！我是你的厨房小助手 ${state.avatar}～今天想做什么好吃的？我会一直给你加油打气的！💛`);
})();
