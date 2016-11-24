admin_settings = {
	'daily_drop_count': 6,
	'crate_drop_count': 6,
}

adminValidated = function() {
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
            var multi_item_generator = {
                'source': "test",
                'user_id': Meteor.userId(),
                'quality': "platinum",
                'count': admin_settings.daily_drop_count,
                'status': "for_sale",
                'foil_chance': getLootData().global_foil_chance,
                'misprint_chance': getLootData().global_misprint_chance,
                'xp_rating_min': 0,
                'condition_min': 0
            }
            
            generateItems(multi_item_generator);
		}
	},

    'levelUp': function() {
        if (adminValidated() && Meteor.user().profile.level < 50) {
            var xp = getXPGoal(Meteor.user().profile.level);
            addXP(Meteor.userId(), xp);
        }
    },

	'generateNPC': function(attribute_id) {
		if (adminValidated()) {
			gallery_object = galleries.findOne({'owner_id': Meteor.userId()});

			if (gallery_object)
				createNPC(gallery_object, attribute_id, 0, getNPCQuality(Meteor.user().profile.level));
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
				'seasonal_ids': getLootData().seasonal_items
			}
		}
	},

	'generateItemFromArtworkID' : function(user_id, artwork_id, condition, xp_rating, foil_chance, seasonal, lottery, original, vintage, misprint_chance) {
		if (adminValidated()) {
			if (user_id == "" || Meteor.users.findOne(user_id).profile.user_type == "admin") {
                var item_generator = {
                    'source': "test",
                    'user_id': Meteor.userId(),
                    'artwork_id': artwork_id,
                    'condition': condition,
                    'xp_rating': xp_rating,
                    'foil_chance': foil_chance,
                    'seasonal': seasonal,
                    'lottery': lottery,
                    'original': original,
                    'vintage': vintage,
                    'misprint_chance': misprint_chance,
                    'status': "unclaimed",
                    'xp_rating_min': 0,
                    'condition_min': 0
                }

				return generateItemFromArtworkID(item_generator);
            }

			else if (Meteor.users.findOne(user_id) == undefined)
				return false;

			else {
                var item_generator = {
                    'source': "admin",
                    'user_id': user_id,
                    'artwork_id': artwork_id,
                    'condition': condition,
                    'xp_rating': xp_rating,
                    'foil_chance': foil_chance,
                    'seasonal': seasonal,
                    'lottery': lottery,
                    'original': original,
                    'vintage': vintage,
                    'misprint_chance': misprint_chance,
                    'status': "won",
                    'xp_rating_min': 0,
                    'condition_min': 0
                }

                return generateItemFromArtworkID(item_generator);
            }
		}

		else return undefined;
	},

	'generateRandomItemFromArtworkID' : function(user_id, artwork_id) {
		if (adminValidated()) {
			if (user_id == "" || Meteor.users.findOne(user_id).profile.user_type == "admin") {
                var item_generator = {
                    'source': "test",
                    'user_id': Meteor.userId(),
                    'artwork_id': artwork_id,
                    'condition': undefined,
                    'xp_rating': undefined,
                    'foil_chance': getLootData().global_foil_chance,
                    'seasonal': undefined,
                    'lottery': 0,
                    'original': false,
                    'misprint_chance': getLootData().global_misprint_chance,
                    'status': "unclaimed",
                    'xp_rating_min': 0,
                    'condition_min': 0
                }

				return generateItemFromArtworkID(item_generator);
            }

			else if (Meteor.users.findOne(user_id) == undefined)
				return false;

			else {
                var item_generator = {
                    'source': "admin",
                    'user_id': user_id,
                    'artwork_id': artwork_id,
                    'condition': undefined,
                    'xp_rating': undefined,
                    'foil_chance': getLootData().global_foil_chance,
                    'seasonal': undefined,
                    'lottery': 0,
                    'original': false,
                    'misprint_chance': getLootData().global_misprint_chance,
                    'status': "won",
                    'xp_rating_min': 0,
                    'condition_min': 0
                }

                return generateItemFromArtworkID(item_generator);
            }
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
        if (adminValidated()) {
    		for (var i=0; i < id_array.length; i++) {
    			if (artworks.findOne(id_array[i]) == undefined)
    				return;
    		}

            metadata.update({'loot_data': {$ne: null}}, {$set: {'loot_data.seasonal_items': id_array}});
        }
	},

	'alertAllUsers' : function(message) {
        if (adminValidated()) {
            Meteor.users.find().forEach(function(db_object) {
                var alert_object = {
                    'user_id' : db_object._id,
                    'message' : message,
                    'link' : '/',
                    'icon' : 'fa-exclamation',
                    'sentiment' : "neutral",
                    'time' : moment()._d.toISOString()
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

            var unique_attribute_data = unique_attributes.find().fetch();
            var unique_attribute_string = "var downloaded_unique_attribute_data = " + encodeURIComponent(JSON.stringify(unique_attribute_data)) + "; ";

			var data_string = "text/json;charset=utf-8," + 
				attribute_string + 
				user_string + 
				artwork_string + 
				item_string + 
				artist_string +
				auction_string + 
				gallery_finish_string + 
				quest_string +
                unique_attribute_string;

			return data_string;
    	}

    	else return undefined;
    },

    //TODO: horribly inefficient method, update
    'updateLockedAttributes': function(artwork_id, attribute_id_array) {
    	if (adminValidated()) {
    		artworks.update(artwork_id, {$set: {'locked_attributes': attribute_id_array}});
	        items.find({'artwork_id': artwork_id}).forEach(function(db_object) {
		        var item_attributes = db_object.attributes;
		        for (var i=0; i<item_attributes.length; i++) {
		            item_attributes[i].locked = attributeIsLocked(artwork_id, item_attributes[i]._id);
		        }

                updateItem(db_object._id, {$set: {'attributes': item_attributes, 'artwork_data.locked_attributes': attribute_id_array}})
		    })
    	}
    },

    'getUsers': function() {
    	if (adminValidated()) {
    		return Meteor.users.find({'_id': {$ne: Meteor.userId()}}, {sort: {'profile.screen_name': -1}}).fetch();
    	}

    	else return undefined;
    },

    'updateArtworkData': function(artwork_id, artwork_object) {
    	if (adminValidated()) {
    		if (isNaN(artwork_object.date) || isNaN(artwork_object.value_scale) || isNaN(artwork_object.height) || isNaN(artwork_object.width))
    			return undefined;

            var original_object = artworks.findOne(artwork_id);
            var new_rarity = original_object.rarity != artwork_object.rarity;
    		var legendary_attributes = getLegendaryAttributes(artwork_object.rarity);

    		if (legendary_attributes && new_rarity) {
    			artwork_object.locked_attributes = legendary_attributes;
            }

	        else if (artwork_object.rarity != "legendary" && artwork_object.rarity != "masterpiece") {
                artworks.update(artwork_id, {$unset: {'locked_attributes': ""}});
            }

    		artworks.update(artwork_id, {$set: artwork_object}, {multi: true}, function(error) {
                if (error)
                    console.log(error.message)

                else {
                    var artwork_data = artworks.findOne(artwork_id, {fields: {'_id': 0, 'active': 0, 'value_scale': 0}});
                    updateItemsBySelector({'artwork_id': artwork_id}, {$set: {'artwork_data': artwork_data}});
                }
            });

    		return true;
    	}

    	else return undefined;
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
    },

    'updateArtistData': function(artist_id, artist_object) {
    	if (adminValidated()) {
    		artists.update(artist_id, {$set: artist_object}, {multi: true}, function(error) {
                artworks.update({'artist_id': artist_id}, {$set: {'artist': artist_object.artist_name}});
                updateItemsBySelector({'artwork_data.artist_id': artist_id}, {$set: {'artwork_data.artist': artist_object.artist_name}});
            });
    		return true;
    	}

    	else return undefined;
    },

    'addNewArtist': function(artist_object) {
    	if (adminValidated()) {
    		return artists.insert(artist_object);
    	}

    	else return undefined;
    },

    'removeArtist': function(artist_id) {
    	if (adminValidated()) {
    		artists.remove(artist_id); 		
    		artworks.update({'artist_id': artist_id}, {$set: {'active': false}});
    	}
    },

    'updateAttributeData': function(attribute_id, attribute_object) {
    	if (adminValidated()) {
    		attributes.update(attribute_id, {$set: attribute_object});
    		updateItemsBySelector({'attributes._id': attribute_id}, {$set: {
    			'attributes.$.title': attribute_object.title, 
    			'attributes.$.description': attribute_object.description, 
    			'attributes.$.icon': attribute_object.icon, 
    			'attributes.$.npc_name': attribute_object.npc_name, 
    			'attributes.$.active': attribute_object.active
    		}});
    		return true;
    	}

    	else return undefined;
    },

    'addNewAttribute': function(attribute_object) {
    	if (adminValidated()) {
    		return attributes.insert(attribute_object);
    	}

    	else return undefined;
    },

    'removeAttribute': function(attribute_id) {
    	if (adminValidated()) {
    		//TODO update db and items
    	}
    },

    'updateUniqueAttributeData': function(unique_attribute_id, unique_attribute_object) {
    	if (adminValidated() && linkedAttributesValid(unique_attribute_id, unique_attribute_object.linked_attributes)) {
    		unique_attributes.update(unique_attribute_id, {$set: unique_attribute_object});
    		return true;
    	}

    	else return undefined;
    },

    'addNewUniqueAttribute': function(unique_attribute_object) {
    	if (adminValidated() && linkedAttributesValid(undefined, unique_attribute_object.linked_attributes)) {
    		return unique_attributes.insert(unique_attribute_object);
    	}

    	else return undefined;
    },

    'getMisprints': function() {
        if (adminValidated()) {
            var misprints = [];
            items.find().forEach(function(item_object) {
                if (itemIsMisprinted(item_object))
                    misprints.push(item_object);
            });
            return misprints;
        }

        else return [];
    },

    'giveQuestItems': function() {
        if (adminValidated()) {
            quests.find({'owner_id': Meteor.userId()}).forEach(function(quest_object) {
                var targets = quest_object.target;
                for (var i=0; i<targets.length; i++) {
                    var artwork_id = targets[i];
                    if (items.findOne({'owner': Meteor.userId(), 'artwork_id': artwork_id}) == undefined) {
                        var item_generator = {
                            'source': "test",
                            'user_id': Meteor.userId(),
                            'artwork_id': artwork_id,
                            'condition': undefined,
                            'xp_rating': undefined,
                            'foil_chance': undefined,
                            'seasonal': undefined,
                            'lottery': undefined,
                            'original': undefined,
                            'vintage': undefined,
                            'misprint_chance': undefined,
                            'status': "unclaimed",
                            'xp_rating_min': 0,
                            'condition_min': 0
                        }

                        generateItemFromArtworkID(item_generator);
                    }
                }
                
            })
        }
    }
})

var linkedAttributesValid = function(unique_attribute_id, attribute_array) {
	if (unique_attributes.findOne({'_id': {$ne: unique_attribute_id}, 'linked_attributes': {$all: attribute_array}}) != undefined)
		return false;

	var attribute_array_copy = [];
	for (var i=0; i<attribute_array.length; i++) {
		if (attributes.findOne(attribute_array[i]) == undefined || attribute_array_copy.indexOf(attribute_array[i]) != -1)
			return false;

		else attribute_array_copy.push(attribute_array[i]);
	}

	return true;
}

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
