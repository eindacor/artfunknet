concludeDisplay = function(item_id) {
    var item_object = items.findOne(item_id);
    var money_earned = item_object.display_details.money;
    var user_id = item_object.owner;
    var xp_earned = item_object.display_details.xp;

    var message = "Your exhibition of " + item_object.artwork_data.title + " by " + item_object.artwork_data.artist + " has concluded. You have earned $" + getCommaSeparatedValue(money_earned);
    alertPlayers(user_id, message, 'fa-usd', 'good');

    addFunds("display", user_id, money_earned);
    addXP(user_id, xp_earned);
    logXPChunkPercentage("display", item_object.display_details.xp_chunk_percentage);

    var null_display_details = {
        'money' : 0,
        'xp' : 0,
        'xp_chunk_percentage': 0,
        'end' : ""
    };

    var new_condition = item_object.condition < .6 ? item_object.condition : item_object.condition - .01;
    updateItem(item_id, {$set: {'status' : 'claimed', 'display_details' : null_display_details, 'condition' : new_condition}});
}

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

updateItemAttributesWithNewArtworkData = function(item_id) {
    var item_object = items.findOne(item_id);
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

        updateItem(item_id, {$set: {'artwork_data': artwork_object, 'attributes': new_attribute_object, 'active_unique_attribute': artwork_object.unique_attributes && artwork_object.unique_attributes.length > 0 ? artwork_object.unique_attributes[0] : undefined}});
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
                updateItemAttributesWithNewArtworkData(item_object._id);
            });
        }
    })
}

