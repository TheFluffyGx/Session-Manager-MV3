// js/background.js - final MV3 service worker
async function getWindowSnapshot(windowId) {
  const tabs = await chrome.tabs.query({ windowId });
  tabs.sort((a,b) => a.index - b.index);
  const groups = {};
  for (const t of tabs) {
    if (t.groupId && t.groupId !== -1) {
      if (!groups[t.groupId]) groups[t.groupId] = { indices: [], title: null, color: null, collapsed: false };
      groups[t.groupId].indices.push(t.index);
    }
  }
  const groupList = await chrome.tabGroups.query({ windowId });
  for (const g of groupList) {
    if (groups[g.id]) {
      groups[g.id].title = g.title || "";
      groups[g.id].color = g.color || "grey";
      groups[g.id].collapsed = !!g.collapsed;
    }
  }
  const snapshot = {
    createdAt: Date.now(),
    tabs: tabs.map(t => ({ url: t.url, pinned: !!t.pinned, title: t.title || "" })),
    groups: Object.values(groups).map(g => ({ indices: g.indices, title: g.title, color: g.color, collapsed: g.collapsed })),
    activeIndex: tabs.findIndex(t => t.active)
  };
  return snapshot;
}

async function saveSession(name) {
  const w = await chrome.windows.getCurrent();
  const snapshot = await getWindowSnapshot(w.id);
  snapshot.name = name;
  const store = await chrome.storage.local.get({ sessions: [] });
  const sessions = store.sessions;
  const existingIndex = sessions.findIndex(s => s.name === name);
  if (existingIndex !== -1) sessions[existingIndex] = snapshot; else sessions.unshift(snapshot);
  await chrome.storage.local.set({ sessions });
  return sessions;
}

async function addSessionToCurrentWindow(session) {
  const curWin = await chrome.windows.getCurrent();
  const createdTabIds = [];
  for (let i=0;i<session.tabs.length;i++) {
    const t = session.tabs[i];
    const created = await chrome.tabs.create({ windowId: curWin.id, url: t.url, active: false, pinned: !!t.pinned });
    createdTabIds.push(created.id);
  }
  for (const g of session.groups || []) {
    const tabIds = (g.indices || []).map(idx => createdTabIds[idx]).filter(Boolean);
    if (tabIds.length===0) continue;
    try {
      const groupId = await chrome.tabs.group({ tabIds });
      await chrome.tabGroups.update(groupId, { title: g.title || "", color: g.color || "grey", collapsed: !!g.collapsed });
    } catch(e) { console.warn('group failed', e); }
  }
  if (createdTabIds.length>0) {
    try { await chrome.tabs.update(createdTabIds[0], { active: true }); } catch(e){}
  }
  return true;
}

async function replaceCurrentWindowWithSession(session) {
  const curTabs = await chrome.tabs.query({ currentWindow: true });
  const curTabIds = curTabs.map(t => t.id);
  const activeTab = curTabs.find(t => t.active) || curTabs[0];
  let keepTabId = null;
  if (activeTab) {
    keepTabId = activeTab.id;
    const first = session.tabs[0] || { url: 'about:blank' };
    await chrome.tabs.update(keepTabId, { url: first.url, pinned: !!first.pinned, active: false });
  } else {
    const created = await chrome.tabs.create({ url: session.tabs[0] ? session.tabs[0].url : 'about:blank', active: false });
    keepTabId = created.id;
  }
  const createdTabIds = [keepTabId];
  for (let i=1;i<session.tabs.length;i++) {
    const t = session.tabs[i];
    const created = await chrome.tabs.create({ url: t.url, active: false, pinned: !!t.pinned });
    createdTabIds.push(created.id);
  }
  for (const g of session.groups || []) {
    const tabIds = (g.indices || []).map(idx => createdTabIds[idx]).filter(Boolean);
    if (tabIds.length===0) continue;
    try {
      const groupId = await chrome.tabs.group({ tabIds });
      await chrome.tabGroups.update(groupId, { title: g.title || "", color: g.color || "grey", collapsed: !!g.collapsed });
    } catch(e) {}
  }
  if (createdTabIds.length>0) {
    try { await chrome.tabs.update(createdTabIds[0], { active: true }); } catch(e){}
  }
  const newSet = new Set(createdTabIds);
  const toRemove = curTabIds.filter(id => !newSet.has(id));
  if (toRemove.length>0) {
    try { await chrome.tabs.remove(toRemove); } catch(e){}
  }
  return true;
}

