var display_tracker = new Tracker.Dependency;
var page_tracker = new Tracker.Dependency;
var tags = [];
var search_terms = [];
var locked_attributes = [];
var standard_attributes = [];
var sorter = "artwork_data.title";
var ascending = 1;
var status_filter = {'status': {$in: ['claimed', 'displayed', 'permanent', 'auctioned']}};
var rarity_filter =  {'artwork_data.rarity': {$in: ['common', 'uncommon', 'rare', 'legendary', 'masterpiece']}};

var lottery_filter = {'lottery': {$ne: undefined}};
var foil_filter = {'foil': {$ne: undefined}};
var seasonal_filter = {'seasonal': {$ne: undefined}};
var original_filter = {'original': {$ne: undefined}};
var vintage_filter = {'vintage': {$ne: undefined}};
var standard_filter = {};
var items_found = 0;
var current_page = 0;
var items_per_page = 10;
var current_time = undefined;

var generateQueryFromSearchTerms = function() {
	if (search_terms.length == 0)
		return undefined;

	var or_array = [];

	for (var i=0; i<search_terms.length; i++) {
		var term = search_terms[i];
		var term_array = [
			{'artwork_data.artist': {$regex: term, $options: 'i'}},
			{'artwork_data.title': {$regex: term, $options: 'i'}}
		]
		or_array = or_array.concat(term_array);
	}
	var or_object = {$or: or_array};
	return or_object;
}

var validPermutation = function(permutation_array, permutation) {
	for (var i=0; i<permutation.length; i++) {
		if (permutation.indexOf(permutation[i]) != permutation.lastIndexOf(permutation[i])) {
			return false;
		}
	}

	for (var i=0; i<permutation_array.length; i++) {
		var match_count = 0;
		for (var n=0; n<permutation.length; n++) {
			if (permutation_array[i].indexOf(permutation[n]) != -1) {
				match_count++;
			}
		}

		if (match_count == permutation.length) {
			return false;
		}
	}

	return true;
}

var createAndObjectFromPermutation = function(index_counter) {
	var key_string = '$and';
	var and_object = {};
	var local_array = [];
	for (var i=0; i<index_counter.length; i++) {	
		var attribute_index = index_counter[i];
		local_array.push({'attributes._id': standard_attributes[attribute_index]});
	}
	and_object[key_string] = local_array;
	return and_object;
}

var incrementPermutation = function(permutation, num_digits, cursor) {
	if (cursor == permutation.length)
		return permutation;

	else if (permutation[cursor] != num_digits - 1) {
		permutation[cursor] = permutation[cursor] + 1;
		return permutation;
	}

	else {
		permutation[cursor] = 0;
		return incrementPermutation(permutation.slice(), num_digits, cursor + 1)
	}
}

var endPermutations = function(permutation, num_digits) {
	for (var i=0; i<permutation.length; i++) {
		if (permutation[i] != num_digits - 1)
			return false;
	}

	return true;
}

var getPermutations = function(required) {
	var permutation_array = [];
	var object_array = [];
	var index_counter = [];
	var num_digits = standard_attributes.length;

	for (var i=0; i<required; i++) {
		index_counter.push(0);
	}

	var completed = false;
	while (!completed) {
		if (validPermutation(permutation_array, index_counter)) {
			object_array.push(createAndObjectFromPermutation(index_counter));
			permutation_array.push(index_counter.slice());
		}

		index_counter = incrementPermutation(index_counter.slice(), num_digits, 0);

		completed = endPermutations(index_counter, num_digits);
	}

	return object_array;
}

