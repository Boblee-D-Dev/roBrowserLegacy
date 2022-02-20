/**
 * UI/Components/Mail/Mail.js
 *
 * Chararacter Mail
 *
 * This file is part of ROBrowser, Ragnarok Online in the Web Browser (http://www.robrowser.com/).
 *
 * @author Vincent Thibault
 * In some cases the client will send packet twice.eg NORMAL_ITEMLIST4; fixit [skybook888] 
 *
 */
 define(function(require)
 {
	 'use strict';
 
 
	 /**
	  * Dependencies
	  */
	 var DB                 = require('DB/DBManager');
	 var jQuery             = require('Utils/jquery');
	 var Preferences        = require('Core/Preferences');
	 var Client             = require('Core/Client');
	 var Session      		= require('Engine/SessionStorage');
	 var Renderer           = require('Renderer/Renderer');
	 var Mouse              = require('Controls/MouseEventHandler');
	 var InputBox           = require('UI/Components/InputBox/InputBox');
	 var ItemInfo           = require('UI/Components/ItemInfo/ItemInfo');
	 var Inventory			= require('UI/Components/Inventory/Inventory');
	 var UIManager          = require('UI/UIManager');
	 var UIComponent        = require('UI/UIComponent');
	 var htmlText           = require('text!./Mail.html');
	 var cssText            = require('text!./Mail.css');
	 var getModule    		= require;
 
 
	 /**
	  * Create Component
	  */
	 var Mail = new UIComponent( 'Mail', htmlText, cssText );
 
	 /**
	  * Store Mail items
	  */
	 Mail.list = [];
 
 
	 /**
	  * @var {number} used to remember the window height
	  */
	 var _realSize = 0;
 
 
	 /**
	  * @var {Preferences} structure
	  */
	 var _preferences = Preferences.get('Mail', {
		 x:        0,
		 y:        172,
		 width:    7,
		 height:   4,
		 show:     false,
		 reduce:   false,
		 magnet_top: false,
		 magnet_bottom: false,
		 magnet_left: true,
		 magnet_right: false,
		 item_add_email: {}
	 }, 2.0);
 
 
	 /**
	  * Initialize UI
	  * Create message
	  * 	To at most 50 characters
	  * 	Title at most 50 characters
	  * 	Email body max 198 characters
	  * Message box
	  * 	Display sender name is a maximum of 15, plus 3 characters "..."
	  * 	Display sender name in tooltip sent by sender has a maximum of 23 characters
	  * 	Display the title of the email sent by the sender has a maximum of 25, plus 3 characters "..."
	  * 	Display email title in tooltip sent by sender has a maximum of 39 characters
	  *  	The pagination numbers only appear when there is at least one message in the list, it displays "1/1" when there is only 1
	  *     The previous and next pagination events only work when there are more than 8 messages (VALIDATE)
	  */
	 Mail.init = function Init()
	 {
		this.ui.find('.right .close').click(this.onClosePressed.bind(this)).removeClass( "hover" );
		this.ui.find('#inbox').click(offCreateMessagesOnWindowMailbox);  // remove all item reset layout
		this.ui.find('#write').click(onWindowCreateMessages);  // remove all item reset layouts
		this.ui.find('#create_mail_cancel').click(offCreateMessagesOnWindowMailbox); // remove all item reset layout
		this.ui.find('#create_mail_send').click(sendCreateMessagesMail); // send mail

		this.ui
			.find('.container_item')
			// on drop item
			.on('drop', onDrop)
			.on('dragover', stopPropagation)
				// item
				.on('mouseover',   '.item', onItemOver)				
				.on('mouseout',    '.item', onItemOut)
				.on('dragstart',   '.item', onItemDragStart)
				.on('dragend',     '.item', onItemDragEnd)
				.on('contextmenu', '.item', onItemInfo);

		this.ui.find('#zeny_amt').click(onAddZenyInput);
		this.ui.find('#zeny_ok').click(onValidZenyInput);
		onWindowMailbox();
		this.draggable(this.ui.find('.titlebar'));
	 };
 
	 /**
	  * Apply preferences once append to body
	  */
	 Mail.onAppend = function OnAppend()
	 {
		this.init();
		// Apply preferences
		this.ui.css({
			top:  Math.min( Math.max( 0, _preferences.y), Renderer.height - this.ui.height()),
			left: Math.min( Math.max( 0, _preferences.x), Renderer.width  - this.ui.width())
		});
		
	 };

	 
	/**
	 * Add item to inventory
	 *
	 * @param {object} Item
	 */
	Mail.addItemSub = function AddItemSub(Index)
	{
		let item = _preferences.item_add_email;
		if(item.index !== Index){
			return false;
		}
		// Equip item (if not arrow)
		if (item.WearState && item.type !== ItemType.AMMO && item.type !== ItemType.CARD) {
			//Equipment.equip(item);
			return false;
		}

		var it      = DB.getItemInfo( item.ITID );
		var content = this.ui.find('.container_item');
		this.ui.find(".item" ).remove();
		content.append(
			'<div class="item" data-index="'+ item.index +'" draggable="true">' +
				'<div class="icon"></div>' +				
				'<div class="amount"><span class="count">' + (item.count || 1) + '</span></div>' +
			'</div>'
		);
		this.ui.find('.hide').show();
		Client.loadFile( DB.INTERFACE_PATH + 'item/' + ( item.IsIdentified ? it.identifiedResourceName : it.unidentifiedResourceName ) + '.bmp', function(data){
			content.find('.item[data-index="'+ item.index +'"] .icon').css('backgroundImage', 'url('+ data +')');
		});
		return true;
	};


	 /**
	  * Send from mail to inventory
	  * Remove item
	  */
	 Mail.removeItem = function removeItem()
	 {
		this.ui.find(".item" ).remove();
	 };

	 
	 /**
	  * Send from mail to inventory
	  * Remove zenys
	  */
	 Mail.removeZeny = function removeZeny()
	 {
		this.ui.find(".input_zeny_amt" ).val('');
	 };

	 /**
	  * Remove Mail from window (and so clean up items)
	  */
	 Mail.onRemove = function OnRemove()
	 {
		 this.list.length = 0;
		 // Save preferences
		 _preferences.show   =  this.ui.is(':visible');
		 _preferences.reduce = !!_realSize;
		 _preferences.y      =  parseInt(this.ui.css('top'), 10);
		 _preferences.x      =  parseInt(this.ui.css('left'), 10);
		 _preferences.width  =  Math.floor( (this.ui.width()  - (23 + 16 + 16 - 30)) / 32 );
		 _preferences.height =  Math.floor( (this.ui.height() - (31 + 19 - 30     )) / 32 );
		 _preferences.magnet_top = this.magnet.TOP;
		 _preferences.magnet_bottom = this.magnet.BOTTOM;
		 _preferences.magnet_left = this.magnet.LEFT;
		 _preferences.magnet_right = this.magnet.RIGHT;
		 _preferences.save();
		 removeCreateAllItem();
	 };  
 
	 /**
	  * Extend Mail window size
	  *
	  * @param {number} width
	  * @param {number} height
	  */
	 Mail.resize = function Resize( width, height )
	 {
		 width  = Math.min( Math.max(width,  6), 9);
		 height = Math.min( Math.max(height, 2), 6);
 
		 this.ui.css({
			 width:  23 + 16 + 16 + width  * 32,
			 height: 31 + 19      + height * 32
		 });
	 };

	 /**
	 * Create messages window size
	 */
	function onWindowMailbox()
	{	
		// List Email
		Mail.parseMailrefreshinbox();
		// Reset mail item and/or Zeny
		removeCreateAllItem();

		// Off window create mail
		Mail.ui.find('.block_create_mail').hide();
		Mail.ui.find('.text_to').val("");
		Mail.ui.find('.input_title').val("");
		Mail.ui.find('.textarea_mail').val("");
		Mail.ui.find('.input_zeny_amt').val("");
		Mail.ui.find('.input_add_item').val("");
		
		// on window list mail
		Mail.ui.find('.prev_next').show();
		Mail.ui.find('.block_mail').show();		
		Client.loadFile( DB.INTERFACE_PATH + 'basic_interface/maillist1_bg.bmp', function(url) {
			Mail.ui.find('.body').css('backgroundImage', 'url(' + url + ')');
		}.bind(this));
		Mail.ui.find('#title').text(DB.getMessage(1025));		
	};

	function offCreateMessagesOnWindowMailbox()
	{
		onWindowMailbox();
		// Reset mail item and/or Zeny
		removeCreateAllItem();// CZ_MAIL_RESET_ITEM
		
	};

	function sendCreateMessagesMail()
	{
		let to = Mail.ui.find('.text_to').val();
		to = to.length > 50 ? title.substring(0,50) : to;
		let title = Mail.ui.find('.input_title').val();
		title = title.length > 50 ? title.substring(0,50) : title;
		let message = Mail.ui.find('.textarea_mail').val();
		message = message.length > 198 ? message.substring(0,198) : message;

		let send_message = {
			ReceiveName: 	to, 
			Header:			title,
			msg_len:		message.length,
			msg:			message, 
		}
		
		Mail.parseMailSend(send_message);
	}

	 /**
	 * Open Create messages window size
	 */
	function onWindowCreateMessages()
	{
		// Reset mail item and/or Zeny
		removeCreateAllItem(); // CZ_MAIL_RESET_ITEM
		// Off window list mail
		Mail.ui.find('.prev_next').hide();
		Mail.ui.find('.block_mail').hide();

		// Off window create mail
		Mail.ui.find('.block_create_mail').show();
		Client.loadFile( DB.INTERFACE_PATH + 'basic_interface/maillist2_bg.bmp', function(url) {
			Mail.ui.find('.body').css('backgroundImage', 'url(' + url + ')');
		}.bind(this));
		Mail.ui.find('#title').text(DB.getMessage(1026));
	};

	function onAddZenyInput()
	{
		Mail.ui.find('#zeny_amt').hide();
		Mail.ui.find('#zeny_ok').show();
		Mail.ui.find('.input_zeny_amt').prop('disabled', false);		
		Mail.ui.find('.input_zeny_amt').focus().select();
		Mail.parseMailWinopen(2); // reset zeny
	}
	
	function onValidZenyInput()
	{	
		Mail.ui.find('#zeny_amt').show();
		Mail.ui.find('#zeny_ok').hide();
		let val_Zeny = Mail.ui.find('.input_zeny_amt').val().split(',').join('');
		val_Zeny     = Math.min( Math.max(0, val_Zeny), Session.zeny);
		val_Zeny 	 = isNaN(val_Zeny) ? 0 : val_Zeny;

		Mail.ui.find('.input_zeny_amt').val(prettifyZeny(val_Zeny));
		Mail.ui.find('.input_zeny_amt').prop('disabled', true);
		// add zeny to mail
		Mail.
			parseMailSetattach(
				0, //zeny
				val_Zeny
			);
	}

	/**
	 * Stop event propagation
	 */
	function stopPropagation( event )
	{
		event.stopImmediatePropagation();
		return false;
	}

	/**
	 * Drop an item in the equipment, equip it if possible
	 */
	function onDrop( event )
	{
		var item, data;
		event.stopImmediatePropagation();

		try {
			data = JSON.parse(event.originalEvent.dataTransfer.getData('Text'));
			item = data.data;
		}
		catch(e) {
			return false;
		}

		// Just allow item from storage
		if (data.type !== 'item' || (data.from == 'Storage' || data.from == 'Mail')) {
			return false;
		}
		
		// Have to specify how much
		if (item.count > 1) {
			InputBox.append();
			InputBox.setType('number', false, item.count);
			InputBox.onSubmitRequest = function OnSubmitRequest( count ) {
				InputBox.remove();

				if(data.from == 'Inventory')
				{
					Inventory.removeItem(
						item.index,
						parseInt(count, 10 )
					);		
				}
				
				Mail.parseMailSetattach(
					item.index,
					parseInt(count, 10 )
				);
				// add itens
				_preferences.item_add_email = item;
				_preferences.item_add_email.count = parseInt(count, 10 )
				_preferences.save();

			};
			return false;
		}

		if(data.from == 'Inventory'){
			Inventory.removeItem( item.index, 1 );						
		}

		Mail.parseMailSetattach( item.index, 1 );
		// add itens
		_preferences.item_add_email = item;
		_preferences.item_add_email.count = 1;
		_preferences.save();

		// this.addItemSub(item);
		return false;
	}


	/**
	 * Show item name when mouse is over
	 */
	function onItemOver()
	{
		var idx  = parseInt( this.getAttribute('data-index'), 10);
		var item = Mail.getItemByIndex(idx);

		if (!item) {
			return;
		}

		// Get back data
		var pos     = jQuery(this).position();
		var overlay = Mail.ui.find('.container_item .overlay');

		// Display box
		overlay.show();
		overlay.text(DB.getItemName(item) + ' ' + (item.count || 1) + ' ea');

		if (item.IsIdentified) {
			overlay.removeClass('grey');
		}
		else {
			overlay.addClass('grey');
		}
	}

	/**
	 * Hide the item name
	 */
	function onItemOut()
	{
		Mail.ui.find('.container_item .overlay').hide();
	}


	/**
	 * Start dragging an item
	 */
	function onItemDragStart( event )
	{
		var index = parseInt(this.getAttribute('data-index'), 10);
		var item  = Mail.getItemByIndex(index);

		if (!item) {
			return;
		}

		// Set image to the drag drop element
		var img   = new Image();
		var url   = this.firstChild.style.backgroundImage.match(/\(([^\)]+)/)[1];
		img.src   = url.replace(/^\"/, '').replace(/\"$/, '');

		event.originalEvent.dataTransfer.setDragImage( img, 12, 12 );
		event.originalEvent.dataTransfer.setData('Text',
			JSON.stringify( window._OBJ_DRAG_ = {
				type: 'item',
				from: 'Mail',
				data:  item
			})
		);

		onItemOut();
	}

	/**
	 * Stop dragging an item
	 *
	 */
	function onItemDragEnd()
	{
		delete window._OBJ_DRAG_;
	}

	/**
	 * Get item info (open description window)
	 */
	function onItemInfo( event )
	{
		event.stopImmediatePropagation();

		var index = parseInt(this.getAttribute('data-index'), 10);
		var item  = Mail.getItemByIndex(index);

		if (!item) {
			return false;
		}

		// Don't add the same UI twice, remove it
		if (ItemInfo.uid === item.ITID) {
			ItemInfo.remove();
			return false;
		}

		// Add ui to window
		ItemInfo.append();
		ItemInfo.uid = item.ITID;
		ItemInfo.setItem(item);

		return false;
	}

	/**
	 * Search in a list for an item by its index
	 *
	 * @param {number} index
	 * @returns {Item}
	 */
	Mail.getItemByIndex = function getItemByIndex( index )
	{
		var i, count;
		var list = _preferences.item_add_email;

		if(list.index == index){
			return list;
		}

		return null;
	};

	/**
	 * Extend Mail window size
	 */
	function resizeHeight(height)
	{
		height = Math.min( Math.max(height, 8), 17);

		Mail.ui.find('.container .content').css('height', height * 32);
		Mail.ui.css('height', 31 + 19 + height * 32);
	}

	/**
	 * Prettify number (15000 -> 15,000)
	 *
	 * @param {number}
	 * @return {string}
	 */
	function prettifyZeny( value )
	{
		var num = String(value);
		var i = 0, len = num.length;
		var out = '';

		while (i < len) {
			out = num[len-i-1] + out;
			if ((i+1) % 3 === 0 && i+1 !== len) {
				out = ',' + out;
			}
			++i;
		}

		return out;
	}

	function removeCreateAllItem()
	{
		Mail.parseMailWinopen(0);
		// Layout reset zeny / item
		Mail.ui.find(".item" ).remove();
		Mail.ui.find(".input_zeny_amt" ).val('');
	}

	 /**
	  * Extend Mail window size
	  */
	 function onResize()
	 {
		var ui         = Mail.ui;
		var top        = ui.position().top;
		var lastHeight = 0;
		var _Interval;

		function resizing()
		{
			var extraY = 31 + 19 - 30;
			var h = Math.floor( (Mouse.screen.y - top  - extraY) / 32 );

			// Maximum and minimum window size
			h = Math.min( Math.max(h, 8), 17);

			if (h === lastHeight) {
				return;
			}

			resizeHeight(h);
			lastHeight = h;
		}

		// Start resizing
		_Interval = setInterval( resizing, 30);

		// Stop resizing on left click
		jQuery(window).on('mouseup.resize', function(event){
			if (event.which === 1) {
				clearInterval(_Interval);
				jQuery(window).off('mouseup.resize');
			}
		});
	 }

	
	 /**
	 * Callbacks
	 */
	Mail.onClosePressed  = function onClosePressed(){};
	Mail.parseMailWinopen = function parseMailWinopen(/*type*/){};
	Mail.parseMailrefreshinbox = function parseMailrefreshinbox(){};
	Mail.parseMailSetattach = function parseMailSetattach(/*index, count*/){};
	Mail.reqRemoveItem   = function reqRemoveItem(/*index, count*/){};
	Mail.parseMailSend   = function parseMailSend(/*object*/){};

	 /**
	  * Create component and export it
	  */
	 return UIManager.addComponent(Mail);
 });
 