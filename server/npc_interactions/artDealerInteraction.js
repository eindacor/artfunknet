artDealerInteraction = function(npc_object, player_interface) {
	var drop_count = 4;
	var loot_data = getLootData();
	var foil_chance = loot_data.global_foil_chance;
	var level = 1;

	if (isOwnGallery(npc_object)) {
		drop_count += 2;

		if (player_interface.procUniqueAttribute("BONUS_DEALER_DONOR", undefined)) {
			drop_count += 1;
		}

		if (player_interface.getUserObject().profile.auction_data.winning.length > 0 && player_interface.procUniqueAttribute("AUCTION_COUNT_DEALER_BONUS", "Auctioneer")) {
			var auction_count = player_interface.getUserObject().profile.auction_data.winning.length;
			drop_count += Math.min(Math.ceil(auction_count / 4), 3);
		}

		if (player_interface.procUniqueAttribute("DEALER_FOIL_BONUS", undefined)) {
			foil_chance *= 2;
		}

		if ((items.findOne({'owner': player_interface.getId(), 'status': "displayed", 'condition': {$lt: .7}}) == undefined) && player_interface.procUniqueAttribute("DISPLAY_CONDITION_DEALER_BOOST", undefined)) {
			drop_count += 1;
		}

		if (player_interface.procUniqueAttribute("DEALER_LEVEL_MIN", undefined)) {
            level = 5;
        }

		if (player_interface.procUniqueAttribute("DEALER_QUEST_ITEM_CHANCE", undefined)) {
			var quest_item_ids = [];
			quests.find({'owner_id': player_interface.getId()}).forEach(function(quest_object) {
				var targets = quest_object.target;
				for (var i=0; i<targets.length; i++) {
					if (quest_item_ids.indexOf(targets[i]) == -1)
						quest_item_ids.push(targets[i]);
				}
			});

			if (Math.random() < .2 && quest_item_ids.length) {
				var random_index = Math.floor(Math.random() * quest_item_ids.length);
				drop_count -= 1;

				var item_generator = {
                    'source': "dealer",
                    'user_id': player_interface.getId(),
                    'artwork_id': quest_item_ids[random_index],
                    'condition': undefined,
                    'level': level,
                    'foil_chance': foil_chance,
                    'unlocked_chance': loot_data.global_unlocked_chance,
                    'seasonal': undefined,
                    'lottery': 0,
                    'original': false,
                    'misprint_chance': loot_data.global_misprint_chance,
                    'status': "for_sale",
                    'condition_min': 0
                }

				generateItemFromArtworkID(item_generator);
			}
		}
	}

	var multi_item_generator = {
        'source': "dealer",
        'user_id': player_interface.getId(),
        'quality': npc_object.quality,
        'count': drop_count,
        'status': "for_sale",
        'foil_chance': foil_chance,
        'unlocked_chance': loot_data.global_unlocked_chance,
        'misprint_chance': loot_data.global_misprint_chance,
        'condition_min': 0,
        'level': level
    }

	generateItems(multi_item_generator);

	var message = "You have met an Art Dealer who would like you to consider a few offers. Go to the store to view their inventory.";
	// return {'message': message}
}