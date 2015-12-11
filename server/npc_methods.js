var max_level = 50;

getNPCQuality = function(player_level) {
	var max_roll_value = 100;
	var min_roll_value = 0;

	var low_roll_from_level = Math.floor((player_level / max_level) * 100);

	var npc_quality_map = {
		'bronze' : max_roll_value,
		'silver' : Math.floor(low_roll_from_level + ((max_roll_value - low_roll_from_level) * .67)),
		'gold' : Math.floor(low_roll_from_level + ((max_roll_value - low_roll_from_level) * .33)),
		'platinum' : low_roll_from_level
	}

	return JepLoot.catRoll(npc_quality_map);
}

createNPC = function(gallery_object, attribute_id, duration) {
    var npc_object = {
        'quality' : getNPCQuality(Meteor.users.findOne(gallery_object.owner_id).profile.level),
        'attribute_id' : attribute_id,
        'owner_id' : gallery_object.owner_id,
        'expiration' : moment().add(duration, 'milliseconds')._d.toISOString(),
        'players_met' : [],
        'icon' : attributes.findOne(attribute_id).icon
    }

    npcs.insert(npc_object, function(error, inserted_id) {
        if (error)
            console.log(error.message)
    })
}

Meteor.methods({
	'interactWithNPC' : function(npc_id) {
		var npc_object = npcs.findOne(npc_id);

		if (npc_object == undefined || npc_object.players_met.indexOf(Meteor.userId()) != -1)
			return undefined;

		var attribute_object = attributes.findOne(npc_object.attribute_id);		
		var npc_interaction = {};

		switch(attribute_object.title) {
			case "benefactor_bonus": 
				npc_interaction = benefactorInteraction(npc_object);
				break;
			case "donor_bonus": 
				npc_interaction = donorInteraction(npc_object);
				break;
			case "preservationist_bonus": 
				npc_interaction = preservationistInteraction(npc_object);
				break;
			case "gallery_manager":
				npc_interaction = galleryManagerInteraction(npc_object);
				break;
			case "set_xp_visitors": //DISABLE - give portion of set xp to visitors
				npc_interaction = {'message': "You have been given 0xp for sets in this permanent collection."};
				break;
			case "xp_visitors": //DISABLE - give portion of collection xp to visitors
				npc_interaction = {'message': "You have been given 0xp for works in this permanent collection."};
				break;
			case "auctioneer_bonus": //DISABLE - provide access to private bot auction
				npc_interaction = {'message': "You have met an auctioneer."};
				break;
			case "dealer_bonus":
				npc_interaction = artDealerInteraction(npc_object);
				break;
			case "collector_bonus":
				npc_interaction = collectorInteraction(npc_object);
				break;
			case "designer_bonus": //DISABLE - give discount to store
				npc_interaction = designerInteraction(npc_object);
				break;
			case "forger_bonus": //DISABLE - give access to black market
				npc_interaction = {'message': "You have met an art forger."};
				break;
			case "art_expert_bonus":
				npc_interaction = artExpertInteraction(npc_object);
				break;
			case "historian_bonus": //DISABLE - quiz players for xp
				npc_interaction = historianInteraction(npc_object);
				break;
			case "market_expert_bonus": //DISABLE - analyze auction house and return deals
				npc_interaction = marketExpertInteraction(npc_object);
				break;
			case "entry_fee_reduction_members": //DISABLE = reduce entry fee for members
			case "set_xp_members": //DISABLE - give portion of set xp to members
			case "xp_members": //DISABLE - give portion of xp to members
			case "xp_per_visitor": //DISABLE - increase xp gain per visitor
			case "money_per_visitor": //DISABLE - increase money earned for entry fee
			case "bonus_money": //DISABLE - bonus money from feature paintings
			case "enthusiast_bonus": //give xp
				npc_interaction = enthusiastInteraction(npc_object);
				break;
			default: return undefined;
		}

		npcs.update(npc_id, {$push: {'players_met' : Meteor.userId()}});
		return npc_interaction;
	}
})

