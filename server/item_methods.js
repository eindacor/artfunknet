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

getDisplayDetails = function(item_id, duration) {
    // 1 hour
    // 6 hours
    // 12 hours
    // 1 day
    var acceptable_durations = [60, 360, 720, 1440];
    if (acceptable_durations.indexOf(parseInt(duration, 10)) == -1) {
        return {
            'money' : 0,
            'xp' : 0,
            'xp_chunk_percentage': 0,
            'end' : moment()._d.toISOString()
        }
    }

    var item_object = items.findOne(item_id);

    var display_amount = getAverageDropValue(Meteor.users.findOne(item_object.owner).profile.level, 1);

    switch(item_object.artwork_data.rarity) {
        case "common": break;
        case "uncommon": display_amount *= 5; break;
        case "rare": display_amount *= 10; break;
        case "legendary": display_amount *= 15; break;
        case "masterpiece": display_amount *= 20; break;
        default: break;
    }

    if (item_object.foil) {
        display_amount *= 1.2;
    }

    if(item_object.seasonal) {
        display_amount *= 1.5;
    }

    if(item_object.lottery && item_object.lottery != 0) {
        display_amount *= 2;
    }

    if(item_object.original) {
        display_amount *= 2;
    }

    if (item_object.vintage){
        display_amount *= 1.5;
    }

    display_amount = Math.floor(display_amount + (display_amount * item_object.condition * artworks.findOne(item_object.artwork_id).value_scale));

    var money_per_hour = display_amount * .02;
    var xp_chunk_per_hour = .01 + (.01 * item_object.xp_rating);
    var duration_scalar;
    var hours_to_display = Math.floor(Number(duration) / 60);

    switch(hours_to_display) {
        case 1: duration_scalar = 1; break;
        case 6: duration_scalar = 2; break;
        case 12: duration_scalar = 3; break;
        case 24: duration_scalar = 4; break;
    }

    var money = Math.floor(money_per_hour * hours_to_display * duration_scalar);
    var xp_chunk_percentage = xp_chunk_per_hour * hours_to_display * duration_scalar * .5;
    var xp = Math.floor(getXPChunk(Meteor.user().profile.level) * xp_chunk_percentage);

    if (itemIsMisprinted(item_object)) {
        money *= 20;
        xp *= 20;
    }

    var end = moment().add(duration, 'minutes')._d.toISOString();
    var display_details = {
        'money' : money,
        'xp' : xp,
        'xp_chunk_percentage': Number(xp_chunk_percentage.toFixed(3)),
        'end' :end
    }

    return display_details;
}

displayItem = function(item_id, duration) {
    var errors = [];
    var valid_durations = [1, 60, 360, 720, 1440];

    if (isNaN(duration) || valid_durations.indexOf(Number(duration)) == -1)
        errors.push("invalid duration");

    var item_object = canDisplayItem(item_id);
    if (item_object && errors.length == 0) {
        var end = moment().add(duration, 'minutes');
        var display_details = getDisplayDetails(item_id, duration);
        updateItem(item_id, {$set: {'status' : 'displayed', 'display_details' : display_details}}, function() {
            addItemObjectToChecklist(item_object.owner, 'displayed', item_object);
            addItemObjectToChecklist(item_object.owner, 'seen', item_object);
        });
        return [];
    }

    else errors.push("invalid operation");

    return errors;
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
        var now = moment()._d.toISOString();
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

claimItemObject = function(user_id, item_object) {
    var success = true;
    var user_object = Meteor.users.findOne(user_id);

    if (user_object == undefined)
        return false;

    updateItem(item_object._id, {$set: {'owner': user_id, 'status' : 'claimed', 'date_received': moment()._d.toISOString()}}, function(error) {
        var rarity = item_object.artwork_data.rarity;
        addItemObjectToChecklist(user_id, 'owned', item_object);
        if (user_object.profile.vintage_select) {
            Meteor.users.update(user_id, {$set: {'profile.vintage_select': false}});
            items.remove({'owner': user_id, 'status': 'won'});
        }
    });

    return success;
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

            if (callback == undefined)
                items.update({'_id': item_id}, {$set: {'values': getItemObjectValues(items.findOne(item_id))}});

            else items.update({'_id': item_id}, {$set: {'values': getItemObjectValues(items.findOne(item_id))}}, callback);
        }
    })
}

updateItemsBySelector = function(selector, modifier, callback) {
    items.update(selector, modifier, {multi: true}, function(error) {
        if (error)
            console.log("updateItemsBySelector: " + error.message)

        else {
            items.find(selector).forEach(function(item_object) {
                updateGalleryDetails(item_object.owner);
                items.update({'_id': item_object._id}, {$set: {'values': getItemObjectValues(items.findOne(item_object._id))}})
            });

            if (callback != undefined)
                callback();
        }
    })
}

