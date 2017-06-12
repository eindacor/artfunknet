var artist_data_tracker = new Tracker.Dependency;
var expanded_data_tracker = new Tracker.Dependency;
var artist_array;
var current_page;
var total_pages;
var match_query;
var expanded_artist_ids = [];
var expanded_artwork_ids = [];
var artists_per_page = 10;

var generateQueryFromSearchTerms = function(search_terms) {
	if (search_terms.length == 0)
		return undefined;

	var or_array = [];

	for (var i=0; i<search_terms.length; i++) {
		var term = search_terms[i];
		var term_array = [
			{'artist': {'$regex': term, '$options': 'i'}},
			{'title': {'$regex': term, '$options': 'i'}},
			// {'genre': {'$regex': term, '$options': 'i'}},
			{'rarity': {'$regex': term, '$options': 'i'}},
			{'medium': {'$regex': term, '$options': 'i'}}
		]
		or_array = or_array.concat(term_array);
	}
	var or_object = {'$or': or_array};
	return or_object;
}

var refreshArtistArray = function() {
	expanded_artist_ids = [];
	expanded_artwork_ids = [];
	var and_query_array = [{'active': true}];

	var rarities_selected = artwork_rarities; //fetch from DOM
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
		var and_query_array = [{'artist_id': artist_object._id, 'active': true}]
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
	},

	'artwork_collection_data': function(artist_object)  {
		var artwork_objects = getFromCollection("artistView.js:artworks_archived", artworks, {'artist_id': artist_object._id}).fetch();
		var artwork_count = artwork_objects.length;
		var total_items_available = 0;
		for (var i=0; i<artwork_objects.length; i++) {
			var artwork_interface = new ArtworkIF(artwork_objects[i]);
			var available_category_count = artwork_interface.getPotentialArchiveCategories().length;
			total_items_available += available_category_count;
		}

		var total_items_archived = getFromCollection("artistView.js:artworks_archived", items, {'artwork_data.artist_id': artist_object._id, 'status': "archived", 'archive_category': {$ne: null}}).count();

		return {
			'total_items_available': total_items_available,
			'total_items_archived': total_items_archived
		}
	},

	'item_collection_data': function(artwork_object) {
		var artwork_interface = new ArtworkIF(artwork_object);
		var available_category_count = artwork_interface.getPotentialArchiveCategories().length;
		var items_archived = getFromCollection("artistView.js:artworks_archived", items, {'artwork_id': artwork_object._id, 'status': "archived", 'archive_category': {$ne: null}}).count();

		return {
			'total_items_available': available_category_count,
			'total_items_archived': items_archived
		}
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

	// 'click .expand-collapse': function(event) {
	// 	var type = $(event.target).data().type;
	// 	var target_id = $(event.target).data().target_id;

	// 	if (type == "artist") {
	// 		if (expanded_artist_ids.indexOf(target_id) == -1) {
	// 			expanded_artist_ids.push(target_id);
	// 		}

	// 		else expanded_artist_ids.splice(expanded_artist_ids.indexOf(target_id), 1);
	// 	}

	// 	else {
	// 		if (expanded_artwork_ids.indexOf(target_id) == -1) {
	// 			expanded_artwork_ids.push(target_id);
	// 		}

	// 		else expanded_artwork_ids.splice(expanded_artwork_ids.indexOf(target_id), 1);
	// 	}

	// 	expanded_data_tracker.changed();
	// },

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
	}
})