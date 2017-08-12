var display_tracker = new Tracker.Dependency;
page_tracker = new Tracker.Dependency;
item_array_tracker = new Tracker.Dependency;
var flag_tracker = new Tracker.Dependency;

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
var flag_filter = {};
var current_page = 1;
var total_pages;
var items_per_page = 10;
var match_query;
var flag_values = ["any", "only", "none"];
var flags = ["permanent", "repairing", "for sale", "foil", "unlocked", "seasonal", "lottery", "original", "vintage", "forgery"];
var flag_map;

var set_statuses;

var getter_query;

var item_getter;

var initializeFlagMap = function() {
	flag_map = {};
	for (var i=0; i<flags.length; i++) {
		flag_map[flags[i]] = flag_values[0];
	}
	flag_tracker.changed();
}

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
		var valid_statuses = status_filter.status["$in"];
		items.find({'owner': Meteor.userId(), 'status': {$in: valid_statuses}}).forEach(function(item_object) {
			if (dupe_list.indexOf(item_object.artwork_id) != -1) {
				return;
			}

			if (items.find({'owner': Meteor.userId(), 'artwork_id': item_object.artwork_id, 'status': {$in: valid_statuses}}).count() > 1)
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

updateFlagFilter = function() {
	for (var i=0; i<flags.length; i++) {
		var name = flags[i];
		var value = flag_map[name];
		switch(name) {
			case 'for sale': 
				if (value == "any") {
					delete flag_filter[name];
				}
				else if (value == "only") {
					flag_filter.tags = {'$in': ["for sale"]};
				}
				else if (value == "none") {
					flag_filter.tags = {'$nin': ["for sale"]};
				};
				break;
			case 'lottery': 
				if (value == "any") {
					delete flag_filter[name];
				}
				else if (value == "only") {
					flag_filter.lottery = {'$gt': 0};
				}
				else if (value == "none") {
					flag_filter.lottery = 0;
				};
				break;
			case 'forgery': break;
			default: 
				if (value == "any") {
					delete flag_filter[name];
				}
				else if (value == "only") {
					flag_filter[name] = true;
				}
				else if (value == "none") {
					flag_filter[name] = false;
				};
				break;
		}
	}

	updateItemArray();
}

updateItemArray = function() {
	if (status_filter === undefined) {
		console.log("statuses undefined");
		return;
	}

	var sorter_object = {};
	sorter_object[sorter] = ascending;

	var player_interface = new PlayerIF(Meteor.user());
	var tutorial_filter;

	if (player_interface.tutorialMode()) {
		tutorial_filter = {'tutorial': true};
	}

	else tutorial_filter = {'tutorial': {$ne: true}};

	var filter_array = [
		status_filter,
		rarity_filter,
		flag_filter,
		tutorial_filter
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

	match_query = {$and: filter_array};

	var forgery_filter_value = flag_map.forgery === undefined ? "any" : flag_map.forgery;

	Meteor.call('getItemArray', match_query, forgery_filter_value, sorter_object, current_page, items_per_page, function(error, result) {
		if (error) {
			console.log(error);
		}

		else {
			item_array = result.item_array;
			current_page = result.current_page;
			total_pages = result.total_pages;

			$('.item-array-area').empty();

			var player_interface = new PlayerIF(Meteor.user());

			for (var i=0; i<result.item_array.length; i++) {
				var player_item_interface = new PlayerItemIF(player_interface, new ItemIF(result.item_array[i]));
				var $item_container = $('<div class="item-container" id="item_' + result.item_array[i]._id + '">');
				fillItemContainer($item_container, player_item_interface);
				$('.item-array-area').append($item_container);
			}

			item_array_tracker.changed();
		}
	})
}

Template.itemSet.helpers({
	'addToDom': function(item_object) {
		var $item_container = $('<div data-item_id="' + item_object._id + '" class="item-container">');
		var $item = $('<div class="template-itemInfo"></div>');
		var player_item_interface = new PlayerItemIF(new PlayerIF(Meteor.user()), new ItemIF(item_object));

		$item.append(getHTMLFromItem(player_item_interface));
		$item_container.append($item);

		var $item_actions = $('<div class="template-itemActions"></div>');
		$item_actions.append(getItemActionsHTML(player_item_interface));
		$item_container.append($item_actions);

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

	'permanent_sort': function(statuses) {
		return statuses.indexOf("for_sale") == -1 && statuses.indexOf("won") == -1;
	},

	'setStatuses': function(statuses) {
		if (set_statuses === undefined) {
			set_statuses = statuses;
			status_filter = {'status': {$in: statuses}};
			updateItemArray();
			return;
		}

		else if (statuses.length != set_statuses.length) {
			set_statuses = statuses;
			status_filter = {'status': {$in: statuses}};
			updateItemArray();
			return;
		}

		else {
			for (var i=0; i<set_statuses.length; i++) {
				if (set_statuses[i] != statuses[i]) {
					set_statuses = statuses;
					status_filter = {'status': {$in: statuses}};
					updateItemArray();
					return;
				}
			}
		}
	},

	'flag_left': function() {
		return flags.slice(0, Math.ceil(flags.length /2));
	},

	'flag_right': function() {
		return flags.slice(Math.ceil(flags.length /2));
	},

	'flag_value': function(flag_name) {
		flag_tracker.depend();
		if (flag_map == undefined) {
			initializeFlagMap();
		}
		else return flag_map[flag_name];
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
	},

	'click #save-filter': function(element) {
		console.log(match_query);
	},

	'click .flag-value': function(element) {
		var name = $(element.target).data().flag_name;
		var value = $(element.target).attr('data-flag_value');
		var new_value_index = flag_values.indexOf(value) == flag_values.length - 1 ? 0 : flag_values.indexOf(value) + 1;
		var new_value = flag_values[new_value_index];
		flag_map[name] = new_value;
		updateFlagFilter();
		flag_tracker.changed();
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

	flag_filter = {};

	current_page = 1;
	total_pages = 1;
	items_per_page = 10;
	updateItemArray();
	initializeFlagMap();
}