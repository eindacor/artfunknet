var item_value_dep = new Tracker.Dependency;

var addItemValueToView = function(item_id, value_type, view) {
	Meteor.call('getItemValue', item_id, value_type, function(error, result) {
		if (error)
			console.log(error.message);

		else {
			Blaze.getData(view)[item_id + "_value"] = result;
			item_value_dep.changed();
		}
	})
}

Template.registerHelper('getItemValue', function(item_id, value_type) {
	if (item_id) {
		item_value_dep.depend();
		var value_data = Blaze.getData(Blaze.currentView)[item_id + "_value"];
		if (value_data) 		
			return getCommaSeparatedValue(value_data);

		else {
			addItemValueToView(item_id, value_type, Blaze.currentView);
			return "";
		}
	}
})

Template.registerHelper('getHTMLColorFromValue', function(value) {
	var red_value = 255 - Math.floor(value * 255);
	var color_string = "rgb(" + red_value + " , 0, 0)";
	return color_string;
})

Template.registerHelper('userIsAdmin', function() {
	return Meteor.user() && Meteor.user().profile.user_type == "admin";
})

Template.registerHelper('displayAsMoneyValue', function(value) {
	return "$" + getCommaSeparatedValue(value);
})

Template.registerHelper('commaSeparatedValue', function(value) {
	return getCommaSeparatedValue(value);
})

Template.registerHelper('positionFromIndex', function(index) {
	return index + 1;
})

Template.registerHelper('isEqual', function(first, second) {
	return first == second;
})

Template.registerHelper('getImageURL', function(filename) {
	// return "img/profile-photos/female.png";
	if (filename == undefined || filename == "undefined" || filename == "")
		return "";
	
	return "https://s3.amazonaws.com/com.artfunkel.artwork/full_images/" + filename;
})

Template.registerHelper('getS3ImageURL', function(filename) {
	if (filename == undefined || filename == "undefined" || filename == "")
		return "";
	
	return "http://s3.amazonaws.com/com.artfunkel.artwork/" + filename;
})

Template.registerHelper('getTextureURL', function(filename) {
	if (filename == undefined || filename == "undefined" || filename == "")
		return "";
	
	return "https://s3.amazonaws.com/com.artfunkel.artwork/textures/" + filename;
})

Template.registerHelper('floatToPercentage', function(value) {
	return Math.floor(value * 100);
})

Template.registerHelper('cardArray', function(item_array) {
	//create list object and add rarity_rank, feature_count, artist, title, date
	var display_objects = [];

	item_array.forEach(function(db_object) {
		//item_value_dep.depend();
		var artwork_object = artworks.findOne(db_object.artwork_id);
		var display_object = db_object;

		var rarity_rank;
		switch(artwork_object.rarity) {
			case "common": rarity_rank = 0; break;
			case "uncommon": rarity_rank = 1; break;
			case "rare": rarity_rank = 2; break;
			case "legendary": rarity_rank = 3; break;
			case "masterpiece": rarity_rank = 4; break;
			default: rarity_rank = 0; break;
		}

		display_object.rarity_rank = rarity_rank;
		display_object.feature_count = db_object.attributes.length;
		display_object.artist = artwork_object.artist;
		display_object.title = artwork_object.title;
		display_object.date = artwork_object.date;
		display_object.rarity = artwork_object.rarity;
		display_object.width = artwork_object.width;
		display_object.height = artwork_object.height;
		display_object.condition_text = Math.floor((db_object.condition * 100)) + '%';
		display_object.xp_rating_text = Math.floor(db_object.xp_rating * 100);
		display_object.filename = artwork_object.filename;
		display_object.permanent = db_object.status == "permanent";

		display_objects.push(display_object);
	})

	display_objects.sort(function (a, b) {
		return Session.get('inventory_ascending') ? 
			a[Session.get('inventory_sort')] > b[Session.get('inventory_sort')]  : 
			a[Session.get('inventory_sort')]  < b[Session.get('inventory_sort')] ;
	});

	return display_objects;
})

Template.registerHelper('cardData', function(item) {
	//create list object and add rarity_rank, feature_count, artist, title, date
	if (item) {
		var artwork_object = artworks.findOne(item.artwork_id);
		var display_object = item;

		var rarity_rank;
		switch(artwork_object.rarity) {
			case "common": rarity_rank = 0; break;
			case "uncommon": rarity_rank = 1; break;
			case "rare": rarity_rank = 2; break;
			case "legendary": rarity_rank = 3; break;
			case "masterpiece": rarity_rank = 4; break;
			default: rarity_rank = 0; break;
		}

		display_object.rarity_rank = rarity_rank;
		display_object.feature_count = item.attributes.length;
		display_object.artist = artwork_object.artist;
		display_object.title = artwork_object.title;
		display_object.date = artwork_object.date;
		display_object.rarity = artwork_object.rarity;
		display_object.width = artwork_object.width;
		display_object.height = artwork_object.height;
		display_object.condition_text = Math.floor((item.condition * 100)) + '%';
		display_object.xp_rating_text = Math.floor(item.xp_rating * 100);
		display_object.filename = artwork_object.filename;
		display_object.permanent = item.status == "permanent";

		return display_object;
	}

	else return undefined;
})

Template.registerHelper('itemPermissions', function(item_object) {
	if (Meteor.user()) {
		var item_controlled = item_object.owner == Meteor.userId() && item_object.status != 'for_sale';

		var permission_object = {
			'auction': item_controlled && item_object.status == "claimed" && items.find({'owner' : Meteor.userId(), 'status' : 'auctioned'}).count() < Meteor.user().profile.auction_cap,
			'sell': item_controlled && (item_object.status == 'claimed' || item_object.status == 'unclaimed') && items.find({'owner': Meteor.userId(), 'status': {$nin: ["unclaimed", "for_sale"]}}).count() > 1,
			'reroll': item_controlled && item_object.status == "claimed",
			'claim': item_controlled && item_object.status == "unclaimed" && items.find({'owner' : Meteor.userId(), 'status' : {$nin: ['unclaimed', 'for_sale']}}).count() < Meteor.user().profile.inventory_cap,
			'permanent': item_controlled && (item_object.status == "claimed" || item_object.status == "permanent"),
			'purchase': item_object.owner == Meteor.userId() && item_object.status == 'for_sale' && items.find({'owner' : Meteor.userId(), 'status' : {$nin: ['unclaimed', 'for_sale']}}).count() < Meteor.user().profile.inventory_cap,
			'decline': item_object.status == "for_sale" && item_object.owner == Meteor.userId(),
			'display': item_controlled && items.find({'owner' : Meteor.userId(), 'status' : 'displayed'}).count() < Meteor.user().profile.display_cap && 
				items.find({'owner' : Meteor.userId(), 'status' : {$in: ['displayed', 'permanent']}, 'artwork_id' : item_object.artwork_id}).count() == 0 &&
				item_object.status == 'claimed'
		}

		return permission_object;
	}

	else return undefined;
})