// 右クリックメニューと、ページの単語の読み取り。
// ・「（選んだ語）を辞典で引く」：選んだ文字列だけを受け取る。
// ・「このページの単語を調べる」：押したときだけ、そのタブの本文の文字を 1 回読む（activeTab）。
//   読んだ文字は拡張の中（storage.session＝ブラウザを閉じると消える）へ置くだけで、外へは送らない。
'use strict';

const MENU_LOOKUP = 'lookup';
const MENU_SCAN = 'scanPage';
const MAX_CHARS = 1000000; // 本文はこの文字数まで（極端に長いページで固まらないように）

// ツールバーのボタンの動き（設定「ツールバーのボタンでサイドパネルを開く」）。
// default_popup が残っているとサイドパネルより優先されるので、ポップアップを外してから切り替える
function applyActionPanel(on) {
	if (!chrome.sidePanel || !chrome.sidePanel.setPanelBehavior) return;
	chrome.action.setPopup({ popup: on ? '' : 'popup.html' });
	chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: !!on }).catch(() => {});
}
function restoreActionPanel() {
	chrome.storage.local.get('settings', (v) => applyActionPanel(!!(v && v.settings && v.settings.panel)));
}
chrome.runtime.onStartup.addListener(restoreActionPanel);

chrome.runtime.onInstalled.addListener(() => {
	restoreActionPanel();
	chrome.contextMenus.create({
		id: MENU_LOOKUP,
		title: chrome.i18n.getMessage('menuLookup') || 'Look up "%s"',
		contexts: ['selection']
	});
	chrome.contextMenus.create({
		id: MENU_SCAN,
		title: chrome.i18n.getMessage('menuScanPage') || 'Find dictionary words on this page',
		contexts: ['page']
	});
});

function openWindow(path) {
	chrome.windows.create({ url: chrome.runtime.getURL(path), type: 'popup', width: 440, height: 640 });
}

// サイドパネルを開く。押した操作の中で同期的に呼ぶ必要がある（await の後では断られる）
function openPanel(windowId) {
	if (!chrome.sidePanel || !chrome.sidePanel.open || windowId == null) return Promise.reject(new Error('no side panel'));
	return chrome.sidePanel.open({ windowId });
}

async function panelIsOpen(windowId) {
	if (!chrome.runtime.getContexts) return false;
	const ctx = await chrome.runtime.getContexts({ contextTypes: ['SIDE_PANEL'], windowIds: [windowId] });
	return ctx.length > 0;
}

// ページへ注入して本文の文字だけを返す
function grabText(max) {
	const body = document.body;
	const text = body ? body.innerText || '' : '';
	return { text: text.slice(0, max), truncated: text.length > max, title: document.title || location.hostname };
}

async function scanTab(tabId, windowId, target) {
	const seq = Date.now();
	try {
		if (tabId == null) {
			const [tab] = await chrome.tabs.query({ active: true, windowId });
			tabId = tab && tab.id;
		}
		if (tabId == null) throw new Error('no tab');
		const [res] = await chrome.scripting.executeScript({ target: { tabId }, func: grabText, args: [MAX_CHARS] });
		const r = (res && res.result) || {};
		await chrome.storage.session.set({ scan: { seq, windowId, tabId, target, title: String(r.title || ''), text: String(r.text || ''), truncated: !!r.truncated } });
	} catch (e) {
		await chrome.storage.session.set({ scan: { seq, windowId, tabId, target, error: String((e && e.message) || e) } });
	}
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
	if (info.menuItemId === MENU_LOOKUP) {
		const q = String(info.selectionText || '').trim().slice(0, 100);
		if (q) openWindow('popup.html?win=1&q=' + encodeURIComponent(q));
		return;
	}
	if (info.menuItemId === MENU_SCAN && tab) {
		openPanel(tab.windowId).then(
			() => scanTab(tab.id, tab.windowId, 'panel'),
			() => { openWindow('popup.html?win=1&pane=page'); return scanTab(tab.id, tab.windowId, 'any'); }
		);
	}
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
	if (!msg || sender.id !== chrome.runtime.id) return;

	// 拡張の画面から「このページを読んで」
	if (msg.type === 'scan' && !sender.tab) {
		scanTab(msg.tabId == null ? null : msg.tabId, msg.windowId, msg.target === 'panel' ? 'panel' : 'any').then(() => sendResponse({ ok: true }));
		return true;
	}

	// 設定で切り替えた
	if (msg.type === 'actionPanel' && !sender.tab) {
		applyActionPanel(!!msg.on);
		return;
	}

	// ページに付けた印が押された：その語をサイドパネルで開く（開けなければ新しいタブで）
	if (msg.type === 'open' && sender.tab) {
		const w = String(msg.w || '').trim().slice(0, 100);
		if (!w) return;
		const tab = sender.tab;
		const opening = openPanel(tab.windowId);
		chrome.storage.session.set({ panelLookup: { w, windowId: tab.windowId, seq: Date.now() } });
		opening.catch(async () => {
			if (await panelIsOpen(tab.windowId).catch(() => false)) return;
			chrome.tabs.create({ url: chrome.runtime.getURL('popup.html?win=1&q=' + encodeURIComponent(w)), index: tab.index + 1, openerTabId: tab.id });
		});
	}
});
