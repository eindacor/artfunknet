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

    try {
        artwork_object = made_from_object ? artwork : getOneFromCollection("ArtworkIF.js:ArtworkIF - " + artwork, artworks, artwork);
        artwork_id = artwork_object._id;
    }

    catch(error) {
        throw "invalid artwork: " + artwork;
    }

    this.getId = function() {
    	return artwork_id;
    }

    this.getArtworkObject = function() {
        return artwork_object;
    }

    this.getRarity = function() {
        return artwork_object.rarity;
    }

    this.getPotentialArchiveCategories = function() {
    	var categories = ["standard"];

    	if (artwork_object.rarity != "common") {
    		categories.push("unlocked");
    	}

        categories.push("foil");

        if (SEASONAL_RARITIES.indexOf(artwork_object.rarity) != -1) {
            categories.push("seasonal");
        }

        if (LOTTERY_RARITIES.indexOf(artwork_object.rarity) != -1) {
            categories.push("lottery");
        }

        categories.push("vintage");

    	return categories;
    }

    this.getImageURL = function(type) {
        return getArtworkImageURLFromFilename(artwork_object.filename, type, artwork_object.file_extension);
    }
}