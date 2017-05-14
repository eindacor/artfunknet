marketingManagerInteraction = function(npc_object) {
	var spawn_boost_time = ONE_MINUTE * 10;
	var extension_multiplier;
		
	switch(npc_object.quality) {
		case 'bronze': extension_multiplier = 1; break;
		case 'silver': extension_multiplier = 1.2; break;
		case 'gold': extension_multiplier = 1.4; break;
		case 'platinum': extension_multiplier = 1.6; break;
		default: extension_multiplier = 0; break;
	}

	var extension_time = Math.floor(spawn_boost_time * extension_multiplier);

	var extended_ticket_count = 1;

	var previous_time = Meteor.user().profile.marketing_manager_spawn_boost_expiration;
	var extension_string = getNowISOString() > previous_time ? "the next " + Math.floor(extension_time / ONE_MINUTE) : Math.floor(extension_time / ONE_MINUTE) + " more";
	console.log(previous_time);
	console.log(moment()._d.toISOString());

	if (isOwnGallery(npc_object)) {
		var new_npc_spawn_chance = .5;

		if (Math.random() < new_npc_spawn_chance) {
			var gallery_object = galleries.findOne({'owner_id': npc_object.owner_id});
			var filter = {'active': true, '_id': {'$ne': npc_object.attribute_id}};
			var attribute_count = attributes.find(filter).count();
			var random_index = Math.floor(Math.random() * attribute_count);
			var attribute_object = attributes.findOne(filter, {skip: random_index});
			createNPC(gallery_object, attribute_object._id, NPC_SPAWN_FREQUENCY, "bronze");
		}
	}

	console.log(extension_time);
	var new_time = getNowISOString() > previous_time ? moment().add(extension_time, 'milliseconds')._d.toISOString() : moment(previous_time).add(extension_time, 'milliseconds')._d.toISOString();
	console.log(new_time);
	Meteor.users.update(Meteor.userId(), {$set: {'profile.marketing_manager_spawn_boost_expiration': new_time}});

	return {'message': "You have met a marketing manager, who has spread the word about your gallery. Your gallery will have a better chance of attracting visitors for " + extension_string + " minutes"}
}