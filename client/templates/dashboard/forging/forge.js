var forged_preview_tracker = new Tracker.Dependency;

var getItemData = function() {
	var artwork_id = $('#artwork-selector').val();
	var item_data = {
		'artwork_id': artwork_id,
		'artwork_data': artworks.findOne(artwork_id),
		'foil': $('input:radio[name=foil_selector]:checked').val() == "true",
		'unlocked': $('input:radio[name=unlocked_selector]:checked').val() == "true",
		'seasonal': $('input:radio[name=seasonal_selector]:checked').val() == "true",
		'vintage': $('input:radio[name=vintage_selector]:checked').val() == "true",
		'lottery': Number($('input:radio[name=lottery_selector]:checked').val()),
		'level': Number($('input:radio[name=level_selector]:checked').val())
	}

	return item_data;
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
		return false;
		//TODO return Meteor.user().profile.user_type == "admin";
	},

	'forged_item_data': function() {
		forged_preview_tracker.depend();
		return getItemData();
	},

	'contract_count': function() {
		return Meteor.user().profile.forgery_contracts;
	}
})

Template.forge.events({
	'click #forge-item': function() {
		var item_data = getItemData();
		console.log(item_data);
	},

	'change #artwork-selector, change #foil-select, change #unlocked-select, change #seasonal-select, change #vintage-select, change #lottery-select, change #level-select': function() {
		forged_preview_tracker.changed();
	},

	'click #forge-item': function() {
		Meteor.call('forgeItem', getItemData(), function(error, result) {
			if (error) {
				console.log(error.message);
			}
		})
	}
})

Template.forge.rendered = function() {
	forged_preview_tracker.changed();
}