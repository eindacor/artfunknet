artDealerInteraction = function(npc_object, player_interface) {
	var drop_count = 4;
	var foil_chance = getLootData().global_foil_chance;
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

		if ((items.findOne({'owner': player_interface.getId(), 'status': "displayed", 'condition': {$lt: .7}}) == undefined) && player_interface.procUniqueAttribute("DISPLAY_CONDITION_DEALER_BOOST", undefined)) {
			drop_count += 1;
		}

		if (player_interface.procUniqueAttribute("DEALER_LEVEL_MIN", undefined)) {
            level = 3;
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
                    'artwork_interface': new ArtworkIF(quest_item_ids[random_index]),
                    'level': level,
                    'foil_chance': foil_chance,
                    'status': "for_sale"
                }

                ITEM_GENERATOR.generateSingle(item_generator, player_interface);
			}
		}
	}

	var multi_item_generator = {
        'source': "dealer",
        'count': drop_count,
        'status': "for_sale",
        'map_amplifier': getMapAmplifierFromNPC(npc_object), 
        'foil_chance': foil_chance,
        'level': level
    }

	ITEM_GENERATOR.generateMultiple(multi_item_generator, player_interface);

	var message = "You have met an Art Dealer who would like you to consider a few offers. Go to the store to view their inventory.";
	// return {'message': message}
}