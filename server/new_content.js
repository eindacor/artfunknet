var new_gallery_finishes = [
	
];

var addNewGalleryFinishes = function() {
	for (var i=0; i < new_gallery_finishes.length; i++) {
		if (gallery_finishes.findOne({'filename': new_gallery_finishes[i].filename}) == undefined)
			gallery_finishes.insert(new_gallery_finishes[i]);
	}
};

var new_artworks = [
	// {
	//     "artist": "Pablo Picasso",
	//     "title": "Women of Algiers",
	//     "date": 1955,
	//     "genre": "cubist",
	//     "rarity": "legendary",
	//     "medium": "Oil",
	//     "value_scale": 0.92,
	//     "height": 114,
	//     "width": 146.4,
	//     "filename": "picasso_women.jpg",
	//     "nsfw": false,
	//     "active": true,
 //  	},
];

var addNewArtworks = function() {
	for (var i=0; i < new_artworks.length; i++) {
		var artist_object = artists.findOne({'artist_name': new_artworks[i].artist});
		if (artist_object && artworks.findOne({'filename': new_artworks[i].filename}) == undefined) {
			var object_to_insert = new_artworks[i];
			object_to_insert.artist_id = artist_object._id;

			var inserted_id = artworks.insert(object_to_insert);
		}
	}
}

addNewContent = function() {
	addNewGalleryFinishes();
	addNewArtworks();
};