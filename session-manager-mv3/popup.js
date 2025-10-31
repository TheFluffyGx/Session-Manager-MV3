const saveBtn = document.getElementById("save");
const sessionsDiv = document.getElementById("sessions");
const importBtn = document.getElementById("import");
const exportBtn = document.getElementById("export");
const resetBtn = document.getElementById("reset");

function nowFormatted() {
  const d = new Date();
  return d.toLocaleDateString("en-GB") + " " + d.toLocaleTimeString("en-GB", { hour12: false, hour: "2-digit", minute: "2-digit" });
}

async function getCurrentWindowTabsWithGroups() {
  const currentWindow = await chrome.windows.getCurrent({ populate: true });
  const tabs = currentWindow.tabs.map(t => ({
    url: t.url,
    title: t.title,
    pinned: t.pinned,
    groupId: t.groupId
  }));

  const groupsArray = await chrome.tabGroups.query({ windowId: currentWindow.id });
  const groups = groupsArray.map(g => ({
    id: g.id,
    title: g.title || "",
    color: g.color || "grey",
    collapsed: g.collapsed,
    indices: tabs
      .map((t, idx) => t.groupId === g.id ? idx : -1)
      .filter(idx => idx !== -1)
  }));

  return { tabs, groups };
}

async function loadSessions() {
  const { sessions = [] } = await chrome.storage.local.get("sessions");
  renderSessions(sessions);
}

function renderSessions(sessions) {
  sessionsDiv.innerHTML = "";
  sessions.forEach((s, i) => {
    const div = document.createElement("div");
    div.className = "session";

    const top = document.createElement("div");
    top.className = "session-top";

    const nameSpan = document.createElement("span");
    nameSpan.textContent = s.name;

    const pencil = document.createElement("span");
    pencil.textContent = "✏️";
    pencil.style.cursor = "pointer";
    pencil.title = "Rename session";
    pencil.onclick = async () => {
      const input = document.createElement("input");
      input.className = "rename-input";
      input.value = s.name;
      nameSpan.replaceWith(input);
      input.focus();
      input.onblur = input.onkeydown = async (e) => {
        if (e.type === "blur" || e.key === "Enter") {
          s.name = input.value.trim() || s.name;
          const { sessions } = await chrome.storage.local.get("sessions");
          sessions[i] = s;
          await chrome.storage.local.set({ sessions });
          loadSessions();
        }
      };
    };

    top.append(nameSpan, pencil);

    const info = document.createElement("div");
    info.className = "session-actions";
    info.innerHTML = `
      ${s.tabs.length} tabs | ${s.date}<br>
      <button class="open">Open</button>
      <button class="add">Add</button>
      <button class="replace">Replace</button>
      <button class="red delete">X</button>
    `;

    // OPEN: open session once, with tab groups
    info.querySelector(".open").onclick = async () => {
      const createdTabIds = [];
      for (const t of s.tabs) {
        const newTab = await chrome.tabs.create({ url: t.url, active: false, pinned: !!t.pinned });
        createdTabIds.push(newTab.id);
      }

      if (s.groups && s.groups.length > 0) {
        for (const g of s.groups) {
          const groupTabIds = (g.indices || [])
            .map(idx => createdTabIds[idx])
            .filter(Boolean);
          if (groupTabIds.length > 0) {
            const groupId = await chrome.tabs.group({ tabIds: groupTabIds });
            await chrome.tabGroups.update(groupId, { title: g.title, color: g.color, collapsed: g.collapsed });
          }
        }
      }

      if (createdTabIds.length > 0) await chrome.tabs.update(createdTabIds[0], { active: true });
    };

    // ADD: active tab only
    info.querySelector(".add").onclick = async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) return;
      s.tabs.push({ url: tab.url, title: tab.title, pinned: tab.pinned, groupId: null });
      s.date = nowFormatted();
      const { sessions } = await chrome.storage.local.get("sessions");
      sessions[i] = s;
      await chrome.storage.local.set({ sessions });
      loadSessions();
    };

    // REPLACE: replace session tabs with current window tabs, preserving groups
    info.querySelector(".replace").onclick = async () => {
      const { tabs, groups } = await getCurrentWindowTabsWithGroups();
      s.tabs = tabs;
      s.groups = groups;
      s.date = nowFormatted();
      const { sessions } = await chrome.storage.local.get("sessions");
      sessions[i] = s;
      await chrome.storage.local.set({ sessions });
      loadSessions();
    };

    // DELETE
    info.querySelector(".delete").onclick = async () => {
      const { sessions } = await chrome.storage.local.get("sessions");
      sessions.splice(i, 1);
      await chrome.storage.local.set({ sessions });
      loadSessions();
    };

    div.append(top, info);
    sessionsDiv.append(div);
  });
}

// SAVE current window session
saveBtn.onclick = async () => {
  const { tabs, groups } = await getCurrentWindowTabsWithGroups();
  const newSession = {
    name: "Session " + nowFormatted(),
    tabs,
    groups,
    date: nowFormatted()
  };
  const { sessions = [] } = await chrome.storage.local.get("sessions");
  sessions.push(newSession);
  await chrome.storage.local.set({ sessions });
  loadSessions();
};

// IMPORT sessions JSON (merge)
importBtn.onclick = async () => {
  const [fileHandle] = await window.showOpenFilePicker({ types: [{ accept: { "application/json": [".json"] } }] });
  const file = await fileHandle.getFile();
  const text = await file.text();
  const imported = JSON.parse(text);
  const { sessions = [] } = await chrome.storage.local.get("sessions");
  const merged = [...sessions, ...imported];
  await chrome.storage.local.set({ sessions: merged });
  loadSessions();
};

// EXPORT sessions JSON
exportBtn.onclick = async () => {
  const { sessions = [] } = await chrome.storage.local.get("sessions");
  const blob = new Blob([JSON.stringify(sessions, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "sessions.json";
  a.click();
  URL.revokeObjectURL(url);
};

// RESET all sessions
resetBtn.onclick = async () => {
  if (confirm("Reset all sessions?")) {
    await chrome.storage.local.remove("sessions");
    loadSessions();
  }
};

loadSessions();
