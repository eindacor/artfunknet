var max_level = 50;

getNPCQuality = function(player_level) {
	var max_roll_value = 100;
	var min_roll_value = 0;

	var low_roll_from_level = Math.floor((player_level / max_level) * 100);

	var npc_quality_map = {
		'bronze' : max_roll_value,
		'silver' : Math.floor(low_roll_from_level + ((max_roll_value - low_roll_from_level) * .67)),
		'gold' : Math.floor(low_roll_from_level + ((max_roll_value - low_roll_from_level) * .33)),
		'platinum' : low_roll_from_level
	}

	return JepLoot.catRoll(npc_quality_map);
}

createNPC = function(gallery_object, attribute_id, duration) {
    var npc_object = {
        'quality' : getNPCQuality(Meteor.users.findOne(gallery_object.owner_id).profile.level),
        'attribute_id' : attribute_id,
        'owner_id' : gallery_object.owner_id,
        'expiration' : moment().add(duration, 'milliseconds')._d.toISOString(),
        'players_met' : [],
        'icon' : attributes.findOne(attribute_id).icon
    }

    npcs.insert(npc_object, function(error, inserted_id) {
        if (error)
            console.log(error.message)
    })
}

Meteor.methods({
	'interactWithNPC' : function(npc_id) {
		var npc_object = npcs.findOne(npc_id);

		if (npc_object == undefined || npc_object.players_met.indexOf(Meteor.userId()) != -1)
			return undefined;

		var attribute_object = attributes.findOne(npc_object.attribute_id);		
		var npc_interaction = {};

		switch(attribute_object.title) {
			case "benefactor_bonus": 
				npc_interaction = benefactorInteraction(npc_object);
				break;
			case "donor_bonus": 
				npc_interaction = donorInteraction(npc_object);
				break;
			case "preservationist_bonus": 
				npc_interaction = preservationistInteraction(npc_object);
				break;
			case "gallery_manager":
				npc_interaction = galleryManagerInteraction(npc_object);
				break;
			case "set_xp_visitors": //DISABLE - give portion of set xp to visitors
				npc_interaction = {'message': "You have been given 0xp for sets in this permanent collection."};
				break;
			case "xp_visitors": //DISABLE - give portion of collection xp to visitors
				npc_interaction = {'message': "You have been given 0xp for works in this permanent collection."};
				break;
			case "auctioneer_bonus": //DISABLE - provide access to private bot auction
				npc_interaction = {'message': "You have met an auctioneer."};
				break;
			case "dealer_bonus":
				npc_interaction = artDealerInteraction(npc_object);
				break;
			case "collector_bonus":
				npc_interaction = collectorInteraction(npc_object);
				break;
			case "designer_bonus": //DISABLE - give discount to store
				npc_interaction = designerInteraction(npc_object);
				break;
			case "forger_bonus": //DISABLE - give access to black market
				npc_interaction = {'message': "You have met an art forger."};
				break;
			case "art_expert_bonus":
				npc_interaction = artExpertInteraction(npc_object);
				break;
			case "historian_bonus": //DISABLE - quiz players for xp
				npc_interaction = {'message': "You have met an historian."};
				break;
			case "market_expert_bonus": //DISABLE - analyze auction house and return deals
				npc_interaction = {'message': "You have met a market expert."};
				break;
			case "entry_fee_reduction_members": //DISABLE = reduce entry fee for members
			case "set_xp_members": //DISABLE - give portion of set xp to members
			case "xp_members": //DISABLE - give portion of xp to members
			case "xp_per_visitor": //DISABLE - increase xp gain per visitor
			case "money_per_visitor": //DISABLE - increase money earned for entry fee
			case "bonus_money": //DISABLE - bonus money from feature paintings
			case "enthusiast_bonus": //give xp
				npc_interaction = enthusiastInteraction(npc_object);
				break;
			default: return undefined;
		}

		npcs.update(npc_id, {$push: {'players_met' : Meteor.userId()}});
		return npc_interaction;
	}
})

var own_gallery_amplifier = 1.75;

var isOwnGallery = function(npc_object) {
	return npc_object.owner_id == Meteor.userId();
}

