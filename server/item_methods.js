itemIsMisprinted = function(item_object) {
    return artworks.findOne({"artist": item_object.artwork_data.artist, "title": item_object.artwork_data.title}) == undefined;
}

getSoughtStatus = function(user_id, artwork_id, only_sought_if_not_in_auction_house) {
    var is_sought = false;

    if (only_sought_if_not_in_auction_house && auctions.findOne({'viewer': "public", 'item_data.artwork_id': artwork_id}) != undefined) {
        return false;
    }

    quests.find({'owner_id': {'$ne': user_id}, 'target': {$in: [artwork_id]}}).forEach(function(quest_object) {
        if (is_sought)
            return;

        var quest_owner = quest_object.owner_id;
        var now = getNowISOString();
        var last_login = Meteor.users.findOne(quest_owner).profile.last_login;
        var last_logout = Meteor.users.findOne(quest_owner).profile.last_logout;
        var still_logged_in = last_login > last_logout;
        var hours_since_last_login = (moment() - moment(last_login)) / 3600000;

        // if player doesn't have item, has been active within the last hour, or is still logged in
        if (items.findOne({'owner': quest_owner, 'artwork_id': artwork_id}) == undefined && (hours_since_last_login < 1 || still_logged_in))
            is_sought = true;
    });

    return is_sought;
}

getAllItemObjectAttributes = function(item_object) {
    var all_attributes = [];
    if (item_object.attributes.locked && item_object.attributes.locked.length > 0)
        all_attributes = all_attributes.concat(item_object.attributes.locked);

    if (item_object.attributes.unlocked && item_object.attributes.unlocked.length > 0)
        all_attributes = all_attributes.concat(item_object.attributes.unlocked);

    if (item_object.attributes.special && item_object.attributes.special.length > 0)
        all_attributes = all_attributes.concat(item_object.attributes.special);

    return all_attributes;
}

var searchArrayForSpecialAttributes = function(special_ids, item_object, new_attribute_object, attribute_type, all_new_attributes, attribute_counts) {
    for (var i=0; i<item_object.attributes[attribute_type].length; i++) {
        if (special_ids.indexOf(item_object.attributes[attribute_type][i]._id) != -1) {
            new_attribute_object.special.push(item_object.attributes[attribute_type][i]);
        }

        else if (attribute_type != "special" && new_attribute_object[attribute_type].length < attribute_counts[attribute_type]) {
            new_attribute_object[attribute_type].push(item_object.attributes[attribute_type][i]);
        }

        else continue;

        all_new_attributes.push(item_object.attributes[attribute_type][i]._id);
    }
}