Meteor.methods({
	'claimArtwork' : function(item_id) {
		var item_object = canClaimItem(item_id);
        if (item_object) 
            claimItemObject(Meteor.userId(), item_object);

        else throw "invalid operation";
    },

    'declineItem' : function(item_id) {
        var item_object = canDeclineItem(item_id);
        if (item_object) {
            items.remove(item_object._id);

            if (Math.random() < .1 && procUniqueAttribute(item_object.owner, "DECLINE_DEALER_DESIGNER_SPAWN", undefined)) {
                var npc_quality = getNPCQuality(Meteor.user().profile.level);
                createNPC(galleries.findOne({'owner_id': Meteor.userId()}), attributes.findOne({'npc_name': "Designer"})._id, 600000, npc_quality);
            }
        }

        else throw "invalid operation";
    },

    'purchaseItemFromDealer' : function(item_id) {
        var item_object = canPurchaseItemFromDealer(item_id);
        if (item_object) {
            chargeAccount(Meteor.userId(), getItemObjectValueByType(item_object, "dealer", Meteor.userId()));
            var claimed = claimItemObject(Meteor.userId(), item_object);
            if (!claimed) {
                console.log("unsuccessful purchase");
                return;
            }

            if (procUniqueAttribute(Meteor.userId(), "XP_FROM_DEALER_PURCHASES", undefined)) {
                addXPChunkPercentage("XP_FROM_DEALER_PURCHASES", Meteor.userId(), items.findOne(item_id).xp_rating * .25);
            }

            if (procUniqueAttribute(Meteor.userId(), "DEALER_PURCHASE_ROLL_COUNT_SET", undefined)) {
                updateItem(item_id, {$set: {'roll_count': -20}});
            }
        }
    },

    'displayArtwork' : function(item_id, duration) {
        return displayItem(item_id, duration);
    },

    'acceptCollectorOffer' : function(offer_id) {
        var offer_object = npc_data.findOne(offer_id);
        if (offer_object && Meteor.userId() == offer_object.owner) {
            if (offer_object.data.xp_offer) {
                addXP(Meteor.userId(), offer_object.data.offer_amount);
                logXPChunkPercentage("ART_COLLECTOR_XP_REWARD", Number(offer_object.data.xp_chunk.toFixed(3)));
            }
            
            else addFunds("collector", offer_object.owner, offer_object.data.offer_amount);

            if (!offer_object.data.does_not_collect) {
                items.remove(offer_object.data.item_id, function(error) {
                    if (error)
                        console.log(error.message);

                    else  npc_data.remove(offer_id);
                });
            }
        }
    },

    'declineCollectorOffer' : function(offer_id) {
        var offer_object = npc_data.findOne(offer_id);
        if (offer_object && Meteor.userId() == offer_object.owner) {
            npc_data.remove(offer_id);
        }
    },

    'setItemPermanentCollectionStatus' : function(item_id, set_to_permanent) {
        try {
            var item_object = set_to_permanent ? canSetPermanent(item_id) : canUnsetPermanent(item_id);
            if (item_object) {
                if (set_to_permanent) {
                    updateItem(item_id, {$set: {'status' : 'permanent', 'permanent_post' : moment()._d.toISOString()}});
                    addItemObjectToChecklist(Meteor.userId(), 'displayed', item_object);
                    addItemObjectToChecklist(Meteor.userId(), 'seen', item_object);
                }

                else {
                    updateItem(item_id, {$set: {'status' : 'claimed'}, $unset: {'permanent_post' : ""}});
                }
            }

            else throw "invalid operation";
        }

        catch(error) {
            console.log(error);
        }
    },

    'sellArtwork' : function(item_id) {
        var item_object = canSellItem(item_id);
        if (item_object) {
            var value = getItemObjectValueByType(item_object, 'sell', Meteor.userId());
            if (isNaN(value)) {
                console.log("isNaN returned for item value");
                throw "invalid amount";
            }

            addFunds("sell item", Meteor.userId(), value);
            updateItem(item_id, {$set: {'owner': "Artfunkel, Inc.", 'status': "auctioned", 'tags': []}} ,function() {
                if (Meteor.user().profile.user_type != "admin") {
                    if (Math.random() < 0.5) {
                        createAuction(item_id, getItemObjectValueByType(item_object, "actual", Meteor.userId()), -1, 120, "public");
                    }

                    else {
                        items.remove({'_id': item_id});
                    }
                }

                else items.remove(item_id);
            });
        }

        else throw "invalid operation";
    },

    'auctionArtwork' : function(item_id, starting, buy_now, duration) {
    	var item_object = canAuctionItem(item_id);

        var errors = [];

        if (item_object == undefined)
            errors.push("invalid action");

        if (isNaN(starting))
            errors.push("invalid starting value");

        if (isNaN(buy_now))
            errors.push("invalid buy now value");

        if (duration == "default")
            errors.push("invalid duration");

        if (item_object) {        
            var minimum = getItemObjectValueByType(item_object, 'auction_min', Meteor.userId());
            if (Number(starting) < minimum)
                errors.push("starting value must be greater than $" + getCommaSeparatedValue(minimum));

            if (buy_now != -1 && Number(buy_now) < minimum )
                errors.push("buy now value must be greater than $" + getCommaSeparatedValue(minimum));
        }

        if (errors.length == 0) {
            updateItem(item_id, {$set: {'status' : 'auctioned'}}, function() {
                createAuction(item_id, starting, buy_now, duration, "public");
                if (Meteor.user().profile.market_expert.expiration > moment()._d.toISOString() && procUniqueAttribute(Meteor.userId(), "XP_FOR_AUCTIONS", undefined)) {
                    addXPChunkPercentage("XP_FOR_AUCTIONS", Meteor.userId(), .5)
                }
            });
        }

        return errors;
    },

    'tagItem' : function(item_id, tags) {
        var lower_case = [];
        for (var i=0; i<tags.length; i++) {
            lower_case.push(tags[i].toLowerCase())
        }

        updateItem(item_id, {$set: {'tags': lower_case}});
    },

    'getRerollCost' : function(item_id) {
        return getRerollCost(item_id);
    },

    'rerollXPRating' : function(item_id) {
        if (canRerollItem(item_id)) {
            var item_object = items.findOne(item_id);
            if (item_object != undefined) {
                var roll_count = item_object.roll_count;
                var roll_value_min = 0;

                if (procUniqueAttribute(Meteor.userId(), "MARKET_EXPERT_ROLL_BONUS", "Auctioneer")) {
                    var roll_value_min = .3;
                }

                if ((item_object.roll_count > 10 || item_object.roll_count < 0) && procUniqueAttribute(Meteor.userId(), "ROLL_COUNT_REROLL_BONUS", undefined)) {
                    roll_value_min += .3;
                }
        
                chargeAccount(Meteor.userId(), getRerollCost(item_id));    
                updateItem(item_id, {$set : {'xp_rating' : getXPRating(roll_value_min), 'roll_count': roll_count + 1}});      
            }
        }
    },

    'rerollAttributeValue' : function(item_id, attribute_id) {
    	var item_object = canRerollItem(item_id);
        if (item_object) {
            var roll_count = item_object.roll_count;
            var attribute_array = item_object.attributes;

            for (var i=0; i < attribute_array.length; i++) {
                if (attribute_array[i]._id == attribute_id) {
                    var roll_value_min = 0;
                    if (procUniqueAttribute(Meteor.userId(), "MARKET_EXPERT_ROLL_BONUS", "Auctioneer")) {
                        var roll_value_min = .3;
                    }

                    if ((item_object.roll_count > 10 || item_object.roll_count < 0) && procUniqueAttribute(Meteor.userId(), "ROLL_COUNT_REROLL_BONUS", undefined)) {
                        roll_value_min += .3;
                    }

                    attribute_array[i].value = attributeIsLocked(item_object.artwork_id, attribute_id) ? getLockedAttributeValue() : getAttributeValue(0, roll_value_min);
                    break;
                }
            }

            chargeAccount(Meteor.userId(), getRerollCost(item_id));
            updateItem(item_id, {$set: {'attributes' : attribute_array, 'roll_count' : roll_count + 1}});         
        }

        else throw "invalid operation";
    },

    'rerollAttribute' : function(item_id, attribute_id) {
    	var item_object = canRerollItem(item_id);
        if (item_object && !attributeIsLocked(item_object.artwork_id, attribute_id)) {
            var attribute_type = attributes.findOne(attribute_id).type;
            var roll_count = item_object.roll_count;
            var attribute_array = item_object.attributes;

            var attribute_ids = []
            for (var i=0; i < attribute_array.length; i++)
                attribute_ids.push(attribute_array[i]._id);

            var target_attribute_index;
            for (var i=0; i < attribute_array.length; i++) {
                if (attribute_array[i]._id == attribute_id) {
                    target_attribute_index = i;
                    break;
                }
            }

            var remaining = attributes.find({'type' : attribute_type, '_id' : {$nin: attribute_ids}, 'active': true}).count();
            var random_index = Math.floor(Math.random() * remaining);
            var random_attribute = attributes.findOne({'type' : attribute_type, '_id' : {$nin: attribute_ids}, 'active': true}, {skip: random_index});

            attribute_array[target_attribute_index] = random_attribute;

            var roll_value_min = 0;

            if (procUniqueAttribute(Meteor.userId(), "MARKET_EXPERT_ROLL_BONUS", "Auctioneer")) {
                roll_value_min += .4;
            }

            if ((item_object.roll_count > 10 || item_object.roll_count < 0) && procUniqueAttribute(Meteor.userId(), "ROLL_COUNT_REROLL_BONUS", undefined)) {
                roll_value_min += .5;
            }

            attribute_array[target_attribute_index].value = getAttributeValue(0, roll_value_min);
            attribute_array[target_attribute_index].locked = attributeIsLocked(item_object.artwork_id, random_attribute._id);

            chargeAccount(Meteor.userId(), getRerollCost(item_id));
            updateItem(item_id, {$set: {'attributes' : attribute_array, 'roll_count' : roll_count + 1}});
            
        }

        else return false;
    },

    'lookupOwner': function(item_id) {
        var item_object = items.findOne(item_id);
        if (item_object)
            return Meteor.users.findOne(item_object.owner).profile.screen_name;

        else return undefined;
    }

})
