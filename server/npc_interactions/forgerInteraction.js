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

	return {'message': message}
}