var own_gallery_amplifier = 1.75;

var isOwnGallery = function(npc_object) {
	return npc_object.owner_id == Meteor.userId();
}

var enthusiastInteraction = function(npc_object) {
	var xp_chunk_percentage;

	switch(npc_object.quality) {
		case 'bronze' : xp_chunk_percentage = .2; break;
		case 'silver' : xp_chunk_percentage = .3; break;
		case 'gold' : xp_chunk_percentage = .4; break;
		case 'platinum' : xp_chunk_percentage = .5; break;
	};

	if (isOwnGallery(npc_object))
		xp_chunk_percentage *= own_gallery_amplifier;

	var xp_chunk = getXPChunk(Meteor.user().profile.level);
	var xp_won = Math.floor(xp_chunk * xp_chunk_percentage);

	var message = "You have met an art enthusiast who recently attended one of your gallery's events. They rave about your collection, and thank you for the experience. You have earned " + getCommaSeparatedValue(xp_won) + "xp!";

	addXP(Meteor.userId(), xp_won);
	return {'message': message}
}

var benefactorInteraction = function(npc_object) {
	// max_donation is determined by how close the player is to max level
	var max_donation = 50000 + (250000 * playerRatio(Meteor.user()));
	var donation_amount;

	switch(npc_object.quality) {
		case 'bronze' : donation_amount = max_donation * .4; break;
		case 'silver' : donation_amount = max_donation * .6; break;
		case 'gold' : donation_amount = max_donation * .8; break;
		case 'platinum' : donation_amount = max_donation * 1; break;
	};

	// returns true if the player met the npc in his/her own gallery
	if (isOwnGallery(npc_object)) {
		donation_amount *= own_gallery_amplifier;

		if (procUniqueAttribute(Meteor.userId(), "BENEFACTOR_MARKET_EXPERT_RATING_BONUS")) {
			if (Meteor.user().profile.market_expert.expiration > moment()._d.toISOString()) {
				donation_amount += (Meteor.user().profile.market_expert.rating * donation_amount);
			}
		}
	}

	// adjust randomly to vary amount won
	var money_won = Math.floor(donation_amount + ((Math.random() * .1) * max_donation));

	var message = "You have met a benefactor who would like to make a donation. You have recieved $" + getCommaSeparatedValue(money_won) + "!";

	addFunds(Meteor.userId(), money_won);
	return {'message': message}
}

var donorInteraction = function(npc_object) {
	var drop_count = 2;

	if (isOwnGallery(npc_object)) {
		drop_count += 1;

		if (procUniqueAttribute(Meteor.userId(), "BONUS_DEALER_DONOR")) {
			drop_count += 1;
		}
	}

	generateItems(Meteor.userId(), npc_object.quality, drop_count, "unclaimed");

	var message = "You have met a donor who would like to contribute to your collection. You may claim your gift in the loot area.";

	return {'message': message}
}

