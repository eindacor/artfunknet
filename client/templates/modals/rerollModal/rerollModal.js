Template.rerollModal.events ({
	'click #cancel-modal' : function(event, template) {
    	Modal.hide("rerollModal");
    	Session.set('item_refresh', Session.get('selectedItem'));
    },

    'click .xp-reroll-button.enabled' : function() {
    	Meteor.call('rerollXPRating', Session.get('selectedItem'), function(error, result) {
    		if (error)
    			console.log(error.message);
    	});
    },

    'click .reroll-value-button.enabled' : function(element) {
    	var attribute_id = $(element.target).data('attribute_id');
		Meteor.call('rerollAttributeValue', Session.get('selectedItem'), attribute_id, function(error, result) {
			if (error)
				console.log(error.message);
		});
    },

    'click .reroll-attribute-button.enabled' : function(element) {
    	var attribute_id = $(element.target).data('attribute_id');
		Meteor.call('rerollAttribute', Session.get('selectedItem'), attribute_id, function(error, result) {
			if (error)
				console.log(error.message);
		});
    },
})

Template.rerollModal.helpers({
	'itemData' : function() {
		var item_object = items.findOne(Session.get('selectedItem'));
		if (!!item_object) {
			return {
				'title' : item_object.artwork_data.title,
				'artist' : item_object.artwork_data.artist,
				'xp_rating' : Math.floor(item_object.xp_rating * 100),
				'roll_count' : item_object.roll_count,
				'attribute' : item_object.attributes,

			}
		}

		else return {
			'title' : "",
			'artist' : "",
			'xp_rating' : "",
			'roll_count' : "",
			'attribute' : []
		}
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

	'valueColor' : function(value) {
		return 255 - Math.floor(value * 255);
	},

	'attributeValueText' : function(value) {
		return Math.floor(value * 100);
	}
})