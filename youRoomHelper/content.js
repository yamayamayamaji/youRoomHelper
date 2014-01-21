/*!
 * content.js
 * in youRoomHelper (Google Chrome Extension)
 * https://github.com/yamayamayamaji/youRoomHelper
 * Copyright, Ryosuke Yamaji
 *
 * License: MIT
 */
"use strict";
var youRoomHelper = {
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
		this.roomColorMgr.init();

		chrome.extension.sendMessage(
			{
				require: ['settings'],
				task: ['showPageAction', 'notifyIfUpgraded']
			},
			function(res){
				var s = res.settings;

				if (s) { this.settings = s; }
				//オプション設定の内容にあわせて機能をOn/Off
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

				//新着コメントがある場合は通知する
				this.newCommentsObserver.start();
			}.bind(this)
 		);

		//トピックurlをワンクリックでコピーできるようにする
		this.topicUrlOneClickCopy.enable();

//		//検索結果画面で元スレッドへのリンクにアイコンを追加する
//		if (this.isLocating('search')) {
//			this.iconizeThreadLink();
//		}
		//スレッドへのリンクにアイコンを追加する
		this.iconizeThreadLink();

		//ブラウザ内プレビューボタンを作成する
		setTimeout(function(){
			this.appendStyleSheet('/css/content.css')
			this.setupPreviewOnBrowserBtn();
		}.bind(this), 1);
	},

	/**
	 * ブラウザ内プレビューボタン設定
	 */
	setupPreviewOnBrowserBtn: function(){
		//ボタンイベントリスナ
		$(document.body).on('click', '.preview-on-browser',
								this.clickPreviewOnBrowserBtn.bind(this));
		//ボタン表示エフェクト
		$(document.body).on({
			mouseenter: function(){
				if (!$(this).find('.preview-on-browser').length) {
					youRoomHelper.createPreviewOnBrowserBtn();
				}
				$(this).find('.preview-on-browser').css('display', 'inline-block');
			},
			mouseleave: function(){
				$(this).find('.preview-on-browser').css('display', '');
			}
		}, '.attachment_wrapper:has(.attach_file_link)');
	},

	/**
	 * ブラウザ内プレビューボタン作成
	 */
	createPreviewOnBrowserBtn: function(){
		var $fileLinks = $('.attach_file_link'),
			isOfficeViewerInstalled, fileExtExp, regfileExt;
		//OfficeViewerがインストールされているか調べる
		try {
			$.ajax({
				async: false,
				timeout: 1000,
				type: 'HEAD',
				//Chrome Office Viewer (Beta)
				url: "chrome-extension://gbkeegbaiigmenfmjfclcdgdpimamgkj/views/qowt.html"
			}).done(function(){
				isOfficeViewerInstalled = true;
			});
		} catch (e) { /*ignore*/ };

		fileExtExp = 'txt|html?|xml|css|js|pdf|jpg|gif|png';
		//OfficeViewerがインストールされている場合はofficeドキュメントも対象
		if (isOfficeViewerInstalled) {
			fileExtExp += '|docx?|xlsx?|pptx?|od[tsp]';
		}

		regfileExt = new RegExp('\\.(' + fileExtExp + ')', 'i');
		//ボタン作成
		$fileLinks.each(function(){
			var $flink = $(this);
			if (!$flink.text().match(regfileExt)) { return true; };
			$('<span class="preview-on-browser" title="ブラウザで開く"></span>')
			.css({ display: 'none' })
			.insertAfter($flink);
		});
	},

	/**
	 * ブラウザ内プレビューボタン押下時処理
	 */
	clickPreviewOnBrowserBtn: function(evt){
		var $btn = $(evt.target),
			$flink = $btn.prev('a'),
			token = $('meta[name=csrf-token]').attr('content'),
			reqUrl = $flink.prop('href') + '?authenticity_token=' + encodeURIComponent(token),
			fileName = $flink.text().trim();

		this.viewFileInBrowser(reqUrl, fileName);
	},

	/**
	 * 指定されたurlのファイルをブラウザで開く
	 * @param  {String} fileUrl  ファイルURL(リクエストURL)
	 * @param  {String} fileName ファイル名
	 * @param  {Object} opt      オプション
	 */
	viewFileInBrowser: function(fileUrl, fileName, opt){
		var opt = opt || {},
			ctype, isTextFile, isOfficeDoc, isNonTarget, libReady;
		//content-type取得
		$.ajax(fileUrl, {
			async: false,
			type: 'HEAD'
		}).done(function(data, status, jqXhr){
			ctype = jqXhr.getResponseHeader('Content-Type');
			//textファイル判定
			isTextFile = !!ctype.match(/^text\//);
			//officeドキュメント判定
			isOfficeDoc = !!ctype.match(/(office|open)document|vnd\.ms\-/);
			//対象外ファイル判定
			isNonTarget = !!ctype.match(/octet\-stream|exe/);
		});

		if (isNonTarget) { alert('can not open this file'); return; }

		//textファイルの場合は文字コード判定の為、Encodingライブラリを読み込む
		if (isTextFile && !youRoomHelper.Encoding) {
			libReady = youRoomHelper.loadEncodingLib();
		} else {
			libReady = true;
		}

		$.when(libReady).then(function(){
			document.body.style.cursor = "wait";
			//ファイルをバイナリで取得
			var xhr = new XMLHttpRequest();
			xhr.open('GET', fileUrl, true);
			xhr.responseType = 'arraybuffer';
			xhr.onload = function(evt){
				if (this.status == 200) {
					var bytes = new Uint8Array(this.response);
					//textファイルの場合はファイルの中身の文字コードを判定し
					//charsetを上書き
					if (isTextFile) {
						var charset = youRoomHelper.Encoding.detect(bytes);
						ctype = ctype.replace(/(^.+charset=).+$/, '$1' + charset);
					}

					var blob = new Blob([bytes], { type: ctype }),
						fixUrl = $.Deferred();

					//officeドキュメントの場合、OfficeViewerで開けるように
					//一旦ローカルにファイルを書き込む
					//(OfficeViewerで開くには拡張子付きファイル名が必須)
					if (isOfficeDoc) {
						youRoomHelper.writeLocalFile(fileName, blob).then(function(file){
							fixUrl.resolve(file.toURL());
						});
					} else {
						fixUrl.resolve(URL.createObjectURL(blob));
					}

					fixUrl.then(function(url){
						window.open(url, "_blank");
					});
				} else {
					console.log('failed to open file');
				}
				document.body.style.cursor = "";
			};
			xhr.send();
		});
	},

	/**
	 * Encoding.jsライブラリを読み込む
	 *  youRoomHelper.Encodingに読み込み時のjqXHRオブジェクトを設定し
	 *  読み込み完了後Encodingオブジェクトを設定する。
	 *  また戻り値としてはyouRoomHelper.Encodingを返す。
	 * @param  {Object} opt jqXHRコンフィグ
	 * @return {Object} Encodingライブラリ読み込みのPromiseオブジェクト
	 */
	loadEncodingLib: function(opt){
		var jqxhr = $.ajax(
			chrome.extension.getURL('/lib/encoding.js'),
			opt || {}
		).done(function(res){
			(function(){ eval(res); }).call(youRoomHelper);
		});
		return youRoomHelper.Encoding = jqxhr;
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
	 * 現在のurlが指定された場所かどうか
	 * @param  {string} name 画面の名前
	 * @return {boolean} 指定された場所かどうか
	 */
	isLocating: function(name){
		switch (name) {
		case 'home':
			return location.pathname.match(/^\/*$/);
		case 'room':
			return location.pathname.match(/^\/r\/.*$/);
		case 'search':
			return location.pathname.match(/^\/search\?*/);
		case 'account_setting':
			return location.pathname.match(/^\/users\/.+/) || !!$('#container-setting').length;
		}
	},

	/**
	 * ミーティングモードマネージャ
	 * @type {Object}
	 */
	meetingModeMgr: {
		DEF_INTERVAL: 3000,
		owner: {}, //readyの中でyouRoomHelperをセット
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
			this.owner = youRoomHelper;
			this.MEETING_MODE_KEY = this.owner.storeKey.MEETING_MODE;
			this.interval = this.owner.settings && this.owner.settings.meetingModeInterval
								|| this.DEF_INTERVAL;

			//ミーティングモード用移動ボタンを表示
			//(ホーム画面)
			if (this.owner.isLocating('home')) {
				//ホーム画面ではajaxで内容が読み込まれるのを待ちながらリトライする
				this.owner.retryMgr.reg(
					function(){ return $('.entry-container').length; },
					this.addMeetingBtn, this);
			} else {
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
			//css追加
			this.owner.appendStyleSheet('/css/meeting.css');
			// $('<link rel="stylesheet" type="text/css">')
			// 	.attr('href', chrome.extension.getURL('/css/meeting.css'))
			// 	.insertAfter('link:last');

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
			this.timer = setTimeout(this.getNewComments.bind(this), this.interval);
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
			var CONTAINER_SELECTOR = '.comment-container';
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
									.text('0').appendTo(document.body);
 			}
			var EFE_INCREASE = 'bounceIn',
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
		 * コメントが読める状態かどうか
		 * (コメントが一定範囲内に入っているか)
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
	 * トピックurlワンクリックコピーマネージャ
	 * @type {Object}
	 */
	topicUrlOneClickCopy: {
		scopeSelector: '.topic_top_action',
		commentShowBtnSelector: '.comments-number-area',
		//ワンクリックコピー有効化
		enable: function(){
			var owner = youRoomHelper;
			//#コメント表示ボタン=$(.comments-number-area)
			//コメント表示ボタンにclickイベントリスナを追加したいが
			//コメント表示ボタンのclickイベントは既存リスナ内でバブリングが止められているので
			//bindで追加する必要がある。
			//そうすると動的に作られた新たなコメント表示ボタンには追加リスナは設定されない。
			//なのでon(=delegate)でmouseupイベントにリスナを登録しておき、その中で
			//clickイベントのリスナをbindする。

			//さらにホーム画面ではコンテンツの読み込みを待つ必要があるので
			//documentにトリガーを仕込んでおく
			if (owner.isLocating('home')) {
				$(document.body).one('mousedown.yrh',
					this.commentShowBtnSelector,
					this.prepareForAddListener.bind(this));
			} else {
				this.prepareForAddListener();
			}
		},
		//コメント表示ボタンにイベントリスナを登録する準備をする
		prepareForAddListener: function(){
			$('#column1').find(this.scopeSelector).one('mouseup.yrh',
				this.commentShowBtnSelector,
				this.addListenerToCommentNumBtn.bind(this));
		},
		//コメント表示ボタンにイベントリスナを登録する
		addListenerToCommentNumBtn: function(evt){
			var $btn = $(evt.currentTarget);
			$btn.bind('click.yrh', this.handleCommentNumClick.bind(this));
		},
		//コメント表示ボタンのクリックハンドラ
		handleCommentNumClick: function(evt){
			var $btn = $(evt.currentTarget);
			if($btn.hasClass('cluetip-clicked')){
				this.placeCopyToClipboardBtn();
			}
		},
		//cluetipにトピックurlコピーボタンを設置する
		placeCopyToClipboardBtn: function(){
			var imgUrl = chrome.extension.getURL('/images/clipboard.png'),
				copybtnHtml = '<image src="' + imgUrl + '" class="copybtn" title="copy to clipboard" style="height:16px;margin-left:-8px;position:relative;top:-2px;width:16px;">',
				$urlBox = $('#cluetip').find('.click-select'),
				url = $urlBox.val(),
				$btn = $(copybtnHtml).bind({
					click: function(){
						//クリップボードにコピー
						chrome.extension.sendMessage(
							{task: {key: 'copyToClipBoard', str: url}},
							$.noop
						);
					},
					mouseenter: function(){ $(this).prev().get(0).select(); },
					mouseleave: function(){ $(this).prev().get(0).blur(); }
				});
 			$urlBox.width($urlBox.width() - 10).after($btn);
		},
		//ワンクリックコピー無効化
		disable: function(){
			$('#cluetip').find('.copybtn').remove();
			$('#column1').find(this.scopeSelector).off('.yrh');
			$(this.commentShowBtnSelector).off('.yrh');
		}
	},

	/**
	 * 元スレッドへのリンクにアイコンを追加する
	 */
	iconizeThreadLink: function(){
		var ss = $('<style type="text/css">').appendTo('head').get(0).sheet;
		ss.insertRule('li.entry-time a:after { content: url("'
			+ chrome.extension.getURL('/images/goto_thread.png')
			+ '");margin-left:3px;position:relative;top:2px}', 0);
	},

	/**
	 * 新着コメントを観測
	 */
	newCommentsObserver: {
		markerId: 'yrh-notifier',
		noticeFavicon: chrome.extension.getURL('/images/favicon-notifier.png'),
		/**
		 * 新着コメントの観測を開始
		 */
		start: function(){
			var interval = (youRoomHelper.settings.commentCheckInterval || 60) * 1000;

			this.orgFavicon = this.orgFavicon ||
								this.getFaviconTag().attr('href');

			this._id = window.setInterval(function(){
				this.check();
			}.bind(this), interval);
		},

		/**
		 * 新着通知処理
		 * @param  {number} count 新着件数
		 */
		notify: function(count){
			this.updateNotifier(count);
			this.updateFavicon(count);
		},

		/**
		 * 新着コメントの有無を確認
		 * 新着コメントがある場合は通知処理を行う
		 */
		check: function(){
			$.ajax('https://www.youroom.in/', {
				data: {read_state: 'unread'},
				dataType: 'json'
			}).then(function(res){
				var entries = res,
					cnt = 0;
				for (var i = 0, e, ids; e = entries[i++];) {
					if (e.entry && (ids = e.entry.unread_comment_ids)) {
						cnt += ids.split(',').length;
					}
				}
				this.notify(cnt);
			}.bind(this));
		},

		/**
		 * 画面内の通知表示の更新
		 * @param  {number} count 新着件数
		 */
		updateNotifier: function(count){
			var $notifier = $('#' + this.markerId);
			if (!count) {
				$notifier.hide();
			} else {
				if (!$notifier.length) {
					$notifier = $('<span id="' + this.markerId + '">').css({
						backgroundColor: '#ff0033',
						borderRadius: '5px',
						display: 'inline-block',
						height: '10px',
						position: 'relative',
						width: '10px'
					});
					$('#head-navi li').find(':contains(ホーム)')
						.append($notifier);
				}
				$notifier.show();
			}
		},

		/**
		 * Faviconタグを返す
		 * @return {Object} FaviconタグのjQueryオブジェクト
		 */
		getFaviconTag: function(){
			return $('link').filter('[rel*="icon"]');
		},

		/**
		 * Faviconタグを指定されたurlのFaviconのものに置き換える
		 * @param  {String} newUrl 置き換え後のFaviconのurl
		 */
		replaceFaviconTag: function(newUrl){
			var $fav = this.getFaviconTag().remove();
			$fav.attr('href', newUrl).appendTo('head');
		},

		/**
		 * Faviconの通知表示の更新
		 * @param  {Number} count 新着件数
		 */
		updateFavicon: function(count){
			var $favicon = this.getFaviconTag(),
				curFav = $favicon.attr('href'),
				expFav;
			if (!count) {
				expFav = this.orgFavicon;
			} else {
				expFav = this.noticeFavicon;
			}
			if (curFav != expFav) {
				this.replaceFaviconTag(expFav);
			}

		}
	},

	/**
	 * cssファイルをdocumentに追加
	 * @param  {string} path cssファイルのパス
	 */
	appendStyleSheet: function(path){
		$('<link rel="stylesheet" type="text/css">')
			.attr('href', chrome.extension.getURL(path))
			.insertAfter('link:last');
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
				judgment = $.isFunction(condition) ? condition() : !!condition;
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

/**
 * ルームカラーマネージャ
 * @type {Object}
 */
youRoomHelper.roomColorMgr = {
	owner: youRoomHelper,
	//カラー設定画面用仮想パス
	virtualPath: '/users/edit_color',
	colorEditTabId: 'color-edit',
	editTabsSelector: '.sub-profile-nav>ul>li',
	iconPath: chrome.extension.getURL('/images/color_edit.png'),
	//デフォルトカラーのCMY近似値
	defaultCMY: [-18, 72, -160],
	//カラーリング対象画像
	colorPartImages: {
		top: { url: '/assets/room/bg-head-contents.png', w: 1,
				selector: '#contents'},
		head: { url: '/assets/room/bg-tl-room.png',
				selector: '#contents-tab-nav'},
		body: { url: '/assets/common/bg-3column.png', h: 1,
				selector: '#contents-container'}
	},

	init: function(){
		var roomColorInfoDfd = new $.Deferred(),
			colorPartImagesDfd = new $.Deferred();

		//ルームカラー情報取得
		chrome.extension.sendMessage(
			{require: 'roomColorInfo'},
			function(res){
				var ci = res.roomColorInfo || {};
				this.roomColorInfo = ci;
				roomColorInfoDfd.resolve(ci);
			}.bind(this)
		);
		this.roomColorInfoIsReady = roomColorInfoDfd.promise();

		//カラーリング対象画像プリロード
		$.each(this.colorPartImages, function(name, info){
			// var img = new Image();
			var img = document.createElement('img');
			img.onload = function(){
				var images = this.colorPartImages;
				for (name in images) {
					if (!images[name].img.naturalWidth) {
						return;
					}
				}
				colorPartImagesDfd.resolve();
			}.bind(this);
			img.src = info.url;
			this.colorPartImages[name].img = img;
		}.bind(this));
		this.colorPartImagesAreReady = colorPartImagesDfd.promise();

		//アカウント設定ページの場合
		if (this.owner.isLocating('account_setting')) {
			this.owner.appendStyleSheet('/css/room_color.css');
			this.initSettingPage();
		} else {
			this.coloringRoom();
		}
	},

	//ルームを色付けする
	coloringRoom: function(){
		var roomId, matches;
		if (matches = location.pathname.match(/\/r\/([^\/]+).*/)) {
			roomId = matches[1];
		} else {
			return;
		}

		$.when(this.roomColorInfoIsReady,
				this.colorPartImagesAreReady).then(function(){

			var CANVAS_ID = 'coloring-canvas';
			var colorInfo = this.roomColorInfo[roomId];
			if (!colorInfo || !colorInfo.cmy) { return; }

			var ss = $('<style type="text/css">').prependTo('head').get(0).sheet,
				i = 0, canvas;
			//作業用canvas取得
			if ($('#' + CANVAS_ID).length) {
				canvas = $('#' + CANVAS_ID).get(0);
			} else {
				canvas = $('<canvas id="' + CANVAS_ID + '">')
						.css({display: 'none'})
						.appendTo(document.body).get(0);
			}

			$.each(this.colorPartImages, function(name, imgInfo){
				var storageKey = 'yrh.img.' + roomId + '.' + name,
					img = imgInfo.img,
					h = imgInfo.h || img.height,
					w = imgInfo.w || img.width,
					rects = [0, 0, w, h], dataUrl;

				if (sessionStorage[storageKey]) {
					dataUrl = sessionStorage[storageKey];
				} else {
					//キャンバスを画像に合わせる
					canvas.height = h;
					canvas.width = w;
					var ctx = canvas.getContext('2d');
					ctx.drawImage(img, 0, 0);

					//キャンバスで画像に色付け
					this.coloringCanvas(canvas, colorInfo.cmy, rects);
					dataUrl = canvas.toDataURL();
					//キャッシュ
					sessionStorage[storageKey] = dataUrl;
				}

				//色付けした画像のdataUrlを背景にセット
				//$(imgInfo.selector)
				//	.css('backgroundImage', 'url(' + dataUrl + ')');
				ss.insertRule(imgInfo.selector +
					' { background-image: url(' + dataUrl + ') !important; }', i++);
			}.bind(this));

		}.bind(this));
	},

	//設定画面での初期処理
	//(カラー設定タブの追加・history操作等)
	initSettingPage: function(){
		////webkitのバグ対応(pushStateされたページ以外のページロード時にもpopStateイベントが発生する)
		var popped = ('state' in window.history && window.history.state !== null);
		//popstateのイベントリスナでページ遷移を制御
		//(カラー設定画面が存在するかのように遷移させる)
		window.addEventListener('popstate', function(evt) {
			if (!popped) { popped = true; return; }
			//カラー設定画面以外に移動するとき通常の履歴移動
			if (location.pathname != this.virtualPath) {
				location.href = location.pathname;
			} else {
				this.clickColorEditTab.call(this);
			}
		}.bind(this), false );

		//ブラウザの[戻る/進む]やアドレス直打ちでカラー設定画面に移動してきた場合
		//(urlがカラー設定画面で404ページが表示されている)
		if (location.pathname.indexOf(this.virtualPath) >= 0 &&
				document.title.indexOf('404') >= 0) {
			$(document.body).remove();
			//一旦別の設定画面に移動させる(それからカラー設定画面を表示)
			location.href = '/users/edit_email#color';
		//上のケースの処置で一旦移動してきた場合
		} else if (location.hash == '#color') {
			history.replaceState(null, null, this.virtualPath);
			this.showColorEditTab();
			this.clickColorEditTab();
		} else {
			this.showColorEditTab();
		}
	},

	//アカウント設定画面にルームカラー設定タブを追加する
	showColorEditTab: function(){
		var href = /*location.origin +*/ this.virtualPath,
			$li = $('#column1-setting').find(this.editTabsSelector + ':last');
		if (!$li.length) { return; }
		var $tab = $li.clone().attr('id', this.colorEditTabId)
					.removeClass()
					.find('a').attr('href', href).end()
					.find('img').attr({
						alt: '',
						src: this.iconPath
					}).end()
					.insertAfter($li);

		$tab.html($tab.html().replace($tab.text(), 'ルームカラー'))
		.on('click', function(evt){
			history.pushState(null, null, href);
			this.clickColorEditTab.call(this);
			evt.preventDefault();
		}.bind(this));
	},

	//カラー設定タブクリック
	clickColorEditTab: function(){
		this.setTabSelected($('#' + this.colorEditTabId));

		$('.edit-wrap').empty().append('<img src="../assets/ajax-loader2.gif">');
		this.showColorEditContents();
	},

	//指定された設定項目のタブを選択状態にする(元々選択されていたタブは非選択に)
	setTabSelected: function(tab){
		var currnetTab = $('#column1-setting').find(this.editTabsSelector)
							.filter('.profile-nav-current').get(0);
		$('#' + this.colorEditTabId).addClass(currnetTab.className);
		$(tab).addClass(currnetTab.className);
		currnetTab.className = '';
	},

	//カラー設定コンテンツを表示する
	showColorEditContents: function(){
		$.when(this.createColorEditContent()).then(function($content){
			if (!$content.length) { return; }
			$('.edit-wrap').replaceWith($content);
		});
	},

	//カラー設定コンテンツ作成
	createColorEditContent: function(){
		if (this.colorEditContents) { return this.colorEditContents; }

		var facade = this.facadeEditor.init(),
			savedData;

		var dfd = new $.Deferred();

		$.when($.get('/users/participations'), facade.isReady(),
						this.roomColorInfoIsReady).then(function(res){

			var html = res[0],
				$content = $(html).find('.edit-wrap'),
				$table = $content.find('.tbl-account'),
				$th = $table.find('th'),
				$td = $table.find('td');

			this.colorController.init();

			//タイトル部
			$content.find('#tl-account-profile')
			.text('カラーの設定')
			.css({backgroundImage: 'url(' + this.iconPath + ')'});

			//2列目(名前カラム)非表示
			$th.add($td).filter(':nth-child(2)').hide();

			//(元)3列目
			$th.filter(':nth-child(3)').text('現在の設定');

			//(元)4列目
			$td.filter(':nth-child(4)').find('p')
			.on('click', function(evt){
				var self = youRoomHelper.roomColorMgr,
					$btn = $(this),
					offset = $btn.offset(),
					roomId = $btn.closest('tr').attr('id'),
					colorInfo = self.roomColorInfo[roomId];
				//カラーコントローラー表示
				self.colorController.showBox(
					roomId, colorInfo, offset.left + 30, offset.top - 48);
				evt.stopPropagation();
			})
			.find('a').attr({href: '#', onclick: 'return false;'});

			//行毎の編集
			$table.find('tr').each(function(idx){
				//ヘッダ行はスキップ
				if (idx == 0) { return true; }
				var self = youRoomHelper.roomColorMgr,
					$tr = $(this),
					$firstCol = $tr.find('td:nth-child(1)'),
					roomUrl = $firstCol.find('a').attr('href'),
					roomId = roomUrl.match(/[^\/]+$/)[0],
					colorInfo = self.roomColorInfo[roomId] || {},
					cmy = colorInfo.cmy || 'default';
				this.id = roomId;

				//ルームアイコン表示
				$firstCol.prepend('<img src="' + roomUrl + '/picture" height="20px" width="20px">');

				//現在のカラー設定表示
				$tr.find('td:nth-child(3)').empty()
					.append(facade.getPaintedImg(cmy));
			});

			dfd.resolve($content);
		}.bind(this))
		return dfd.promise();
	},

	/**
	 * ルームカラー情報を保存
	 * @param  {String} roomId    ルームID
	 * @param  {Object} colorInfo ルームカラー情報
	 */
	saveRoomColorInfo: function(roomId, colorInfo){
		if (colorInfo.cmy.toString() == this.defaultCMY.toString()) {
			delete colorInfo.cmy;
		}
		this.roomColorInfo[roomId] = colorInfo;
		chrome.extension.sendMessage({
			task: {
				key: 'saveRoomColorInfo',
				roomId: roomId,
				colorInfo: colorInfo
			}
		}, $.noop);
		this.removeRoomColorCache(roomId);
	},

	/**
	 * ルームカラーのキャッシュを消去
	 * @param  {String} roomId ルームID
	 */
	removeRoomColorCache: function(roomId){
		for (var key in sessionStorage) {
			if (key.match(new RegExp('yrh.img\\.' + roomId + '(\\.|$)'))) {
				sessionStorage.removeItem(key);
			}
		};
	},

	/**
	 * 現在の設定プレビューを更新する
	 * @param  {String} roomId ルームID
	 * @param  {Array}  cmy    CMY調整値のリスト
	 */
	updateCurrentColorPreview: function(roomId, cmy){
		$('#' + roomId).find('td:nth-child(3)').empty()
			.append(this.facadeEditor.getPaintedImg(cmy));
	},

	/**
	 * キャンバス上の画像の色を変更
	 * @param  {Mixed}  canvas DOMエレメント or jQueryオブジェクト or selector
	 * @param  {Number} c      C成分値
	 * @param  {Number} m      m成分値
	 * @param  {Number} y      y成分値
	 * @param  {Array}  rects  canvas内の着色対象範囲[x,y,w,h]のリスト
	 * @return {DOM Element} キャンバスエレメント<canvas>
	 */
	coloringCanvas: function(canvas, c, m, y, rects){
		var canvas = $(canvas).get(0);
		if (!canvas || !canvas.getContext) {
			return false;
		} else if ($.isArray(c)) {
			return this.coloringCanvas(canvas, c[0], c[1], c[2], rects);
		}
		c = c || 0, m = m || 0, y = y || 0;
		if (c == 0 && m == 0 && y == 0) { return canvas; }

		//色調補正関数
		var balancer = function(org, level){
			return 255 * Math.pow((org / 255), Math.pow(0.5, (level / 100)));
		};
		//グレースケール取得(近似式)
		var grayscaler = function(r, g, b){
			return (2 * r + 4 * g + b) / 7;
		};
		var ctx = canvas.getContext('2d'),
			rects, rect, img, data,
			part, i, j, len, gray,
			curR, curG, curB, calR, calG, calB;

		if (!rects) {
			rects = [[0, 0, canvas.width, canvas.height]];
		} else if ($.isArray(rects) && !$.isArray(rects[0])) {
			rects = [rects];
		}

		for (var i = 0, rect; rect = rects[i++];) {
			img = ctx.getImageData.apply(ctx, rect);
			data = img.data;
			for (j = 0, len = data.length; j < len; j += 4) {
				//前のピクセルと同じ色なら計算不要
				if (data[j] == curR &&
						data[j+1] == curG && data[j+2] == curB ) {
					data[j] = calR;
					data[j+1] = calG;
					data[j+2] = calB;
				} else {
					curR = data[j];
					curG = data[j+1];
					curB = data[j+2];

					gray = grayscaler(data[j], data[j+1], data[j+2]);
					data[j] = calR = balancer(gray, c);
					data[j+1] = calG = balancer(gray, m);
					data[j+2] = calB = balancer(gray, y);
				}
			}
			ctx.putImageData.apply(ctx, [img].concat(rect.slice(0, 2)));
		}
		return canvas;
	},

	/**
	 * ファサードエディタ
	 * @type {Object}
	 */
	facadeEditor: {
		//canvasサイズ
		canvasHeight: 100,
		canvasWidth: 70,
		//カラーリング対象エリア(初期化時に設定)
		colorPartRect: {},
		owner: {},

		init: function(){
			this.owner = youRoomHelper.roomColorMgr;
			this.__isReady = new $.Deferred();
			//カラーリング対象エリア設定[x, y, width, height]
			this.colorPartRect = {
				top: [0, 0, this.canvasWidth, 20],
				head: [5, 25, this.canvasWidth - 10, 20],
				body: [5, 45, this.canvasWidth - 10, 50]
			};
			this.create();
			return this;
		},

		create: function(){
			$.when(this.owner.colorPartImagesAreReady).then(function(){
				this.setDefault();
				this.__isReady.resolve();
			}.bind(this));
		},

		//
		isReady: function(){
			return this.__isReady.promise();
		},

		/**
		 * 編集用のキャンバスを返す
		 * @return {DOM Element} キャンバスエレメント<canvas>
		 */
		getCanvas: function(visible){
			var canvas = this.facadeCanvas,
				h = this.canvasHeight,
				w = this.canvasWidth;
			if (!canvas) {
				this.facadeCanvas = canvas =
				$('<canvas id="facade-canvas" height="' + h + '" width="' + w + '">')
					.css({display: 'none'})
					.appendTo(document.body).get(0);
			}
			switch (visible) {
			case true:
				$(canvas).css({display: ''})
				break;
			case false:
				$(canvas).css({display: 'none'})
				break;
			default:
				break;
			}
			return canvas;
		},

		/**
		 * エディタにデフォルト設定のファサードをセット
		 */
		setDefault: function(){
			var images = this.owner.colorPartImages,
				canvas = this.getCanvas(),
				ctx = canvas.getContext('2d'),
				rects, part;

			ctx.fillStyle = '#f8f8f8';
			ctx.fillRect(0, 0, canvas.width, canvas.height);
			ctx.strokeStyle = '#cccccc';
			ctx.strokeRect(4.5, 24.5, 61, 71);
			rects = this.colorPartRect;
			for (part in rects) {
				ctx.drawImage.apply(ctx, [images[part].img].concat(rects[part]));
			}
		},

		/**
		 * (キャンバス上の)ファサードの色を変更
		 * @param  {Number} c      C成分値
		 * @param  {Number} m      m成分値
		 * @param  {Number} y      y成分値
		 * @return {DOM Element} キャンバスエレメント<canvas>
		 */
		changeColor: function(c, m, y){

			if ($.isArray(c)) {
				return this.changeColor(c[0], c[1], c[2]);
			}

			var canvas = this.getCanvas(),
				rects = [];

			this.setDefault();
			if (!c || c == 'default') {
				return canvas;
			}

			$.each(this.colorPartRect, function(k, v){
				rects.push(v);
			});
			return this.owner.coloringCanvas(canvas, c, m, y, rects);
		},

		/**
		 * 色を塗ったファサードのイメージエレメントを返す
		 * @param  {Number} c      C成分値
		 * @param  {Number} m      m成分値
		 * @param  {Number} y      y成分値
		 * @param  {Number} height 高さ
		 * @param  {Number} width  幅
		 * @return {DOM Element} イメージエレメント<img>
		 */
		getPaintedImg: function(c, m, y, height, width){
			this.changeColor(c, m, y);

			var height = height || 55,
				width = width || 40,
				// img = new Image(width, height);
				img = document.createElement('img');
			img.width = width;
			img.height = height;
			img.src = this.getCanvas().toDataURL();
			return img;
		}
	},

	/**
	 * カラーコントローラー
	 * @type {Object}
	 */
	colorController: {
		owner: {},
		init: function(){
			this.owner = youRoomHelper.roomColorMgr;
			this.facade = this.owner.facadeEditor;
			$(document).on('click', function(evt){
				//コントロールボックスが表示されている時にボックス以外の場所がclickされたら
				//ボックスを閉じる
				var cbox = this.getBox(),
					id = cbox.id,
					visible = !!$(cbox).filter(':visible').length;
				if (visible && !$(evt.target).closest('#' + id).length) {
					this.hideBox();
				}
			}.bind(this));
		},

		/**
		 * コントロールボックスを表示する
		 * @param  {string} target    編集対象ルームID
		 * @param  {object} colorInfo 初期表示用カラー情報
		 * @param  {number} x         表示位置x
		 * @param  {number} y         表示位置y
		 */
		showBox: function(target, colorInfo, x, y){
			var cmy = colorInfo ? colorInfo.cmy : this.owner.defaultCMY,
				$cbox = $(this.getBox());

			this.setCMY(cmy);
			this.refreshPreview();
			$cbox.find('.preview').append(this.facade.getCanvas(true));
			$cbox.data('target', target);

			$cbox.css({left: x + 30, top: y - $cbox.height() / 2}).show();
		},

		/**
		 * コントロールボックスを非表示にする
		 * @return {DOM Element} コントロールボックス<div>
		 */
		hideBox: function(){
			$(this.getBox()).hide();
		},

		/**
		 * コントロールボックスを返す
		 * @return {DOM Element} コントロールボックス<div>
		 */
		getBox: function(){
			if (!this._box) {
				this._box = this.createBox();
			}
			return this._box;
		},

		/**
		 * コントロールボックスを作成
		 * @return {DOM Element} コントロールボックス<div>
		 */
		createBox: function(){
			var h = '';
			h += '<div id="color-controll-box">';
			h +=   '<div class="preview"></div>';
			h +=   '<div class="sliders">';
			for (var i = 3; i--;) {
				h += '<div class="slider-wrap">';
				h +=   '<input type="range" min="-160" max="160" step="2">';
				h += '</div>';
			}
			h +=   '</div>';
			h +=   '<div class="button-wrap">';
			h +=     '<input class="save-btn" type="button" value="Save">';
			h +=     '<span class="reset-btn">set default</span>';
			h +=   '</div>';
			h += '</div>';

			var $box = $(h).appendTo($('.edit-wrap'));
			$box.find('.preview').append(this.facade.getCanvas());

			$box.on('change', 'input[type=range]', this.refreshPreview.bind(this))
				.on('click', '.save-btn', this.saveBtnClick.bind(this))
				.on('click', '.reset-btn', this.resetBtnClick.bind(this));

			return $box[0];
		},

		/**
		 * CMY調整値を取得
		 * @return {Array} CMY調整値の配列[c, m, y]
		 */
		getCMY: function(){
			var cmy = [];
			$(this.getBox()).find('input[type=range]').each(function(){
				cmy.push(this.value);
			});
			return cmy;
		},

		/**
		 * CMY調整値を設定
		 * @param {Array} cmy CMY調整値のリスト
		 */
		setCMY: function(cmy){
			if (!cmy) {
				cmy = this.owner.defaultCMY;
			} else if (!$.isArray(cmy) && arguments.length >= 3) {
				var slice = Array.prototype.slice,
					cmy = slice.call(arguments, 0, 3),
					args = slice.call(arguments, 3);
				return this.setCMY.apply(this, [cmy].concat(args));
			}
			$(this.getBox()).find('input[type=range]').each(function(idx){
				this.value = cmy[idx];
			});
		},

		/**
		 * プレビューを更新
		 */
		refreshPreview: function(){
			this.facade.changeColor(this.getCMY());
		},

		/**
		 * saveボタン押下時処理
		 */
		saveBtnClick: function(){
			var roomId = $(this.getBox()).data('target'),
				cmy = this.getCMY(),
				ow = this.owner;
			ow.saveRoomColorInfo(roomId, {cmy: cmy});
			ow.updateCurrentColorPreview(roomId, cmy);
			this.hideBox();
		},

		/**
		 * resetボタン押下時処理
		 */
		resetBtnClick: function(){
			this.setCMY();
			this.refreshPreview();
		}
	}
};

$(function(){youRoomHelper.init()});