var preservationistInteraction = function(npc_object) {
	var repair_amount;
	var target_item;

	switch(npc_object.quality) {
		case 'bronze': repair_amount = .08; break;
		case 'silver': repair_amount = .1; break;
		case 'gold': repair_amount = .12; break;
		case 'platinum': repair_amount = .14; break;
		default: repair_amount = 0; break;
	}

	if (isOwnGallery(npc_object)) {
		repair_amount *= own_gallery_amplifier;

		if (procUniqueAttribute(Meteor.userId(), "PRESERVATIONIST_HIGHEST")) {
			target_item = items.findOne({'owner' : Meteor.userId(), 'status' : {$in : ['claimed', 'displayed', 'permanent']}, 'condition': {$lt: 1}}, {sort: {'condition': -1}});
		}

		else target_item = items.findOne({'owner' : Meteor.userId(), 'status' : {$in : ['claimed', 'displayed', 'permanent']}}, {sort: {'condition': 1}});

		if (target_item && procUniqueAttribute(Meteor.userId(), "PRESERVATIONIST_CONDITION_BONUS") && target_item.condition > .8) {
			addFunds(Meteor.userId(), Math.floor(getItemObjectValue(target_item, "display") * .5));
		}

		if (procUniqueAttribute(Meteor.userId(), "PRESERVATIONIST_FINISH_BOOST") && npcs.findOne({'owner_id': Meteor.userId(), 'attribute_id': attributes.findOne({'npc_name': "Designer"})._id}) != undefined) {
			var increase_amount = .04;
			var user_object = Meteor.user();
			var current_wall = user_object.profile.gallery_finishes.active.wall_finish;
			var current_floor = user_object.profile.gallery_finishes.active.floor_finish;
			var current_wall_rating = user_object.profile.gallery_finishes.owned.wall_finishes[current_wall].xp_rating;
			var current_floor_rating = user_object.profile.gallery_finishes.owned.floor_finishes[current_floor].xp_rating;

			var setter = {};

			var wall_setter_string = "profile.gallery_finishes.owned.wall_finishes." + current_wall + ".xp_rating";
			setter[wall_setter_string] = Number((current_wall_rating + increase_amount).toFixed(2)) > 1 ? 1 : Number((current_wall_rating + increase_amount).toFixed(2));

			var floor_setter_string = "profile.gallery_finishes.owned.floor_finishes." + current_floor + ".xp_rating";
			setter[floor_setter_string] = Number((current_floor_rating + increase_amount).toFixed(2)) > 1 ? 1 : Number((current_floor_rating + increase_amount).toFixed(2));

			Meteor.users.update(Meteor.userId(), {$set: setter});
		}
	}

	else target_item = items.findOne({'owner' : Meteor.userId(), 'status' : {$in : ['claimed', 'displayed', 'permanent']}}, {sort: {'condition': 1}});

	if (target_item == undefined || target_item.condition > .9)
		return {'message' : "You have met a preservationist, but you don't currently own any works that can be refurbished"};

	var new_condition;
	if (repair_amount + target_item.condition > 1)
		new_condition = 1;

	else new_condition = repair_amount + target_item.condition;

	items.update(target_item._id, {$set: {'condition' : Number(new_condition)}}, function(error) {
        if (error)
            console.log(error.message);

        else {
        	calcMVP(Meteor.userId());
        	updateGalleryDetails(Meteor.userId());
        }
    });

	var message = "You have met a preservationist who has offered to refurbish one of your pieces. " + target_item.artwork_data.title + " by " + target_item.artwork_data.artist + " has increased in value.";

	return {'message': message}
}

var artExpertInteraction = function(npc_object) {
	var roll_reduction;

	var highest_item = items.findOne({'owner' : Meteor.userId(), 'status' : {$in : ['claimed', 'displayed', 'permanent']}, 'roll_count' : {$gt : 0}}, {sort: {'roll_count': -1}});

	if (highest_item == undefined)
		return {'message' : "You have met an art expert, but you don't currently own any works that can be improved. Try re-rolling painting attributes to improve a piece's ratings."};

	switch(npc_object.quality) {
		case 'bronze': roll_reduction = 1; break;
		case 'silver': roll_reduction = 2; break;
		case 'gold': roll_reduction = 3; break;
		case 'platinum': roll_reduction = 4; break;
		default: roll_reduction = 0; break;
	}

	if (isOwnGallery(npc_object)) {
		roll_reduction += 2;

		if (procUniqueAttribute(Meteor.userId(), "XP_FOR_ZERO_COUNTS")) {
			var zero_count_items = items.find({'owner' : Meteor.userId(), 'status' : 'displayed', 'roll_count' : 0}).count();
			for (var i=0; i<zero_count_items; i++) {
				addXPChunkPercentage(Meteor.userId(), .1);
			}
		}

		if (procUniqueAttribute(Meteor.userId(), "DONOR_REROLL_DEDUCTION_BONUS")) {
			if (npcs.findOne({'owner_id': Meteor.userId(), 'attribute_id': attributes.findOne({'npc_name': "Art Donor"})._id}) != undefined)
				roll_reduction *= 2;
		}
	}

	var new_count;
	if (highest_item.roll_count - roll_reduction < 0)
		new_count = 0;

	else new_count = highest_item.roll_count - roll_reduction;

	items.update(highest_item._id, {$set: {'roll_count' : Number(new_count)}});

	var message = "You have met an art expert who recently attended one of your events and was impressed by your collection. As a result, they have been spreading the word about your gallery. " + highest_item.artwork_data.title + " by " + highest_item.artwork_data.artist + " has had its roll count reduced to " + new_count + ".";

	return {'message': message}
}

