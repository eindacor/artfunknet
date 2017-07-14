var forged_preview_tracker = new Tracker.Dependency;
var forgery_cost_tracker = new Tracker.Dependency;
var forged_item_data;
var forgery_cost;

var artist_data_tracker = new Tracker.Dependency;
var expanded_data_tracker = new Tracker.Dependency;
var enforce_terms_tracker = new Tracker.Dependency;
var rarity_selection_tracker = new Tracker.Dependency;
var artist_array;
var current_page;
var total_pages;
var match_query;
var expanded_artist_ids = [];
var rarities_selected = artwork_rarities.slice();
var forgery_contract_selected_id;
var artists_per_page = 10;
var enforce_terms = false;

var artwork_id_to_forge;

var generateQueryFromSearchTerms = function(search_terms) {
	if (search_terms.length == 0)
		return undefined;

	var query_array = [];

	for (var i=0; i<search_terms.length; i++) {
		var term = search_terms[i];

		if (term.length == 0) {
			continue;
		}

		var term_array = [
			{'artist': {'$regex': term, '$options': 'i'}},
			{'title': {'$regex': term, '$options': 'i'}},
			// {'genre': {'$regex': term, '$options': 'i'}},
			{'medium': {'$regex': term, '$options': 'i'}}
		]

		if (enforce_terms) {
			query_array.push({
				'$or': term_array
			});
		}

		else query_array = query_array.concat(term_array);
	}

	if (query_array.length == 0) {
		return {};
	}

	else if (enforce_terms) {
		return {
			'$and': query_array
		}
	}

	else return {
		'$or': query_array
	}
}

var refreshArtistArray = function() {
	expanded_artist_ids = [];
	var and_query_array = [{'active': true}];

	and_query_array.push({'rarity': {'$in': rarities_selected}});

	var search_terms = commaSeparatedValuesToArray($('#search-area').val());

	var search_term_query = generateQueryFromSearchTerms(search_terms);
	if (search_term_query != undefined) {
		and_query_array.push(search_term_query);
	}

    match_query = {'$and' : and_query_array};

    Meteor.call('getArchiveArtistsFromQuery', match_query, current_page, artists_per_page, function(error, result) {
		if (error) {
			console.log(error);
		}

		else {
			artist_array = [];
			for (var i=0; i<result.artist_array.length; i++) {
				artist_array.push(artists.findOne(result.artist_array[i].artist_id));
			}
			current_page = result.current_page;
			total_pages = result.total_pages;
			artist_data_tracker.changed();
		}
	})

	expanded_data_tracker.changed();
	// rarity_selection_tracker.changed();
}

var updateForgeryCost = function() {
	if (forged_item_data == undefined) {
		forged_cost = undefined;
		forgery_cost_tracker.changed();
		return;
	}

	Meteor.call('getForgeryCost', forged_item_data, function(error, result) {
		if (error) {
			console.log(error);
		}

		else {
			forgery_cost = result;
			forgery_cost_tracker.changed();
		}
	})
}

