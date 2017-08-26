var div_size_tracker = new Tracker.Dependency;
var display_details_tracker = new Tracker.Dependency;
var card_container_width;
var card_container_height;
var display_details_map = {};
var item_interface = undefined;

var action_icons = {
	'tagItem': "fa-tags",
	'archiveItem': "fa-archive",
	'setPermanent': "fa-heart",
	'unsetPermanent': "fa-heart af-color",
	'deleteItem': "fa-times",
	'claimItem': "fa-plus",
	'declineItem': "fa-times",
	'purchaseItem': "fa-shopping-cart",
	'displayItem': "fa-picture-o",
	'undisplayItem': "fa-picture-o af-color",
	'setForSale': "fa-binoculars",
	'unsetForSale': "fa-binoculars af-color",
	'setRepairing': "fa-wrench",
	'unsetRepairing': "fa-wrench af-color",
	'sellItem': "fa-usd",
	'auctionItem': "fa-gavel",
	'donateItem': "fa-share-square",
	'modItem': "fa-magic",
	'identifyItem': "fa-search",
	'redeemItem': "fa-shield"
}

var action_modals = {
	'tagItem': "tagItemModal",
	'archiveItem': "archiveModal",
	'deleteItem': "deleteModal",
	'purchaseItem': "purchaseModal",
	'sellItem': "quickSellModal",
	'donateItem': "donateModal",
	'modItem': "rerollModal",
	'auctionItem': "auctionModal",
	'identifyItem': "identifyForgeryModal"
}

var act = function(action_name, item_id, can_quick_discard) {
	if (action_name == "displayItem") {
		var player_interface = new PlayerIF(Meteor.user());
		var all_tutorial_items_displayed = items.find({'owner': player_interface.getId(), 'status': "displayed", 'tutorial_item': true}).count() == items.find({'owner': player_interface.getId(), 'tutorial_item': true}).count();
		if (player_interface.readyForTutorial("outro") && all_tutorial_items_displayed) {
			Meteor.call('changeTutorialStep', true, function(error) {
				if (error) {
					console.log(error)
				}

				else {
					buildTutorialContents();
				}
			})
		}
	}

	var defaultAction = function() {
		Meteor.call(action_name, item_id, function(error, result) {
			if (error) {
				console.log(error);
			}
			else {
				updateItemArray();
			}
		})
	}

	var defaultModal = function() {
		Blaze.renderWithData(Template.modalTemplate, {
			'modal_name': action_modals[action_name], 
			'modal_data': {
				'item_id': item_id
			}
		}, $('body')[0]);
	}

	if (action_modals[action_name] == undefined) {
		return defaultAction();
	}
	else {
		switch (action_name) {
			case "purchaseItem": 
				if (Meteor.user().profile.settings.quick_purchase) {
					defaultAction();
				}
				else {
					defaultModal();
				}
			case "sellItem": 
				if (can_quick_discard) {
					defaultAction();
				}
				else {
					defaultModal();
				}
				return;
			case "auctionItem": 
				Session.set('selectedItem', item_id);
				Modal.show('createAuctionModal');
				return;
			case "donateItem":
				if (can_quick_discard) {
					defaultAction();
				}
				else {
					defaultModal();
				}
				return;
			default: return defaultModal();
		}
	}
}

Template.itemInfo.rendered = function() {
	display_details_map = {};
	if ($('.card-container').length != 0) {
		card_container_height = $('.card-container').css('height').replace("px", "");
		card_container_width = $('.card-container').css('width').replace("px", ""); 
		div_size_tracker.changed();
	}
}

Template.itemInfo.helpers({
	'imageSize' : function(width, height) {
		div_size_tracker.depend();

		if ($('.card-container').length != 0) {
			var max_width = card_container_width;
			var max_height = card_container_height;

			var original_ratio = width / height;

			var height_when_width_maxed = max_width / original_ratio;

			if (height_when_width_maxed < max_height) {
				return {
					'image_width': Math.floor(original_ratio * max_height),
					'image_height': max_height
				}
			}

			else return {
				'image_width': max_width,
				'image_height': max_width / original_ratio
			} 
		}

		else return {
			'image_width': 20,
			'image_height': 20
		}
	},
	//TODO replace below status methods with more elegant solution -> DOM modification from updatestatus
	'displayedStatus': function(item_object) {
		if (item_object)
			return item_object.status == "displayed";
	},

	'auctionedStatus': function(item_object) {
		if (item_object)
			return item_object.status == "auctioned";
	},

	'repairingStatus': function(item_object) {
		if (item_object)
			return item_object.repairing;
	},

	'isOwner' : function(owner_id) {
		return Meteor.userId() == owner_id;
	},

	'showDetails': function(item_object) {
		return item_object.level != undefined;
	},

	'hide_mask': function(item_object) {
		return !item_object.permanent && item_object.status != "displayed" && item_object.status != "auctioned";
	},

	'display_details': function(item_object) {
		try {
			display_details_tracker.depend();
			if (display_details_map[item_object._id] == undefined) {
				Meteor.call('getDisplayDetails', item_object, function(error, result) {
					if (error)
						console.log(error)

					else {
						display_details_map[item_object._id] = result;
						display_details_tracker.changed();
					}
				})
			}
			
			return display_details_map[item_object._id];
		}
		catch (error) {
			console.log(error.message);
		}
	},

	'action_icon': function(action_name) {
		return action_icons[action_name];
	}
})

Template.itemInfo.events({
	'click .card-container' : function(element) {
		var target = $(element.target);
		var item_id = target.closest('.card-container').data('item_id');
		if ($('.template-modalTemplate').length == 0) {
			Blaze.renderWithData(Template.modalTemplate, {
				'modal_name': "fullViewModal", 
				'modal_data': {
					'item_id': item_id
				}
			}, $('body')[0]);
		}
	},

	'mouseover .item-attribute' : function(element) {
		var attribute_id = element.target.dataset.attribute_id;
		var value = Math.floor(Number(element.target.dataset.attribute_value) * 100);
		var description = element.target.dataset.attribute_description;
		var hover_string = "level " + (isNaN(value) ? '?' : value) + " " + description;
		setFootnote(hover_string, Math.floor(Math.random() * 1000));
	},

	'click .level-indicator': function(element) {
		element.stopPropagation();
		var item_id = $(element.target).data().item_id;
		Blaze.renderWithData(Template.modalTemplate, {
			'modal_name': "rerollModal", 
			'modal_data': {
				'item_id': item_id
			}
		}, $('body')[0]);
	},

	'click .action-icon': function(event) {
		var item_id = $(event.target).data().item_id;
		var action_name = $(event.target).data().action_name;
		var can_quick_discard = $(event.target).data().can_quick_discard;
		act(action_name, item_id, can_quick_discard);
	}
})
