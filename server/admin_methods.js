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

			if (gallery_object) {
				createNPC(gallery_object, attribute_id, 0, getNPCQuality(Meteor.user().profile.level));
            }
		}
	},

	'setBankBalance': function(value) {
		if (adminValidated()) {
			Meteor.users.update(Meteor.userId(), {$set: {'profile.bank_balance': value}});
		}
	},

    'setFoilChance': function(value) {
        if (adminValidated()) {
            metadata.update({'loot_data': {$ne: null}}, {$set: {'loot_data.global_foil_chance': value}}, function() {
                setLootData();
            });
        }
    },

     'setUnlockedChance': function(value) {
        if (adminValidated()) {
            metadata.update({'loot_data': {$ne: null}}, {$set: {'loot_data.global_unlocked_chance': value}}, function() {
                setLootData();
            });
        }
    },

     'setMisprintChance': function(value) {
        if (adminValidated()) {
            metadata.update({'loot_data': {$ne: null}}, {$set: {'loot_data.global_misprint_chance': value}}, function() {
                setLootData();
            });
        }
    },

     'setPatreonChance': function(value) {
        if (adminValidated()) {
            metadata.update({'loot_data': {$ne: null}}, {$set: {'loot_data.global_patreon_chance': value}}, function() {
                setLootData();
            });
        }
    },

	'getAdminData': function() {
		var user_object = Meteor.user();

        var loot_data = getLootData();

		if (user_object) {
			return {
				'player_level': user_object.profile.level,
				'player_xp': user_object.profile.xp,
				'daily_drop_count': admin_settings.daily_drop_count,
				'crate_drop_count': admin_settings.crate_drop_count,
				'bank_balance': user_object.profile.bank_balance,
				'seasonal_ids': loot_data.seasonal_items.legendary.concat(loot_data.seasonal_items.masterpiece),
                'foil_chance': loot_data.global_foil_chance,
                'patreon_chance': loot_data.global_patreon_chance,
                'unlocked_chance': loot_data.global_unlocked_chance,
                'misprint_chance': loot_data.global_misprint_chance
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
            var seasonal_item_object = {
                'legendary': [],
                'masterpiece': []
            }
    		for (var i=0; i < id_array.length; i++) {
                var artwork_object = artworks.findOne(id_array[i]);
    			if (artwork_object == undefined) {
    				return;
                }
                else {
                    seasonal_item_object[artwork_object.rarity].push(artwork_object._id);
                }
    		}

            metadata.update({'loot_data': {$ne: null}}, {$set: {'loot_data.seasonal_items': seasonal_item_object}}, function() {
                setLootData();
            });
        }
	},

	'alertAllUsers' : function(message) {
        if (adminValidated()) {
            alertPlayers({}, '<p>' + message + '</p>', 'fa-exclamation', 'neutral');
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
            artwork_object.market_data = {};
    		return artworks.insert(artwork_object, function() {
                setArtworkCache();
            });
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
                    var item_generator = {
                        'source': "admin quest",
                        'artwork_interface': new ArtworkIF(artwork_id),
                        'status': "unclaimed"
                    }

                    ITEM_GENERATOR.generateSingle(item_generator, new PlayerIF(Meteor.user()));
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

    'newLotteryItems': function() {
        if (adminValidated()) {
            generateNewLotteryItems();
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
        var attribute_distribution_map = {};
        var attribute_pair_distribution_map = {};
        var mp_map = {};

        attributes.find({'active': true}).forEach(function(attribute_object) {
            attribute_distribution_map[attribute_object.npc_name] = artworks.find({'rarity': "masterpiece", 'special_attributes': {$in: [attribute_object._id]}}).fetch();

            attributes.find({'active': true}).forEach(function(paired_attribute_object) {
                if (paired_attribute_object._id == attribute_object._id) {
                    return;
                }

                var pair_items = artworks.find({'rarity': "masterpiece", $and: [{'special_attributes': attribute_object._id}, {'special_attributes': paired_attribute_object._id}]}).fetch();

                var pair_string_1 = paired_attribute_object.npc_name + "/" + attribute_object.npc_name;
                var pair_string_2 = attribute_object.npc_name + "/" + paired_attribute_object.npc_name;

                if (attribute_pair_distribution_map[pair_string_1] == undefined && attribute_pair_distribution_map[pair_string_2] == undefined) {
                    attribute_pair_distribution_map[pair_string_1] = pair_items;
                }
            });
        })

        artworks.find({'rarity': "masterpiece", 'active': true}).forEach(function(artwork_object){
            var special_attribute_array = [];
            special_attribute_array.push(attributes.findOne(artwork_object.special_attributes[0]).npc_name);
            special_attribute_array.push(attributes.findOne(artwork_object.special_attributes[1]).npc_name);
            special_attribute_array.push(attributes.findOne(artwork_object.special_attributes[2]).npc_name);
            var title_string = artwork_object.title + " by " + artwork_object.artist;
            mp_map[title_string] = special_attribute_array;
        });

        var results_object = {
            'attribute_distribution_map': attribute_distribution_map,
            'attribute_pair_distribution_map': attribute_pair_distribution_map,
            'mp_map': mp_map
        };

        return results_object;
    },

    'forgeryTest': function(item_id) {
        if (adminValidated()) {
            var player_item_interface = new PlayerItemIF(new PlayerIF(Meteor.user()), new ItemIF(item_id));
            for (var i=0; i<100; i++) {
                if (player_item_interface.procForgeryDetection()) {
                    console.log("forgery detected after " + (i + 1) + " attempt(s)");
                    return;
                }
            }

            console.log ("forgery not detected");
        }
    },

    'makeBots': function(quantity) {
        if (adminValidated()) {
            makeBots(quantity);
        }
    },

    'removeBots': function() {
        if (adminValidated()) {
            removeBots();
        }
    },

    'approveBetaKey': function(key_id) {
        if (adminValidated()) {
            try {
                var beta_key_object = beta_keys.findOne(key_id); 
                var html = '<h2>Your Artfunkel beta key is <span style="color:#FF33CC">' + beta_key_object.key + '</span></h2> <p>Visit <a href="https://artfunkelgame.com">artfunkelgame.com</a> and follow the registration link to create your account!</p>';
                emailUser(beta_key_object.email_address, "Your Artfunkel beta key", html);
                beta_keys.update({'_id': beta_key_object._id}, {$set: {'approved': true}});
            }
            catch (error) {
                return {
                    'error': error.message
                }
            }
        }
    },

    'getIdleBetaKeys': function() {
        if (adminValidated()) {
            return getIdleBetaKeys();
        }
    },

    'reapproveIdleBetaKeys': function() {
        if (adminValidated()) {
           var idle_keys = getIdleBetaKeys();
            for (var i=0; i<idle_keys.length; i++) {
                var beta_key_object = idle_keys[i];
                var html = '<h2>Your Artfunkel beta key is <span style="color:#FF33CC">' + beta_key_object.key + '</span></h2> <p>Visit <a href="https://artfunkelgame.com">artfunkelgame.com</a> and follow the registration link to create your account!</p>';
                emailUser(beta_key_object.email_address, "Your Artfunkel beta key", html);
            } 
        }
    },

    'denyBetaKey': function(key_id) {
        if (adminValidated()) {
            var beta_key_object = beta_keys.findOne(key_id);
            beta_keys.remove({'_id': beta_key_object._id});
        }
    },

    'getBetaRequests': function() {
        if (adminValidated()) {
            return beta_keys.find({'approved': false}, {sort: {'created': 1}}).fetch();
        }

        else return [];
    },

    'getPatreonTest': function() {
        if (adminValidated()) {
            return getPatreonTest();
        }
    },

    'clearPatreonTest': function() {
        if (adminValidated()) {
            clearPatreonTest();
        }
    },

    'htmlAlert': function(username, html, icon, sentiment) {
        if (adminValidated()) {
            var player_interface = new PlayerIF(Meteor.users.findOne({'profile.screen_name': username}));
            player_interface.htmlAlert(html, icon, sentiment);
        }
    },

    'getArtworkCache': function() {
        if (adminValidated()) {
            return getArtworkCache();
        }
    },

    'setArtworkCache': function() {
        if (adminValidated()) {
            return setArtworkCache();
        }
    },

    'clearReputation': function() {
        if (adminValidated()) {
            Meteor.users.update({'_id': Meteor.userId()}, {$set: {
                'profile.visitor_ignore_coefficient': 0,
                'profile.visitor_ignore_proc_count': 0
            }})
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

var getIdleBetaKeys = function() {
    var idle_keys = [];
    beta_keys.find({'approved': true}).forEach(function(key_object) {
        if (Meteor.users.findOne({'username': key_object.email_address}) == undefined) {
            idle_keys.push(key_object);
        }
    })

    return idle_keys;
}
