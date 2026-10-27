(() => {
  "use strict";
  // Sign-in uses your existing wallet login. Admin wallets are listed in the ADMIN_WALLETS Netlify variable.
  const FN = "/.netlify/functions/";

  const $ = (id) => document.getElementById(id);
  // Builds DOM with textContent only, so learner-submitted text can never run as HTML.
  const h = (tag, props, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (k === "class") el.className = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, "");
      else if (v !== false && v != null) el.setAttribute(k, v);
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return el;
  };

  let courses = {};
  let items = [];
  let selected = null;

  const setError = (id, msg) => { $(id).textContent = msg || ""; };

  async function api(name, body) {
    const res = await fetch(FN + name, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });
    let data = {};
    try { data = await res.json(); } catch { /* non-JSON error page */ }
    if (res.status === 401) { signOut("Session expired. Sign in again."); throw new Error("Signed out"); }
    if (!res.ok) throw new Error(data.error || "Request failed (" + res.status + ")");
    return data;
  }

  function show(loggedIn) {
    $("login").hidden = loggedIn; $("app").hidden = !loggedIn; $("logout").hidden = !loggedIn;
  }
  function signOut(msg) {
    window.GradSiwe.signOut(); show(false);
    $("who").textContent = ""; setError("login-error", msg || "");
  }

  const shortAddr = (a) => a.slice(0, 6) + "..." + a.slice(-4);
  async function signIn() {
    if (!window.ethereum) throw new Error("Open this page in a browser with a wallet extension such as MetaMask.");
    const accts = await window.ethereum.request({ method: "eth_requestAccounts" });
    const addr = await window.GradSiwe.signIn(window.ethereum, accts[0]);
    $("who").textContent = shortAddr(addr);
  }

  const ago = (iso) => {
    const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    return m < 60 ? m + " min ago" : m < 1440 ? Math.round(m / 60) + " h ago" : Math.round(m / 1440) + " d ago";
  };

  async function loadQueue(keepSelection) {
    setError("app-error", "");
    const data = await api("admin-queue", { status: $("f-status").value, courseId: $("f-course").value || undefined });
    courses = data.courses; items = data.items;
    if ($("f-course").options.length === 1) {
      for (const [slug, title] of Object.entries(courses)) $("f-course").append(h("option", { value: slug }, title));
    }
    $("count").textContent = items.length + " shown";
    const keep = keepSelection && selected ? items.find((i) => i.id === selected) : null;
    renderList();
    if (keep) renderDetail(keep); else { selected = null; $("detail").replaceChildren(h("p", { class: "muted" }, "Select a submission.")); }
  }

  function renderList() {
    $("list").replaceChildren(...items.map((it) => h("li", {},
      h("button", { class: "item" + (it.id === selected ? " active" : ""), onclick: () => renderDetail(it) },
        h("b", {}, it.email || it.userId),
        h("span", {}, it.courseTitle + " · " + it.component.replace(/_/g, " ") + " · " + ago(it.submittedAt))))));
    if (!items.length) $("list").append(h("li", { class: "muted" }, "Nothing here."));
  }

  async function renderDetail(it) {
    selected = it.id; renderList();
    const box = $("detail");
    box.replaceChildren(h("p", { class: "muted" }, "Loading…"));
    let status;
    try { status = await api("admin-course-status", { userId: it.userId, courseId: it.courseId }); }
    catch (e) { box.replaceChildren(h("p", { class: "error" }, e.message)); return; }
    paintDetail(it, status);
  }

  function paintDetail(it, status) {
    const box = $("detail");
    const msg = h("p", { class: "error", role: "alert" });
    const nodes = [
      h("div", { class: "head" },
        h("h2", {}, it.email || it.userId),
        h("div", { class: "muted" }, it.courseTitle + " · " + it.component.replace(/_/g, " ") + " · submitted " + ago(it.submittedAt))),
      h("h3", {}, "Submission"),
      h("pre", { class: "work" }, it.content),
    ];
    if (it.repoUrl && /^https:\/\//i.test(it.repoUrl)) {
      nodes.push(h("p", {}, h("a", { href: it.repoUrl, target: "_blank", rel: "noopener noreferrer" }, "Open linked work ↗")));
    }
    nodes.push(h("h3", {}, "Course checklist"), checklistEl(it, status, msg));
    nodes.push(it.status === "pending" ? reviewForm(it, msg) : resultEl(it));
    nodes.push(msg);
    box.replaceChildren(...nodes);
  }

  function checklistEl(it, status, msg) {
    const ul = h("ul", { class: "checks" });
    for (const c of status.items) {
      const right = [h("span", { class: "badge " + (c.passed ? "ok" : "no") },
        c.passed ? "Passed" + (c.source ? " · " + c.source : "") : "Not yet")];
      if (!c.passed && c.kind === "auto") {
        right.push(h("button", { class: "ghost", onclick: async () => {
          const note = window.prompt("Why are you marking \"" + c.label + "\" as passed? (10+ characters)");
          if (!note) return;
          try { paintDetail(it, await api("admin-set-component", { userId: it.userId, courseId: it.courseId, component: c.component, note })); }
          catch (e) { msg.textContent = e.message; }
        } }, "Mark passed"));
      }
      ul.append(h("li", {}, h("span", {}, c.label), h("span", { class: "actions", style: "margin:0" }, right)));
    }
    const wrap = h("div", {}, ul);
    if (status.finalized) wrap.append(h("p", { class: "total pass" }, "Course finalized. Certificate record minted."));
    else if (status.ready) {
      wrap.append(h("button", { class: "good", onclick: async (ev) => {
        if (!window.confirm("Finalize this course and mint the certificate record?")) return;
        ev.target.disabled = true;
        try {
          const r = await api("admin-finalize", { userId: it.userId, courseId: it.courseId });
          msg.textContent = ""; msg.className = "total pass"; msg.textContent = "Finalized. Tx: " + r.certTx;
          await loadQueue(true);
        } catch (e) { ev.target.disabled = false; msg.className = "error"; msg.textContent = e.message; }
      } }, "Finalize and mint certificate"));
    }
    return wrap;
  }

  function resultEl(it) {
    return h("div", {}, h("h3", {}, "Result"),
      h("p", {}, it.status + (it.scorePct != null ? " · " + it.scorePct + "%" : "")),
      it.feedback ? h("pre", { class: "work" }, it.feedback) : null);
  }

  function reviewForm(it, msg) {
    const crit = it.rubric.criteria;
    const inputs = {};
    const total = h("div", { class: "total" });
    const feedback = h("textarea", { placeholder: "Feedback for the learner (required unless approving)" });
    const approve = h("button", { class: "good" }, "Approve");
    const again = h("button", {}, "Request resubmission");
    const reject = h("button", { class: "danger" }, "Reject");

    const rows = crit.map((c) => {
      const inp = h("input", { type: "number", min: 0, max: c.max, step: 1, inputmode: "numeric", "aria-label": c.label });
      inp.addEventListener("input", update);
      inputs[c.id] = inp;
      return h("div", { class: "crit" },
        h("span", {}, c.label, h("span", { class: "muted" }, " (0-" + c.max + (c.min ? ", need " + c.min + "+" : "") + ")")), inp);
    });

    function read() {
      const scores = {}; let sum = 0, max = 0, complete = true, gateOk = true;
      for (const c of crit) {
        const raw = inputs[c.id].value; const v = Number(raw);
        if (raw === "" || !Number.isInteger(v) || v < 0 || v > c.max) complete = false; else { scores[c.id] = v; sum += v; }
        max += c.max; if (c.min && !(v >= c.min)) gateOk = false;
      }
      return { scores, sum, max, complete, gateOk };
    }
    function update() {
      const r = read(); const pct = r.max ? r.sum / r.max : 0;
      const pass = r.complete && pct >= it.rubric.passMark && r.gateOk;
      total.className = "total " + (r.complete ? (pass ? "pass" : "fail") : "");
      total.textContent = r.sum + " / " + r.max + " (" + Math.round(pct * 100) + "%) · pass mark " + Math.round(it.rubric.passMark * 100) + "%" +
        (r.complete && !r.gateOk ? " · a gate criterion is too low" : "");
      approve.disabled = !pass;
      const ok = r.complete && feedback.value.trim().length >= 10;
      again.disabled = !ok; reject.disabled = !ok;
    }
    feedback.addEventListener("input", update);

    const send = (decision) => async () => {
      const r = read(); msg.className = "error"; msg.textContent = "";
      for (const b of [approve, again, reject]) b.disabled = true;
      try {
        await api("admin-review", { submissionId: it.id, decision, scores: r.scores, feedback: feedback.value });
        await loadQueue(false);
      } catch (e) { msg.textContent = e.message; update(); }
    };
    approve.addEventListener("click", send("approve"));
    again.addEventListener("click", send("resubmit"));
    reject.addEventListener("click", send("reject"));
    update();
    return h("div", {}, h("h3", {}, "Rubric"), ...rows, total, feedback, h("div", { class: "actions" }, approve, again, reject));
  }

  $("login-form").addEventListener("submit", async (e) => {
    e.preventDefault(); setError("login-error", "");
    try { await signIn(); await start(); }
    catch (err) { setError("login-error", err.message); }
  });
  $("logout").addEventListener("click", () => signOut(""));
  $("refresh").addEventListener("click", () => loadQueue(true).catch((e) => setError("app-error", e.message)));
  $("f-status").addEventListener("change", () => loadQueue(false).catch((e) => setError("app-error", e.message)));
  $("f-course").addEventListener("change", () => loadQueue(false).catch((e) => setError("app-error", e.message)));

  async function start() {
    show(true);
    try { await loadQueue(false); }
    catch (e) {
      if (e.message === "Signed out") return;
      signOut(/admin/i.test(e.message) ? "This account is not an admin." : e.message);
    }
  }
  window.GradSiwe.me().then((a) => { if (a) { $("who").textContent = shortAddr(a); start(); } }).catch(() => {});
})();