updateItemAttributesWithNewArtworkData = function(item_interface) {
    var item_object = item_interface.getItemObject();
    var artwork_object = artworks.findOne(item_object.artwork_id, {fields: {'_id': 0, 'active': 0, 'value_scale': 0}});

    if (item_object && artwork_object) {
        var all_new_attributes = [];
        var new_attribute_object = {'locked': [], 'unlocked': [], 'special': []}
        var special_ids = artwork_object.special_attributes;

        var item_was_unlocked = item_object.attributes.locked.length == 0;
        var attribute_counts = undefined;

        switch(artwork_object.rarity) {
            case "common": 
                attribute_counts = {
                    'locked': item_was_unlocked ? 0 : 1, 
                    'unlocked': item_was_unlocked ? 1 : 0, 
                    'special': 0
                }; 
                break;
            case "uncommon":
                 attribute_counts = {
                    'locked': item_was_unlocked ? 0 : 1, 
                    'unlocked': item_was_unlocked ? 2 : 1, 
                    'special': 0
                }; 
                break;
            case "rare":
                 attribute_counts = {
                    'locked': item_was_unlocked ? 0 : 1, 
                    'unlocked': item_was_unlocked ? 2 : 1, 
                    'special': 1
                }; 
                break;
            case "legendary": 
                attribute_counts = {
                    'locked': item_was_unlocked ? 0 : 1, 
                    'unlocked': item_was_unlocked ? 2 : 1, 
                    'special': 2
                }; 
                break;
            case "masterpiece":
                 attribute_counts = {
                    'locked': item_was_unlocked ? 0 : 1, 
                    'unlocked': item_was_unlocked ? 2 : 1, 
                    'special': 3
                }; 
                break;
            default: return false;
        }

        searchArrayForSpecialAttributes(special_ids, item_object, new_attribute_object, "unlocked", all_new_attributes, attribute_counts);
        searchArrayForSpecialAttributes(special_ids, item_object, new_attribute_object, "locked", all_new_attributes, attribute_counts);
        searchArrayForSpecialAttributes(special_ids, item_object, new_attribute_object, "special", all_new_attributes, attribute_counts);

        // add displaced special attributes to locked/unlocked
        for (var i=0; i<item_object.attributes.special.length; i++) {
            if (special_ids.indexOf(item_object.attributes.special[i]._id) == -1) {
                if (new_attribute_object.locked.length < attribute_counts.locked) {
                    new_attribute_object.locked.push(item_object.attributes.special[i]);
                }

                else if (new_attribute_object.unlocked.length < attribute_counts.unlocked) {
                    new_attribute_object.unlocked.push(item_object.attributes.special[i]);
                }           
            }
        }

        while (attribute_counts.locked > new_attribute_object.locked.length) {
            var query = {'_id': {$nin: all_new_attributes}, 'active': true};
            var attribute_object = attributes.findOne(query, {skip: Math.floor(Math.random() * attributes.find(query).count())});
            attribute_object.value = getAttributeValue(0, .5);
            new_attribute_object.locked.push(attribute_object);
            all_new_attributes.push(attribute_object._id);
        }

        while (attribute_counts.unlocked > new_attribute_object.unlocked.length) {
            var query = {'_id': {$nin: all_new_attributes}, 'active': true};
            var attribute_object = attributes.findOne(query, {skip: Math.floor(Math.random() * attributes.find(query).count())});
            attribute_object.value = getAttributeValue(0, 0);
            new_attribute_object.unlocked.push(attribute_object);
            all_new_attributes.push(attribute_object._id);
        }

        for (var i=0; i<special_ids.length; i++) {
            if (all_new_attributes.indexOf(special_ids[i]) != -1)
                continue;

            var attribute_object = attributes.findOne({'_id': special_ids[i], 'active': true});
            attribute_object.value = getAttributeValue(0, .8);
            new_attribute_object.special.push(attribute_object);
            all_new_attributes.push(attribute_object._id);
        }

        item_interface.updateItem({$set: {'artwork_data': artwork_object, 'attributes': new_attribute_object, 'active_unique_attribute': artwork_object.unique_attributes && artwork_object.unique_attributes.length > 0 ? artwork_object.unique_attributes[0] : undefined}}, false);
    }
}

updateArtwork = function(artwork_id, modifier) {
    artworks.update(artwork_id, modifier, function(error) {
        if (error)
            console.log("updateArtwork: " + error.message)

        else {
            var artwork_object = artworks.findOne(artwork_id);
            if (artwork_object == undefined)
                return false;

            items.find({'artwork_id': artwork_object._id}).forEach(function(item_object) {
                updateItemAttributesWithNewArtworkData(new ItemIF(item_object));;
            });
        }
    })
}

updateItem = function(query, modifier, callback) {
    items.update(query, modifier, function(error) {
        if (error)
            console.log("updateItem: " + error.message);

        else {
            var item_object = items.findOne(query);
            if (item_object == undefined)
                return false;

            var player_interface = new PlayerIF(item_object.owner);
            player_interface.updateGalleryDetails();

            var roll_count = item_object.roll_count < 0 ? 0 : item_object.roll_count;

            var reroll_coefficient;
            switch(item_object.artwork_data.rarity) {
                case 'common' : reroll_coefficient = 1.1; break;
                case 'uncommon' : reroll_coefficient = 1.11; break;
                case 'rare' : reroll_coefficient = 1.12; break;
                case 'legendary' : reroll_coefficient = 1.13; break;
                case 'masterpiece' : reroll_coefficient = 1.14; break;
                default: reroll_coefficient - 1.14; break;

            }

            var rarity_values = getLootData().rarity_values;

            var reroll_cost = Math.floor((rarity_values[item_object.artwork_data.rarity].min * .1) * Math.pow(reroll_coefficient, roll_count));

            var newItemObjectValues = getItemObjectValues(item_object);
            if (callback == undefined) {           
                items.update(query, {$set: {'values': newItemObjectValues, 'reroll_cost': reroll_cost}});
            }

            else items.update(query, {$set: {'values': newItemObjectValues, 'reroll_cost': reroll_cost}}, callback);
        }
    })
}

