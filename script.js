const STORE = "focusflow.onefile.v3";
const RING = 339.3;
const DAY = ["W1", "W2", "W3", "W4", "W5", "W6", "W7"];
const presets = {
    "25-5": { focus: 1500, break: 300 },
    "50-10": { focus: 3000, break: 600 }
};

const S = {
    theme: "dark",
    page: "dashboard",
    filter: "all",
    sort: "urgency",
    tasks: [],
    focus: {
        mode: "focus",
        left: 1500,
        run: false,
        min: 0,
        sessions: 0,
        heat: Array(24).fill(0),
        week: [55, 68, 72, 74, 81, 79, 88],
        preset: "25-5"
    },
    score: [56, 61, 66, 69, 73, 77, 82],
    goal: 90,
    streak: 0,
    last: "",
    deleted: null
};

const $ = (q) => document.querySelector(q);
const $$ = (q) => [...document.querySelectorAll(q)];
let tmr = null;
let toastTimer = null;

const save = () => localStorage.setItem(STORE, JSON.stringify(S));
const load = () => {
    const raw = localStorage.getItem(STORE);
    if (!raw) return;
    try {
        Object.assign(S, JSON.parse(raw));
    } catch {
        localStorage.removeItem(STORE);
    }
};

const esc = (s) =>
    s
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");

const dleft = (d) =>
    Math.floor((new Date(`${d}T23:59:59`).getTime() - Date.now()) / 86400000);
const pscore = (p) => (p === "high" ? 3 : p === "medium" ? 2 : 1);
const urg = (t) =>
    pscore(t.priority) * 2 + (dleft(t.deadline) <= 0 ? 4 : dleft(t.deadline) <= 2 ? 3 : 1);
const cl = (v, a, b) => Math.max(a, Math.min(b, v));

function setPage(p) {
    S.page = p;
    $$(".page").forEach((x) => x.classList.remove("active"));
    $(`#${p}`).classList.add("active");
    $$(".nav button").forEach((x) => x.classList.toggle("active", x.dataset.page === p));
    $("#title").textContent = p[0].toUpperCase() + p.slice(1);
    save();
    if (p === "analytics") renderAnalytics();
}

function filtered() {
    let arr = [...S.tasks];
    if (S.filter === "done") arr = arr.filter((x) => x.done);
    else if (["high", "medium", "low"].includes(S.filter)) arr = arr.filter((x) => x.priority === S.filter);
    else if (["work", "study", "health", "other"].includes(S.filter)) arr = arr.filter((x) => x.category === S.filter);

    if (S.sort === "urgency") arr.sort((x, y) => urg(y) - urg(x));
    if (S.sort === "deadline") arr.sort((x, y) => x.deadline.localeCompare(y.deadline));
    if (S.sort === "priority") arr.sort((x, y) => pscore(y.priority) - pscore(x.priority));
    if (S.sort === "created") arr.sort((x, y) => y.created - x.created);
    return arr;
}

function renderTasks() {
    const list = $("#taskList");
    const arr = filtered();
    $("#focusTaskSelect").innerHTML =
        '<option value="">Select focus task</option>' +
        S.tasks
            .filter((x) => !x.done)
            .map((x) => `<option value="${x.id}">${esc(x.title)}</option>`)
            .join("");
    $("#focusPreset").value = S.focus.preset;

    if (!arr.length) {
        list.innerHTML = '<li class="card">No tasks in this filter.</li>';
        return;
    }

    list.innerHTML = arr
        .map(
            (x) => `
    <li class="task ${x.done ? "done" : ""}" data-id="${x.id}">
      <input type="checkbox" ${x.done ? "checked" : ""} data-a="done">
      <div>
        <div class="t">${esc(x.title)}</div>
        <div class="meta">
          <span class="pill ${x.priority}">${x.priority}</span>
          <span>${x.category}</span>
          <span>${x.deadline}</span>
          <span>${dleft(x.deadline) < 0 ? "Overdue" : `${dleft(x.deadline)}d left`}</span>
          ${x.repeat !== "none" ? `<span>repeat:${x.repeat}</span>` : ""}
          ${x.slot ? `<span>Slot ${x.slot}</span>` : ""}
        </div>
      </div>
      <div class="task-actions">
        <button class="icon" data-a="focus">⏱</button>
        <button class="icon" data-a="edit">✎</button>
        <button class="icon" data-a="del">🗑</button>
      </div>
    </li>`
        )
        .join("");
}

