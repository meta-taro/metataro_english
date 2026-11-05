// ページや PDF の本文から、辞書に収録されている単語・熟語を取り出す。
// 照合は Set / Map だけで行い、熟語は先頭の語で索引を引く（数万語の本文でも 1 回の走査で済む）。
// 画面（popup.js）と単体テスト（node）の両方から使う。データの読み込みはここではしない。
(function (root) {
	'use strict';

	var Lemma = root.Lemma || (typeof require === 'function' ? require('./lemma.js') : null);

	// 短縮形の後ろ半分。n't だけは前半の形が変わるものがある
	var NT = { can: 'can', ca: 'can', wo: 'will', sha: 'shall', ai: 'be' };
	var CONTRACTION = /^(.+?)(n't|'s|'re|'ve|'ll|'d|'m|s')$/;

	// 照合用の索引を作る。
	// data.words: 見出し語（小文字・1 語）の配列
	// data.exc:   不規則変化 { 変化形: [原形, ...] }
	// data.wnPos: { 語: 品詞文字列 }（WordNet の見出し。原形の判定に使う）
	// data.idioms: 熟語の行（[見出し, 意味, ...]）
	function buildIndex(data) {
		var words = new Set(data.words || []);
		// 「constructor」などの語で Object の既定の性質を拾わないよう、素の表へ写す
		var wnPos = plain(data.wnPos);
		var exc = plain(data.exc);
		var idiomIdx = new Map();
		var idiomCount = 0;
		(data.idioms || []).forEach(function (r) {
			var p = String(r[0] || '');
			// 「one's」などの差し替えを含む熟語や、記号の入った見出しは機械的に照合できないので外す
			if (!/^[A-Za-z]+(?:['’][A-Za-z]+)*(?:[ -][A-Za-z]+(?:['’][A-Za-z]+)*)+$/.test(p)) return;
			if (/\b(?:one's|someone|something|somebody|sb|sth|oneself)\b/i.test(p)) return;
			var toks = p.replace(/’/g, "'").split(/[ -]/);
			var lower = toks.map(function (x) { return x.toLowerCase(); });
			var item = { phrase: p, toks: lower, raw: toks, cased: /[A-Z]/.test(p) };
			var list = idiomIdx.get(lower[0]);
			if (!list) idiomIdx.set(lower[0], list = []);
			list.push(item);
			idiomCount++;
		});
		// 長い熟語から試す
		idiomIdx.forEach(function (list) { list.sort(function (a, b) { return b.toks.length - a.toks.length; }); });
		return { words: words, wnPos: wnPos, exc: exc, idioms: idiomIdx, idiomCount: idiomCount, memo: new Map() };
	}

	function plain(src) {
		var o = Object.create(null);
		if (src) Object.keys(src).forEach(function (k) { o[k] = src[k]; });
		return o;
	}

	function inDict(idx, w) { return idx.words.has(w); }

	// 1 語を辞書の見出しへ寄せる。収録が無ければ null
	function lemmaOf(idx, token) {
		var t = token.toLowerCase().replace(/’/g, "'");
		if (idx.memo.has(t)) return idx.memo.get(t);
		var out = resolve(idx, t);
		idx.memo.set(t, out);
		return out;
	}
	function resolve(idx, t) {
		if (t.indexOf("'") >= 0) {
			if (inDict(idx, t)) return t;
			var m = t.match(CONTRACTION);
			if (!m) return null;
			var stem = m[1];
			if (m[2] === "n't" && NT[stem]) return NT[stem];
			if (m[2] === "s'") stem = m[1] + 's';
			return resolve(idx, stem);
		}
		// WordNet の見出しにある語はそのまま（news / glasses / left などを原形へ崩さない）
		// ただし形容詞としてだけ載っていて、例外表で変化形とされている語（studied など）は原形へ寄せる
		var pos = idx.wnPos[t];
		if (pos && inDict(idx, t) && !(idx.exc[t] && /^[as]+$/.test(pos))) return t;
		var exists = function (w, p) {
			if (idx.exc[t] && idx.exc[t].indexOf(w) >= 0) return inDict(idx, w);
			if (!inDict(idx, w)) return false;
			return !p || (idx.wnPos[w] && idx.wnPos[w].indexOf(p) >= 0);
		};
		var bases = Lemma.baseForms(t, idx.exc, exists);
		if (bases.length) return bases[0];
		return inDict(idx, t) ? t : null;
	}

	// 本文を語の並びにする。区切りに空白とハイフン以外（句読点・改行の連続など）が挟まったら熟語は切る
	var TOKEN = /[A-Za-z]+(?:['’][A-Za-z]+)*/g;
	function tokens(text) {
		var out = [], last = 0, m;
		TOKEN.lastIndex = 0;
		while ((m = TOKEN.exec(text))) {
			var gap = text.slice(last, m.index);
			out.push({ t: m[0], brk: !/^[\s\u00a0-]*$/.test(gap) || /\n\s*\n/.test(gap) });
			last = TOKEN.lastIndex;
		}
		return out;
	}

	// 本文から収録語・熟語を数える。
	// 返り値: { words: [{ w, n, forms: [表記, ...] }], idioms: [{ p, n }], tokens, unknown }
	function extract(text, idx) {
		var toks = tokens(String(text || ''));
		var counts = new Map(); // 原形 → { n, forms:Set }
		var lemmas = new Array(toks.length);
		var unknown = 0;
		for (var i = 0; i < toks.length; i++) {
			var w = lemmaOf(idx, toks[i].t);
			lemmas[i] = w;
			if (!w) { unknown++; continue; }
			var c = counts.get(w);
			if (!c) counts.set(w, c = { n: 0, forms: new Set() });
			c.n++;
			c.forms.add(toks[i].t.toLowerCase().replace(/’/g, "'"));
		}
		var idiomCounts = new Map();
		for (var j = 0; j < toks.length; j++) {
			var first = toks[j].t.toLowerCase();
			var cand = idx.idioms.get(first);
			if (lemmas[j] && lemmas[j] !== first) cand = (cand || []).concat(idx.idioms.get(lemmas[j]) || []);
			if (!cand || !cand.length) continue;
			for (var k = 0; k < cand.length; k++) {
				if (matchAt(toks, lemmas, j, cand[k])) {
					idiomCounts.set(cand[k].phrase, (idiomCounts.get(cand[k].phrase) || 0) + 1);
					break; // 同じ位置からは一番長いものだけ数える
				}
			}
		}
		var words = [];
		counts.forEach(function (v, w) { words.push({ w: w, n: v.n, forms: Array.from(v.forms) }); });
		words.sort(function (a, b) { return b.n - a.n || (a.w < b.w ? -1 : 1); });
		var idioms = [];
		idiomCounts.forEach(function (n, p) { idioms.push({ p: p, n: n }); });
		idioms.sort(function (a, b) { return b.n - a.n || (a.p < b.p ? -1 : 1); });
		return { words: words, idioms: idioms, tokens: toks.length, unknown: unknown };
	}

	function matchAt(toks, lemmas, j, item) {
		var len = item.toks.length;
		if (j + len > toks.length) return false;
		for (var i = 0; i < len; i++) {
			var tk = toks[j + i];
			if (i > 0 && tk.brk) return false;
			var want = item.toks[i];
			if (item.cased) {
				// 大文字を含む見出し（A level など）は表記どおりのときだけ一致とみなす
				if (tk.t.replace(/’/g, "'") !== item.raw[i]) return false;
				continue;
			}
			var low = tk.t.toLowerCase().replace(/’/g, "'");
			if (low !== want && lemmas[j + i] !== want) return false;
		}
		return true;
	}

	// PDF（pdf.js の getTextContent）の断片を本文へつなぐ。
	// pages: ページごとの items（{ str, hasEOL }）の配列。行末のハイフンで切れた語はつなぎ直す
	function pdfText(pages) {
		var out = [];
		(pages || []).forEach(function (items) {
			var s = '';
			(items || []).forEach(function (it) {
				if (!it || typeof it.str !== 'string') return;
				s += it.str;
				if (it.hasEOL) s += '\n';
			});
			out.push(s);
		});
		return out.join('\n\n').replace(/([A-Za-z])-[ \t]*\r?\n[ \t]*([a-z])/g, '$1$2');
	}

	var api = { buildIndex: buildIndex, extract: extract, lemmaOf: lemmaOf, tokens: tokens, pdfText: pdfText };
	if (typeof module !== 'undefined' && module.exports) module.exports = api;
	else root.Scan = api;
})(this);
