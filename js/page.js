// 「ページ」タブ：開いているページや PDF・画像の英文から、この辞典の収録語・熟語を拾い出す。
// ページの文字は押したときだけ読み（activeTab）、端末の中で数えるだけで外へは送らない。
// 画像と、文字データの無い PDF のページは端末の中で文字認識（Tesseract.js）してから数える。
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

	var state = null;      // { source: 'page'|'pdf'|'image', title, tabId, words, idioms, tokens, truncated }
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
		$id('page-title').textContent = state.source === 'pdf' ? 'PDF: ' + state.title
			: state.source === 'image' ? T('pageImageLabel', '画像') + ': ' + state.title : state.title;
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
		if (/pdf/i.test(s)) return T('pageErrPdfTab', 'ブラウザで開いている PDF は読めません。「PDF・画像を読む」からファイルを選んでください。');
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

	// ---------- 文字認識（画像・文字データの無い PDF のページ） ----------
	// 部品と英語の学習データは拡張に同梱してあり、外へは何も取りに行かない
	var ocrLibP = null;
	function ocrLib() {
		if (!ocrLibP) {
			ocrLibP = new Promise(function (resolve, reject) {
				if (window.Tesseract) { resolve(window.Tesseract); return; }
				var s = document.createElement('script');
				s.src = chrome.runtime.getURL('lib/tesseract/tesseract.min.js');
				s.onload = function () { window.Tesseract ? resolve(window.Tesseract) : reject(new Error('tesseract')); };
				s.onerror = reject;
				document.head.appendChild(s);
			});
			ocrLibP.catch(function () { ocrLibP = null; });
		}
		return ocrLibP;
	}
	function ocrWorker() {
		var base = chrome.runtime.getURL('lib/tesseract/');
		return ocrLib().then(function (lib) {
			return lib.createWorker('eng', 1, {
				workerPath: base + 'worker.min.js',
				corePath: base + 'tesseract-core-simd-lstm.wasm.js',
				langPath: base.replace(/\/$/, ''),
				workerBlobURL: false,
				cacheMethod: 'none'
			});
		});
	}
	var OCR_MAX_PIXELS = 12e6;
	var OCR_MIN_LETTERS = 20; // これより英字が少ないページは文字データが無いとみなして認識する
	function letters(items) {
		var n = 0;
		items.forEach(function (it) { var m = String(it.str || '').match(/[A-Za-z]/g); if (m) n += m.length; });
		return n;
	}
	function pageCanvas(pg) {
		var vp = pg.getViewport({ scale: 3 });
		var k = Math.min(1, Math.sqrt(OCR_MAX_PIXELS / (vp.width * vp.height)));
		if (k < 1) vp = pg.getViewport({ scale: 3 * k });
		var c = document.createElement('canvas');
		c.width = Math.floor(vp.width);
		c.height = Math.floor(vp.height);
		var ctx = c.getContext('2d');
		ctx.fillStyle = '#fff';
		ctx.fillRect(0, 0, c.width, c.height);
		return pg.render({ canvas: c, canvasContext: ctx, viewport: vp }).promise.then(function () { return c; });
	}
	function ocrText(worker, canvas) {
		return worker.recognize(canvas).then(function (r) { return (r && r.data && r.data.text) || ''; });
	}

	function isImage(file) {
		return /^image\//.test(file.type) || /\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name);
	}
	function isPdf(file) {
		return /\.pdf$/i.test(file.name) || file.type === 'application/pdf';
	}
	function readFile(file) {
		if (!file) return;
		if (isImage(file)) return readImage(file);
		if (isPdf(file)) return readPdf(file);
		setStatus(T('pageErrNotPdf', 'PDF か画像ファイルを選んでください。'), true);
	}

	function readImage(file) {
		api.showPane('page');
		setStatus(T('pageOcrImage', '画像の英文を読み取っています…'));
		var worker = null;
		createImageBitmap(file).then(function (bmp) {
			var k = Math.min(1, Math.sqrt(OCR_MAX_PIXELS / (bmp.width * bmp.height)));
			var c = document.createElement('canvas');
			c.width = Math.max(1, Math.floor(bmp.width * k));
			c.height = Math.max(1, Math.floor(bmp.height * k));
			var ctx = c.getContext('2d');
			ctx.fillStyle = '#fff';
			ctx.fillRect(0, 0, c.width, c.height);
			ctx.drawImage(bmp, 0, 0, c.width, c.height);
			if (bmp.close) bmp.close();
			return ocrWorker().then(function (w) { worker = w; return ocrText(w, c); });
		}).then(function (raw) {
			if (worker) worker.terminate();
			var text = Scan.pdfText([[{ str: raw }]]);
			if (!/[A-Za-z]/.test(text)) {
				state = null; render();
				setStatus(T('pageImageNoText', 'この画像から英文を読み取れませんでした。'), true);
				return;
			}
			return analyze(text, { source: 'image', title: file.name });
		}).catch(function () {
			if (worker) worker.terminate();
			setStatus(T('pageOcrError', '画像を読み取れませんでした。'), true);
		});
	}

	function readPdf(file) {
		api.showPane('page');
		setStatus(T('pageReading', 'ページを読んでいます…'));
		var task = null, doc = null, worker = null;
		function done() {
			if (task) task.destroy();
			if (worker) worker.terminate();
			task = doc = worker = null;
		}
		Promise.all([file.arrayBuffer(), pdfjs()]).then(function (r) {
			task = r[1].getDocument({ data: new Uint8Array(r[0]), isEvalSupported: false });
			return task.promise;
		}).then(function (d) {
			doc = d;
			var pages = [], i = 0, total = doc.numPages;
			function ocrPage(pg) {
				setStatus(T('pageOcrProgress', '画像の英文を読み取っています（$1 / $2 ページ）…', [String(i), String(total)]));
				return (worker ? Promise.resolve(worker) : ocrWorker().then(function (w) { worker = w; return w; }))
					.then(function (w) { return pageCanvas(pg).then(function (c) { return ocrText(w, c); }); })
					.then(function (raw) { return [{ str: raw }]; });
			}
			function next() {
				i++;
				if (i > total) return pages;
				setStatus(T('pagePdfProgress', 'PDF を読んでいます（$1 / $2 ページ）…', [String(i), String(total)]));
				return doc.getPage(i).then(function (pg) {
					return pg.getTextContent().then(function (tc) {
						return letters(tc.items) >= OCR_MIN_LETTERS ? tc.items : ocrPage(pg);
					});
				}).then(function (items) {
					pages.push(items);
					return next();
				});
			}
			return next();
		}).then(function (pages) {
			var text = Scan.pdfText(pages);
			done();
			if (!/[A-Za-z]/.test(text)) {
				state = null; render();
				setStatus(T('pagePdfNoText', 'この PDF から英文を取り出せませんでした。'), true);
				return;
			}
			return analyze(text, { source: 'pdf', title: file.name });
		}).catch(function (e) {
			done();
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
		readFile(fileInput.files && fileInput.files[0]);
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
		readFile(e.dataTransfer.files[0]);
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
	if (params.get('pdf')) setStatus(T('pagePdfHint', 'PDF か画像ファイルを選ぶか、この画面へドロップしてください。'));
	if (chrome.windows) chrome.windows.getCurrent(function (w) { if (w) winId = w.id; start(); });
	else start();
})();
