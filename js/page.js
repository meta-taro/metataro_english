// 「ページ」タブ：開いているページや PDF の英文から、この辞典の収録語・熟語を拾い出す。
// ページの文字は押したときだけ読み（activeTab）、端末の中で数えるだけで外へは送らない。
// 結果の語を押すと辞典（popup.js の lookup）でその項目を開く。サイドパネルでも同じ画面を使う。
(function () {
	'use strict';
	if (!document.getElementById('pane-page') || !window.PopupApi) return;

	var api = window.PopupApi;
	var el = api.el, clear = api.clear;
	function $id(id) { return document.getElementById(id); }
	// sub は 1 つでも配列でもよい（$1, $2 ... に入る）
	function T(key, def, sub) {
		var s = (typeof chrome !== 'undefined' && chrome.i18n) ? chrome.i18n.getMessage(key, sub) : '';
		if (s) return s;
		var subs = sub == null ? [] : [].concat(sub);
		return String(def).replace(/\$(\d)/g, function (m, n) { return subs[n - 1] != null ? subs[n - 1] : m; });
	}

	var params = new URLSearchParams(location.search);
	var mode = params.get('panel') ? 'panel' : params.get('win') ? 'tab' : 'popup';
	var hasPanel = !!(chrome.sidePanel && chrome.sidePanel.open);
	var winId = null, activeTabId = null;
	if (chrome.windows) chrome.windows.getCurrent(function (w) { if (w) winId = w.id; });
	if (chrome.tabs) chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) { if (tabs && tabs[0]) activeTabId = tabs[0].id; });

	var GRADE = { '5': '5級', '4': '4級', '3': '3級', p2: '準2級', '2': '2級', p1: '準1級', '1': '1級' };
	var RANK = { '5': 0, '4': 1, '3': 2, p2: 3, '2': 4, p1: 5, '1': 6 };
	var PAGE_SIZE = 200;
	var FRESH_MS = 30000;

	var state = null;      // { source: 'page'|'pdf', title, tabId, words, idioms, tokens, truncated }
	var shown = PAGE_SIZE; // 一覧に出している数
	var lastSeq = 0;       // 表示済みの読み取り（storage.session の scan.seq）
	var pending = false;   // この画面から読み取りを頼んで結果待ち

	// ---------- 索引（初回だけ作る） ----------
	var indexP = null;
	function loadWnPos() {
		var bs = 'abcdefghijklmnopqrstuvwxyz_'.split('');
		return Promise.all(bs.map(function (b) { return Dict.load('wn/' + b + '.json'); })).then(function (ms) {
			var o = Object.create(null);
			ms.forEach(function (m) { if (m) Object.keys(m).forEach(function (k) { o[k] = m[k][0]; }); });
			return o;
		});
	}
	function getIndex() {
		if (!indexP) {
			indexP = Promise.all([Dict.load('words.json'), Dict.morph(), Dict.load('idioms.json'), loadWnPos()]).then(function (r) {
				var meanings = Object.create(null);
				(r[2] || []).forEach(function (row) { if (!meanings[row[0]]) meanings[row[0]] = row[1]; });
				var idx = Scan.buildIndex({ words: r[0] || [], exc: r[1].exc || {}, idioms: r[2] || [], wnPos: r[3] });
				idx.idiomMeaning = meanings;
				return idx;
			});
			indexP.catch(function () { indexP = null; });
		}
		return indexP;
	}

	function shortMeaning(m) {
		return String(m || '').split(' / ')[0].replace(/《[^》]*》|〈[^〉]*〉|[『』]/g, '').replace(/^[\s,;]+/, '').slice(0, 30);
	}

	// 収録語に級・短い意味・AI 解説の有無を付ける
	function annotate(words) {
		return Promise.all(words.map(function (x) {
			return Promise.all([Dict.rowsOf(x.w), Dict.notesOf(x.w)]).then(function (r) {
				var rows = r[0], g = '';
				rows.forEach(function (row) { if (!g && row[3]) g = row[3]; });
				x.g = g;
				x.m = shortMeaning(rows[0] && rows[0][1]);
				x.ai = !!r[1];
				return x;
			});
		}));
	}

	// ---------- 表示 ----------
	function setStatus(text, isError) {
		var p = $id('page-status');
		p.textContent = text || '';
		p.hidden = !text;
		p.className = 'small' + (isError ? ' text-danger' : ' muted');
	}

	function analyze(text, meta) {
		setStatus(T('pageCounting', '数えています…'));
		return getIndex().then(function (idx) {
			var r = Scan.extract(text, idx);
			return annotate(r.words).then(function (words) {
				state = {
					source: meta.source, title: meta.title || '', tabId: meta.tabId, truncated: !!meta.truncated,
					tokens: r.tokens, words: words,
					idioms: r.idioms.map(function (x) { return { p: x.p, n: x.n, m: shortMeaning(idx.idiomMeaning[x.p]) }; })
				};
				shown = PAGE_SIZE;
				setStatus('');
				render();
			});
		}).catch(function () {
			setStatus(T('pageErrData', '辞書データを読み込めませんでした。'), true);
		});
	}

	function filtered() {
		if (!state) return [];
		var min = $id('page-grade').value, aiOnly = $id('page-ai').checked;
		return state.words.filter(function (x) {
			if (aiOnly && !x.ai) return false;
			if (min && !(x.g && RANK[x.g] >= RANK[min])) return false;
			return true;
		});
	}

	function gradeBadge(g) {
		if (!g || !GRADE[g]) return null;
		return el('span', 'grade', T('grade_' + g, '英検' + GRADE[g]));
	}

	function item(word, n, meaning, badges) {
		var li = el('li');
		li.tabIndex = 0;
		li.appendChild(el('span', 'n', String(n)));
		li.appendChild(el('span', 'w', word));
		badges.forEach(function (b) { if (b) li.appendChild(b); });
		if (meaning) li.appendChild(el('span', 'm', meaning));
		li.addEventListener('click', function () { api.lookup(word); });
		li.addEventListener('keydown', function (e) { if (e.key === 'Enter') api.lookup(word); });
		return li;
	}

	function render() {
		$id('page-intro').hidden = !!state;
		$id('page-result').hidden = !state;
		if (!state) return;
		$id('page-title').textContent = state.source === 'pdf' ? 'PDF: ' + state.title : state.title;
		$id('page-summary').textContent = T('pageSummary', '本文 $1 語のうち、収録語 $2 種類・熟語 $3 種類',
			[String(state.tokens), String(state.words.length), String(state.idioms.length)])
			+ (state.truncated ? ' ' + T('pageTruncated', '（長いので先頭だけ読みました）') : '');
		$id('page-marks').hidden = state.source !== 'page';

		var list = filtered();
		$id('page-wcount').textContent = String(list.length);
		var ul = $id('page-words');
		clear(ul);
		list.slice(0, shown).forEach(function (x) {
			var ai = x.ai ? el('span', 'ai-badge', T('pageAiBadge', 'AI 解説')) : null;
			ul.appendChild(item(x.w, x.n, x.m, [gradeBadge(x.g), ai]));
		});
		$id('page-words-empty').hidden = list.length > 0;
		$id('page-more').hidden = list.length <= shown;

		$id('page-icount').textContent = String(state.idioms.length);
		var ui = $id('page-idioms');
		clear(ui);
		state.idioms.forEach(function (x) { ui.appendChild(item(x.p, x.n, x.m, [])); });
		$id('page-idioms-empty').hidden = state.idioms.length > 0;
	}

	['page-grade', 'page-ai'].forEach(function (id) {
		$id(id).addEventListener('change', function () { shown = PAGE_SIZE; render(); });
	});
	$id('page-more').addEventListener('click', function () { shown += PAGE_SIZE; render(); });

	// ---------- 開いているページを読む ----------
	function errorText(e) {
		var s = String(e || '');
		if (/pdf/i.test(s)) return T('pageErrPdfTab', 'ブラウザで開いている PDF は読めません。「PDF を読む」からファイルを選んでください。');
		if (/permission|Cannot access|cannot be scripted|chrome:\/\/|extensions gallery/i.test(s)) {
			return T('pageErrAccess', 'このページは読めません。ブラウザの設定画面などは読めないほか、ページを移動したあとはツールバーのボタンか右クリックから調べ直す必要があります。');
		}
		return T('pageErrRead', 'ページを読めませんでした。');
	}

	function onScan(scan) {
		if (!scan || scan.seq <= lastSeq) return;
		lastSeq = scan.seq;
		pending = false;
		api.showPane('page');
		if (scan.error) { setStatus(errorText(scan.error), true); return; }
		if (!scan.text || !/[A-Za-z]/.test(scan.text)) { state = null; render(); setStatus(T('pageNoEnglish', 'このページには英文が見つかりませんでした。'), true); return; }
		analyze(scan.text, { source: 'page', title: scan.title, tabId: scan.tabId, truncated: scan.truncated });
	}

	// この画面が受け取る読み取りか（サイドパネルは自分の窓の分だけ）
	function mine(scan) {
		if (!scan) return false;
		if (mode === 'panel') return scan.windowId === winId;
		return pending || (scan.target === 'any' && Date.now() - scan.seq < FRESH_MS);
	}

	$id('page-scan').addEventListener('click', function () {
		setStatus(T('pageReading', 'ページを読んでいます…'));
		if (mode === 'popup' && hasPanel && winId != null) {
			// サイドパネルで結果を出す。open は押した直後に呼ぶ必要がある
			chrome.sidePanel.open({ windowId: winId }).then(function () {
				chrome.runtime.sendMessage({ type: 'scan', tabId: activeTabId, windowId: winId, target: 'panel' }, function () {
					void chrome.runtime.lastError;
					window.close();
				});
			}, function () {
				pending = true;
				chrome.runtime.sendMessage({ type: 'scan', tabId: activeTabId, windowId: winId, target: 'any' });
			});
			return;
		}
		pending = true;
		chrome.runtime.sendMessage({ type: 'scan', tabId: mode === 'popup' ? activeTabId : null, windowId: winId, target: mode === 'panel' ? 'panel' : 'any' });
	});

	// ---------- ページに印を付ける ----------
	function markMap() {
		var map = {};
		filtered().forEach(function (x) {
			var v = [x.w, x.m || ''];
			map[x.w] = v;
			x.forms.forEach(function (f) { map[f] = v; });
		});
		return map;
	}
	function setMarkStatus(text, isError) {
		var s = $id('page-mark-status');
		s.textContent = text || '';
		s.className = 'small ms-1' + (isError ? ' text-danger' : ' muted');
	}
	$id('page-mark').addEventListener('click', function () {
		if (!state || state.source !== 'page' || state.tabId == null) return;
		var target = { tabId: state.tabId };
		var map = markMap();
		chrome.scripting.insertCSS({ target: target, files: ['css/page-mark.css'] }).then(function () {
			return chrome.scripting.executeScript({ target: target, files: ['js/page-mark.js'] });
		}).then(function () {
			return chrome.scripting.executeScript({
				target: target,
				func: function (m) { return window.__metataroMarker ? window.__metataroMarker.mark(m) : 0; },
				args: [map]
			});
		}).then(function (res) {
			var n = res && res[0] ? res[0].result : 0;
			setMarkStatus(T('pageMarked', '$1 か所に印を付けました。', String(n)));
		}).catch(function (e) {
			setMarkStatus(errorText(e && e.message), true);
		});
	});
	$id('page-unmark').addEventListener('click', function () {
		if (!state || state.tabId == null) return;
		var target = { tabId: state.tabId };
		chrome.scripting.executeScript({
			target: target,
			func: function () { return window.__metataroMarker ? window.__metataroMarker.unmark() : 0; }
		}).then(function () {
			setMarkStatus(T('pageUnmarked', '印を外しました。'));
			return chrome.scripting.removeCSS({ target: target, files: ['css/page-mark.css'] });
		}).catch(function (e) {
			setMarkStatus(errorText(e && e.message), true);
		});
	});

	// ---------- PDF ----------
	var pdfjsP = null;
	function pdfjs() {
		if (!pdfjsP) {
			pdfjsP = import(chrome.runtime.getURL('lib/pdfjs/pdf.min.mjs')).then(function (lib) {
				lib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('lib/pdfjs/pdf.worker.min.mjs');
				return lib;
			});
			pdfjsP.catch(function () { pdfjsP = null; });
		}
		return pdfjsP;
	}

	function readPdf(file) {
		if (!file) return;
		if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') {
			setStatus(T('pageErrNotPdf', 'PDF ファイルを選んでください。'), true);
			return;
		}
		api.showPane('page');
		setStatus(T('pageReading', 'ページを読んでいます…'));
		var doc = null;
		Promise.all([file.arrayBuffer(), pdfjs()]).then(function (r) {
			return r[1].getDocument({ data: new Uint8Array(r[0]), isEvalSupported: false }).promise;
		}).then(function (d) {
			doc = d;
			var pages = [], i = 0;
			function next() {
				i++;
				if (i > doc.numPages) return pages;
				setStatus(T('pagePdfProgress', 'PDF を読んでいます（$1 / $2 ページ）…', [String(i), String(doc.numPages)]));
				return doc.getPage(i).then(function (pg) { return pg.getTextContent(); }).then(function (tc) {
					pages.push(tc.items);
					return next();
				});
			}
			return next();
		}).then(function (pages) {
			var text = Scan.pdfText(pages);
			if (doc) doc.destroy();
			if (!/[A-Za-z]/.test(text)) {
				state = null; render();
				setStatus(T('pagePdfNoText', 'この PDF から英文を取り出せませんでした（画像だけの PDF は読めません）。'), true);
				return;
			}
			return analyze(text, { source: 'pdf', title: file.name });
		}).catch(function (e) {
			if (doc) doc.destroy();
			var name = e && e.name;
			setStatus(name === 'PasswordException'
				? T('pagePdfPassword', 'パスワードの付いた PDF は読めません。')
				: T('pagePdfError', 'PDF を読めませんでした。'), true);
		});
	}

	var fileInput = $id('page-pdf-file');
	$id('page-pdf').addEventListener('click', function () {
		// ポップアップはファイル選択の画面を開くと閉じてしまうので、タブで開き直す
		if (mode === 'popup') {
			chrome.tabs.create({ url: chrome.runtime.getURL('popup.html?win=1&pane=page&pdf=1') });
			window.close();
			return;
		}
		fileInput.click();
	});
	fileInput.addEventListener('change', function () {
		readPdf(fileInput.files && fileInput.files[0]);
		fileInput.value = '';
	});
	var drop = $id('pane-page');
	drop.addEventListener('dragover', function (e) {
		if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types, 'Files') >= 0) {
			e.preventDefault();
			drop.classList.add('dragging');
		}
	});
	drop.addEventListener('dragleave', function (e) { if (e.target === drop) drop.classList.remove('dragging'); });
	drop.addEventListener('drop', function (e) {
		drop.classList.remove('dragging');
		if (!e.dataTransfer || !e.dataTransfer.files.length) return;
		e.preventDefault();
		if (mode === 'popup') return;
		readPdf(e.dataTransfer.files[0]);
	});

	// ---------- 受け取り（ページの読み取り結果・ページ上の印から開く語） ----------
	function onLookup(v) {
		if (!v || typeof v.w !== 'string') return;
		if (mode !== 'panel' || v.windowId !== winId) return;
		api.lookup(v.w.slice(0, 100));
	}
	chrome.storage.onChanged.addListener(function (changes, area) {
		if (area !== 'session') return;
		if (changes.scan && mine(changes.scan.newValue)) onScan(changes.scan.newValue);
		if (changes.panelLookup) onLookup(changes.panelLookup.newValue);
	});

	// 起動時：窓の番号が分かってから、直前に頼まれた分を拾う
	function start() {
		if (!chrome.storage || !chrome.storage.session) return;
		chrome.storage.session.get(['scan', 'panelLookup'], function (v) {
			var fresh = function (x) { return x && Date.now() - x.seq < FRESH_MS; };
			if (v.scan && mine(v.scan)) {
				// 古い結果も「ページ」タブには出しておく。開く画面を切り替えるのは直前のものだけ
				if (fresh(v.scan)) onScan(v.scan);
				else if (!v.scan.error && v.scan.text) { lastSeq = v.scan.seq; analyze(v.scan.text, { source: 'page', title: v.scan.title, tabId: v.scan.tabId, truncated: v.scan.truncated }); }
			}
			if (fresh(v.panelLookup)) onLookup(v.panelLookup);
		});
	}
	if (mode === 'tab') $id('page-scan').hidden = true;
	if (params.get('pane') === 'page') api.showPane('page');
	if (params.get('pdf')) setStatus(T('pagePdfHint', 'PDF ファイルを選ぶか、この画面へドロップしてください。'));
	if (chrome.windows) chrome.windows.getCurrent(function (w) { if (w) winId = w.id; start(); });
	else start();
})();
