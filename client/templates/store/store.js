Template.store.helpers({
	'for_sale': function() {
		return items.find({'owner': Meteor.userId(), 'status': 'for_sale'}).fetch();
	},

	'quality' : function() {
		return ["bronze", "silver", "gold", "platinum"];
	},

	'dropButton' : function(quality) {
		Meteor.call('lookupCrateCost', quality, function(error, result) {
			if (error)
				console.log(error.message);

			else Session.set(quality + 'Cost', Math.floor(result))
		})

		if (Session.get(quality + 'Cost') && Meteor.user()) {
			return {
				'buttonQuality' : quality,
				'crateCost' : "$" + getCommaSeparatedValue(Session.get(quality + 'Cost')),
				'enabled' : Meteor.user().profile.bank_balance >= Session.get(quality + 'Cost')
			}
		}

		else return {
			'buttonQuality' : quality,
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
	}
})

Template.store.events ({
	'click .crate-button.enabled' : function(element) {
		var quality = $(element.target).data('button_quality');
		Meteor.call('openCrate', Meteor.userId(), quality, function(error, result) {
			if (error)
				console.log(error.message);

			Router.go("/loot");
		})
	}
})

Template.forSaleInfo.helpers({
	'itemData' : function(item_id) {
		var item_object = items.findOne(item_id);
		if (item_object != undefined) {
			
			var artwork_object = artworks.findOne(item_object.artwork_id);

			var item_data_object = {
				'title' : artwork_object.title,
				'date' : artwork_object.date,
				'artist' : artwork_object.artist,
				'rarity' : artwork_object.rarity,
				'medium' : artwork_object.medium,
				'width' : artwork_object.width,
				'height' : artwork_object.height,
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
