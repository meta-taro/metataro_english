// ポップアップ（と右クリックから開く小窓）の画面。
// 辞書データは外部由来なので、画面へは必ず textContent で入れる（innerHTML に渡さない）。
(function () {
	'use strict';

	// 文言：拡張の外で開いたときは日本語の既定文言を使う
	function T(key, def, sub) {
		var s = t(key, sub);
		if (s !== key) return s;
		return sub == null ? def : String(def).replace('$1', sub);
	}
	function el(tag, cls, text) {
		var e = document.createElement(tag);
		if (cls) e.className = cls;
		if (text != null) e.textContent = text;
		return e;
	}
	function $id(id) { return document.getElementById(id); }
	function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }
	function isJa(s) { return /[぀-ヿ㐀-鿿]/.test(s); }
	function shuffle(a) {
		for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var x = a[i]; a[i] = a[j]; a[j] = x; }
		return a;
	}
	function speakBtn(text) {
		var b = el('button', 'speak');
		b.type = 'button';
		b.title = T('speak', '読み上げ');
		b.setAttribute('aria-label', b.title);
		b.appendChild(el('i', 'fas fa-volume-up'));
		b.addEventListener('click', function (e) { e.stopPropagation(); Speech.say(text); });
		return b;
	}
	function wordLink(w, cls) {
		var s = el('span', cls || 'w', w);
		s.tabIndex = 0;
		s.addEventListener('click', function () { lookup(w); });
		s.addEventListener('keydown', function (e) { if (e.key === 'Enter') lookup(w); });
		return s;
	}

	var q = $id('q'), suggest = $id('suggest'), home = $id('home'), entry = $id('entry');
	var current = null; // いま表示している見出し語
	var lookupSeq = 0;

	// ---------- タブ ----------
	function showPane(name) {
		document.querySelectorAll('.tabs .tab').forEach(function (b) { b.classList.toggle('active', b.dataset.pane === name); });
		document.querySelectorAll('.pane').forEach(function (p) { p.classList.toggle('active', p.id === 'pane-' + name); });
		if (name === 'dict') q.focus();
		if (name === 'book') renderBook();
		if (name === 'settings') renderVoiceStatus();
	}
	document.querySelectorAll('.tabs .tab').forEach(function (b) {
		b.addEventListener('click', function () { showPane(b.dataset.pane); });
	});

	// ---------- 開いた直後の画面（履歴と単語帳） ----------
	function chip(w, onRemove) {
		var li = el('li');
		li.appendChild(wordLink(w));
		if (onRemove) {
			var x = el('button', 'x', '×');
			x.type = 'button';
			x.title = T('remove', '削除');
			x.setAttribute('aria-label', x.title + ' ' + w);
			x.addEventListener('click', function (e) { e.stopPropagation(); onRemove(w); });
			li.appendChild(x);
		}
		return li;
	}
	function renderHome() {
		Store.history().then(function (h) {
			var ul = $id('history');
			clear(ul);
			h.forEach(function (w) { ul.appendChild(chip(w, function (x) { Store.removeHistory(x).then(renderHome); })); });
			$id('history-empty').hidden = h.length > 0;
			$id('history-clear').hidden = h.length === 0;
		});
		Store.book().then(function (b) {
			var ul = $id('home-book');
			clear(ul);
			b.slice(0, 30).forEach(function (x) { ul.appendChild(chip(x.w)); });
			$id('home-book-empty').hidden = b.length > 0;
		});
	}
	$id('history-clear').addEventListener('click', function () { Store.clearHistory().then(renderHome); });
	function goHome() {
		current = null;
		entry.hidden = true;
		home.hidden = false;
		renderHome();
	}

	// ---------- 候補 ----------
	var sel = -1, items = [];
	function closeSuggest() { suggest.hidden = true; sel = -1; items = []; }
	function paintSel() {
		Array.prototype.forEach.call(suggest.children, function (li, i) {
			li.classList.toggle('sel', i === sel);
			if (i === sel) li.scrollIntoView({ block: 'nearest' });
		});
	}
	function showSuggest(list) {
		clear(suggest);
		items = list;
		sel = -1;
		list.forEach(function (it) {
			var li = el('li');
			li.setAttribute('role', 'option');
			li.appendChild(el('span', 'w', it.w));
			if (it.m) li.appendChild(el('span', 'm', it.m));
			li.addEventListener('mousedown', function (e) { e.preventDefault(); lookup(it.w); });
			suggest.appendChild(li);
		});
		suggest.hidden = list.length === 0;
	}
	function short(m) { return String(m || '').split(' / ')[0].slice(0, 40); }
	var suggestSeq = 0;
	function updateSuggest() {
		var v = q.value, my = ++suggestSeq;
		var k = Dict.norm(v);
		if (!k) { closeSuggest(); return; }
		var p;
		if (isJa(v)) {
			p = Dict.reverse(v, 8).then(function (r) { return r.map(function (x) { return { w: x.w, m: x.term }; }); });
		} else if (/ /.test(k)) {
			p = Dict.load('idioms.json').then(function (list) {
				return (list || []).filter(function (r) { return r[0].toLowerCase().indexOf(k) === 0; }).slice(0, 8).map(function (r) { return { w: r[0], m: short(r[1]) }; });
			});
		} else {
			p = Dict.prefix(k, 8).then(function (rows) { return rows.map(function (r) { return { w: r[0], m: short(r[1]) }; }); });
		}
		p.then(function (list) { if (my === suggestSeq && q.value === v) showSuggest(list); });
	}
	q.addEventListener('input', function (e) { if (!e.isComposing) updateSuggest(); });
	q.addEventListener('compositionend', updateSuggest);
	q.addEventListener('keydown', function (e) {
		if (e.isComposing || e.keyCode === 229) return;
		if (e.key === 'ArrowDown' && !suggest.hidden) { e.preventDefault(); sel = Math.min(sel + 1, items.length - 1); paintSel(); }
		else if (e.key === 'ArrowUp' && !suggest.hidden) { e.preventDefault(); sel = Math.max(sel - 1, -1); paintSel(); }
		else if (e.key === 'Enter') {
			e.preventDefault();
			var w = sel >= 0 && items[sel] ? items[sel].w : q.value;
			if (Dict.norm(w)) lookup(w);
		} else if (e.key === 'Escape') {
			e.preventDefault();
			if (!suggest.hidden) closeSuggest();
			else if (q.value) { q.value = ''; goHome(); }
			else goHome();
		}
	});
	q.addEventListener('blur', function () { setTimeout(closeSuggest, 100); });

	// ---------- 引く ----------
	// 変化形の見出し（"goの過去" など）は原形の方を主に出す
	var FORM_REF = /^(.{1,30})の(過去分詞|過去|複数形?|比較級|最上級|三人称単数|現在分詞|-ing形)/;
	function isFormRef(rows) {
		return rows.length > 0 && rows.every(function (r) { return r[1].length < 40 && FORM_REF.test(r[1]); });
	}

	function lookup(raw) {
		var v = String(raw || '').trim();
		var k = Dict.norm(v);
		if (!k) return;
		closeSuggest();
		q.value = v;
		showPane('dict');
		var my = ++lookupSeq;
		if (isJa(v)) return renderReverse(v, my);
		Promise.all([Dict.rowsOf(k), Dict.bases(k)]).then(function (r) {
			if (my !== lookupSeq) return;
			var rows = r[0], bases = r[1];
			if (rows.length && !(bases.length && isFormRef(rows))) {
				return renderEntry(k, rows, { bases: bases }, my);
			}
			if (bases.length) {
				return Dict.rowsOf(bases[0]).then(function (br) {
					if (my !== lookupSeq) return;
					renderEntry(bases[0], br, { from: k, others: bases.slice(1) }, my);
				});
			}
			return renderNotFound(v, k, my);
		});
	}

	function startEntry() {
		home.hidden = true;
		entry.hidden = false;
		clear(entry);
		$id('dict-body').scrollTop = 0;
	}

	function renderNotFound(v, k, my) {
		startEntry();
		current = null;
		entry.appendChild(el('p', null, T('notFound', '「$1」は見つかりませんでした。', v)));
		var box = el('div', 'didyou');
		entry.appendChild(box);
		Dict.similar(k, 6).then(function (list) {
			if (my !== lookupSeq || !list.length) return;
			box.appendChild(el('span', 'muted small', T('didYouMean', 'もしかして：') + ' '));
			list.forEach(function (w) { box.appendChild(wordLink(w)); });
		});
		// 熟語の一部として含まれていれば出す
		Dict.idioms(k, k.split(' ')).then(function (list) {
			if (my !== lookupSeq || !list.length) return;
			entry.appendChild(idiomBlock(list.slice(0, 20), null));
		});
	}

	function renderReverse(v, my) {
		Dict.reverse(v, 30).then(function (list) {
			if (my !== lookupSeq) return;
			startEntry();
			current = null;
			entry.appendChild(el('h3', 'sec', T('reverseTitle', '「$1」の英語', v)));
			if (!list.length) entry.appendChild(el('p', null, T('notFound', '「$1」は見つかりませんでした。', v)));
			var ul = el('ul', 'revlist');
			list.forEach(function (x) {
				var li = el('li');
				li.appendChild(wordLink(x.w));
				li.appendChild(el('span', 'm', x.term));
				ul.appendChild(li);
			});
			entry.appendChild(ul);
			entry.appendChild(el('p', 'note-reverse', T('aboutReverse', '日本語からの検索は、英和辞書の訳語から引いた簡易的なもので、和英辞典ではありません。')));
		});
	}

	function verbRowOf(w) {
		for (var i = 0; i < VERBS.length; i++) {
			if (Lemma.verbCell(VERBS[i].gen).indexOf(w) >= 0) return VERBS[i];
		}
		return null;
	}
	var POS_KEY = { n: ['posN', '名詞'], v: ['posV', '動詞'], a: ['posA', '形容詞'], s: ['posA', '形容詞'], r: ['posR', '副詞'] };
	var INFL_KEY = {
		'3sg': ['infl3sg', '三単現'], past: ['inflPast', '過去'], pp: ['inflPP', '過去分詞'], ing: ['inflIng', '-ing'],
		irregular: ['inflIrregular', '過去・過去分詞'], pastpp: ['inflPastPP', '過去・過去分詞'],
		plural: ['inflPlural', '複数'], comp: ['inflComp', '比較級'], sup: ['inflSup', '最上級']
	};
	var GRADE = { '5': '5級', '4': '4級', '3': '3級', p2: '準2級', '2': '2級', p1: '準1級', '1': '1級' };

	function renderEntry(word, rows, opt, my) {
		startEntry();
		current = word;
		Store.pushHistory(word);
		var hw = rows[0] ? rows[0][0] : word;
		var ipa = '', grade = '';
		rows.forEach(function (r) { if (!ipa && r[2]) ipa = r[2]; if (!grade && r[3]) grade = r[3]; });

		// 見出し
		var head = el('div', 'entry-head');
		head.appendChild(el('span', 'hw', hw));
		if (ipa) {
			head.appendChild(el('span', 'ipa', '/' + ipa + '/'));
			head.appendChild(el('span', 'ipa-note', T('ipaUS', '米音')));
		}
		if (grade && GRADE[grade]) {
			var g = el('span', 'grade', T('grade_' + grade, '英検' + GRADE[grade]));
			g.title = T('gradeNote', '英検の級の目安');
			head.appendChild(g);
		}
		var tools = el('span', 'tools');
		tools.appendChild(speakBtn(hw));
		var star = el('button', 'star');
		star.type = 'button';
		star.appendChild(el('i', 'fas fa-star'));
		var paintStar = function (on) {
			star.classList.toggle('on', on);
			star.title = on ? T('bookRemove', '単語帳から外す') : T('bookAdd', '単語帳に追加');
			star.setAttribute('aria-label', star.title);
			star.setAttribute('aria-pressed', on ? 'true' : 'false');
		};
		Store.inBook(word).then(paintStar);
		star.addEventListener('click', function () {
			Store.toggleBook(word, rows.map(function (r) { return r[1]; }).join(' / ')).then(paintStar);
		});
		tools.appendChild(star);
		head.appendChild(tools);
		entry.appendChild(head);

		// どこから来たか（went → go）
		if (opt.from) {
			var via = el('p', 'via', T('viaForm', '「$1」の原形として表示しています。', opt.from) + ' ');
			(opt.others || []).forEach(function (b) { via.appendChild(wordLink(b)); });
			entry.appendChild(via);
		} else if (opt.bases && opt.bases.length) {
			var via2 = el('p', 'via', T('alsoBase', '原形：') + ' ');
			opt.bases.forEach(function (b) { via2.appendChild(wordLink(b)); });
			entry.appendChild(via2);
		}

		// 以下は読み込みが済んだ順に埋めるが、並び順は固定しておく
		var slots = {};
		['infl', 'senses', 'notes', 'ex', 'rel', 'idioms'].forEach(function (k) { slots[k] = el('div'); entry.appendChild(slots[k]); });

		// 意味（EJDict は " / " で語義を区切っている。品詞の印は持たない）
		var ol = el('ol', 'senses');
		rows.forEach(function (r) {
			var parts = r[1].split(' / ').map(function (s) { return s.trim(); }).filter(Boolean);
			if (!parts.length) { ol.appendChild(el('li', 'raw', r[1])); return; }
			parts.forEach(function (s) { ol.appendChild(el('li', null, s)); });
		});
		slots.senses.appendChild(ol);

		var forms = [word];
		Promise.all([Dict.wnOf(word), Dict.morph()]).then(function (r) {
			if (my !== lookupSeq) return;
			var wn = r[0], m = r[1];
			var pos = wn ? wn[0] : '';
			if (pos) {
				var pl = el('div', 'pos');
				var seen = {};
				pos.split('').forEach(function (p) {
					var kk = POS_KEY[p];
					if (!kk || seen[kk[0]]) return;
					seen[kk[0]] = 1;
					pl.appendChild(el('b', null, T(kk[0], kk[1])));
				});
				pl.title = 'WordNet';
				slots.infl.appendChild(pl);
			}
			var infl = Lemma.inflections(word, pos || '', m.rev, verbRowOf(word));
			if (infl.length) {
				var d = el('div', 'infl');
				infl.forEach(function (x) {
					var kk = INFL_KEY[x[0]] || [x[0], x[0]];
					d.appendChild(el('span', 'lab', T(kk[0], kk[1])));
					d.appendChild(el('span', 'f', x[1]));
					String(x[1]).split(/,\s*/).forEach(function (f) { if (f && !/ /.test(f)) forms.push(f.toLowerCase()); });
				});
				slots.infl.appendChild(d);
			}
			if (wn) slots.rel.appendChild(relBlock(wn));
			return Dict.examplesOf(word).then(function (ex) {
				if (my !== lookupSeq || !ex.length) return;
				slots.ex.appendChild(exBlock(ex, forms));
			});
		});

		Dict.notesOf(word).then(function (n) {
			if (my !== lookupSeq || !n) return;
			slots.notes.appendChild(notesBlock(n, forms));
		});

		Dict.idioms(word, [word]).then(function (list) {
			if (my !== lookupSeq || !list.length) return;
			slots.idioms.appendChild(idiomBlock(list, forms));
		});
	}

	function block(titleKey, def, extra) {
		var b = el('div', 'block');
		var h = el('h3', null, T(titleKey, def));
		if (extra) { h.appendChild(document.createTextNode(' ')); h.appendChild(extra); }
		b.appendChild(h);
		return b;
	}
	// 英文を語ごとに押せる形で並べ、見出し語（と変化形）を太字にする
	function sentence(en, forms) {
		var s = el('span', 'en');
		Lemma.tokenize(en).forEach(function (p) {
			if (!p.w) { s.appendChild(document.createTextNode(p.t)); return; }
			var lw = p.t.toLowerCase();
			var tok = el(forms && forms.indexOf(lw) >= 0 ? 'b' : 'span', 'tok', p.t);
			tok.addEventListener('click', function () { lookup(lw); });
			s.appendChild(tok);
		});
		return s;
	}
	function exLine(en, ja, forms, scene) {
		var p = el('div', 'ex');
		if (scene) p.appendChild(el('span', 'scene', scene));
		p.appendChild(sentence(en, forms));
		p.appendChild(speakBtn(en));
		if (ja) { p.appendChild(el('br')); p.appendChild(el('span', 'ja', ja)); }
		return p;
	}
	function exBlock(ex, forms) {
		var b = block('examples', '例文');
		ex.forEach(function (x) { b.appendChild(exLine(x[0], x[1], forms)); });
		b.appendChild(el('div', 'muted tiny', 'Tatoeba (CC BY 2.0 FR)'));
		return b;
	}
	function relBlock(wn) {
		var b = block('related', '類義語・反意語・派生語');
		var any = false;
		var syn = wn[1] || {};
		['v', 'n', 'a', 'r'].forEach(function (p) {
			if (!syn[p] || !syn[p].length) return;
			var line = el('div', 'rel');
			line.appendChild(el('span', 'lab', T('synonyms', '類義語') + '（' + T(POS_KEY[p][0], POS_KEY[p][1]) + '）'));
			syn[p].forEach(function (w) { line.appendChild(wordLink(w)); });
			b.appendChild(line);
			any = true;
		});
		[[2, 'antonyms', '反意語'], [3, 'derived', '派生語']].forEach(function (d) {
			var list = wn[d[0]] || [];
			if (!list.length) return;
			var line = el('div', 'rel');
			line.appendChild(el('span', 'lab', T(d[1], d[2])));
			list.forEach(function (w) { line.appendChild(wordLink(w)); });
			b.appendChild(line);
			any = true;
		});
		return any ? b : el('div');
	}
	var IDIOM_TOP = 5;
	function idiomBlock(list, forms) {
		var b = block('idioms', '熟語');
		var box = el('div');
		b.appendChild(box);
		function item(r) {
			var d = el('div', 'idiom');
			d.appendChild(wordLink(r[0], 'ph'));
			d.appendChild(speakBtn(r[0]));
			d.appendChild(el('div', 'mean', r[1]));
			(r[2] || []).slice(0, 2).forEach(function (x) { d.appendChild(exLine(x[0], x[1], (forms || []).concat(r[0].toLowerCase().split(' ')))); });
			return d;
		}
		list.slice(0, IDIOM_TOP).forEach(function (r) { box.appendChild(item(r)); });
		if (list.length > IDIOM_TOP) {
			var more = el('button', 'link more', T('more', 'もっと見る（$1）', String(list.length - IDIOM_TOP)));
			more.type = 'button';
			more.addEventListener('click', function () {
				list.slice(IDIOM_TOP).forEach(function (r) { box.appendChild(item(r)); });
				more.remove();
			});
			b.appendChild(more);
		}
		return b;
	}
	// AI が作った解説（data/notes）。項目が無いものは出さない
	function notesBlock(n, forms) {
		var badge = el('span', 'ai-badge', T('aiBadge', 'AI 作成'));
		var b = block('notesTitle', '解説', badge);
		var box = el('div', 'notes');
		if (n.core) box.appendChild(el('div', 'core', n.core));
		function list(title, def, arr, fn) {
			if (!arr || !arr.length) return;
			box.appendChild(el('h4', null, T(title, def)));
			var ul = el('ul');
			arr.forEach(function (x) { ul.appendChild(fn(x)); });
			box.appendChild(ul);
		}
		if (n.ex && n.ex.length) {
			box.appendChild(el('h4', null, T('notesEx', '場面別の例文')));
			n.ex.forEach(function (x) { box.appendChild(exLine(x[1], x[2], forms, x[0])); });
		}
		list('notesCol', 'よく使う組み合わせ', n.col, function (x) {
			var li = el('li');
			li.appendChild(el('b', null, x[0]));
			if (x[1]) li.appendChild(document.createTextNode('　' + x[1]));
			return li;
		});
		list('notesSyn', '似た語との違い', n.syn, function (x) {
			var li = el('li');
			li.appendChild(wordLink(x[0]));
			li.appendChild(document.createTextNode(x[1]));
			return li;
		});
		list('notesPara', '言い換え', n.para, function (x) {
			var li = el('li');
			li.appendChild(el('b', null, x[0]));
			li.appendChild(document.createTextNode(' ＝ '));
			li.appendChild(el('b', null, x[1]));
			if (x[2]) li.appendChild(document.createTextNode('（' + x[2] + '）'));
			return li;
		});
		list('notesErr', '間違えやすい点', n.err, function (x) { return el('li', null, x); });
		if (n.ety) { box.appendChild(el('h4', null, T('notesEty', '語源・覚え方'))); box.appendChild(el('div', null, n.ety)); }
		if (n.exam) { box.appendChild(el('h4', null, T('notesExam', '入試・英検で問われること'))); box.appendChild(el('div', null, n.exam)); }
		b.appendChild(box);
		return b;
	}

	// ---------- 単語帳 ----------
	var hideMean = false;
	function renderBook() {
		Store.book().then(function (b) {
			var ul = $id('book');
			clear(ul);
			ul.classList.toggle('hide-mean', hideMean);
			b.forEach(function (x) {
				var li = el('li');
				li.appendChild(wordLink(x.w));
				var m = el('span', 'm', x.m);
				li.appendChild(m);
				li.addEventListener('click', function (e) { if (e.target === li || e.target === m) li.classList.toggle('show'); });
				li.appendChild(speakBtn(x.w));
				var del = el('button', 'x');
				del.type = 'button';
				del.title = T('remove', '削除');
				del.setAttribute('aria-label', del.title + ' ' + x.w);
				del.appendChild(el('i', 'fas fa-trash-alt'));
				del.addEventListener('click', function () { Store.removeBook(x.w).then(renderBook); });
				li.appendChild(del);
				ul.appendChild(li);
			});
			$id('book-empty').hidden = b.length > 0;
			$id('book-count').textContent = b.length ? T('bookCount', '$1 語', String(b.length)) : '';
			$id('quiz-choice').disabled = b.length < 4;
			$id('quiz-choice').title = b.length < 4 ? T('quizNeed4', '4 語以上で使えます') : '';
		});
	}
	$id('quiz-hide').addEventListener('click', function () {
		hideMean = !hideMean;
		this.classList.toggle('active', hideMean);
		if (hideMean) {
			// 隠すときは並びも混ぜる
			Store.book().then(function () {
				var ul = $id('book');
				shuffle(Array.prototype.slice.call(ul.children)).forEach(function (li) { ul.appendChild(li); });
				ul.classList.add('hide-mean');
			});
		} else renderBook();
	});
	function firstSense(m) { return String(m).split(' / ').slice(0, 2).join(' / ').slice(0, 70); }
	$id('quiz-choice').addEventListener('click', function () {
		Store.book().then(function (b) {
			if (b.length < 4) return;
			var order = shuffle(b.slice()), i = 0, score = 0;
			var box = $id('quiz');
			box.hidden = false;
			function next() {
				clear(box);
				if (i >= order.length) {
					box.appendChild(el('div', 'quiz', T('quizDone', '終了：$1 問正解', score + ' / ' + order.length)));
					return;
				}
				var ans = order[i];
				var others = shuffle(b.filter(function (x) { return x.w !== ans.w; })).slice(0, 3);
				var opts = shuffle([ans].concat(others));
				var card = el('div', 'quiz');
				var qq = el('div', 'q', ans.w);
				qq.appendChild(speakBtn(ans.w));
				card.appendChild(qq);
				var ch = el('div', 'choices');
				var answered = false;
				opts.forEach(function (o) {
					var bt = el('button', 'btn btn-sm btn-outline-secondary', firstSense(o.m));
					bt.type = 'button';
					bt.addEventListener('click', function () {
						if (answered) return;
						answered = true;
						if (o.w === ans.w) score++; else bt.classList.add('ng');
						Array.prototype.forEach.call(ch.children, function (c, k) { if (opts[k].w === ans.w) c.classList.add('ok'); });
						nx.hidden = false;
						nx.focus();
					});
					ch.appendChild(bt);
				});
				card.appendChild(ch);
				var foot = el('div', 'foot');
				foot.appendChild(el('span', 'muted', (i + 1) + ' / ' + order.length));
				var nx = el('button', 'btn btn-sm btn-warning', T('quizNext', '次へ'));
				nx.type = 'button';
				nx.hidden = true;
				nx.addEventListener('click', function () { i++; next(); });
				foot.appendChild(nx);
				card.appendChild(foot);
				box.appendChild(card);
			}
			next();
		});
	});

	// ---------- 不規則動詞の表から辞典へ ----------
	document.querySelectorAll('.verb-look').forEach(function (ic) {
		ic.addEventListener('click', function (e) {
			e.stopPropagation();
			var row = tango.list[tango.num];
			var w = Lemma.verbCell(row[ic.dataset.col])[0] || Lemma.verbCell(row.gen)[0];
			if (w) lookup(w);
		});
	});

	// ---------- 設定 ----------
	function renderVoiceStatus() {
		Speech.ready(function () {
			var st = Speech.status();
			var p = $id('voice-status');
			p.textContent = st === 'none' ? T('voiceNone', 'この端末には英語の読み上げの声が入っていません。OS の設定で英語の音声を追加すると読み上げできます。')
				: st === 'other' ? T('voiceOther', '選んだ地域の声が無いため、ほかの英語の声で読み上げます。') : '';
			p.className = 'small mt-2' + (st === 'none' ? ' text-danger' : ' muted');
		});
	}
	function applySettings(s) {
		Speech.set(s);
		$id('accent-' + (s.accent === 'uk' ? 'uk' : 'us')).checked = true;
		$id('slow').checked = !!s.slow;
	}
	function saveSettings() {
		var s = { accent: $id('accent-uk').checked ? 'uk' : 'us', slow: $id('slow').checked };
		Speech.set(s);
		Store.saveSettings(s);
		renderVoiceStatus();
	}
	['accent-us', 'accent-uk', 'slow'].forEach(function (id) { $id(id).addEventListener('change', saveSettings); });
	$id('voice-test').addEventListener('click', function () { Speech.say('This is how I sound.'); });

	// ---------- キー操作：入力欄の外で Space / P を押すと見出し語を読む ----------
	document.addEventListener('keydown', function (e) {
		var tg = e.target;
		if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || tg.tagName === 'BUTTON' || tg.isContentEditable)) return;
		if (e.ctrlKey || e.metaKey || e.altKey) return;
		if ((e.key === ' ' || e.key === 'p' || e.key === 'P') && current && $id('pane-dict').classList.contains('active')) {
			e.preventDefault();
			var hw = entry.querySelector('.hw');
			Speech.say(hw ? hw.textContent : current);
		} else if (e.key === '/' && $id('pane-dict').classList.contains('active')) {
			e.preventDefault();
			q.focus();
			q.select();
		}
	});

	// 「ページ」タブ（page.js）から辞典を開くための口
	window.PopupApi = { lookup: lookup, showPane: showPane, el: el, clear: clear };

	// ---------- 起動 ----------
	Store.settings().then(applySettings);
	var params = new URLSearchParams(location.search);
	var initial = params.get('q');
	// win: 右クリックから開いた小窓・タブ／panel: サイドパネル（panel.html の中）。どちらも窓いっぱいに広げる
	if (params.get('win') || params.get('panel')) document.body.classList.add('window');
	if (params.get('panel')) document.body.classList.add('panel');
	if (initial) lookup(initial.slice(0, 100));
	else renderHome();
	q.focus();
})();