var collectorInteraction = function(npc_object) {
	//TODO save interaction object to a DB, then return the id. This allows server-side verification that the offer was legitimate if the player accepts.
	var offer_multiplier;

	switch(npc_object.quality) {
		case 'bronze': offer_multiplier = 1; break;
		case 'silver': offer_multiplier = 1.1; break;
		case 'gold': offer_multiplier = 1.2; break;
		case 'platinum': offer_multiplier = 1.3; break;
		default: offer_multiplier = 0; break;
	}

	var random_claimed = selectRandomPainting({'owner': Meteor.userId(), 'status': "claimed", 'original': false, 'seasonal': {$ne: true}, 'lottery': {$in: [0, false]}});

	if (random_claimed) {
		if (isOwnGallery(npc_object)) {
			offer_multiplier *= 1.4;

			if (procUniqueAttribute(Meteor.userId(), "GOOD_CONDITION_COLLECTOR_BONUS") && random_claimed.condition > .8) {
				offer_multiplier += .7;
			}

			if (procUniqueAttribute(Meteor.userId(), "ART_COLLECTOR_ROLL_COUNT_BONUS") && random_claimed.roll_count == 0) {
				offer_multiplier += .7;
			}

			if (procUniqueAttribute(Meteor.userId(), "ART_COLLECTOR_SPECIAL_BONUS")) {
				if (random_claimed.foil || random_claimed.original || random_claimed.lottery || random_claimed.seasonal)
					offer_multiplier += 1;
			}

			if (procUniqueAttribute(Meteor.userId(), "COLLECTOR_DISPLAY_OFFER")) {
				var random_displayed = selectRandomPainting({'owner': Meteor.userId(), 'status': "displayed"});

				if (random_displayed) {
					var donation_amount = Math.floor((getItemValue(random_displayed._id, "display") * .2) * offer_multiplier);
					addFunds(Meteor.userId(), donation_amount);
					var message = "You have met an Art Collector, who was admiring " + random_displayed.artwork_data.title + " by " + random_displayed.artwork_data.artist + ", currently on display in your gallery. They offer you $" + getCommaSeparatedValue(donation_amount) + " for their appreciation of the piece, and insist that you keep and maintain it for the world to enjoy.";
					return {'message': message}
				}

			}
		}

		var offer = Math.floor(getItemValue(random_claimed._id, "display") * offer_multiplier);

		return {'type': "collector_bonus", 'offer': offer, 'item': random_claimed};
	}

	else {
		var message = "You have met an Art Collector that would love to add to their collection, but you don't seem to have any paintings available for donation. Art collectors will only ask for paintings that are not on display or in your permanent collection.";
		return {'message': message}
	}
}

var artDealerInteraction = function(npc_object) {
	var drop_count = 4;

	if (isOwnGallery(npc_object)) {
		drop_count += 2;

		if (procUniqueAttribute(Meteor.userId(), "BONUS_DEALER_DONOR")) {
			drop_count += 1;
		}
	}

	generateItems(Meteor.userId(), npc_object.quality, drop_count, "for_sale");

	var message = "You have met an Art Dealer who would like you to consider a few offers. Go to the store to view their inventory.";
	return {'message': message}
}

