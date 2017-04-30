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

canQuickSell = function(user_object, item_id) {
	//TODO add sought check
	var item_wrapper = new itemWrapper(item_id);

	var item_types = item_wrapper.getTypes();

	var qso = user_object.profile.settings.quick_sell_options;
	if (!qso.standard && item_types.indexOf("standard") != -1)
		return false;

	if (!qso.foil && item_types.indexOf("foil") != -1)
		return false;

	if (!qso.seasonal && item_types.indexOf("seasonal") != -1)
		return false;

	if (!qso.unlocked && item_types.indexOf("unlocked") != -1)
		return false;

	if (!qso.legendary && item_types.indexOf("legendary") != -1)
		return false;

	if (!qso.original && item_types.indexOf("original") != -1)
		return false;

	if (!qso.lottery && item_types.indexOf("lottery") != -1)
		return false;

	if (!qso.vintage && item_types.indexOf("vintage") != -1)
		return false;

	if (!qso.unfound && playerHasNotOwned(user_object, item_id))
		return false;

	if (!qso.quest_items) {
		var item_is_quest_item = quests.findOne({'owner_id': user_object._id, 'target': {$in: [item_wrapper.item_object.artwork_id]}}) != undefined;
		var user_does_not_own = items.findOne({'_id': item_id, 'owner': user_object._id}) == undefined;
		if (item_is_quest_item && user_does_not_own)
			return false;
	}
	
	return true;
}

playerHasNotOwned = function(user_object, item_id) {
	var item_wrapper = new itemWrapper(item_id);
	var checklists = user_object.profile.checklists;

	var item_types = item_wrapper.getTypes();
	var item_rarity = item_wrapper.getRarity();
	var artwork_id = item_wrapper.getArtworkId();

	if (checklists.owned[item_rarity][artwork_id] === undefined)
		return true;

	var checklist_object = checklists.owned[item_rarity][artwork_id];

	if (item_wrapper.itemIsFoil()) {
		if (checklist_object.foil == undefined || !checklist_object.foil)
			return true;
	}

	if (item_wrapper.itemIsLottery()) {
		if (checklist_object.lottery == undefined || !checklist_object.lottery)
			return true;
	}

	if (item_wrapper.itemIsSeasonal()) {
		if (checklist_object.seasonal == undefined || !checklist_object.seasonal)
			return true;
	}

	if (item_wrapper.itemIsUnlocked()) {
		if (checklist_object.unlocked == undefined || !checklist_object.unlocked)
			return true;
	}

	if (item_wrapper.itemIsOriginal()) {
		if (checklist_object.original == undefined || !checklist_object.original)
			return true;
	}

	if (item_wrapper.itemIsVintage()) {
		if (checklist_object.vintage == undefined || !checklist_object.vintage)
			return true;
	}

	return false;
}