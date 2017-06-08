preservationistInteraction = function(npc_object, player_interface) {
	var repair_amount;
	var target_item = undefined;
	var message = undefined;

	switch(npc_object.quality) {
		case 'bronze': repair_amount = .08; break;
		case 'silver': repair_amount = .1; break;
		case 'gold': repair_amount = .12; break;
		case 'platinum': repair_amount = .14; break;
		default: repair_amount = 0; break;
	}

	var force_own_gallery = !isOwnGallery(npc_object) && procUniqueAttribute(Meteor.userId(), "PRESERVATIONIST_REWARD_BONUS", undefined);
	if (isOwnGallery(npc_object) || force_own_gallery) {
		repair_amount *= OWN_GALLERY_NPC_AMPLIFIER;		
	}

	target_item = items.findOne({'owner' : Meteor.userId(), 'status' : "repairing", 'condition': {$lt: 1}}, {sort: {'condition': 1}});

	if (target_item == undefined && items.find({'owner' : Meteor.userId(), 'status' : "repairing"}).count() == player_interface.getUserObject().profile.repairing_cap) {
		var target_count = items.find({'owner' : Meteor.userId(), 'status' : "claimed"}).count();
		var random_index = Math.floor(Math.random() * target_count);
		target_item = items.findOne({'owner' : Meteor.userId(), 'status' : "claimed"}, {skip: random_index});
	}

	if (target_item == undefined) {
		message = "You have met a preservationist, but you don't currently own any works that can be refurbished.";
		return {'message' : message};
	}

	var new_condition = Math.min(repair_amount + target_item.condition, 1)

	var target_item_interface = new ItemIF(target_item);
	target_item_interface.updateItem({$set: {'condition' : Number(new_condition.toFixed(2))}}, false);

	message = "You have met a preservationist who has offered to refurbish one of your pieces. " + target_item.artwork_data.title + " by " + target_item.artwork_data.artist + " has increased in value.";
	return {'message': message}
}