function pressure() {
    const active = S.tasks.filter((x) => !x.done);
    const urgent = active.filter((x) => dleft(x.deadline) <= 1).length;
    const v = active.length ? Math.round((urgent * 100) / active.length) : 0;
    return {
        v,
        l: v > 65 ? "Critical" : v > 35 ? "Medium" : "Low",
        c: v > 65 ? "var(--bad)" : v > 35 ? "var(--warn)" : "var(--ok)"
    };
}

function predict() {
    const total = S.tasks.length || 1;
    const done = S.tasks.filter((x) => x.done).length;
    const rate = done / total;
    return cl(Math.round(40 + rate * 55 - pressure().v * 0.3), 5, 98);
}

function recs(score) {
    const h = S.focus.heat.indexOf(Math.max(...S.focus.heat));
    return [
        `Best focus hour: ${h}:00`,
        `Completion likelihood: ${predict()}%`,
        pressure().v > 50 ? "Deadline pressure high: clear urgent tasks first." : "Pressure manageable: continue planned flow.",
        score > 75 ? "Great momentum. Maintain consistency." : "Start one high-priority task now."
    ];
}

function renderDash() {
    const total = S.tasks.length;
    const done = S.tasks.filter((x) => x.done).length;
    const rate = total ? Math.round((done * 100) / total) : 0;
    const focus = Math.min(100, Math.round((S.focus.min * 100) / S.goal));
    const score = Math.round(rate * 0.6 + focus * 0.4);
    const pred = predict();
    const p = pressure();

    $("#kTasks").textContent = total;
    $("#kFocus").textContent = S.focus.min;
    $("#kScore").textContent = score;
    $("#kStreak").textContent = `${S.streak} days`;
    $("#kPred").textContent = `${pred}%`;
    $("#goalTxt").textContent = `${S.goal} min focus`;
    $("#goalHint").textContent = `${S.focus.min}/${S.goal} completed`;
    $("#goalFill").style.width = `${Math.min(100, Math.round((S.focus.min * 100) / S.goal))}%`;

    $("#pressureTxt").textContent = p.l;
    $("#pressureFill").style.width = `${p.v}%`;
    $("#pressureFill").style.background = p.c;

    $("#todayList").innerHTML =
        S.tasks
            .filter((x) => !x.done)
            .slice(0, 5)
            .map((x) => `<li>${esc(x.title)} (${x.priority})</li>`)
            .join("") || "<li>No pending tasks</li>";

    $("#recs").innerHTML = recs(score).map((x) => `<li>${x}</li>`).join("");

    const ht = $("#heat");
    const mx = Math.max(...S.focus.heat, 1);
    ht.innerHTML = "";
    for (let i = 0; i < 24; i += 1) {
        const c = document.createElement("div");
        c.className = "cell";
        c.style.background = `rgba(95,123,255,${0.1 + (S.focus.heat[i] / mx) * 0.9})`;
        c.title = `${i}:00 ${S.focus.heat[i]}m`;
        ht.appendChild(c);
    }

    $("#barConsistency").style.width = `${cl(S.streak * 12, 10, 100)}%`;
    $("#barFocusQuality").style.width = `${cl(Math.round((S.focus.min * 100) / S.goal), 10, 100)}%`;
    $("#barVelocity").style.width = `${cl(rate, 10, 100)}%`;

    $("#insights").innerHTML = [
        `You complete ${rate}% of tasks.`,
        `Focus sessions completed: ${S.focus.sessions}.`,
        `Predicted completion probability: ${pred}%.`
    ]
        .map((x) => `<li>${x}</li>`)
        .join("");
}

function makeBars(el, data, labels) {
    const mx = Math.max(...data, 1);
    el.innerHTML = data
        .map(
            (v, i) =>
                `<div class="bar" style="height:${Math.max(8, Math.round((v * 100) / mx))}%"><span>${labels[i]}</span></div>`
        )
        .join("");
}

