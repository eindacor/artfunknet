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

 	{
	    "artist": "Landon Wilson",
	    "title": "Fahrenheit 454",
	    "date": 2013,
	    "genre": "contemporary",
	    "rarity": "rare",
	    "medium": "Oil on Board",
	    "value_scale": 0.71,
	    "height": 50.8,
	    "width": 40.64,
	    "filename": "wilson_fahrenheit.jpg",
	    "nsfw": false,
	    "active": true,
  	},

  	{
	    "artist": "Landon Wilson",
	    "title": "Brother In Arms",
	    "date": 2011,
	    "genre": "contemporary",
	    "rarity": "common",
	    "medium": "acrylic and oil on canvas",
	    "value_scale": 0.81,
	    "height": 76.2,
	    "width": 122,
	    "filename": "wilson_brother.jpg",
	    "nsfw": false,
	    "active": true,
  	},

  	{
	    "artist": "Landon Wilson",
	    "title": "Space Ellipses",
	    "date": 2013,
	    "genre": "contemporary",
	    "rarity": "uncommon",
	    "medium": "oil and digital",
	    "value_scale": 0.42,
	    "height": 40.64,
	    "width": 35.56,
	    "filename": "wilson_space.jpg",
	    "nsfw": false,
	    "active": true,
  	},
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