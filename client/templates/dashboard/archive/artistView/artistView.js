var artist_data_tracker = new Tracker.Dependency;
var artist_array;
var current_page;
var total_pages;
var match_query;
var expanded_artists = [];

var generateQueryFromSearchTerms = function(search_terms) {
	if (search_terms.length == 0)
		return undefined;

	var or_array = [];

	for (var i=0; i<search_terms.length; i++) {
		var term = search_terms[i];
		var term_array = [
			{'artist': {'$regex': term, '$options': 'i'}},
			{'title': {'$regex': term, '$options': 'i'}},
			{'genre': {'$regex': term, '$options': 'i'}},
			{'medium': {'$regex': term, '$options': 'i'}}
		]
		or_array = or_array.concat(term_array);
	}
	var or_object = {'$or': or_array};
	return or_object;
}

var refreshArtistArray = function() {
	var and_query_array = [{'active': true}];

	var rarities_selected = artwork_rarities; //fetch from DOM
	and_query_array.push({'rarity': {'$in': rarities_selected}});

	var search_terms = commaSeparatedValuesToArray($('#search-area').val()); //fetch from text field

	var search_term_query = generateQueryFromSearchTerms(search_terms);
	if (search_term_query != undefined) {
		and_query_array.push(search_term_query);
	}

    match_query = {'$and' : and_query_array};

    var page = 1;
    var artists_per_page = 10;

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
}

Template.artistView.rendered = function() {
	artist_array = undefined;
	current_page = 1;
	total_pages = 1;
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
		return true;
	},

	'artwork': function(artist_object) {
		return artworks.find({'artist_id': artist_object._id, 'active': true});
	},

	'artwork_selected': function(artwork_object) {
		return false;
	},

	'archive_category': function(artwork_object) {
		var artwork_interface = new ArtworkIF(artwork_object);
		return artwork_interface.getPotentialArchiveCategories();
	},

	'item_object': function(artwork_object, archive_category) {
		var item_object = getOneFromCollection("artistView.js:item_object", items, {'owner': Meteor.userId(), 'artwork_id': artwork_object._id, 'status': "archived", 'archive_category': archive_category});
		return item_object ? item_object : false;
	},

	'current_page': function() {
		artist_data_tracker.depend();
		return current_page;
	},

	'total_pages': function() {
		artist_data_tracker.depend();
		return total_pages;
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
		items_per_page = Number($('#page-count-select').val());
		updateItemGetter();
	}
})