async function deleteSession(name) {
  const store = await chrome.storage.local.get({ sessions: [] });
  let sessions = store.sessions;
  sessions = sessions.filter(s => s.name !== name);
  await chrome.storage.local.set({ sessions });
  return sessions;
}

async function renameSession(oldName, newName) {
  const store = await chrome.storage.local.get({ sessions: [] });
  const sessions = store.sessions;
  const idx = sessions.findIndex(s => s.name === oldName);
  if (idx===-1) throw new Error('Not found');
  sessions[idx].name = newName;
  await chrome.storage.local.set({ sessions });
  return sessions;
}

async function reorderSessions(newOrderNames) {
  const store = await chrome.storage.local.get({ sessions: [] });
  const sessions = store.sessions;
  const map = new Map(sessions.map(s => [s.name, s]));
  const newList = [];
  for (const n of newOrderNames) if (map.has(n)) newList.push(map.get(n));
  await chrome.storage.local.set({ sessions: newList });
  return newList;
}

async function importSessions(sessionsArray, mode='merge') {
  const store = await chrome.storage.local.get({ sessions: [] });
  let sessions = store.sessions;
  if (mode==='overwrite') sessions = sessionsArray;
  else {
    for (const s of sessionsArray) {
      let name = s.name || f"Imported {new Date(s.createdAt||Date.now()).toLocaleString()}";
      let attempt=1;
      while (sessions.find(x=>x.name===name)) { name = f"{s.name || 'Imported'} ({attempt})"; attempt++; }
      s.name = name;
      sessions.unshift(s);
    }
  }
  await chrome.storage.local.set({ sessions });
  return sessions;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async ()=>{
    try {
      if (msg && msg.type==='SAVE_SESSION') {
        const sessions = await saveSession(msg.name || `Session ${new Date().toLocaleString()}`);
        sendResponse({ ok:true, sessions }); return;
      }
      if (msg && msg.type==='GET_SESSIONS') {
        const store = await chrome.storage.local.get({ sessions: [] });
        sendResponse({ ok:true, sessions: store.sessions }); return;
      }
      if (msg && msg.type==='ADD_SESSION') {
        const store = await chrome.storage.local.get({ sessions: [] });
        const session = store.sessions.find(s=>s.name===msg.name);
        if (!session) throw new Error('not found');
        await addSessionToCurrentWindow(session);
        sendResponse({ ok:true }); return;
      }
      if (msg && msg.type==='REPLACE_SESSION') {
        const store = await chrome.storage.local.get({ sessions: [] });
        const session = store.sessions.find(s=>s.name===msg.name);
        if (!session) throw new Error('not found');
        await replaceCurrentWindowWithSession(session);
        sendResponse({ ok:true }); return;
      }
      if (msg && msg.type==='DELETE_SESSION') {
        const sessions = await deleteSession(msg.name);
        sendResponse({ ok:true, sessions }); return;
      }
      if (msg && msg.type==='RENAME_SESSION') {
        const sessions = await renameSession(msg.oldName, msg.newName);
        sendResponse({ ok:true, sessions }); return;
      }
      if (msg && msg.type==='REORDER_SESSIONS') {
        const sessions = await reorderSessions(msg.order);
        sendResponse({ ok:true, sessions }); return;
      }
      if (msg && msg.type==='IMPORT_SESSIONS') {
        const sessions = await importSessions(msg.sessions || [], msg.mode || 'merge');
        sendResponse({ ok:true, sessions }); return;
      }
      sendResponse({ ok:false, error:'unknown' });
    } catch(err) {
      console.error(err);
      sendResponse({ ok:false, error: err.message });
    }
  })();
  return true;
});