var galleryManagerInteraction = function(npc_object) {
	var extension_time = 20;
	var extension_multiplier;
		
	switch(npc_object.quality) {
		case 'bronze': extension_multiplier = 1; break;
		case 'silver': extension_multiplier = 1.2; break;
		case 'gold': extension_multiplier = 1.4; break;
		case 'platinum': extension_multiplier = 1.6; break;
		default: extension_multiplier = 0; break;
	}

	extension_time = Math.floor(extension_time * extension_multiplier);

	if (isOwnGallery(npc_object)) {
		var extended_ticket_count = 3;
		var extendable_tickets = gallery_tickets.find({'ticketholder': Meteor.userId()}).fetch();

		if (extendable_tickets.length > 0) {
			var selected = extendable_tickets.sort(function(first, second) {return Math.random() - Math.random()}).slice(0, extended_ticket_count);

			var owner_names = [];
			for (var i=0; i < selected.length; i++) {
				var current_expiration = moment(selected[i].expiration);
				var new_expiration = current_expiration.add(extension_time, 'minutes')._d.toISOString();
				gallery_tickets.update(selected[i]._id, {$set: {'expiration': new_expiration}});
				owner_names.push(Meteor.users.findOne(selected[i].gallery_owner).profile.screen_name)
			}

			var message = "You have met a gallery manager. Your access to the following galleries has been extended by " + extension_time + " minutes: " + owner_names.toString().replace(/,/g, ", ");
			return {'message': message};
		}

		else {
			var message = "You have met a gallery manager, but they are unable to extend your access to any galleries.";
			return {'message': message};
		}
	}

	else {
		var current_expiration = moment(gallery_tickets.findOne({'ticketholder': Meteor.userId(), 'gallery_owner': npc_object.owner_id}).expiration);
		var new_expiration = current_expiration.add(extension_time, 'minutes')._d.toISOString();
		gallery_tickets.update({'ticketholder': Meteor.userId(), 'gallery_owner': npc_object.owner_id}, {$set: {'expiration': new_expiration}});

		var message = "You have met a gallery manager. Your access to this gallery has been extended by " + extension_time + " minutes.";
		return {'message': message};
	}
}

var designerInteraction = function(npc_object) {
	var gallery_finish_count = gallery_finishes.find({'quality': npc_object.quality}).count();
	var random_index = Math.floor(Math.random() * gallery_finish_count);
	//random_index = 1; // for debugging
	var random_selection = gallery_finishes.findOne({'quality': npc_object.quality}, {skip: random_index});

	var user_object = Meteor.user();
	var category_string = (random_selection.type == "wall finish" ? "wall_finishes" : "floor_finishes");
	
	if (user_object.profile.gallery_finishes.owned[category_string][random_selection._id] == undefined) {
		var user_finish_object = {
			'filename': random_selection.filename,
			'saturation': 1,
			'xp_rating': .1
		}

		var set_object = {};
		var array_selector_string = "profile.gallery_finishes.owned." + (random_selection.type == "wall finish" ? "wall_finishes." : "floor_finishes.") + random_selection._id;
		set_object[array_selector_string] = user_finish_object;
		Meteor.users.update(Meteor.userId(), {$set: set_object});
		var message = "You have met a designer, who has provided you with a new finish for your gallery!";
		return {'message': message, 'type': "designer_bonus", 'filename': random_selection.filename};
	}

	//user already owns that finish,
	else if (user_object.profile.gallery_finishes.owned[category_string][random_selection._id].xp_rating < 1){
		var existing_xp_rating = user_object.profile.gallery_finishes.owned[category_string][random_selection._id].xp_rating;

		var xp_rating_increase = .1;

		if (isOwnGallery(npc_object))
			xp_rating_increase *= 1.5;

		var new_xp_rating = (existing_xp_rating + xp_rating_increase > 1 ? 1 : existing_xp_rating + xp_rating_increase)
		
		var finish_setter = {};
		var array_selector_string = "profile.gallery_finishes.owned." + category_string + "." + random_selection._id + ".xp_rating";
		finish_setter[array_selector_string] = new_xp_rating;
		Meteor.users.update(Meteor.userId(), {$set: finish_setter});
		var message = "You have met a designer. The XP rating of this finish has increased from " + Math.floor(existing_xp_rating * 100) + " to " + Math.floor(new_xp_rating * 100) + "!";
		return {'message': message, 'type': "designer_bonus", 'filename': random_selection.filename};
	}

	//finish xp_rating already maxed out, give xp
	else {
		var xp_chunk_percentage;

		switch(npc_object.quality) {
			case 'bronze' : xp_chunk_percentage = .3; break;
			case 'silver' : xp_chunk_percentage = .4; break;
			case 'gold' : xp_chunk_percentage = .5; break;
			case 'platinum' : xp_chunk_percentage = .6; break;
		};

		if (isOwnGallery(npc_object))
			xp_chunk_percentage *= own_gallery_amplifier;

		var xp_chunk = getXPChunk(Meteor.user().profile.level);
		var xp_won = Math.floor(xp_chunk * xp_chunk_percentage);

		var message = "You have met a designer, who is impressed by one of the finishes in your collection. You have earned " + getCommaSeparatedValue(xp_won) + "xp!";

		addXP(Meteor.userId(), xp_won);
		return {'message': message, 'type': "designer_bonus", 'filename': random_selection.filename};
	}
}

