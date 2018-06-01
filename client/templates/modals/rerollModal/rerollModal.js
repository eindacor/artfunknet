reroll_ui_tracker = new Tracker.Dependency;
var item_object;

var updateItemAttributeData = function(revised_object) {
	item_object = revised_object;
	reroll_ui_tracker.changed();
	updateItemArray();
}


Template.rerollModal.events ({
	'click #cancel-modal' : function(event, template) {
    	Modal.hide("rerollModal");
    },

   'click .reroll-value-button.enabled' : function(element) {
    	var attribute_id = $(element.target).data('attribute_id');
    	var item_id = $(element.target).data('item_id');

    	var player_interface = new PlayerIF(Meteor.user());

		Meteor.call('rerollAttributeValue', item_id, attribute_id, function(error, result) {
			if (error)
				console.log(error);

			else {
				updateItemAttributeData(result);
			}
		});
    },

    'click .reroll-attribute-button.enabled' : function(element) {
    	var attribute_id = $(element.target).data('attribute_id');
    	var item_id = $(element.target).data('item_id');

    	var player_interface = new PlayerIF(Meteor.user());

		Meteor.call('rerollAttribute', item_id, attribute_id, function(error, result) {
			if (error)
				console.log(error);

			else {
				updateItemAttributeData(result);
			}
		});
    },

	'click i.setting-false': function(element) {
		var unique_attribute_id = $(element.target).data().unique_attribute_id;
		var item_id = $(element.target).data('item_id');
		Meteor.call('setActiveUniqueAttribute', item_id, unique_attribute_id, function(error, result) {
			if (error)
				console.log(error)

			else {
				updateItemAttributeData(result);
			}
		})
	},

	'click .upgrade-button.af-color': function(element) {
		var item_id = $(element.target).data('item_id');
		Meteor.call('upgradeItem', item_id, function(error, result) {
			if(error)
				console.log(error);

			else {
				updateItemAttributeData(result);
			}
		})
	}
})

Template.rerollModal.rendered = function() {
	item_object = undefined;
}

Template.rerollModal.helpers({
	'error' : function() {
		return Session.get('createAuctionErrors');
	},

	'bankBalance' : function() {
		reroll_ui_tracker.depend();
		return Meteor.user().profile.bank_balance;
	},

	'canReroll' : function(item_object) {
		reroll_ui_tracker.depend();
		var player_item_permissions = new PlayerItemPermissions(new PlayerIF(Meteor.user()), new ItemIF(item_object));
		return player_item_permissions.canReroll();
	},

	'canChangeActiveUniqueAttribute' : function(item_object) {
		reroll_ui_tracker.depend();
		var player_item_permissions = new PlayerItemPermissions(new PlayerIF(Meteor.user()), new ItemIF(item_object));
		return player_item_permissions.canChangeActiveUniqueAttribute();
	},

	'attributeValueText' : function(value) {
		reroll_ui_tracker.depend();
		return Math.floor(value * 100);
	},

	'unique_attribute_data': function(unique_id, active_unique_attribute) {
		reroll_ui_tracker.depend();
		var unique_object = unique_attributes.findOne(unique_id);
		unique_object.current_selected = active_unique_attribute == unique_id;
		return unique_object;
	},

	'upgradeCost': function(item_object) {
		reroll_ui_tracker.depend();
		var player_item_interface = new PlayerItemIF(new PlayerIF(Meteor.user()), new ItemIF(item_object));
		var upgrade_cost = player_item_interface.getUpgradeCost();
		
		var cost_array = [];

		for (var i=0; i<knowledge_types.length; i++) {
			var type = knowledge_types[i];
			if (upgrade_cost[type] != undefined) {
				var amount_available = Meteor.user().profile.knowledge[type]
				var amount = upgrade_cost[type];
				cost_array.push({
					'color': ARTWORK_RARITIES[i],
					'amount': amount,
					'name': type.replace("_", " "),
					'available': amount_available,
					'can_afford': amount_available >= amount,
					'type': type
				})
			}
			
		}

		return cost_array;
	},

	'min_roll': function(item_object, type) {
		reroll_ui_tracker.depend();
		var player_item_interface = new PlayerItemIF(new PlayerIF(Meteor.user()), new ItemIF(item_object));
		return Math.floor(player_item_interface.getRerollMin(type) * 100);
	},

	'setItemData': function(original_item_object) {
		reroll_ui_tracker.depend();
		if (item_object == undefined) {
			return original_item_object;
		}

		else return item_object;
	}
})