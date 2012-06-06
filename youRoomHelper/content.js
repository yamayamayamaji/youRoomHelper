/**
 * [C]ontent [S]cripts util function
 */
$CS = {
	getManifest: function(callback){
		var url = chrome.extension.getURL('/manifest.json');
		var xhr = new XMLHttpRequest();
		xhr.onload = function(){
			callback(JSON.parse(xhr.responseText));
		};
		xhr.open('GET',url,true);
		xhr.send(null);
	}
};

STORE_KEY = {
	MEETING_MODE: 'meeting_mode',
	PREV_VERSION: 'prev_version',
	VERSION_CONFIRMED: 'version_confirmed'
};

youRoomHelper = {
	/**
	 * 初期処理
	 */
	init: function(){
		this.retryMgr.init();

		//Facebookガジェットを非表示にする
		$('.social-gadget').remove();

		//Shift + Enter で投稿できるようにする
		$('.entry_content').live('keydown', function(e){
			if (e.keyCode == 13 && e.shiftKey) {
				$(this).closest('form').find('input:submit').get(0).click();
				e.preventDefault();
			}
		});

		//ミーティングモードを使用できるようにする
		this.meetingModeMgr.init();

		//バージョン更新確認
		if (sessionStorage[STORE_KEY.VERSION_CONFIRMED] != 'true') {
			this.versionMgr.init();
		}
	},

	/**
	 * ミーティングモード管理
	 */
	meetingModeMgr: {
		INTERVAL: 3000,
		entryQueue: [],
		lastEntryTimestamp: '',
		//初期化
		init: function(){
			var matches;

			//ミーティングモード用移動ボタンを表示
			//(ホーム画面)
			if (location.pathname.match(/^\/*$/)) {
				//ホーム画面では読み込みを待ちながらリトライする
				youRoomHelper.retryMgr.reg(
					function(){ return $('.entry-container').length; },
					this.addMeetingBtn, this);
			} else {
				this.addMeetingBtn();
			}

			//ミーティングモード起動条件が揃っていればミーティングを起動
			if (sessionStorage[STORE_KEY.MEETING_MODE] == 'on' &&
					(matches = location.pathname.match(/r\/([^\/]+)\/entries\/([^\/]+)/))) {
				this.roomId = matches[1];
				this.entryId = matches[2];
				this.boot();
			} else {
				this.end();
			}
		},

		//ミーティングモード用移動ボタンを追加
		addMeetingBtn: function(){
			var imgUrl = chrome.extension.getURL('/images/meeting.png');
			$('.entry-container').find('.topic-edit-actions').each(function(){
				var $this = $(this), c;
				c = $this.find('.btn-edit').closest('li').clone();
				c.find('a')
					.removeClass('edit_comment')
					.css({backgroundImage: 'url(' + imgUrl + ')'})
					.find('span').text('ミーティング')
					.click(function(){
						sessionStorage[STORE_KEY.MEETING_MODE] = 'on';
					});
				c.appendTo($this);
			});
		},

		//ミーティングモード起動
		boot: function(){
			//cssクラス追加
			var ss = $('<style type="text/css">').appendTo('head').get(0).sheet;
			ss.insertRule('@-webkit-keyframes fadeOut {0% {opacity: 1;} 100% {opacity: 0;}}', 0);
			ss.insertRule('.fadeOut {-webkit-animation-name: fadeOut; -webkit-animation-fill-mode: both; -webkit-animation-duration: 3s; -webkit-animation-delay: 30s;}', 1);

			this.getNewEntries();
		},

		//ミーティングモード終了
		end: function(){
			if (this.timer) { clearTimeout(this.timer); }
			sessionStorage.removeItem[STORE_KEY.MEETING_MODE];
		},

		//新規エントリーを取得
		getNewEntries: function(){
			$.getJSON('/r/' + this.roomId,
				{
					since: this.lastEntryTimestamp,
					read_state:'',
					flat: 'true'
				},
				$.proxy(this.handleNewEntries, this)
			);
			this.timer = setTimeout($.proxy(this.getNewEntries, this), this.INTERVAL);
		},

		//新規エントリー取得コールバック
		handleNewEntries: function(newEntries){
			var i, entry, entryObj;
			for (i=0; entryObj=newEntries[i++];) {
				entry = entryObj.entry;
				//取得したエントリーの中で最終のもののタイムスタンプを記憶
				if (entry.updated_at > this.lastEntryTimestamp) {
					this.lastEntryTimestamp = entry.updated_at;
				}
				//既に表示されているエントリーまたは別ルームのエントリーはスルー
				if ($('#entry_' + entry.id).length || entry.root_id != this.entryId) {
					continue;
				} else {
					this.entryQueue.push(entry);
				}
			}
			//表示対象となるエントリーがあれば表示する
			if (this.entryQueue) {
				//古い順に並び替え
				this.entryQueue.sort(function(e1, e2){
					var p = e1.updated_at,
						q = e2.updated_at;
					return (p > q) ? 1 : (p == q) ? 0 : -1;
				});
				this.showEntries();
			}
		},

		//エントリーを表示
		showEntries: function(){
			if (!this.entryQueue.length) { return; }
			//現在のルーム・エントリーのhtmlを取得
			$.get('/r/' + this.roomId + '/entries/' + this.entryId + '/',
				$.proxy(function(res){
					var entry;
					res = res.replace(/<(script|style|title)[^<]+<\/(script|style|title)>/gm,'').replace(/<(link|meta)[^>]+>/g,'');
					this.$entryDom = $(res)/*.find('#contents-container')*/.find('#column1');
					while (entry = this.entryQueue[0]) {
						if (this.$entryDom.find('#entry_' + entry.id).length) {
							this.entryQueue.shift();
							this.showEntry(entry);
						}
						this.markAsUnread(entry);
					}
				}, this),
				'html'
			);
		},

		//エントリーを表示(1件毎)
		showEntry: function(entry){
			var containerSelector = '.comment-container';
			var $newContainer = this.$entryDom.find('#entry_' + entry.id).closest(containerSelector);
			var $oldContainer = $('#' + $newContainer.find('.comment-wrapper-lv1[id^=entry]').attr('id')).closest(containerSelector);
			$oldContainer.remove();
			$newContainer.hide().insertBefore($(containerSelector + ':last')).fadeIn(2500);
		},

		//エントリーに未読マークを表示
		markAsUnread: function(entry){
			var c = $('#entry_' + entry.id).find('.comment-parag .clearfix');
			$('<span class="unread-comment-dot">').addClass('fadeOut').prependTo(c);
		},
	},

	/**
	 * バージョン管理
	 */
	versionMgr: {
		//初期化
		init: function(){
			this.prevVer = localStorage[STORE_KEY.PREV_VERSION];
			$CS.getManifest($.proxy(function(manifest){
				this.curVer = manifest.version;
				if (this.isUpdated()) {
					this.notifyUpdate();
					this.updatePrevVersion();
				}
			}, this));
			sessionStorage[STORE_KEY.VERSION_CONFIRMED] = 'true';
		},
		//アップデートされているか
		isUpdated: function(){
			return (!this.prevVer || (this.prevVer != this.curVer));
		},
		//以前のバージョンとして記録している情報を更新
		updatePrevVersion: function(){
			localStorage[STORE_KEY.PREV_VERSION] = this.curVer;
		},
		//更新されたのを通知
		notifyUpdate: function(){
			var txt = 'youRoomHelper was upgraded to ' + this.curVer + ' (from ' + this.prevVer + ')... ';
			var path = chrome.extension.getURL('/updates.html');
			var anc = $('<a href="#" onclick="window.open(\'' + path + '\')">show details</a>').addClass('sc_ttl_sat');
			$('<div>').text(txt).append(anc)
			.css({
				fontSize: '12px',
				margin: '5px 0 5px 0',
				minHeight: '40px',
				padding: '10px',
				textAlign: 'left'
			}).appendTo($('#column3') || $(document.body || document.frames[0]));
		}
	},

	/**
	 * リトライ管理
	 */
	retryMgr: {
		//初期化
		init: function(){
			this.key = 1;
			this.cnt = {};
			this.max = { def: 10 };
		},
		//リトライ回数カウントアップ
		countUp:  function(key){
			return (++this.cnt[key] || (this.cnt[key] = 1));
		},
		//最大リトライ回数に達していないか
		unreachedToMax: function(key){
			return (this.cnt[key] || 0) < (this.max[key] || this.max.def);
		},
		//リトライ対象として登録する
		reg: function(condition, fnc, context){
			this.retry(this.key++, condition, fnc, context);
		},
		//リトライ実行
		retry: function(key, condition, fnc, context){
			var judgment;
			try {
				judgment = $.isFunction(condition) ? condition() : eval(condition);
			} catch (e) { judgment = false; }

			if (judgment) {
				fnc.call(context);
			} else {
				if (this.unreachedToMax(key)) {
					this.countUp(key);
					setTimeout($.proxy(function(){
						return this.retry(key, condition, fnc, context);
					}, this), 300);
				}
				return;
			}
		}
	}
};

$(function(){youRoomHelper.init()});