var enthusiastInteraction = function(npc_object) {
	var xp_chunk_percentage;

	switch(npc_object.quality) {
		case 'bronze' : xp_chunk_percentage = .2; break;
		case 'silver' : xp_chunk_percentage = .3; break;
		case 'gold' : xp_chunk_percentage = .4; break;
		case 'platinum' : xp_chunk_percentage = .5; break;
	};

	if (isOwnGallery(npc_object))
		xp_chunk_percentage *= own_gallery_amplifier;

	var xp_chunk = getXPChunk(Meteor.user().profile.level);
	var xp_won = Math.floor(xp_chunk * xp_chunk_percentage);

	var message = "You have met an art enthusiast who recently attended one of your gallery's events. They rave about your collection, and thank you for the experience. You have earned " + getCommaSeparatedValue(xp_won) + "xp!";

	addXP(Meteor.userId(), xp_won);
	return {'message': message}
}

var benefactorInteraction = function(npc_object) {
	var max_donation = 50000 + (250000 * playerRatio(Meteor.user()));
	var donation_amount;

	switch(npc_object.quality) {
		case 'bronze' : donation_amount = max_donation * .4; break;
		case 'silver' : donation_amount = max_donation * .6; break;
		case 'gold' : donation_amount = max_donation * .8; break;
		case 'platinum' : donation_amount = max_donation * 1; break;
	};

	if (isOwnGallery(npc_object))
		donation_amount *= own_gallery_amplifier;

	var money_won = Math.floor(donation_amount + ((Math.random() * .1) * max_donation));

	var message = "You have met a benefactor who would like to make a donation. You have recieved $" + getCommaSeparatedValue(money_won) + "!";

	addFunds(Meteor.userId(), money_won);
	return {'message': message}
}

var donorInteraction = function(npc_object) {
	var drop_count = 2;

	if (isOwnGallery(npc_object))
		drop_count += 1;

	generateItems(Meteor.userId(), npc_object.quality, drop_count);

	var message = "You have met a donor who would like to contribute to your collection. You may claim your gift in the loot area.";

	return {'message': message}
}

var preservationistInteraction = function(npc_object) {
	var repair_amount;

	var lowest_item = items.findOne({'owner' : Meteor.userId(), 'status' : {$in : ['claimed', 'displayed', 'permanent']}}, {sort: {'condition': 1}});

	if (lowest_item == undefined || lowest_item.condition > .9)
		return {'message' : "You have met a preservationist, but you don't currently own any works that can be refurbished"};

	switch(npc_object.quality) {
		case 'bronze': repair_amount = .08; break;
		case 'silver': repair_amount = .1; break;
		case 'gold': repair_amount = .12; break;
		case 'platinum': repair_amount = .14; break;
		default: repair_amount = 0; break;
	}

	if (isOwnGallery(npc_object))
		repair_amount *= own_gallery_amplifier;

	var artwork_object = artworks.findOne(lowest_item.artwork_id);

	var new_condition;
	if (repair_amount + lowest_item.condition > 1)
		new_condition = 1;

	else new_condition = repair_amount + lowest_item.condition;

	items.update(lowest_item._id, {$set: {'condition' : Number(new_condition)}}, function(error) {
        if (error)
            console.log(error.message);

        else calcMVP(Meteor.userId());
    });

	var message = "You have met a preservationist who has offered to refurbish one of your pieces. " + artwork_object.title + " by " + artwork_object.artist + " has increased in value.";

	return {'message': message}
}

var artExpertInteraction = function(npc_object) {
	var roll_reduction;

	var highest_item = items.findOne({'owner' : Meteor.userId(), 'status' : {$in : ['claimed', 'displayed', 'permanent']}, 'roll_count' : {$gt : 0}}, {sort: {'roll_count': -1}});

	if (highest_item == undefined)
		return {'message' : "You have met an art expert, but you don't currently own any works that can be improved. Try re-rolling painting attributes to improve a piece's ratings."};

	switch(npc_object.quality) {
		case 'bronze': roll_reduction = 1; break;
		case 'silver': roll_reduction = 2; break;
		case 'gold': roll_reduction = 3; break;
		case 'platinum': roll_reduction = 4; break;
		default: roll_reduction = 0; break;
	}

	if (isOwnGallery(npc_object))
		roll_reduction += 2;

	var artwork_object = artworks.findOne(highest_item.artwork_id);

	var new_count;
	if (highest_item.roll_count - roll_reduction < 0)
		new_count = 0;

	else new_count = highest_item.roll_count - roll_reduction;

	items.update(highest_item._id, {$set: {'roll_count' : Number(new_count)}});

	var message = "You have met an art expert who recently attended one of your events and was impressed by your collection. As a result, they have been spreading the word about your gallery. " + artwork_object.title + " by " + artwork_object.artist + " has had its roll count reduced to " + new_count + ".";

	return {'message': message}
}

