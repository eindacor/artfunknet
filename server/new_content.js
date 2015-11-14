var new_gallery_finishes = [
	{
		'type': "floor finish",
		'filename': "hardwood_mahogany.jpg",
		'name': "Mahogany Flooring",
		'quality': "rare",
	},
]

var addNewGalleryFinishes = function() {
	for (var i=0; i < new_gallery_finishes.length; i++) {
		if (gallery_finishes.findOne({'filename': new_gallery_finishes[i].filename}) == undefined)
			gallery_finishes.insert(new_gallery_finishes[i]);
	}
}

addNewContent = function() {
	addNewGalleryFinishes();
}