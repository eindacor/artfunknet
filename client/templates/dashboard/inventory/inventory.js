var display_tracker = new Tracker.Dependency;
var tags = [];
var sorter = "artwork_data.title";
var ascending = 1;
var status_filter = {'status': {$in: ['claimed', 'displayed', 'permanent', 'auctioned']}};
var rarity_filter =  {'artwork_data.rarity': {$in: ['common', 'uncommon', 'rare', 'legendary', 'masterpiece']}};

var lottery_filter = {'lottery': {$ne: undefined}};
var foil_filter = {'foil': {$ne: undefined}};
var seasonal_filter = {'seasonal': {$ne: undefined}};
var original_filter = {'original': {$ne: undefined}};
var standard_filter = {};

Template.inventory.helpers({
	'owned': function() {	
		display_tracker.depend();
		var sorter_object = {};
		sorter_object[sorter] = ascending;

		if (tags.length == 0) {
			var filter_array = [
				{'owner': Meteor.userId()}, 
				lottery_filter, 
				foil_filter, 
				seasonal_filter, 
				original_filter,
				standard_filter,
				status_filter,
				rarity_filter
			];

			return items.find({
				$and: filter_array
			}, {sort: sorter_object});
		}

		else {
			var filter_array = [
				{'owner': Meteor.userId(), 'tags': {$in: tags}}, 
				lottery_filter, 
				foil_filter, 
				seasonal_filter, 
				original_filter,
				standard_filter,
				status_filter,
				rarity_filter
			];

			return items.find({
				$and: filter_array
			}, {sort: sorter_object});
		}
	},

	'list_view' : function() {
		return Session.get('list_view');
	},

	'listHeader' : function() {
		var header_array = [
			{ 'text' : 'view', 'sort_id' : undefined },
			{ 'text' : 'title', 'sort_id' : 'title' },
			{ 'text' : 'date', 'sort_id' : 'date' },
			{ 'text' : 'artist', 'sort_id' : 'artist' },
			{ 'text' : 'rarity', 'sort_id' : 'rarity_rank' },
			{ 'text' : 'estimated value', 'sort_id' : 'estimated_value' },
			{ 'text' : 'dimensions', 'sort_id' : undefined },
			{ 'text' : 'condition', 'sort_id' : 'condition' },
			{ 'text' : 'features', 'sort_id' : 'feature_count' },
			{ 'text' : 'xp rating', 'sort_id' : 'xp_rating' },
			{ 'text' : 'reroll count', 'sort_id' : 'roll_count' },
			{ 'text' : 'actions', 'sort_id' : undefined },
		];

		return header_array;
	},

	'thumbnailInfo' : function(item_id) {
		try {
			var item_object = items.findOne(item_id);
			var artwork_object = artworks.findOne(item_object.artwork_id);
			var auction_object = auctions.findOne({'item_id' : item_id}); 
			var biddable = (item_object.owner != Meteor.userId()) && (auction_object.bid_minimum <= Meteor.user().profile.bank_balance);

			var max_dimension = 40;

			var width = artwork_object.width;
			var height = artwork_object.height;
			var ratio = width / height;

			var info_object = {
				'image_width' : 0,
				'image_height' : 0,
				'biddable' : biddable,
				'filename' : artwork_object.filename,
				'imageURL' : artwork_object.img_link == "" ? "http://go-grafix.com/data/wallpapers/35/painting-626297-1920x1080-hq-dsk-wallpapers.jpg" : artwork_object.img_link
			};

			if (width > height) {
				info_object.image_width = max_dimension;
				info_object.image_height = Math.floor(max_dimension / ratio);
			}

			else {
				info_object.image_height = max_dimension;
				info_object.image_width = Math.floor(max_dimension * ratio);
			}

			return info_object;
		}

		catch(error) {
			console.log(error.message);
			return {
				'image_width' : 0,
				'image_height' : 0,
				'biddable' : false,
				'filename' : ""
			};
		}
	},

	'valueColor' : function(value) {
		return 255 - Math.floor(value * 255);
	},

	'display_time_remaining': function(item_object) {
		var expiration = moment(item_object.display_details.end);
		var now = moment(Session.get('now'));
		var remaining = expiration - now;

		var remaining_text = remaining > 0 ? getCountdownString(remaining) : "expired";
		return remaining_text;
	},

	'auction_time_remaining': function(item_object) {
		var expiration = moment(auctions.findOne({'item_id': item_object._id}).expiration);
		var now = moment(Session.get('now'));
		var remaining = expiration - now;

		var remaining_text = remaining > 0 ? getCountdownString(remaining) : "expired";
		return remaining_text;
	}
});

