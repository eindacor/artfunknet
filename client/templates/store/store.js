Template.store.helpers({
	'for_sale': function() {
		return items.find({'owner': Meteor.userId(), 'status': 'for_sale'});
	},

	'dropButton' : function() {
		Meteor.call('lookupCrateCost', "platinum", function(error, result) {
			if (error)
				console.log(error.message);

			else Session.set("platinum" + 'Cost', Math.floor(result))
		})

		if (Session.get("platinum" + 'Cost') && Meteor.user()) {
			return {
				'crateCost' : "$" + getCommaSeparatedValue(Session.get("platinum" + 'Cost')),
				'enabled' : Meteor.user().profile.bank_balance >= Session.get("platinum" + 'Cost')
			}
		}

		else return {
			'crateCost' : "",
			'enabled' : false
		}
	},

	'full' : function() {
		if (Meteor.userId() && Meteor.user())
			return items.find({'owner' : Meteor.userId(), 'status' : {$nin : ['unclaimed', 'for_sale']}}).count() >= Meteor.user().profile.inventory_cap;

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

	'wall_finish' : function() {
		if (Meteor.user()) {
			var owned_finishes = Meteor.user().profile.gallery_finishes.owned.wall_finishes;
			var owned_ids = Object.keys(owned_finishes);
			return gallery_finishes.find({'type': "wall finish", '_id': {$nin: owned_ids}});
		}
	},

	'floor_finish' : function() {
		if (Meteor.user()) {
			var owned_finishes = Meteor.user().profile.gallery_finishes.owned.floor_finishes;
			var owned_ids = Object.keys(owned_finishes);
			return gallery_finishes.find({'type': "floor finish", '_id': {$nin: owned_ids}});
		}
	},
})

Template.store.events ({
	'click .crate-button.enabled' : function(element) {
		Meteor.call('openCrate', Meteor.userId(), "platinum", function(error, result) {
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

	'click #purchase-finish': function(event) {
		var finish_id = $(event.target).closest('div').data().gallery_finish_id;
		var selected_finish = gallery_finishes.findOne(finish_id);
		var user_finish_object = {
			'filename': selected_finish.filename,
			'saturation': 1,
			'xp_rating': .1
		}

		var set_object = {};
		var array_selector_string = "profile.gallery_finishes.owned." + (selected_finish.type == "wall finish" ? "wall_finishes." : "floor_finishes.") + selected_finish._id;
		set_object[array_selector_string] = user_finish_object;
		Meteor.users.update(Meteor.userId(), {$set: set_object});
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
