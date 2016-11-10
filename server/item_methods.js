concludeDisplay = function(item_id) {
    var item_object = items.findOne(item_id);
    var money_earned = item_object.display_details.money;
    var user_id = item_object.owner;
    var xp_earned = item_object.display_details.xp;

    var display_message = "Your exhibition of " + item_object.artwork_data.title + " by " + item_object.artwork_data.artist + " has concluded. You have earned $" + getCommaSeparatedValue(money_earned);
    var alert_win_object = {
        'user_id' : user_id,
        'message' : display_message,
        'link' : '/',
        'icon' : 'fa-usd',
        'sentiment' : "good",
        'time' : moment()._d.toISOString()
    };
    alerts.insert(alert_win_object);

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
    items.update(item_id, {$set: {'status' : 'claimed', 'display_details' : null_display_details, 'condition' : new_condition}}, function(error) {
        if (error)
            console.log(error.message);

        else {
            updateGalleryDetails(items.findOne(item_id).owner);
            calcMVP(items.findOne(item_id).owner);
        }
    });
}

itemIsMisprinted = function(item_object) {
    return artworks.findOne({"artist": item_object.artwork_data.artist, "title": item_object.artwork_data.title}) == undefined;
}

getDisplayDetails = function(item_id, duration) {
    // 1 hour
    // 6 hours
    // 12 hours
    // 1 day

    var item_object = items.findOne(item_id);

    var display_amount = getItemObjectValue(item_object, 'display', item_object.owner);
    var xp_chunk = getXPChunk(Meteor.user().profile.level);
    var xp_rating = items.findOne(item_id).xp_rating;
    var xp_chunk_percentage_value = .5 + (.5 * xp_rating);
    var xp_value = xp_chunk_percentage_value * xp_chunk;

    //add bonuses from attributes

    var money, xp, xp_chunk_percentage;
    switch(Number(duration)) {
        case 1:
            money = display_amount * .00018 * duration;
            xp = xp_value * .0008 * duration;
            xp_chunk_percentage = xp_chunk_percentage_value * .0008 * duration; 
            break;
        case 60:
            money = display_amount * .00012 * duration;
            xp = xp_value * .0001 * duration;
            xp_chunk_percentage = xp_chunk_percentage_value * .0001 * duration;
            break;
        case 360:
            money = display_amount * .00014 * duration;
            xp = xp_value * .0002 * duration;
            xp_chunk_percentage = xp_chunk_percentage_value * .0002 * duration;
            break;
        case 720:
            money = display_amount * .00016 * duration;
            xp = xp_value * .0003 * duration;
            xp_chunk_percentage = xp_chunk_percentage_value * .0003 * duration;
            break;
        case 1440:
            money = display_amount * .00018 * duration;
            xp = xp_value * .0004 * duration;
            xp_chunk_percentage = xp_chunk_percentage_value * .0004 * duration;
            break;
        default:
            money = 0;
            xp = 0;
            xp_chunk_percentage = 0;
            break;
    }

    if (itemIsMisprinted(item_object)) {
        money *= 20;
        xp *= 20;
    }

    var end = moment().add(duration, 'minutes')._d.toISOString();
    var display_details = {
        'money' : Math.floor(Number(money.toFixed(2))),
        'xp' : Math.floor(xp),
        'xp_chunk_percentage': Number(xp_chunk_percentage.toFixed(3)),
        'end' :end
        // 'end' : moment().add(1, 'minutes')._d.toISOString()
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
        items.update({'_id': item_id}, {$set: {'status' : 'displayed', 'display_details' : display_details}}, function(error) {
            if (error)
                console.log(error.message);

            else updateGalleryDetails(item_object.owner);
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

Meteor.methods({
	'claimArtwork' : function(item_id) {
		var item_object = canClaimItem(item_id);
        if (item_object) {
            items.update({'_id': item_id}, {$set: {'status' : 'claimed'}}, function(error) {
                if (error)
                    console.log(error.message);

                else calcMVP(Meteor.userId());
            });
        }

        else throw "invalid operation";
    },

    'declineItem' : function(item_id) {
        var item_object = canDeclineItem(item_id);
        if (item_object) {
            items.remove(item_object._id);

            if (procUniqueAttribute(item_object.owner, "DECLINE_DEALER_DESIGNER_SPAWN", undefined)) {
                if (Math.random() < .1) {
                    var npc_quality = getNPCQuality(Meteor.user().profile.level);
                    createNPC(galleries.findOne({'owner_id': Meteor.userId()}), attributes.findOne({'npc_name': "Designer"})._id, 600000, npc_quality);
                }
            }
        }

        else throw "invalid operation";
    },

    'purchaseItemFromDealer' : function(item_id) {
        var item_object = canPurchaseItemFromDealer(item_id);
        if (item_object) {
            chargeAccount(Meteor.userId(), getItemValue(item_id, "dealer", Meteor.userId()));
            items.update(item_id, {$set: {'status': "claimed"}}, function(error) {
                if (error)
                    console.log(error.message);

                else {
                	calcMVP(Meteor.userId());
                	if (procUniqueAttribute(Meteor.userId(), "XP_FROM_DEALER_PURCHASES", undefined)) {
                		addXPChunkPercentage("XP_FROM_DEALER_PURCHASES", Meteor.userId(), items.findOne(item_id).xp_rating * .25);
                	}

                    if (procUniqueAttribute(Meteor.userId(), "DEALER_PURCHASE_ROLL_COUNT_SET", undefined)) {
                        items.update(item_id, {$set: {'roll_count': -20}});
                    }
                }
            });
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

            items.remove(offer_object.data.item_id, function(error) {
                if (error)
                    console.log(error.message);

                else {
                    if (Meteor.userId() == offer_object.host &&
                        procUniqueAttribute(Meteor.userId(), "COLLECTOR_QUEST_ITEM", undefined) && Math.random() < .25) {
                        var quest_item_ids = [];
                        quests.find({'owner_id': Meteor.userId()}).forEach(function(db_object) {
                            var targets = db_object.target;
                            for (var i=0; i<targets.length; i++) {
                                if (quest_item_ids.indexOf(targets[i]) == -1)
                                    quest_item_ids.push(targets[i]);
                            }
                        });

                        if (quest_item_ids.length) {
                            var random_index = Math.floor(Math.random() * quest_item_ids.length);

                            var item_generator = {
                                'source': "collector",
                                'user_id': Meteor.userId(),
                                'artwork_id': quest_item_ids[random_index],
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

                            generateItemFromArtworkID(item_generator);
                        };
                    };
                    calcMVP(Meteor.userId());
                    npc_data.remove(offer_id);
                }
            });
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
                    items.update(item_id, {$set: {'status' : 'permanent'}});
                    items.update(item_id, {$set: {'permanent_post' : moment()._d.toISOString()}});
                }

                else {
                    items.update(item_id, {$set: {'status' : 'claimed'}});
                    items.update(item_id, {$unset: {'permanent_post' : ""}});
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
            var value = getItemValue(item_id, 'sell', Meteor.userId());
            if (isNaN(value)) {
                console.log("isNaN returned for item value");
                throw "invalid amount";
            }

            addFunds("sell item", Meteor.userId(), value);
            items.update(item_id, {$set: {'owner': "Artfunkel, Inc.", 'status': "auctioned", 'tags': []}} ,function(error) {
                if (error)
                    console.log(error.message);

                else {
                    if (Meteor.user().profile.user_type != "admin") {
                        calcMVP(Meteor.userId());
                        createAuction(item_id, getItemValue(item_id, "sell", undefined), -1, 120, "public");
                    }

                    else items.remove(item_id);
                }
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
            var minimum = getItemValue(item_id, "auction_min", Meteor.userId());
            if (Number(starting) < minimum)
                errors.push("starting value must be greater than $" + getCommaSeparatedValue(minimum));

            if (buy_now != -1 && Number(buy_now) < minimum )
                errors.push("buy now value must be greater than $" + getCommaSeparatedValue(minimum));
        }

        if (errors.length == 0) {
            items.update({'_id': item_id}, {$set: {'status' : 'auctioned'}}, function() {
                createAuction(item_id, starting, buy_now, duration, "public");
                if (procUniqueAttribute(Meteor.userId(), "XP_FOR_AUCTIONS", undefined) && Meteor.user().profile.market_expert.expiration > moment()._d.toISOString()) {
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

        items.update({'_id': item_id, 'owner': Meteor.userId()}, {$set: {'tags': lower_case}});
    },

    'getItemValue' : function(item_id, type, user_id) {
        return getItemValue(item_id, type, user_id);
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
                    var roll_value_min = .4;
                }

                if (procUniqueAttribute(Meteor.userId(), "ROLL_COUNT_REROLL_BONUS", undefined)) {
                    if (item_object.roll_count > 10 || item_object.roll_count < 0)
                        roll_value_min += .5;
                }
        
                items.update(item_id, {$set : {'xp_rating' : getXPRating(roll_value_min), 'roll_count': roll_count + 1}});
                chargeAccount(Meteor.userId(), getRerollCost(item_id));
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
                        var roll_value_min = .4;
                    }

                    if (procUniqueAttribute(Meteor.userId(), "ROLL_COUNT_REROLL_BONUS", undefined)) {
                        if (item_object.roll_count > 10 || item_object.roll_count < 0)
                            roll_value_min += .5;
                    }

                    attribute_array[i].value = attributeIsLocked(item_object.artwork_id, attribute_id) ? getLockedAttributeValue() : getAttributeValue(0, roll_value_min);
                    break;
                }
            }

            items.update(item_id, {$set: {'attributes' : attribute_array, 'roll_count' : roll_count + 1}});
            chargeAccount(Meteor.userId(), getRerollCost(item_id));
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

            if (procUniqueAttribute(Meteor.userId(), "ROLL_COUNT_REROLL_BONUS", undefined)) {
                if (item_object.roll_count > 10 || item_object.roll_count < 0)
                    roll_value_min += .5;
            }

            attribute_array[target_attribute_index].value = getAttributeValue(0, roll_value_min);
            attribute_array[target_attribute_index].locked = attributeIsLocked(item_object.artwork_id, random_attribute._id);

            // attribute_array.sort(function(first, second) {
            //     if (first.description > second.description)
            //         return 1;

            //     else return -1;
            // });

            items.update(item_id, {$set: {'attributes' : attribute_array, 'roll_count' : roll_count + 1}});
            // items.update(item_id, {$set : {'roll_count' : roll_count + 1}});
            chargeAccount(Meteor.userId(), getRerollCost(item_id));
        }

        else return false;
    },

})
