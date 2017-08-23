var artist_data_tracker = new Tracker.Dependency;
var expanded_data_tracker = new Tracker.Dependency;
var enforce_terms_tracker = new Tracker.Dependency;
var expanded_categories_tracker = new Tracker.Dependency;
var rarity_selection_tracker = new Tracker.Dependency;
var artist_array;
var current_page;
var total_pages;
var match_query;
var expanded_artist_ids = [];
var expanded_artwork_ids = [];
var expanded_categories = [];
var rarities_selected = artwork_rarities.slice();
var artists_per_page = 10;
var enforce_terms = false;

var collected_tracker = new Tracker.Dependency;
var collected = undefined;

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
	expanded_artwork_ids = [];
	expanded_categories = [];
	var and_query_array = [{'active': true}];

	and_query_array.push({'rarity': {'$in': rarities_selected}});

	var search_terms = commaSeparatedValuesToArray($('#search-area').val());

	var search_term_query = generateQueryFromSearchTerms(search_terms);
	if (search_term_query != undefined) {
		and_query_array.push(search_term_query);
	}

    match_query = {'$and' : and_query_array};

    Meteor.call('getArtistsFromQuery', match_query, current_page, artists_per_page, function(error, result) {
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
	rarity_selection_tracker.changed();
}

Template.artistView.rendered = function() {
	artist_array = undefined;
	current_page = 1;
	total_pages = 1;
	artists_per_page = 10;
	refreshArtistArray();
}

Template.artistView.helpers({
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

	'artwork_selected': function(artwork_object) {
		expanded_data_tracker.depend()
		return expanded_artwork_ids.indexOf(artwork_object._id) != -1;
	},

	'category_selected': function(artwork_object, category) {
		expanded_categories_tracker.depend();
		return expanded_categories.indexOf(artwork_object._id + "_" + category) != -1;
	},

	'archive_category': function(artwork_object) {
		var artwork_interface = new ArtworkIF(artwork_object);
		return artwork_interface.getPotentialArchiveCategories();
	},

	'item_object': function(artwork_object, archive_category) {
		var query_object = CATEGORY_QUERIES[archive_category];
		query_object.owner = Meteor.userId();
		query_object.artwork_id = artwork_object._id;
		query_object.status = "archived";
		query_object.displaced = false;
		return getFromCollection("artistView.js:item_object", items, query_object).fetch();
	},

	'current_page': function() {
		artist_data_tracker.depend();
		return current_page;
	},

	'total_pages': function() {
		artist_data_tracker.depend();
		return total_pages;
	},

	'enforce_terms': function() {
		enforce_terms_tracker.depend();
		return enforce_terms;
	},

	'artwork_rarity': function() {
		return artwork_rarities;
	},

	'rarity_selected': function(rarity) {
		rarity_selection_tracker.depend();
		return rarities_selected.indexOf(rarity) != -1;
	},

	'rarities_selected': function() {
		return rarities_selected;
	}
})

Template.artistView.events({
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

	'click .artwork-info': function(event) {
		var artwork_id = $(event.target).closest('.artwork-info').data().artwork_id;
		if (expanded_artwork_ids.indexOf(artwork_id) == -1) {
			expanded_artwork_ids.push(artwork_id);
		}

		else expanded_artwork_ids.splice(expanded_artwork_ids.indexOf(artwork_id), 1);

		expanded_data_tracker.changed();
	},

	'click .button-row': function(event) {
		event.stopPropagation();
	},

	'click .category-info': function(event) {
		var artwork_and_category = $(event.target).closest('.category-info').data().artwork_and_category;
		if (expanded_categories.indexOf(artwork_and_category) == -1) {
			expanded_categories.push(artwork_and_category);
		}

		else expanded_categories.splice(expanded_categories.indexOf(artwork_and_category), 1);

		expanded_categories_tracker.changed();
	},

	'click .enforce-terms': function() {
		enforce_terms = !enforce_terms;
		enforce_terms_tracker.changed();
		refreshArtistArray();
	},

	'click .rarity-button': function(event) {
		var rarity = $(event.target).data().rarity;
		if (rarities_selected.indexOf(rarity) == -1) {
			rarities_selected.push(rarity);
		}

		else rarities_selected.splice(rarities_selected.indexOf(rarity), 1);

		refreshArtistArray();
	}
})