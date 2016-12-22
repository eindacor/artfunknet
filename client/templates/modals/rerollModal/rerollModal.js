Template.rerollModal.events ({
	'click #cancel-modal' : function(event, template) {
    	Modal.hide("rerollModal");
    },

    'click .xp-reroll-button.enabled' : function() {
    	Meteor.call('rerollXPRating', Session.get('selectedItem'), function(error, result) {
    		if (error)
    			console.log(error.message);

    		else {
				Session.set('item_to_update', items.findOne(Session.get('selectedItem')));
			}
    	});
    },

    'click .reroll-value-button.enabled' : function(element) {
    	var attribute_id = $(element.target).data('attribute_id');
		Meteor.call('rerollAttributeValue', Session.get('selectedItem'), attribute_id, function(error, result) {
			if (error)
				console.log(error.message);

			else {
				Session.set('item_to_update', items.findOne(Session.get('selectedItem')));
			}
		});
    },

    'click .reroll-attribute-button.enabled' : function(element) {
    	var attribute_id = $(element.target).data('attribute_id');
		Meteor.call('rerollAttribute', Session.get('selectedItem'), attribute_id, function(error, result) {
			if (error)
				console.log(error.message);

			else {
				Session.set('item_to_update', items.findOne(Session.get('selectedItem')));
			}
		});
    },

	'click i.setting-false': function(event) {
		var unique_attribute_id = $(event.target).data().unique_attribute_id;
		Meteor.call('setActiveUniqueAttribute', Session.get('selectedItem'), unique_attribute_id, function(error) {
			if (error)
				console.log(error.message)
			
			else {
				Session.set('item_to_update', items.findOne(Session.get('selectedItem')));
			}
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
		Meteor.call('getRerollCost', Session.get('selectedItem'), function(error, result) {
			if (error)
				console.log(error.message);

			else {
				Session.set('reroll_cost', result);
			}
		});

		if (Session.get('reroll_cost'))
			return getCommaSeparatedValue(Session.get('reroll_cost'));

		else return 0;
	},

	'bankBalance' : function() {
		return getCommaSeparatedValue(Meteor.user().profile.bank_balance);
	},

	'canReroll' : function() {
		Meteor.call('getRerollCost', Session.get('selectedItem'), function(error, result) {
			if (error)
				console.log(error.message);

			else {
				Session.set('can_reroll', result <= Meteor.user().profile.bank_balance);
			}
		});

		if (Session.get('can_reroll') !== undefined)
			return Session.get('can_reroll');

		else return false;
	},

	'attributeValueText' : function(value) {
		return Math.floor(value * 100);
	},

	'unique_attribute_data': function(unique_code) {
		var unique_object = unique_attributes.findOne({'code': unique_code});
		unique_object.current_selected = items.findOne(Session.get('selectedItem')).active_unique_attribute == unique_code;
		return unique_object;
	}
})