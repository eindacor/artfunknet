PlayerItemIF = function(user_id, item_id) {
	var permissions = getPlayerItemPermissions(user_id, item_id);

	var user_object = permissions.getUserObject();
	var item_reader = permissions.getItemReader();
	var item_object = item_reader.getItemObject();
	var artwork_object = artworks.findOne(item_object.artwork_id);
	var auction_object = auctions.findOne({'item_id': item_id});

	if (artwork_object == undefined)
		throw "invalid artwork id: " + item_object.artwork_id;

	this.getUserObject = function() {
		return user_object;
	}

	this.getItemReader = function() {
		return item_reader;
	}

	this.getArtworkObject = function() {
		return artwork_object;
	}

	this.getAuctionObject = function() {
		return auction_object;
	}

	this.getDisplayDetails = function(duration) {
	    var acceptable_durations = [60, 360, 720, 1440];
	    if (acceptable_durations.indexOf(parseInt(duration, 10)) == -1) {
	        return {
	            'money' : 0,
	            'xp' : 0,
	            'xp_chunk_percentage': 0,
	            'end' : moment()._d.toISOString()
	        }
	    }

	    var display_amount = getAverageDropValue(user_object.profile.level, 1);

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

	    display_amount = Math.floor(display_amount + (display_amount * item_object.condition * artwork_object.value_scale));

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
	    var xp = Math.floor(getXPChunk(user_object.profile.level) * xp_chunk_percentage);

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

	this.display = function(duration) {
	    var errors = [];
	    var valid_durations = [1, 60, 360, 720, 1440];

	    if (isNaN(duration) || valid_durations.indexOf(Number(duration)) == -1)
	        errors.push("invalid duration");

	    if (permissions.canDisplay() && errors.length == 0) {
	        var end = moment().add(duration, 'minutes');
	        var display_details = this.getDisplayDetails(duration);
	        //TODO move checklist calls to update callback
	        updateItem(item_id, {$set: {'status' : 'displayed', 'display_details' : display_details}});
	        this.addToChecklist('displayed');
	        this.addToChecklist('seen');
	        return [];
	    }

	    else errors.push("invalid operation");

	    return errors;
	}

	this.addToChecklist = function(category) {
		var card_types = ['foil', 'original', 'seasonal', 'lottery', 'unlocked', 'vintage'];
	    var setter_object = {};
	    var setter_string = 'profile.checklists.' + category + '.' + artwork_object.rarity + '.' + item_object.artwork_id;

	    var checklist_object = user_object.profile.checklists[category][artwork_object.rarity][item_object.artwork_id];

	    if (checklist_object == undefined) {
	        checklist_object = {}
	    }

	    for (var i=0; i<card_types.length; i++) {
	        checklist_object[card_types[i]] = checklist_object[card_types[i]] || item_object[card_types[i]];
	    }

	    setter_object[setter_string] = checklist_object;
	    Meteor.users.update(user_id, {$set: setter_object});
	}

	this.decline = function() {
	    if (permissions.canDecline()) {
	        updateItem(item_id, {$set: {'owner': "Artfunkel, Inc."}});
	        var starting = getItemObjectValues(item_object).auction_min;
	        createAuction(item_id, starting, -1, 60, "public");

	        if (Math.random() < .1 && procUniqueAttribute(item_object.owner, "DECLINE_DEALER_DESIGNER_SPAWN", undefined)) {
	            var npc_quality = getNPCQuality(user_object.profile.level);
	            createNPC(galleries.findOne({'owner_id': user_id}), attributes.findOne({'npc_name': "Designer"})._id, 600000, npc_quality);
	        }
	    }
	}

	this.quickDecline = function() {
		if (permissions.canQuickDiscard())
			this.decline();
	}

	this.claim = function() {
		if (permissions.canClaim()) {
			//TODO put addToChecklist() call in callback
		    updateItem(item_id, {$set: {'owner': user_id, 'status' : 'claimed', 'date_received': moment()._d.toISOString()}}, function(error) {
		        var rarity = artwork_object.rarity;
		        if (user_object.profile.vintage_select) {
		            Meteor.users.update(user_id, {$set: {'profile.vintage_select': false}});
		            items.find({'owner': user_id, 'status': 'won'}).forEach(function(db_item) {
		                removeItem(db_item._id, "vintage cleanout", undefined);
		            });
		        }
		    });
		    this.addToChecklist('owned');
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

            addFunds("sell item", user_id, value);
            removeItem(item_id, "sold", undefined);
        }
	}

	this.quickSell = function() {
		if (permissions.canQuickDiscard())
			this.sell();
	}

	this.auction = function(starting, buy_now, duration) {
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
	            updateItem(item_id, {$set: {'status' : 'auctioned'}}, function() {
	                createAuction(item_id, starting, buy_now, duration, "public");
	                if (user_object.profile.market_expert.expiration > moment()._d.toISOString() && procUniqueAttribute(user_id, "XP_FOR_AUCTIONS", undefined)) {
	                    addXPChunkPercentage("XP_FOR_AUCTIONS", user_id, .5)
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

	        updateItem(item_id, {$set: {'tags': lower_case}});
	    }
	}

	var getRerollMin = function(attribute_type) {
	    var min_roll = 0;
	    switch(attribute_type) {
	        case "unlocked": min_roll = 0; break;
	        case "locked": min_roll = .5; break;
	        case "special": min_roll = .8; break;
	        default: break;
	    }

	    var delta = 1 - min_roll;

	    if (procUniqueAttribute(user_id, "MARKET_EXPERT_ROLL_BONUS", "Auctioneer")) {
	        min_roll += (delta * .3);
	    }

	    if ((item_object.roll_count > 10 || item_object.roll_count < 0) && procUniqueAttribute(user_id, "ROLL_COUNT_REROLL_BONUS", undefined)) {
	        min_roll += (delta * .3);
	    }

	    return min_roll;
	}

	this.rerollAttributeValue = function(attribute_id) {
	    if (permissions.canReroll(attribute_id)) {
	        var roll_count = item_object.roll_count;
	        var attributes_object = item_object.attributes;

	        var attribute_type = undefined;

	        if (items.findOne({'_id': item_id, 'attributes.unlocked._id': attribute_id}) != undefined) {
	            attribute_type = "unlocked";
	        }

	        else if (items.findOne({'_id': item_id, 'attributes.locked._id': attribute_id}) != undefined) {
	            attribute_type = "locked";
	        }

	        else if (items.findOne({'_id': item_id, 'attributes.special._id': attribute_id}) != undefined) {
	            attribute_type = "special";
	        }

	        else return false;

	        var roll_value_min = getRerollMin(user_id, attribute_type, item_object);
	        var value = getAttributeValue(0, roll_value_min);

	        chargeAccount(user_id, item_reader.getRerollCost(item_id));

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
            var remaining = attributes.find(selector).count();
            var random_index = Math.floor(Math.random() * remaining);
            var random_attribute = attributes.findOne(selector, {skip: random_index});

            var roll_value_min = getRerollMin(user_id, "unlocked", item_object);
            random_attribute.value = getAttributeValue(0, roll_value_min);
     
            updateItem({'_id': item_id, 'attributes.unlocked._id': attribute_id}, {$set: {'attributes.unlocked.$' : random_attribute,}, $inc: {'roll_count' : 1}});
            chargeAccount(user_id, item_reader.getRerollCost(item_id));
        }
	}

	this.rerollXPRating = function() {
		if (permissions.canReroll()) {
            var roll_count = item_object.roll_count;
            var roll_value_min = 0;

            if (procUniqueAttribute(user_id, "MARKET_EXPERT_ROLL_BONUS", "Auctioneer")) {
                var roll_value_min = .3;
            }

            if ((item_object.roll_count > 10 || item_object.roll_count < 0) && procUniqueAttribute(user_id, "ROLL_COUNT_REROLL_BONUS", undefined)) {
                roll_value_min += .3;
            }
    
            chargeAccount(user_id, item_reader.getRerollCost(item_id));    
            updateItem(item_id, {$set : {'xp_rating' : getXPRating(roll_value_min), 'roll_count': roll_count + 1}});      
        }
	}

	this.purchase = function() {
		if (permissions.canPurchase()) {
            chargeAccount(user_id, getItemObjectValueByType(item_object, "dealer", user_id));

            var callback = this.addToChecklist('owned');
            updateItem(item_id, {$set: {'owner': user_id, 'status' : 'claimed', 'date_received': moment()._d.toISOString()}}, callback);

            if (procUniqueAttribute(user_id, "XP_FROM_DEALER_PURCHASES", undefined)) {
                addXPChunkPercentage("XP_FROM_DEALER_PURCHASES", user_id, items.findOne(item_id).xp_rating * .25);
            }

            if (procUniqueAttribute(user_id, "DEALER_PURCHASE_ROLL_COUNT_SET", undefined)) {
                updateItem(item_id, {$set: {'roll_count': -20}});
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

        if (desired_status) {
            updateItem(item_id, {$set: {'status' : 'permanent', 'permanent_post' : moment()._d.toISOString()}});
            this.addToChecklist('displayed');
            this.addToChecklist('seen');
        }

        else {
            updateItem(item_id, {$set: {'status' : 'claimed'}, $unset: {'permanent_post' : ""}});
        }
	}

	this.getRerollCost = function() {
		//TODO add discounts for legendary affixes
		return item_reader.getRerollCost();
	}

	this.placeBid = function(amount) {
		if (!permissions.canBid(amount))
	        return false;

	    var current_winner = Meteor.users.findOne({'profile.auction_data.winning': {$in: [auction_object._id]}});
	    var bidder_is_winner = current_winner && current_winner._id == user_id;

	    var available_balance = bidder_is_winner ? user_object.profile.bank_balance + auction_object.current_bid : user_object.profile.bank_balance;

	    if (amount > available_balance)
	        return true;

	    if (amount >= auction_object.buy_now && auction_object.buy_now != -1) {
	        updateItem(auction_object.item_id, {$set: {'status' : 'won', 'owner': user_id, 'tags': [], 'date_received': moment()._d.toISOString()}}, function(error) {
	            refundWinner(auction_object, user_id, auction_object.current_bid, true);
	            chargeAccount(user_id, auction_object.buy_now);
	            var seller_id = Meteor.users.findOne({'profile.screen_name': auction_object.seller})._id;
	            
	            if (auction_object.item_data.condition < .5 && procUniqueAttribute(user_id, "AUCTION_WIN_CONDITION_INCREASE", undefined)) {
	                updateItem(auction_object.item_id, {$set: {'condition': .9}});
	            }

	            if (procUniqueAttribute(user_id, "AUCTION_WIN_TICKET_EXTENSION", undefined)) {
	                gallery_tickets.find({'ticketholder': user_id}).forEach(function(db_object) {
	                    var new_expiration = moment(db_object.expiration).add(30, "minutes");
	                    gallery_tickets.update(db_object._id, {$set: {'expiration': new_expiration._d.toISOString()}});
	                })
	            }
	        
	            if (auction_object.seller != "Artfunkel, Inc.") {
	                var message = "Someone has purchased " + auction_object.item_data.title + " by " + auction_object.item_data.artist + " for $" + getCommaSeparatedValue(auction_object.buy_now);
	                alertPlayers(seller_id, message, 'fa-gavel', 'good');
	                removeAuction(auction_object._id);
	                addFunds("auction", seller_id, auction_object.buy_now);
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

	        chargeAccount(user_id, amount);
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
}