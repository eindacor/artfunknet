var crate_tracker = new Tracker.Dependency;
var expansion_tracker = new Tracker.Dependency;
var crate_objects = undefined;
var expansion_cost = undefined;
var dynamic_crates = undefined;
var dynamic_crate_tracker = new Tracker.Dependency;

var getExpansionSlotCost = function() {
	Meteor.call('getExpansionSlotCost', function(error, result) {
		if (error)
			console.log(error)

		else {
			expansion_cost = result;
			expansion_tracker.changed();
		}
	});
}

var getCrates = function() {
	Meteor.call('getCrates', function(error, result) {
		if (error)
			console.log(error.message);

		else {
			crate_objects = result;
			crate_tracker.changed();
		}
	})
}

var getDynamicCrates = function() {
	Meteor.call('getDynamicCrates', function(error, result) {
		if (error)
			console.log(error)

		else {
			dynamic_crates = result;
			dynamic_crate_tracker.changed();
		}
	})
}

Template.store.helpers({
	'item_set_statuses': function() {
		return ['for_sale'];
	},

	'can_afford': function(cost) {
		if (cost)
			return Meteor.user().profile.bank_balance >= cost;

		else return false;
	},

	'dynamic_crate': function() {
		dynamic_crate_tracker.depend();
		if (dynamic_crates == undefined) {
			getDynamicCrates();
		}

		return dynamic_crates;
	},

	'dynamic_remaining': function(crate_id) {
		if (Meteor.user().profile.crate_purchases[crate_id] == undefined) {
			return DYNAMIC_CRATE_PURCHASE_LIMIT;
		}

		else return DYNAMIC_CRATE_PURCHASE_LIMIT - Meteor.user().profile.crate_purchases[crate_id];
	},

	'attribute_icon': function(attribute_id) {
		var attribute_object = attributes.findOne(attribute_id);
		if (attribute_object)
			return attribute_object.icon;
	},

	'crate_button' : function() {
		crate_tracker.depend();
		if (crate_objects == undefined) {
			getCrates();
		}

		else return crate_objects;
	},

	'has_for_sale': function() {
		return items.findOne({
            'owner': Meteor.userId(),
            'status': "for_sale", 
            'foil': false, 
            'seasonal': false, 
            'lottery': 0, 
            'artwork_data.rarity': {$in: ["common", "uncommon", "rare"]}
        }) != undefined;
	},

	'expansion_cost': function() {
		expansion_tracker.depend();
		if (expansion_cost == undefined)
			getExpansionSlotCost();

		else return expansion_cost;
	},

	'expansion_number': function() {
		if (Meteor.user())
			return Meteor.user().profile.expansion_slots + 1;

		else return 0;
	},

	'crate_rarities': function(crate_object) {
		var seeds = crate_object.seeds;
		var crate_rarities = [];
		for (var i=0; i<seeds.length; i++) {
			if (seeds[i].type == "rarity") {
				crate_rarities.push(seeds[i].value)
			}
		}

		return crate_rarities;
	},

	'crate_types': function(crate_object) {
		var seeds = crate_object.seeds;
		var crate_item_types = [];
		for (var i=0; i<seeds.length; i++) {
			if (seeds[i].type == "item_type") {
				crate_item_types.push(seeds[i].value)
			}
		}

		return crate_item_types;
	},

	'crate_time_left': function(crate_expiration) {
		var remaining = moment(crate_expiration) - moment(Session.get('now'));
		return getCountdownString(remaining);
	}
})

Template.store.events ({
	'click .crate-button.enabled' : function(element) {
		var crate_id = $(element.target).data().crate_id;
		if (crate_id != undefined) {
			Meteor.call('openDynamicCrate', crate_id, function(error) {
				if (error)
					console.log(error);
			});
		}

		else {
			var crate_size = ($(element.target).data().crate_size);
			Meteor.call('openCrate', crate_size, function(error, result) {
				if (error)
					console.log(error.message);
			})
		}
	},

	'click #decline-all' : function() {
		Meteor.call('declineAllForSale', function(error) {
			if (error)
				console.log(error.message);

			else {
				updateItemArray();
			}
		})
	},

	'click #purchase-donate-all' : function() {
		Blaze.renderWithData(Template.modalTemplate, {
			'modal_name': "donateAllModal", 
			'modal_data': {
				'donation_reward': undefined,
				'purchase': true
			}
		}, $('body')[0]);
	},

	'click #purchase-archive-all' : function() {
		Blaze.renderWithData(Template.modalTemplate, {
			'modal_name': "archiveAllModal", 
			'modal_data': {
				'donation_reward': undefined,
				'purchase': true
			}
		}, $('body')[0]);
	},

	'click .inventory-expansion-button.enabled' : function() {
		Meteor.call('purchaseExpansionSlot', function(error, result) {
			if (error)
				console.log(error)

			else getExpansionSlotCost();
		})
	},

	'click .crate-image': function(element) {
		var crate_id = $(element.target).data().crate_id;
		Meteor.call('openDynamicCrate', crate_id, function(error) {
			if (error)
				console.log(error);

			getDynamicCrates();
		});
	}
})

Template.forSaleInfo.helpers({
	'itemData' : function(item_id) {
		var item_object = items.findOne(item_id);
		if (item_object != undefined) {
			var item_data_object = {
				'title' : item_object.artwork_data.title,
				'date' : item_object.artwork_data.date,
				'artist' : item_object.artwork_data.artist,
				'rarity' : item_object.artwork_data.rarity,
				'medium' : item_object.artwork_data.medium,
				'width' : item_object.artwork_data.width,
				'height' : item_object.artwork_data.height,
				'condition_text' : Math.floor(item_object.condition * 100) + '%',
				'condition' : item_object.condition,
				'attribute' : item_object.attributes,
				'item_id' : item_object._id,
				'level' : item_object.level
			}

			return item_data_object;
		}

		else {
			return {
				'title' : "",
				'date' : "",
				'artist' : "",
				'rarity' : "",
				'medium' : "",
				'width' : "",
				'height' : "",
				'condition_text' : "",
				'condition' : "",
				'attribute' : "",
				'item_id' : "",
				'level' : "",
			}
		}
	}
})

Template.store.rendered = function() {
	crate_objects = undefined;
	expansion_cost = undefined;
	dynamic_crates = undefined;
	getDynamicCrates();
	getCrates();
	getExpansionSlotCost();

	this.handle = Meteor.setInterval((function() {
		Session.set('now', moment().toISOString());
	}), 1000);
}