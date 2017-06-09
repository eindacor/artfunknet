var getRandomItemForSale = function() {
	var tagged_items = items.find({'owner': Meteor.userId(), 'tags': {$in: ["for sale"]}, 'status': 'claimed'}).fetch();
	var random_index = Math.floor(Math.random() * tagged_items.length);
	return tagged_items[random_index];
}

collectorInteraction = function(npc_object, player_interface) {
	var message = undefined;
	var xp_offer = false;
	var xp_chunk_percentage;
	var quest_item_given = false;

	var offer_multiplier;

	switch(npc_object.quality) {
		case 'bronze': offer_multiplier = 2; break;
		case 'silver': offer_multiplier = 2.2; break;
		case 'gold': offer_multiplier = 2.4; break;
		case 'platinum': offer_multiplier = 2.6; break;
		default: offer_multiplier = 0; break;
	}

	var collector_target = getRandomItemForSale();

	if (collector_target) {
		var base_value = Math.floor(getItemObjectValueByType(collector_target, 'actual', Meteor.userId()));
		var base_chunk = .1 + (.2 * collector_target.level);
		var offer_bonus = 0;
		var standard_legendary_increment = .8;

		if (isOwnGallery(npc_object)) {
			offer_multiplier *= OWN_GALLERY_NPC_AMPLIFIER;

			xp_offer = player_interface.procUniqueAttribute("ART_COLLECTOR_XP_REWARD", "Art Enthusiast");
			xp_offer = false;

			if (collector_target.condition > .8 && player_interface.procUniqueAttribute("GOOD_CONDITION_COLLECTOR_BONUS", undefined))
				offer_multiplier += standard_legendary_increment;

			if (collector_target.roll_count <= 0 && player_interface.procUniqueAttribute("ART_COLLECTOR_ROLL_COUNT_BONUS", undefined))
				offer_multiplier += standard_legendary_increment;

			if ((collector_target.foil || collector_target.original || collector_target.lottery || collector_target.seasonal) && 
				player_interface.procUniqueAttribute("ART_COLLECTOR_SPECIAL_BONUS", undefined)) {
					offer_multiplier += standard_legendary_increment * 4;
			}

			if (player_interface.procUniqueAttribute("ART_COLLECTOR_AUCTION_BONUS", undefined)) {
				var highest_value = 0;
				var highest_level = 0;
				
				// find highest auction_min value for this player's auctions (must have a winning bid) as well as auctions they are winning
				auctions.find({'seller': Meteor.user().profile.screen_name}).forEach(function(auction_object) {
					if (Meteor.users.findOne({'profile.auction_data.winning': auction_object._id}) != undefined) {
						var item_object = items.findOne(auction_object.item_id);
						highest_value = Math.max(getItemObjectValueByType(item_object, 'auction_min', Meteor.userId()), highest_value);
						highest_level = Math.max(item_object.level, highest_level);
					}
				});

				auctions.find({'_id': {$in: Meteor.user().profile.auction_data.winning}}).forEach(function(auction_object) {
					var item_object = items.findOne(auction_object.item_id);
					highest_value = Math.max(getItemObjectValueByType(item_object, 'auction_min', Meteor.userId()), highest_value);
					highest_level = Math.max(item_object.level, highest_level);
				});

				if (!xp_offer)
					offer_bonus += Math.floor(highest_value * .5);

				else offer_bonus += (highest_level * .4)
			}

			var loot_data = getLootData();

			if (player_interface.procUniqueAttribute("COLLECTOR_FOR_SALE_OFFER", undefined)) {
				var multi_item_generator = {
			        'source': "COLLECTOR_FOR_SALE_OFFER",
			        'user_id': Meteor.userId(),
			        'quality': npc_object.quality,
			        'count': 2,
			        'status': "for_sale",
			        'foil_chance': loot_data.global_foil_chance,
			        'unlocked_chance': loot_data.global_unlocked_chance,
			        'misprint_chance': loot_data.global_misprint_chance,
			        'condition_min': 0, 
			        'level': 1
			    }

				generateItems(multi_item_generator);
			}

			if (Math.random() < .25 && player_interface.procUniqueAttribute("COLLECTOR_QUEST_ITEM", undefined)) {
                var quest_item_ids = [];
                quests.find({'owner_id': Meteor.userId()}).forEach(function(quest_object) {
                    var targets = quest_object.target;
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
                        'level': 1,
                        'foil_chance': loot_data.global_foil_chance,
                        'unlocked_chance': loot_data.global_unlocked_chance,
                        'seasonal': undefined,
                        'lottery': 0,
                        'original': false,
                        'misprint_chance': loot_data.global_misprint_chance,
                        'status': "unclaimed",
                        'condition_min': 0
                    }

                    generateItemFromArtworkID(item_generator);
                };
            };
		}

		var offer_amount;
		if (!xp_offer) {
			offer_amount = Math.floor((base_value * offer_multiplier) + offer_bonus);
			player_interface.addFunds("collector", offer_amount);
		}

		else {
			xp_chunk_percentage = (base_chunk * offer_multiplier) + offer_bonus;
			offer_amount = Math.floor(getXPChunk(Meteor.user().profile.level) * xp_chunk_percentage);
			player_interface.addXP(offer_amount);
            logXPChunkPercentage("ART_COLLECTOR_XP_REWARD", Number(xp_chunk_percentage.toFixed(3)));
		}

		var does_not_collect = isOwnGallery(npc_object) && Math.random() < .4 && player_interface.procUniqueAttribute("COLLECTOR_DOES_NOT_COLLECT", undefined);

		if (!does_not_collect) {
			removeItem(collector_target._id, "collector", undefined)
        }

		var interaction_object = {
        	'type': "collector_bonus", 
        	'item': collector_target, 
        	'message': message,
        	'does_not_collect': does_not_collect,
        	'offer_amount': offer_amount,
        	'xp_offer': xp_offer,
        };       

		return interaction_object;
	}

	else {
		message = "A collector wanders into your gallery, but can't find anything you're willing to sell. The two of you share a deep conversation about butterflies instead. To do business with collectors in the future, try adding the \"for sale\" tag to items in your inventory.";
		return {'message': message}
	}
}