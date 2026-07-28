(() => {
  // ── Configuration ────────────────────────────
  const THEME_KEY = "inkwell_theme";

  // Parse orders are stored directly in the Order class.
  const PARSE_APPLICATION_ID = "ZTHiHkPjRq6Ums199XvqOVohPx39XaBGhVYup4qg";
  const PARSE_JAVASCRIPT_KEY = "Yn9IAazEzZO6OE6tL5AptPtmhwbUe9lQtMGI9KlJ";
  const PARSE_SERVER_URL = "https://parseapi.back4app.com";
  Parse.initialize(PARSE_APPLICATION_ID, PARSE_JAVASCRIPT_KEY);
  Parse.serverURL = PARSE_SERVER_URL;
  const Order = Parse.Object.extend("Order");
  let orderSubscription = null;
  let adminLoadInFlight = false;
  const orderAttachments = new Map();

  function toOrderData(order) {
    const data = order.toJSON();
    return {
      ...data,
      id: order.id,
      orderId: data.orderId || `ORD-${order.id.slice(-5).toUpperCase()}`,
      time: data.time || new Date(data.createdAt || Date.now()).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true }),
      files: normalizeAttachments(data.files),
      status: data.status || "Pending",
      readyBy: data.readyBy || "—",
      createdAt: data.createdAt || order.createdAt,
    };
  }

  function makeOrderId() {
    return `ORD-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  }

  function normalizeAttachments(files) {
    if (!files) return [];
    if (Array.isArray(files)) return files.map(normalizeAttachment).filter(Boolean);
    try {
      const parsed = JSON.parse(files);
      if (Array.isArray(parsed)) return parsed.map(normalizeAttachment).filter(Boolean);
    } catch (_) {}
    return String(files).split(", ").map(normalizeAttachment).filter(Boolean);
  }

  function normalizeAttachment(file) {
    if (!file) return null;
    if (typeof file === "object") {
      const url = file.url || file._url || "";
      return { name: file.name || file.filename || filenameFromUrl(url) || "Attached file", url };
    }
    const value = String(file).trim();
    if (!value) return null;
    const isUrl = /^https?:\/\//i.test(value);
    return { name: isUrl ? filenameFromUrl(value) : value, url: isUrl ? value : "" };
  }

  function filenameFromUrl(url) {
    try {
      return decodeURIComponent(new URL(url).pathname.split("/").pop()) || "Attached file";
    } catch (_) {
      return "Attached file";
    }
  }

  function escapeHtml(value) {
    const element = document.createElement("div");
    element.textContent = value;
    return element.innerHTML;
  }

  function attachmentMarkup(files) {
    if (!files.length) return "No file attached";
    return files
      .map((file) => file.url
        ? `<a href="${escapeHtml(file.url)}" target="_blank" rel="noopener">${escapeHtml(file.name)}</a>`
        : escapeHtml(file.name))
      .join(", ");
  }

  async function uploadAttachments(files) {
    return Promise.all(files.map(async (file) => {
      const storageName = makeSafeStorageName(file.name);
      const parseFile = new Parse.File(storageName, file);
      await parseFile.save();
      return { name: file.name, url: parseFile.url() };
    }));
  }

  function makeSafeStorageName(name) {
    const cleanName = String(name || "file")
      .normalize("NFKD")
      .replace(/[^a-zA-Z0-9._-]+/g, "_")
      .replace(/^[_\.]+|[_\.]+$/g, "")
      .slice(0, 120);
    const extension = cleanName.includes(".") ? "" : ".file";
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${cleanName || "file"}${extension}`;
  }

  async function fetchOrders({ limit, status, search } = {}) {
    const query = new Parse.Query(Order);
    query.descending("createdAt");
    if (status && status !== "all") query.equalTo("status", status);
    if (limit) query.limit(limit);
    const orders = await query.find();
    const normalizedSearch = (search || "").trim().toLowerCase();
    return orders
      .map(toOrderData)
      .filter((order) => !normalizedSearch || `${order.customer || ""} ${order.orderId || ""}`.toLowerCase().includes(normalizedSearch));
  }

  async function updateOrderStatus(id, status) {
    const order = Order.createWithoutData(id);
    order.set("status", status);
    return toOrderData(await order.save());
  }

  async function deleteOrder(id) {
    const order = Order.createWithoutData(id);
    await order.destroy();
  }

  // ── API Helper ───────────────────────────────
  // ── Connection status ────────────────────────
  const connBanner = document.getElementById("connBanner");
  function setConnected(ok) {
    if (ok) {
      connBanner.classList.remove("show");
    } else {
      connBanner.classList.add("show");
    }
  }

  // ── Theme ────────────────────────────────────
  function applyTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "dark") document.documentElement.classList.add("dark");
  }
  applyTheme();
  document.getElementById("btnDark").addEventListener("click", () => {
    document.documentElement.classList.toggle("dark");
    localStorage.setItem(
      THEME_KEY,
      document.documentElement.classList.contains("dark") ? "dark" : "light"
    );
  });

  const USER_KEY = "inkwell_user";
  let currentUser = null;

  // ── Session & View Routing ───────────────────
  const adminView = document.getElementById("adminView");
  const customerView = document.getElementById("customerView");
  const userBar = document.getElementById("userBar");
  const userInfo = document.getElementById("userInfo");
  const userNameDisplay = document.getElementById("userNameDisplay");
  const userRoleBadge = document.getElementById("userRoleBadge");
  const btnLoginBtn = document.getElementById("btnLoginBtn");
  const btnLogoutBtn = document.getElementById("btnLogoutBtn");

  // Auth Modal elements
  const authModal = document.getElementById("authModal");
  const tabLoginBtn = document.getElementById("tabLoginBtn");
  const tabRegisterBtn = document.getElementById("tabRegisterBtn");
  const loginForm = document.getElementById("loginForm");
  const registerForm = document.getElementById("registerForm");
  const loginError = document.getElementById("loginError");
  const regError = document.getElementById("regError");

  function toSessionUser(user) {
    return {
      id: user.id,
      name: user.get("name") || user.getUsername() || "User",
      phone: user.get("phone") || "",
      role: user.get("role") === "admin" ? "admin" : "customer",
    };
  }

  function setView(view) {
    if (view === "customer") {
      customerView.style.display = "";
      adminView.style.display = "none";
    } else if (view === "admin") {
      adminView.style.display = "";
      customerView.style.display = "none";
      loadAdmin();
    } else {
      adminView.style.display = "none";
      customerView.style.display = "none";
    }
  }

  function applySession(user) {
    currentUser = user;
    if (user) {
      localStorage.setItem(USER_KEY, JSON.stringify(user));
      userInfo.style.display = "flex";
      userNameDisplay.textContent = user.name;
      userRoleBadge.textContent = user.role === "admin" ? "Admin" : "Customer";
      userRoleBadge.className = "user-badge " + (user.role === "admin" ? "admin" : "");
      btnLoginBtn.style.display = "none";
      btnLogoutBtn.style.display = "";

      authModal.classList.remove("show");

      if (user.role === "admin") {
        setView("admin");
      } else {
        setView("customer");
        // Prefill customer name and phone
        if (user.name) document.getElementById("custName").value = user.name;
        if (user.phone) document.getElementById("custPhone").value = user.phone;
      }
    } else {
      localStorage.removeItem(USER_KEY);
      userInfo.style.display = "none";
      btnLoginBtn.style.display = "";
      btnLogoutBtn.style.display = "none";
      setView("none");
      authModal.classList.add("show");
    }
  }

  // Restore the authenticated Parse User, never a stale local session.
  function initAuth() {
    const user = Parse.User.current();
    applySession(user ? toSessionUser(user) : null);
  }

  btnLoginBtn.addEventListener("click", () => {
    authModal.classList.add("show");
  });

  btnLogoutBtn.addEventListener("click", async () => {
    await Parse.User.logOut();
    applySession(null);
    showToast("Logged out successfully");
  });

  // Auth Tabs
  tabLoginBtn.addEventListener("click", () => {
    tabLoginBtn.classList.add("active");
    tabRegisterBtn.classList.remove("active");
    loginForm.style.display = "";
    registerForm.style.display = "none";
    loginError.classList.remove("show");
  });

  tabRegisterBtn.addEventListener("click", () => {
    tabRegisterBtn.classList.add("active");
    tabLoginBtn.classList.remove("active");
    registerForm.style.display = "";
    loginForm.style.display = "none";
    regError.classList.remove("show");
  });

  // Login submit handler
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    loginError.classList.remove("show");
    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value;
    const submitBtn = document.getElementById("loginSubmitBtn");

    submitBtn.disabled = true;
    submitBtn.textContent = "Signing in...";

    try {
      const user = await Parse.User.logIn(email, password);
      const sessionUser = toSessionUser(user);
      showToast(sessionUser.role === "admin" ? "Welcome back, Admin!" : `Welcome back, ${sessionUser.name}!`);
      applySession(sessionUser);
    } catch (err) {
      loginError.textContent = err.message || "Invalid credentials";
      loginError.classList.add("show");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Sign In";
    }
  });

  // Register submit handler
  registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    regError.classList.remove("show");
    const name = document.getElementById("regName").value.trim();
    const email = document.getElementById("regEmail").value.trim();
    const phone = document.getElementById("regPhone").value.trim();
    const password = document.getElementById("regPassword").value;
    const submitBtn = document.getElementById("regSubmitBtn");

    submitBtn.disabled = true;
    submitBtn.textContent = "Creating account...";

    try {
      const user = new Parse.User();
      user.setUsername(email);
      user.setEmail(email);
      user.setPassword(password);
      user.set("name", name);
      user.set("phone", phone);
      user.set("role", "customer");
      await user.signUp();
      showToast("Account created successfully!");
      applySession(toSessionUser(user));
    } catch (err) {
      regError.textContent = err.message || "Registration failed";
      regError.classList.add("show");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Create Account";
    }
  });

  // ── Admin tabs ───────────────────────────────
  document.querySelectorAll(".tab").forEach((tabBtn) => {
    tabBtn.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
      tabBtn.classList.add("active");
      document.getElementById("panel-" + tabBtn.dataset.tab).classList.add("active");
    });
  });

  // ── Helpers ──────────────────────────────────
  function statusClass(status) {
    return "status-" + status.replace(/\s+/g, "-");
  }

  function jobLine(o) {
    const paperName = o.paperType === "bond" ? "Bond Paper" : o.paperType === "certificate" ? "Certificate Sheet" : "Standard Paper";
    const bindingName = o.binding === "spiral" ? " · Spiral Bound" : "";
    return `${o.pages}p × ${o.copies} · ${paperName} · ${o.color === "color" ? "Color" : "B&W"} · ${o.sides === "double" ? "2-side" : "1-side"}${bindingName}`;
  }

  function adminOrderDetailsMarkup(o) {
    const details = [];
    const customRange = String(o.customRange || "").trim();
    // Older orders store the range at the beginning of notes as well.
    const notes = String(o.notes || "").replace(/^\[Pages:[^\]]+\]\s*/, "").trim();
    const instructions = String(o.instructions || "").trim();

    if (customRange) details.push(`<div><strong>Custom pages:</strong> ${escapeHtml(customRange)}</div>`);
    if (notes) details.push(`<div><strong>Notes:</strong> ${escapeHtml(notes)}</div>`);
    if (instructions) details.push(`<div><strong>Instructions:</strong> ${escapeHtml(instructions)}</div>`);

    return details.length ? `<div class="ord-details">${details.join("")}</div>` : "";
  }

  function buildOrderRow(o) {
    const id = o.id;
    const filesStr = attachmentMarkup(o.files || []);
    const firstAttachmentUrl = (o.files || []).find((file) => file.url)?.url || "";
    orderAttachments.set(id, o.files || []);
    return `
      <tr>
        <td><div class="ord-id">${id}</div><div class="ord-time">${o.time}</div></td>
        <td><div>${o.customer}</div><div class="ord-phone">${o.phone}</div></td>
        <td><div>${jobLine(o)}</div><div class="ord-job-files">${filesStr}</div>${adminOrderDetailsMarkup(o)}</td>
        <td>${o.readyBy}</td>
        <td class="ord-price">₹${Number(o.price).toLocaleString("en-IN")}</td>
        <td>
          <select class="status-select ${statusClass(o.status)}" data-id="${id}">
            ${["Pending", "Printed", "In progress", "On hold", "Completed"]
              .map((s) => `<option value="${s}" ${s === o.status ? "selected" : ""}>${s}</option>`)
              .join("")}
          </select>
        </td>
        <td>
          <div class="row-actions">
            <div class="icon-mini" title="Attachment"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 12.5l-8.5 8.5a5 5 0 0 1-7-7l9-9a3.5 3.5 0 0 1 5 5l-9 9a2 2 0 0 1-3-3l8-8"/></svg></div>
            <div class="icon-mini" title="Print"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="7"/></svg></div>
            <div class="icon-mini danger" title="Delete" data-del="${id}"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0l-1 14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 6"/></svg></div>
          </div>
        </td>
      </tr>`;
  }

  const TABLE_HEAD = `
    <tr>
      <th>Order</th><th>Customer</th><th>Job</th><th>Ready by</th><th>Price</th><th>Status</th><th></th>
    </tr>`;

  // ── Attach row event handlers ────────────────
  function attachRowHandlers(tableEl) {
    tableEl.querySelectorAll(".status-select").forEach((sel) => {
      sel.addEventListener("change", async (e) => {
        const orderId = e.target.dataset.id;
        const newStatus = e.target.value;
        try {
          await updateOrderStatus(orderId, newStatus);
          sel.className = "status-select " + statusClass(newStatus);
          loadStats();
          loadQueue();
        } catch (err) {
          showToast("Failed to update status");
          console.error(err);
        }
      });
    });

    tableEl.querySelectorAll("[data-del]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const orderId = btn.dataset.del;
        try {
          await deleteOrder(orderId);
          showToast("Order deleted");
          loadAdmin();
        } catch (err) {
          showToast("Failed to delete order");
          console.error(err);
        }
      });
    });

    tableEl.querySelectorAll('.icon-mini[title="Attachment"], .icon-mini[title="Print"]').forEach((button) => {
      button.addEventListener("click", () => {
        const id = button.closest("tr")?.querySelector(".status-select")?.dataset.id;
        const attachments = orderAttachments.get(id) || [];
        const firstFile = attachments.find((file) => file.url);
        if (!firstFile) {
          showToast("This order has no uploaded file");
          return;
        }
        if (button.title === "Print") {
          printAttachment(firstFile.url, firstFile.name);
        } else {
          const attachmentWindow = window.open(firstFile.url, "_blank", "noopener");
          showToast(attachmentWindow ? "Attachment opened" : "Your browser blocked the attachment window");
        }
      });
    });
  }

  // ── Load admin data from API ─────────────────
  function printAttachment(url, name) {
    // Do not print a PDF inside an iframe. Chrome then prints the PDF viewer
    // as a web page, which can shrink and split the document on the sheet.
    // Opening the file itself lets the browser's native PDF viewer use the
    // document's actual page dimensions and print settings.
    const printWindow = window.open(url, "_blank");
    if (!printWindow) {
      showToast("Your browser blocked the print window");
      return;
    }
    // The direct PDF window preserves the file's page dimensions. Ask that
    // window to print after its built-in PDF viewer has loaded.
    printWindow.addEventListener("load", () => {
      window.setTimeout(() => {
        try {
          printWindow.focus();
          printWindow.print();
        } catch (_) {
          // The document remains open in its native viewer if the browser
          // blocks automatic PDF printing.
        }
      }, 400);
    }, { once: true });
    showToast("File opened — use the PDF viewer's Print button");
    window.setTimeout(() => showToast("Opening print dialog..."), 0);
  }

  async function loadAdmin() {
    if (adminLoadInFlight) return;
    adminLoadInFlight = true;
    try {
      await Promise.all([loadStats(), loadRecentOrders(), loadQueue(), loadAllOrders()]);
    } finally {
      adminLoadInFlight = false;
    }
  }

  async function loadStats() {
    try {
      const orders = await fetchOrders();
      const today = new Date().toDateString();
      const stats = {
        pending: orders.filter((o) => o.status === "Pending").length,
        inProgress: orders.filter((o) => o.status === "In progress").length,
        onHold: orders.filter((o) => o.status === "On hold").length,
        revenue: orders
          .filter((o) => o.status === "Completed" && new Date(o.createdAt).toDateString() === today)
          .reduce((total, o) => total + Number(o.price || 0), 0),
      };
      document.getElementById("statPending").textContent = stats.pending;
      document.getElementById("statProgress").textContent = stats.inProgress;
      document.getElementById("statHold").textContent = stats.onHold;
      document.getElementById("statRevenue").textContent = "₹" + stats.revenue.toLocaleString("en-IN");
    } catch (err) {
      console.error("Stats load failed:", err);
    }
  }

  async function loadRecentOrders() {
    try {
      const orders = await fetchOrders({ limit: 6 });
      const table = document.getElementById("recentTable");
      if (orders.length === 0) {
        table.innerHTML = TABLE_HEAD + `<tr><td colspan="7"><div class="empty-note">No orders yet.</div></td></tr>`;
        return;
      }
      table.innerHTML = TABLE_HEAD + orders.map(buildOrderRow).join("");
      attachRowHandlers(table);
    } catch (err) {
      console.error("Recent orders load failed:", err);
    }
  }

  async function loadQueue() {
    try {
      const allOrders = await fetchOrders();
      const active = allOrders
        .filter((o) => ["Pending", "Printed", "In progress", "On hold"].includes(o.status))
        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

      const list = document.getElementById("queueList");
      if (active.length === 0) {
        list.innerHTML = `<div class="empty-note">Queue is clear — no active jobs right now.</div>`;
        return;
      }
      list.innerHTML = active
        .map(
          (o) => `
        <div class="queue-item">
          <div class="queue-left">
            <span class="queue-badge ${statusClass(o.status)}">${o.status}</span>
            <div>
              <div class="queue-name">${o.customer} <span style="color:var(--text-faint); font-weight:500;">· ${o.orderId}</span></div>
              <div class="queue-meta">${jobLine(o)} · ready ${o.readyBy}</div>
            </div>
          </div>
          <div class="ord-price">₹${Number(o.price).toLocaleString("en-IN")}</div>
        </div>
      `
        )
        .join("");
    } catch (err) {
      console.error("Queue load failed:", err);
    }
  }

  async function loadAllOrders() {
    try {
      const search = (document.getElementById("orderSearch").value || "").trim();
      const filter = document.getElementById("orderFilter").value;

      const orders = await fetchOrders({ status: filter, search });
      const table = document.getElementById("allTable");
      if (orders.length === 0) {
        table.innerHTML = TABLE_HEAD + `<tr><td colspan="7"><div class="empty-note">No orders match your search.</div></td></tr>`;
        return;
      }
      table.innerHTML = TABLE_HEAD + orders.map(buildOrderRow).join("");
      attachRowHandlers(table);
    } catch (err) {
      console.error("All orders load failed:", err);
    }
  }

  // Keep every open admin dashboard in sync with Order changes.
  async function subscribeToOrderChanges() {
    try {
      const query = new Parse.Query(Order);
      orderSubscription = await query.subscribe();
      const refreshAdmin = () => {
        if (currentUser?.role === "admin") loadAdmin();
      };
      orderSubscription.on("create", refreshAdmin);
      orderSubscription.on("update", refreshAdmin);
      orderSubscription.on("delete", refreshAdmin);
      orderSubscription.on("open", () => setConnected(true));
      orderSubscription.on("error", (error) => {
        console.error("LiveQuery connection failed:", error);
        setConnected(false);
      });
    } catch (error) {
      console.error("LiveQuery subscription failed:", error);
      setConnected(false);
    }
  }

  // Debounce search input
  let searchTimer = null;
  document.getElementById("orderSearch").addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(loadAllOrders, 300);
  });
  document.getElementById("orderFilter").addEventListener("change", loadAllOrders);

  // ── Customer order form ──────────────────────
  const numPages = document.getElementById("numPages");
  const customPagesWrap = document.getElementById("customPagesWrap");
  const customPagesInput = document.getElementById("customPagesInput");
  const numCopies = document.getElementById("numCopies");
  const readyByInput = document.getElementById("readyBy");
  let selectedColor = "bw";
  let selectedSides = "single";
  let selectedPaperType = "standard";
  let selectedBinding = "none";
  let selectedPageMode = "all";
  let uploadedFiles = [];
  const pdfPageCounts = new WeakMap();

  if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  }

  // Default ready-by = now + 2 hours
  (function setDefaultReadyBy() {
    const d = new Date(Date.now() + 2 * 60 * 60 * 1000);
    d.setSeconds(0, 0);
    const tzOffset = d.getTimezoneOffset() * 60000;
    readyByInput.value = new Date(d - tzOffset).toISOString().slice(0, 16);
  })();

  document.querySelectorAll(".option-card").forEach((card) => {
    card.addEventListener("click", () => {
      const group = card.dataset.group;
      document.querySelectorAll(`.option-card[data-group="${group}"]`).forEach((c) => c.classList.remove("active"));
      card.classList.add("active");
      if (group === "color") selectedColor = card.dataset.value;
      if (group === "sides") selectedSides = card.dataset.value;
      if (group === "paperType") selectedPaperType = card.dataset.value;
      if (group === "binding") selectedBinding = card.dataset.value;
      if (group === "pageMode") {
        selectedPageMode = card.dataset.value;
        if (selectedPageMode === "custom") {
          customPagesWrap.style.display = "block";
        } else {
          customPagesWrap.style.display = "none";
        }
      }
      updateSummary();
    });
  });

  [numPages, customPagesInput, numCopies, readyByInput].forEach((el) => el.addEventListener("input", updateSummary));

  function parseCustomPages(str) {
    if (!str || !str.trim()) return 1;
    const s = str.trim();
    const totalPages = Math.max(1, parseInt(numPages.value, 10) || 1);
    const selectedPages = new Set();

    for (const part of s.split(",")) {
      const match = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
      if (!match) continue;

      const start = Number(match[1]);
      const end = Number(match[2] || match[1]);
      if (end < start) continue;

      for (let page = Math.max(1, start); page <= Math.min(totalPages, end); page += 1) {
        selectedPages.add(page);
      }
    }
    return selectedPages.size || 1;
  }

  function computePrice() {
    let pages = Math.max(1, parseInt(numPages.value) || 1);
    if (selectedPageMode === "custom") {
      pages = parseCustomPages(customPagesInput.value);
    }

    const copies = Math.max(1, parseInt(numCopies.value) || 1);

    // Paper rate determination
    let rate = 1; // Default single-sided B&W ₹1/page
    if (selectedPaperType === "bond") {
      rate = 5; // Bond paper ₹5/page
    } else if (selectedPaperType === "certificate") {
      rate = 20; // Certificate sheet ₹20/sheet
    } else {
      if (selectedColor === "color") {
        rate = 5; // Color ₹5/page
      } else {
        rate = selectedSides === "double" ? 1.3 : 1; // B&W: ₹1 single, ₹1.3 double
      }
    }

    let printSubtotal = pages * copies * rate;

    // Spiral binding pricing: ₹25 (<100 pages), ₹30 (>=100 pages) per copy
    let bindingSubtotal = 0;
    if (selectedBinding === "spiral") {
      const bindingFee = pages < 100 ? 25 : 30;
      bindingSubtotal = bindingFee * copies;
    }

    let price = Math.round((printSubtotal + bindingSubtotal) * 100) / 100;
    price = Math.max(1, price);
    return { pages, copies, price, bindingSubtotal };
  }

  function formatReadyBy() {
    if (!readyByInput.value) return "—";
    const d = new Date(readyByInput.value);
    return d.toLocaleString("en-IN", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
  }

  function updateSummary() {
    const { pages, copies, price } = computePrice();
    const rateBreakdown = document.getElementById("rateBreakdown");
    const printUnits = pages * copies;
    const formatPrice = (amount) => `₹${amount.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
    rateBreakdown.innerHTML = `
      <strong>Print price for ${pages} page${pages === 1 ? "" : "s"} × ${copies} ${copies === 1 ? "copy" : "copies"}</strong>
      <span><span>B&W — single side (₹1/page)</span><b>${formatPrice(printUnits)}</b></span>
      <span><span>B&W — double side (₹1.3/page)</span><b>${formatPrice(printUnits * 1.3)}</b></span>
      <span><span>Color (₹5/page)</span><b>${formatPrice(printUnits * 5)}</b></span>`;
    document.getElementById("summaryTotal").textContent = "₹" + price.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    
    if (selectedPageMode === "custom") {
      const customText = customPagesInput.value.trim() || "Custom";
      document.getElementById("sumPagesCopies").textContent = `${pages}p (${customText}) × ${copies}`;
    } else {
      document.getElementById("sumPagesCopies").textContent = `${pages}p × ${copies}`;
    }

    document.getElementById("sumPaperType").textContent =
      selectedPaperType === "bond" ? "Bond Paper (₹5)" : selectedPaperType === "certificate" ? "Certificate (₹20)" : "Standard";
    document.getElementById("sumColor").textContent = selectedColor === "color" ? "Color (₹5)" : "B&W";
    document.getElementById("sumSides").textContent = selectedSides === "double" ? "Double (₹1.3)" : "Single (₹1)";
    document.getElementById("sumBinding").textContent =
      selectedBinding === "spiral" ? `Spiral (₹${pages < 100 ? 25 : 30})` : "None";
    document.getElementById("sumReadyBy").textContent = formatReadyBy();
  }
  updateSummary();

  // ── File upload (client-side names only) ─────
  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("fileInput");
  const fileListEl = document.getElementById("fileList");

  function isPdf(file) {
    return file?.type === "application/pdf" || /\.pdf$/i.test(file?.name || "");
  }

  async function countPdfPages(file) {
    if (!window.pdfjsLib) throw new Error("PDF page counter is unavailable");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const pdf = await window.pdfjsLib.getDocument({ data: bytes }).promise;
    const count = pdf.numPages;
    await pdf.destroy();
    return count;
  }

  async function updateDetectedPageCount() {
    const pdfFiles = uploadedFiles.filter(isPdf);
    if (!pdfFiles.length) return;

    try {
      await Promise.all(pdfFiles.map(async (file) => {
        if (!pdfPageCounts.has(file)) pdfPageCounts.set(file, await countPdfPages(file));
      }));
      const totalPages = pdfFiles.reduce((sum, file) => sum + (pdfPageCounts.get(file) || 0), 0);
      if (totalPages) {
        numPages.value = totalPages;
        updateSummary();
        renderFileList();
      }
    } catch (error) {
      console.error("Unable to count PDF pages", error);
      showToast("Could not read PDF pages. Please enter the page count.");
    }
  }

  function addUploadedFiles(files) {
    uploadedFiles.push(...files);
    renderFileList();
    updateDetectedPageCount();
  }

  function renderFileList() {
    fileListEl.innerHTML = uploadedFiles
      .map(
        (f, i) => `
      <div class="file-chip"><span>${escapeHtml(f.name || String(f))}</span><button type="button" data-idx="${i}" aria-label="Remove ${escapeHtml(f.name || "file")}">✕</button></div>
    `
      )
      .join("");
    fileListEl.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => {
        uploadedFiles.splice(parseInt(btn.dataset.idx), 1);
        renderFileList();
        updateDetectedPageCount();
      });
    });
  }
  fileInput.addEventListener("change", () => {
    addUploadedFiles(Array.from(fileInput.files));
    fileInput.value = "";
  });
  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.style.background = "var(--accent-soft)";
  });
  dropzone.addEventListener("dragleave", () => {
    dropzone.style.background = "";
  });
  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.style.background = "";
    addUploadedFiles(Array.from(e.dataTransfer.files));
  });

  // ── Place order (POST to API) ────────────────
  const placeBtn = document.getElementById("placeOrderBtn");

  placeBtn.addEventListener("click", async () => {
    const parseUser = Parse.User.current();
    if (!parseUser) {
      showToast("Please sign in before placing an order");
      applySession(null);
      return;
    }

    const name = document.getElementById("custName").value.trim();
    const phone = document.getElementById("custPhone").value.trim();
    if (!name || !phone) {
      showToast("Please add your name and phone number");
      return;
    }

    const { pages, copies, price } = computePrice();
    const customRangeStr = selectedPageMode === "custom" ? customPagesInput.value.trim() : "";
    const orderData = {
      customer: name,
      phone: phone,
      pages: String(pages),
      copies: String(copies),
      color: selectedColor,
      sides: selectedSides,
      paperType: selectedPaperType,
      binding: selectedBinding,
      pageMode: selectedPageMode,
      customRange: customRangeStr,
      // Back4App Order.files is a String field, so store uploaded file metadata as JSON.
      files: "",
      readyBy: formatReadyBy(),
      price: String(price),
      notes: (customRangeStr ? `[Pages: ${customRangeStr}] ` : "") + document.getElementById("fileNotes").value.trim(),
      instructions: document.getElementById("printInstr").value.trim(),
    };

    // Disable button while submitting
    placeBtn.disabled = true;
    placeBtn.innerHTML = `
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" style="animation:spin .8s linear infinite;"><circle cx="12" cy="12" r="10" stroke-dasharray="31" stroke-dashoffset="10"/></svg>
      Placing order...`;

    try {
      if (!uploadedFiles.length) {
        showToast("Please attach at least one file to print");
        return;
      }

      const uploadedAttachments = await uploadAttachments(uploadedFiles);
      orderData.files = JSON.stringify(uploadedAttachments);

      const order = new Order();
      order.set({
        ...orderData,
        orderId: makeOrderId(),
        time: new Date().toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true }),
        status: "Pending",
        owner: parseUser,
      });
      const acl = new Parse.ACL(parseUser);
      acl.setRoleReadAccess("Admin", true);
      acl.setRoleWriteAccess("Admin", true);
      order.setACL(acl);
      const newOrder = toOrderData(await order.save());
      showToast(`Order ${newOrder.orderId} placed — ₹${price.toLocaleString("en-IN")}`);

      // Reset form
      uploadedFiles = [];
      renderFileList();
      document.getElementById("custName").value = "";
      document.getElementById("custPhone").value = "";
      document.getElementById("pickupTime").value = "";
      document.getElementById("fileNotes").value = "";
      document.getElementById("printInstr").value = "";
      numPages.value = 1;
      numCopies.value = 1;
      updateSummary();
    } catch (err) {
      showToast("Failed to place order — check server connection");
      console.error(err);
      showToast(`Order failed: ${err?.message || "Unknown Back4App error"}`);
    } finally {
      placeBtn.disabled = false;
      placeBtn.innerHTML = `
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12l5 5L20 7" stroke-linecap="round" stroke-linejoin="round"/></svg>
        Place order`;
    }
  });

  // ── Toast ────────────────────────────────────
  let toastTimer = null;
  function showToast(msg) {
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
  }

  // ── Spin animation (for loading button) ──────
  const style = document.createElement("style");
  style.textContent = `@keyframes spin { to { transform: rotate(360deg); } }`;
  document.head.appendChild(style);

  // ── Init ─────────────────────────────────────
  initAuth();
  subscribeToOrderChanges();
})();
