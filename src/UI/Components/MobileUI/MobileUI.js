/**
 * UI/Components/MobileUI/MobileUI.js
 *
 * Mobile/Touchscreen assist UI
 *
 * This file is part of ROBrowser, (http://www.robrowser.com/).
 *
+ */
define(function(require)
{
	'use strict';
	
	var jQuery			= require('Utils/jquery');
	var Context			= require('Core/Context');
	var UIManager		= require('UI/UIManager');
	var UIComponent		= require('UI/UIComponent');
	var Preferences		= require('Core/Preferences');
	var Session			= require('Engine/SessionStorage');
	var Renderer		= require('Renderer/Renderer');
	var PACKET			= require('Network/PacketStructure');
	var EntityManager	= require('Renderer/EntityManager');
	var Network			= require('Network/NetworkManager');
	var PathFinding		= require('Utils/PathFinding');
	var htmlText		= require('text!./MobileUI.html');
	var cssText			= require('text!./MobileUI.css');
	
	/**
	 * Create Component
	 */
	var MobileUI = new UIComponent('MobileUI', htmlText, cssText);

	/**
	 * @var {Preferences} window preferences
	 */
	var _preferences = Preferences.get('MobileUI', {
		x: 0,
		y: 0,
		zIndex:   1000,
		width: Renderer.width,
		height: Renderer.height,
		show: false,
	}, 1.0);
	
	var showButtons = false;
	var autoTargetTimer;
	const C_AUTOTARGET_DELAY = 500; //in ms. Lower values increase targeting frequency, but might cause performance drop when there are many enemies around!
	
	/**
	 * Initialize UI
	 */
	MobileUI.init = function init() {
		this.ui.find('#toggleUIButton').click(			function(e){ toggleButtons();			stopPropagation(e);});
		this.ui.find('#fullscreenButton').click(		function(e){ toggleFullScreen();		stopPropagation(e);});
		this.ui.find('#f10Button').click(				function(e){ keyPress(121);				stopPropagation(e);});
		this.ui.find('#f12Button').click(				function(e){ keyPress(123);				stopPropagation(e);});
		this.ui.find('#insButton').click(				function(e){ keyPress(45);				stopPropagation(e);});
		
		this.ui.find('#toggleTargetingButton').click(	function(e){ toggleTouchTargeting();	stopPropagation(e);});
		this.ui.find('#toggleAutoTargetButton').click(	function(e){ toggleAutoTargeting();		stopPropagation(e);});
		
		this.ui.find('#attackButton').click(			function(e){ attackTargeted();			stopPropagation(e);});
		
		this.ui.find('.buttons')
			.on('mousedown',	function(e){ jQuery(e.target).addClass('pressed'); })
			.on('touchstart',	function(e){ jQuery(e.target).addClass('pressed'); })
			.on('mouseup',		function(e){ jQuery(e.target).removeClass('pressed'); })
			.on('touchend',		function(e){ jQuery(e.target).removeClass('pressed'); });
		
	}
	
	
	/**
	 * Toggles full screen display
	 */
	function toggleFullScreen() {
		if (!Context.isFullScreen()) {
			Context.requestFullScreen();
		} else {
			Context.cancelFullScreen();
		}
	}
	
	/**
	 * Emulates a keypress event
	 *
	 * @param {number} keyId
	 */
	function keyPress(k) {
		var roWindow = window;
		roWindow.document.getElementsByTagName('body')[0].focus();
		roWindow.dispatchEvent(new KeyboardEvent('keydown', {
				keyCode: k,
				which: k
			}));
	}
	
	/**
	 * Toggles MobileUI button bars visibility (and thus buttons)
	 */
	function toggleButtons(){
		if(showButtons){
			
			MobileUI.ui.find('#topBar').addClass('disabled');
			MobileUI.ui.find('#leftBar').addClass('disabled');
			MobileUI.ui.find('#rightBar').addClass('disabled');
			
			if(Session.TouchTargeting){
				toggleTouchTargeting();
			}
			
			showButtons = false;
		} else {
			
			MobileUI.ui.find('#topBar').removeClass('disabled');
			MobileUI.ui.find('#leftBar').removeClass('disabled');
			MobileUI.ui.find('#rightBar').removeClass('disabled');
			
			showButtons = true;
		}
	}

	/**
	 * Toggles touch targeting
	 */
	function toggleTouchTargeting(){
		if(Session.TouchTargeting){
			
			MobileUI.ui.find('#toggleTargetingButton').removeClass('active');
			
			MobileUI.ui.find('#toggleAutoTargetButton').addClass('disabled');
			MobileUI.ui.find('#attackButton').addClass('disabled');
			
			if(Session.AutoTargeting){
				toggleAutoTargeting();
			}
			
			Session.TouchTargeting = false;
		} else {

			MobileUI.ui.find('#toggleTargetingButton').addClass('active');
			
			MobileUI.ui.find('#toggleAutoTargetButton').removeClass('disabled');
			MobileUI.ui.find('#attackButton').removeClass('disabled');
			
			Session.TouchTargeting = true;
		}
	}

	/**
	 * Toggles automatic targeting
	 */
	function toggleAutoTargeting(){
		if(Session.AutoTargeting){
			MobileUI.ui.find('#toggleAutoTargetButton').removeClass('active');
			Session.AutoTargeting = false;
		} else {
			MobileUI.ui.find('#toggleAutoTargetButton').addClass('active');
			Session.AutoTargeting = true;
			autoTarget();
		}
	}
	
	/**
	 * Attacks a targeted enemy (if present)
	 */
	function attackTargeted(){
		var main   = Session.Entity;
		var pkt;
		
		var entityFocus = EntityManager.getFocusEntity();
		
		if(!entityFocus || entityFocus.action === entityFocus.ACTION.DIE){ //If no target, try picking one first
			autoTarget();
			entityFocus = EntityManager.getFocusEntity();
		}

		if(entityFocus){
			var out   = [];
			var count = PathFinding.search(
				main.position[0] | 0, main.position[1] | 0,
				entityFocus.position[0] | 0, entityFocus.position[1] | 0,
				main.attack_range + 1,
				out
			);

			// Can't attack
			if (!count) {
				return true;
			}
			
			pkt           = new PACKET.CZ.REQUEST_ACT();
			pkt.action    = 7;
			pkt.targetGID = entityFocus.GID;

			// in range send packet
			if (count < 2) {
				Network.sendPacket(pkt);
				return true;
			}

			// Move to entity
			Session.moveAction = pkt;

			pkt         = new PACKET.CZ.REQUEST_MOVE();
			pkt.dest[0] = out[(count-1)*2 + 0];
			pkt.dest[1] = out[(count-1)*2 + 1];
			Network.sendPacket(pkt);
		}
	}
	
	/**
	 * Automatically targeting the closest enemy
	 */
	function autoTarget(){
		var Player = Session.Entity;
		var Entity = Player.constructor;
		
		var entityFocus = EntityManager.getFocusEntity();
		
		var closestEntity = EntityManager.getClosestEntity(Player, Entity.TYPE_MOB);
		
		if( closestEntity){
			
			if( entityFocus && closestEntity.GID !== entityFocus.GID ){
				entityFocus.onFocusEnd();
				EntityManager.setFocusEntity(null);
				
				//closestEntity.onMouseDown();
				closestEntity.onFocus();
				EntityManager.setFocusEntity(closestEntity);
			} else if (!entityFocus){
				//closestEntity.onMouseDown();
				closestEntity.onFocus();
				EntityManager.setFocusEntity(closestEntity);
			} else {
				//Same entity, nothing to do
			}
		}
		
		if(Session.AutoTargeting && Session.Playing){
			startAutoTarget();
		}
	}
	
	/**
	 * Starting automatic targeting cycle
	 */
	function startAutoTarget(){
		autoTargetTimer = window.setTimeout(autoTarget, C_AUTOTARGET_DELAY);
	}
	
	/**
	 * Stopping automatic targeting cycle
	 */
	function stopAutoTarget(){
		window.clearTimeout(autoTargetTimer);
	}

	/**
	 * Stop event propagation
	 */
	function stopPropagation(event){
		event.stopImmediatePropagation();
		return false;
	}

	/**
	 * Apply preferences once append to body
	 */
	MobileUI.onAppend = function onAppend() {
		// Apply preferences
		if (Session.isTouchDevice) {
			this.ui.show();
		} else {
			this.ui.hide();
		}

		this.ui.css({
			top: 0,
			left: 0,
			zIndex: 1000,
			width: Renderer.width,
			height: Renderer.height
		});
	};
	
	/**
	 * Removes MobileUI
	 */
	MobileUI.onRemove = function onRemove() {
		// Save preferences
		_preferences.y = 0;
		_preferences.x = 0;
		_preferences.zIndex = 1000;
		_preferences.width = Renderer.width;
		_preferences.height = Renderer.height;
		_preferences.save();
		
		if(Session.AutoTargeting){
			toggleAutoTargeting();
		}
	};
	
	/**
	 * Shows MobileUI
	 */
	MobileUI.show = function show() {
		this.ui.show();
	};
	
	/**
	 * Create component and export it
	 */
	return UIManager.addComponent(MobileUI);
});
