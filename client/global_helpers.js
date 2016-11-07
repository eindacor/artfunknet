var item_value_dep = new Tracker.Dependency;

var addItemValueToView = function(item_id, value_type, view) {
	Meteor.call('getItemValue', item_id, value_type, Meteor.userId(), function(error, result) {
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
	// return "img/uvtemplate.bmp";
	if (filename == undefined || filename == "undefined" || filename == "")
		return "";
	
	return "https://s3.amazonaws.com/com.artfunkel.artwork/full_images/" + filename;
})

Template.registerHelper('getCardImageURL', function(filename) {
	if (filename == undefined || filename == "undefined" || filename == "")
		return "";

	var image_name = filename.substring(0, filename.indexOf("."));
	
	return "https://s3.amazonaws.com/com.artfunkel.artwork/card_images/" + image_name + "_card.jpg";
})

Template.registerHelper('getThumbImageURL', function(filename) {
	if (filename == undefined || filename == "undefined" || filename == "")
		return "";
	
	var image_name = filename.substring(0, filename.indexOf("."));
	
	return "https://s3.amazonaws.com/com.artfunkel.artwork/thumbnail_images/" + image_name + "_thumb.jpg";
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

Template.registerHelper('itemPermissions', function(item_object) {
	if (Meteor.user()) {
		var item_controlled = item_object.owner == Meteor.userId() && item_object.status != 'for_sale';

		var force_reroll = item_controlled && procUniqueAttribute(Meteor.userId(), "REROLL_DISPLAY_ENABLE", "Designer") && item_object.status != "unclaimed" && item_object.status != "won";

		var permission_object = {
			'item_data': item_object,
			'auction': 
				item_controlled && 
				item_object.status == "claimed" && 
				items.find({'owner' : Meteor.userId(), 'status' : 'auctioned'}).count() < Meteor.user().profile.auction_cap,
			'sell': 
				item_controlled && 
				(item_object.status == 'claimed' || item_object.status == 'unclaimed' || item_object.status == "won") && 
				items.find({'owner': Meteor.userId(), 'status': {$nin: ["unclaimed", "for_sale"]}}).count() > 1,
			'reroll': 
				item_controlled && 
				(item_object.status == "claimed" || force_reroll),
			'claim':
				item_controlled && 
				(item_object.status == "unclaimed" || item_object.status == "won") && 
				items.find({'owner' : Meteor.userId(), 'status' : {$nin: ['unclaimed', 'for_sale', 'won']}, 'original': {$ne: true}}).count() < Meteor.user().profile.inventory_cap,
			'permanent': 
				item_controlled && 
				(item_object.status == "claimed" || item_object.status == "permanent"),
			'purchase': 
				item_object.owner == Meteor.userId() && 
				item_object.status == 'for_sale' && 
				items.find({'owner' : Meteor.userId(), 'status' : {$nin: ['unclaimed', 'for_sale', 'won']}, 'original': {$ne: true}}).count() < Meteor.user().profile.inventory_cap,
			'decline': 
				item_object.status == "for_sale" && 
				item_object.owner == Meteor.userId(),
			'display': 
				item_controlled && 
				items.find({'owner' : Meteor.userId(), 'status' : 'displayed'}).count() < Meteor.user().profile.display_cap && 
				items.find({'owner' : Meteor.userId(), 'status' : {$in: ['displayed', 'permanent']}, 'artwork_id' : item_object.artwork_id}).count() == 0 &&
				item_object.status == 'claimed'
		}

		return permission_object;
	}

	else return undefined;
})