var generateTarget = function(default_target_count) {
	var target = [];

	for (var i=0; i<default_target_count; i++) {
		var rarity_rolled = JepLoot.catRoll(getSmartRarityMap(Meteor.user().profile.level, 0));

		if (rarity_rolled == "legendary" || rarity_rolled == "masterpiece")
			rarity_rolled = "rare";

		var rolled_id = getRandomArtworkIDFromRarity(rarity_rolled);

		while (target.indexOf(rolled_id) != -1) {
			rolled_id = getRandomArtworkIDFromRarity(rarity_rolled)
		}

		target.push(rolled_id);
	}

	return target;
}

var generateQuest = function(rarity, is_own_gallery) {
	var player_ratio = playerRatio(Meteor.user());
    var max_money = 200000 + (800000 * player_ratio);
    var player_level = Meteor.user().profile.level;

    var reward;

    //rarity = "legendary";
    //rarity = "masterpiece";

	switch(rarity) {
		case 'common' :
			reward = {
				'money': Math.floor(max_money * .4),
				'xp': Math.floor(getXPChunk(player_level) * .6),
				'item': undefined
			};
			break;

		case 'uncommon' : 
			reward = {
				'money': Math.floor(max_money * .6),
				'xp': Math.floor(getXPChunk(player_level) * .7),
				'item': undefined 
			};
			break;

		case 'rare' : 
			reward = {
				'money': Math.floor(max_money * .8),
				'xp': Math.floor(getXPChunk(player_level) * .8),
				'item': undefined 
			};
			break;

		case 'legendary' : 
			reward = {
				'money': Math.floor(max_money * 1),
				'xp': Math.floor(getXPChunk(player_level) * .9),
				'item': {
					'rarity': "legendary",
					'foil': false
				} 
			};
			break;

		case 'masterpiece' : 
			reward = {
				'money': Math.floor(max_money * 2),
				'xp': Math.floor(getXPChunk(player_level) * 1),
				'item': {
					'rarity': "legendary",
					'foil': true
				} 
			};
			break;

		default: return undefined;
	};

	var target_count = 3;
	if (is_own_gallery && procUniqueAttribute(Meteor.userId(), "QUEST_TARGET_REDUCTION") && npcs.findOne({'owner_id': Meteor.userId(), 'attribute_id': attributes.findOne({'npc_name': "Designer"})._id}) != undefined) {
		target_count--;
	}

	return {
		'owner_id': Meteor.userId(),
		'target': generateTarget(target_count),
		'reward': reward,
		'rarity': rarity
	}

}

