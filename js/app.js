var tango = {
	num: 0
	,list: VERBS
	// 意味は画面の言語で出す（拡張の外では日本語のまま）
	,text: function() {
		var k = "v" + String(tango.num + 1).padStart(2, "0");
		var s = t(k);
		return s !== k ? s : tango.list[tango.num].text;
	}
	,init: function() {
		$(".text").html(tango.text());
		$(".pager .now").html("1");
		$(".pager .total").html(this.list.length);

		$(".next").on("click", this.next);
		$(".prev").on("click", this.prev);
		$(".random").on("click", this.random);
		$(".spegen").on("click", this.spegen);
		$(".spekako").on("click", this.spekako);
		$(".spekakobun").on("click", this.spekakobun);

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
		$(".text").html(tango.text());
		$(".pager .now").html(parseInt(tango.num + 1));
		tango.reset();
	}
	,prev: function() {
		if(tango.num <= 0) {
			tango.num = 0;
			return tango.reset();
		}

		tango.num--;
		$(".text").html(tango.text());
		$(".pager .now").html(parseInt(tango.num + 1));
		tango.reset();
	}
	,random: function() {
		tango.num = Math.floor(Math.random() * tango.list.length);
		$(".text").html(tango.text());
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
	,lang: 'en-US'
	,spegen: function(e) {
		if (e) e.stopPropagation();
		Speech.say(tango.list[tango.num].gen);
	}
	,spekako: function(e) {
		if (e) e.stopPropagation();
		Speech.say(tango.list[tango.num].kako);
	}
	,spekakobun: function(e) {
		if (e) e.stopPropagation();
		Speech.say(tango.list[tango.num].kakobun);
	}
}
$(function() {
	tango.init();
});
