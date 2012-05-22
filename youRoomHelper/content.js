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
	PREV_VERSION: 'prev_version',
	VERSION_CONFIRMED: 'version_confirmed'
};

youRoomHelper = {
	/**
	 * 初期処理
	 */
	init: function(){
		//Facebookガジェットを非表示にする
		$('.social-gadget').remove();

		//バージョン更新確認
		if (sessionStorage[STORE_KEY.VERSION_CONFIRMED] != 'true') {
			this.versionMgr.init();
		}
	},

	/**
	 * バージョン管理オブジェクト
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
	}
};

$(function(){youRoomHelper.init()});
