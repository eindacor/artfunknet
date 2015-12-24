var window_size_tracker = new Tracker.Dependency;
var image_width = undefined;
var image_height = undefined;
var margin_top = undefined;
var margin_left = undefined;
var selected_artwork = undefined;

var setBackground = function() {
	var query;
	if (selected_artwork) 
		query = {'filename': {"$ne": selected_artwork.filename}, 'rarity': {"$in": ['legendary', 'masterpiece']}};

	else query = {'rarity': {"$in": ['legendary', 'masterpiece']}};

	var random_index = Math.floor(Math.random() * artworks.find(query).count());

	selected_artwork = artworks.findOne(query, {skip: random_index});

	console.log(selected_artwork.title + " by " + selected_artwork.artist);
	
	resizeBackground();
}

var resizeBackground = function() {
	if (selected_artwork) {
		var screen_ratio = window.innerWidth / window.innerHeight;
		var image_ratio = selected_artwork.width / selected_artwork.height;
		var img_scale;

		if (screen_ratio > image_ratio) {
			image_width = "100%";
			image_height = undefined;
			img_scale = window.innerWidth / selected_artwork.width;
			margin_top = Math.floor((selected_artwork.height * img_scale * -.5) + (window.innerHeight * .5)) + "px";
			margin_left = undefined;
		}

		else {
			image_width = undefined;
			image_height = "100%";
			img_scale = window.innerHeight / selected_artwork.height;
			margin_left = Math.floor((selected_artwork.width * img_scale * -.5) + (window.innerWidth * .5)) + "px";
			margin_top = undefined;
		}

		window_size_tracker.changed();
	}
}

Template.home.rendered = function() {
	Meteor.setTimeout(function() {setBackground();}, 500);

	window.onresize = function() {resizeBackground()};
}

Template.home.helpers({
	'jumbotron_image': function() {
		window_size_tracker.depend();

		if (selected_artwork) {
			return {
				'filename': selected_artwork.filename,
				'width': image_width,
				'height': image_height,
				'margin_top': margin_top,
				'margin_left': margin_left
			};
		}
	}
})

Template.home.created = function() {
	this.handle = Meteor.setInterval((function() {
		setBackground();
	}), 20000);
}

Template.auctionTable.destroyed = function() {
	Meteor.clearInterval(this.handle);
}