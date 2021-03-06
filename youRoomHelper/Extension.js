/*!
 * Extension.js (Google Chrome Extension Class)
 * https://github.com/yamayamayamaji/youRoomHelper
 * Copyright, Ryosuke Yamaji
 *
 * License: MIT
 */

/**
 * Extension Class
 */
var Extension = function(){
	return new Extension.prototype.init(arguments[0]);
}

/**
 * Extension prototype
 */
Extension.prototype = {
	constructor: Extension,
	/**
	 * @const
	 */
	STORE_KEY: {
		PREV_VERSION: 'prev_version'
	},

	/**
	 * コンストラクタ(として使用)
	 * @param  {object} options インスタンスオプション
	 * @return {object}         インスタンス
	 */
	init: function(options){
		var details = this.getDetails();
		this.id = details.id;
		this.name = details.name;

		_.extend(this, options);

		//_get,_executeとoptionsのget,executeとのmixin作成
		_.each(['get', 'execute'], function(name, idx){
			this[name] = _.extend({}, this['_' + name], options[name]);
		}, this);

		//バージョンマネージャー初期化
		this.versionMgr.init();
		//メッセージリスナー登録
		chrome.extension.onMessage.addListener(this.messageHandler.bind(this));

		return this;
	},

	/**
	 * content scriptsからのrequireメッセージのレシーバ
	 * @type {Object}
	 */
	_get: {
		details: function(){
			return this.getDetails();
		},
		storage: function(opt){
			return this.getLocalStorage(opt.search);
		},
		isUpdated: function(){
			return this.versionMgr.isUpdated();
		}
	},

	/**
	 * content scriptsからのtaskメッセージのレシーバ
	 * @type {Object}
	 */
	_execute: {
		showPageAction: function(opt, sender){
			this.showPageAction(sender.tab.id);
		},
		changePageActionIcon: function(opt, sender){
			this.changePageActionIcon(opt, sender.tab.id);
		},
		notifyIfUpgraded: function(){
			this.versionMgr.notifyIfUpgraded();
		},
		copyToClipBoard: function(opt){
			this.copyToClipBoard(opt.str);
		}
	},

	/**
	 * コンテンツスクリプトとのメッセージ通信
	 * @param  {any} req          リクエストメッセージ
	 * @param  {chrome.extension.MessageSender} sender メッセージ送信元の情報
	 * @param  {function} sendResponse レスポンス用ファンクション
	 */
	messageHandler: function(req, sender, sendResponse){
		if (!req) { sendResponse({}) }
		//メッセージ内のtaskとrequireを抽出
		var task = req.task || [],
			require = req.require || [];
		//work(taskとrequire)のレシーバを実行するDeferredオブジェクトを
		//生成して返す(private)
		var deferredMaker = function(instance, work, name, args){
			var ext = instance;
			var fnc = instance[work][name];
			if (!_.isFunction(fnc)) { return {}; }

			var dfd = new _.Deferred();
			_.defer(function(){
				var res = {};

				switch (work) {
				case 'execute':
					try {
						fnc.call(instance, args, sender);
						res[name] = true;
					} catch (err) {
						console.log(err);
						res[name] = false;
					}
					break;
				case 'get':
					res[name] = fnc.call(instance, args, sender);
					break;
				}

				dfd.resolve(res);
			});

			return dfd.promise();
		};
		var deferreds = [];

		//taskとrequireを対応するレシーバで順に処理する
		_.each([task, require], function(works, idx){
			var i, w, name, args;
			if (!_.isArray(works)){ works = [works]; }

			for (i = 0; w = works[i++];) {
				if (_.isArray(w)) {
					name = w.shift();
					args = w;
				} else if (_.isObject(w)) {
					name = w.key;
					args = w;
				} else {
					name = w;
					args = null;
				}

				//レシーバがasync処理を含むことを想定し、Deferred/Promiseで実行する
				deferreds.push(deferredMaker(this,
					(idx == 0 ? 'execute' : 'get'), name, args));
			}
		}, this);

		//レシーバが全て完了したら、結果をJSONに詰めてメッセージ送信元に返す
		_.when.apply(null, deferreds).then(function(){
			var res = {};
			_.each(arguments, function(obj){
				_.extend(res, obj);
			});
			sendResponse(res);
		});

		//メッセージ応答はレシーバが全て完了した後で行うため
		//イベントリスナの戻り値としてはtrueを返しておく
		return true;
	},

	/**
	 * エクステンションの詳細情報(マニフェスト情報)を取得する
	 * keyが指定されている場合は対応する値を、指定がない場合は全情報を返す
	 * @param  {string} key 取得する値のキー
	 * @return {any}        keyに対応するマニフェスト情報又はマニフェスト情報JSON
	 */
	getDetails: function(key){
		if (!this.details) {
			this.details = chrome.app.getDetails();
		}
		if (key) {
			return this.details[key];
		} else {
			return this.details;
		}
	},

	/**
	 * localStorageの内容を返す
	 * @param  {string} search ここに指定された文字列をkeyに含むもののみ取得する
	 * @return {object}        localStorageをsearchでフィルタリングしたJSON
	 */
	getLocalStorage: function(search){
		var obj = {}, val;
		for (var key in localStorage) {
			if (key.indexOf(search) !== -1) {
				val = localStorage[key];
				obj[key] = JSON.parse(val);
			}
		};
		return obj;
	},

	/**
	 * ページアクション(アイコン)を表示
	 * @param  {integer} tabId　アイコンを表示するタブのid
	 */
	showPageAction: function(tabId){
		chrome.pageAction.show(tabId);
	},

	/**
	 * pageActionのアイコンを変更する
	 * @param  {object}  opt   setIconオプション
	 * @param  {integer} tabId アイコンを表示するタブのid
	 */
	changePageActionIcon: function(opt, tabId){
		var details = {tabId: tabId};
		if (opt.path) {
			details.path = opt.path;
		} else {
			details.imageData = opt.imageData;
		}
		chrome.pageAction.setIcon(details, opt.callback);
	},

	/**
	 * バージョンマネージャー
	 * @type {Object}
	 */
	versionMgr: {
		//初期化
		init: function(){
			var ext = Extension.prototype,
				prevVer = ext.STORE_KEY.PREV_VERSION;
			this.prevVer = localStorage[prevVer];
			this.curVer = ext.getDetails().version;
		},
		//エクステンションが更新されているか
		isUpdated: function(){
			return !this.prevVer || (this.prevVer != this.curVer);
		},
		//以前のバージョンとして記録している情報を更新
		updatePrevVersion: function(){
			localStorage[Extension.prototype.STORE_KEY.PREV_VERSION] = this.curVer;
		},
		//エクステンションがバージョンアップされていれば通知する
		notifyIfUpgraded: function(){
			if (this.isUpdated()) {
				var id = Extension.prototype.getDetails('id');
				var n = webkitNotifications.createHTMLNotification(
					'update_notifier.html?prev=' + this.prevVer
				);
				//表示したら保持しているバージョン情報を更新
				n.ondisplay = function(){
					this.updatePrevVersion();
					this.init();
				}.bind(this);
				//表示
				n.show();
				//自動的に閉じる
				setTimeout(function(){ n.cancel(); }, 7000);
			}
		}
	},

	/**
	 * 渡された文字列をクリップボードにコピーする
	 * @param  {string} str コピーする文字列
	 */
	copyToClipBoard: function(str){
		var _org = document.oncopy ? document.oncopy.bind(null) : null;
		document.oncopy = function(event) {
			var mimetype = 'text';
			event.clipboardData.setData(mimetype, str);
			if (_.isFunction(_org)) {_org(event);}
			event.preventDefault();
		};
		document.execCommand("Copy", false, null);
		document.oncopy = _org;
	}
};

Extension.prototype.init.prototype = Extension.prototype;
