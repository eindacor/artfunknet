var player_item_interface;
var player_interface;
var item_interface;
var player_item_permissions;
var interface_tracker = new Tracker.Dependency;

updateInterfaces = function(item_object) {
	item_interface = new ItemIF(item_object);
	player_interface = new PlayerIF(Meteor.user());
	player_item_interface = new PlayerItemIF(player_interface, item_interface);
	player_item_permissions = new PlayerItemPermissions(player_interface, item_interface); 
	interface_tracker.changed();
}

Template.rerollModal.events ({
	'click #cancel-modal' : function(event, template) {
    	Modal.hide("rerollModal");
    },

   'click .reroll-value-button.enabled' : function(element) {
    	var attribute_id = $(element.target).data('attribute_id');
		Meteor.call('rerollAttributeValue', item_interface.getId(), attribute_id, function(error, result) {
			if (error)
				console.log(error.message);

			else {
				updateInterfaces(items.findOne(item_interface.getId()));
			}
		});
    },

    'click .reroll-attribute-button.enabled' : function(element) {
    	var attribute_id = $(element.target).data('attribute_id');
		Meteor.call('rerollAttribute', item_interface.getId(), attribute_id, function(error, result) {
			if (error)
				console.log(error.message);

			else {
				updateInterfaces(items.findOne(item_interface.getId()));
			}
		});
    },

	'click i.setting-false': function(event) {
		var unique_attribute_id = $(event.target).data().unique_attribute_id;
		Meteor.call('setActiveUniqueAttribute', item_interface.getId(), unique_attribute_id, function(error) {
			if (error)
				console.log(error.message)

			else {
				updateInterfaces(items.findOne(item_interface.getId()));
			}
		})
	},

	'click .upgrade-button.af-color': function() {
		Meteor.call('upgradeItem', item_interface.getId(), function(error) {
			if(error)
				console.log(error);

			else {
				updateInterfaces(items.findOne(item_interface.getId()));
			}
		})
	}
})

Template.rerollModal.helpers({
	'error' : function() {
		return Session.get('createAuctionErrors');
	},

	'rerollCost' : function() {
		interface_tracker.depend();
		if (item_interface)
			return getCommaSeparatedValue(item_interface.getRerollCost());
	},

	'bankBalance' : function() {
		interface_tracker.depend();
		if (player_item_interface)
			return getCommaSeparatedValue(player_interface.getBankBalance());
	},

	'canReroll' : function() {
		interface_tracker.depend();
		if (player_item_permissions) {
			return player_item_permissions.canReroll();
		}
	},

	'canChangeActiveUniqueAttribute' : function() {
		interface_tracker.depend();
		if (player_item_permissions)
			return player_item_permissions.canChangeActiveUniqueAttribute();
	},

	'attributeValueText' : function(value) {
		return Math.floor(value * 100);
	},

	'unique_attribute_data': function(unique_id) {
		var unique_object = unique_attributes.findOne(unique_id);
		unique_object.current_selected = items.findOne(Session.get('selectedItem')).active_unique_attribute == unique_id;
		return unique_object;
	},

	'upgradeCost': function() {
		interface_tracker.depend();
		var cost_array = [];
		var upgrade_cost = player_item_interface.getItemIF().getUpgradeCost();

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

	'min_roll': function(type, item_object) {
		interface_tracker.depend();
		if (player_item_interface == undefined || item_interface.getId() != item_object._id) {
			updateInterfaces(item_object);
		}
		else return Math.floor(player_item_interface.getRerollMin(type) * 100);
	},

	'attribute': function(item_object) {
		interface_tracker.depend()
		if (item_interface == undefined || item_interface.getId() != item_object._id) {
			updateInterfaces(item_object)		
		}

		else return item_interface.getItemObject().attributes;
	}
})