function renderAnalytics() {
    makeBars($("#weeklyBars"), S.focus.week, ["M", "T", "W", "T", "F", "S", "S"]);
    const done = S.tasks.filter((x) => x.done).length;
    const total = S.tasks.length || 1;
    const angle = Math.round((done * 360) / total);
    $("#completionDonut").style.background =
        `conic-gradient(var(--ok) 0deg,var(--ok) ${angle}deg,var(--warn) ${angle}deg,var(--warn) 360deg)`;
    $("#donutTxt").textContent = `${done}/${total} done`;
    makeBars($("#focusBars"), S.focus.heat.slice(6, 13), ["6", "7", "8", "9", "10", "11", "12"]);
    makeBars($("#trendBars"), S.score, DAY);
}

function currentPreset() {
    return presets[S.focus.preset] || presets["25-5"];
}

function renderTimer() {
    const pr = currentPreset();
    const total = S.focus.mode === "focus" ? pr.focus : pr.break;
    const p = cl(S.focus.left / total, 0, 1);
    const off = RING * (1 - p);
    const mm = String(Math.floor(S.focus.left / 60)).padStart(2, "0");
    const ss = String(S.focus.left % 60).padStart(2, "0");
    $("#phase").textContent = S.focus.mode === "focus" ? "Focus Session" : "Break Session";
    $("#timerTxt").textContent = `${mm}:${ss}`;
    $("#ringProgress").style.strokeDashoffset = off;
}

function speak(text) {
    if ("speechSynthesis" in window) window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
}

function setAISpeechText(text) {
    const el = $("#aiSpeechText");
    if (el) el.textContent = text;
    const bar = document.querySelector(".ai-speech-bar");
    if (bar) {
        bar.classList.add("pulse");
        setTimeout(() => bar.classList.remove("pulse"), 700);
    }
}

function aiSpeak(text) {
    setAISpeechText(text);
    speak(text);
}

function msg(cls, text) {
    const d = document.createElement("div");
    d.className = `m ${cls}`;
    d.textContent = text;
    $("#chatMessages").appendChild(d);
    $("#chatMessages").scrollTop = $("#chatMessages").scrollHeight;
}

function addTask(title, deadline, priority, category, repeat) {
    S.tasks.unshift({
        id: crypto.randomUUID(),
        title,
        deadline,
        priority,
        category,
        repeat,
        done: false,
        created: Date.now(),
        slot: ""
    });
    save();
    renderAll();
    toast("Task added");
    aiSpeak("Task added successfully");
}

function toast(text) {
    $("#toastText").textContent = text;
    $("#toast").classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $("#toast").classList.remove("show"), 5000);
}

function autoSort() {
    S.tasks
        .filter((x) => !x.done)
        .sort((a, b) => urg(b) - urg(a))
        .forEach((x, i) => {
            x.slot = ["08:00", "09:30", "11:00", "13:00", "15:00", "17:00"][i % 6];
        });
    save();
    renderTasks();
}

function toggleFocus() {
    S.focus.run = !S.focus.run;
    $("#ovStart").textContent = S.focus.run ? "Pause" : "Start";
    if (!S.focus.run) {
        clearInterval(tmr);
        tmr = null;
        return;
    }

    tmr = setInterval(() => {
        S.focus.left -= 1;
        if (S.focus.left <= 0) {
            clearInterval(tmr);
            tmr = null;
            S.focus.run = false;
            $("#ovStart").textContent = "Start";
            const pr = currentPreset();
            if (S.focus.mode === "focus") {
                S.focus.sessions += 1;
                S.focus.min += Math.round(pr.focus / 60);
                S.focus.heat[new Date().getHours()] += Math.round(pr.focus / 60);
                const today = new Date().toDateString();
                S.streak = S.last === today ? S.streak : S.streak + 1;
                S.last = today;
                S.focus.mode = "break";
                S.focus.left = pr.break;
                rollRecurring();
                aiSpeak("Focus session complete!");
            } else {
                S.focus.mode = "focus";
                S.focus.left = pr.focus;
                aiSpeak("Break complete. Back to focus.");
            }
            save();
            renderAll();
        }
        renderTimer();
    }, 1000);
}

