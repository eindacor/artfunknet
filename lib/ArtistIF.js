ArtistIF = function(artist) {
	var artist_id;
	var artist_object;
    var made_from_object = (typeof artist !== "string");

    // item id was passed
    if (!made_from_object) {
        artist_id = artist;
        artist_object = getOneFromCollection("artistIF.js:artistIF - " + artist_id, artists, artist_id);
    }

    // artist object was passed
    else {
        artist_object = artist;
        artist_id = artist_object._id;
    }

    this.getId = function() {
    	return artist_id;
    }

    this.getArtistObject = function() {
    	return artist_object;
    }

    this.getImageURL = function(type) {
        var image_name = artist_object.filename.substring(0, filename.indexOf("."));
        
        switch(type) {
            case "avatar": return "https://s3.amazonaws.com/com.artfunkel.artwork/card_images/" + image_name + "_avatar.jpg";
            case "thumbnail": return "https://s3.amazonaws.com/com.artfunkel.artwork/card_images/" + image_name + "_thumb.jpg";
            case "card": return "https://s3.amazonaws.com/com.artfunkel.artwork/card_images/" + image_name + "_card.jpg";
            default: return "https://s3.amazonaws.com/com.artfunkel.artwork/card_images/" + image_name + ".jpg"; 
        } 
    }
}