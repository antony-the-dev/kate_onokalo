(() => {
  "use strict";

  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  const trapFocus = (container, e) => {
    if (e.key !== "Tab") return;
    const els = $$(FOCUSABLE, container).filter((el) => el.offsetParent !== null || el === document.activeElement);
    if (!els.length) return;
    const first = els[0];
    const last = els[els.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const tgLink = (text) => `https://t.me/${CONFIG.telegram}?text=${encodeURIComponent(text)}`;
  const priceFmt = (p) => `${p.toLocaleString("uk-UA")} ${CONFIG.currency}`;

  $$("[id$='Telegram']").forEach((a) => (a.href = `https://t.me/${CONFIG.telegram}`));
  $$("[id$='Instagram']").forEach((a) => (a.href = `https://instagram.com/${CONFIG.instagram}`));
  $$("[id$='Email']").forEach((a) => (a.href = `mailto:${CONFIG.email}`));

  /* ---------- Прелоадер ---------- */
  window.addEventListener("load", () => {
    setTimeout(() => {
      $("#preloader").classList.add("done");
      document.body.style.overflow = "";
    }, 600);
  });
  setTimeout(() => {
    if (!$("#preloader").classList.contains("done")) {
      $("#preloader").classList.add("done");
    }
  }, 4000);
  document.body.style.overflow = "hidden";

  /* ---------- Хедер ---------- */
  const header = $("#siteHeader");
  const onScrollHeader = () => header.classList.toggle("scrolled", window.scrollY > 40);
  window.addEventListener("scroll", onScrollHeader, { passive: true });
  onScrollHeader();

  /* ---------- Меню ---------- */
  const burger = $("#burger");
  const menu = $("#menuOverlay");
  const toggleMenu = (open) => {
    burger.classList.toggle("open", open);
    menu.classList.toggle("open", open);
    burger.setAttribute("aria-expanded", open);
    menu.setAttribute("aria-hidden", !open);
    document.body.style.overflow = open ? "hidden" : "";
  };
  burger.addEventListener("click", () => toggleMenu(!menu.classList.contains("open")));
  $$(".menu-link").forEach((l) => l.addEventListener("click", () => toggleMenu(false)));

  /* ---------- Паралакс ---------- */
  const parallaxEls = $$("[data-parallax]");
  let rafId = null;
  const onParallax = () => {
    if (reduced) return;
    const y = window.scrollY;
    for (const el of parallaxEls) {
      const speed = parseFloat(el.dataset.parallax);
      const rect = el.getBoundingClientRect();
      if (rect.bottom < -200 || rect.top > window.innerHeight + 200) continue;
      el.style.transform = `translate3d(0, ${(y * speed).toFixed(1)}px, 0)`;
    }
  };
  const onScroll = () => {
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      rafId = null;
      onParallax();
      onScrollSpy();
    });
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onParallax();

  /* ---------- Scrollspy (активна секція) ---------- */
  const spySections = $$("main section[id]");
  const spyLinks = [...$$(".header-nav a"), ...$$(".menu-link")];
  const onScrollSpy = () => {
    let current = "#top";
    for (const s of spySections) {
      if (s.getBoundingClientRect().top <= 170) current = `#${s.id}`;
    }
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
      current = `#${spySections[spySections.length - 1].id}`;
    }
    spyLinks.forEach((l) => l.classList.toggle("active", l.getAttribute("href") === current));
  };
  onScrollSpy();

  /* ---------- Reveal ---------- */
  const revealObs = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("in");
          revealObs.unobserve(e.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
  );
  $$(".reveal").forEach((el) => revealObs.observe(el));

  /* ---------- Ефект «розтікання» на кнопках ---------- */
  $$(".btn").forEach((btn) => {
    btn.addEventListener("pointermove", (e) => {
      const r = btn.getBoundingClientRect();
      btn.style.setProperty("--mx", `${e.clientX - r.left}px`);
      btn.style.setProperty("--my", `${e.clientY - r.top}px`);
    });
  });

  /* ---------- Галерея ---------- */
  const grid = $("#galleryGrid");
  const filtersWrap = $("#galleryFilters");
  let activeFilter = "all";

  const mediums = ["all", ...new Set(ARTWORKS.map((a) => a.medium))];
  const mediumLabel = { all: "Усі роботи", oil: "Олія", acrylic: "Акрил" };

  const renderFilters = () => {
    filtersWrap.innerHTML = mediums
      .map(
        (m) =>
          `<button class="filter-chip ${m === activeFilter ? "active" : ""}" data-filter="${m}">${mediumLabel[m] || m}</button>`
      )
      .join("");
    $$(".filter-chip", filtersWrap).forEach((chip) =>
      chip.addEventListener("click", () => {
        activeFilter = chip.dataset.filter;
        renderFilters();
        renderGrid();
      })
    );
  };

  const renderGrid = () => {
    const items = ARTWORKS.map((a, i) => ({ ...a, i })).filter((a) => activeFilter === "all" || a.medium === activeFilter);
    grid.innerHTML = items
      .map(
        (a) => `
        <article class="art-card" data-idx="${a.i}" tabindex="0" role="button" aria-label="${a.title}">
          <img src="${a.img}" srcset="${a.imgSmall} 600w, ${a.img} 1100w" sizes="(max-width: 680px) 46vw, 30vw" alt="${a.title} — ${a.material}, ${a.size}, ${a.year}" loading="lazy">
          <span class="art-zoom" aria-hidden="true">+</span>
          <div class="art-overlay">
            <span class="art-title">${a.title}</span>
            <span class="art-meta">${a.material} · ${a.size} · ${a.year}</span>
          </div>
        </article>`
      )
      .join("");
    $$(".art-card", grid).forEach((card) => {
      const open = () => openModal(parseInt(card.dataset.idx, 10));
      card.addEventListener("click", open);
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") open();
      });
    });
  };

  /* ---------- Модалка ---------- */
  const modal = $("#artModal");
  const modalImg = $("#modalImg");
  const modalTitle = $("#modalTitle");
  const modalMeta = $("#modalMeta");
  const modalDesc = $("#modalDesc");
  const modalPrice = $("#modalPrice");
  const modalCta = $("#modalCta");
  const modalNote = $("#modalNote");
  let currentIdx = 0;
  let modalOpen = false;
  let modalLastFocused = null;

  const workFromHash = () => {
    const m = location.hash.match(/^#work-(\d+)$/);
    return m ? parseInt(m[1], 10) - 1 : null;
  };

  const openModal = (idx, opts = {}) => {
    currentIdx = idx;
    const a = ARTWORKS[idx];
    modalImg.src = a.img;
    modalImg.srcset = `${a.imgSmall} 600w, ${a.img} 1100w`;
    modalImg.alt = a.title;
    modalTitle.textContent = a.title;
    modalMeta.textContent = `${a.material} · ${a.size} · ${a.year}`;
    modalDesc.textContent = a.desc;
    if (a.price) {
      modalPrice.innerHTML = priceFmt(a.price);
      modalCta.textContent = "Додати до кошика";
      modalNote.textContent = "Додається до кошика — оформлення одним повідомленням у Telegram.";
    } else {
      modalPrice.innerHTML = `<span class="muted">Ціна за запитом</span>`;
      modalCta.textContent = "Дізнатися ціну";
      modalNote.textContent = "Напишіть мені в Telegram — відповім щодо наявності, ціни та доставки.";
    }
    modalOpen = true;
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    modalLastFocused = document.activeElement;
    if (!opts.silent) history.pushState(null, "", `#work-${idx + 1}`);
    $("#modalClose").focus();
    document.body.style.overflow = "hidden";
  };
  const closeModal = (opts = {}) => {
    modalOpen = false;
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
    if (modalLastFocused && modalLastFocused.isConnected) modalLastFocused.focus();
    if (!opts.silent && location.hash.startsWith("#work-")) {
      history.pushState(null, "", location.pathname + location.search);
    }
    document.body.style.overflow = "";
  };
  const stepModal = (dir) => {
    const n = ARTWORKS.length;
    const idx = (currentIdx + dir + n) % n;
    openModal(idx, { silent: true });
    history.replaceState(null, "", `#work-${idx + 1}`);
  };

  window.addEventListener("popstate", () => {
    const idx = workFromHash();
    if (idx !== null && ARTWORKS[idx]) {
      openModal(idx, { silent: true });
    } else if (modal.classList.contains("open")) {
      closeModal({ silent: true });
    }
  });

  $("#modalClose").addEventListener("click", closeModal);
  $("#modalPrev").addEventListener("click", () => stepModal(-1));
  $("#modalNext").addEventListener("click", () => stepModal(1));
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (!modalOpen || cartDrawer.classList.contains("open")) return;
    if (e.key === "Escape") closeModal();
    if (e.key === "ArrowLeft") stepModal(-1);
    if (e.key === "ArrowRight") stepModal(1);
  });
  document.addEventListener("keydown", (e) => {
    if (cartDrawer.classList.contains("open")) trapFocus(cartDrawer, e);
    if (modal.classList.contains("open")) trapFocus(modal, e);
  });

  modalCta.addEventListener("click", () => {
    const a = ARTWORKS[currentIdx];
    if (a.price) {
      cart.add({ ...a, source: "gallery" });
    } else {
      window.open(tgLink(`Привіт, Катерино! Хочу дізнатися про роботу «${a.title}» (${a.material}, ${a.size}, ${a.year}).`), "_blank");
    }
  });

  /* ---------- Мерч ---------- */
  const merchGrid = $("#merchGrid");
  merchGrid.innerHTML = MERCH.map(
    (m, i) => `
    <article class="merch-card merch-${m.product} reveal">
      <div class="merch-media">
        <span class="merch-type">${m.type}</span>
        <img src="${m.img}" srcset="${m.img} 1100w" sizes="(max-width: 680px) 92vw, 32vw" alt="${m.title}" loading="lazy">
      </div>
      <div class="merch-info">
        <h3>${m.title}</h3>
        <p>${m.desc}</p>
        <div class="merch-foot">
          <span class="merch-price">${priceFmt(m.price)}</span>
          <button class="merch-add" data-idx="${i}">Додати</button>
        </div>
      </div>
    </article>`
  ).join("");
  $$(".merch-add", merchGrid).forEach((btn) =>
    btn.addEventListener("click", () => {
      const m = { ...MERCH[btn.dataset.idx], source: "merch" };
      cart.add(m);
    })
  );
  $$(".reveal", merchGrid).forEach((el) => revealObs.observe(el));

  /* ---------- Кошик ---------- */
  const cartDrawer = $("#cartDrawer");
  const cartOverlay = $("#cartOverlay");
  const cartItemsEl = $("#cartItems");
  const cartTotalEl = $("#cartTotal");
  const cartCountEl = $("#cartCount");

  const cart = {
    items: JSON.parse(localStorage.getItem("ko_cart") || "[]"),
    lastFocused: null,
    save() {
      localStorage.setItem("ko_cart", JSON.stringify(this.items));
      this.render();
    },
    add(item) {
      const found = this.items.find((i) => i.title === item.title && i.source === item.source);
      if (found) found.qty += 1;
      else this.items.push({ ...item, qty: 1 });
      this.save();
      toast("Додано до кошика");
      this.open();
    },
    remove(title, source) {
      this.items = this.items.filter((i) => !(i.title === title && i.source === source));
      this.save();
    },
    setQty(title, source, qty) {
      const found = this.items.find((i) => i.title === title && i.source === source);
      if (!found) return;
      if (qty <= 0) this.remove(title, source);
      else {
        found.qty = qty;
        this.save();
      }
    },
    total() {
      return this.items.reduce((s, i) => s + (i.price || 0) * i.qty, 0);
    },
    count() {
      return this.items.reduce((s, i) => s + i.qty, 0);
    },
    open() {
      cartDrawer.classList.add("open");
      cartOverlay.classList.add("open");
      cartDrawer.setAttribute("aria-hidden", "false");
      this.lastFocused = document.activeElement;
      $("#cartClose").focus();
      document.body.style.overflow = "hidden";
    },
    close() {
      cartDrawer.classList.remove("open");
      cartOverlay.classList.remove("open");
      cartDrawer.setAttribute("aria-hidden", "true");
      if (this.lastFocused && this.lastFocused.isConnected) this.lastFocused.focus();
      if (modal.classList.contains("open")) {
        document.body.style.overflow = "hidden";
        $("#modalClose").focus();
      } else {
        document.body.style.overflow = "";
      }
    },
    render() {
      const count = this.count();
      cartCountEl.hidden = count === 0;
      cartCountEl.textContent = count;
      cartTotalEl.textContent = priceFmt(this.total());
      if (!this.items.length) {
        cartItemsEl.innerHTML = `<p class="cart-empty">Кошик порожній.<br>Оберіть друк або напишіть мені про картину.</p>`;
        return;
      }
      cartItemsEl.innerHTML = this.items
        .map(
          (i) => `
          <div class="cart-item">
            <img src="${i.img}" alt="${i.title}">
            <div>
              <div class="cart-item-name">${i.title}</div>
              <div class="cart-item-price">${priceFmt(i.price)}</div>
            </div>
            <div class="cart-item-right">
              <div class="cart-qty">
                <button data-act="minus" data-title="${i.title}" data-source="${i.source}" aria-label="Зменшити">−</button>
                <span>${i.qty}</span>
                <button data-act="plus" data-title="${i.title}" data-source="${i.source}" aria-label="Збільшити">+</button>
              </div>
              <button class="cart-remove" data-act="del" data-title="${i.title}" data-source="${i.source}">прибрати</button>
            </div>
          </div>`
        )
        .join("");
    }
  };

  $("#cartBtn").addEventListener("click", cart.open.bind(cart));
  $("#cartClose").addEventListener("click", cart.close.bind(cart));
  cartOverlay.addEventListener("click", cart.close.bind(cart));
  cartItemsEl.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    const { act, title, source } = btn.dataset;
    const item = cart.items.find((i) => i.title === title && i.source === source);
    if (!item) return;
    if (act === "plus") cart.setQty(title, source, item.qty + 1);
    if (act === "minus") cart.setQty(title, source, item.qty - 1);
    if (act === "del") cart.remove(title, source);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") cart.close();
  });

  $("#checkoutBtn").addEventListener("click", () => {
    if (!cart.items.length) {
      toast("Кошик порожній");
      return;
    }
    const lines = cart.items
      .map((i) => `• ${i.title} — ${priceFmt(i.price)} × ${i.qty} = ${priceFmt(i.price * i.qty)}`)
      .join("\n");
    const msg =
      `🖼️ Нове замовлення з сайту Катерини Онокало\n\n${lines}\n\n💸 Всього: ${priceFmt(cart.total())}\n\nДякую! Чекаю на підтвердження.`;
    window.open(tgLink(msg), "_blank");
    toast("Замовлення відкрито в Telegram");
  });

  /* ---------- Форма замовлення ---------- */
  $("#commissionForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const msg =
      `🎨 Заявка на індивідуальну роботу\n\n` +
      `Ім'я: ${f.get("name")}\n` +
      `Зв'язок: ${f.get("contact")}\n` +
      `Розмір: ${f.get("size")}\n\n` +
      `Ідея: ${f.get("idea")}`;
    window.open(tgLink(msg), "_blank");
    toast("Заявку надіслано");
    e.target.reset();
  });

  /* ---------- FAQ акордеон ---------- */
  $$(".faq-q").forEach((btn) => {
    btn.addEventListener("click", () => {
      const item = btn.closest(".faq-item");
      const isOpen = btn.getAttribute("aria-expanded") === "true";
      $$(".faq-item").forEach((i) => {
        i.classList.remove("open");
        $(".faq-q", i).setAttribute("aria-expanded", "false");
      });
      if (!isOpen) {
        item.classList.add("open");
        btn.setAttribute("aria-expanded", "true");
      }
    });
  });

  /* ---------- Toast ---------- */
  const toastEl = $("#toast");
  let toastTimer = null;
  const toast = (text) => {
    toastEl.textContent = text;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 3600);
  };

  renderFilters();
  renderGrid();
  cart.render();

  const initIdx = workFromHash();
  if (initIdx !== null && ARTWORKS[initIdx]) openModal(initIdx, { silent: true });
})();
