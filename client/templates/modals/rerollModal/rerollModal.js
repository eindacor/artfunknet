var player_item_interface;
var player_interface;
var item_interface;
var player_item_permissions;
var interface_tracker = new Tracker.Dependency;
var reroll_cost_tracker = new Tracker.Dependency;
var reroll_cost;
var upgrade_cost_tracker = new Tracker.Dependency;
var upgrade_cost;

updateInterfaces = function() {
	item_interface = new ItemIF(Session.get('selectedItem'));
	player_interface = new PlayerIF(Meteor.user());
	player_item_interface = new PlayerItemIF(player_interface, item_interface);
	player_item_permissions = new PlayerItemPermissions(player_interface, item_interface); 
	reroll_cost = undefined;
	upgrade_cost = undefined;
	reroll_cost_tracker.changed();
	upgrade_cost_tracker.changed();
	interface_tracker.changed();
}

var updateRerollCost = function() {
	if (item_interface) {
		Meteor.call('getRerollCost', item_interface.getId(), function(error, result) {
			if (error) {
				console.log(error)
			}

			else {
				reroll_cost = result;
				reroll_cost_tracker.changed();
			}
		})
	}
}

var updateUpgradeCost = function() {
	if (item_interface) {
		Meteor.call('getUpgradeCost', item_interface.getId(), function(error, result) {
			if (error) {
				console.log(error)
			}

			else {
				upgrade_cost = result;
				upgrade_cost_tracker.changed();
			}
		})
	}
}

Template.rerollModal.events ({
	'click #cancel-modal' : function(event, template) {
    	Modal.hide("rerollModal");
    },

   'click .reroll-value-button.enabled' : function(element) {
    	var attribute_id = $(element.target).data('attribute_id');

    	var player_interface = new PlayerIF(Meteor.user());
		if (player_interface.readyForTutorial("display_modded")) {
			Meteor.call('changeTutorialStep', true, function(error) {
				if (error) {
					console.log(error)
				}

				else {
					buildTutorialContents();
				}
			})
		}

		Meteor.call('rerollAttributeValue', Session.get('selectedItem'), attribute_id, function(error, result) {
			if (error)
				console.log(error.message);

			else {
				var item_object = items.findOne(item_interface.getId());
				updateInterfaces(item_object);
				var container_id = "#item_" + item_object._id;
				fillItemContainer($(container_id), new PlayerItemIF(new PlayerIF(Meteor.user()), new ItemIF(item_object)));
			}
		});
    },

    'click .reroll-attribute-button.enabled' : function(element) {
    	var attribute_id = $(element.target).data('attribute_id');

    	var player_interface = new PlayerIF(Meteor.user());
		if (player_interface.readyForTutorial("mod_value")) {
			Meteor.call('changeTutorialStep', true, function(error) {
				if (error) {
					console.log(error)
				}

				else {
					buildTutorialContents();
				}
			})
		}

		Meteor.call('rerollAttribute', Session.get('selectedItem'), attribute_id, function(error, result) {
			if (error)
				console.log(error.message);

			else {
				var item_object = items.findOne(item_interface.getId());
				updateInterfaces(item_object);
				var container_id = "#item_" + item_object._id;
				fillItemContainer($(container_id), new PlayerItemIF(new PlayerIF(Meteor.user()), new ItemIF(item_object)));
			}
		});
    },

	'click i.setting-false': function(event) {
		var unique_attribute_id = $(event.target).data().unique_attribute_id;
		Meteor.call('setActiveUniqueAttribute', Session.get('selectedItem'), unique_attribute_id, function(error) {
			if (error)
				console.log(error.message)

			else {
				var item_object = items.findOne(item_interface.getId());
				updateInterfaces(item_object);
				var container_id = "#item_" + item_object._id;
				fillItemContainer($(container_id), new PlayerItemIF(new PlayerIF(Meteor.user()), new ItemIF(item_object)));
			}
		})
	},

	'click .upgrade-button.af-color': function() {
		Meteor.call('upgradeItem', Session.get('selectedItem'), function(error) {
			if(error)
				console.log(error);

			else {
				var item_object = items.findOne(item_interface.getId());
				updateInterfaces(item_object);
				var container_id = "#item_" + item_object._id;
				fillItemContainer($(container_id), new PlayerItemIF(new PlayerIF(Meteor.user()), new ItemIF(item_object)));
			}
		})
	}
})

Template.rerollModal.rendered = function() {
	updateInterfaces();
	refreshTutorial("mod_attribute");
}

Template.rerollModal.helpers({
	'itemData' : function() {
		interface_tracker.depend();
		if (item_interface)
			return item_interface.getItemObject();

		else updateInterfaces();
	},

	'error' : function() {
		return Session.get('createAuctionErrors');
	},

	'rerollCost' : function() {
		reroll_cost_tracker.depend();
		if (reroll_cost == undefined) {
			updateRerollCost();
		}

		else return reroll_cost;
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

		upgrade_cost_tracker.depend();
		if (upgrade_cost == undefined) {
			updateUpgradeCost();
		}

		else {
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
		}
	},

	'min_roll': function(type) {
		interface_tracker.depend();
		return Math.floor(player_item_interface.getRerollMin(type) * 100);
	}
})