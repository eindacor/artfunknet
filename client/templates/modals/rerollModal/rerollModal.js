Template.rerollModal.events ({
	'click #cancel-modal' : function(event, template) {
    	Modal.hide("rerollModal");
    },

   'click .reroll-value-button.enabled' : function(element) {
    	var attribute_id = $(element.target).data('attribute_id');
		Meteor.call('rerollAttributeValue', Session.get('selectedItem'), attribute_id, function(error, result) {
			if (error)
				console.log(error.message);

			else {
				updateItemTemplate(Session.get('selectedItem'), 0);
			}
		});
    },

    'click .reroll-attribute-button.enabled' : function(element) {
    	var attribute_id = $(element.target).data('attribute_id');
		Meteor.call('rerollAttribute', Session.get('selectedItem'), attribute_id, function(error, result) {
			if (error)
				console.log(error.message);

			else {
				updateItemTemplate(Session.get('selectedItem'), 0);
			}
		});
    },

	'click i.setting-false': function(event) {
		var unique_attribute_id = $(event.target).data().unique_attribute_id;
		Meteor.call('setActiveUniqueAttribute', Session.get('selectedItem'), unique_attribute_id, function(error) {
			if (error)
				console.log(error.message)

			else {
				updateItemTemplate(Session.get('selectedItem'), 0);
			}
		})
	},

	'click .upgrade-button.af-color': function() {
		Meteor.call('upgradeItem', Session.get('selectedItem'), function(error) {
			if(error)
				console.log(error);
		})
	}
})

Template.rerollModal.helpers({
	'itemData' : function() {
		return items.findOne(Session.get('selectedItem'));
	},

	'error' : function() {
		return Session.get('createAuctionErrors');
	},

	'rerollCost' : function() {
		var player_item_interface = new PlayerItemIF(Meteor.userId(), Session.get('selectedItem'));
		return getCommaSeparatedValue(player_item_interface.getRerollCost());
	},

	'bankBalance' : function() {
		return getCommaSeparatedValue(Meteor.user().profile.bank_balance);
	},

	'canReroll' : function() {
		var permissions = getPlayerItemPermissions(Meteor.userId(), Session.get('selectedItem'));
		return permissions.canReroll();
	},

	'attributeValueText' : function(value) {
		return Math.floor(value * 100);
	},

	'unique_attribute_data': function(unique_code) {
		var unique_object = unique_attributes.findOne({'code': unique_code});
		unique_object.current_selected = items.findOne(Session.get('selectedItem')).active_unique_attribute == unique_code;
		return unique_object;
	},

	'upgradeCost': function(item_id) {
		var cost_array = [];
		var player_item_interface = new PlayerItemIF(Meteor.userId(), item_id);
		var upgrade_cost = player_item_interface.getItemReader().getUpgradeCost();

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
					'can_afford': amount_available >= amount
				})
			}
			
		}

		return cost_array;
	}
})