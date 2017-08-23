Template.registerHelper('getItemObjectValue', function(item_object, value_type) {
	return getCommaSeparatedValue(getItemObjectValueByType(item_object, value_type, Meteor.userId()));
})

Template.registerHelper('consoleLogThis', function(the_thing) {
	console.log(the_thing);
	return true;
})

Template.registerHelper('getHTMLColorFromValue', function(value) {
	return getHTMLColorFromValue(value);
})

Template.registerHelper('getKnowledgeColorString', function(type) {
	var index = knowledge_types.indexOf(type);
	var base_r = 150;
	var base_g = 230;
	var multiplier = Math.pow(.8, knowledge_types.length - index -1);
	return "rgb(" + Math.floor(base_r * multiplier) + ", " + Math.floor(base_g * multiplier) + ", 0)";
})

Template.registerHelper('userIsAdmin', function() {
	return Meteor.user() && Meteor.user().profile.user_type == "admin";
})

Template.registerHelper('displayAsMoneyValue', function(value) {
	if (value < 0) {
		var string_value = getCommaSeparatedValue(value);
		var new_string = string_value.slice(0, 1) + "$" + string_value.slice(1);
		return new_string;
	}
	
	else return "$" + getCommaSeparatedValue(value);
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

Template.registerHelper('getImageURL', function(filename, extension) {
	// return "img/uvtemplate.bmp";
	if (filename == undefined || filename == "undefined" || filename == "")
		return "";
	
	return "https://s3.amazonaws.com/com.artfunkel.artwork/full_images/" + filename + '.' + extension;
})

Template.registerHelper('getCardImageURL', function(filename, extension) {
	if (filename == undefined || filename == "undefined" || filename == "")
		return "";
	
	return "https://s3.amazonaws.com/com.artfunkel.artwork/card_images/" + filename + "_card." + extension;
})

Template.registerHelper('getThumbImageURL', function(filename, extension) {
	if (filename == undefined || filename == "undefined" || filename == "")
		return "";
	
	return "https://s3.amazonaws.com/com.artfunkel.artwork/thumbnail_images/" + filename + "_thumb." + extension;
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

//TODO collaps helpers into single object
Template.registerHelper('canUpgrade', function(item_data) {
	var permissions = new PlayerItemPermissions(new PlayerIF(Meteor.user()), new ItemIF(item_data));
	return permissions.canUpgrade();
})

Template.registerHelper('canAffordUpgrade', function(item_data) {
	var permissions = new PlayerItemPermissions(new PlayerIF(Meteor.user()), new ItemIF(item_data));
	return permissions.canAffordUpgrade();
})

Template.registerHelper('inventoryIsFull', function() {
	var player_interface = new PlayerIF(Meteor.user());
	return player_interface.inventoryIsFull();
})


//item template helpers

Template.registerHelper('card_types', function(item_object) {
	try {
		var types = "";

		if (item_object.foil) {
			types += "foil ";
		}

		if (item_object.unlocked) {
			types += "unlocked ";
		}

		if (item_object.seasonal) {
			types += "seasonal ";
		}

		if (item_object.vintage) {
			types += "vintage ";
		}

		if (item_object.lottery) {
			types += "lottery ";
		}

		if (item_object.original) {
			types += "original ";
		}

		return types;
	}
	catch (error) {
		console.log(error.message);
	}
})

Template.registerHelper('unique_attribute_data', function(unique_attribute_id) {
	if (unique_attribute_id)
		return unique_attributes.findOne(unique_attribute_id);

	else return undefined;
})

Template.registerHelper('isForgery', function(item_object) {
	//TODO
	return false;
})

Template.registerHelper('recommended_archive', function(item_object) {
	if (Meteor.user().profile.settings.ignore_archive_recommendations)
		return false;
	
	//TODO move recommended status to playerIF, passing item data
	try {
		var player_item_interface = new PlayerItemIF(new PlayerIF(Meteor.user()), new ItemIF(item_object));
		return player_item_interface.getRecommendedStatus();
	}

	catch(error) {
		return undefined;
	}
})

Template.registerHelper('sortedAttributes', function(attributes) {
	if (attributes == undefined || attributes.length == undefined)
		return [];
	
	attributes.sort(function(first, second) {
        if (first.description > second.description)
            return 1;

        else return -1;
    });

    return attributes;
})

Template.registerHelper('isQuestItem', function(artwork_id) {
	return quests.findOne({'owner_id': Meteor.userId(), 'target': {$in: [artwork_id]}}) != undefined;
})

Template.registerHelper('isSought', function(artwork_id) {
	return false;
	//TODO move these checks to server to prevent access from client console
	// if (Meteor.user().profile.market_expert.expiration > moment()._d.toISOString()) {
	// 	sought_tracker.depend();
	// 	if (sought_status[artwork_id] === undefined) {
	// 		updateSoughtStatus(artwork_id);
	// 		return false;
	// 	}

	// 	else return sought_status[artwork_id];
	// }

	// else return false;
})

Template.registerHelper('archive_indicator', function(item_object) {
	var archive_indicators = [];
	var player_interface = new PlayerIF(Meteor.userId());
	var artwork_interface = new ArtworkIF(getOneFromCollection("ItemTemplate.js:archive_indicator", artworks, {'_id': item_object.artwork_id}));
	for (var i=0; i<ARCHIVE_CATEGORIES.length; i++) {
		if (player_interface.hasArchivedArtworkOfCategory(artwork_interface, ARCHIVE_CATEGORIES[i])) {
			archive_indicators.push(ARCHIVE_CATEGORIES[i]);
		}
	}

	return archive_indicators;
})

item_data_tracker = new Tracker.Dependency;

item_data_map = {};
item_data_tracker_map = {};

itemDataDepend = function(item_id) {
	if (item_data_tracker_map[item_id] == undefined) {
		item_data_tracker_map[item_id] = new Tracker.Dependency;
	}

	item_data_tracker_map[item_id].depend();
}

updateItemData = function(item_object) {
	if (item_object) {
		item_data_map[item_object._id] = item_object;

		if (item_data_tracker_map[item_object._id] == undefined) {
			item_data_tracker_map[item_object._id] = new Tracker.Dependency;
		}

		item_data_tracker_map[item_object._id].changed();
	}	
}

removeItemData = function(item_id) {
	if (item_data_map[item_id] != undefined) {
		delete item_data_map[item_id];
		delete item_data_tracker_map[item_id];
	}
}

getItemData = function(item_id) {
	if (item_data_map[item_id] == undefined) {
		Meteor.call('getItemData', item_id, function(error, result) {
			if (error) {
				console.log(error.message);
			}
			else {
				updateItemData(result);		
			}
		})
	}
	else return item_data_map[item_id];
}

clearItemData = function() {
	item_data_map = {};
	item_data_tracker_map = {};
}

item_data_force_update_tracker = new Tracker.Dependency;

Template.registerHelper('getItemData', function(item_id) {
	item_data_force_update_tracker.depend();
	itemDataDepend(item_id);
	var item_data = getItemData(item_id);

	if (item_data != undefined) {
		removeItemData(item_data._id);	
	}

	return item_data;
})

Template.registerHelper('fetchServerData', function() {
	try {
		var meteor_args = [];

		for (var i=0; i<arguments.length; i++) {
			meteor_args.push(arguments[i]);
		}

		var unique_id = "";

		for (var i=0; i<meteor_args.length; i++) {
			unique_id += JSON.stringify(meteor_args[i]);
		}

		var fetcher = getFetcher(unique_id);

		meteor_args.push(fetcher.getCallback());

		fetcher.getTracker().depend();
		if (fetcher.getData() == undefined) {
			Meteor.call.apply(null, meteor_args);
		}
		else {
			deleteFetcher(unique_id);
			return fetcher.getData();
		}
	}
	catch (error) {
		console.log(error.message);
	}
})