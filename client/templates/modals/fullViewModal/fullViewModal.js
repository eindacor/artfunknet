var full_size_tracker = new Tracker.Dependency;

var full_container_width;
var full_container_height;

var container_set;

var getImageSize = function(width, height) {
	try {
		full_container_height = $('.inner-container').css('height').replace("px", "");
		full_container_width = $('.inner-container').css('width').replace("px", ""); 

		var max_width = full_container_width;
		var max_height = full_container_height;

		var original_ratio = width / height;

		var height_when_width_maxed = max_width / original_ratio;

		if (height_when_width_maxed > max_height) {
			return {
				'image_width': Math.floor(original_ratio * max_height),
				'image_height': max_height
			}
		}

		else return {
			'image_width': max_width,
			'image_height': max_width / original_ratio
		} 
	}
	catch (error) {
		console.log(error);
	}
}

Template.fullViewModal.helpers({
	'getRarity' : function(artwork_id) {
		return artworks.findOne(artwork_id).rarity;
	},

	'setImage': function(item_object) {
		full_size_tracker.depend();

		if ($('.inner-container').length == 0) {
			setTimeout(function () {
		        full_size_tracker.changed();
		    }, 1000);
		    return;
		}

		var artwork_interface = new ArtworkIF(item_object.artwork_id);
		var image_size = getImageSize(artwork_interface.getArtworkObject().width, artwork_interface.getArtworkObject().height);
		var image = $('<img class="' + item_object.artwork_data.rarity + '-item" src="' + artwork_interface.getImageURL() + '" style="width: ' + image_size.image_width + 'px; height: ' + image_size.image_height + 'px;">');
		$('.inner-container').append(image);
	}
})