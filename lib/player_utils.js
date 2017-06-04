getMaxExpansionSlots = function() {
	return 1000;
}

getMasterpieceDisplayLimit = function(user_object) {
	return user_object.profile.vintage_count + 1;
}

inventoryIsFull = function(user_object) {
	return items.find({
		'owner' : user_object._id, 
		'status' : {$nin: ['unclaimed', 'for_sale', 'won']}, 
		'original': {$ne: true},
		'vintage': {$ne: true}
	}).count() >= user_object.profile.inventory_cap + user_object.profile.expansion_slots + (user_object.profile.vintage_count * 2);
}

playerHasNotOwned = function(user_object, item_id) {
	var item_interface = new ItemIF(item_id);
	var checklists = user_object.profile.checklists;

	var item_types = item_interface.getTypes();
	var item_rarity = item_interface.getRarity();
	var artwork_id = item_interface.getArtworkId();

	if (checklists.owned[item_rarity][artwork_id] === undefined)
		return true;

	var checklist_object = checklists.owned[item_rarity][artwork_id];

	if (item_interface.isFoil()) {
		if (checklist_object.foil == undefined || !checklist_object.foil)
			return true;
	}

	if (item_interface.isLottery()) {
		if (checklist_object.lottery == undefined || !checklist_object.lottery)
			return true;
	}

	if (item_interface.isSeasonal()) {
		if (checklist_object.seasonal == undefined || !checklist_object.seasonal)
			return true;
	}

	if (item_interface.isUnlocked()) {
		if (checklist_object.unlocked == undefined || !checklist_object.unlocked)
			return true;
	}

	if (item_interface.isOriginal()) {
		if (checklist_object.original == undefined || !checklist_object.original)
			return true;
	}

	if (item_interface.isVintage()) {
		if (checklist_object.vintage == undefined || !checklist_object.vintage)
			return true;
	}

	return false;
}