var updateForgedItemData = function() {
	if (artwork_id_to_forge == undefined) {
		forged_preview_tracker.changed();
		return;
	}

	var foil = $('input:radio[name=foil_selector]:checked').length == 0 ? false : $('input:radio[name=foil_selector]:checked').val() == "true";
	var unlocked = $('input:radio[name=unlocked_selector]:checked').length == 0 ? false : $('input:radio[name=unlocked_selector]:checked').val() == "true";
	var seasonal = $('input:radio[name=seasonal_selector]:checked').length == 0 ? false : $('input:radio[name=seasonal_selector]:checked').val() == "true";
	var vintage = $('input:radio[name=vintage_selector]:checked').length == 0 ? false : $('input:radio[name=vintage_selector]:checked').val() == "true";
	var lottery = $('input:radio[name=lottery_selector]:checked').length == 0 ? 0 : Number($('input:radio[name=lottery_selector]:checked').val());
	var level = $('input:radio[name=level_selector]:checked').length == 0 ? 1 : Number($('input:radio[name=level_selector]:checked').val());

	var forgery_quality = forgery_contracts.findOne(forgery_contract_selected_id).quality;

	var item_data = {
		'artwork_id': artwork_id_to_forge,
		'artwork_data': artworks.findOne(artwork_id_to_forge),
		'foil': foil,
		'unlocked': unlocked,
		'seasonal': seasonal,
		'vintage': vintage,
		'lottery': lottery,
		'level': level,
		'authenticity': {
			'forgery_quality': forgery_quality
		}
	}

	forged_item_data = item_data;
	updateForgeryCost();
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

	'artist': function() {
		artist_data_tracker.depend();
		if (artist_array == undefined) {
			refreshArtistArray();
		}

		return artist_array;
	},

	'artist_selected': function(artist_object) {
		expanded_data_tracker.depend()
		return expanded_artist_ids.indexOf(artist_object._id) != -1;
	},

	'artwork': function(artist_object) {
		var and_query_array = [{'artist_id': artist_object._id, 'active': true, 'rarity': {$in: rarities_selected}}]
		var search_terms = commaSeparatedValuesToArray($('#search-area').val());

		var search_term_query = generateQueryFromSearchTerms(search_terms);
		if (search_term_query != undefined) {
			and_query_array.push(search_term_query);
		}

		return artworks.find({$and: and_query_array});
	},

	'isAdmin': function() {
		return false;
		//return Meteor.user().profile.user_type == "admin";
	},

	'forged_item_data': function() {
		forged_preview_tracker.depend();
		if (forged_item_data == undefined) {
			updateForgedItemData();
		}

		return forged_item_data;
	},

	'contract_count': function() {
		return forgery_contracts.find({'owner_id': Meteor.userId()}).count();
	},

	'forgery_contract': function() {
		return forgery_contracts.find({'owner_id': Meteor.userId()});
	},

	'forgery_heat': function() {
		forged_preview_tracker.depend();

		if (forged_item_data == undefined) {
			return 1;
		}

		else {
			var player_interface = new PlayerIF(Meteor.user());
			return player_interface.getForgeryHeat(forged_item_data);
		}
	},

	'forgery_heat_map': function() {
		forged_preview_tracker.depend();

		if (forged_item_data == undefined) {
			return {};
		}

		else {
			var player_interface = new PlayerIF(Meteor.user());
			return {
				'default': player_interface.getForgeryHeat(forged_item_data),
				'quest': player_interface.getForgeryHeat(forged_item_data, FORGERY_HEAT_CATEGORY.QUEST),
				'sell': player_interface.getForgeryHeat(forged_item_data, FORGERY_HEAT_CATEGORY.SELL),
				'donate': player_interface.getForgeryHeat(forged_item_data, FORGERY_HEAT_CATEGORY.DONATE),
				'collector': player_interface.getForgeryHeat(forged_item_data, FORGERY_HEAT_CATEGORY.COLLECTOR),
				'display': player_interface.getForgeryHeat(forged_item_data, FORGERY_HEAT_CATEGORY.DISPLAY)
			}
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
	},

	'artwork_and_contract_selected': function() {
		forged_preview_tracker.depend();
		var artwork_selected = artworks.findOne(artwork_id_to_forge);

		if (artwork_selected == undefined) {
			return false;
		}

		var forgery_contract_selected = forgery_contracts.findOne(forgery_contract_selected_id);

		if (forgery_contract_selected == undefined) {
			return false;
		}

		else return {
			'artwork_selected': artwork_selected,
			'forgery_contract_selected': forgery_contract_selected
		}
	},

	'artwork_id_selected': function() {
		forged_preview_tracker.depend();
		return artwork_id_to_forge;
	},

	'forgery_contract_id_selected': function() {
		forged_preview_tracker.depend();
		return forgery_contract_selected_id;
	},

	'forgery_cost': function() {
		forgery_cost_tracker.depend();
		return forgery_cost;
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
	},

	'keyup #search-area': function(event) {
		refreshArtistArray();
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
			refreshArtistArray();
	},

	'click #inventory-page-left': function() {
		var prior_current = current_page;
		current_page = Math.max(current_page - 1, 1);
		if (prior_current != current_page)
			refreshArtistArray();
	},

	'change #page-count-select': function() {
		artists_per_page = Number($('#page-count-select').val());
		refreshArtistArray();
	},

	'click .artist-info': function(event) {
		var artist_id = $(event.target).closest('.artist-info').data().artist_id;
		if (expanded_artist_ids.indexOf(artist_id) == -1) {
			expanded_artist_ids.push(artist_id);
		}

		else expanded_artist_ids.splice(expanded_artist_ids.indexOf(artist_id), 1);

		expanded_data_tracker.changed();
	},

	'click .artwork-info.unselected': function(event) {
		var artwork_id = $(event.target).closest('.artwork-info').data().artwork_id;
		artwork_id_to_forge = artwork_id;
		forged_preview_tracker.changed();
	},

	'click .artwork-info.selected': function(event) {
		artwork_id_to_forge = undefined;
		updateForgedItemData();
	},

	'click #clear-artwork-selected': function(event) {
		artwork_id_to_forge = undefined;
		forged_item_data = undefined;
		forgery_contract_selected_id = undefined;
		refreshArtistArray();
		forged_preview_tracker.changed();
	},

	'click .forgery-contract-container.unselected': function(event) {
		var forgery_contract_id = $(event.target).closest('.forgery-contract-container.unselected').data().forgery_contract_id;
		forgery_contract_selected_id = forgery_contract_id;
		updateForgedItemData();
	},

	'click .forgery-contract-container.selected': function(event) {
		forgery_contract_selected_id = undefined;
		updateForgedItemData();
	}
})

Template.forge.rendered = function() {
	artwork_id_to_forge = undefined;
	forgery_contract_selected_id = undefined;
	forged_item_data = undefined;
	forged_preview_tracker.changed();

	artist_array = undefined;
	current_page = 1;
	total_pages = 1;
	artists_per_page = 10;
	refreshArtistArray();
}