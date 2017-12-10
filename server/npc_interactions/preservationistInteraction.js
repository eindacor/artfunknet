preservationistInteraction = function(npc_object, player_interface) {
	var repair_amount;
	var target_item = undefined;
	var message = undefined;
	var display_chance = undefined;

	switch(npc_object.quality) {
		case 'bronze': 
			repair_amount = .08; 
			display_chance = .2;
			break;
		case 'silver': 
			repair_amount = .1; 
			display_chance = .25;
			break;
		case 'gold': 
			repair_amount = .12; 
			display_chance = .30;
			break;
		case 'platinum': 
			repair_amount = .14; 
			display_chance = .35;
			break;
		default: repair_amount = 0; break;
	}

	var display_query = {'owner': player_interface.getId(), 'status': 'displayed', 'condition': {$lt: 1}};
	var claimed_query = {'owner': player_interface.getId(), 'status': "claimed", 'condition': {$lt: 1}};

	var target_display = Math.random() < display_chance;

	var query = target_display ? display_query : claimed_query;
	var backup_query = target_display ? claimed_query : display_query;

	var force_own_gallery = !isOwnGallery(npc_object) && player_interface.procUniqueAttribute("PRESERVATIONIST_REWARD_BONUS", undefined);
	if (isOwnGallery(npc_object) || force_own_gallery) {
		repair_amount *= OWN_GALLERY_NPC_AMPLIFIER;		
	}

	target_item = items.findOne(query, {sort: {'condition': 1}});

	if (target_item == undefined) {
		target_item = items.findOne(backup_query, {sort: {'condition': 1}});
	}

	if (target_item == undefined) {
		message = "You have met a preservationist, but you don't currently own any works that can be refurbished.";
		return {'message' : message};
	}

	var old_condition = target_item.condition;
	var new_condition = Number(Math.min(repair_amount + old_condition, 1).toFixed(2));

	var actual_repaired_amount = Math.floor((new_condition - old_condition) * 100);

	var target_item_interface = new ItemIF(target_item);
	target_item_interface.updateItem({$set: {'condition' : new_condition}}, false);

	message = "You have met a preservationist who has offered to refurbish one of your pieces. " + target_item.artwork_data.title + " by " + target_item.artwork_data.artist + " now has a condition of " + Math.floor(new_condition * 100) + "% (+" + Math.floor(repair_amount * 100) + "%).";
	var html = 'You have met a preservationist who has offered to refurbish one of your pieces. <span class="' + target_item.artwork_data.rarity + '">' + target_item.artwork_data.title + '</span> by <span class="af-color">' + target_item.artwork_data.artist + '</span> now has a condition of ' + Math.floor(new_condition * 100) + '% (<span class="green-text">+' + actual_repaired_amount + '%</span>).';
	return {
		'message': message,
		'html': html
	}
}