function resetFocus() {
    const pr = currentPreset();
    clearInterval(tmr);
    tmr = null;
    S.focus.run = false;
    S.focus.mode = "focus";
    S.focus.left = pr.focus;
    $("#ovStart").textContent = "Start";
    renderTimer();
}

function skipFocus() {
    const pr = currentPreset();
    clearInterval(tmr);
    tmr = null;
    S.focus.run = false;
    S.focus.mode = S.focus.mode === "focus" ? "break" : "focus";
    S.focus.left = S.focus.mode === "focus" ? pr.focus : pr.break;
    $("#ovStart").textContent = "Start";
    renderTimer();
}

function rollRecurring() {
    S.tasks.forEach((t) => {
        if (t.done && t.repeat !== "none") {
            const d = new Date(`${t.deadline}T12:00:00`);
            if (t.repeat === "daily") d.setDate(d.getDate() + 1);
            if (t.repeat === "weekly") d.setDate(d.getDate() + 7);
            t.deadline = d.toISOString().slice(0, 10);
            t.done = false;
        }
    });
}

function chatReply(q) {
    const x = q.toLowerCase();
    if (x.startsWith("add task:")) {
        const title = q.split(":").slice(1).join(":").trim();
        if (title) {
            addTask(
                title,
                new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10),
                "medium",
                "work",
                "none"
            );
            return "Task added from assistant.";
        }
    }
    if (x.includes("insight")) return `Current completion likelihood is ${predict()}%.`;
    if (x.includes("focus")) return "Start a deep-work session now.";
    if (x.includes("schedule")) {
        autoSort();
        return "Auto scheduling done by urgency and deadline.";
    }
    return "Try: add task: Write blog post";
}

function voice() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
        alert("Speech recognition unsupported.");
        return;
    }
    const r = new SR();
    r.lang = "en-US";
    r.start();
    setAISpeechText("Listening for your voice command...");
    r.onresult = (e) => {
        const tx = e.results[0][0].transcript.toLowerCase();
        setAISpeechText(`You said: ${tx}`);
        if (tx.includes("start focus")) {
            $("#overlay").classList.add("show");
            if (!S.focus.run) toggleFocus();
            aiSpeak("Focus mode started.");
        } else if (tx.startsWith("add task")) {
            const ti = tx.replace("add task", "").trim();
            if (ti) {
                addTask(
                    ti,
                    new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
                    "medium",
                    "work",
                    "none"
                );
            } else {
                setAISpeechText("Voice command needs a task title after 'add task'.");
            }
        } else {
            setAISpeechText("Try saying: add task [name], start focus, or open analytics.");
        }
    };
}

function updateThemeButton() {
    const themeBtn = $("#theme");
    themeBtn.textContent = S.theme === "light" ? "☀️" : "🌙";
}

function demo() {
    const d = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
    S.tasks = [
        {
            id: crypto.randomUUID(),
            title: "Finalize investor pitch",
            deadline: d(1),
            priority: "high",
            category: "work",
            repeat: "none",
            done: false,
            created: Date.now(),
            slot: "09:00"
        },
        {
            id: crypto.randomUUID(),
            title: "Write blog post",
            deadline: d(2),
            priority: "medium",
            category: "study",
            repeat: "weekly",
            done: false,
            created: Date.now(),
            slot: "11:00"
        },
        {
            id: crypto.randomUUID(),
            title: "Workout session",
            deadline: d(0),
            priority: "low",
            category: "health",
            repeat: "daily",
            done: false,
            created: Date.now(),
            slot: "18:00"
        },
        {
            id: crypto.randomUUID(),
            title: "Submit demo video",
            deadline: d(0),
            priority: "high",
            category: "work",
            repeat: "none",
            done: true,
            created: Date.now(),
            slot: "14:00"
        }
    ];
    S.focus.min = 75;
    S.focus.sessions = 8;
    S.focus.heat = [0, 0, 0, 0, 6, 12, 22, 34, 39, 44, 42, 30, 14, 8, 18, 31, 37, 29, 16, 10, 2, 0, 0, 0];
    S.focus.week = [88, 72, 96, 104, 78, 84, 90];
    S.score = [58, 63, 67, 71, 75, 79, 85];
    S.goal = 100;
    S.streak = 6;
    S.focus.preset = "25-5";
    S.focus.left = 1500;
    save();
    renderAll();
    toast("Demo loaded");
}

