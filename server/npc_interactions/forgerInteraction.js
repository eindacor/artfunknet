forgerInteraction = function(npc_object, player_interface) {
	var contract_count = 1;

	// switch(npc_object.quality) {
	// 	case 'bronze': contract_count = 1; break;
	// 	case 'silver': contract_count = 2; break;
	// 	case 'gold': contract_count = 3; break;
	// 	case 'platinum': contract_count = 4; break;
	// 	default: contract_count = 0; break;
	// }

	var message;

	if (forgery_contracts.find({'owner_id': player_interface.getId()}).count() < player_interface.getUserObject().profile.forgery_contract_cap) {
		player_interface.giveForgeryContracts(contract_count, npc_object);
		message = "You have met a Forger who has offered to make counterfeit copies of items from your archive.";
	}

	else {
		message = "You have met a Forger, but you're unable to take any new forgery contracts at this time.";
	}

	if (isOwnGallery(npc_object) && player_interface.procUniqueAttribute("FORGER_DONATION", undefined)) {
		var multi_item_generator = {
	        'source': "forger donation",
	        'count': 2,
	        'status': "unclaimed",
	        'map_amplifier': getMapAmplifierFromNPC(npc_object),    
	        'forgery': true,
	        'foil_chance': getLootData().global_foil_chance * 2,
	        'unlocked_chance': getLootData().global_unlocked_chance * 2,
	        'seasonal_amplifier': 2
	    }

		ITEM_GENERATOR.generateMultiple(multi_item_generator, player_interface);
	}

	return {'message': message}
}