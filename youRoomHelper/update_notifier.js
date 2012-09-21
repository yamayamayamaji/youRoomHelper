var updateNotifier = {
	/**
	 * (初期処理)
	 * 通知内容を設定する
	 */
	init: function(){
		var extInfo = chrome.app.getDetails();
		var iconPath, icons;

		//icon設定
		icons = extInfo.icons;
		iconPath = icons['48'] || icons['128'] || 'notification.png'
		$('<img src=' + iconPath + ' height="32" width="32">').appendTo('#icon');

		//本文設定
		var h = '<strong>' + extInfo.name + '</strong> was upgraded<br>'
				+ ' to <em>' + extInfo.version + '</em>'
				+ ' (from ' + localStorage['prev_version'] + ')... '
				+ '<a id="refNote" href="#">show details</a>';
		$('#description').html(h);
		$('#refNote').click(this.showNote);
	},

	/**
	 * リリースノートを表示する
	 */
	showNote: function(){
		var path = chrome.extension.getURL('release_notes.html');
		window.open(path);
	}
};

$(function(){ updateNotifier.init(); });
