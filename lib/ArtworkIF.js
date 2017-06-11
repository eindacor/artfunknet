getArtworkInterfacesByArtist = function(artist_interface) {
	var artwork_interfaces = [];
	getFromCollection("ArtworkIF.js:getArtworkInterfacesByArtist", artworks, {'artist_id': artist_interface.getId()}).forEach(function(artwork_object) {
		artwork_interfaces.push(new ArtworkIF(artwork_object));
	})

	return artwork_interfaces;
}

ArtworkIF = function(artwork) {
	var artwork_id;
	var artwork_object;
    var made_from_object = (typeof artwork !== "string");

    // item id was passed
    if (!made_from_object) {
        artwork_id = artwork;
        artwork_object = getOneFromCollection("ArtworkIF.js:ArtworkIF - " + artwork_id, artworks, artwork_id);
    }

    // artwork object was passed
    else {
        artwork_object = artwork;
        artwork_id = artwork_object._id;
    }

    this.getId = function() {
    	return artwork_id;
    }

    this.getPotentialArchiveCategories = function() {
    	var categories = ["standard"];

    	if (artwork_object.rarity != "common") {
    		categories.push("unlocked");
    	}

        categories.push("foil");

    	if (artwork_object.rarity == "legendary" || artwork_object.rarity == "masterpiece") {
    		categories.push("seasonal");
            categories.push("lottery");
    	}

        categories.push("vintage");

    	return categories;
    }
}