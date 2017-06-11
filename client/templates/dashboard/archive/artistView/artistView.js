var artwork_selected = true;

Template.artistView.helpers({
	'artist': function() {
		return artists.find({}, {sort: {'artist_name': 1},limit: 10});
	},

	'artist_selected': function(artist_object) {
		return true;
	},

	'artwork': function(artist_object) {
		return artworks.find({'artist_id': artist_object._id, 'active': true});
	},

	'artwork_selected': function(artwork_object) {
		return true;
	},

	'archive_category': function(artwork_object) {
		var artwork_interface = new ArtworkIF(artwork_object);
		return artwork_interface.getPotentialArchiveCategories();
	},

	'item_object': function(artwork_object, archive_category) {
		var item_object = getOneFromCollection("artistView.js:item_object", items, {'owner': Meteor.userId(), 'artwork_id': artwork_object._id, 'status': "archived", 'archive_category': archive_category});
		return item_object ? item_object : false;
	}
})