updateItem = function(item_id, modifier, callback) {
    items.update(item_id, modifier, function(error) {
        if (error)
            console.log("updateItem: " + error.message);

        else {
            var item_object = items.findOne(item_id);
            if (item_object == undefined)
                return false;

            updateGalleryDetails(item_object.owner);

            var newItemObjectValues =  getItemObjectValues(item_object);
            if (callback == undefined) {           
                items.update(item_id, {$set: {'values': newItemObjectValues}});
            }

            else items.update(item_id, {$set: {'values': newItemObjectValues}}, callback);
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

updateItemsBySelector = function(selector, modifier, callback) {
    items.update(selector, modifier, {multi: true}, function(error) {
        if (error)
            console.log("updateItemsBySelector: " + error.message)

        else {
            items.find(selector).forEach(function(item_object) {
                if (item_object.status == "displayed" || item_object.status == "permanent")
                    updateGalleryDetails(item_object.owner);

                items.update({'_id': item_object._id}, {$set: {'values': getItemObjectValues(items.findOne(item_object._id))}})
            });

            if (callback != undefined)
                callback();
        }
    })
}

// rerollAttributeValue = function(user_id, item_id, attribute_id) {
//     var item_reader = new itemReader(item_id);
//     var permissions = new PlayerItemPermissions(Meteor.users.findOne(user_id), item_reader);

//     if (permissions.canRerollItemAttribute(attribute_id)) {
//         var item_object = item_reader.getItemObject();
//         var roll_count = item_object.roll_count;
//         var attributes_object = item_object.attributes;

//         var attribute_type = undefined;

//         if (items.findOne({'_id': item_id, 'attributes.unlocked._id': attribute_id}) != undefined) {
//             attribute_type = "unlocked";
//         }

//         else if (items.findOne({'_id': item_id, 'attributes.locked._id': attribute_id}) != undefined) {
//             attribute_type = "locked";
//         }

//         else if (items.findOne({'_id': item_id, 'attributes.special._id': attribute_id}) != undefined) {
//             attribute_type = "special";
//         }

//         else return false;

//         var roll_value_min = getRerollMin(user_id, attribute_type, item_object);
//         var value = getAttributeValue(0, roll_value_min);

//         chargeAccount(user_id, getRerollCost(item_id));

//         var setter_object = {};
//         var setter_string = "attributes." + attribute_type + ".$.value";
//         setter_object[setter_string] = value;

//         var query_object = {'_id': item_id};
//         var query_string = "attributes." + attribute_type + "._id";
//         query_object[query_string] = attribute_id;
//         updateItem(query_object, {$set: setter_object, $inc: {'roll_count' : 1}});         
//     }

//     else return false;
// }

// rerollAttribute = function(user_id, item_id, attribute_id) {
//     var item_object = canRerollItemAttribute(item_id, attribute_id);
//     try {
//         var item_reader = new itemReader(item_id);
//         var permissions = new PlayerItemPermissions(Meteor.users.findOne(user_id), item_reader);
//         if (item_object) {
//             var roll_count = item_object.roll_count;

//             var attribute_ids = [];
//             var attribute_objects = getAllItemObjectAttributes(item_object)

//             for (var i=0; i<attribute_objects.length; i++) {
//                 attribute_ids.push(attribute_objects[i]._id);
//             }

//             var selector = {'_id' : {'$nin': attribute_ids}, 'active': true};
//             var remaining = attributes.find(selector).count();
//             var random_index = Math.floor(Math.random() * remaining);
//             var random_attribute = attributes.findOne(selector, {skip: random_index});

//             var roll_value_min = getRerollMin(user_id, "unlocked", item_object);
//             random_attribute.value = getAttributeValue(0, roll_value_min);
     
//             updateItem({'_id': item_id, 'attributes.unlocked._id': attribute_id}, {$set: {'attributes.unlocked.$' : random_attribute,}, $inc: {'roll_count' : 1}});
//             chargeAccount(user_id, getRerollCost(item_id));
//         }

//         else return false;
//     } catch(error) {
//         console.log(error);
//         console.log(item_object);
//     }
// }

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
        var player_item_interface = new PlayerItemIF(Meteor.userId(), item_id);
        player_item_interface.claim();
    },

    'declineItem' : function(item_id) {
        var player_item_interface = new PlayerItemIF(Meteor.userId(), item_id);
        player_item_interface.decline();
    },

    'purchaseItemFromDealer' : function(item_id) {
        var player_item_interface = new PlayerItemIF(Meteor.userId(), item_id);
        player_item_interface.purchase();
    },

    'displayArtwork' : function(item_id, duration) {
        var player_item_interface = new PlayerItemIF(Meteor.userId(), item_id);
        return player_item_interface.display(duration);
    },

    'setItemPermanentCollectionStatus' : function(item_id, new_status) {
        var player_item_interface = new PlayerItemIF(Meteor.userId(), item_id);
        player_item_interface.setPermanentStatus(new_status);
    },

    'sellItem' : function(item_id) {
        var player_item_interface = new PlayerItemIF(Meteor.userId(), item_id);
        player_item_interface.sell();
    },

    'auctionArtwork' : function(item_id, starting, buy_now, duration) {
    	var player_item_interface = new PlayerItemIF(Meteor.userId(), item_id);
        return player_item_interface.auction(starting, buy_now, duration);
    },

    'getDisplayDetails': function(item_id, duration) {
        var player_item_interface = new PlayerItemIF(Meteor.userId(), item_id);
        return player_item_interface.getDisplayDetails(duration);
    },

    'tagItem' : function(item_id, tags) {
        var player_item_interface = new PlayerItemIF(Meteor.userId(), item_id);
        player_item_interface.tag(tags);
    },

    'getRerollCost' : function(item_id) {
        var player_item_interface = new PlayerItemIF(Meteor.userId(), item_id);
        return player_item_interface.getRerollCost();
    },

    'rerollXPRating' : function(item_id) {
        var player_item_interface = new PlayerItemIF(Meteor.userId(), item_id);
        player_item_interface.rerollXPRating();
    },

    'rerollAttributeValue' : function(item_id, attribute_id) {
        var player_item_interface = new PlayerItemIF(Meteor.userId(), item_id);
        player_item_interface.rerollAttributeValue(attribute_id);
    },

    'rerollAttribute' : function(item_id, attribute_id) {
    	var player_item_interface = new PlayerItemIF(Meteor.userId(), item_id);
        player_item_interface.rerollAttribute(attribute_id);
    },

    'lookupOwner': function(item_id) {
        var item_object = items.findOne(item_id);
        if (item_object)
            return Meteor.users.findOne(item_object.owner).profile.screen_name;

        else return undefined;
    },

    'getItemArray': function(filter_array, sorter_object, current_page, items_per_page) {
        //TODO verify user is only searching items they have access to

        return getItemArray(filter_array, sorter_object, current_page, items_per_page);
    }

})
