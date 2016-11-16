getMaxExpansionSlots = function() {
	return 1000;
}

inventoryIsFull = function(user_object) {
	return items.find({
		'owner' : user_object._id, 
		'status' : {$nin: ['unclaimed', 'for_sale', 'won']}, 
		'original': {$ne: true},
		'vintage': {$ne: true}
	}).count() >= user_object.profile.inventory_cap + user_object.profile.expansion_slots + (user_object.profile.vintage_count * 2);
}