Template.inventory.helpers({
	'owned': function() {	
		try {
			display_tracker.depend();
			var sorter_object = {};
			sorter_object[sorter] = ascending;

			var filter_array = [
				lottery_filter, 
				foil_filter, 
				seasonal_filter, 
				original_filter,
				vintage_filter,
				standard_filter,
				status_filter,
				rarity_filter
			];

			var search_term_query = generateQueryFromSearchTerms();
			if (search_term_query != undefined) {
				filter_array.push(search_term_query);
			}

			var base_filter = {
				'owner': Meteor.userId()
			}

			if (tags.length > 0) {
				if (tags.indexOf("new") != -1) {
					base_filter.date_received = {'$gt': moment(current_time).add(-1, 'hours')._d.toISOString()};
					while (tags.indexOf("new") != -1) {
						tags.splice(tags.indexOf("new"), 1);
					}
				}

				if (tags.length > 0) {
					base_filter.tags = {"$in": tags};
				}
			}

			if (locked_attributes.length > 0) {
				if ($('#locked-filter').val() == "contains one") {
					var key_string = "artwork_data.locked_attributes";
					base_filter[key_string] = {"$in": locked_attributes};
				}

				else if ($('#locked-filter').val() == "contains two") {
					var or_filter_array = [];
					for (var i=0; i<locked_attributes.length; i++) {
						for (var n=0; n<locked_attributes.length; n++) {
							if (locked_attributes[i] != locked_attributes[n]) {
								or_filter_array.push({'$and': [
									{'artwork_data.locked_attributes': locked_attributes[i]},
									{'artwork_data.locked_attributes': locked_attributes[n]}
								]});
							}
						}
					}
					
					if (or_filter_array.length > 0)
						base_filter['$or'] = or_filter_array;

					else if (locked_attributes.length < 2)
						base_filter['_id'] = null;
				}

				else if ($('#locked-filter').val() == "contains three") {
					var or_filter_array = [];
					for (var i=0; i<locked_attributes.length; i++) {
						for (var n=0; n<locked_attributes.length; n++) {
							for (var c=0; c<locked_attributes.length; c++) {
								if (locked_attributes[i] != locked_attributes[n] && locked_attributes[i] != locked_attributes[c] && locked_attributes[n] != locked_attributes[c]) {
									or_filter_array.push({'$and': [
										{'artwork_data.locked_attributes': locked_attributes[i]},
										{'artwork_data.locked_attributes': locked_attributes[n]},
										{'artwork_data.locked_attributes': locked_attributes[c]}
									]});
								}
							}
						}
					}

					if (or_filter_array.length > 0)
						base_filter['$or'] = or_filter_array;

					else if (locked_attributes.length < 3)
						base_filter['_id'] = null;
				}
			}

			if (standard_attributes.length > 0) {
				switch($('#attribute-filter').val()) {
					case "contains one": {
						var key_string = "attributes._id";
						base_filter[key_string] = {"$in": standard_attributes};
					}
					break;

					case "contains two": {
						if (standard_attributes.length > 1) {
							var or_filter_array = getPermutations(2);

							if (or_filter_array.length > 0)
								base_filter['$or'] = or_filter_array;
						}

						else base_filter['_id'] = null;
					} break;

					case "contains three": {
						if (standard_attributes.length > 2) {
							var or_filter_array = getPermutations(3);

							if (or_filter_array.length > 0)
								base_filter['$or'] = or_filter_array;
						}

						else base_filter['_id'] = null;
					} break;

					case "contains four": {
						if (standard_attributes.length > 3) {
							var or_filter_array = getPermutations(4);

							if (or_filter_array.length > 0)
								base_filter['$or'] = or_filter_array;
						}

						else base_filter['_id'] = null;
					} break;

					default: base_filter['_id'] = null;
				}
			}

			filter_array.push(base_filter);	
			console.log(filter_array);

			var item_array = items.find({
				$and: filter_array
			}, {sort: sorter_object, skip: current_page * items_per_page, limit: items_per_page}).fetch();

			items_found = items.find({
				$and: filter_array
			}, {sort: sorter_object}).count();

			if (items_found == 0)
				current_page = 0;

			else if (current_page * items_per_page >= items_found) {
				current_page = Math.floor(items_found / items_per_page) - (items_found % items_per_page == 0 ? 1 : 0);
				display_tracker.changed();
			}

			page_tracker.changed();

			return item_array;
		}

		catch(error) {
			console.log(error.message);
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
			var auction_object = auctions.findOne({'item_id' : item_id}); 
			var biddable = (item_object.owner != Meteor.userId()) && (auction_object.bid_minimum <= Meteor.user().profile.bank_balance);

			var max_dimension = 40;

			var width = item_object.artwork_data.width;
			var height = item_object.artwork_data.height;
			var ratio = width / height;

			var info_object = {
				'image_width' : 0,
				'image_height' : 0,
				'biddable' : biddable,
				'filename' : item_object.artwork_data.filename,
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
	},

	'locked_attribute': function() {
		return attributes.find({'active': true});
	},

	'attributeName': function(attribute_id) {
		return attributes.findOne(attribute_id).npc_name;
	},

	'showLockedAttributes': function() {
		return items.findOne({
			'owner': Meteor.userId(), 
			'artwork_data.rarity': {$in: ['legendary', 'masterpiece']}, 
			'status': {$nin: ['for_sale', 'unclaimed', 'won']}
		});
	},

	'current_page': function() {
		page_tracker.depend();
		return current_page + 1;
	},

	'total_pages': function() {
		page_tracker.depend();
		return Math.floor(items_found / items_per_page) + (items_found % items_per_page == 0 && items_found != 0 ? 0 : 1);
	}
});

Template.inventory.events({
	'keyup #search-area': function(event) {
		var entered = commaSeparatedValuesToArray($('#search-area').val());
		tags = [];
		search_terms = [];
		for (var i=0; i<entered.length; i++) {
			if (entered[i][0] == '#' && entered[i].length > 1) {
				tags.push(entered[i].substring(1));
			}

			else search_terms.push(entered[i]);
		}

		display_tracker.changed();
	}, 

	'keydown #search-area': function(event) {
		if (event.keyCode == 13) {
			$('#search-area').blur();
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

		 			else {
		 				standard_filter = {$or: [{'foil': {$ne: false}}, {'seasonal': {$ne: false}}, {'original': {$ne: false}}, {'vintage': {$ne: false}}, {'lottery': {$nin: [0, undefined, false]}}]};
		 			}

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

		 		case "vintage": 
		 			if (checked)
		 				vintage_filter = {'vintage': {$ne: undefined}};

		 			else vintage_filter = {'vintage': false};

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

	'change #locked-attribute-checkbox': function() {
		locked_attributes = [];
		for (var i=0; i<$('input[type=checkbox].locked-attribute-select').length; i++) {
		 	var checked = $('input[type=checkbox].locked-attribute-select:eq(' + i + ')')[0].checked;
		 	if (checked)
		 		locked_attributes.push($('input[type=checkbox].locked-attribute-select:eq(' + i + ')').val())
		}

		display_tracker.changed();
	},

	'change #attribute-checkbox': function() {
		standard_attributes = [];
		for (var i=0; i<$('input[type=checkbox].attribute-select').length; i++) {
		 	var checked = $('input[type=checkbox].attribute-select:eq(' + i + ')')[0].checked;
		 	if (checked)
		 		standard_attributes.push($('input[type=checkbox].attribute-select:eq(' + i + ')').val())
		}

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

	'change #locked-filter': function() {
		display_tracker.changed();
	},

	'change #attribute-filter': function() {
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
	},

	'click #display-by-tags': function() {
		if (tags.length > 0) {
			Meteor.call('displayAllTagged', tags, $('#tagged-display-duration').val(), function(error, result) {
				if (error)
					console.log(error.message)

				if (result.length > 0) {
					//show errors in UI
				}
			})
		}
	},

	'click #inventory-page-right': function() {
		if (items_found > (current_page * items_per_page) + items_per_page) {
			current_page++;
			display_tracker.changed();
		}
	},

	'click #inventory-page-left': function() {
		if (current_page > 0) {
			current_page--;
			display_tracker.changed();
		}
	},

	'change #page-count-select': function() {
		items_per_page = Number($('#page-count-select').val());
		display_tracker.changed();
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
	Session.set('inventory_page', 0);
	Blaze.getData($('.template-inventory')[0])["value_data"] = {};
	tags = [];
	search_terms = [];
	locked_attributes = [];
	standard_attributes = [];
	sorter = "artwork_data.title";
	ascending = 1;
	status_filter = {'status': {$in: ['claimed', 'displayed', 'permanent', 'auctioned']}};
	rarity_filter =  {'artwork_data.rarity': {$in: ['common', 'uncommon', 'rare', 'legendary', 'masterpiece']}};

	lottery_filter = {'lottery': {$ne: undefined}};
	foil_filter = {'foil': {$ne: undefined}};
	seasonal_filter = {'seasonal': {$ne: undefined}};
	original_filter = {'original': {$ne: undefined}};
	vintage_filter = {'vintage': {$ne: undefined}};
	standard_filter = {};
	current_page = 0;
	items_found = 0;
	items_per_page = 10;
	display_tracker.changed();

	Meteor.call('getCurrentTime', function(error, result) {
		if (error)
			console.log(error.message)

		else {
			current_time = result;
		}
	})
}

Template.inventory.destroyed = function() {
	Session.set('inventory_page', undefined);
	Meteor.clearInterval(this.handle);
}
