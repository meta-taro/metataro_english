// 検索履歴・単語帳・設定の保存。拡張の中では chrome.storage.local、外では localStorage を使う。
var Store = (function () {
	'use strict';
	var HISTORY_MAX = 20;
	var has = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;

	function get(key, def) {
		return new Promise(function (res) {
			if (has) chrome.storage.local.get(key, function (o) { res(o && key in o ? o[key] : def); });
			else { try { var v = localStorage.getItem(key); res(v ? JSON.parse(v) : def); } catch (e) { res(def); } }
		});
	}
	function put(key, val) {
		return new Promise(function (res) {
			if (has) { var o = {}; o[key] = val; chrome.storage.local.set(o, res); }
			else { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* 保存できない環境では何もしない */ } res(); }
		});
	}

	function history() { return get('history', []); }
	function pushHistory(w) {
		return history().then(function (h) {
			h = h.filter(function (x) { return x !== w; });
			h.unshift(w);
			return put('history', h.slice(0, HISTORY_MAX)).then(function () { return h.slice(0, HISTORY_MAX); });
		});
	}
	function removeHistory(w) {
		return history().then(function (h) { h = h.filter(function (x) { return x !== w; }); return put('history', h).then(function () { return h; }); });
	}
	function clearHistory() { return put('history', []); }

	// 単語帳：[{ w: 見出し, m: 意味, t: 追加した時刻 }]
	function book() { return get('book', []); }
	function inBook(w) { return book().then(function (b) { return b.some(function (x) { return x.w === w; }); }); }
	function toggleBook(w, m) {
		return book().then(function (b) {
			var i = b.findIndex(function (x) { return x.w === w; });
			if (i >= 0) b.splice(i, 1); else b.unshift({ w: w, m: m, t: Date.now() });
			return put('book', b).then(function () { return i < 0; });
		});
	}
	function removeBook(w) {
		return book().then(function (b) { return put('book', b.filter(function (x) { return x.w !== w; })); });
	}

	function settings() { return get('settings', { accent: 'us', slow: false }); }
	function saveSettings(s) { return put('settings', s); }

	return {
		history: history, pushHistory: pushHistory, removeHistory: removeHistory, clearHistory: clearHistory,
		book: book, inBook: inBook, toggleBook: toggleBook, removeBook: removeBook,
		settings: settings, saveSettings: saveSettings
	};
})();
