Template.imageOnlyModal.helpers({
	'getRarity' : function(artwork_id) {
		return artworks.findOne(artwork_id).rarity;
	}
})