Template.inventory.events({
	'click #toggle-view' : function() {
		Session.set('list_view', !Session.get('list_view'));
	},

	'keyup #tag-selector': function(event) {
		var entered = $('#tag-selector').val();
		tags = commaSeparatedValuesToArray($('#tag-selector').val());
		display_tracker.changed();
	}, 

	'keydown #tag-selector': function(event) {
		if (event.keyCode == 13) {
			$('#tag-selector').blur();
			event.preventDefault();
		}
	},

	'change #sort-selector': function(event) {
		sorter = $(event.target).val();
		display_tracker.changed();
	},

	'change #order-selector': function(event) {
		ascending = Number($(event.target).val());
		display_tracker.changed();
	}, 

	'change #card-type-checkbox': function() {
		 for (var i=0; i<$('input[type=checkbox].type-select').length; i++) {
		 	var checked = $('input[type=checkbox].type-select:eq(' + i + ')')[0].checked
		 	switch($('input[type=checkbox].type-select:eq(' + i + ')').val()) {
		 		case "standard": 		
		 			if (checked)
		 				standard_filter = {};

		 			else standard_filter = {$or: [{'foil': {$ne: false}}, {'seasonal': {$ne: false}}, {'original': {$ne: false}}, {'lottery': {$nin: [0, undefined, false]}}]};

		 			break;

		 		case "foil":
		 			if (checked)
		 				foil_filter = {'foil': {$ne: undefined}};

		 			else foil_filter = {'foil': false};

		 			break;

		 		case "seasonal":
		 			if (checked)
		 				seasonal_filter = {'seasonal': {$ne: undefined}};

		 			else seasonal_filter = {'seasonal': false};

		 			break;

		 		case "original":
		 			if (checked)
		 				original_filter = {'original': {$ne: undefined}};

		 			else original_filter = {'original': false};

		 			break;

		 		case "lottery":
		 			if (checked)
		 				lottery_filter = {'lottery': {$ne: undefined}};

		 			else lottery_filter = {'lottery': {$in: [0, undefined, false]}};

		 			break;

		 		default: break;
		 	}
		 }

		 display_tracker.changed();
	},

	'change #card-status-checkbox': function() {
		var valid_statuses = [];
		for (var i=0; i<$('input[type=checkbox].status-select').length; i++) {
		 	var checked = $('input[type=checkbox].status-select:eq(' + i + ')')[0].checked;
		 	if (checked)
		 		valid_statuses.push($('input[type=checkbox].status-select:eq(' + i + ')').val())
		}

		status_filter = {'status': {$in: valid_statuses}};

		display_tracker.changed();
	},

	'change #card-rarity-checkbox': function() {
		var valid_rarities = [];
		for (var i=0; i<$('input[type=checkbox].rarity-select').length; i++) {
		 	var checked = $('input[type=checkbox].rarity-select:eq(' + i + ')')[0].checked;
		 	if (checked)
		 		valid_rarities.push($('input[type=checkbox].rarity-select:eq(' + i + ')').val())
		}

		rarity_filter = {'artwork_data.rarity': {$in: valid_rarities}};

		display_tracker.changed();
	},

	'click #toggle-filters': function(element) {
		var target = $(element.target);
		if (target.hasClass('af-color')) {
			target.removeClass('af-color');
			$('.all-filters').css('display', 'none');
		}

		else {
			target.addClass('af-color');
			$('.all-filters').css('display', 'block');
		}
	}
})

Template.inventory.created = function() {
	Session.set('inventory_sort', 'title');
	Session.set('inventory_ascending', true);
	Session.set('list_view', false);
	this.handle = Meteor.setInterval((function() {
		var now = moment();
		Session.set('now', now.toISOString());
	}), 1000);
	tags = [];
	display_tracker.changed();
}

Template.inventory.rendered = function() {
	Blaze.getData($('.template-inventory')[0])["value_data"] = {};
	tags = [];
	display_tracker.changed();
}

Template.inventory.destroyed = function() {
	Meteor.clearInterval(this.handle);
}