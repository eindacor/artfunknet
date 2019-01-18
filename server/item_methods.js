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
    var artwork_object = artworks.findOne(item_object.artwork_id, {fields: {'_id': 0, 'active': 0, 'value_scale': 0, 'market_data': 0}});

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

        item_interface.updateItem({
            $set: {
                'artwork_data': artwork_object, 
                'attributes': new_attribute_object, 
                'active_unique_attribute': artwork_object.unique_attributes && artwork_object.unique_attributes.length > 0 ? artwork_object.unique_attributes[0] : undefined
            }
        }, false);
    }
}

updateItem = function(query, modifier, callback) {
    items.update(query, modifier, function(error) {
        if (error) {
            console.log("updateItem: " + error);
        }
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
            console.log("updateItemsBySelector: " + error)

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
            console.log("removeItem: " + error)

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

var setItemActions = function(item_object, player_item_permissions) {
    var action_array = [];

    if (player_item_permissions.canClaim().result) {
        action_array.push({
            'action_name': "claimItem",
            'tooltip': "add to inventory"
        });
    }  

    if (player_item_permissions.canPurchase().result) {
        action_array.push({
            'action_name': "purchaseItem",
            'tooltip': "purchase"
        });
    }

    if (player_item_permissions.canSell().result) {
        action_array.push({
            'action_name': "sellItem",
            'tooltip': "sell"
        });
    }

    if (player_item_permissions.canAuction().result) {
        action_array.push({
            'action_name': "auctionItem",
            'tooltip': "auction"
        });
    }

    if (player_item_permissions.canDonate().result) {
        action_array.push({
            'action_name': "donateItem",
            'tooltip': "donate"
        });
    }
  
    action_array.push({
        'action_name': "modItem",
        'tooltip': "modify"
    });

    if (player_item_permissions.canArchive().result) {
        action_array.push({
            'action_name': "archiveItem",
            'tooltip': "add to archive"
        });
    }

    if (player_item_permissions.canIdentify().result) {
        action_array.push({
            'action_name': "identifyItem",
            'tooltip': "verify authenticity"
        });
    }

    if (player_item_permissions.canRedeemForgery().result) {
        action_array.push({
            'action_name': "redeemItem",
            'tooltip': "report forgery"
        });
    }

    if (player_item_permissions.canForge().result) {
        action_array.push({
            'action_name': "forgeItem",
            'tooltip': "forge"
        });
    }

    if (player_item_permissions.canDelete().result) {
        action_array.push({
            'action_name': "deleteItem",
            'tooltip': "delete"
        });
    }

    if (player_item_permissions.canDecline().result) {
        action_array.push({
            'action_name': "declineItem",
            'tooltip': "decline"
        });
    }

    item_object.item_actions = action_array;

    var modifier_array = [];

    if (player_item_permissions.canDisplay().result) {
        modifier_array.push({
            'action_name': "displayItem",
            'tooltip': "add to gallery"
        });
    }

    if (player_item_permissions.canUndisplay().result) {
        modifier_array.push({
            'action_name': "undisplayItem",
            'tooltip': "remove from gallery"
        });
    }
    
    if (player_item_permissions.canSetPermanent().result) {
        modifier_array.push({
            'action_name': "setPermanent",
            'tooltip': "add to favorites"
        });
    }

    if (player_item_permissions.canUnsetPermanent().result) {
        modifier_array.push({
            'action_name': "unsetPermanent",
            'tooltip': "remove from favorites"
        });
    }

    if (player_item_permissions.canTagForSale().result) {
        modifier_array.push({
            'action_name': "setForSale",
            'tooltip': "set for sale"
        });
    }

    if (player_item_permissions.canUntagForSale().result) {
        modifier_array.push({
            'action_name': "unsetForSale",
            'tooltip': "unset for sale"
        });
    }

    if (player_item_permissions.canSetRepairing().result) {
        modifier_array.push({
            'action_name': "setRepairing",
            'tooltip': "set to repair"
        });
    }

    if (player_item_permissions.canUnsetRepairing().result) {
        modifier_array.push({
            'action_name': "unsetRepairing",
            'tooltip': "unset to repair"
        });
    }

    if (player_item_permissions.canTag().result) {
        modifier_array.push({
            'action_name': "tagItem",
            'tooltip': "modify tags"
        });
    }

    item_object.item_modifiers = modifier_array;
}

prepareItemForClient = function(item_object, viewer_interface) {
    if (item_object == undefined) {
        return;
    }

    var item_interface = new ItemIF(item_object);
    var player_item_interface = new PlayerItemIF(viewer_interface, item_interface);
    var artwork_interface = new ArtworkIF(item_object.artwork_id);
    var user_object = viewer_interface.getUserObject();

    if (user_object.profile.market_expert.expiration > getNowISOString()) {
        var market_data = artworks.findOne({'_id': item_interface.getArtworkId()}).market_data;
        if (market_data != undefined) {
            var item_signature = item_interface.getArchiveSignature();
            var signature_market_data = market_data[item_signature];
            if (signature_market_data != undefined) {
                item_object.market_value = signature_market_data.average;
            }
        }
    }

    var viewer_is_owner = viewer_interface.getId() == item_object.owner;
    var item_is_lottery_reward = item_object.owner == BOT_USER_NAME && item_object.lottery > 0;
    if (viewer_is_owner || item_is_lottery_reward) {
        if (!item_object.authenticity.identified) {
            delete item_object.authenticity.forgery;
        }
    }
    else {
        delete item_object["authenticity"];
    }

    item_object.recommended_status = player_item_interface.getRecommendedStatus();

    item_object.quest_target = player_item_interface.isQuestTarget();
    item_object.reroll_cost = player_item_interface.getRerollCost();
    var unclaimed_or_not_owner = ["for_sale", "unclaimed", "won"].indexOf(item_object.status) != -1 || item_object.owner != viewer_interface.getId();
    item_object.already_owned = unclaimed_or_not_owner && items.findOne({
        '_id': {$ne: item_object._id}, 
        'artwork_id': item_object.artwork_id, 
        'owner': viewer_interface.getId(),
        'status': {$in: ["claimed", "displayed", "auctioned"]}
    }) != undefined;

    item_object.archive_indicators = [];
    for (var i=0; i<ARCHIVE_CATEGORIES.length; i++) {
        if (viewer_interface.hasArchivedArtworkOfCategory(artwork_interface, ARCHIVE_CATEGORIES[i])) {
            item_object.archive_indicators.push(ARCHIVE_CATEGORIES[i]);
        }
    }

    if (item_object._id != undefined && item_object.owner == viewer_interface.getId()) {
        var player_item_permissions = new PlayerItemPermissions(viewer_interface, item_interface);
        item_object.can_quick_discard = player_item_permissions.canQuickDiscard().result;

        setItemActions(item_object, player_item_permissions);
    }
}

var getItemArray = function(match_query, forgery_filter_value, sorter_object, page, items_per_page) {
    delete match_query["authenticity"];
    var forgery_string = "authenticity.forgery";
    var identified_string = "authenticity.identified";
    if (forgery_filter_value == "only") {
        match_query[forgery_string] = true;
        match_query[identified_string] = true;
    }
    else if (forgery_filter_value == "none") {
        match_query[forgery_string] = false;
        match_query[identified_string] = true;
    }

    var item_array = items.find(match_query, {sort: sorter_object}).fetch();

    var current_page;
    var total_pages;

    var total_returned = item_array.length;

    if (total_returned <= items_per_page) {
        current_page = 1;
        total_pages = 1;
    }

    else {
        total_pages = Math.floor(total_returned / items_per_page) + 1;

        if (total_returned < ((page - 1) * items_per_page) + 1) {
            current_page = total_pages;
        }

        else current_page = page;
    }

    var skip = (current_page - 1) * items_per_page;
    var count = items_per_page;

    var array_chunk = item_array.slice(skip, skip + count);
    var player_interface = new PlayerIF(Meteor.user());
    for (var i=0; i<array_chunk.length; i++) {
        prepareItemForClient(array_chunk[i], player_interface);
    }

    return {
        'item_array': array_chunk,
        'current_page': current_page,
        'total_pages': total_pages
    }
}

Meteor.methods({
	'claimItem' : function(item_id) {
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

    'purchaseItem' : function(item_id) {
        var player_item_interface = new PlayerItemIF(new PlayerIF(Meteor.user()), new ItemIF(item_id));
        player_item_interface.purchase();
    },

    'displayItem': function(item_id) {
        var player_item_interface = new PlayerItemIF(new PlayerIF(Meteor.user()), new ItemIF(item_id));
        return player_item_interface.setDisplayStatus(true);
    },

    'undisplayItem': function(item_id) {
        var player_item_interface = new PlayerItemIF(new PlayerIF(Meteor.user()), new ItemIF(item_id));
        return player_item_interface.setDisplayStatus(false);
    },

    'setPermanent': function(item_id) {
        var player_item_interface = new PlayerItemIF(new PlayerIF(Meteor.user()), new ItemIF(item_id));
        player_item_interface.setPermanentStatus(true);
    },

    'unsetPermanent': function(item_id) {
        var player_item_interface = new PlayerItemIF(new PlayerIF(Meteor.user()), new ItemIF(item_id));
        player_item_interface.setPermanentStatus(false);
    },

    'setForSale': function(item_id) {
        var player_item_interface = new PlayerItemIF(new PlayerIF(Meteor.user()), new ItemIF(item_id));
        player_item_interface.setForSaleTag(true);
    },

    'unsetForSale': function(item_id) {
        var player_item_interface = new PlayerItemIF(new PlayerIF(Meteor.user()), new ItemIF(item_id));
        player_item_interface.setForSaleTag(false);
    },

    'setRepairing' : function(item_id) {
        var player_item_interface = new PlayerItemIF(new PlayerIF(Meteor.user()), new ItemIF(item_id));
        player_item_interface.setRepairingStatus(true);
    },

    'unsetRepairing' : function(item_id) {
        var player_item_interface = new PlayerItemIF(new PlayerIF(Meteor.user()), new ItemIF(item_id));
        player_item_interface.setRepairingStatus(false);
    },

    'sellItem' : function(item_id) {
        var player_item_interface = new PlayerItemIF(new PlayerIF(Meteor.user()), new ItemIF(item_id));
        player_item_interface.sell();
    },

    'upgradeItem': function(item_id) {
        var player_item_interface = new PlayerItemIF(new PlayerIF(Meteor.user()), new ItemIF(item_id));
        return player_item_interface.upgrade();
    },

    'auctionArtwork' : function(item_id, starting, buy_now, duration) {
        var approved_auction_durations = [ONE_HOUR, ONE_HOUR * 6, ONE_HOUR * 12, ONE_HOUR * 24];
        if (approved_auction_durations.indexOf(Number(duration)) == -1) {
            throw {
                'message': "invalid duration"
            }
        }
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
        var now = moment();
        var player_item_interface = new PlayerItemIF(new PlayerIF(Meteor.user()), new ItemIF(item_id));
        return player_item_interface.rerollAttributeValue(attribute_id);
    },

    'rerollAttribute' : function(item_id, attribute_id) {
    	var player_item_interface = new PlayerItemIF(new PlayerIF(Meteor.user()), new ItemIF(item_id));
        return player_item_interface.rerollAttribute(attribute_id);
    },

    'archiveItem': function(item_id) {
        try {
            var player_item_interface = new PlayerItemIF(new PlayerIF(Meteor.user()), new ItemIF(item_id));
            player_item_interface.archive();
        }
        catch (error) {
            console.log(error);
        }
    },

    'identifyItem': function(item_id) {
        var player_item_interface = new PlayerItemIF(new PlayerIF(Meteor.user()), new ItemIF(item_id));
        player_item_interface.identify();
    },

    'redeemItem': function(item_id) {
        var player_item_interface = new PlayerItemIF(new PlayerIF(Meteor.user()), new ItemIF(item_id));
        player_item_interface.redeem();
    },

    'forgeItem': function(item_id, forgery_contract_id) {
        var player_item_interface = new PlayerItemIF(new PlayerIF(Meteor.user()), new ItemIF(item_id));
        player_item_interface.forge(forgery_contract_id);
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

    'getItemArray': function(filter_array, forgery_filter_value, sorter_object, page, items_per_page) {
        //TODO verify user is only searching items they have access to
        return getItemArray(filter_array, forgery_filter_value, sorter_object, page, items_per_page);
    },

    'getDisplayDetailsFromInterface': function(user_object, item_object) {
        var player_item_interface = new PlayerItemIF(new PlayerIF(user_object), new ItemIF(item_object));
        return {
            'xp_per_hour': player_item_interface.getXPPerHour(),
            'money_per_hour': player_item_interface.getDisplayValuePerHour()
        }
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
                    'xp_per_hour': player_item_interface.getXPPerHour(moment()._d.toISOString())
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

    'getRerollCost': function(item_id) {
        var player_item_interface = new PlayerItemIF(new PlayerIF(Meteor.user()), new ItemIF(item_id));
        return player_item_interface.getRerollCost();
    },

    'getUpgradeCost': function(item_id) {
        var player_item_interface = new PlayerItemIF(new PlayerIF(Meteor.user()), new ItemIF(item_id));
        return player_item_interface.getUpgradeCost();
    },

    'getItemData': function(item) {
        try {
            var item_object = new ItemIF(item).getItemObject();
            prepareItemForClient(item_object, new PlayerIF(Meteor.user()));
            return item_object; 
        }
        catch (error) {
            console.log(error);
            console.log(error.stack);
        }
    },

    'getItemPermissions': function(item_id) {
        var item_interface = new ItemIF(item_id);
        var player_interface = new PlayerIF(Meteor.user());
        var player_item_permissions = new PlayerItemPermissions(player_interface, item_interface);
    },

    'getArtworkArchivedStatus': function(artwork_object, category) {
        var signature_query;
        switch(category) {
            case "standard": signature_query = {'archive_signature': "standard"}; break;
            case "foil": signature_query = {'archive_signature': {'$regex': "f", '$options': 'i'}}; break;
            case "unlocked": signature_query = {'archive_signature': {'$regex': "u", '$options': 'i'}}; break;
            case "seasonal": signature_query = {'$and': [{'archive_signature': {'$ne': "standard"}}, {'archive_signature': {'$regex': "s", '$options': 'i'}}]}; break;
            case "lottery": signature_query = {'archive_signature': {'$regex': "l", '$options': 'i'}}; break;
            case "vintage": signature_query = {'archive_signature': {'$regex': "v", '$options': 'i'}}; break;
        }

        signature_query.owner = Meteor.userId();
        signature_query.status = "archived";
        signature_query.displaced = false;
        signature_query.artwork_id = artwork_object._id;
        return items.findOne(signature_query) != undefined;
    },

    'getArchiveItems': function(artwork_id, archive_category) {
        var query_object = CATEGORY_QUERIES[archive_category];
        query_object.owner = Meteor.userId();
        query_object.artwork_id = artwork_id;
        query_object.status = "archived";
        query_object.displaced = false;
        var item_array = getFromCollection("item_methods.js:getArchiveItems", items, query_object).fetch();

        if (item_array.length == 0) {
            var item_object = {
                'level': 1
            };

            switch (archive_category) {
                case 'foil': item_object.foil = true; break;
                case 'unlocked': item_object.unlocked = true; break;
                case 'seasonal': item_object.seasonal = true; break;
                case 'vintage': item_object.vintage = true; break;
                case 'lottery': item_object.lottery = 1; break;
                case 'original': item_object.original = true; break;
                default: break;
            }

            return getItemStubFromArtwork(artwork_id, item_object);
        }

        var player_interface = new PlayerIF(Meteor.user());
        for (var i=0; i<item_array.length; i++) {
            prepareItemForClient(item_array[i], player_interface);
        }

        return item_array;
    },

    'getSeasonalStubs': function() {
        var seasonal_ids = getAllSeasonalIds();

        var item_stubs = [];

        for (var i=0; i<seasonal_ids.length; i++) {
            var artwork_id = seasonal_ids[i];
            var item_data = {
                'artwork_id': artwork_id,
                'seasonal': true            
            }
            item_stubs.push(getItemStubFromArtwork(artwork_id, item_data));
        }

       return item_stubs;
    },

    'getForgeryHeat': function(item) {
        var player_item_interface = new PlayerItemIF(new PlayerIF(Meteor.user()), new ItemIF(item));
        return player_item_interface.getForgeryHeat(undefined);
    },

    'getItemData': function(item_id) {
        if (Meteor.user() == undefined) {
            return;
        }

        var player_interface = new PlayerIF(Meteor.user());
        var item_object = items.findOne(item_id);
        prepareItemForClient(item_object, player_interface);
        return item_object;
    }
})

getItemStubFromArtwork = function(artwork_id, item_data) {
    var artwork_interface = new ArtworkIF(artwork_id);
    var artwork_object = artwork_interface.getArtworkObject();
    var player_artwork_interface = new PlayerArtworkIF(new PlayerIF(Meteor.user()), artwork_interface);

    // TODO make stub creator
    var item_object = {
        'artwork_id': artwork_object._id,
        'artwork_data': artwork_object,
        'foil': item_data.foil,
        'unlocked': item_data.unlocked,
        'seasonal': item_data.seasonal,
        'vintage': item_data.vintage,
        'lottery': item_data.lottery,
        'level': item_data.level,
        'recommended_status': player_artwork_interface.getRecommendedStatus(item_data)
    }

    if (artwork_interface.getRarity() !== COMMON && artwork_interface.getRarity() !== UNCOMMON) {
        var special_attribute_ids = artwork_interface.getArtworkObject().special_attributes;
        if (special_attribute_ids !== undefined && special_attribute_ids.length > 0) {
            item_object.attributes = {
                'special': attributes.find({'_id': {$in: special_attribute_ids}}).fetch()
            }
        }
    }

    return item_object;
}

getForgeryHeatFromQuality = function(item_interface, player_interface, heat_category, forgery_quality, plausible_deniability) {
    var heat_min;
    var heat_max;

    switch(heat_category) {
        case FORGERY_HEAT_CATEGORY.QUEST:
            heat_min = .3;
            heat_max = .95;
            break;
        case FORGERY_HEAT_CATEGORY.SELL:
            heat_min = 0;
            heat_max = .98;
            break;
        case FORGERY_HEAT_CATEGORY.DONATE:
            heat_min = .1;
            heat_max = .95;
            break;
        case FORGERY_HEAT_CATEGORY.COLLECTOR:
            heat_min = .3;
            heat_max = .99;
            break;
        case FORGERY_HEAT_CATEGORY.DISPLAY:
            heat_min = .02;
            heat_max = .08;
            break;
        default: 
            heat_min = 0;
            heat_max = 1;
            break;
    }

    var heat_type_coefficient = 0;

    var rarity_index = ARTWORK_RARITIES.indexOf(item_interface.getItemObject().artwork_data.rarity);
    var rarity_heat_coefficient = ((rarity_index + 1) / ARTWORK_RARITIES.length) * FORGERY_TYPE_HEAT_COEFFICIENTS.RARITY;
    heat_type_coefficient += rarity_heat_coefficient;

    if (item_interface.isFoil()) {
        heat_type_coefficient += FORGERY_TYPE_HEAT_COEFFICIENTS.FOIL;
    }

    if (item_interface.isUnlocked()) {
        heat_type_coefficient += FORGERY_TYPE_HEAT_COEFFICIENTS.UNLOCKED;
    }

    if (item_interface.isSeasonal()) {
        heat_type_coefficient += FORGERY_TYPE_HEAT_COEFFICIENTS.SEASONAL;
    }

    if (item_interface.isVintage()) {
        heat_type_coefficient += FORGERY_TYPE_HEAT_COEFFICIENTS.VINTAGE;
    }

    if (item_interface.isLottery()) {
        var lottery_heat_base_coefficient = .75;
        var lottery_heat_coefficient = (1 - lottery_heat_base_coefficient) * (item_interface.getItemObject().lottery / 10);
        heat_type_coefficient += (FORGERY_TYPE_HEAT_COEFFICIENTS.LOTTERY * (lottery_heat_base_coefficient + lottery_heat_coefficient));
    }

    if (item_interface.getLevel() > 1) {
        heat_type_coefficient += (FORGERY_TYPE_HEAT_COEFFICIENTS.LEVEL * (item_interface.getLevel() / 10));
    }

    var quality_adjustment_coefficient = 1 - (.4 * forgery_quality);
    heat_type_coefficient *= quality_adjustment_coefficient;

    var heat_coefficient = heat_min + ((heat_max - heat_min) * Math.min(heat_type_coefficient, 1));

    // reduce heat if not owner is unaware
    if (plausible_deniability) {
        heat_coefficient *= .3;
    }

    if (heat_category == FORGERY_HEAT_CATEGORY.COLLECTOR && player_interface.procUniqueAttribute("COLLECTOR_FORGERY_HEAT_REDUCTION", undefined)) {
        heat_coefficient *= .8;
    }

    return Number(heat_coefficient.toFixed(3));
}