// 辞書データの読み込みと検索。データは data/ 以下に分けて置き、必要になった分だけ読む。
// 読み込んだ文字列は表示のときに必ず textContent で入れる（HTML として解釈しない）。
var Dict = (function () {
	'use strict';
	var cache = {};
	function load(rel) {
		if (!cache[rel]) {
			cache[rel] = fetch('/data/' + rel).then(function (r) {
				if (!r.ok) throw new Error(rel);
				return r.json();
			}).catch(function () { delete cache[rel]; return null; });
		}
		return cache[rel];
	}
	function bucket(k) { return /^[a-z]/.test(k) ? k[0] : '_'; }
	function norm(q) { return Lemma.norm(q); }

	// 前方一致の位置（行は小文字の見出しで並んでいる）
	function lowerBound(rows, k) {
		var lo = 0, hi = rows.length;
		while (lo < hi) {
			var mid = (lo + hi) >> 1;
			if (rows[mid][0].toLowerCase() < k) lo = mid + 1; else hi = mid;
		}
		return lo;
	}
	function rowsOf(k) {
		return load('dict/' + bucket(k) + '.json').then(function (rows) {
			if (!rows) return [];
			var out = [];
			for (var i = lowerBound(rows, k); i < rows.length && rows[i][0].toLowerCase() === k; i++) out.push(rows[i]);
			return out;
		});
	}
	function prefix(q, limit) {
		var k = norm(q);
		if (!k) return Promise.resolve([]);
		return load('dict/' + bucket(k) + '.json').then(function (rows) {
			if (!rows) return [];
			var out = [], seen = {};
			for (var i = lowerBound(rows, k); i < rows.length && out.length < limit; i++) {
				var w = rows[i][0].toLowerCase();
				if (w.indexOf(k) !== 0) break;
				if (seen[w]) continue;
				seen[w] = 1;
				out.push(rows[i]);
			}
			return out;
		});
	}
	function wnOf(k) {
		return load('wn/' + bucket(k) + '.json').then(function (m) { return (m && m[k]) || null; });
	}
	function examplesOf(k) {
		return load('ex/' + bucket(k) + '.json').then(function (m) { return (m && m[k]) || []; });
	}
	function notesOf(k) {
		return load('notes/' + bucket(k) + '.json').then(function (m) { return (m && m[k]) || null; });
	}
	function morph() { return load('morph.json').then(function (m) { return m || { exc: {}, rev: {} }; }); }

	// 原形の候補（辞書にあるものだけ）
	function bases(q) {
		var k = norm(q);
		return morph().then(function (m) {
			// 規則の付け替えは同じ頭文字の中で起きるので、その分の辞書と WordNet を先に読む
			return Promise.all([load('dict/' + bucket(k) + '.json'), load('wn/' + bucket(k) + '.json')]).then(function (r) {
				var rows = r[0] || [], wn = r[1] || {};
				var exists = function (w, p) {
					if (m.exc[k] && m.exc[k].indexOf(w) >= 0) return true;
					if (bucket(w) !== bucket(k)) return false;
					var i = lowerBound(rows, w);
					if (!(rows[i] && rows[i][0].toLowerCase() === w)) return false;
					return !p || (wn[w] && wn[w][0].indexOf(p) >= 0);
				};
				return Lemma.baseForms(k, m.exc, exists);
			});
		});
	}

	// 熟語：EJDict の複数語の見出し（idioms.json）に、AI が作った会話の言い回し（idioms-ai.json）を足す。
	// AI の行は 4 番目に 1 を持つ。同じ見出しは EJDict の訳を残し、例文が無ければ AI の例文を借りる
	var idiomList = null;
	function idiomKey(s) { return norm(s).replace(/[?!.,;:"“”。、？！]/g, '').replace(/\s+/g, ' ').trim(); }
	function allIdioms() {
		if (!idiomList) {
			idiomList = Promise.all([load('idioms.json'), load('idioms-ai.json')]).then(function (r) {
				var base = r[0] || [], ai = r[1] || [], at = {}, out = [];
				base.forEach(function (x) { at[idiomKey(x[0])] = x; });
				ai.forEach(function (x) {
					var b = at[idiomKey(x[0])];
					if (b) { if (!b[2] || !b[2].length) b[2] = x[2]; return; }
					out.push([x[0], x[1], x[2] || [], 1]);
				});
				return out.concat(base);
			});
		}
		return idiomList;
	}
	// 熟語：引いた語（または原形）を含む複数語の見出し、または入力で始まる見出し。AI の行（よく使う言い回し）を先に出す
	function idioms(q, words) {
		var k = idiomKey(q);
		return allIdioms().then(function (list) {
			return list.filter(function (r) {
				var p = idiomKey(r[0]);
				if (/ /.test(k)) return p.indexOf(k) === 0 && p !== k;
				var toks = p.split(' ');
				return words.some(function (w) { return toks.indexOf(w) >= 0; });
			});
		});
	}
	// 熟語の見出しにぴったり一致する行
	function idiomOf(q) {
		var k = idiomKey(q);
		return allIdioms().then(function (list) {
			for (var i = 0; i < list.length; i++) if (idiomKey(list[i][0]) === k) return list[i];
			return null;
		});
	}
	// 入力中の候補：前方一致を先に、足りなければ途中に含むもの
	function idiomPrefix(q, n) {
		var k = idiomKey(q);
		return allIdioms().then(function (list) {
			var head = [], mid = [];
			list.forEach(function (r) {
				var p = idiomKey(r[0]), at = p.indexOf(k);
				if (at === 0) head.push(r); else if (at > 0 && p.charAt(at - 1) === ' ') mid.push(r);
			});
			return head.concat(mid).slice(0, n);
		});
	}

	// つづり違い（編集距離 2 まで）
	function distance(a, b, max) {
		if (Math.abs(a.length - b.length) > max) return max + 1;
		// 隣り合う 2 文字の入れ替え（recieve → receive）も 1 と数える
		var pp = null, prev = [], cur, i, j;
		for (j = 0; j <= b.length; j++) prev[j] = j;
		for (i = 1; i <= a.length; i++) {
			cur = [i];
			var best = i;
			for (j = 1; j <= b.length; j++) {
				var c = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
				if (pp && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) c = Math.min(c, pp[j - 2] + 1);
				cur[j] = c;
				if (c < best) best = c;
			}
			if (best > max) return max + 1;
			pp = prev;
			prev = cur;
		}
		return prev[b.length];
	}
	function similar(q, limit) {
		var k = norm(q);
		if (!/^[a-z]{3,}$/.test(k)) return Promise.resolve([]);
		return load('words.json').then(function (words) {
			if (!words) return [];
			var max = k.length <= 4 ? 1 : 2, hits = [];
			for (var i = 0; i < words.length; i++) {
				var w = words[i];
				if (w === k) continue;
				var d = distance(k, w, max);
				if (d <= max) hits.push([d, w]);
			}
			hits.sort(function (a, b) { return a[0] - b[0] || a[1].length - b[1].length; });
			return hits.slice(0, limit).map(function (h) { return h[1]; });
		});
	}

	// 和→英の逆引き（EJDict の訳語から作った索引）
	function reverse(q, limit) {
		var k = String(q || '').trim();
		if (!k) return Promise.resolve([]);
		return load('reverse.json').then(function (list) {
			if (!list) return [];
			var exact = [], head = [], part = [];
			for (var i = 0; i < list.length; i++) {
				var t = list[i][0];
				if (t === k) exact.push(list[i]);
				else if (t.indexOf(k) === 0) head.push(list[i]);
				else if (t.indexOf(k) > 0) part.push(list[i]);
			}
			var out = [], seen = {};
			exact.concat(head.sort(function (a, b) { return a[0].length - b[0].length; }), part.sort(function (a, b) { return a[0].length - b[0].length; })).forEach(function (r) {
				r[1].split('|').forEach(function (w) {
					if (out.length < limit && !seen[w]) { seen[w] = 1; out.push({ w: w, term: r[0] }); }
				});
			});
			return out;
		});
	}

	return {
		load: load, norm: norm, rowsOf: rowsOf, prefix: prefix, wnOf: wnOf, examplesOf: examplesOf, notesOf: notesOf,
		morph: morph, bases: bases, idioms: idioms, idiomOf: idiomOf, idiomPrefix: idiomPrefix, idiomKey: idiomKey, similar: similar, reverse: reverse, distance: distance
	};
})();
if (typeof module !== 'undefined' && module.exports) module.exports = Dict;
