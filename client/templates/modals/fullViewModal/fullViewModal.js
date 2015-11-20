var full_size_tracker = new Tracker.Dependency;

var full_container_width;
var full_container_height;

Template.fullViewModal.helpers({
	'imageSize' : function(width, height) {
		full_size_tracker.depend();

		if ($('.inner-container').length != 0) {
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

		else return {
			'image_width': 20,
			'image_height': 20
		}
	},

	'getRarity' : function(artwork_id) {
		return artworks.findOne(artwork_id).rarity;
	}
})

Template.fullViewModal.rendered = function() {
	if ($('.inner-container').length != 0) {
		full_container_height = $('.inner-container').css('height').replace("px", "");
		full_container_width = $('.inner-container').css('width').replace("px", ""); 
		full_size_tracker.changed();
	}

	sought_status = {};
}

Template.fullViewModal.events({
	'click .close-button': function() {
		$('.template-modalTemplate').remove();
	}
})