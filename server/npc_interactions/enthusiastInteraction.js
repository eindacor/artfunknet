enthusiastInteraction = function(npc_object, player_interface) {
	var xp_chunk_percentage;

	switch(npc_object.quality) {
		case 'bronze' : xp_chunk_percentage = .2; break;
		case 'silver' : xp_chunk_percentage = .3; break;
		case 'gold' : xp_chunk_percentage = .4; break;
		case 'platinum' : xp_chunk_percentage = .5; break;
	};

	if (isOwnGallery(npc_object)) {
		xp_chunk_percentage *= OWN_GALLERY_NPC_AMPLIFIER;

		if (player_interface.procUniqueAttribute("ENTHUSIAST_VISITOR_COUNT_BONUS", undefined)) {
			var multiplier = 1 + (npcs.find({'owner_id': Meteor.userId()}).count() * .05)
			xp_chunk_percentage *= multiplier;
		}
	}

	var xp_chunk = getXPChunk(Meteor.user().profile.level);
	var xp_won = Math.floor(xp_chunk * xp_chunk_percentage);

	var message = "You have met an art enthusiast who recently attended one of your gallery's events. They rave about your collection, and thank you for the experience. You have earned " + getCommaSeparatedValue(xp_won) + "xp!";

	player_interface.addXP(xp_won, !isOwnGallery(npc_object));
	logXPChunkPercentage("enthusiast", xp_chunk_percentage);
}