var reroll_ui_tracker = new Tracker.Dependency;

var item_data = undefined;

var updateItemAttributeData = function(item_object) {
	item_data_force_update_tracker.changed();
	var container_id = "#item_" + item_object._id;
	fillItemContainer($(container_id), new PlayerItemIF(new PlayerIF(Meteor.user()), new ItemIF(item_object)));
}


Template.rerollModal.events ({
	'click #cancel-modal' : function(event, template) {
    	Modal.hide("rerollModal");
    },

   'click .reroll-value-button.enabled' : function(element) {
    	var attribute_id = $(element.target).data('attribute_id');

    	var player_interface = new PlayerIF(Meteor.user());

		Meteor.call('rerollAttributeValue', item_data._id, attribute_id, function(error, result) {
			if (error)
				console.log(error.message);

			else {
				updateItemAttributeData(result);
			}
		});
    },

    'click .reroll-attribute-button.enabled' : function(element) {
    	var attribute_id = $(element.target).data('attribute_id');

    	var player_interface = new PlayerIF(Meteor.user());

		Meteor.call('rerollAttribute', item_data._id, attribute_id, function(error, result) {
			if (error)
				console.log(error.message);

			else {
				updateItemAttributeData(result);
			}
		});
    },

	'click i.setting-false': function(event) {
		var unique_attribute_id = $(event.target).data().unique_attribute_id;
		Meteor.call('setActiveUniqueAttribute', item_data._id, unique_attribute_id, function(error) {
			if (error)
				console.log(error.message)

			else {
				updateItemAttributeData(result);
			}
		})
	},

	'click .upgrade-button.af-color': function() {
		Meteor.call('upgradeItem', item_data._id, function(error) {
			if(error)
				console.log(error);

			else {
				updateItemAttributeData(result);
			}
		})
	}
})

Template.rerollModal.rendered = function() {
	refreshTutorial("mod_attribute");
}

Template.rerollModal.helpers({
	'error' : function() {
		return Session.get('createAuctionErrors');
	},

	'rerollCost' : function(item_object) {
		reroll_ui_tracker.depend();
		var player_item_interface = new PlayerItemIF(new PlayerIF(Meteor.user()), new ItemIF(item_object));
		return player_item_interface.getRerollCost();
	},

	'bankBalance' : function() {
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
		return Math.floor(value * 100);
	},

	'unique_attribute_data': function(unique_id, active_unique_attribute) {
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
					'color': artwork_rarities[i],
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

	'setItemData': function(item_object) {
		item_data = item_object;
	}
})