/*!
 * background.js
 * in youRoomHelper (Google Chrome Extension)
 * https://github.com/yamayamayamaji/youRoomHelper
 * Copyright 2012, Ryosuke Yamaji
 *
 * License: MIT
 */

youRoomHelper = _.extend(new Extension({
	defaultSettings: {
		"hideSocialGadget": true,
		"enableShiftEnterPost": true,
		"enableMeetingMode": true,
		"meetingModeInterval": 3
	},

	/**
	 * 初期化
	 */
	init: function(){
		this.STORE_KEY = _.extend(this.STORE_KEY || {}, {
			AAA: 'aaa',
			BBB: 'bbb'
		});

		//設定されてない項目があればデフォルト値を設定
		_.each(this.defaultSettings, function(val, key){
			var key = 'store.settings.' + key;
			if (!localStorage[key]) {
				localStorage[key] = val;
			}
		}, this);
	},

	/**
	 * requierメッセージのレシーバ(拡張)
	 * @type {Object}
	 */
	get: {
		settings: function(){
			return this.getSettings();
		}
	},

	/**
	 * taskメッセージのレシーバ(拡張)
	 * @type {Object}
	 */
	execute: {
		changePageAction: function(opt, sender){
			this.changePageActionIcon(opt.type, sender.tab.id);
		}
	},

	/**
	 * オプション設定値を取得する
	 * @return {object} オプション設定値のJSON
	 */
	getSettings: function(){
		var prefix = 'store.settings.',
			opts = {}, val;
		for (var key in localStorage) {
			if (key.indexOf(prefix) !== -1) {
				val = localStorage[key];
				if (val === 'true') {
					val = true;
				} else if (val === 'false') {
					val = false;
				}
				opts[key.replace(prefix, '')] = val;
			}
		};
		return opts;
	},

	/**
	 * pageActionのアイコンを変更する
	 * @param  {string} 　type  どのタイプのアイコンに変更するか
	 * @param  {integer} tabId　アイコンを表示するタブのid
	 */
	changePageActionIcon: function(type, tabId){
		var name = this.getDetails('page_action').default_icon;
		//デフォルトアイコン以外の場合は、アイコン名を"デフォルトアイコン名-[type].png"に設定
		if (type && type != 'def' && type != 'default') {
			name = name.replace(/^([^.]+)(\..+)$/, '$1-' + type + '$2');
		}
		Extension.prototype.changePageActionIcon({path: name}, tabId);
	}
}));

youRoomHelper.init();