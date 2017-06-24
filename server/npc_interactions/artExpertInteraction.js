artExpertInteraction = function(npc_object, player_interface) {
	var roll_reduction;

	switch(npc_object.quality) {
		case 'bronze': roll_reduction = 1; break;
		case 'silver': roll_reduction = 2; break;
		case 'gold': roll_reduction = 3; break;
		case 'platinum': roll_reduction = 4; break;
		default: roll_reduction = 0; break;
	}

	var roll_count_min = 0;

	if (isOwnGallery(npc_object)) {
		roll_reduction += 2;

		if (player_interface.procUniqueAttribute("XP_FOR_ZERO_COUNTS", undefined)) {
			var zero_count_items = items.find({'owner' : Meteor.userId(), 'status' : "displayed", 'roll_count' : {$lt: 1}}).count();
			for (var i=0; i<zero_count_items; i++) {
				player_interface.addXPChunkPercentage("XP_FOR_ZERO_COUNTS", .1, false);
			}
		}

		if (player_interface.procUniqueAttribute("DONOR_REROLL_DEDUCTION_BONUS", "Art Donor")) {
			roll_reduction *= 2;
		}

		if (player_interface.procUniqueAttribute("NEGATIVE_ROLL_COUNTS", undefined)) {
			roll_count_min = -5;
		}
	}

	var highest_item = getOneFromCollection("artExpertInteraction", items, {'owner' : Meteor.userId(), 'status' : {$in : ["claimed", "displayed"]}, 'roll_count' : {$gt : roll_count_min}}, {sort: {'roll_count': -1}});

	if (highest_item == undefined) {
		var display_count = items.find({'owner': player_interface.getId(), 'status': "displayed"}).count();
		if (display_count == 0)
			return {'message' : "You have met an art expert, but you have no items on display for them to discuss."};

		var random_index = Math.floor(Math.random() * display_count);
		var target = getOneFromCollection("artExpertInteraction", items, {'owner': player_interface.getId(), 'status': "displayed"}, {skip: random_index});
		var item_interface = new ItemIF(target);
		var unit_value = item_interface.getUnitValue();
		var random_modifier = .2 + (.2 * Math.random());
		var modified_value = unit_value * random_modifier;
		var knowledge_object = convertUnitValueToKnowledge(Math.max(Math.floor(modified_value), 2));
		player_interface.giveKnowledge(knowledge_object);
		return {
			'type': "art_expert_bonus",
			'item': target,
			'knowledge_object': knowledge_object
		}
	}

	var new_count;
	if (highest_item.roll_count - roll_reduction < roll_count_min)
		new_count = roll_count_min;

	else new_count = highest_item.roll_count - roll_reduction;

	var item_interface = new ItemIF(highest_item);
	//TODO update if roll counts effect value
	item_interface.updateItem({$set: {'roll_count' : Number(new_count)}}, true);

	var message = "You have met an art expert who recently attended one of your events and was impressed by your collection. As a result, they have been spreading the word about your gallery. " + highest_item.artwork_data.title + " by " + highest_item.artwork_data.artist + " has had its roll count reduced to " + new_count + ".";

	return {'message': message};
}