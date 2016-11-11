var full_size_tracker = new Tracker.Dependency;
var full_container_width;
var full_container_height;

Template.imageOnlyModal.helpers({
	'getRarity' : function(artwork_id) {
		return artworks.findOne(artwork_id).rarity;
	}
})

Template.imageOnlyModal.rendered = function() {
	if ($('.img-container').length != 0) {
		full_container_height = $('.img-container').height();
		full_container_width = $('.img-container').width(); 
		full_size_tracker.changed();
	}

	sought_status = {};
}