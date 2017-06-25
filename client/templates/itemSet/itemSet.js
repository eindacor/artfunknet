var display_tracker = new Tracker.Dependency;
page_tracker = new Tracker.Dependency;
item_array_tracker = new Tracker.Dependency;

var status_filter;
var item_array = [];
var tags = [];
var search_terms = [];
var keywords = [];
var special_attributes = [];
var standard_attributes = [];
var sorter = "values.actual";
var ascending = -1;
var rarity_filter = {'artwork_data.rarity': {'$in': ['common', 'uncommon', 'rare', 'legendary', 'masterpiece']}};
var lottery_filter = {'lottery': {'$ne': null}};
var foil_filter = {'foil': {'$ne': null}};
var seasonal_filter = {'seasonal': {'$ne': null}};
var original_filter = {'original': {'$ne': null}};
var unlocked_filter = {'unlocked': {'$ne': null}};
var vintage_filter = {'vintage': {'$ne': null}};
var standard_filter = {};
var current_page;
var total_pages;
var items_per_page = 10;

var getter_query;

var item_getter;

var generateQueryFromSearchTerms = function() {
	if (search_terms.length == 0)
		return undefined;

	var or_array = [];

	for (var i=0; i<search_terms.length; i++) {
		var term = search_terms[i];
		var term_array = [
			{'artwork_data.artist': {'$regex': term, '$options': 'i'}},
			{'artwork_data.title': {'$regex': term, '$options': 'i'}}
		]
		or_array = or_array.concat(term_array);
	}
	var or_object = {'$or': or_array};
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
		local_array.push({'$or': [
			{'attributes.locked._id': standard_attributes[attribute_index]},
			{'attributes.unlocked._id': standard_attributes[attribute_index]},
			{'attributes.special._id': standard_attributes[attribute_index]}
		]});
	}
	and_object[key_string] = local_array;
	return and_object;
}

