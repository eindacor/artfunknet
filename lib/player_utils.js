getMaxExpansionSlots = function() {
	return 24;
}

inventoryIsFull = function(user_object) {
	return items.find({'owner' : user_object._id, 'status' : {$nin: ['unclaimed', 'for_sale', 'won']}, 'original': {$ne: true}}).count() >= user_object.profile.inventory_cap + user_object.profile.expansion_slots;
}