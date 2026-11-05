// 語形の処理（原形の推定と変化形の生成）。
// 不規則形は WordNet の例外表（data/morph.json）と不規則動詞表を使い、規則変化は WordNet の morphy と同じ語尾の付け替えを使う。
// 推定した原形は、辞書に実在する語だけを候補として残す。
// ポップアップとデータ作成スクリプト（node）の両方から使う。
(function (root) {
	'use strict';

	// WordNet morphy の語尾規則（品詞ごと）
	var SUFFIX = {
		n: [['s', ''], ['ses', 's'], ['xes', 'x'], ['zes', 'z'], ['ches', 'ch'], ['shes', 'sh'], ['men', 'man'], ['ies', 'y']],
		v: [['s', ''], ['ies', 'y'], ['es', 'e'], ['es', ''], ['ed', 'e'], ['ed', ''], ['ing', 'e'], ['ing', '']],
		a: [['er', ''], ['est', ''], ['er', 'e'], ['est', 'e']]
	};
	var VOWEL = /[aeiou]/;

	function norm(w) {
		return String(w || '').trim().toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, ' ');
	}

	// 原形の候補を返す（入力そのものは含めない）。
	// exc: { 変化形: [原形, ...] }（WordNet 例外表＋不規則動詞表）
	// exists(w, pos): 辞書に見出しがあるか（pos を渡したときはその品詞で WordNet にあるか）
	function baseForms(word, exc, exists) {
		var w = norm(word);
		var out = [];
		function add(b, p) { if (b && b !== w && out.indexOf(b) < 0 && exists(b, p)) out.push(b); }
		(exc && exc[w] || []).forEach(function (b) { add(b); });
		if (w.length < 4 || / /.test(w)) return out;
		['v', 'n', 'a'].forEach(function (p) {
			SUFFIX[p].forEach(function (r) {
				if (w.length > r[0].length + 1 && w.slice(-r[0].length) === r[0]) {
					add(w.slice(0, -r[0].length) + r[1], p);
				}
			});
		});
		// 子音字を重ねる形（stopped / running / bigger）
		var m = w.match(/^(.*([b-df-hj-np-tv-z]))\2(ed|ing|er|est)$/);
		if (m) add(m[1], /er|est/.test(m[3]) ? 'a' : 'v');
		return out;
	}

	function syllables(w) {
		var m = w.replace(/e$/, '').match(/[aeiouy]+/g);
		return m ? m.length : 1;
	}
	// 短母音＋子音で終わる 1 音節語（stop → stopped）
	function doubles(w) {
		return syllables(w) === 1 && /[^aeiou][aeiou][b-df-hj-np-tvz]$/.test(w);
	}
	function plural(w) {
		if (/(s|x|z|ch|sh)$/.test(w)) return w + 'es';
		if (/[^aeiou]y$/.test(w)) return w.slice(0, -1) + 'ies';
		return w + 's';
	}
	function past(w) {
		if (/e$/.test(w)) return w + 'd';
		if (/[^aeiou]y$/.test(w)) return w.slice(0, -1) + 'ied';
		if (doubles(w)) return w + w.slice(-1) + 'ed';
		return w + 'ed';
	}
	function ing(w) {
		if (/ie$/.test(w)) return w.slice(0, -2) + 'ying';
		if (/[^aeioy]e$/.test(w)) return w.slice(0, -1) + 'ing';
		if (doubles(w)) return w + w.slice(-1) + 'ing';
		return w + 'ing';
	}
	function third(w) {
		if (/(s|x|z|ch|sh|[^aeiou]o)$/.test(w)) return w + 'es';
		if (/[^aeiou]y$/.test(w)) return w.slice(0, -1) + 'ies';
		return w + 's';
	}
	function comparative(w) {
		var n = syllables(w);
		if (n === 1 || (n === 2 && /[^aeiou]y$/.test(w))) {
			if (/e$/.test(w)) return [w + 'r', w + 'st'];
			if (/[^aeiou]y$/.test(w)) return [w.slice(0, -1) + 'ier', w.slice(0, -1) + 'iest'];
			if (doubles(w)) return [w + w.slice(-1) + 'er', w + w.slice(-1) + 'est'];
			return [w + 'er', w + 'est'];
		}
		return ['more ' + w, 'most ' + w];
	}

	// 変化形を作る。pos は WordNet の品詞文字列（"nva" など）。
	// rev: { 原形: { 品詞: [変化形, ...] } }（例外表を逆に引いたもの）
	// verbRow: 不規則動詞表の行（あれば過去形・過去分詞はそれを使う）
	function inflections(base, pos, rev, verbRow) {
		var w = norm(base);
		if (!w || / /.test(w) || !VOWEL.test(w)) return [];
		var r = (rev && rev[w]) || {};
		var out = [];
		if (pos.indexOf('v') >= 0) {
			var irr = r.v || [];
			var pick = function (re, fallback) {
				var hit = irr.filter(function (f) { return re.test(f); });
				return hit.length ? hit.join(', ') : fallback;
			};
			if (verbRow) {
				out.push(['3sg', third(w)], ['past', verbRow.kako], ['pp', verbRow.kakobun], ['ing', pick(/ing$/, ing(w))]);
			} else if (irr.some(function (f) { return !/(ed|ing)$/.test(f); })) {
				out.push(['3sg', third(w)], ['irregular', irr.filter(function (f) { return !/ing$/.test(f); }).join(', ')], ['ing', pick(/ing$/, ing(w))]);
			} else {
				out.push(['3sg', third(w)], ['pastpp', pick(/ed$/, past(w))], ['ing', pick(/ing$/, ing(w))]);
			}
		}
		if (pos.indexOf('n') >= 0) out.push(['plural', (r.n && r.n.length) ? r.n.join(', ') : plural(w)]);
		if (pos.indexOf('a') >= 0) {
			if (r.a && r.a.length) {
				var er = r.a.filter(function (f) { return /er$/.test(f) || !/est$/.test(f); });
				var est = r.a.filter(function (f) { return /est$/.test(f); });
				if (er.length) out.push(['comp', er[0]]);
				if (est.length) out.push(['sup', est[0]]);
			} else {
				var c = comparative(w);
				out.push(['comp', c[0]], ['sup', c[1]]);
			}
		}
		return out;
	}

	// 英文を語に分ける（表示用に区切りも残す）
	function tokenize(s) {
		var parts = [];
		var re = /[A-Za-z]+(?:['’][A-Za-z]+)*/g, last = 0, m;
		while ((m = re.exec(s))) {
			if (m.index > last) parts.push({ t: s.slice(last, m.index), w: false });
			parts.push({ t: m[0], w: true });
			last = re.lastIndex;
		}
		if (last < s.length) parts.push({ t: s.slice(last), w: false });
		return parts;
	}

	// 不規則動詞表の 1 セル（"was, were" / "got(ten)" / "read réd"）を語の配列にする
	function verbCell(s) {
		var out = [];
		function add(y) { if (/^[a-z]+$/.test(y) && out.indexOf(y) < 0) out.push(y); }
		String(s).split(/[,\s]+/).forEach(function (x) {
			var m = x.match(/^([a-z]+)\(([a-z]+)\)$/);
			if (m) { add(m[1]); add(m[1] + m[2]); return; }
			add(x.replace(/[()]/g, ''));
		});
		return out;
	}

	var api = { norm: norm, baseForms: baseForms, inflections: inflections, tokenize: tokenize, verbCell: verbCell };
	if (typeof module !== 'undefined' && module.exports) module.exports = api;
	else root.Lemma = api;
})(this);
