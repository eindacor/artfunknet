auctioneerInteraction = function(npc_object, player_interface) {
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

	var auction_price_adjustment = 4;

	if (isOwnGallery(npc_object)) {
		market_expert_duration = Math.floor(market_expert_duration * 2.5);
		market_expert_duration_extension = Math.floor(market_expert_duration_extension * 2.5);
		auction_count += 3;

		if (player_interface.procUniqueAttribute("DONOR_AUCTIONEER_TRADE", "Art Donor")) {
			auction_count += 4;
		}

		if (player_interface.procUniqueAttribute("AUCTIONEER_REPUTATION_INCREASE", undefined)) {
			var current_reputation = player_interface.getReputation();
			if (current_reputation < .8) {
				var new_reputation = Math.min(current_reputation + .05, .8);
			    Meteor.users.update(player_interface.getId(), {$set: {'profile.visitor_ignore_coefficient': 1 - new_reputation}});
			}
		}

		if (player_interface.procUniqueAttribute("PRIVATE_AUCTION_PRICE_REDUCTION", undefined)) {
			auction_price_adjustment = 2.5;
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

	var multi_item_generator = {
        'source': "private auction",
        'map_amplifier': getMapAmplifierFromNPC(npc_object),
        'count': auction_count,
        'status': "auctioned"
    }

	var item_ids = ITEM_GENERATOR.generateMultiple(multi_item_generator, undefined, function(item_object) {
		// private_auction_duration is instantiated in auction_methods.js
		createAuction(item_object._id, Math.floor(getItemObjectValueByType(item_object, 'actual', player_interface.getId()) * auction_price_adjustment), -1, private_auction_duration / 60000, player_interface.getId());
	});
	
	message += " They have also given you exclusive access to some items available in a private auction. Visit the auction house to make a bid.";

	return {'message': message};
}