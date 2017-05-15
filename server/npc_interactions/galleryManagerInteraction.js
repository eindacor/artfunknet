galleryManagerInteraction = function(npc_object) {
	var extension_time = 20;
	var extension_multiplier;
		
	switch(npc_object.quality) {
		case 'bronze': extension_multiplier = 1; break;
		case 'silver': extension_multiplier = 1.2; break;
		case 'gold': extension_multiplier = 1.4; break;
		case 'platinum': extension_multiplier = 1.6; break;
		default: extension_multiplier = 0; break;
	}

	extension_time = Math.floor(extension_time * extension_multiplier);

	var extended_ticket_count = 1;

	if (isOwnGallery(npc_object)) {
		extended_ticket_count += 2;
	}

	var extendable_tickets = gallery_tickets.find({'ticketholder': Meteor.userId()}).fetch();

	if (extendable_tickets.length > 0) {
		var selected = extendable_tickets.sort(function(first, second) {return Math.random() - Math.random()}).slice(0, extended_ticket_count);

		var owner_names = [];
		for (var i=0; i < selected.length; i++) {
			var current_expiration = moment(selected[i].expiration);
			var new_expiration = current_expiration.add(extension_time, 'minutes')._d.toISOString();
			gallery_tickets.update(selected[i]._id, {$set: {'expiration': new_expiration}});
			owner_names.push(Meteor.users.findOne(selected[i].gallery_owner).profile.screen_name)
		}

		var message = "You have met a gallery manager. Your access to the following galleries has been extended by " + extension_time + " minutes: " + owner_names.toString().replace(/,/g, ", ");
		return {'message': message};
	}

	else {
		var message = "You have met a gallery manager, but they are unable to extend your access to any galleries.";
		return {'message': message};
	}
}