updateItemsBySelector = function(selector, modifier, callback) {
    items.update(selector, modifier, {multi: true}, function(error) {
        if (error)
            console.log("updateItemsBySelector: " + error.message)

        else {
            var player_list = [];
            var rarity_values = getLootData().rarity_values;
            items.find(selector).forEach(function(item_object) {
                if (player_list.indexOf(item_object.owner) == -1)
                    player_list.push(item_object.owner);

                var roll_count = item_object.roll_count < 0 ? 0 : item_object.roll_count;

                var reroll_coefficient;
                switch(item_object.artwork_data.rarity) {
                    case 'common' : reroll_coefficient = 1.1; break;
                    case 'uncommon' : reroll_coefficient = 1.11; break;
                    case 'rare' : reroll_coefficient = 1.12; break;
                    case 'legendary' : reroll_coefficient = 1.13; break;
                    case 'masterpiece' : reroll_coefficient = 1.14; break;
                    default: reroll_coefficient - 1.14; break;

                }

                var reroll_cost = Math.floor((rarity_values[item_object.artwork_data.rarity].min * .1) * Math.pow(reroll_coefficient, roll_count));

                items.update({'_id': item_object._id}, {$set: {'values': getItemObjectValues(items.findOne(item_object._id)), 'reroll_cost': reroll_cost}});
            });

            for (var i=0; i<player_list.length; i++) {
                var player_interface = new PlayerIF(player_list[i]);
                player_interface.updateGalleryDetails();
            }

            if (callback != undefined)
                callback();
        }
    })
}

removeItem = function(item_id, source, callback) {
    var item_object = items.findOne(item_id);

    if (auctions.findOne({'item_id': item_id}) != undefined) {
        return false;
    }

    items.remove(item_id, function(error) {
        if (error)
            console.log("removeItem: " + error.message)

        else {
            // removed_items.insert(
            //     {
            //         'item_object': item_object,
            //         'removed': moment()._d.toISOString(),
            //         'source': source
            //     }
            // );

            if (callback != undefined)
                callback();
        }
    })
}

var getItemArray = function(filter_array, sorter_object, current_page, items_per_page) {
    var item_array = items.find({
        $and: filter_array
    }, {sort: sorter_object, skip: current_page * items_per_page, limit: items_per_page}).fetch();

    var items_found = items.find({$and: filter_array}).count();

    return {
        'item_array': item_array,
        'items_found': items_found
    }
}

