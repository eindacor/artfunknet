admin_settings = {
	'daily_drop_count': 6,
	'crate_drop_count': 6,
}

var adminValidated = function() {
	var user_object = Meteor.user();
	return user_object && user_object.profile.user_type == "admin";
}

Meteor.methods({
	'setPlayerLevel': function(level) {
		if (adminValidated()) {
			var cap_object = getCapSetterObject(level);

			var cap_keys = Object.keys(cap_object);
			for (var i=0; i < cap_keys.length; i++) {
				var key = cap_keys[i];
				var value = cap_object[key];

				var setter = {};
				var setter_key = "profile." + key;
				setter[setter_key] = value;
				Meteor.users.update(Meteor.user()._id, {$set : setter});
			}

			Meteor.users.update(Meteor.user()._id, {$set: {'profile.level': level}});
		}
	},

	'setXP': function(value) {
		if (adminValidated()) {
			Meteor.users.update(Meteor.user()._id, {$set: {'profile.xp': value}});
		}
	},

	'resetDailyDrop': function() {
		if (adminValidated()) {
			Meteor.users.update(Meteor.user()._id, {$set: {'profile.last_drop': moment().add(-1, "days")._d.toISOString()}});
		}
	},

	'updateDailyDropCount': function(value) {
		if (adminValidated()) {
			admin_settings.daily_drop_count = value;
		}
	},

	'updateCrateDropCount': function(value) {
		if (adminValidated()) {
			admin_settings.crate_drop_count = value;
		}
	},

	'generateForSale': function() {
		if (adminValidated()) {
			generateItems(Meteor.userId(), "platinum", admin_settings.daily_drop_count, "for_sale");
		}
	},

	'clearUnclaimed': function() {
		if (adminValidated()) {
			items.remove({'owner': Meteor.user()._id, 'status': "unclaimed"});
		}
	},

	'clearForSale': function() {
		if (adminValidated()) {
			items.remove({'owner': Meteor.user()._id, 'status': "for_sale"});
		}
	},

	'generateNPC': function(attribute_id) {
		if (adminValidated()) {
			gallery_object = galleries.findOne({'owner_id': Meteor.userId()});

			if (gallery_object)
				createNPC(gallery_object, attribute_id, 0);
		}
	},

	'setBankBalance': function(value) {
		if (adminValidated()) {
			Meteor.users.update(Meteor.userId(), {$set: {'profile.bank_balance': value}});
		}
	},

	'getAdminData': function() {
		var user_object = Meteor.user();

		if (user_object) {
			return {
				'player_level': user_object.profile.level,
				'player_xp': user_object.profile.xp,
				'daily_drop_count': admin_settings.daily_drop_count,
				'crate_drop_count': admin_settings.crate_drop_count,
				'bank_balance': user_object.profile.bank_balance,
				'seasonal_ids': seasonal_ids
			}
		}
	},

	'generateItemFromArtworkID' : function(user_id, artwork_id, condition, xp_rating, foil, seasonal, lottery) {
		if (adminValidated()) {
			if (user_id == "" || Meteor.users.findOne(user_id).profile.user_type == "admin")
				return generateItemFromArtworkID(Meteor.userId(), artwork_id, condition, xp_rating, foil, seasonal, lottery, "unclaimed");

			else if (Meteor.users.findOne(user_id) == undefined)
				return false;

			else return generateItemFromArtworkID(user_id, artwork_id, condition, xp_rating, foil, seasonal, lottery, "claimed");
		}

		else return undefined;
	},

	'generateRandomItemFromArtworkID' : function(user_id, artwork_id) {
		if (adminValidated()) {
			if (user_id == "" || Meteor.users.findOne(user_id).profile.user_type == "admin")
				return generateItemFromArtworkID(user_id, artwork_id, undefined, undefined, undefined, undefined, false, "unclaimed");

			else if (Meteor.users.findOne(user_id) == undefined)
				return false;

			else return generateItemFromArtworkID(user_id, artwork_id, undefined, undefined, undefined, undefined, false, "claimed");
		}

		else return undefined;
	},

	'updateProfiles' : function(field_name, value) {
		if (adminValidated()) {
			var setter = {};
			var key_string = "profile." + field_name;

			value = (value === "[]" ? [] : value);
			value = (value === "{}" ? {} : value);

			setter[key_string] = value;

			if (typeof(value) == "string" && value.length == 0)
				Meteor.users.update({}, {$unset: setter}, {multi: true});

			else Meteor.users.update({}, {$set: setter}, {multi: true});
		}

		else return undefined;
	}, 

	'setSeasonal' : function(id_array) {
		for (var i=0; i < id_array.length; i++) {
			if (artworks.findOne(id_array[i]) == undefined)
				return;
		}

		seasonal_ids = id_array;
	},

	'alertAllUsers' : function(message) {
        if (adminValidated()) {
            var all_users = Meteor.users.find({'profile.user_type': {$ne: "admin"}});

            all_users.forEach(function(db_object) {
                var alert_object = {
                    'user_id' : db_object._id,
                    'message' : message,
                    'link' : '/',
                    'icon' : 'fa-exclamation',
                    'sentiment' : "neutral",
                    'time' : moment()
                };

                alerts.insert(alert_object);
            })
	    }
    },

    'toggleAttributeStatus' : function(attribute_id) {
    	if (adminValidated()) {
    		attributes.update(attribute_id, {$set: {'active': !(attributes.findOne(attribute_id).active)}});
    	}
    },

    'toggleArtworkActivity' : function(artwork_id) {
    	if (adminValidated()) {
    		artworks.update(artwork_id, {$set: {'active': !(artworks.findOne(artwork_id).active)}});
    	}
    },

    'toggleArtworkNSFW' : function(artwork_id) {
    	if (adminValidated()) {
    		artworks.update(artwork_id, {$set: {'nsfw': !(artworks.findOne(artwork_id).nsfw)}});
    	}
    },

    'setArtworkRarity' : function(artwork_id, rarity) {
    	if (adminValidated()) {
	    	var artwork_object = artworks.findOne(artwork_id);
	    	if (rarity == "legendary" || rarity == "masterpiece") {
	            var random_attributes = [];
	            var attribute_count = rarity == "legendary" ? 2 : 3;

	            while (random_attributes.length < attribute_count) {
	                var selector = {'_id': {$nin: random_attributes}, 'active': true};
	                var count = attributes.find(selector).count();
	                if (count == 0)
	                    break;
	                
	                random_attributes.push(attributes.findOne(selector, {skip: Math.floor(Math.random() * count)})._id);
	            }

	            artworks.update(artwork_id, {$set: {'locked_attributes': random_attributes, 'rarity': rarity}});
	        }

	        else artworks.update(artwork_id, {$unset: {'locked_attributes': ""}, $set: {'rarity': rarity}});
	    }

	    //TODO update auctions
    },

    'setArtworkArtist' : function(artwork_id, artist_id) {
    	if (adminValidated()) {
    		var artist_object = artists.findOne(artist_id); 
    		if (artist_object)
    			artworks.update(artwork_id, {$set: {'artist': artist_object.artist_name, 'artist_id': artist_object._id}})
    	}

    	//TODO update auctions
    },

    'generateDBString' : function() {
    	if (adminValidated()) {
    		var attribute_data = attributes.find().fetch();
    		var attribute_string = "var downloaded_attribute_data = " + encodeURIComponent(JSON.stringify(attribute_data)) + "; ";

    		var user_data = Meteor.users.find().fetch();
    		var user_string = "var downloaded_user_data = " + encodeURIComponent(JSON.stringify(user_data)) + "; ";

    		var artwork_data = artworks.find().fetch();
    		var artwork_string = "var downloaded_artwork_data = " + encodeURIComponent(JSON.stringify(artwork_data)) + "; ";

    		var item_data = items.find().fetch();
    		var item_string = "var downloaded_item_data = " + encodeURIComponent(JSON.stringify(item_data)) + "; ";

    		var artist_data = artists.find().fetch();
    		var artist_string = "var downloaded_artist_data = " + encodeURIComponent(JSON.stringify(artist_data)) + "; ";

    		var auction_data = auctions.find().fetch();
    		var auction_string = "var downloaded_auction_data = " + encodeURIComponent(JSON.stringify(auction_data)) + "; ";

    		var gallery_finish_data = gallery_finishes.find().fetch();
    		var gallery_finish_string = "var downloaded_gallery_finish_data = " + encodeURIComponent(JSON.stringify(gallery_finish_data)) + "; ";

    		var quest_data = quests.find().fetch();
    		var quest_string = "var downloaded_quest_data = " + encodeURIComponent(JSON.stringify(quest_data)) + "; ";

			var data_string = "text/json;charset=utf-8," + 
				attribute_string + 
				user_string + 
				artwork_string + 
				item_string + 
				artist_string +
				auction_string + 
				gallery_finish_string + 
				quest_string;

			return data_string;
    	}

    	else return undefined;
    },

    'updateLockedAttributes': function(artwork_id, attribute_id_array) {
    	if (adminValidated()) {
    		artworks.update(artwork_id, {$set: {'locked_attributes': attribute_id_array}});
	        items.find().forEach(function(db_object) {
		        var item_attributes = db_object.attributes;
		        for (var i=0; i<item_attributes.length; i++) {
		            item_attributes[i].locked = attributeIsLocked(db_object.artwork_id, item_attributes[i]._id);
		        }

		        items.update(db_object._id, {$set: {'attributes': item_attributes}});
		    })
    	}
    },

    'getUsers': function() {
    	if (adminValidated()) {
    		return Meteor.users.find({'_id': {$ne: Meteor.userId()}}, {sort: {'profile.screen_name': -1}}).fetch();
    	}
    },

    'updateArtworkData': function(artwork_id, artwork_object) {
    	if (adminValidated()) {
    		if (isNaN(artwork_object.date) || isNaN(artwork_object.value_scale) || isNaN(artwork_object.height) || isNaN(artwork_object.width))
    			return undefined;

    		var legendary_attributes = getLegendaryAttributes(artwork_object.rarity);

    		if (legendary_attributes)
    			artwork_object.locked_attributes = legendary_attributes;

	        else artworks.update(artwork_id, {$unset: {'locked_attributes': ""}});

    		artworks.update(artwork_id, {$set: artwork_object});
    		return true;
    	}
    },

    'addNewArtwork': function(artwork_object) {
    	if (adminValidated()) {
    		var legendary_attributes = getLegendaryAttributes(artwork_object.rarity);

    		if (legendary_attributes)
    			artwork_object.locked_attributes = legendary_attributes;

    		return artworks.insert(artwork_object);
    	}

    	else return undefined;
    },

    'removeArtwork': function(artwork_id) {
    	if (adminValidated()) {
    		artworks.remove(artwork_id);
    		var all_items = items.find({'artwork_id': artwork_id}).fetch();

    		for (var i=0; i<all_items.length; i++) {
    			auctions.remove({'item_id': all_items[i]._id});
    		};

    		items.remove({'artwork_id': artwork_id});
    	}
    }
})

var getLegendaryAttributes = function(rarity) {
	if (rarity == "legendary" || rarity == "masterpiece") {
        var random_attributes = [];
        var attribute_count = rarity == "legendary" ? 2 : 3;

        while (random_attributes.length < attribute_count) {
            var selector = {'_id': {$nin: random_attributes}, 'active': true};
            var count = attributes.find(selector).count();
            if (count == 0)
                break;
            
            random_attributes.push(attributes.findOne(selector, {skip: Math.floor(Math.random() * count)})._id);
        }

        return random_attributes;
    }

    else return undefined;
}