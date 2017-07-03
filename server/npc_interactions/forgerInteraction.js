forgerInteraction = function(npc_object, player_interface) {
	var contract_count;

	switch(npc_object.quality) {
		case 'bronze': contract_count = 1; break;
		case 'silver': contract_count = 2; break;
		case 'gold': contract_count = 3; break;
		case 'platinum': contract_count = 4; break;
		default: contract_count = 0; break;
	}

	player_interface.giveForgeryContracts(contract_count);

	var message = "You have met a Forger who has offered to make counterfeit copies of items from your archive.";
	return {'message': message}
}