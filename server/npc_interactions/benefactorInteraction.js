benefactorInteraction = function(npc_object, player_interface) {
	var max_donation = getAverageDropValue(Meteor.user().profile.level, 0) * 6;
	
	var donation_amount;

	switch(npc_object.quality) {
		case 'bronze' : donation_amount = max_donation * .4; break;
		case 'silver' : donation_amount = max_donation * .6; break;
		case 'gold' : donation_amount = max_donation * .8; break;
		case 'platinum' : donation_amount = max_donation * 1; break;
	};

	// returns true if the player met the npc in his/her own gallery
	if (isOwnGallery(npc_object)) {
		donation_amount *= OWN_GALLERY_NPC_AMPLIFIER;

		if (player_interface.procUniqueAttribute("LONGEST_GALLERY_TICKET_BONUS", undefined)) {
			var longest_ticket = gallery_tickets.findOne({'ticketholder': Meteor.userId()}, {sort: {'expiration': -1}});
			if (longest_ticket) {
				var time_left = moment(longest_ticket.expiration) - moment();
				var hours_left = time_left / 3600000;
				//TODO scale to player level
				var bonus_amount = Math.min(Math.floor(hours_left * 200000), 1000000);

				donation_amount += bonus_amount;
			}
		}

		if (player_interface.procUniqueAttribute("BENEFACTOR_VISITOR_COUNT_BONUS", undefined)) {
			var multiplier = 1 + (npcs.find({'owner_id': Meteor.userId()}).count() * .1)
			donation_amount *= multiplier;
		}

		if (player_interface.procUniqueAttribute("BENEFACTOR_CONDITION_BONUS", undefined)) {
			var multiplier = 1 + (getFromCollection("benefactorInteraction", items, {'owner': Meteor.userId(), 'status': "displayed", 'condition': {$gt: .9}}).count() * .05);
			donation_amount *= multiplier;
		}
	}

	// adjust randomly to vary amount won
	var money_won = Math.floor(donation_amount + ((Math.random() * .1) * max_donation));

	var message = "You have met a benefactor who would like to make a donation. You have recieved $" + getCommaSeparatedValue(money_won) + "!";

	player_interface.addFunds("benefactor", money_won);
	// return {'message': message}
}