var div_size_tracker = new Tracker.Dependency;
var display_details_tracker = new Tracker.Dependency;

selection_trackers = {};

var card_container_width;
var card_container_height;
var display_details_map = {};
var item_interface = undefined;

getSelectionTracker = function(category) {
	if (selection_trackers[category] == undefined) {
		selection_trackers[category] = new Tracker.Dependency;
	}

	return selection_trackers[category];
}

getSelectedIds = function(category) {
	getSelectionTracker(category).depend();
	var selected = Session.get('selected_ids');
	if (selected) {
		var selected_ids = selected[category];
		return selected_ids ? selected_ids : [];
	}
	else return [];
}

setSelectedIds = function(category, ids) {
	var selected = Session.get('selected_ids');
	if (selected == undefined) {
		selected = {};
	}
		
	selected[category] = ids;
	Session.set('selected_ids', selected);
	getSelectionTracker(category).changed();
}

addSelectedId = function(category, id) {
	var selected = Session.get('selected_ids');
	if (selected) {
		if (selected[category]) {
			if (selected[category].indexOf(id) == -1) {
				selected[category].push(id);
			}
		}
		else {
			selected[category] = [id];
		}
	}
	else {
		selected = {};
		selected[category] = ids;
	}

	Session.set('selected_ids', selected)
	getSelectionTracker(category).changed();
}

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
	'redeemItem': "fa-shield",
	'forgeItem': "fa-user-secret"
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
	'identifyItem': "identifyForgeryModal",
	'forgeItem': "forgeModal"
}

var act = function(action_name, item_id, can_quick_discard) {
	if (action_name == "getLink") {
		console.log("test");
		$(document).getElementById();
		return;
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
				return;
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
	item_interface = undefined;
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
	},

	'item_is_selected': function(category, item_id) {
		var selected_items = getSelectedIds(category);
		return selected_items.indexOf(item_id) != -1;
	},

	'can_select': function(category) {
		var selected_items = getSelectedIds(category);
		var selection_limit = Session.get('selection_limit');
		if (selected_items && selection_limit !== undefined) {
			return selected_items.length < selection_limit;
		}
		else return false;
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
		var selected_action_name = $(event.target).attr('data-action_name');
		var can_quick_discard = $(event.target).attr('data-can_quick_discard');
		act(selected_action_name, item_id, can_quick_discard);
	},

	'click .share-button': function(event) {
		var item_id = $(event.target).data().item_id;
		var text_area_id = "link_" + item_id;
		var text_to_copy = document.getElementById(text_area_id);
		text_to_copy.select();
		document.execCommand("copy");
	},

	'click .select-box': function(event) {
		var item_id = $(event.target).data().item_id;
		var category = $(event.target).data().selection_category;
		var selected_items = getSelectedIds(category);
		var selection_limit = Session.get('selection_limit');

		if (selected_items == undefined) {
			selected_items = [];
		}

		if (selection_limit == undefined) {
			selection_limit = 0;
		}

		var index = selected_items.indexOf(item_id);
		if (index == -1) {
			if (selected_items.length < selection_limit) {
				selected_items.push(item_id);
			}
		}	
		else {
			selected_items.splice(index, 1);
		}

		setSelectedIds(category, selected_items);
	}
})
