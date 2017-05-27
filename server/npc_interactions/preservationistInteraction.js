preservationistInteraction = function(npc_object) {
	var repair_amount;
	var target_item = undefined;
	var message = undefined;
	var conditions_maxed_bonus = undefined;
	var condition_cutoff = .9;

	switch(npc_object.quality) {
		case 'bronze': repair_amount = .08; break;
		case 'silver': repair_amount = .1; break;
		case 'gold': repair_amount = .12; break;
		case 'platinum': repair_amount = .14; break;
		default: repair_amount = 0; break;
	}

	if (isOwnGallery(npc_object)) {
		repair_amount *= OWN_GALLERY_NPC_AMPLIFIER;

		var select_highest = procUniqueAttribute(Meteor.userId(), "PRESERVATIONIST_HIGHEST", undefined);
		var sort_order = select_highest ? -1 : 1;
		
		target_item = items.findOne({'owner' : Meteor.userId(), 'status' : {$in : ['claimed', 'displayed', 'permanent']}, 'condition': {$lt: condition_cutoff}}, {sort: {'condition': sort_order}});

		// you have no repairable items < 90%, select an item at random
		if (target_item == undefined) {
			var target_count = items.find({'owner' : Meteor.userId(), 'status' : {$in : ['claimed', 'displayed', 'permanent']}}).count();
			var random_index = Math.floor(Math.random() * target_count);
			target_item = items.findOne({'owner' : Meteor.userId(), 'status' : {$in : ['claimed', 'displayed', 'permanent']}}, {skip: random_index});
		}

		conditions_maxed_bonus = 0.4;

		// B) If the preserved item already has a condition > 80, you earn money based on its value.
		if (target_item && target_item.condition > .8 && procUniqueAttribute(Meteor.userId(), "PRESERVATIONIST_CONDITION_BONUS", undefined)) {
			message = "You have met a preservationist, who is in awe of the pristine quality of your displayed works. He immediately notifies his rich uncle who gives you a hefty donation.";
			addFunds("PRESERVATIONIST_CONDITION_BONUS", Meteor.userId(), Math.min( Math.floor(getItemObjectValueByType(target_item, 'actual', Meteor.userId())), 500000) );
		}

		// C) If you meet a preservationist with an enthusiast present, they select an item in your permanent collection. If the item has an XP rating > 90, or a condition > 80, you earn XP. If it has neither, it's XP rating or condition is increased.
		if (procUniqueAttribute(Meteor.userId(), "PC_XP_RATING_BOOST", "Art Enthusiast")) {
			var random_permanent = selectRandomPainting({'owner': Meteor.userId(), 'status': "permanent"});

			if (random_permanent) {
				var criteria_met = false;
				if (random_permanent.condition > .8) {
					addXPChunkPercentage("PC_XP_RATING_BOOST - condition", Meteor.userId(), .3);
					criteria_met = true;
				}

				if (random_permanent.level > 5) {
					addXPChunkPercentage("PC_XP_RATING_BOOST - level", Meteor.userId(), .3);
					criteria_met = true;
				}

				if (!criteria_met) {
					if (Math.random() < .5 && random_permanent.level < 5) {
						updateItem(random_permanent._id, {$inc: {'level': 1}});
					}

					else {
						updateItem(random_permanent._id, {$set: {'condition': Math.min( Number((random_permanent.condition + .02).toFixed(2)), 1 )}});
					}
				}
			}

			if (message)
				message = message + " They then comment on the quality of your permanent collection, and how well-kept it is.";

			else message = "You have met a preservationist who comments on the quality of your permanent collection, and how well-kept it is."
		}
	}

	else {
		target_item = items.findOne({'owner' : Meteor.userId(), 'status' : {$in : ['claimed', 'displayed', 'permanent']}, 'condition': {$lt: condition_cutoff}}, {sort: {'condition': 1}});

		// you have no repairable items < 90%, select an item at random
		if (target_item == undefined) {
			var target_count = items.find({'owner' : Meteor.userId(), 'status' : {$in : ['claimed', 'displayed', 'permanent']}}).count();
			var random_index = Math.floor(Math.random() * target_count);
			target_item = items.findOne({'owner' : Meteor.userId(), 'status' : {$in : ['claimed', 'displayed', 'permanent']}}, {skip: random_index});
		}

		conditions_maxed_bonus = 0.2;
	}

	if (target_item == undefined) {
		if (message)
			message += " Unfortunately, they don't see any items in your collection they can improve.";

		else message = "You have met a preservationist, but you don't currently own any works that can be refurbished.";

		return {'message' : message};
	}

	// if condition is > .9, all of your targets had a condition > .9, so it picked a target at random
	if (target_item.condition > condition_cutoff) {
		if (message)
			message += " Unfortunately, they don't see any items in your collection they can improve. Then can only offer their gratitude.";

		else message = "You have met a preservationist, but you don't currently own any works that can be refurbished. Then can only offer their gratitude.";

		addXPChunkPercentage("preservationist (all items maxed)", Meteor.userId(), conditions_maxed_bonus);

		return {'message' : message};
	}

	var new_condition = Math.min(repair_amount + target_item.condition, 1)

	updateItem(target_item._id, {$set: {'condition' : Number(new_condition)}});

	if (message)
		message = message + " Finally, they offer to refurbish one of your pieces. " + target_item.artwork_data.title + " by " + target_item.artwork_data.artist + " has increased in value.";
	
	else message = "You have met a preservationist who has offered to refurbish one of your pieces. " + target_item.artwork_data.title + " by " + target_item.artwork_data.artist + " has increased in value.";

	return {'message': message}
}