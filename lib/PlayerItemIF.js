PlayerItemIF = function(player_interface, item_interface) {
	var user_id = player_interface.getId();
	var item_id = item_interface.getId();
	var permissions = new PlayerItemPermissions(player_interface, item_interface);
	var user_object = player_interface.getUserObject();
	var item_object = item_interface.getItemObject();

	this.getPlayerItemPermissions = function() {
		return permissions;
	}

	this.getUserObject = function() {
		return user_object;
	}

	this.getItemIF = function() {
		return item_interface;
	}

	this.getPlayerIF = function() {
		return player_interface;
	}

	this.getArtworkObject = function() {
		return item_interface.getArtworkObject();;
	}

	this.getAuctionObject = function() {
		return getOneFromCollection("PlayerItemIF.js:PlayerItemIF", auctions, {'item_id': item_id});;
	}

	this.getXPPerHour = function(xp_earning_time) {
		if (Meteor.isClient) {
			return 0;
		}

		var xp_chunk_min = .02;
		var xp_chunk_max = .12;
		var delta = xp_chunk_max - xp_chunk_min;

		var xp_chunk_percentage = xp_chunk_min + (item_object.level / MAX_ITEM_LEVEL * delta);

		if (Meteor.isServer && itemIsMisprinted(item_object)) {
	        xp_chunk_percentage *= 2;
	    }
        
        var display_level = this.getDisplayLevel(xp_earning_time);        

        var amplifier = Math.pow(xp_level_coefficient, Math.min(display_level, display_level_cap));
        var actual_reward = xp_chunk_percentage * amplifier * getXPChunk(user_object.profile.level);

        if (item_interface.isForgery()) {
        	var forgery_modifier = .5 + (.4 * item_object.authenticity.forgery_quality);
        	actual_reward *= forgery_modifier;
        }
        
        return Math.floor(actual_reward);
	}

	this.getDisplayLevel = function(display_earning_time) {
		if (moment(item_object.time_displayed) < moment().add(-30, 'days'))
			return display_level_cap;

		var time_displayed = moment(display_earning_time) - moment(item_object.time_displayed);
	    return Math.min(Math.floor(time_displayed / display_level_duration), display_level_cap);
	}

	this.getDisplayValuePerHour = function(display_earning_time) {
		if (Meteor.isClient) {
			return 0;
		}

		var avg_drop = getAverageDropValue(user_object.profile.level, 1);

	    switch(item_object.artwork_data.rarity) {
	        case "common": break;
	        case "uncommon": avg_drop *= 5; break;
	        case "rare": avg_drop *= 10; break;
	        case "legendary": avg_drop *= 15; break;
	        case "masterpiece": avg_drop *= 20; break;
	        default: break;
	    }

	    if (item_object.foil) {
	        avg_drop *= 1.2;
	    }

	    if(item_object.seasonal) {
	        avg_drop *= 1.5;
	    }

	    if(item_object.lottery && item_object.lottery != 0) {
	        avg_drop *= (1 + (.15 * item_object.lottery));
	    }

	    if(item_object.original) {
	        avg_drop *= 2;
	    }

	    if (item_object.vintage){
	        avg_drop *= 1.5;
	    }

	    //TODO add value scale to local item artwork data
	    avg_drop = Math.floor(avg_drop + (avg_drop * item_object.condition * this.getArtworkObject().value_scale));

	    if (itemIsMisprinted(item_object)) {
	        avg_drop *= 20;
	    }

	    var base_money_per_hour = Math.floor(avg_drop * .015);

	    var display_level = this.getDisplayLevel(display_earning_time);

        var amplifier = Math.pow(display_level_coefficient, display_level);
        var actual_reward = base_money_per_hour * amplifier;

        if (item_interface.isForgery() && !player_interface.procUniqueAttribute("DISPLAY_FORGERY_MONEY_BONUS", undefined)) {
        	var forgery_modifier = .5 + (.4 * item_object.authenticity.forgery_quality);
        	actual_reward *= forgery_modifier;
        }

        return Math.floor(actual_reward);
	}

	this.decline = function() {
	    if (permissions.canDecline()) {
	    	items.remove({'_id': item_interface.getId()});
	    }
	}

	this.quickDecline = function() {
		if (permissions.canQuickDiscard()) {
			this.decline();
		}
	}

	this.claim = function() {
		if (permissions.canClaim()) {
		    item_interface.updateItem({$set: {'owner': user_id, 'status' : 'claimed', 'date_received': moment()._d.toISOString()}}, true, function(error) {
		        var rarity = item_object.artwork_data.rarity;
		        if (user_object.profile.vintage_select) {
		            Meteor.users.update(user_id, {$set: {'profile.vintage_select': false}});
		            getFromCollection("PlayerItemIF.js:PlayerItemIF.claim()", items, {'owner': user_id, 'status': 'won'}).forEach(function(db_item) {
		                removeItem(db_item._id, "vintage cleanout", undefined);
		            });
		        }
		    });
		}
	}

	this.sell = function() {
		try {
			if (user_object.profile.vintage_select)
				return false;

	        if (permissions.canSell()) {
	        	this.makeLiable();

	        	if (this.catchForgery(FORGERY_HEAT_CATEGORY.SELL)) {
					item_interface.punishForgeryOwner();
				}

				else {
		            var value = getItemObjectValueByType(item_object, 'sell', user_id);
		            if (isNaN(value)) {
		                throw "invalid amount";
		            }

		            player_interface.addFunds("sell item", value);
		            removeItem(item_id, "sold", undefined);
		        }
	        }
	    }

	    catch(error) {
	    	console.log(error);
	    }
	}

	this.quickSell = function() {
		if (permissions.canQuickDiscard())
			this.sell();
	}

	this.auction = function(starting, buy_now, duration) {
		if (DEBUG) {
			duration = 1;
		}
		
		if (permissions.canAuction()) {
			var errors = [];

	        if (isNaN(starting))
	            errors.push("invalid starting value");

	        if (isNaN(buy_now))
	            errors.push("invalid buy now value");

	        if (duration == "default")
	            errors.push("invalid duration");

	        if (item_object) {        
	            var minimum = getItemObjectValueByType(item_object, 'auction_min', user_id);
	            if (Number(starting) < minimum)
	                errors.push("starting value must be greater than $" + getCommaSeparatedValue(minimum));

	            if (buy_now != -1 && Number(buy_now) < minimum )
	                errors.push("buy now value must be greater than $" + getCommaSeparatedValue(minimum));
	        }

	        if (errors.length == 0) {
	        	this.makeLiable();
	            item_interface.updateItem({$set: {'status' : 'auctioned'}, $pull: {'tags': "for sale"}}, true, function() {
	                createAuction(item_id, starting, buy_now, duration, "public");
	                if (user_object.profile.market_expert.expiration > moment()._d.toISOString() && player_interface.procUniqueAttribute("XP_FOR_AUCTIONS", undefined)) {
	                    player_interface.addXPChunkPercentage("XP_FOR_AUCTIONS", .5, false)
	                }
	            });
	        }

	        return errors;
	    }
	}

	this.tag = function(tags) {
		if (permissions.canTag()) {
			var lower_case = [];
	        for (var i=0; i<tags.length; i++) {
	            lower_case.push(tags[i].toLowerCase())
	        }

	        item_interface.updateItem({$set: {'tags': lower_case}}, true);
	    }
	}

	this.setForSaleTag = function(status) {
		if (permissions.canTag()) {
			var suppress_gallery_update = true;
			if (status) {
				if (item_interface.getItemObject().tags.indexOf("for sale") == -1) {
					item_interface.updateItem({$push: {'tags': "for sale"}}, suppress_gallery_update)
				}	
			}

			else {
				item_interface.updateItem({$pull: {'tags': {$in: ["for sale"]}}}, suppress_gallery_update);
			}
		}
	}

	this.changeActiveUniqueAttribute = function(unique_attribute_id) {
		if (permissions.canChangeActiveUniqueAttribute()) {
			if (item_object.artwork_data.unique_attributes.indexOf(unique_attribute_id) == -1) {
	            return;
	        }

	        else {
	        	item_interface.updateItem({$set: {'active_unique_attribute': unique_attribute_id}}, false);
	        	item_object.active_unique_attribute = unique_attribute_id;
	        	return item_object;
	        }
		}
	}

	this.getRerollMin = function(attribute_type) {
	    var min_roll = 0;
	    switch(attribute_type) {
	        case "unlocked": min_roll = 0; break;
	        case "locked": min_roll = .5; break;
	        case "special": min_roll = .8; break;
	        default: break;
	    }

	    var delta = 1 - min_roll;

	    var item_level_modifier_coefficient = .5;
	    var level_scale = (item_object.level -1) / (MAX_ITEM_LEVEL - 1);
	    min_roll += delta * level_scale * item_level_modifier_coefficient;

	    return min_roll;
	}

	this.rerollAttributeValue = function(attribute_id) {
	    if (permissions.canReroll(attribute_id)) {
	        var roll_count = item_object.roll_count;
	        var attributes_object = item_object.attributes;

	        var attribute_type = undefined;

	        if (getOneFromCollection("PlayerItemIF.js:PlayerItemIF.rerollAttributeValue()", items, {'_id': item_id, 'attributes.unlocked._id': attribute_id}) != undefined) {
	            attribute_type = "unlocked";
	        }

	        else if (getOneFromCollection("PlayerItemIF.js:PlayerItemIF.rerollAttributeValue()", items, {'_id': item_id, 'attributes.locked._id': attribute_id}) != undefined) {
	            attribute_type = "locked";
	        }

	        else if (getOneFromCollection("PlayerItemIF.js:PlayerItemIF.rerollAttributeValue()", items, {'_id': item_id, 'attributes.special._id': attribute_id}) != undefined) {
	            attribute_type = "special";
	        }

	        else return false;

	        var roll_value_min = this.getRerollMin(attribute_type);

	        var value = getAttributeValue(0, roll_value_min);

	        player_interface.chargeAccount(this.getRerollCost());

	        var setter_object = {};
	        var setter_string = "attributes." + attribute_type + ".$.value";
	        setter_object[setter_string] = value;

	        var query_object = {'_id': item_id};
	        var query_string = "attributes." + attribute_type + "._id";
	        query_object[query_string] = attribute_id;
	        updateItem(query_object, {$set: setter_object, $inc: {'roll_count' : 1}}); 
	        return items.findOne(item_interface.getId());       
	    }

	    else return false;
	}

	this.rerollAttribute = function(attribute_id) {
        if (permissions.canRerollItemAttribute(attribute_id)) {
            var roll_count = item_object.roll_count;

            var attribute_ids = [];
            var attribute_objects = getAllItemObjectAttributes(item_object)

            for (var i=0; i<attribute_objects.length; i++) {
                attribute_ids.push(attribute_objects[i]._id);
            }

            var selector = {'_id' : {'$nin': attribute_ids}, 'active': true};
            var remaining = getFromCollection("PlayerItemIF.js:PlayerItemIF.rerollAttribute()", attributes, selector).count();
            var random_index = Math.floor(Math.random() * remaining);
            
            var random_attribute = getOneFromCollection("PlayerItemIF.js:PlayerItemIF.rerollAttribute()", attributes, selector, {skip: random_index});
	        random_attribute.value = getAttributeValue(0, this.getRerollMin(user_id, "unlocked", item_object));

            updateItem({'_id': item_id, 'attributes.unlocked._id': attribute_id}, {$set: {'attributes.unlocked.$' : random_attribute,}, $inc: {'roll_count' : 1}});
            player_interface.chargeAccount(this.getRerollCost());
            return items.findOne(item_interface.getId());   
        }
	}

	this.purchase = function() {
		if (permissions.canPurchase()) {
            player_interface.chargeAccount(getItemObjectValueByType(item_object, "dealer", user_id));

            item_interface.updateItem({$set: {'owner': user_id, 'status' : 'claimed', 'date_received': moment()._d.toISOString()}}, true);

            if (player_interface.procUniqueAttribute("DEALER_PURCHASE_ROLL_COUNT_SET", undefined)) {
                item_interface.updateItem({$set: {'roll_count': -20}}, true);
            }
        }
	}

	this.setPermanentStatus = function(desired_status) {
		if (desired_status && !permissions.canSetPermanent()) {
			return false;
		}

		else if (!desired_status && !permissions.canUnsetPermanent()) {
			return false;
		}

        item_interface.updateItem({$set: {'permanent' : desired_status}, $pull: {'tags': {$in: ["for sale"]}}}, true);
	}

	this.setRepairingStatus = function(desired_status) {
		if (desired_status && !permissions.canSetRepairing()) {
			return false;
		}

		else if (!desired_status && !permissions.canUnsetRepairing()) {
			return false;
		}

        item_interface.updateItem({$set: {'repairing' : desired_status}}, true);
	}

	this.setDisplayStatus = function(desired_status) {
		if (desired_status && !permissions.canDisplay()) {
			return false;
		}

		else if (!desired_status && !permissions.canUndisplay()) {
			return false;
		}

        if (desired_status) {
            item_interface.updateItem({$set: {'status' : 'displayed', 'time_displayed' : moment()._d.toISOString()}}, false);
        }

        else {
            item_interface.updateItem({$set: {'status' : 'claimed'}, $unset: {'time_displayed' : ""}}, false);
        }
	}

	this.getRerollCost = function() {
		if (item_interface.isIdentifiedForgery() && player_interface.procUniqueAttribute("FORGERY_REROLL_DISCOUNT", undefined)) {
			return 0;
		}

		var item_object = item_interface.getItemObject();
		var roll_count = item_object.roll_count < 0 ? 0 : item_object.roll_count;

	    var rarity = item_object.artwork_data.rarity;
	    var reroll_coefficient = REROLL_COEFFICIENTS[rarity];
	    var rarity_values = metadata.findOne({'loot_data': {$ne: null}}).loot_data.rarity_values;
	    var average_value = Math.floor((rarity_values[rarity].max + rarity_values[rarity].min) / 2);

	    var reroll_cost = (rarity_values[rarity].min * .1) * Math.pow(reroll_coefficient, roll_count);

	    if (player_interface.procUniqueAttribute("REROLL_DISCOUNT", undefined)) {
	        reroll_cost = Math.floor(reroll_cost * .75);
	    }

	    return Math.floor(reroll_cost);
	}

	this.placeBid = function(amount) {
		try {
			var auction_object = getOneFromCollection("PlayerItemIF.js:PlayerItemIF", auctions, {'item_id': item_id});
			if (!permissions.canBid(amount))
		        return false;

		    var current_winner = getOneFromCollection("PlayerItemIF.js:PlayerItemIF.placeBid()", Meteor.users, {'profile.auction_data.winning': {$in: [auction_object._id]}});
		    var bidder_is_winner = current_winner && current_winner._id == user_id;

		    var available_balance = bidder_is_winner ? user_object.profile.bank_balance + auction_object.current_bid : user_object.profile.bank_balance;

		    if (amount > available_balance)
		        return true;

		    if (amount >= auction_object.buy_now && auction_object.buy_now != -1) {
		    	var item_interface = new ItemIF(auction_object.item_id);

		    	var seller = getOneFromCollection("PlayerItemIF.js:PlayerItemIF.placeBid()", Meteor.users, {'profile.screen_name': auction_object.seller});

		    	var updateCallback = function(error) {
		    		var seller_interface = new PlayerIF(seller);
		    		refundWinner(auction_object, user_id, auction_object.current_bid, true);
		            player_interface.chargeAccount(auction_object.buy_now);
		           		            
		            var nested_item_interface = new ItemIF(auction_object.item_id);
		            if (auction_object.item_data.condition < .5 && player_interface.procUniqueAttribute("AUCTION_WIN_CONDITION_INCREASE", undefined)) {
		                nested_item_interface.updateItem({$set: {'condition': .9}}, true);
		            }

		            if (Math.random() < IDENTIFY_FORGED_AUCTIONS_PROC && player_interface.procUniqueAttribute("IDENTIFY_FORGED_AUCTIONS", undefined)) {
		                nested_item_interface.updateItem({$set: {'authenticity.identified': true}})
		            }

		            if (player_interface.procUniqueAttribute("KNOWLEDGE_FOR_AUCTION_WINS", undefined)) {
		                var unit_reward = nested_item_interface.getUnitValue() * 6;
		                var knowledge_reward = convertUnitValueToKnowledge(unit_reward);
		                player_interface.giveKnowledge(knowledge_reward);
		            }
		        
		            if (auction_object.seller != BOT_USER_NAME) {
		                var message = "Someone has purchased " + auction_object.item_data.title + " by " + auction_object.item_data.artist + " for $" + getCommaSeparatedValue(auction_object.buy_now);
		                seller_interface.alert(message, 'fa-gavel', 'good');
		                removeAuction(auction_object._id);
		                seller_interface.addFunds("auction", auction_object.buy_now);
		            }

		            var seller_item_interface = new PlayerItemIF(seller_interface, item_interface);
		            seller_item_interface.makeLiable();
		    	}

		        transferAuctionItem(item_interface, "won", user_id, auction_object.buy_now, updateCallback);        
		        return true;
		    }

		    else if (amount >= auction_object.min_bid) {
		        var current_bid = amount;
		        var min_bid = current_bid + auction_object.increment;

		        // refund still applies if bidder_is_winner. they will be refunded their previous bid and charged their new bid
		        refundWinner(auction_object, user_id, auction_object.current_bid, false);

		        if (!bidder_is_winner) {
		            Meteor.users.update({'profile.auction_data.winning': {$in: [auction_object._id]}}, {$pull: {'profile.auction_data.winning': auction_object._id}}, function(error) {
		                Meteor.users.update(user_id, {$push: {'profile.auction_data.winning': auction_object._id}});
		            });
		        }

		        player_interface.chargeAccount(amount);
		        auctions.update(auction_object._id, {$set: {
		            'min_bid': min_bid,
		            'current_bid': current_bid,
		            'has_bid': true
		        }});

		        Meteor.users.update({'_id': user_id, 'profile.auction_data.watching': {$nin: [auction_object._id]}}, {$push: {'profile.auction_data.watching': auction_object._id}});
		        return true;
		    }

		    else return false; 
		}

		catch (error) {
			console.log("placeBid error: " + error);
		}
	}

	this.getValue = function(type) {
		try {
			var base_value = item_object.values[type];

            if (type == "dealer" && player_interface.procUniqueAttribute("DEALER_DISCOUNT", undefined, true)) {
                base_value *= .75;
            }

            if (type == "sell") {
                if (getOneFromCollection("PlayerItemIF.js:PlayerItemIF.getValue()", quests, {'owner_id': user_id, 'target': {$in: [item_object.artwork_id]}}) &&
                    player_interface.procUniqueAttribute("QUEST_ITEM_SELL_BONUS", undefined, true)) {
                    base_value *= 1.5;
                }

                if (item_object.status == "unclaimed" && 
                    player_interface.procUniqueAttribute("UNCLAIMED_ITEM_SELL_BONUS", undefined, true)) {
                    base_value *= 1.5;
                }
            }

            return base_value;
	    }

	    catch(error) {
	    	console.log(error);
	    }
	}

	this.repair = function(repair_value, source) {
		var suppress_gallery_update = item_interface.getStatus() != "displayed";
		var previous_condition = item_interface.getCondition();
		var new_condition = Math.min(previous_condition + repair_value, 1);

		if (previous_condition != new_condition && new_condition == 1 && source == "repair tick" && player_interface.procUniqueAttribute("KNOWLEDGE_FOR_REPAIR", undefined, true)) {
			var unit_reward = Math.floor(item_interface.getUnitValue());
			player_interface.giveKnowledge(convertUnitValueToKnowledge(unit_reward));
		}

		item_interface.updateItem({$set: {'condition': Number(new_condition.toFixed(2))}}, suppress_gallery_update)
	}

	this.damageItem = function(damage_value) {
		var suppress_gallery_update = item_interface.getStatus() != "displayed";
		var new_condition = Math.max(item_interface.getCondition() - damage_value, 0);
		item_interface.updateItem({$set: {'condition': Number(new_condition.toFixed(2))}}, suppress_gallery_update)
	}

	this.donate = function() {
		if (permissions.canDonate()) {
			this.makeLiable();

			if (this.catchForgery(FORGERY_HEAT_CATEGORY.DONATE)) {
				item_interface.punishForgeryOwner();
			}

			else {
				if (item_interface.getStatus() == "for_sale") {
					player_interface.chargeAccount(getItemObjectValueByType(item_object, "dealer", user_id));
				}

				var knowledge_object = item_interface.getDonationReward();
				player_interface.giveKnowledge(knowledge_object);
				items.remove({'_id': item_id});
			}
		}
	}

	this.getUpgradeCost = function() {
		if (item_interface.isIdentifiedForgery() && player_interface.procUniqueAttribute("FORGERY_REROLL_DISCOUNT", undefined)) {
			return convertUnitValueToKnowledge(0);
		}

		var total_unit_cost = item_interface.getUnitValue() * 3;

        if (item_object.condition > .8 && player_interface.procUniqueAttribute("LEVEL_UP_COST_REDUCTION", "Preservationist")) {
            total_unit_cost = Math.floor(total_unit_cost * .8);
        }

        return convertUnitValueToKnowledge(total_unit_cost);
	}

	this.upgrade = function() {
		if (permissions.canUpgrade()) {
			var upgrade_cost = this.getUpgradeCost();
			var keys = Object.keys(upgrade_cost);
			var inc_object = {};
			for (var i=0; i<keys.length; i++) {
				var amount = upgrade_cost[keys[i]];
				var inc_string = 'profile.knowledge.' + keys[i];
				inc_object[inc_string] = amount * -1;
			}
			Meteor.users.update({'_id': user_id}, {$inc: inc_object});
			item_interface.updateItem({$inc: {'level': 1}}, false);
			item_object.level += 1;
			return item_object;
		}
	}

	this.getRecommendedStatus = function() {
		var displaced_item = this.getDisplacedArchiveItem();
		if (item_interface.getStatus() == "archived" || item_interface.isOriginal() || item_interface.isVintage()) {
			return {
				'displaced_item': displaced_item,
				'upgrade': false
			}
		}

		var compared_value = item_interface.getItemObject().values == undefined ? 0 : item_interface.getItemObject().values.actual;

		return {
			'displaced_item': displaced_item,
			'upgrade': displaced_item ? displaced_item.values.actual < compared_value : false
		}
	}

	this.getDisplacedArchiveItem = function() {
		var artwork_interface = new ArtworkIF(item_interface.getArtworkObject());

		var query = {
			'_id': {'$ne': item_interface.getId()},
        	'owner': user_id,
            'artwork_id': artwork_interface.getId(),
            'status': "archived",
            'displaced': false,
            'archive_signature': item_interface.getArchiveSignature()
        };

        return getOneFromCollection("ItemIF.js:getDisplacedArchiveItem", items, query);
	}

	this.archive = function() {
		if (permissions.canArchive()) {
			this.makeLiable();

			if (item_interface.getItemObject().authenticity.forgery) {
				item_interface.punishForgeryOwner();
				return false;
			}

			if (item_interface.getStatus() == "for_sale") {
				player_interface.chargeAccount(getItemObjectValueByType(item_object, "dealer", user_id));
			}

			var displaced_item = this.getDisplacedArchiveItem();
			item_interface.updateItem({
				$set: {
					'status': "archived", 
					'time_archived': moment()._d.toISOString(), 
					'displaced': false,
					'archive_signature': item_interface.getArchiveSignature()
				}, 
				$pull: {
					'tags': {$in: ["displaced"]}
				}
			}, true);

			if (displaced_item) {
				var displaced_item_interface = new ItemIF(displaced_item);
				displaced_item_interface.updateItem({$set: {'time_archived': moment()._d.toISOString(), 'displaced': true}, $push: {'tags': "displaced"}}, true)
			}
		}
	}

	this.delete = function() {
		if (permissions.canDelete()) {
			items.remove({'_id': item_interface.getId()});
		}
	}

	this.alreadyOwnsArtwork = function() {
		var item_belongs_to_other = item_object.owner != user_id;
		var item_is_unclaimed = ['unclaimed', 'for_sale', 'won'].indexOf(item_object.status) != -1
		var show_already_owns = item_belongs_to_other || item_is_unclaimed;

		if (show_already_owns) {
			var artwork_id = item_object.artwork_id;
			var valid_statuses = ['claimed', 'displayed', 'auctioned'];
			return items.findOne({'owner': user_id, 'status': {$in: valid_statuses}, 'artwork_id': artwork_id}) != undefined;
		}

		else return false;
	}

	this.isQuestTarget = function() {
		return quests.findOne({'owner_id': user_id, 'target': {$in: [item_object.artwork_id]}}) != undefined;
	}

	this.isSought = function() {
		if (user_object.profile.market_expert.expiration > moment()._d.toISOString()) {
			return false;
		}

	    if (auctions.findOne({'viewer': "public", 'item_data.artwork_id': item_object.artwork_id}) != undefined) {
	        return false;
	    }

	    var is_sought = false;
	    var now = getNowISOString();

	    quests.find({'owner_id': {'$ne': user_id}, 'target': {$in: [item_object.artwork_id]}}).forEach(function(quest_object) {
	        if (is_sought)
	            return;

	        var quest_owner = quest_object.owner_id;

	        var owner_interface = new PlayerIF(quest_owner);
	        if (!owner_interface.isRecentlyActive()) {
	        	return false;
	        }

	        if (items.findOne({'owner': owner_interface.getId(), 'artwork_id': item_object.artwork_id}) == undefined) {
	            is_sought = true;
	        }
	    });

	    return is_sought;
	}

	this.procForgeryDetection = function() {
		return item_interface.isForgery() && Math.random() < FORGERY_DETECTION_CHANCE;
	}

	this.isLiable = function() {
		return item_interface.getItemObject().liable = player_interface.getId();
	}

	this.getIdentifyCost = function() {
		var base_cost = Math.floor(item_interface.getItemObject().authenticity.fee * IDENTIFY_COST_COEFFICIENT);
		// var base_cost = item_interface.getItemObject().values.actual * IDENTIFY_COST_COEFFICIENT;
		return base_cost;
	}

	this.identify = function() {
		if (permissions.canIdentify()) {
			var identify_cost = this.getIdentifyCost();
			player_interface.chargeAccount(identify_cost);
			item_interface.updateItem({$set: {'authenticity.identified': true}}, false);
		}
	}

	this.catchForgery = function(heat_category) {
		if (item_object.authenticity.forgery) {
			var legendary_rarities = ["legendary", "masterpiece"];
			if (item_object.seasonal || item_object.lottery > 0) {
				if (legendary_rarities.indexOf(item_object.artwork_data.rarity) == -1) {
					return true;
				}
			}

			if (item_object.unlocked && item_object.artwork_data.rarity == "uncommon") {
				return true;
			}

			var forgery_heat = player_interface.getForgeryHeat(item_object, heat_category);
			if (Math.random() < forgery_heat) {
				return true;
			}
		}

		else return false;
	}

	this.redeem = function() {
		try {
			if (permissions.canRedeemForgery()) {
				if (item_interface.getItemObject().authenticity.forgery) {
					var xp_chunk_percentage = 1;		
					var original_fee = item_interface.getItemObject().authenticity.fee;

					var bonus = original_fee * FORGERY_REDEMPTION_BONUS_COEFFICIENT;						

					if (item_interface.getItemObject().authenticity.liable == BOT_USER_NAME) {
						bonus *= 10;
						xp_chunk_percentage *= 2;
						items.remove({'_id': item_id});
					}

					else {
						item_interface.punishLiable();

		        		item_interface.updateItem({$set: {
				        	'status' : 'won', 
				        	'owner': item_interface.getItemObject().authenticity.liable, 
				        	'tags': [], 
				        	'date_received': moment()._d.toISOString(),
				        	'authenticity.identified': true,
		            		'authenticity.fee':0,
		            		'authenticity.liability_pending': false,
		            		'authenticity.forgery_quality': Math.max(item_interface.getItemObject().authenticity.forgery_quality - .1, .1)
				        }}, true, undefined);
					}

					var chunk = getXPChunk(player_interface.getPlayerLevel());
					logXPChunkPercentage("forgery redemption", xp_chunk_percentage);
					var xp_earned = Math.floor(chunk * xp_chunk_percentage);
					player_interface.addXP(xp_earned, false);

					var money_reward = Math.floor(original_fee + bonus);
					player_interface.addFunds("forgery redemption", money_reward);	

					var message = "You successfully returned " + item_object.artwork_data.title + " by " + item_object.artwork_data.artist + ". You have been refunded $" + getCommaSeparatedValue(original_fee) + " for your purchase, and you've earned $" + getCommaSeparatedValue(bonus) + " and " + getCommaSeparatedValue(xp_earned) + "xp as a reward.";
		        	alertPlayers(player_interface.getId(), message, 'fa-user-secret', 'good');

		        	var current_reputation = player_interface.getReputation();
		        	var new_reputation = Math.min(current_reputation + .05, 1);
		        	Meteor.users.update(user_id, {$set: {'profile.visitor_ignore_coefficient': 1 - new_reputation}});	
				}

				else {
					item_interface.punishForFalseForgeryRedemption();
					item_interface.updateItem({$set: {'authenticity.identified': true}}), true;
					this.makeLiable();
				}			
			}
		}

		catch (error) {
			console.log(error);
		}
	}

	this.makeLiable = function() {
		if (item_object.authenticity.liable == player_interface.getId()) {
			return;
		}

		else if (item_object.authenticity.forgery) {
			var former_liable_player_interface = new PlayerIF(item_object.authenticity.liable);
			var xp_chunk_percentage = .8;
			former_liable_player_interface.addXPChunkPercentage("transfer forgery", xp_chunk_percentage, false);

			var message = "You successfully offloaded a forgery: " + item_object.artwork_data.title + " by " + item_object.artwork_data.artist + ", earning you XP.";
        	alertPlayers(former_liable_player_interface.getId(), message, 'fa-user-secret', 'good');
		}	

		item_interface.updateItem({$set: {'authenticity.liable': player_interface.getId()}}, true);	
	}
}