auctioneerInteraction = function(npc_object) {
	var user_object = Meteor.user();

	var market_expert_duration = 10; //minutes
	var market_expert_duration_extension = 5; // minutes
	var auction_count = 6;

	switch(npc_object.quality) {
		case 'bronze': 
			market_expert_duration += 2;
			market_expert_duration_extension += 2; 
			break;
        case 'silver': 
			market_expert_duration += 3;
			market_expert_duration_extension += 3; 
			break;
        case 'gold': 
			market_expert_duration += 4;
			market_expert_duration_extension += 4; 
			break;
        case 'platinum': 
			market_expert_duration += 5;
			market_expert_duration_extension += 5; 
			break;
        default: break;
	}

	if (isOwnGallery(npc_object)) {
		market_expert_duration = Math.floor(market_expert_duration * 2.5);
		market_expert_duration_extension = Math.floor(market_expert_duration_extension * 2.5);
		auction_count += 3;

		if (procUniqueAttribute(user_object._id, "DONOR_AUCTIONEER_TRADE", "Art Donor")) {
			auction_count += 4;
		}
	}

	var message;

	if (user_object.profile.market_expert.expiration < moment()._d.toISOString()) {
		var expiration_time = moment().add(market_expert_duration, 'minutes');
		Meteor.users.update(user_object._id, {$set: {
			'profile.market_expert.expiration': expiration_time._d.toISOString(),
		}});

		message = "You have met an auctioneer. They will help you identify in-demand items for the next " + market_expert_duration + " minutes (expires " + getTimeString(expiration_time) +  ").";
	}

	else {
		var new_expiration = moment(user_object.profile.market_expert.expiration).add(market_expert_duration_extension, 'minutes');
		Meteor.users.update(user_object._id, {$set: {
			'profile.market_expert.expiration': new_expiration._d.toISOString()
		}});

		message = "You have met another auctioneer. Your access to market analysis has been extended by " + market_expert_duration_extension + " minutes (expires " + getTimeString(new_expiration) + ").";
	}

	var auction_price_adjustment = 4;
	if (isOwnGallery(npc_object) && procUniqueAttribute(Meteor.userId(), "PRIVATE_AUCTION_PRICE_REDUCTION", undefined)) {
		auction_price_adjustment = 2.5;
	}

	var loot_data = getLootData();

	var multi_item_generator = {
        'source': "private auction",
        'user_id': "Artfunkel, Inc.",
        'quality': npc_object.quality,
        'count': auction_count,
        'status': "auctioned",
        'foil_chance': loot_data.global_foil_chance,
        'unlocked_chance': loot_data.global_unlocked_chance,
        'misprint_chance': loot_data.global_misprint_chance,
        'condition_min': 0
    }

	var item_ids = generateItems(multi_item_generator);

	setTimeout("", 2000);

	// private_auction_duration is instantiated in auction_methods.js
	items.find({'_id': {$in: item_ids}}).forEach(function(item_object) {
		createAuction(item_object._id, Math.floor(getItemObjectValueByType(item_object, 'actual', Meteor.userId()) * auction_price_adjustment), -1, private_auction_duration / 60000, Meteor.userId());
	})

	message += " They have also given you exclusive access to some items available in a private auction. Visit the auction house to make a bid.";

	return {'message': message};
}