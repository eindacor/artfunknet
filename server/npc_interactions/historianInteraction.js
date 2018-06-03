var generateTarget = function(default_target_count) {
	var target = [];

	for (var i=0; i<default_target_count; i++) {
		var rarity_rolled = getRarityDropMapCache()[Meteor.user().profile.level].getRandom()

		if (rarity_rolled == "legendary" || rarity_rolled == "masterpiece")
			rarity_rolled = "rare";

		var rolled_if = getRandomArtworkIFFromRarity(rarity_rolled);

		while (target.indexOf(rolled_if.getId()) != -1) {
			rolled_if = getRandomArtworkIFFromRarity(rarity_rolled)
		}

		target.push(rolled_if.getId());
	}

	return target;
}

var generateQuest = function(rarity, is_own_gallery, player_interface) {
    var money = getAverageDropValue(Meteor.user().profile.level, 0) * 10;
    var player_level = Meteor.user().profile.level;

    var reward, reward_item, money_multiplier, xp_chunk_percentage;

	switch(rarity) {
		case 'common' :
			money_multiplier = 1;
			xp_chunk_percentage = 1.2;
			reward_item = undefined;
			break;

		case 'uncommon' : 
			money_multiplier = 1.2;
			xp_chunk_percentage = 1.4;
			reward_item = undefined;
			break;

		case 'rare' : 
			money_multiplier = 1.4;
			xp_chunk_percentage = 1.6;
			reward_item = undefined;
			break;

		case 'legendary' : 
			money_multiplier = 1.6;
			xp_chunk_percentage = 1.8;
			reward_item = {
				'rarity': "legendary",
				'foil': false
			} 
			break;

		case 'masterpiece' : 
			money_multiplier = 1.8;
			xp_chunk_percentage = 2;
			reward_item = {
				'rarity': "legendary",
				'foil': true
			} 
			break;

		default: return undefined;
	};

	reward = {
		'money': Math.floor(money * money_multiplier),
		'xp': Math.floor(getXPChunk(player_level) * xp_chunk_percentage),
		'xp_chunk_percentage': xp_chunk_percentage,
		'item': reward_item,
	}

	var target_count = 4;
	var min_requirement = 3;

	if (is_own_gallery) {
		if (player_interface.procUniqueAttribute("QUEST_TARGET_REDUCTION", "Marketing Manager")) {
			min_requirement--;
		}

		if (player_interface.procUniqueAttribute("QUEST_XP_BONUS", undefined)) {
			reward.xp = Math.floor(reward.xp * 1.5);
			reward.xp_chunk_percentage = Number((reward.xp_chunk_percentage * 1.5).toFixed(3));
		}

		if (player_interface.procUniqueAttribute("MARKET_EXPERT_QUEST_BONUS", undefined)) {
			//var auction_count = items.find({'owner': Meteor.userId(), 'status': "auctioned"}).count();
			var auction_count = Meteor.user().profile.auction_data.winning.length;
			reward.money = Math.floor(reward.money * (1 + (auction_count * .06)));
		}
	}

	return {
		'owner_id': Meteor.userId(),
		'target': generateTarget(target_count),
		'reward': reward,
		'rarity': rarity,
		'min_requirement': min_requirement
	}

}

historianInteraction = function(npc_object, player_interface) {
	try {

		if (!player_interface.canAcceptQuest(npc_object)) {
			var message = "You have met an art historian who is looking for a few specific items, but you currently have too many tasks on your schedule to help them.";
			return {'type': undefined, 'message': message};
		}
	
		var map_amplifier;
	
		// TODO do something with npc quality
		// switch(npc_object.quality) {
	 //        case 'bronze': map_amplifier = 0; break;
	 //        case 'silver': map_amplifier = .2; break;
	 //        case 'gold': map_amplifier = .4; break;
	 //        case 'platinum': map_amplifier = .8; break;
	 //        default: map_amplifier = 0; break;
		// }

		var rarity_roll = getRarityDropMapCache()[Meteor.user().profile.level].getRandom();
	
	    var quest_object = generateQuest(rarity_roll, isOwnGallery(npc_object), player_interface);
	    quests.insert(quest_object);
	
	    var message = "You have met an art historian who is looking for a few specific items and would like your help. Visit the jobs area to see what they need and acquire the artwork listed to claim your reward.";
	
	    return {'type': "historian_bonus", 'quest': quest_object};
	}
	
	catch(error) {
		var message = "error: " + error;
		return {'message': message};
	}
}