/*!
 * content.js
 * in youRoomHelper (Google Chrome Extension)
 * https://github.com/yamayamayamaji/youRoomHelper
 * Copyright 2012, Ryosuke Yamaji
 *
 * License: MIT
 */

youRoomHelperCS = {
	/**
	 * localStorage・sessionStorageに使用しているkey
	 */
	storeKey: {
		MEETING_MODE: 'yrh.meeting_mode'
	},

	/**
	 * 初期処理
	 */
	init: function(){
		this.retryMgr.init();

		chrome.extension.sendMessage(
			{
				require: ['settings'],
				task: ['showPageAction', 'notifyIfUpgraded']
			},
			function(res){
				var s = res.settings;
				if (s) { this.settings = s; }

				//ソーシャルガジェットを非表示にする
				if (s.hideSocialGadget) {
					this.hideSocialGadgets();
				}
				//Shift + Enter で投稿できるようにする
				if (s.enableShiftEnterPost) {
					this.enableShiftEnterPost();
				}
				//ミーティングモードを使用できるようにする
				if (s.enableMeetingMode) {
					this.meetingModeMgr.ready();
				}
			}.bind(this)
 		);
	},

	/**
	 * ソーシャルガジェットを非表示にする
	 */
	hideSocialGadgets: function(){
		//Facebookガジェットを非表示にする
		$('.social-gadget').remove();
	},

	/**
	 * Shift + Enter で投稿できるようにする
	 */
	enableShiftEnterPost: function(){
		$('#column1, #cluetip').on('keydown', '.entry_content', function(e){
			if (e.keyCode == 13 && e.shiftKey) {
				$(this).closest('form').find('input.count_submit').get(0).click();
				e.preventDefault();
			}
		});
	},

	/**
	 * ミーティングモードマネージャ
	 * @type {Object}
	 */
	meetingModeMgr: {
		INTERVAL: 3000,
		owner: {}, //readyの中でyouRoomHelperCSをセット
		newCommentQueue: [],
		lastCommentTimestamp: '',
		unreadCommentIds: [],
		readingCommentId: null,
		readingArea: {
			topMargin: 5,
			bottomMargin: 100
		},
		HAS_MEETINGBTN_CLS: 'has-meetingbtn',
		READING_CLS: 'now-reading',
		HAS_READ_CLS: 'has-read',
		UNREAD_MARK_CLS: 'unread-comment-dot',
		/**
		 * ミーティングモードを使用できるようにする為の初期設定
		 */
		ready: function(){
			var matches;
			this.owner = youRoomHelperCS;
			this.MEETING_MODE_KEY = this.owner.storeKey.MEETING_MODE;

			//ミーティングモード用移動ボタンを表示
			//(ホーム画面)
			if (location.pathname.match(/^\/*$/)) {
				//ホーム画面ではajaxで内容が読み込まれるのを待ちながらリトライする
				this.owner.retryMgr.reg(
					function(){ return $('.entry-container').length; },
					this.addMeetingBtn, this);
			} else {
				// this.addMeetingBtn();
				var self = this;
				$('#entries-container').on('mouseenter',
					'.entry-container:not(.has-meetingbtn)',
					function(){ self.addMeetingBtn(this); });
			}

			//ミーティングモード起動条件が揃っていればミーティングを起動
			//(リロードしてもミーティングモードを継続する為)
			if (sessionStorage[this.MEETING_MODE_KEY] == 'on' &&
					(matches = location.pathname.match(/r\/([^\/]+)\/entries\/([^\/]+)/))) {
				this.roomId = matches[1];
				this.entryId = matches[2];
				this.boot();
			} else {
				this.end();
			}
		},

		/**
		 * ミーティングモード用移動ボタンを追加
		 */
		addMeetingBtn: function(container){
			var imgUrl = chrome.extension.getURL('/images/meeting.png'),
				storeKey = this.MEETING_MODE_KEY,
				$ctn = container ? $(container) : $('.entry-container');
			$ctn.each(function(){
				var $this = $(this),
					entryRoom = $this.find('[name=parma_url]').val(),
					$ul = $('<ul class="topic-edit-actions"><li><p class="btn-edit">' +
							'<a href="' + entryRoom + '"><span>ミーティング</span></a>'),
					$a = $ul.find('a')
						.css({backgroundImage: 'url(' + imgUrl + ')'})
						.click(function(){
							sessionStorage[storeKey] = 'on';
						});
				$this.addClass('has-meetingbtn')
					.find('.action-wrapper').prepend($ul);
			});
		},

		/**
		 * ミーティングモード起動(ミーティングモード初期処理)
		 */
		boot: function(){
			var self = this;
			//cssルール追加
			$('<link rel="stylesheet" type="text/css">')
				.attr('href', chrome.extension.getURL('meeting.css'))
				.insertAfter('link:last');

			//pageActionアイコンを変更
			chrome.extension.sendMessage(
				{task: [{key: 'changePageAction', type: 'meeting'}]}, $.noop);

			//windowにイベントリスナを登録
			//(windowに触ったら(scroll,mousedown,keyup)未読コメント表示状態をチェック)
			$(window).on('scroll mousedown keyup', function(){
				self.manageUnreadComments();
			});

			//新着コメント一覧取得
			this.getNewComments();
		},

		/**
		 * ミーティングモード終了
		 */
		end: function(){
			$(window).off('touch');
			if (this.timer) { clearTimeout(this.timer); }
			sessionStorage.removeItem(this.MEETING_MODE_KEY);
			//pageActionアイコンを変更
			chrome.extension.sendMessage(
				{task: [{key: 'changePageAction', type: 'def'}]}, $.noop);
		},

		/**
		 * 新着コメント一覧情報を取得
		 * (ミーティングモード中、一定間隔で繰り返す)
		 */
		getNewComments: function(){
			$.getJSON('/r/' + this.roomId,
				{
					since: this.lastCommentTimestamp,
					read_state:'',
					flat: 'true'
				},
				this.handleNewComments.bind(this)
			);
			this.timer = setTimeout(this.getNewComments.bind(this), this.INTERVAL);
		},

		/**
		 * 新着コメント一覧情報取得コールバック
		 * @param  {array of EntryObj(youRoomAPIのレスポンス)} newEntries 新着コメント一覧情報
		 */
		handleNewComments: function(newEntries){
			var i, comment, entryObj, url;
			for (i = 0; entryObj = newEntries[i++];) {
				comment = entryObj.entry;
				//取得したコメントの中で最終のもののタイムスタンプを記録
				if (comment.updated_at > this.lastCommentTimestamp) {
					this.lastCommentTimestamp = comment.updated_at;
				}
				//既に表示されているコメントまたは別ルームのコメントはスルー
				if ($('#entry_' + comment.id).length || comment.root_id != this.entryId) {
					continue;
				} else {
					this.newCommentQueue.push(comment);
				}
			}
			//表示対象となる新着コメントがあれば内容を読み込んで表示する
			if (this.newCommentQueue.length) {
				//表示対象コメントキューを古い順に並び替え
				this.newCommentQueue.sort(function(e1, e2){
					var p = e1.updated_at,
						q = e2.updated_at;
					return (p > q) ? 1 : (p == q) ? 0 : -1;
				});

				//現在のルーム・エントリーのhtmlを取得
				var url = '/r/' + this.roomId + '/entries/' + this.entryId + '/';
				$.when($.ajax({url: url, dataType: 'html'}))
					.then(this.coordinateComments.bind(this));
			}
		},

		/**
		 * コメントを剪定して表示する
		 * (ajaxで読み込んだ最新のエントリーツリーから新着コメントを切り貼りする)
		 * @param  {string} currentEntryHtml ミーティング中エントリースレッドの現在のHTML文字列
		 */
		coordinateComments: function(currentEntryHtml){
			if (!this.newCommentQueue.length) { return; }
			var i, $entryDom, comment, commentId;
			//不要部分を大まかに剪定
			currentEntryHtml = currentEntryHtml
					.replace(/<(script|style|title)[^<]+<\/(script|style|title)>/gm,'')
					.replace(/<(link|meta)[^>]+>/g,'');
			//エントリーツリー部分だけのDocumentFragmentを作成
			$entryDom = $(currentEntryHtml).find('#column1');
			for (i = 0; comment = this.newCommentQueue[i++];) {
				commentId = 'entry_' + comment.id;
				if ($entryDom.find('#' + commentId).length) {
					//コメントを描画
					if (this.renderComment(commentId, $entryDom)) {
						//新規コメントキューから消す
						this.newCommentQueue.shift();
						//未読コメントキューに追加
						this.unreadCommentIds.push(commentId);
						//新着コメント有りの通知エフェクト
						this.notifyNewCommentExist(commentId);
					}
				}
			}
			$entryDom = null;
		},

		/**
		 * コメントを描画(1件毎)
		 * @param  {string} commentId コメントID
		 * @param  {DocumentFragment} newContentsDom 新規コメントを含むDocumentFragment
		 * @return {boolean} 描画したかどうか
		 */
		renderComment: function(commentId, newContentsDom){
			const CONTAINER_SELECTOR = '.comment-container';
			var $newContainer = $(newContentsDom).find('#' + commentId)
									.closest(CONTAINER_SELECTOR),
				wrapperId = $newContainer.find('.comment-wrapper-lv1[id^=entry]')
									.attr('id'),
				$oldContainer = $('#' + wrapperId).closest(CONTAINER_SELECTOR),
				unreadComments = [], $focused;
			//描画しようとしているコメントコンテナが既に表示されているコメントコンテナ
			//(=新規コメントが既存コメントに対するコメント)の場合、
			//既に表示されているコメントコンテナを削除する
			if ($oldContainer.length) {
				//削除しようとしているコメントコンテナ配下にコメントを入力中
				//またはコメントリーディング中の場合は描画処理を延期
				$focused = $(document.activeElement).filter(':focus');
				if ($focused.length &&
						$focused.closest(CONTAINER_SELECTOR).get(0) === $oldContainer.get(0) ||
						$oldContainer.find('.' + this.READING_CLS).length) {
					return false;
				}
				//削除しようとしているコメントコンテナ配下に未読マークがあれば記憶しておき
				//描画しなおしたコメントにマーキングし直す
				$oldContainer.find('.' + this.UNREAD_MARK_CLS).each(function(){
					unreadComments.push($(this).closest('.comment-wrapper').attr('id'));
				});

				$oldContainer.remove();
			}
			//コメント描画
			$newContainer.hide()
				.insertBefore($(CONTAINER_SELECTOR + ':last')).fadeIn(2500);
			//未読マーク継承
			if (unreadComments.length) {
				this.markAsUnread(unreadComments);
			}

			return true;
		},

		/**
		 * 新着コメントがあることを通知
		 * @param  {string} commentId コメントID
		 */
		notifyNewCommentExist: function(commentId){
			//当該コメントに未読マークを付加
			this.markAsUnread(commentId);
			//未読件数バッジを更新
			this.updateUnreadBadge();
		},

		/**
		 * コメントに未読マークを表示
		 * @param  {string|array} commentId コメントID
		 */
		markAsUnread: function(commentId){
			if (!$.isArray(commentId)) { commentId = [commentId]; }
			for (var i = 0, cid; cid = commentId[i++];) {
				var $container = $('#' + cid).find('.comment-parag .clearfix').first();
				$('<span class="' + this.UNREAD_MARK_CLS + '">').prependTo($container);
			}
		},

		/**
		 * 未読件数バッジを更新
		 */
		updateUnreadBadge: function(){
			if (!this.unreadBadge) {
				this.unreadBadge = $('<span id="yrhUnreadBadge" class="unreadBadge">')
									.text('0').appendTo('body');
 			}
			const EFE_INCREASE = 'bounceIn',
					EFE_DECREASE = 'bounceOut',
					EFFECTS = EFE_INCREASE + ' ' + EFE_DECREASE;
			var badge = this.unreadBadge,
				bef = badge.text(),
				aft = this.unreadCommentIds.length,
				effect;
			//未読件数が増えた時
			if (aft > bef) {
				badge.text(aft)
					.removeClass(EFFECTS).addClass(EFE_INCREASE)
					.one('webkitAnimationEnd', function(){
						$(this).removeClass(EFE_INCREASE);
					});
			//未読件数が減った時
			} else {
				badge.removeClass(EFFECTS).addClass(EFE_DECREASE)
					.one('webkitAnimationEnd', function(){
						badge.text(aft ? aft : '');
						$(this).removeClass(EFE_DECREASE);
					});
			}
 		},

		/**
		　*　コメントが読める状態かどうか
		　*　(コメントが一定範囲内に入っているか)
		 * @param  {string} commentId コメントID
		 * @return {boolean} コメントが読める状態かどうか
		 */
		isCommentReadable: function(commentId){
			var commentElm = $('#' + commentId).get(0),
				rect = commentElm.getBoundingClientRect(),
				areaTop = this.readingArea.topMargin,
				areaBottom = $(window).height() - this.readingArea.bottomMargin;
			//コメント要素のトップかボトムがリーディングエリア内にあればOK
			return (rect.top > areaTop && rect.top < areaBottom ||
					rect.bottom > areaTop && rect.bottom < areaBottom);
		},

		/**
		 * 未読コメントの管理
		 */
		manageUnreadComments: function(){
			//あるコメントを読んでいる間は何もしない
			if (this.readingCommentId) { return; }
			var commentIds = this.unreadCommentIds,
				i, cid, $c, rect;
			for (i = 0; cid = commentIds[i++];) {
				$c = $('#' + cid);
				//コメントがリーディング中・読了後でなく、画面の一定範囲内に入っていれば
				//読み始め処理開始
				if (!$c.hasClass(this.READING_CLS) &&
						!$c.hasClass(this.HAS_READ_CLS) &&
						this.isCommentReadable(cid)) {
					this.startReading(cid);
					break;
				}
			}
		},

		/**
		 * コメント読み始め
		 * @param  {string} commentId コメントID
		 */
		startReading: function(commentId){
			var $comment = $('#' + commentId),
				commentLen = $comment.find('.content').text().length;
			//リーディング中マーキング
			$comment.addClass(this.READING_CLS);
			this.readingCommentId = commentId;
			//9文字/秒として読了までの時間を設定(ただし最短2秒とする)
			this.countDownReadTime(commentId, Math.max(Math.ceil(commentLen / 12), 2));
		},

		/**
		 * コメントリーディング時間カウントダウン
		 * @param  {string}  commentId コメントID
		 * @param  {integer} remain    残り秒数
		 */
		countDownReadTime: function(commentId, remain){
			//読了
			if (remain <= 0) {
				this.finishReading(commentId);
			//リーディング中
			} else if (this.isCommentReadable(commentId)) {
				setTimeout(this.countDownReadTime.bind(this, commentId, --remain), 1000);
			//リーディング破棄
			} else {
				this.abortReading(commentId);
			}
		},

		/**
		 * コメントリーディング中断
		 * @param  {string}  commentId コメントID
		 */
		abortReading: function(commentId){
			$('#' + commentId).removeClass(this.READING_CLS);
			this.readingCommentId = null;
		},

		/**
		 * コメント読了
		 * @param  {string}  commentId コメントID
		 */
		finishReading: function(commentId){
			//リーディング中・読了cssクラスの付替と未読マークの削除
			$('#' + commentId).removeClass(this.READING_CLS)
				.addClass(this.HAS_READ_CLS)
				.find('.' + this.UNREAD_MARK_CLS).first()
				.addClass('fadeOut')
				.one('webkitAnimationEnd', function(){
					$(this).remove();
				});
			//未読コメントキューから削除
			for (var i = 0, cid; cid = this.unreadCommentIds[i++];) {
				if (cid == commentId) {
					this.unreadCommentIds.splice(i - 1, 1);
				}
			}
			this.readingCommentId = null;
			//未読件数バッジを更新
			this.updateUnreadBadge();
		}
	},

	/**
	 * リトライマネージャ
	 * @type {Object}
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
					setTimeout(function(){
						return this.retry(key, condition, fnc, context);
					}.bind(this), 300);
				}
				return;
			}
		}
	}
};

$(function(){youRoomHelperCS.init()});
