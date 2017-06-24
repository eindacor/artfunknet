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

	this.getArtworkObject = function() {
		return item_interface.getArtworkObject();;
	}

	this.getAuctionObject = function() {
		return getOneFromCollection("PlayerItemIF.js:PlayerItemIF", auctions, {'item_id': item_id});;
	}

	this.getXPPerHour = function(xp_earning_time) {
		try {
			var xp_chunk_min = .02;
			var xp_chunk_max = .12;
			var delta = xp_chunk_max - xp_chunk_min;

			var xp_chunk_percentage = xp_chunk_min + (item_object.level / MAX_ITEM_LEVEL * delta);

			if (itemIsMisprinted(item_object)) {
		        xp_chunk_percentage *= 2;
		    }
	        
	        var display_level = this.getDisplayLevel(xp_earning_time);        

	        var amplifier = Math.pow(xp_level_coefficient, Math.min(display_level, display_level_cap));
	        var actual_reward = xp_chunk_percentage * amplifier * getXPChunk(user_object.profile.level);
	        
	        return Math.floor(actual_reward);
		}

		catch (error) {
			console.log(error);
			return 0;
		}
	}

	this.getDisplayLevel = function(display_earning_time) {
		if (moment(item_object.time_displayed) < moment().add(-30, 'days'))
			return display_level_cap;

		var time_displayed = moment(display_earning_time) - moment(item_object.time_displayed);
	    return Math.min(Math.floor(time_displayed / display_level_duration), display_level_cap);
	}

	this.getDisplayValuePerHour = function(display_earning_time) {
		try {
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

	        return Math.floor(actual_reward);
	    }

	    catch(error) {
	    	console.log(error);
	    	return 0;
	    }
	}

	this.decline = function() {
	    if (permissions.canDecline()) {
	        item_interface.updateItem({$set: {'owner': BOT_USER_NAME, 'status': "auctioned"}}, true);
	        var starting = getItemObjectValues(item_object).auction_min;
	        createAuction(item_id, starting, -1, 60, "public");
	    }
	}

	this.quickDecline = function() {
		if (permissions.canQuickDiscard())
			this.decline();
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
		if (user_object.profile.vintage_select)
			return false;

        if (permissions.canSell()) {
            var value = getItemObjectValueByType(item_object, 'sell', user_id);
            if (isNaN(value)) {
                throw "invalid amount";
            }

            player_interface.addFunds("sell item", value);
            removeItem(item_id, "sold", undefined);
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
	            item_interface.updateItem({$set: {'status' : 'auctioned'}}, true, function() {
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
			if (item_object.artwork_data.unique_attributes.indexOf(unique_attribute_id) == -1)
	            return false;

	        else item_interface.updateItem({$set: {'active_unique_attribute': unique_attribute_id}}, false);
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

	    if (player_interface.procUniqueAttribute("MARKET_EXPERT_ROLL_BONUS", "Auctioneer")) {
	        min_roll += (delta * .3);
	        delta = 1 - min_roll;
	    }

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

	        player_interface.chargeAccount(item_interface.getRerollCost(item_id));

	        var setter_object = {};
	        var setter_string = "attributes." + attribute_type + ".$.value";
	        setter_object[setter_string] = value;

	        var query_object = {'_id': item_id};
	        var query_string = "attributes." + attribute_type + "._id";
	        query_object[query_string] = attribute_id;
	        updateItem(query_object, {$set: setter_object, $inc: {'roll_count' : 1}});         
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

            var roll_value_min = this.getRerollMin(user_id, "unlocked", item_object);
            random_attribute.value = getAttributeValue(0, roll_value_min);
     
            updateItem({'_id': item_id, 'attributes.unlocked._id': attribute_id}, {$set: {'attributes.unlocked.$' : random_attribute,}, $inc: {'roll_count' : 1}});
            player_interface.chargeAccount(item_interface.getRerollCost(item_id));
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

        if (desired_status) {
        	//TODO change true to false if legendary is introduced taht allows items to be repaired while on display
            item_interface.updateItem({$set: {'status' : 'repairing'}}, true);
        }

        else {
            item_interface.updateItem({$set: {'status' : 'claimed'}}, false);
        }
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
		//TODO add discounts for legendary affixes
		return item_interface.getRerollCost();
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
		        item_interface.updateItem({$set: {'status' : 'won', 'owner': user_id, 'tags': [], 'date_received': moment()._d.toISOString()}}, false, function(error) {
		            refundWinner(auction_object, user_id, auction_object.current_bid, true);
		            player_interface.chargeAccount(auction_object.buy_now);
		            var seller = getOneFromCollection("PlayerItemIF.js:PlayerItemIF.placeBid()", Meteor.users, {'profile.screen_name': auction_object.seller});
		            var seller_interface = new PlayerIF(seller);
		            
		            var nested_auction_object_interface = new ItemIF(auction_object.item_id);
		            if (auction_object.item_data.condition < .5 && player_interface.procUniqueAttribute("AUCTION_WIN_CONDITION_INCREASE", undefined)) {
		                nested_auction_object_interface.updateItem({$set: {'condition': .9}}, true);
		            }

		            if (player_interface.procUniqueAttribute("AUCTION_WIN_TICKET_EXTENSION", undefined)) {
		                getFromCollection("PlayerItemIF.js:PlayerItemIF.placeBid()", gallery_tickets, {'ticketholder': user_id}).forEach(function(db_object) {
		                    var new_expiration = moment(db_object.expiration).add(30, "minutes");
		                    gallery_tickets.update(db_object._id, {$set: {'expiration': new_expiration._d.toISOString()}});
		                })
		            }
		        
		            if (auction_object.seller != BOT_USER_NAME) {
		                var message = "Someone has purchased " + auction_object.item_data.title + " by " + auction_object.item_data.artist + " for $" + getCommaSeparatedValue(auction_object.buy_now);
		                seller_interface.alert(message, 'fa-gavel', 'good');
		                removeAuction(auction_object._id);
		                seller_interface.addFunds("auction", auction_object.buy_now);
		            }
		        });
		        
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

	this.repairItem = function(repair_value) {
		var suppress_gallery_update = item_interface.getStatus() != "displayed";
		var new_condition = Math.min(item_interface.getCondition() + repair_value, 1);
		item_interface.updateItem({$set: {'condition': Number(new_condition.toFixed(2))}}, suppress_gallery_update)
	}

	this.damageItem = function(damage_value) {
		var suppress_gallery_update = item_interface.getStatus() != "displayed";
		var new_condition = Math.max(item_interface.getCondition() - damage_value, 0);
		this.updateItem({$set: {'condition': Number(new_condition.toFixed(2))}}, suppress_gallery_update)
	}

	this.donate = function() {
		if (permissions.canDonate()) {
			if (item_interface.getStatus() == "for_sale") {
				if (!permissions.canPurchase()) {
					return false;
				}

				player_interface.chargeAccount(getItemObjectValueByType(item_object, "dealer", user_id));
			}

			var knowledge_object = item_interface.getDonationReward();
			player_interface.giveKnowledge(knowledge_object);
			items.remove({'_id': item_id});
		}
	}

	this.upgrade = function() {
		if (permissions.canUpgrade()) {
			var upgrade_cost = item_interface.getUpgradeCost();
			var keys = Object.keys(upgrade_cost);
			var inc_object = {};
			for (var i=0; i<keys.length; i++) {
				var amount = upgrade_cost[keys[i]];
				var inc_string = 'profile.knowledge.' + keys[i];
				inc_object[inc_string] = amount * -1;
			}
			Meteor.users.update({'_id': user_id}, {$inc: inc_object});
			item_interface.updateItem({$inc: {'level': 1}}, false);
		}
	}

	this.getRecommendedStatus = function() {
		if (item_interface.getStatus() == "archived" || item_interface.isOriginal()) {
			return {
				'displaced_item': true,
				'upgrade': false
			}
		}

		var displaced_item = this.getDisplacedArchiveItem();
		return {
			'displaced_item': displaced_item,
			'upgrade': displaced_item ? displaced_item.values.actual < item_interface.getItemObject().values.actual : false
		}
	}

	this.getDisplacedArchiveItem = function() {
		var artwork_interface = new ArtworkIF(item_interface.getArtworkObject());

		var query = {
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
			if (item_interface.getStatus() == "for_sale") {
				if (!permissions.canPurchase()) {
					return false;
				}

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
}