var tango = {
	num: 0
	,list: [
		{ "text": "～です。である。", "gen": "be (am, is, are)", "kako": "was, were", "kakobun": "been" },
		{ "text": "～になる", "gen": "become", "kako": "became", "kakobun": "become" },
		{ "text": "始める", "gen": "begin", "kako": "began", "kakobun": "begun" },
		{ "text": "こわす", "gen": "break", "kako": "broke", "kakobun": "broken" },
		{ "text": "持ってくる", "gen": "bring", "kako": "brought", "kakobun": "brought" },

		{ "text": "建てる", "gen": "build", "kako": "built", "kakobun": "built" },
		{ "text": "買う", "gen": "buy", "kako": "bought", "kakobun": "bought" },
		{ "text": "つかまえる", "gen": "catch", "kako": "caught", "kakobun": "caught" },
		{ "text": "選ぶ", "gen": "choose", "kako": "chose", "kakobun": "chosen" },
		{ "text": "来る", "gen": "come", "kako": "came", "kakobun": "come" },

		{ "text": "切る", "gen": "cut", "kako": "cut", "kakobun": "cut" },
		{ "text": "する", "gen": "do, does", "kako": "did", "kakobun": "done" },
		{ "text": "描く", "gen": "draw", "kako": "drew", "kakobun": "drawn" },
		{ "text": "飲む", "gen": "drink", "kako": "drank", "kakobun": "drunk" },
		{ "text": "運転する", "gen": "drive", "kako": "drove", "kakobun": "driven" },

		{ "text": "食べる", "gen": "eat", "kako": "ate", "kakobun": "eaten" },
		{ "text": "落ちる", "gen": "fall", "kako": "fell", "kakobun": "fallen" },
		{ "text": "感じる", "gen": "feel", "kako": "felt", "kakobun": "felt" },
		{ "text": "戦う", "gen": "fight", "kako": "fought", "kakobun": "fought" },
		{ "text": "見つける", "gen": "find", "kako": "found", "kakobun": "found" },

		{ "text": "飛ぶ", "gen": "fly", "kako": "flew", "kakobun": "flown" },
		{ "text": "忘れる", "gen": "forget", "kako": "forgot", "kakobun": "forgotten" },
		{ "text": "得る", "gen": "get", "kako": "got", "kakobun": "got(ten)" },
		{ "text": "与える", "gen": "give", "kako": "gave", "kakobun": "given" },
		{ "text": "行く", "gen": "go", "kako": "went", "kakobun": "gone" },

		{ "text": "成長する", "gen": "grow", "kako": "grew", "kakobun": "grown" },
		{ "text": "持っている", "gen": "have, has", "kako": "had", "kakobun": "had" },
		{ "text": "聞く", "gen": "hear", "kako": "heard", "kakobun": "heard" },
		{ "text": "打つ", "gen": "hit", "kako": "hit", "kakobun": "hit" },
		{ "text": "つかむ", "gen": "hold", "kako": "held", "kakobun": "held" },

		{ "text": "保つ", "gen": "keep", "kako": "kept", "kakobun": "kept" },
		{ "text": "知っている", "gen": "know", "kako": "knew", "kakobun": "known" },
		{ "text": "横たえる", "gen": "lay", "kako": "laid", "kakobun": "laid" },
		{ "text": "去る", "gen": "leave", "kako": "left", "kakobun": "left" },
		{ "text": "貸す", "gen": "lend", "kako": "lent", "kakobun": "lent" },

		{ "text": "～させる", "gen": "let", "kako": "let", "kakobun": "let" },
		{ "text": "横になる", "gen": "lie", "kako": "lay", "kakobun": "lain" },
		{ "text": "失う", "gen": "lose", "kako": "lost", "kakobun": "lost" },
		{ "text": "作る", "gen": "make", "kako": "made", "kakobun": "made" },
		{ "text": "意味する", "gen": "mean", "kako": "meant", "kakobun": "meant" },

		{ "text": "会う", "gen": "meet", "kako": "met", "kakobun": "met" },
		{ "text": "支払う", "gen": "pay", "kako": "paid", "kakobun": "paid" },
		{ "text": "置く", "gen": "put", "kako": "put", "kakobun": "put" },
		{ "text": "読む", "gen": "read /ríːd/ リード", "kako": "read/rέd/ レッド", "kakobun": "read/rέd/ レッド" },
		{ "text": "乗る", "gen": "ride", "kako": "rode", "kakobun": "ridden" },

		{ "text": "鳴る", "gen": "ring", "kako": "rang", "kakobun": "rung" },
		{ "text": "上がる", "gen": "rise", "kako": "rose", "kakobun": "risen" },
		{ "text": "走る", "gen": "run", "kako": "ran", "kakobun": "run" },
		{ "text": "言う", "gen": "say", "kako": "said", "kakobun": "said" },
		{ "text": "見る", "gen": "see", "kako": "saw", "kakobun": "seen" },

		{ "text": "売る", "gen": "sell", "kako": "sold", "kakobun": "sold" },
		{ "text": "送る", "gen": "send", "kako": "sent", "kakobun": "sent" },
		{ "text": "輝く", "gen": "shine", "kako": "shone", "kakobun": "shone" },
		{ "text": "見せる", "gen": "show", "kako": "showed", "kakobun": "shown" },
		{ "text": "歌う", "gen": "sing", "kako": "sang", "kakobun": "sung" },

		{ "text": "沈む", "gen": "sink", "kako": "sank", "kakobun": "sunk" },
		{ "text": "すわる", "gen": "sit", "kako": "sat", "kakobun": "sat" },
		{ "text": "眠る", "gen": "sleep", "kako": "slept", "kakobun": "slept" },
		{ "text": "話す", "gen": "speak", "kako": "spoke", "kakobun": "spoken" },
		{ "text": "費やす", "gen": "spend", "kako": "spent", "kakobun": "spent" },

		{ "text": "立っている", "gen": "stand", "kako": "stood", "kakobun": "stood" },
		{ "text": "盗む", "gen": "steal", "kako": "stole", "kakobun": "stolen" },
		{ "text": "泳ぐ", "gen": "swim", "kako": "swam", "kakobun": "swum" },
		{ "text": "持っていく/連れていく", "gen": "take", "kako": "took", "kakobun": "taken" },
		{ "text": "教える", "gen": "teach", "kako": "taught", "kakobun": "taught" },

		{ "text": "話す", "gen": "tell", "kako": "told", "kakobun": "told" },
		{ "text": "思う/考える", "gen": "think", "kako": "thought", "kakobun": "thought" },
		{ "text": "投げる", "gen": "throw", "kako": "threw", "kakobun": "thrown" },
		{ "text": "理解する", "gen": "understand", "kako": "understood", "kakobun": "understood" },
		{ "text": "目を覚ます", "gen": "wake", "kako": "woke (waked)", "kakobun": "waken (waked)" },

		{ "text": "身につける", "gen": "wear", "kako": "wore", "kakobun": "worn" },
		{ "text": "勝つ", "gen": "win", "kako": "won", "kakobun": "won" },
		{ "text": "書く", "gen": "write", "kako": "wrote", "kakobun": "written" },
	]
	,init: function() {
		$(".text").html(tango.list[tango.num].text);
		$(".pager .now").html("1");
		$(".pager .total").html(this.list.length);

		$(".next").on("click", this.next);
		$(".prev").on("click", this.prev);
		$(".random").on("click", this.random);

		$("dd.gen").on("click", this.turnGen);
		$("dd.kako").on("click", this.turnKako);
		$("dd.kakobun").on("click", this.turnKakobun);
	}
	,next: function() {
		if(tango.list.length <= parseInt(tango.num + 1)) {
			tango.num = parseInt(tango.list.length - 1);
			return tango.reset();
		}

		tango.num++;
		$(".text").html(tango.list[tango.num].text);
		$(".pager .now").html(parseInt(tango.num + 1));
		tango.reset();
	}
	,prev: function() {
		if(tango.num <= 0) {
			tango.num = 0;
			return tango.reset();
		}
		tango.num--;
		$(".text").html(tango.list[tango.num].text);
		$(".pager .now").html(parseInt(tango.num + 1));
		tango.reset();
	}
	,random: function() {
		tango.num = Math.floor(Math.random() * tango.list.length);
		$(".text").html(tango.list[tango.num].text);
		$(".pager .now").html(parseInt(tango.num + 1));
		tango.reset();
	}
	,reset: function() {
		$("dd span").html("-");
	}
	,turnGen: function() {
		$("dd.gen span").html(tango.list[tango.num].gen);
	}
	,turnKako: function() {
		$("dd.kako span").html(tango.list[tango.num].kako);
	}
	,turnKakobun: function() {
		$("dd.kakobun span").html(tango.list[tango.num].kakobun);
	}
}
$(function() {
	tango.init();
});