Meteor.methods({
	'claimArtwork' : function(item_id) {
        var player_item_interface = new PlayerItemIF(new PlayerIF(Meteor.user()), new ItemIF(item_id));
        player_item_interface.claim();
    },

    'declineItem' : function(item_id) {
        var player_item_interface = new PlayerItemIF(new PlayerIF(Meteor.user()), new ItemIF(item_id));
        player_item_interface.decline();
    },

    'deleteItem' : function(item_id) {
        var player_item_interface = new PlayerItemIF(new PlayerIF(Meteor.user()), new ItemIF(item_id));
        player_item_interface.delete();
    },

    'purchaseItemFromDealer' : function(item_id) {
        var player_item_interface = new PlayerItemIF(new PlayerIF(Meteor.user()), new ItemIF(item_id));
        player_item_interface.purchase();
    },

    'setItemDisplayStatus' : function(item_id, new_status) {
        var player_item_interface = new PlayerItemIF(new PlayerIF(Meteor.user()), new ItemIF(item_id));
        return player_item_interface.setDisplayStatus(new_status);
    },

    'setItemPermanentCollectionStatus' : function(item_id, new_status) {
        var player_item_interface = new PlayerItemIF(new PlayerIF(Meteor.user()), new ItemIF(item_id));
        player_item_interface.setPermanentStatus(new_status);
    },

    'setForSaleTag': function(item_id, new_status) {
        var player_item_interface = new PlayerItemIF(new PlayerIF(Meteor.user()), new ItemIF(item_id));
        player_item_interface.setForSaleTag(new_status);
    },

    'setItemRepairingStatus' : function(item_id, new_status) {
        var player_item_interface = new PlayerItemIF(new PlayerIF(Meteor.user()), new ItemIF(item_id));
        player_item_interface.setRepairingStatus(new_status);
    },

    'sellItem' : function(item_id) {
        var player_item_interface = new PlayerItemIF(new PlayerIF(Meteor.user()), new ItemIF(item_id));
        player_item_interface.sell();
    },

    'upgradeItem': function(item_id) {
        var player_item_interface = new PlayerItemIF(new PlayerIF(Meteor.user()), new ItemIF(item_id));
        player_item_interface.upgrade();
    },

    'auctionArtwork' : function(item_id, starting, buy_now, duration) {
    	var player_item_interface = new PlayerItemIF(new PlayerIF(Meteor.user()), new ItemIF(item_id));
        return player_item_interface.auction(starting, buy_now, duration);
    },

    'tagItem' : function(item_id, tags) {
        var player_item_interface = new PlayerItemIF(new PlayerIF(Meteor.user()), new ItemIF(item_id));
        player_item_interface.tag(tags);
    },

    'donateItem': function(item_id) {
        var player_item_interface = new PlayerItemIF(new PlayerIF(Meteor.user()), new ItemIF(item_id));
        player_item_interface.donate();
    },

    'getRerollCost' : function(item_id) {
        var player_item_interface = new PlayerItemIF(new PlayerIF(Meteor.user()), new ItemIF(item_id));
        return player_item_interface.getRerollCost();
    },

    'rerollAttributeValue' : function(item_id, attribute_id) {
        var player_item_interface = new PlayerItemIF(new PlayerIF(Meteor.user()), new ItemIF(item_id));
        player_item_interface.rerollAttributeValue(attribute_id);
    },

    'rerollAttribute' : function(item_id, attribute_id) {
    	var player_item_interface = new PlayerItemIF(new PlayerIF(Meteor.user()), new ItemIF(item_id));
        player_item_interface.rerollAttribute(attribute_id);
    },

    'archiveItem': function(item_id, category) {
        var player_item_interface = new PlayerItemIF(new PlayerIF(Meteor.user()), new ItemIF(item_id));
        player_item_interface.archive(category);
    },

    'lookupOwner': function(item_id) {
        var item_object = items.findOne(item_id);
        if (item_object)
            return Meteor.users.findOne(item_object.owner).profile.screen_name;

        else return undefined;
    },

    'lookupUser': function(user_id) {
        try {
            var player_interface = new PlayerIF(user_id);
            return player_interface.getUserObject().profile.screen_name;
        }

        catch(error) {
            return undefined;
        }  
    },

    'getItemArray': function(filter_array, sorter_object, current_page, items_per_page) {
        //TODO verify user is only searching items they have access to

        return getItemArray(filter_array, sorter_object, current_page, items_per_page);
    },

    'getDisplayDetails': function(item) {
        try {
            var item_interface = new ItemIF(item);
            var player_item_interface = new PlayerItemIF(new PlayerIF(item_interface.getItemObject().owner), item_interface);
            if (item_interface.getStatus() == "displayed") {
                var earnings_per_hour = player_item_interface.getDisplayValuePerHour(moment()._d.toISOString());
                var time_since_displayed = player_item_interface.getItemIF().getItemObject().time_displayed;
                return {
                    'earnings_per_hour' : earnings_per_hour,
                    'time_since_displayed': getDurationString(moment() - moment(time_since_displayed), false, "dhm"),
                    'display_level': player_item_interface.getDisplayLevel(),
                    'xp_per_hour': player_item_interface.getXPPerHour(moment()._d.toISOString(), "displayed")
                }
            }

            else return {
                'earnings_per_hour' : undefined,
                'xp_per_hour': undefined,
                'time_since_displayed': undefined,
                'display_level': undefined
            }
        }

        catch(error) {
            return {
                'earnings_per_hour' : undefined,
                'xp_per_hour': undefined,
                'time_since_displayed': undefined,
                'display_level': undefined
            }
        }
    },

    'getPermanentDetails': function(item) {
        try {
            var item_interface = new ItemIF(item);
            var player_item_interface = new PlayerItemIF(new PlayerIF(item_interface.getItemObject().owner), item_interface);
            if (item_interface.getStatus() == "permanent") {
                var xp_per_hour = player_item_interface.getXPPerHour(moment()._d.toISOString(), "permanent");
                var time_since_displayed = player_item_interface.getItemIF().getItemObject().permanent_post;
                return {
                    'xp_per_hour' : xp_per_hour,
                    'time_since_displayed': getDurationString(moment() - moment(time_since_displayed), false, "dhm"),
                    'permanent_level': player_item_interface.getPermanentLevel()
                }
            }

            else return {
                'earnings_per_hour' : undefined,
                'time_since_displayed': undefined,
                'permanent_level': undefined
            }
        }

        catch(error) {
            return {
                'earnings_per_hour' : undefined,
                'time_since_displayed': undefined,
                'permanent_level': undefined
            }
        }
    }

})
