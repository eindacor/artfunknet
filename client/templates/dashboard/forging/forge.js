var forged_preview_tracker = new Tracker.Dependency;
var forged_item_data;

var updateForgedItemData = function() {
	var artwork_id = $('#artwork-selector').val();

	if (artwork_id == undefined) {
		return;
	}

	var item_data = {
		'artwork_id': artwork_id,
		'artwork_data': artworks.findOne(artwork_id),
		'foil': $('input:radio[name=foil_selector]:checked').val() == "true",
		'unlocked': $('input:radio[name=unlocked_selector]:checked').val() == "true",
		'seasonal': $('input:radio[name=seasonal_selector]:checked').val() == "true",
		'vintage': $('input:radio[name=vintage_selector]:checked').val() == "true",
		'lottery': Number($('input:radio[name=lottery_selector]:checked').val()),
		'level': Number($('input:radio[name=level_selector]:checked').val()),
		'authenticity': {
			'forgery_quality': .5
		}
	}

	forged_item_data = item_data;
	forged_preview_tracker.changed();
}

Template.forge.helpers({
	'archived_artworks': function() {
		var distinct_artworks = _.uniq(items.find({'status': "archived", 'displaced': false, 'owner': Meteor.userId()}, {sort: {'artwork_data.artist': 1}}).fetch().map(function(item_object) {
			return item_object.artwork_id;
		}), true);

		return distinct_artworks;
	},

	'admin_artworks': function() {
		return artworks.find({'active': true});
	},

	'artwork': function(artwork_id) {
		return artworks.findOne(artwork_id);
	},

	'isAdmin': function() {
		//return false;
		return Meteor.user().profile.user_type == "admin";
	},

	'forged_item_data': function() {
		forged_preview_tracker.depend();
		if (forged_item_data == undefined) {
			updateForgedItemData();
		}

		return forged_item_data;
	},

	'contract_count': function() {
		return Meteor.user().profile.forgery_contracts;
	},

	'forgery_heat': function() {
		forged_preview_tracker.depend();

		if (forged_item_data == undefined) {
			return 1;
		}

		else return getForgeryHeat(forged_item_data);
	},

	// FORGERY_HEAT_CATEGORY = {
	//     'QUEST': "quest",
	//     'SELL': "sell",
	//     'DONATE': "donate",
	//     'COLLECTOR': "collector"
	// }

	'forgery_heat_map': function() {
		forged_preview_tracker.depend();

		if (forged_item_data == undefined) {
			return {};
		}

		else return {
			'default': getForgeryHeat(forged_item_data),
			'quest': getForgeryHeat(forged_item_data, FORGERY_HEAT_CATEGORY.QUEST),
			'sell': getForgeryHeat(forged_item_data, FORGERY_HEAT_CATEGORY.SELL),
			'donate': getForgeryHeat(forged_item_data, FORGERY_HEAT_CATEGORY.DONATE),
			'collector': getForgeryHeat(forged_item_data, FORGERY_HEAT_CATEGORY.COLLECTOR),
			'display': getForgeryHeat(forged_item_data, FORGERY_HEAT_CATEGORY.DISPLAY)
		}
	},

	'forgery_heat_color': function(forgery_heat) {
		var blue_value = Math.floor((1 - forgery_heat) * 255);
		var red_value = Math.floor(forgery_heat * 255);
		return "rgb(" + red_value + ", 0, " + blue_value + ")";
	},

	'heat_label': function(forgery_heat) {
		if (forgery_heat < .2) {
			return "very low";
		}

		else if (forgery_heat < .4) {
			return "low";
		}

		else if (forgery_heat < .6) {
			return "medium";
		}

		else if (forgery_heat < .8) {
			return "high";
		}

		else return "very high";
	}
})

Template.forge.events({
	'change #artwork-selector, change #foil-select, change #unlocked-select, change #seasonal-select, change #vintage-select, change #lottery-select, change #level-select': function() {
		updateForgedItemData();
	},

	'click #forge-item': function() {
		Meteor.call('forgeItem', forged_item_data, function(error, result) {
			if (error) {
				console.log(error.message);
			}
		})
	}
})

Template.forge.rendered = function() {
	forged_item_data = undefined;
	forged_preview_tracker.changed();
}