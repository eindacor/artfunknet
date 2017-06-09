marketingManagerInteraction = function(npc_object, player_interface) {
	var spawn_boost_time = ONE_MINUTE * 10;
	var extension_multiplier;
	var npc_spawn_chance;
	var npc_spawn_boost_coefficient = .5;
		
	switch(npc_object.quality) {
		case 'bronze': 
			extension_multiplier = 1; 
			npc_spawn_chance = .2;
			break;
		case 'silver': 
			extension_multiplier = 1.2; 
			npc_spawn_chance = .3;
			break;
		case 'gold': 
			extension_multiplier = 1.4; 
			npc_spawn_chance = .4;
			break;
		case 'platinum': 
			extension_multiplier = 1.6; 
			npc_spawn_chance = .5;
			break;
		default: 
			extension_multiplier = 0; 
			npc_spawn_chance = 0;
			break;
	}

	var extension_time = Math.floor(spawn_boost_time * extension_multiplier);

	var extended_ticket_count = 1;

	var previous_time = Meteor.user().profile.marketing_manager_spawn_boost_expiration;
	var extension_string = getNowISOString() > previous_time ? "the next " + Math.floor(extension_time / ONE_MINUTE) : Math.floor(extension_time / ONE_MINUTE) + " more";

	if (isOwnGallery(npc_object)) {
		npc_spawn_boost_coefficient = 1;
		var gallery_object;
		var npc_spawn_quality = "bronze";

		if (player_interface.procUniqueAttribute("DEALER_PLATINUM_MARKETING_SPAWN", "Art Dealer"))
			npc_spawn_quality = "platinum";

		if (player_interface.procUniqueAttribute("DONOR_PLATINUM_MARKETING_SPAWN", "Art Donor"))
			npc_spawn_quality = "platinum";

		if (player_interface.procUniqueAttribute("MARKETING_VISITOR_SPAWN_CHANCE_BOOST", "Gallery Manager")) {
			npc_spawn_chance += .4;
		}

		if (player_interface.procUniqueAttribute("MARKETING_PRESERVATIONIST_VISITOR_SPAWN", "Preservationist")) {
			gallery_object = galleries.findOne({'owner_id': npc_object.owner_id});
			createNPC(gallery_object, attributes.findOne({'npc_name': "Preservationist"})._id, NPC_SPAWN_FREQUENCY, npc_spawn_quality);
		}

		if (Math.random() < npc_spawn_chance) {			
			if (gallery_object == undefined)
				gallery_object = galleries.findOne({'owner_id': npc_object.owner_id});
			
			var filter = {'active': true, '_id': {'$ne': npc_object.attribute_id}};
			var attribute_count = attributes.find(filter).count();
			var random_index = Math.floor(Math.random() * attribute_count);
			var attribute_object = attributes.findOne(filter, {skip: random_index});

			createNPC(gallery_object, attribute_object._id, NPC_SPAWN_FREQUENCY, npc_spawn_quality);
		}
	}

	if (Meteor.user().profile.marketing_manager_spawn_boost_coefficient != undefined) {
		npc_spawn_boost_coefficient = Math.max(Meteor.user().profile.marketing_manager_spawn_boost_coefficient, npc_spawn_boost_coefficient);
	}

	var new_time = getNowISOString() > previous_time ? moment().add(extension_time, 'milliseconds')._d.toISOString() : moment(previous_time).add(extension_time, 'milliseconds')._d.toISOString();
	Meteor.users.update(Meteor.userId(), {$set: {'profile.marketing_manager_spawn_boost_expiration': new_time, 'profile.marketing_manager_spawn_boost_coefficient': npc_spawn_boost_coefficient}});
	player_interface.updateGalleryDetails();

	return {'message': "You have met a marketing manager, who has spread the word about your gallery. Your gallery will have a better chance of attracting visitors for " + extension_string + " minutes"}
}