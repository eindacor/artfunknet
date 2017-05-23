PlayerIF = function(user_id) {
	var user_object = Meteor.users.findOne(user_id);

	if (user_object == undefined) {
		throw "invalid user: " + user_id;
	}

	this.getId = function() {
		return user_id;
	}

	this.getBankBalance = function() {
		return user_object.profile.bank_balance;
	}

	this.getPlayerLevel = function() {
		return user_object.profile.level;
	}

	this.getUserObject = function() {
		return user_object;
	}

	this.isRecentlyActive = function() {
		var recent_cutoff = ONE_DAY * 30;
		var last_npc_met = user_object.profile.last_npc_met;
		var now = moment()._d.toISOString();
		if (last_npc_met == undefined) {
			Meteor.users.update(user_id, {$set: {'profile.last_npc_met': now}})
			return true;
		}

		var time_passed = moment(now) - moment(last_npc_met);
		return time_passed < recent_cutoff;
	}

	this.getKnowledge = function() {
		return user_object.profile.knowledge;
	}

	this.giveKnowledge = function(knowledge_object) {
		var keys = Object.keys(knowledge_object);
		var inc_object = {};
		for (var i=0; i<keys.length; i++) {
			var amount = knowledge_object[keys[i]];
			var inc_string = 'profile.knowledge.' + keys[i];
			inc_object[inc_string] = amount;
		}
		Meteor.users.update({'_id': user_id}, {$inc: inc_object});
	}

	this.giveKnowledgeByUnits = function(units) {
		this.giveKnowledge(convertUnitCostToKnowledge(units));
	}

	this.getQuickDiscardableItemIds = function() {
	    var item_ids = [];

	    items.find({
	        'owner': user_id,
	        'status': {$in: ["unclaimed", "won"]}, 
	    }).forEach(function(item_object) {
	        var permissions = getPlayerItemPermissions(user_id, item_object._id);
	        if (permissions.canQuickDiscard()) {
	            item_ids.push(item_object._id);
	        }
	    });

	    return item_ids;
	}

	this.canTurnInQuest = function(quest_id) {
		var quest_object = quests.findOne(quest_id);
		if (quest_object == undefined || quest_object.target == undefined || quest_object.target.length == 0)
			return false;

		if (quest_object.owner_id != user_id)
			return false;

		var targets_found = 0;
		for (var i=0; i<quest_object.target.length; i++) {
			if (items.findOne({'artwork_id': quest_object.target[i], 'owner': user_id, 'status': {$nin: ['unclaimed', 'for_sale', 'won']}}) != undefined)
				targets_found++;
		}

		return targets_found >= quest_object.min_requirement;
	}

	this.turnInQuest = function(quest_id, sell, donate) {
		if (sell && donate)
			return false;

		if (this.canTurnInQuest(quest_id)) {
            var quest_object = quests.findOne(quest_id);

            var base_xp = quest_object.reward.xp;
            var xp_recieved = base_xp;
            var unique_targets_found = [];
            var unique_specials_found = [];

            var give_knowledge = procUniqueAttribute(user_id, "KNOWLEDGE_FOR_QUESTS", undefined);

            items.find({'owner': user_id, 'status': {$nin: ['unclaimed', 'for_sale', 'won']}, 'artwork_id': {$in: quest_object.target}}).forEach(function(item_object) {
                if (unique_targets_found.indexOf(item_object.artwork_id) == -1) {
                    unique_targets_found.push(item_object.artwork_id);
                    if (give_knowledge) {
                        var item_reader = new ItemReader(item_object._id);
                        var knowledge_object = item_reader.getDonationReward();  
                        var nested_player_interface = new PlayerIF(item_object.owner);             
                        nested_player_interface.giveKnowledge(knowledge_object);
                    }
                }

                if (unique_specials_found.indexOf(item_object.artwork_id) == -1 && (item_object.foil || item_object.original || item_object.vintage))
                    unique_specials_found.push(item_object.artwork_id);
            });

            var target_differential = unique_targets_found.length - quest_object.min_requirement;
            xp_recieved += Math.floor(base_xp * target_differential * 0.4);
            var special_count = unique_specials_found.length;
            xp_recieved += Math.floor(base_xp * special_count * 0.2);

            addXP(user_id, xp_recieved);
            logXPChunkPercentage("quest", quest_object.reward.xp_chunk_percentage + (special_count * 0.3) + (target_differential * 0.5));
            addFunds("quest", user_id, quest_object.reward.money);

            Meteor.users.update({'_id': user_id}, {$inc: {'profile.completed_quests': 1}});

            if (quest_object.reward.item != undefined) {
                var rarity = quest_object.reward.item.rarity;
                var count = artworks.find({'_id': {$nin: getLootData().seasonal_items}, 'rarity': rarity}).count();
                var random_index = Math.floor(Math.random() * count);
                var random_artwork_id = artworks.findOne({'_id': {$nin: getLootData().seasonal_items}, 'rarity': rarity}, {skip: random_index})._id;

                var loot_data = getLootData();

                var item_generator = {
                    'source': "quest",
                    'user_id': user_id,
                    'artwork_id': random_artwork_id,
                    'condition': undefined,
                    'level': 1,
                    'foil_chance': quest_object.reward.item.foil ? 1 : loot_data.global_foil_chance,
                    'unlocked_chance': loot_data.global_unlocked_chance,
                    'seasonal': undefined,
                    'lottery': 0,
                    'original': false,
                    'misprint_chance': loot_data.global_misprint_chance,
                    'status': "unclaimed",
                    'condition_min': 0
                }

                generateItemFromArtworkID(item_generator);
            }

            if (procUniqueAttribute(user_id, "QUEST_TARGET_CONDITION_INCREASE", undefined)) {
                updateItemsBySelector({'owner': user_id, 'status': {$nin: ['unclaimed', 'for_sale', 'won']}, 'artwork_id': {$in: quest_object.target}}, {$set: {'condition': .9}});
            }

            if (sell || donate) {
	            var quest_targets = items.find({'owner': user_id, 'status': {$nin: ['unclaimed', 'for_sale', 'won']}, 'artwork_id': {$in: quest_object.target}}).fetch();
	            for (var i=0; i<quest_targets.length; i++) {
	            	// check to verify item isn't part of multiple quests
	            	var artwork_id = quest_targets[i].artwork_id;
	            	if (quests.find({'owner_id': user_id, 'target': {$in: [artwork_id]}}).count() > 1) {
	            		continue;
	            	}

	            	var player_item_interface = new PlayerItemIF(user_id, quest_targets[i]._id);
	                if (sell) {
	                	player_item_interface.sell();
	                }

	                else if (donate) {
	                	player_item_interface.donate();
	                }
	            }
	        }

            quests.remove(quest_id);
        }
	}

	this.cancelQuest = function(quest_id) {
		var quest_object = quests.findOne(quest_id);
        if (quest_object && quest_object.owner_id == user_id)
            quests.remove(quest_id);
	}
}