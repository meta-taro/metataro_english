// 右クリックメニュー「（選んだ語）を辞典で引く」。選んだ文字列だけを受け取り、ページの中身は読まない。
'use strict';

const MENU_ID = 'lookup';

chrome.runtime.onInstalled.addListener(() => {
	chrome.contextMenus.create({
		id: MENU_ID,
		title: chrome.i18n.getMessage('menuLookup') || 'Look up "%s"',
		contexts: ['selection']
	});
});

chrome.contextMenus.onClicked.addListener((info) => {
	if (info.menuItemId !== MENU_ID) return;
	const q = String(info.selectionText || '').trim().slice(0, 100);
	if (!q) return;
	chrome.windows.create({
		url: chrome.runtime.getURL('popup.html?win=1&q=' + encodeURIComponent(q)),
		type: 'popup',
		width: 440,
		height: 640
	});
});