var incrementPermutation = function(permutation, num_digits, cursor) {
	try {
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

	catch(error) {
		console.log(error);
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

var addQueriesFromKeywords = function(base_filter) {
	if (keywords.indexOf("new") != -1) {
		base_filter.date_received = {'$gt': moment().add(-1, 'hours')._d.toISOString()};
	}

	if (keywords.indexOf("dupes") != -1) {
		var dupe_list = [];
		items.find({'owner': Meteor.userId()}).forEach(function(item_object) {
			if (items.find({'owner': Meteor.userId(), 'artwork_id': item_object.artwork_id}).count() > 1)
				dupe_list.push(item_object.artwork_id);
		});
		base_filter.artwork_id = {'$in': dupe_list};
	}

	if (keywords.indexOf("permanent") != -1) {
		base_filter.permanent = true;
	}
}

refreshItemSet = function() {
	updateItemArray();
}

updateItemArray = function() {
	var sorter_object = {};
	sorter_object[sorter] = ascending;

	var filter_array = [
		lottery_filter, 
		foil_filter, 
		unlocked_filter,
		seasonal_filter, 
		original_filter,
		vintage_filter,
		standard_filter,
		status_filter,
		rarity_filter
	];

	tags = [];
	search_terms = [];
	keywords = [];
	var terms_entered = commaSeparatedValuesToArray($('#search-area').val());
	for (var i=0; i<terms_entered.length; i++) {
		if (terms_entered[i][0] == '#' && terms_entered[i].length > 1) {
			tags.push(terms_entered[i].substring(1));
		}

		else if (terms_entered[i][0] == "*" && terms_entered[i].length > 1) {
			keywords.push(terms_entered[i].substring(1));
		}

		else if (terms_entered[i] != "*") {
			search_terms.push(terms_entered[i]);
		}
	}

	var search_term_query = generateQueryFromSearchTerms();
	if (search_term_query != undefined) {
		filter_array.push(search_term_query);
	}

	var base_filter = {
		'owner': Meteor.userId()
	}

	addQueriesFromKeywords(base_filter);

	if (tags.length > 0) {
		base_filter.tags = {"$in": tags};
	}

	if (special_attributes.length > 0) {
		if ($('#locked-filter').val() == "contains one") {
			var key_string = "attributes.special._id";
			base_filter[key_string] = {"$in": special_attributes};
		}

		else if ($('#locked-filter').val() == "contains two") {
			var or_filter_array = [];
			for (var i=0; i<special_attributes.length; i++) {
				for (var n=0; n<special_attributes.length; n++) {
					if (special_attributes[i] != special_attributes[n]) {
						or_filter_array.push({'$and': [
							{'attributes.special._id': special_attributes[i]},
							{'attributes.special._id': special_attributes[n]}
						]});
					}
				}
			}
			
			if (or_filter_array.length > 0)
				base_filter['$or'] = or_filter_array;

			else if (special_attributes.length < 2)
				base_filter['_id'] = null;
		}

		else if ($('#locked-filter').val() == "contains three") {
			var or_filter_array = [];
			for (var i=0; i<special_attributes.length; i++) {
				for (var n=0; n<special_attributes.length; n++) {
					for (var c=0; c<special_attributes.length; c++) {
						if (special_attributes[i] != special_attributes[n] && special_attributes[i] != special_attributes[c] && special_attributes[n] != special_attributes[c]) {
							or_filter_array.push({'$and': [
								{'attributes.special._id': special_attributes[i]},
								{'attributes.special._id': special_attributes[n]},
								{'attributes.special._id': special_attributes[c]}
							]});
						}
					}
				}
			}

			if (or_filter_array.length > 0)
				base_filter['$or'] = or_filter_array;

			else if (special_attributes.length < 3)
				base_filter['_id'] = null;
		}
	}

	if (standard_attributes.length > 0) {
		switch($('#attribute-filter').val()) {
			case "contains one": {
				var key_string = "attributes._id";
				base_filter['$or'] = [
					{'attributes.locked._id': {'$in' : standard_attributes}},
					{'attributes.unlocked._id': {'$in' : standard_attributes}},
					{'attributes.special._id': {'$in' : standard_attributes}}
				]
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

	var match_query = {$and: filter_array};

	Meteor.call('getItemArray', match_query, sorter_object, current_page, items_per_page, function(error, result) {
		if (error) {
			console.log(error);
		}

		else {
			item_array = result.item_array;
			current_page = result.current_page;
			total_pages = result.total_pages;
			item_array_tracker.changed();
		}
	})
}

Template.itemSet.helpers({
	'addToDom': function(item_object) {
		var $item_container = $('<div data-item_id="' + item_object._id + '" class="item-container">');
		var $item = $('<div class="template-itemInfo"></div>');
		$item.append(getHTMLFromItem(item_object));
		$item_container.append($item);
		$('.item-array-area').append($item_container);
	},

	'attribute': function() {
		return attributes.find({'active': true});
	},

	'current_page': function() {
		item_array_tracker.depend();
		return current_page;
	},

	'total_pages': function() {
		item_array_tracker.depend();
		return total_pages;
	},

	'item_array': function(statuses) {
		item_array_tracker.depend();

		if (status_filter === undefined) {
			status_filter = {'status': {$in: statuses}};
			updateItemArray();
			return [];
		}

		if (item_array == undefined) {
			updateItemArray();
		}

		return item_array;
	}
})

Template.itemSet.events({
	'keyup #search-area': function(event) {
		updateItemArray();
	}, 

	'keydown #search-area': function(event) {
		if (event.keyCode == 13) {
			$('#search-area').blur();
			event.preventDefault();
		}
	},

	'click #inventory-page-right': function() {
		var prior_current = current_page;
		current_page = Math.min(current_page + 1, total_pages);
		if (prior_current != current_page)
			updateItemArray();
	},

	'click #inventory-page-left': function() {
		var prior_current = current_page;
		current_page = Math.max(current_page - 1, 1);
		if (prior_current != current_page)
			updateItemArray();
	},

	'change #page-count-select': function() {
		items_per_page = Number($('#page-count-select').val());
		updateItemArray();
	},

	'change #sort-selector': function(event) {
		sorter = $(event.target).val();
		updateItemArray();
	},

	'change #order-selector': function(event) {
		ascending = Number($(event.target).val());
		updateItemArray();
	}, 

	'change #card-type-checkbox': function() {
		 for (var i=0; i<$('input[type=checkbox].type-select').length; i++) {
		 	var checked = $('input[type=checkbox].type-select:eq(' + i + ')')[0].checked
		 	switch($('input[type=checkbox].type-select:eq(' + i + ')').val()) {
		 		case "standard": 		
		 			if (checked)
		 				standard_filter = {};

		 			else {
		 				standard_filter = {'$or': [{'foil': {$ne: false}}, {'seasonal': {'$ne': false}}, {'original': {'$ne': false}}, {'vintage': {'$ne': false}}, {'lottery': {'$nin': [0, null, false]}}]};
		 			}

		 			break;

		 		case "foil":
		 			if (checked)
		 				foil_filter = {'foil': {'$ne': null}};

		 			else foil_filter = {'foil': false};

		 			break;

		 		case "unlocked":
		 			if (checked)
		 				unlocked_filter = {'unlocked': {'$ne': null}};

		 			else unlocked_filter = {'unlocked': false};

		 			break;

		 		case "seasonal":
		 			if (checked)
		 				seasonal_filter = {'seasonal': {'$ne': null}};

		 			else seasonal_filter = {'seasonal': false};

		 			break;

		 		case "original":
		 			if (checked)
		 				original_filter = {'original': {'$ne': null}};

		 			else original_filter = {'original': false};

		 			break;

		 		case "lottery":
		 			if (checked)
		 				lottery_filter = {'lottery': {'$ne': null}};

		 			else lottery_filter = {'lottery': {'$in': [0, null, false]}};

		 			break;

		 		case "vintage": 
		 			if (checked)
		 				vintage_filter = {'vintage': {'$ne': null}};

		 			else vintage_filter = {'vintage': false};

		 			break;

		 		default: break;
		 	}
		 }

		updateItemArray();
	},

	'change #card-status-checkbox': function() {
		var valid_statuses = [];
		for (var i=0; i<$('input[type=checkbox].status-select').length; i++) {
		 	var checked = $('input[type=checkbox].status-select:eq(' + i + ')')[0].checked;
		 	if (checked)
		 		valid_statuses.push($('input[type=checkbox].status-select:eq(' + i + ')').val())
		}

		status_filter = {'status': {'$in': valid_statuses}};
		updateItemArray();
	},

	'change #special-attribute-checkbox': function() {
		special_attributes = [];
		for (var i=0; i<$('input[type=checkbox].special-attribute-select').length; i++) {
		 	var checked = $('input[type=checkbox].special-attribute-select:eq(' + i + ')')[0].checked;
		 	if (checked)
		 		special_attributes.push($('input[type=checkbox].special-attribute-select:eq(' + i + ')').val())
		}

		updateItemArray();
	},

	'change #attribute-checkbox': function() {
		standard_attributes = [];
		for (var i=0; i<$('input[type=checkbox].attribute-select').length; i++) {
		 	var checked = $('input[type=checkbox].attribute-select:eq(' + i + ')')[0].checked;
		 	if (checked)
		 		standard_attributes.push($('input[type=checkbox].attribute-select:eq(' + i + ')').val())
		}

		updateItemArray();
	},

	'change #card-rarity-checkbox': function() {
		var valid_rarities = [];
		for (var i=0; i<$('input[type=checkbox].rarity-select').length; i++) {
		 	var checked = $('input[type=checkbox].rarity-select:eq(' + i + ')')[0].checked;
		 	if (checked)
		 		valid_rarities.push($('input[type=checkbox].rarity-select:eq(' + i + ')').val())
		}

		rarity_filter = {'artwork_data.rarity': {$in: valid_rarities}};

		updateItemArray();
	},

	'change #locked-filter': function() {
		updateItemArray();
	},

	'change #attribute-filter': function() {
		updateItemArray();
	},

	//TODO figure out why below logic is reversed
	'click #toggle-filters': function(element) {
		var target = $('#toggle-filters');
		if (target.hasClass('af-color')) {
			target.removeClass('af-color');
			$('.all-filters').css('display', 'none');
		}

		else {
			target.addClass('af-color');
			$('.all-filters').css('display', 'block');
		}

		updateItemArray();
	}
})

Template.itemSet.rendered = function() {
	tags = [];
	search_terms = [];
	keywords = [];
	special_attributes = [];
	standard_attributes = [];
	sorter = "values.actual";
	ascending = -1;
	rarity_filter =  {'artwork_data.rarity': {'$in': ['common', 'uncommon', 'rare', 'legendary', 'masterpiece']}};

	lottery_filter = {'lottery': {'$ne': null}};
	foil_filter = {'foil': {'$ne': null}};
	seasonal_filter = {'seasonal': {'$ne': null}};
	original_filter = {'original': {'$ne': null}};
	unlocked_filter = {'unlocked': {'$ne': null}};
	vintage_filter = {'vintage': {'$ne': null}};
	standard_filter = {};
	status_filter = undefined;
	items_per_page = 10;

	item_array = undefined;
	current_page = 1;
	total_pages = 1;
	items_per_page = 10;
	updateItemArray();
}