var collectorInteraction = function(npc_object) {
	//TODO save interaction object to a DB, then return the id. This allows server-side verification that the offer was legitimate if the player accepts.
	var offer_multiplier;

	switch(npc_object.quality) {
		case 'bronze': offer_multiplier = 1.2; break;
		case 'silver': offer_multiplier = 1.4; break;
		case 'gold': offer_multiplier = 1.6; break;
		case 'platinum': offer_multiplier = 1.8; break;
		default: offer_multiplier = 0; break;
	}

	if (isOwnGallery(npc_object))
		offer_multiplier *= own_gallery_amplifier;

	var random_claimed = selectRandomPainting({'owner': Meteor.userId(), 'status': "claimed"});

	if (random_claimed) {
		var offer = Math.floor(getItemValue(random_claimed._id, "actual") * offer_multiplier);
		return {'type': "collector_bonus", 'offer': offer, 'item': random_claimed};
	}

	else {
		var message = "You have met an Art Collector that would love to add to their collection, but you don't seem to have any paintings available for donation. Art collectors will only ask for paintings that are not on display or in your permanent collection.";
		return {'message': message}
	}
}

var artDealerInteraction = function(npc_object) {
	var drop_count = 4;

	if (isOwnGallery(npc_object))
		drop_count += 2;

	generateItemsForSale(Meteor.userId(), npc_object.quality, drop_count);

	var message = "You have met an Art Dealer who would like you to consider a few offers. Go to the store to view their inventory.";
	return {'message': message}
}

var galleryManagerInteraction = function(npc_object) {
	var extension_time;
	// extension_time must be > ticket expiration check (5)
	if (isOwnGallery(npc_object))
		extension_time = 20;

	else extension_time = 20;

	var extension_multiplier;
		
	switch(npc_object.quality) {
		case 'bronze': extension_multiplier = 1; break;
		case 'silver': extension_multiplier = 1.2; break;
		case 'gold': extension_multiplier = 1.4; break;
		case 'platinum': extension_multiplier = 1.6; break;
		default: extension_multiplier = 0; break;
	}

	extension_time = Math.floor(extension_time * extension_multiplier);

	if (isOwnGallery(npc_object)) {
		var gallery_tickets = Meteor.user().profile.gallery_tickets;
		if (gallery_tickets.length != 0) {		
			var gallery_count = 2;
			var galleries_extended = [];
			while (galleries_extended.length < gallery_count && gallery_tickets.length > 0) {
				var random_index = Math.floor(Math.random() * gallery_tickets.length)
				galleries_extended.push(gallery_tickets[random_index]);
				gallery_tickets.splice(random_index, 1);
			}
	
			var owner_names = [];
			for (var i=0; i < galleries_extended.length; i++) {
				owner_names.push(Meteor.users.findOne(galleries_extended[i].owner_id).profile.screen_name)
				var current_expiration = moment(galleries_extended[i].expiration);
				var new_expiration = current_expiration.add(extension_time, 'minutes')._d.toISOString();
				var gallery_id = galleries_extended[i].owner_id;
	
				Meteor.users.update({'_id': Meteor.userId(), 'profile.gallery_tickets.owner_id' : gallery_id}, 
					{$set: {'profile.gallery_tickets.$.expiration': new_expiration, 'profile.gallery_tickets.$.unique_id': new Mongo.ObjectID()._str }})
			}
	
			var message = "You have met a gallery manager. Your access to the following galleries has been extended by " + extension_time + " minutes: " + owner_names.toString().replace(/,/g, ", ");
			return {'message': message};
		}

		else {
			var message = "You have met a gallery manager, but they are unable to extend your access to any galleries.";
			return {'message': message};
		}
	}

	else {
		var gallery_tickets = Meteor.user().profile.gallery_tickets;
		var new_expiration;

		for (var i=0; i < gallery_tickets.length; i++) {
			if (gallery_tickets[i].owner_id == npc_object.owner_id) {
				var current_expiration = moment(gallery_tickets[i].expiration);
				var new_expiration = current_expiration.add(extension_time, 'minutes')._d.toISOString();
				break;
			}
		}

		Meteor.users.update({'_id': Meteor.userId(), 'profile.gallery_tickets.owner_id' : npc_object.owner_id}, 
				{$set: {'profile.gallery_tickets.$.expiration': new_expiration, 'profile.gallery_tickets.$.unique_id': new Mongo.ObjectID()._str }});

		var message = "You have met a gallery manager. Your access to this gallery has been extended by " + extension_time + " minutes.";
		return {'message': message};
	}
}