function renderAll() {
    setPage(S.page);
    renderTasks();
    renderDash();
    renderTimer();
    if (S.page === "analytics") renderAnalytics();
}

function bind() {
    $$(".nav button").forEach((b) => {
        b.onclick = () => setPage(b.dataset.page);
    });

    $("#theme").onclick = () => {
        S.theme = S.theme === "dark" ? "light" : "dark";
        document.body.classList.toggle("light", S.theme === "light");
        updateThemeButton();
        save();
    };
    $("#demo").onclick = demo;
    $("#startOverlay").onclick = () => $("#overlay").classList.add("show");
    $("#openFocus").onclick = () => $("#overlay").classList.add("show");
    $("#ovClose").onclick = () => $("#overlay").classList.remove("show");

    $("#taskForm").onsubmit = (e) => {
        e.preventDefault();
        addTask(
            $("#taskTitleInput").value.trim(),
            $("#taskDeadlineInput").value,
            $("#taskPriorityInput").value,
            $("#taskCategoryInput").value,
            $("#taskRecurringInput").value
        );
        e.target.reset();
    };

    $("#taskList").onclick = (e) => {
        const li = e.target.closest(".task");
        if (!li) return;
        const t = S.tasks.find((x) => x.id === li.dataset.id);
        if (!t) return;
        const a = e.target.dataset.a;
        if (a === "done") t.done = !t.done;
        if (a === "del") {
            S.deleted = { ...t };
            S.tasks = S.tasks.filter((x) => x.id !== t.id);
            toast("Task deleted");
        }
        if (a === "edit") {
            const n = prompt("Edit task:", t.title);
            if (n && n.trim()) t.title = n.trim();
        }
        if (a === "focus") {
            $("#overlay").classList.add("show");
            $("#focusTaskSelect").value = t.id;
        }
        save();
        renderAll();
    };

    $$(".chips button").forEach((b) => {
        b.onclick = () => {
            $$(".chips button").forEach((x) => x.classList.remove("active"));
            b.classList.add("active");
            S.filter = b.dataset.filter;
            save();
            renderTasks();
        };
    });

    $("#sortBy").onchange = (e) => {
        S.sort = e.target.value;
        save();
        renderTasks();
    };
    $("#autoScheduleBtn").onclick = autoSort;
    $("#clearCompletedBtn").onclick = () => {
        S.tasks = S.tasks.filter((x) => !x.done);
        save();
        renderAll();
        toast("Completed tasks cleared");
    };
    $("#focusPreset").onchange = (e) => {
        S.focus.preset = e.target.value;
        resetFocus();
        save();
    };
    $("#focusStartPauseBtn").onclick = toggleFocus;
    $("#focusResetBtn").onclick = resetFocus;
    $("#focusSkipBtn").onclick = skipFocus;
    $("#ovStart").onclick = toggleFocus;
    $("#ovReset").onclick = resetFocus;
    $("#ovSkip").onclick = skipFocus;

    $("#chatForm").onsubmit = (e) => {
        e.preventDefault();
        const q = $("#chatInput").value.trim();
        if (!q) return;
        msg("u", q);
        msg("b", chatReply(q));
        $("#chatInput").value = "";
    };

    $("#undoBtn").onclick = () => {
        if (S.deleted) {
            S.tasks.unshift(S.deleted);
            S.deleted = null;
            save();
            renderAll();
            toast("Undo complete");
        }
    };

}

load();
document.body.classList.toggle("light", S.theme === "light");
updateThemeButton();
bind();
if (!S.tasks.length) demo();
renderAll();
msg("b", "Assistant ready. Try: add task: Write blog post");
