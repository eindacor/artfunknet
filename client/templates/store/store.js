var crate_tracker = new Tracker.Dependency;
var expansion_tracker = new Tracker.Dependency;
var crate_objects = undefined;
var expansion_cost = undefined;

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

Template.store.helpers({
	'for_sale': function() {
		return items.find({'owner': Meteor.userId(), 'status': 'for_sale'});
	},

	'can_afford': function(cost) {
		if (cost)
			return Meteor.user().profile.bank_balance >= cost;

		else return false;
	},

	'crate_button' : function() {
		crate_tracker.depend();
		if (crate_objects == undefined) {
			getCrates();
		}

		else return crate_objects;
	},

	'full' : function() {
		if (Meteor.userId() && Meteor.user())
			return inventoryIsFull(Meteor.user());

		else return false;
	},

	'bank_balance' : function() {
		if (Meteor.userId() && Meteor.user())
			return getCommaSeparatedValue(Meteor.user().profile.bank_balance);

		else return 0;
	},

	'canPurchase' : function(item_id) {
		return true;
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

	'can_expand': function() {
		if (Meteor.user())
			return Meteor.user().profile.expansion_slots < getMaxExpansionSlots();

		else return false;
	},

	'expansion_cost': function() {
		expansion_tracker.depend();
		if (expansion_cost == undefined)
			getExpansionSlotCost();

		else return expansion_cost;
	},

	'expansions_remaining': function() {
		if (Meteor.user())
			return getMaxExpansionSlots() - Meteor.user().profile.expansion_slots;

		else return 0;
	}
})

Template.store.events ({
	'click .crate-button.enabled' : function(element) {
		var crate_size = ($(element.target).data().crate_size);
		Meteor.call('openCrate', crate_size, function(error, result) {
			if (error)
				console.log(error.message);

			Router.go("/loot");
		})
	},

	'click #decline-all' : function() {
		Meteor.call('clearAllForSale', function(error) {
			if (error)
				console.log(error.message);
		})
	},

	'click .inventory-expansion-button.enabled' : function() {
		Meteor.call('purchaseExpansionSlot', function(error, result) {
			if (error)
				console.log(error)

			else getExpansionSlotCost();
		})
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
				'xp_rating' : item_object.xp_rating,
				'xp_rating_text' : Math.floor(item_object.xp_rating * 100)
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
				'xp_rating' : "",
				'xp_rating_text' : ""
			}
		}
	}
})

Template.forSaleInfo.events({
	'mouseover .item-attribute' : function(element) {
		var attribute_id = element.target.dataset.attribute_id;
		var value = Math.floor(Number(element.target.dataset.attribute_value) * 100);
		var description = element.target.dataset.attribute_description;
		var hover_string = "level " + value + " " + description;
		setFootnote(hover_string, Math.floor(Math.random() * 1000));
	}
})

Template.store.rendered = function() {
	crate_objects = undefined;
	expansion_cost = undefined;
	getCrates();
	getExpansionSlotCost();
}