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
                'count': admin_settings.daily_drop_count,
                'status': "for_sale"
            }

            ITEM_GENERATOR.generateMultiple(multi_item_generator, new PlayerIF(Meteor.user()));
		}
	},

    'levelUp': function() {
        if (adminValidated() && Meteor.user().profile.level < 50) {
            var xp = getXPGoal(Meteor.user().profile.level);
            var player_interface = new PLayerIF(Meteor.user());
            player_interface.addXP(xp, false);
        }
    },

	'generateNPC': function(attribute_id) {
		if (adminValidated()) {
			gallery_object = getOneFromCollection("admin_methods.js", galleries, {'owner_id': Meteor.userId()});

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

	'generateItemFromArtworkID' : function(item_generator, artwork_id, user_id) {
		if (adminValidated()) {
            item_generator.artwork_interface = new ArtworkIF(artwork_id);
            return ITEM_GENERATOR.generateSingle(item_generator, new PlayerIF(user_id));
		}

		else return undefined;
	},

	'generateRandomItemFromArtworkID' : function(user_id, artwork_id) {
        try {
    		if (adminValidated()) {
    			if (user_id == "" || getOneFromCollection("admin_methods.js", Meteor.users, user_id).profile.user_type == "admin") {
                    var item_generator = {
                        'source': "test",
                        'artwork_interface': new ArtworkIF(artwork_id),
                        'status': "unclaimed"
                    }

                    return ITEM_GENERATOR.generateSingle(item_generator, new PlayerIF(Meteor.user()));
                }

    			else if (Meteor.users.findOne(user_id) == undefined)
    				return false;

    			else {
                    var item_generator = {
                        'source': "test",
                        'artwork_interface': new ArtworkIF(artwork_id),
                        'status': "won"
                    }

                    return ITEM_GENERATOR.generateSingle(item_generator, new PlayerIF(user_id));
                }
    		}

    		else return undefined;
        }

        catch(error) {
            console.log(error);
        }
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

            metadata.update({'loot_data': {$ne: null}}, {$set: {'loot_data.seasonal_items': id_array}}, function() {
                LOOT_DATA = metadata.findOne({'loot_data': {$ne: null}}).loot_data;
            });
        }
	},

	'alertAllUsers' : function(message) {
        if (adminValidated()) {
            alertPlayers({}, message, 'fa-exclamation', 'neutral');
	    }
    },

    'toggleAttributeStatus' : function(attribute_id) {
    	if (adminValidated()) {
    		attributes.update(attribute_id, {$set: {'active': !(attributes.findOne(attribute_id).active)}});
    	}
    },

    'toggleArtworkActivity' : function(artwork_id) {
    	if (adminValidated()) {
            updateArtwork(artwork_id, {$set: {'active': !(artworks.findOne(artwork_id).active)}});
    	}
    },

    'toggleArtworkNSFW' : function(artwork_id) {
    	if (adminValidated()) {
            updateArtwork(artwork_id, {$set: {'nsfw': !(artworks.findOne(artwork_id).nsfw)}});
    	}
    },

    //TODO: horribly inefficient method, update
    'updateSpecialAttributes': function(artwork_id, attribute_id_array) {
    	if (adminValidated()) {
            var unique_list = [];
            for (var i=0; i<attribute_id_array.length; i++) {
                for (var n=0; n<attribute_id_array.length; n++) {
                    if (i != n) {
                        var unique_attribute = unique_attributes.findOne({'linked_attributes': {$all: [attribute_id_array[i], attribute_id_array[n]]}});

                        if (unique_list.indexOf(unique_attribute._id) == -1)
                            unique_list.push(unique_attribute._id);
                    }
                }
            }

            updateArtwork(artwork_id, {$set: {'special_attributes': attribute_id_array, 'unique_attributes': unique_list}});
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

            updateArtwork(artwork_id, {$set: artwork_object});
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

            items.find({'artwork_id': artwork_id}).forEach(function(item_object) {
                removeItem(item_object._id, "admin", undefined);
            })
    	}
    },

    'updateArtistData': function(artist_id, artist_object) {
    	if (adminValidated()) {
    		artists.update(artist_id, {$set: artist_object}, {multi: true}, function(error) {
                artworks.find({'artist_id': artist_id}).forEach(function(artwork_object) {
                    updateArtwork(artwork_object._id, {$set: {'artist': artist_object.artist_name}});
                })
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

    'updateAttributeData': function(attribute_id, attribute_object) {
    	if (adminValidated()) {
    		attributes.update(attribute_id, {$set: attribute_object});
    		updateItemsBySelector({'attributes.unlocked._id': attribute_id}, {$set: {
                'attributes.unlocked.$.title': attribute_object.title, 
                'attributes.unlocked.$.description': attribute_object.description, 
                'attributes.unlocked.$.icon': attribute_object.icon, 
                'attributes.unlocked.$.npc_name': attribute_object.npc_name, 
                'attributes.unlocked.$.active': attribute_object.active
            }});

            updateItemsBySelector({'attributes.locked._id': attribute_id}, {$set: {
                'attributes.locked.$.title': attribute_object.title, 
                'attributes.locked.$.description': attribute_object.description, 
                'attributes.locked.$.icon': attribute_object.icon, 
                'attributes.locked.$.npc_name': attribute_object.npc_name, 
                'attributes.locked.$.active': attribute_object.active
            }});

            updateItemsBySelector({'attributes.special._id': attribute_id}, {$set: {
                'attributes.special.$.title': attribute_object.title, 
                'attributes.special.$.description': attribute_object.description, 
                'attributes.special.$.icon': attribute_object.icon, 
                'attributes.special.$.npc_name': attribute_object.npc_name, 
                'attributes.special.$.active': attribute_object.active
            }});

            npcs.update({'attribute_id': attribute_id}, {$set: {'icon': attribute_object.icon}}, {multi: true});
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
                    if (getOneFromCollection("admin_methods.js", items, {'owner': Meteor.userId(), 'artwork_id': artwork_id}) == undefined) {
                        var item_generator = {
                            'source': "test",
                            'artwork_interface': new ArtworkIF(artwork_id),
                            'status': "unclaimed"
                        }

                        ITEM_GENERATOR.generateSingle(item_generator, new PlayerIF(Meteor.user()));
                    }
                }
                
            })
        }
    },

    'resetResources': function() {
        if (adminValidated()) {
            var knowledge_object = {
                'historical_data': 0,
                'contextual_understanding': 0,
                'technical_comprehension': 0,
                'artistic_vision': 0
            };
            Meteor.users.update({'_id': Meteor.userId()}, {$set: {'profile.knowledge': knowledge_object}});
        }
    },

    'giveResources': function() {
        if (adminValidated()) {
            var knowledge_object = {
                'historical_data': 1000,
                'contextual_understanding': 1000,
                'technical_comprehension': 1000,
                'artistic_vision': 1000
            };
            Meteor.users.update({'_id': Meteor.userId()}, {$set: {'profile.knowledge': knowledge_object}});
        }
    },

    'drawLottery': function() {
        if (adminValidated()) {
            var force_draw = true;
            drawLottery(force_draw);
        }
    },

    'refreshDynamicCrates': function() {
        if (adminValidated()) {
            refreshCrates();
        }
    },

    'updateItemValues': function() {
        try {
            if (adminValidated()) {
                Meteor.users.find().forEach(function(user_object){
                    var all_items = items.find().fetch();
                    for (var i=0; i<all_items.length; i++) {
                        var item_object = all_items[i];
                        var reroll_cost = getItemObjectRollCost(item_object);
                        var object_values = getItemObjectValues(item_object);
                        items.update({'_id': item_object._id}, {$set: {'values': object_values, 'reroll_cost': reroll_cost}});
                    }

                    if (all_items.length > 0) {
                        var player_interface = new PlayerIF(user_object);
                        player_interface.updateGalleryDetails();
                    }
                })
            }
        }

        catch (error) {
            console.log(error);
        }
    },

    'updateGalleries': function() {
        getFromCollection("updateGalleries admin method", Meteor.users, {}).forEach(function(user_object) {
            var player_interface = new PlayerIF(user_object);
            player_interface.updateGalleryDetails();
        })
    },

    'getDBCalls': function() {
        console.log(db_calls);
    },

    'clearDBCalls': function() {
        db_calls = 0;
    },

    'masterpieceAttributeReview': function() {
        if (adminValidated()) {
            var permutation_array = [];
            var mp_permutations = [];
            var existing_mps = [];
            var clashing_existing_mps = [];
            var mp_clashes = [];
            var desired_clashes = [];
            var desired_permutations = [];

            desired_permutations.push([attributes.findOne({'npc_name': "Art Donor"}).npc_name, attributes.findOne({'npc_name': "Art Dealer"}).npc_name, attributes.findOne({'npc_name': "Auctioneer"}).npc_name]);
            desired_permutations.push([attributes.findOne({'npc_name': "Art Enthusiast"}).npc_name, attributes.findOne({'npc_name': "Art Historian"}).npc_name, attributes.findOne({'npc_name': "Marketing Manager"}).npc_name]);
            desired_permutations.push([attributes.findOne({'npc_name': "Benefactor"}).npc_name, attributes.findOne({'npc_name': "Art Collector"}).npc_name, attributes.findOne({'npc_name': "Preservationist"}).npc_name]);
            desired_permutations.push([attributes.findOne({'npc_name': "Benefactor"}).npc_name, attributes.findOne({'npc_name': "Art Expert"}).npc_name, attributes.findOne({'npc_name': "Preservationist"}).npc_name]);
            desired_permutations.push([attributes.findOne({'npc_name': "Gallery Manager"}).npc_name, attributes.findOne({'npc_name': "Auctioneer"}).npc_name, attributes.findOne({'npc_name': "Marketing Manager"}).npc_name]);

            var attributeArraysAreSimilar = function(first, second) {
                var match_count = 0;
                for (var i=0; i<first.length; i++) {
                    if (second.indexOf(first[i]) != -1) {
                        match_count++;
                    }
                }

                return match_count > 1;
            }

            var getMPFromPermutation = function(attribute_array) {
                var attribute_ids = [];
                for (var i=0; i<attribute_array.length; i++) {
                    attribute_ids.push(attributes.findOne({'npc_name': attribute_array[i]})._id)
                }
                return artworks.findOne({'special_attributes': {$all: attribute_ids}});
            }

            var getPermutationFromMP = function(artwork_object) {
                var attribute_array = artwork_object.special_attributes;
                var permutation = [];
                for (var i=0; i<attribute_array.length; i++) {
                    permutation.push(attributes.findOne(attribute_array[i]).npc_name);
                }
                return permutation;
            }

            var permutationAlreadyFound = function(array_to_compare, attribute_array) {
                for (var i=0; i<array_to_compare.length; i++) {
                    var found_permutation = array_to_compare[i];

                    if (attributeArraysAreSimilar(attribute_array, found_permutation)) {
                        return found_permutation;
                    }
                }

                return undefined;
            }

            var getUniquePermutations = function() {
                items.find({'artwork_data.rarity': "masterpiece", 'owner': {$ne: Meteor.users.findOne({'profile.screen_name': "admin"})._id}}).forEach(function(item_object) {
                    var mp_permutation = [];
                    for (var i=0; i<item_object.artwork_data.special_attributes.length; i++) {
                        mp_permutation.push(attributes.findOne(item_object.artwork_data.special_attributes[i]).npc_name);
                    }

                    if (existing_mps.indexOf(item_object.artwork_id) == -1) {
                        existing_mps.push(item_object.artwork_id);
                    }

                    var already_found = permutationAlreadyFound(mp_permutations, mp_permutation);
                    if (already_found) {
                        var mp_found = getMPFromPermutation(already_found);

                        if (clashing_existing_mps.indexOf(item_object.artwork_id) == -1) {
                            clashing_existing_mps.push(item_object.artwork_id);
                        }

                        if (clashing_existing_mps.indexOf(mp_found._id) == -1) {
                            clashing_existing_mps.push(mp_found._id);
                        }

                        if (mp_found._id != item_object.artwork_id) {
                            mp_clashes.push(mp_found.title + " by " + mp_found.artists + " & " + item_object.artwork_data.title + " by " + item_object.artwork_data.artist);
                        }
                    }

                    mp_permutations.push(mp_permutation);
                });

                for (var i=0; i<mp_permutations.length; i++) {
                    var already_found = permutationAlreadyFound(desired_permutations, mp_permutations[i]);
                    var mp = getMPFromPermutation(mp_permutations[i]);
                    if (already_found) {
                        desired_clashes.push({
                            'desired_permutation': already_found,
                            'clashing_mp': mp.title + " by " + mp.artist,
                            'mp_permutation': getPermutationFromMP(mp)
                        })
                    }
                }

                var attribute_array = attributes.find({'active': true}).fetch();
                for (var i=0; i<attribute_array.length; i++) {
                    var first = attribute_array[i].npc_name;
                    var new_permutation = [first];
                    for (var n=0; n<attribute_array.length; n++) {
                        if (n == i) {
                            continue;
                        }

                        var second = attribute_array[n].npc_name
                        new_permutation.push(second);

                        for (var c=0; c<attribute_array.length; c++) {
                            if (c == i || c == n) {
                                continue;
                            }

                            var third = attribute_array[c].npc_name;
                            new_permutation.push(third)

                            if (new_permutation.length == 3 && !permutationAlreadyFound(permutation_array, new_permutation) && !permutationAlreadyFound(mp_permutations, new_permutation)) {
                                permutation_array.push(new_permutation);
                            }

                            new_permutation = [first, second];
                        }

                        new_permutation = [first];
                    }
                }
            }

            getUniquePermutations();

            var results_object = {
                'existing_permutations': mp_permutations,
                'available_permutations': permutation_array,
                'mp_clashes': mp_clashes,
                'existing_mps': artworks.find({'_id': {$in: existing_mps}, 'rarity': "masterpiece"}).fetch(),
                'unfound_mps': artworks.find({'_id': {$nin: existing_mps}, 'rarity': "masterpiece"}).fetch(),
                'desired_clashes': desired_clashes
            };

            console.log(results_object);

            return results_object;
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

getLegendaryAttributes = function(rarity) {
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

getRandomSpecialAttributes = function(rarity) {
    if (["rare", "legendary", "masterpiece"].indexOf(rarity) != -1) {
        var random_attributes = [];
        var attribute_count = undefined;

        switch(rarity) {
            case "rare": attribute_count = 1; break;
            case "legendary": attribute_count = 2; break;
            case "masterpiece": attribute_count = 3; break;
            default: attribute_count = 0; break;
        }

        while (random_attributes.length < attribute_count) {
            var selector = {'_id': {$nin: random_attributes}, 'active': true};
            var count = attributes.find(selector).count();
            if (count == 0)
                break;
            
            random_attributes.push(attributes.findOne(selector, {skip: Math.floor(Math.random() * count)})._id);
        }

        return random_attributes;
    }

    else return [];
}
