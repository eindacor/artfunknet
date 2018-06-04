donorInteraction = function(npc_object, player_interface) {
	var drop_count = 1;
	var foil_chance = getLootData().global_foil_chance;
	var condition_min = 0;
	var level = 1;	

	if (isOwnGallery(npc_object)) {
		drop_count += 1;

		if (player_interface.procUniqueAttribute("BONUS_DEALER_DONOR", undefined)) {
			drop_count += 1;
		}

		if (player_interface.procUniqueAttribute("DONOR_AUCTIONEER_TRADE", "Auctioneer")) {
			drop_count -= 1;
		}

		if (player_interface.procUniqueAttribute("DONOR_BAD_REPUTATION_BONUS", undefined)) {
			var inverse_current_reputation = 1 - player_interface.getReputation();
			drop_count += Math.floor((inverse_current_reputation / .15));
		}

		if (player_interface.procUniqueAttribute("DONOR_CONDITION_MIN", undefined)) {
			condition_min = .8;
		}

		if (player_interface.procUniqueAttribute("DONOR_LEVEL_MIN", undefined)) {
			level = 5;
		}

		if (Math.random() < .2 && player_interface.procUniqueAttribute("DONOR_QUEST_ITEM_CHANCE", undefined)) {
			var quest_item_ids = [];
			quests.find({'owner_id': Meteor.userId()}).forEach(function(db_object) {
				var targets = db_object.target;
				for (var i=0; i<targets.length; i++) {
					if (quest_item_ids.indexOf(targets[i]) == -1)
						quest_item_ids.push(targets[i]);
				}
			});

			if (quest_item_ids.length) {
				var random_index = Math.floor(Math.random() * quest_item_ids.length);
				drop_count -= 1;
			
				var item_generator = {
                    'source': "donor",
                    'artwork_interface': new ArtworkIF(quest_item_ids[random_index]),
                    'level': level,
                    'foil_chance': foil_chance,
                    'status': "unclaimed",
                    'condition_min': condition_min
                }

				ITEM_GENERATOR.generateSingle(item_generator, player_interface);
			}
		}
	}

	var multi_item_generator = {
        'source': "dealer",
        'count': drop_count,
        'status': "unclaimed",
        'foil_chance': foil_chance,
        'level': level,
        'condition_min': condition_min,
        'rarity_map': getRarityMapWithAmplifier(player_interface.getPlayerLevel(), getMapAmplifierFromNPC(npc_object))
    }

	ITEM_GENERATOR.generateMultiple(multi_item_generator, player_interface);
}