var historianInteraction = function(npc_object) {
	var max_quest_count = 8;
	var quest_cap_bypass = isOwnGallery(npc_object) && procUniqueAttribute(Meteor.userId(), "QUEST_CAP_BYPASS");
	if (quests.find({'owner_id': Meteor.userId()}).count() >= max_quest_count && !quest_cap_bypass) {
		var message = "You have men an art historian who is looking for a few specific items, but you currently have too many tasks on your schedule to help them.";
		return {'type': undefined, 'message': message};
	}

	var map_amplifier;

	switch(npc_object.quality) {
        case 'bronze': map_amplifier = 0; break;
        case 'silver': map_amplifier = .2; break;
        case 'gold': map_amplifier = .4; break;
        case 'platinum': map_amplifier = .8; break;
        default: map_amplifier = 0; break;
    }

    var rarity_roll = JepLoot.catRoll(getSmartRarityMap(Meteor.user().profile.level, map_amplifier));

    var quest_object = generateQuest(rarity_roll, isOwnGallery(npc_object));

    quests.insert(quest_object);

    var message = "You have met an art historian who is looking for a few specific items and would like your help. Visit the quests area to see what they need and acquire the artwork listed to claim your reward.";

    return {'type': "historian_bonus", 'quest': quest_object};
}

var marketExpertInteraction = function(npc_object) {
	var user_object = Meteor.user();

	var market_expert_duration = 8; //minutes
	var market_expert_duration_extension = 3; // minutes
	var market_expert_rating = .75;
	var market_expert_rating_increase = .01;

	switch(npc_object.quality) {
		case 'bronze': 
			market_expert_duration += 2;
			market_expert_duration_extension += 2; 
			market_expert_rating += .01;
			market_expert_rating_increase += .01;
			break;
        case 'silver': 
			market_expert_duration += 3;
			market_expert_duration_extension += 3; 
			market_expert_rating += .02;
			market_expert_rating_increase += .02; 
			break;
        case 'gold': 
			market_expert_duration += 4;
			market_expert_duration_extension += 4; 
			market_expert_rating += .03;
			market_expert_rating_increase += .03;
			break;
        case 'platinum': 
			market_expert_duration += 5;
			market_expert_duration_extension += 5; 
			market_expert_rating += .04;
			market_expert_rating_increase += .04;
			break;
        default: break;
	}

	if (isOwnGallery(npc_object)) {
		market_expert_duration = Math.floor(market_expert_duration * 2.5);
		market_expert_duration_extension = Math.floor(market_expert_duration_extension * 2.5);
		market_expert_rating += .02;
		market_expert_rating_increase += .02;
	}

	var message;

	if (user_object.profile.market_expert.expiration < moment()._d.toISOString()) {
		var expiration_time = moment().add(market_expert_duration, 'minutes');
		Meteor.users.update(user_object._id, {$set: {
			'profile.market_expert.expiration': expiration_time._d.toISOString(), 
			'profile.market_expert.rating': market_expert_rating
		}});

		message = "You have met a market expert. They will help you identify in-demand items for the next " + market_expert_duration + " minutes (expires " + getTimeString(expiration_time) +  ") with " + Math.floor(market_expert_rating * 100) + "% accuracy.";
	}

	else {
		var new_expiration = moment(user_object.profile.market_expert.expiration).add(market_expert_duration_extension, 'minutes');
		Meteor.users.update(user_object._id, {$set: {
			'profile.market_expert.expiration': new_expiration._d.toISOString()
		}});

		if (user_object.profile.market_expert.rating == 1) {
			message = "You have met another market expert. Your access to market analysis has been extended by " + market_expert_duration_extension + " minutes (expires " + getTimeString(new_expiration) + "), and remains 100% accurate.";
		}

		else {
			var new_accuracy = user_object.profile.market_expert.rating + market_expert_rating_increase > 1 ? 1 : user_object.profile.market_expert.rating + market_expert_rating_increase;
			Meteor.users.update(user_object._id, {$set: { 'profile.market_expert.rating': new_accuracy}});

			message = "You have met another market expert. Your access to market analysis has been extended by " + market_expert_duration_extension + " minutes (expires " + getTimeString(new_expiration) + "), and is now " + Math.floor(new_accuracy * 100) + "% accurate.";
		}
	}

	return {'message': message};
}