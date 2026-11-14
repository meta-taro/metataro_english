// 印付きの PDF 画面。「ページ」タブで読んだ PDF を描き、辞典に載っている語へ薄いマーカーを引く。
// 印を押すと、その語の項目をサイドパネルで開く（ページに付ける印と同じ経路）。
// PDF は拡張の中（IndexedDB）から受け取り、端末の中で描くだけで外へは送らない。
(function () {
	'use strict';
	var WORD = /[A-Za-z]+(?:['’][A-Za-z]+)*/g;
	var MAX = 20000; // 印の上限（極端に長い PDF で固まらないように）
	var ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
	var DEFAULT_ZOOM = 2;

	function $id(id) { return document.getElementById(id); }
	function T(key, def) {
		var s = (typeof chrome !== 'undefined' && chrome.i18n) ? chrome.i18n.getMessage(key) : '';
		return s || def;
	}
	function status(text) { $id('v-status').textContent = text || ''; }

	var doc = null, map = {}, zoom = DEFAULT_ZOOM, count = 0, observer = null;

	// 1 枚分の文字の層へ印を付ける
	function markLayer(layer) {
		var spans = layer.querySelectorAll('span');
		for (var i = 0; i < spans.length && count < MAX; i++) {
			var sp = spans[i];
			if (sp.children.length || !sp.textContent) continue;
			var s = sp.textContent, last = 0, m, frag = null;
			WORD.lastIndex = 0;
			while ((m = WORD.exec(s)) && count < MAX) {
				var key = m[0].toLowerCase().replace(/’/g, "'");
				var hit = Object.prototype.hasOwnProperty.call(map, key) ? map[key] : null;
				if (!hit || typeof hit[0] !== 'string') continue;
				if (!frag) frag = document.createDocumentFragment();
				if (m.index > last) frag.appendChild(document.createTextNode(s.slice(last, m.index)));
				var mk = document.createElement('mark');
				mk.setAttribute('data-w', hit[0]);
				mk.title = hit[1] ? hit[0] + ' : ' + hit[1] : hit[0];
				mk.textContent = m[0];
				frag.appendChild(mk);
				last = WORD.lastIndex;
				count++;
			}
			if (frag) {
				if (last < s.length) frag.appendChild(document.createTextNode(s.slice(last)));
				sp.textContent = '';
				sp.appendChild(frag);
			}
		}
	}

	function scaleOf() { return ZOOMS[zoom] * 96 / 72; }

	function renderPage(box) {
		if (box.dataset.done) return;
		box.dataset.done = '1';
		var n = Number(box.dataset.page);
		doc.getPage(n).then(function (pg) {
			var vp = pg.getViewport({ scale: scaleOf() });
			var dpr = window.devicePixelRatio || 1;
			var canvas = document.createElement('canvas');
			canvas.width = Math.floor(vp.width * dpr);
			canvas.height = Math.floor(vp.height * dpr);
			box.appendChild(canvas);
			var layer = document.createElement('div');
			layer.className = 'textLayer';
			box.appendChild(layer);
			var draw = pg.render({
				canvas: canvas, canvasContext: canvas.getContext('2d'), viewport: vp,
				transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null
			}).promise;
			var text = pg.getTextContent().then(function (tc) {
				return new window.pdfjsLib.TextLayer({ textContentSource: tc, container: layer, viewport: vp }).render();
			}).then(function () { markLayer(layer); });
			return Promise.all([draw, text]);
		}).catch(function () {
			box.dataset.done = '';
		});
	}

	// ページの枠だけ先に並べ、見えてきたものから描く
	function layout() {
		var main = $id('pages');
		if (observer) observer.disconnect();
		main.textContent = '';
		count = 0;
		observer = new IntersectionObserver(function (entries) {
			entries.forEach(function (e) { if (e.isIntersecting) renderPage(e.target); });
		}, { rootMargin: '600px 0px' });
		$id('v-zoom').textContent = Math.round(ZOOMS[zoom] * 100) + '%';
		var scale = scaleOf();
		var chain = Promise.resolve();
		for (var i = 1; i <= doc.numPages; i++) {
			(function (n) {
				chain = chain.then(function () { return doc.getPage(n); }).then(function (pg) {
					var vp = pg.getViewport({ scale: scale });
					var box = document.createElement('div');
					box.className = 'page';
					box.dataset.page = String(n);
					box.style.width = vp.width + 'px';
					box.style.height = vp.height + 'px';
					box.style.setProperty('--scale-factor', String(scale));
					box.style.setProperty('--total-scale-factor', String(scale));
					main.appendChild(box);
					observer.observe(box);
				});
			})(i);
		}
		return chain;
	}

	// 印を押した：その語をサイドパネルで開く
	$id('pages').addEventListener('click', function (e) {
		var m = e.target && e.target.closest ? e.target.closest('mark[data-w]') : null;
		if (!m || document.body.classList.contains('nomarks')) return;
		e.preventDefault();
		chrome.runtime.sendMessage({ type: 'open', w: m.getAttribute('data-w') });
	});
	$id('v-marks').addEventListener('change', function () {
		document.body.classList.toggle('nomarks', !this.checked);
	});
	function setZoom(z) {
		if (!doc || z < 0 || z >= ZOOMS.length || z === zoom) return;
		zoom = z;
		layout();
	}
	$id('v-zoom-in').addEventListener('click', function () { setZoom(zoom + 1); });
	$id('v-zoom-out').addEventListener('click', function () { setZoom(zoom - 1); });

	status(T('viewerLoading', '読み込んでいます…'));
	Promise.all([
		window.PdfStash.get(),
		import(chrome.runtime.getURL('lib/pdfjs/pdf.min.mjs'))
	]).then(function (r) {
		var rec = r[0], lib = r[1];
		if (!rec || !rec.blob) throw new Error('none');
		lib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('lib/pdfjs/pdf.worker.min.mjs');
		window.pdfjsLib = lib;
		map = rec.map || {};
		$id('v-title').textContent = rec.name || 'PDF';
		document.title = (rec.name || 'PDF') + ' — ' + document.title;
		return rec.blob.arrayBuffer().then(function (buf) {
			return lib.getDocument({ data: new Uint8Array(buf), isEvalSupported: false }).promise;
		});
	}).then(function (d) {
		doc = d;
		return layout();
	}).then(function () {
		status(T('viewerReady', '辞典に載っている語に色を付けています。'));
	}).catch(function (e) {
		status(e && e.message === 'none'
			? T('viewerNone', '開く PDF がありません。辞典の「ページ」タブで PDF を読んでから開いてください。')
			: T('viewerError', 'PDF を開けませんでした。'));
	});
})();
