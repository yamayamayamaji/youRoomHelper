/*!
 * background.js
 * in youRoomHelper (Google Chrome Extension)
 * https://github.com/yamayamayamaji/youRoomHelper
 * Copyright, Ryosuke Yamaji
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
		//オプションで設定されてない項目があればデフォルト値を設定
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
		},
		roomColorInfo: function(){
			return this.getRoomColorInfo();
		}
	},

	/**
	 * taskメッセージのレシーバ(拡張)
	 * @type {Object}
	 */
	execute: {
		changePageAction: function(opt, sender){
			this.changePageActionIcon(opt.type, sender.tab.id);
		},
		saveRoomColorInfo: function(opt){
			this.saveRoomColorInfo(opt.roomId, opt.colorInfo);
		}
	},

	/**
	 * 拡張機能のオプション設定値を取得する
	 * @return {object} オプション設定値のJSON
	 */
	getSettings: function(){
		const PREFIX = 'store.settings.';
		var ls = this.getLocalStorage(PREFIX),
			opts = {};
		for (var key in ls) {
			opts[key.replace(PREFIX, '')] = ls[key];
		}
		return opts;
	},

	/**
	 * ルームカラー情報を取得する
	 * @return {object} オプション設定値のJSON
	 */
	getRoomColorInfo: function(){
		const PREFIX = 'roomColorInfo.';
		var ls = this.getLocalStorage(PREFIX),
			colorInfo = {};
		for (var key in ls) {
			colorInfo[key.replace(PREFIX, '')] = ls[key];
		}
		return colorInfo;
	},

	/**
	 * ルームカラー情報を保存する
	 * @param  {String} roomId    ルームID
	 * @param  {Object} colorInfo カラー情報
	 */
	saveRoomColorInfo: function(roomId, colorInfo){
		const PREFIX = 'roomColorInfo.';
		var key = PREFIX + roomId;
		if (_.isEmpty(colorInfo)) {
			localStorage.removeItem(key);
		} else {
			localStorage[key] = JSON.stringify(colorInfo);
		}
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