var designerInteraction = function(npc_object) {
	var gallery_finish_count = gallery_finishes.find({'quality': npc_object.quality}).count();
	var random_index = Math.floor(Math.random() * gallery_finish_count);
	//random_index = 1; // for debugging
	var random_selection = gallery_finishes.findOne({'quality': npc_object.quality}, {skip: random_index});

	var user_object = Meteor.user();
	var category_string = (random_selection.type == "wall finish" ? "wall_finishes" : "floor_finishes");
	
	if (user_object.profile.gallery_finishes.owned[category_string][random_selection._id] == undefined) {
		var user_finish_object = {
			'filename': random_selection.filename,
			'saturation': 1,
			'xp_rating': .1
		}

		var set_object = {};
		var array_selector_string = "profile.gallery_finishes.owned." + (random_selection.type == "wall finish" ? "wall_finishes." : "floor_finishes.") + random_selection._id;
		set_object[array_selector_string] = user_finish_object;
		Meteor.users.update(Meteor.userId(), {$set: set_object});
		var message = "You have met a designer, who has provided you with a new finish for your gallery!";
		return {'message': message, 'type': "designer_bonus", 'filename': random_selection.filename};
	}

	//user already owns that finish,
	else if (user_object.profile.gallery_finishes.owned[category_string][random_selection._id].xp_rating < 1){
		var existing_xp_rating = user_object.profile.gallery_finishes.owned[category_string][random_selection._id].xp_rating;

		var xp_rating_increase = .02;

		if (isOwnGallery(npc_object))
			xp_rating_increase *= 2;

		var new_xp_rating = (existing_xp_rating + xp_rating_increase > 1 ? 1 : existing_xp_rating + xp_rating_increase)
		
		var finish_setter = {};
		var array_selector_string = "profile.gallery_finishes.owned." + category_string + "." + random_selection._id + ".xp_rating";
		finish_setter[array_selector_string] = new_xp_rating;
		Meteor.users.update(Meteor.userId(), {$set: finish_setter});
		var message = "You have met a designer. The XP rating of this finish has increased from " + Math.floor(existing_xp_rating * 100) + " to " + Math.floor(new_xp_rating * 100) + "!";
		return {'message': message, 'type': "designer_bonus", 'filename': random_selection.filename};
	}

	//finish xp_rating already maxed out, give xp
	else {
		var xp_chunk_percentage;

		switch(npc_object.quality) {
			case 'bronze' : xp_chunk_percentage = .3; break;
			case 'silver' : xp_chunk_percentage = .4; break;
			case 'gold' : xp_chunk_percentage = .5; break;
			case 'platinum' : xp_chunk_percentage = .6; break;
		};

		if (isOwnGallery(npc_object))
			xp_chunk_percentage *= own_gallery_amplifier;

		var xp_chunk = getXPChunk(Meteor.user().profile.level);
		var xp_won = Math.floor(xp_chunk * xp_chunk_percentage);

		var message = "You have met a designer, who is impressed by one of the finishes in your collection. You have earned " + getCommaSeparatedValue(xp_won) + "xp!";

		addXP(Meteor.userId(), xp_won);
		return {'message': message, 'type': "designer_bonus", 'filename': random_selection.filename};
	}
}