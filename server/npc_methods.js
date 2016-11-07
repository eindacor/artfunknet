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

createNPC = function(gallery_object, attribute_id, duration, npc_quality) {
    var npc_object = {
        'quality' : npc_quality,
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
		if (!canMeetNPC(npc_id))
			return {'message': "you can't do this anymore!"};

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
				npc_interaction = historianInteraction(npc_object);
				break;
			case "auctioneer_bonus": //DISABLE - analyze auction house and return deals
				npc_interaction = auctioneerInteraction(npc_object);
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

	if (isOwnGallery(npc_object)) {
		xp_chunk_percentage *= own_gallery_amplifier;

		if (procUniqueAttribute(Meteor.userId(), "ENTHUSIAST_DAILY_DROP_REDUCTION", undefined)) {
			var drop_reduced = moment(Meteor.user().profile.last_drop).add(-5, "minutes")._d.toISOString();
			Meteor.users.update(Meteor.userId(), {$set: {'profile.last_drop': drop_reduced}});
		}
	}

	var xp_chunk = getXPChunk(Meteor.user().profile.level);
	var xp_won = Math.floor(xp_chunk * xp_chunk_percentage);

	var message = "You have met an art enthusiast who recently attended one of your gallery's events. They rave about your collection, and thank you for the experience. You have earned " + getCommaSeparatedValue(xp_won) + "xp!";

	addXP(Meteor.userId(), xp_won);
	logXPChunkPercentage("enthusiast", xp_chunk_percentage);
	return {'message': message}
}

var benefactorInteraction = function(npc_object) {
	var max_donation = getAverageDropValue(Meteor.user().profile.level, 0) * 2;
	
	var donation_amount;

	switch(npc_object.quality) {
		case 'bronze' : donation_amount = max_donation * .4; break;
		case 'silver' : donation_amount = max_donation * .6; break;
		case 'gold' : donation_amount = max_donation * .8; break;
		case 'platinum' : donation_amount = max_donation * 1; break;
	};

	// returns true if the player met the npc in his/her own gallery
	if (isOwnGallery(npc_object)) {
		donation_amount *= own_gallery_amplifier;

		if (procUniqueAttribute(Meteor.userId(), "GALLERY_FINISH_BENEFACTOR_BONUS", undefined)) {
			var floor_finishes = Meteor.user().profile.gallery_finishes.owned.floor_finishes;
			var floor_finish_rating_total = 0;
			var floor_finish_keys = Object.keys(floor_finishes);
			for (var i=0; i<floor_finish_keys.length; i++) {
				floor_finish_rating_total += floor_finishes[floor_finish_keys[i]].xp_rating;
			}

			var floor_finish_average = floor_finish_rating_total / floor_finish_keys.length;

			var wall_finishes = Meteor.user().profile.gallery_finishes.owned.wall_finishes;
			var wall_finish_rating_total = 0;
			var wall_finish_keys = Object.keys(wall_finishes);
			for (var i=0; i<wall_finish_keys.length; i++) {
				wall_finish_rating_total += wall_finishes[wall_finish_keys[i]].xp_rating;
			}

			var wall_finish_average = wall_finish_rating_total / wall_finish_keys.length;

			var total_average = (wall_finish_average + floor_finish_average) / 2;
			donation_amount += getAverageDropValue(Meteor.user().profile.level, total_average * total_average);
		}

		if (procUniqueAttribute(Meteor.userId(), "LONGEST_GALLERY_TICKET_BONUS", undefined)) {
			var longest_ticket = gallery_tickets.findOne({'ticketholder': Meteor.userId()}, {sort: {'expiration': -1}});
			if (longest_ticket) {
				var time_left = moment(longest_ticket.expiration) - moment();
				var hours_left = time_left / 3600000;
				var bonus_amount = Math.floor(hours_left * 500000);

				if (bonus_amount > 3000000)
					bonus_amount = 3000000;

				donation_amount += bonus_amount;
			}
		}
	}

	// adjust randomly to vary amount won
	var money_won = Math.floor(donation_amount + ((Math.random() * .1) * max_donation));

	var message = "You have met a benefactor who would like to make a donation. You have recieved $" + getCommaSeparatedValue(money_won) + "!";

	addFunds("benefactor", Meteor.userId(), money_won);
	return {'message': message}
}

var donorInteraction = function(npc_object) {
	var drop_count = 2;
	var foil_chance = getLootData().global_foil_chance;
	var condition_min = 0;
	var min_xp_rating = 0;

	if (isOwnGallery(npc_object)) {
		drop_count += 1;

		if (procUniqueAttribute(Meteor.userId(), "BONUS_DEALER_DONOR", undefined)) {
			drop_count += 1;
		}

		if (procUniqueAttribute(Meteor.userId(), "DONOR_FOIL_BONUS", undefined)) {
			foil_chance *= 2;
		}

		if (procUniqueAttribute(Meteor.userId(), "DONOR_CONDITION_MIN", undefined)) {
			condition_min = .8;
		}

		if (procUniqueAttribute(Meteor.userId(), "DONOR_XP_RATING_MIN", undefined)) {
			min_xp_rating = .8;
		}

		if (procUniqueAttribute(Meteor.userId(), "DONOR_DROP_QUALITY_BOOST", undefined)) {
			npc_object.quality = "platinum";
		}

		if (procUniqueAttribute(Meteor.userId(), "DONOR_QUEST_ITEM_CHANCE", undefined) && Math.random() < .2) {
			var quest_item_ids = [];
			quests.find({'owner_id': Meteor.userId()}).forEach(function(db_object) {
				var targets = db_object.target;
				for (var i=0; i<targets.length; i++) {
					if (quest_item_ids.indexOf(targets[i]) == -1)
						quest_item_ids.push(targets[i]);
				}
			});

			if (quest_item_ids.length) {
				var random_index = Math.floor(Math.random() * quest_item_ids.length);
				drop_count -= 1;

				var item_generator = {
                    'source': "donor",
                    'user_id': Meteor.userId(),
                    'artwork_id': quest_item_ids[random_index],
                    'condition': undefined,
                    'xp_rating': undefined,
                    'foil_chance': foil_chance,
                    'seasonal': undefined,
                    'lottery': 0,
                    'original': false,
                    'misprint_chance': getLootData().global_misprint_chance,
                    'status': "unclaimed",
                    'xp_rating_min': min_xp_rating,
                    'condition_min': condition_min
                }

				generateItemFromArtworkID(item_generator);
			}
		}
	}

	var multi_item_generator = {
        'source': "donor",
        'user_id': Meteor.userId(),
        'quality': npc_object.quality,
        'count': drop_count,
        'status': "unclaimed",
        'foil_chance': foil_chance,
        'misprint_chance': getLootData().global_misprint_chance,
        'xp_rating_min': min_xp_rating,
        'condition_min': condition_min
    }

	generateItems(multi_item_generator);

	var message = "You have met a donor who would like to contribute to your collection. You may claim your gift in the loot area.";

	return {'message': message}
}

var preservationistInteraction = function(npc_object) {
	var repair_amount;
	var target_item = undefined;
	var message = undefined;
	var conditions_maxed_bonus = undefined;

	switch(npc_object.quality) {
		case 'bronze': repair_amount = .08; break;
		case 'silver': repair_amount = .1; break;
		case 'gold': repair_amount = .12; break;
		case 'platinum': repair_amount = .14; break;
		default: repair_amount = 0; break;
	}

	if (isOwnGallery(npc_object)) {
		repair_amount *= own_gallery_amplifier;

		// A) Preservationists now target the item with the highest condition (below 90%). If all items have a condition greater than 90, they select the lowest.
		if (procUniqueAttribute(Meteor.userId(), "PRESERVATIONIST_HIGHEST", undefined))
			target_item = items.findOne({'owner' : Meteor.userId(), 'status' : {$in : ['claimed', 'displayed', 'permanent']}, 'condition': {$lt: .9}}, {sort: {'condition': -1}});

		if (target_item == undefined) 
			target_item = items.findOne({'owner' : Meteor.userId(), 'status' : {$in : ['claimed', 'displayed', 'permanent']}}, {sort: {'condition': 1}});

		// B) If the preserved item already has a condition > 80, you earn money based on its value.
		if (target_item && procUniqueAttribute(Meteor.userId(), "PRESERVATIONIST_CONDITION_BONUS", undefined) && target_item.condition > .8) {
			message = "You have met a preservationist, who is in awe of the pristine quality of your displayed works. He immediately notifies his rich uncle who gives you a hefty donation.";
			addFunds("PRESERVATIONIST_CONDITION_BONUS", Meteor.userId(), Math.min( Math.floor(getItemObjectValue(target_item, "display") * .1), 100000) );
		}

		// C) If you meet a preservationist with a designer present, the XP rating of your currently equipped finishes is increased. Finishes with a 100 rating give XP.
		if (procUniqueAttribute(Meteor.userId(), "PRESERVATIONIST_FINISH_BOOST", "Designer")) {
			var increase_amount = .04;
			var user_object = Meteor.user();
			var current_wall = user_object.profile.gallery_finishes.active.wall_finish;
			var current_floor = user_object.profile.gallery_finishes.active.floor_finish;
			var current_wall_rating = user_object.profile.gallery_finishes.owned.wall_finishes[current_wall].xp_rating;
			var current_floor_rating = user_object.profile.gallery_finishes.owned.floor_finishes[current_floor].xp_rating;

			var wall_maxed = current_wall_rating > .99;
			if (wall_maxed)
				addXPChunkPercentage("PRESERVATIONIST_FINISH_BOOST", Meteor.userId(), .3);

			var floor_maxed = current_floor_rating > .99;
			if (floor_maxed)
				addXPChunkPercentage("PRESERVATIONIST_FINISH_BOOST", Meteor.userId(), .3);

			var setter = {};
			var wall_setter_string = undefined;
			var floor_setter_string = undefined;

			if (!wall_maxed) {
				wall_setter_string = "profile.gallery_finishes.owned.wall_finishes." + current_wall + ".xp_rating";
				setter[wall_setter_string] = Math.min( Number((current_wall_rating + increase_amount).toFixed(2)), 1);
			}

			if (!floor_maxed) {
				floor_setter_string = "profile.gallery_finishes.owned.floor_finishes." + current_floor + ".xp_rating";
				setter[floor_setter_string] = Math.min( Number((current_floor_rating + increase_amount).toFixed(2)), 1);
			}

			if ((wall_setter_string != undefined && setter[wall_setter_string] != undefined) ||
			 	(floor_setter_string != undefined && setter[floor_setter_string] != undefined)) {
				Meteor.users.update(Meteor.userId(), {$set: setter});
			}

			if (message)
				message = message + " He also marvels at your finishes, smelling your walls and gently caressing your floor.";

			else message = "You have met a preservationist who marvels at your finishes, smelling your walls and gently caressing your floor.";
		}

		// D) If you meet a preservationist with an enthusiast present, they select an item in your permanent collection. If the item has an XP rating > 90, or a condition > 80, you earn XP. If it has neither, it's XP rating or condition is increased.
		if (procUniqueAttribute(Meteor.userId(), "PC_XP_RATING_BOOST", "Art Enthusiast")) {
			var random_permanent = selectRandomPainting({'owner': Meteor.userId(), 'status': "permanent"});

			if (random_permanent) {
				var criteria_met = false;
				if (random_permanent.condition > .8) {
					addXPChunkPercentage("PC_XP_RATING_BOOST - condition", Meteor.userId(), .3);
					criteria_met = true;
				}

				if (random_permanent.xp_rating > .9) {
					addXPChunkPercentage("PC_XP_RATING_BOOST - xp rating", Meteor.userId(), .3);
					criteria_met = true;
				}

				if (!criteria_met) {
					if (Math.random() < .5)
						items.update(random_permanent._id, {$set: {'xp_rating': Math.min( Number((random_permanent.xp_rating + .01).toFixed(2)), 1 )}});

					else items.update(random_permanent._id, {$set: {'condition': Math.min( Number((random_permanent.condition + .02).toFixed(2)), 1 )}});
				}
			}

			if (message)
				message = message + " They then comment on the quality of your permanent collection, and how well-kept it is.";

			else message = "You have met a preservationist who comments on the quality of your permanent collection, and how well-kept it is."
		}

		conditions_maxed_bonus = 0.4;
	}

	else {
		target_item = items.findOne({'owner' : Meteor.userId(), 'status' : {$in : ['claimed', 'displayed', 'permanent']}}, {sort: {'condition': 1}});
		conditions_maxed_bonus = 0.2;
	}

	if (target_item == undefined) {
		if (message)
			message += " Unfortunately, they don't see any items in your collection they can improve.";

		else message = "You have met a preservationist, but you don't currently own any works that can be refurbished.";

		return {'message' : message};
	}

	if (target_item.condition > .9) {
		if (message)
			message += " Unfortunately, they don't see any items in your collection they can improve. Then can only offer their gratitude.";

		else message = "You have met a preservationist, but you don't currently own any works that can be refurbished. Then can only offer their gratitude.";

		addXPChunkPercentage("preservationist (all items maxed)", Meteor.userId(), conditions_maxed_bonus);

		return {'message' : message};
	}

	var new_condition = Math.min(repair_amount + target_item.condition, 1)

	items.update(target_item._id, {$set: {'condition' : Number(new_condition)}}, function(error) {
        if (error)
            console.log(error.message);

        else {
        	calcMVP(Meteor.userId());
        	updateGalleryDetails(Meteor.userId());
        }
    });

	if (message)
		message = message + " Finally, they offer to refurbish one of your pieces. " + target_item.artwork_data.title + " by " + target_item.artwork_data.artist + " has increased in value.";
	
	else message = "You have met a preservationist who has offered to refurbish one of your pieces. " + target_item.artwork_data.title + " by " + target_item.artwork_data.artist + " has increased in value.";

	return {'message': message}
}

var artExpertInteraction = function(npc_object) {
	var roll_reduction;

	switch(npc_object.quality) {
		case 'bronze': roll_reduction = 1; break;
		case 'silver': roll_reduction = 2; break;
		case 'gold': roll_reduction = 3; break;
		case 'platinum': roll_reduction = 4; break;
		default: roll_reduction = 0; break;
	}

	var roll_count_min = 0;

	if (isOwnGallery(npc_object)) {
		roll_reduction += 2;

		if (procUniqueAttribute(Meteor.userId(), "XP_FOR_ZERO_COUNTS", undefined)) {
			var zero_count_items = items.find({'owner' : Meteor.userId(), 'status' : 'displayed', 'roll_count' : {$lt: 1}}).count();
			for (var i=0; i<zero_count_items; i++) {
				addXPChunkPercentage("XP_FOR_ZERO_COUNTS", Meteor.userId(), .1);
			}
		}

		if (procUniqueAttribute(Meteor.userId(), "DONOR_REROLL_DEDUCTION_BONUS", "Art Donor")) {
			roll_reduction *= 2;
		}

		if (procUniqueAttribute(Meteor.userId(), "NEGATIVE_ROLL_COUNTS", undefined)) {
			roll_count_min = -5;
		}
	}

	var highest_item = items.findOne({'owner' : Meteor.userId(), 'status' : {$in : ['claimed', 'displayed', 'permanent']}, 'roll_count' : {$gt : roll_count_min}}, {sort: {'roll_count': -1}});

	if (highest_item == undefined)
		return {'message' : "You have met an art expert, but you don't currently own any works that can be improved. Try re-rolling painting attributes to improve a piece's ratings."};

	var new_count;
	if (highest_item.roll_count - roll_reduction < roll_count_min)
		new_count = roll_count_min;

	else new_count = highest_item.roll_count - roll_reduction;

	items.update(highest_item._id, {$set: {'roll_count' : Number(new_count)}});

	var message = "You have met an art expert who recently attended one of your events and was impressed by your collection. As a result, they have been spreading the word about your gallery. " + highest_item.artwork_data.title + " by " + highest_item.artwork_data.artist + " has had its roll count reduced to " + new_count + ".";

	return {'message': message}
}

var getRandomItemForSale = function() {
	var tagged_items = items.find({'owner': Meteor.userId(), 'tags': {$in: ["for sale"]}, 'status': 'claimed'}).fetch();
	var random_index = Math.floor(Math.random() * tagged_items.length);
	return tagged_items[random_index];
}

var getRandomItemForSaleDisplayed = function() {
	var tagged_items = items.find({'owner': Meteor.userId(), 'tags': {$in: ["for sale"]}, 'status': {$in: ['displayed', 'permanent']}}).fetch();
	var random_index = Math.floor(Math.random() * tagged_items.length);
	return tagged_items[random_index];
}

var collectorInteraction = function(npc_object) {
	//TODO save interaction object to a DB, then return the id. This allows server-side verification that the offer was legitimate if the player accepts.
	var offer_multiplier;
	var offer_bonus = 0;
	var message = undefined;
	var xp_offer = false;
	var xp_chunk_percentage;
	var offer_amount;

	switch(npc_object.quality) {
		case 'bronze': offer_multiplier = 1; break;
		case 'silver': offer_multiplier = 1.1; break;
		case 'gold': offer_multiplier = 1.2; break;
		case 'platinum': offer_multiplier = 1.3; break;
		default: offer_multiplier = 0; break;
	}

	var collector_target = undefined; 

	if (isOwnGallery(npc_object) && procUniqueAttribute(Meteor.userId(), "COLLECTOR_DISPLAY_OFFER", undefined)) {
		collector_target = getRandomItemForSaleDisplayed();

		if (collector_target === undefined)
			collector_target = selectRandomPainting({'owner': Meteor.userId(), 'status': {$in: ['displayed', 'permanent']}});
	}

	else collector_target = getRandomItemForSale();

	if (collector_target == undefined)
		collector_target = selectRandomPainting({'owner': Meteor.userId(), 'status': "claimed"});

	if (collector_target) {
		if (isOwnGallery(npc_object)) {
			offer_multiplier += .3;

			if (procUniqueAttribute(Meteor.userId(), "GOOD_CONDITION_COLLECTOR_BONUS", undefined) && collector_target.condition > .8)
				offer_multiplier += .2;

			if (procUniqueAttribute(Meteor.userId(), "ART_COLLECTOR_ROLL_COUNT_BONUS", undefined) && collector_target.roll_count <= 0)
				offer_multiplier += .2;

			if (procUniqueAttribute(Meteor.userId(), "ART_COLLECTOR_SPECIAL_BONUS", undefined)) {
				if (collector_target.foil || collector_target.original || collector_target.lottery || collector_target.seasonal)
					offer_multiplier += .2;
			}

			if (procUniqueAttribute(Meteor.userId(), "ART_COLLECTOR_FINISH_RATING_BONUS", undefined)) {
				var high_finish_count = 0;
				var floor_finishes = Meteor.user().profile.gallery_finishes.owned.floor_finishes;
				var floor_finish_keys = Object.keys(floor_finishes);
				for (var i=0; i<floor_finish_keys; i++) {
					var key = floor_finish_keys[i];
					if (floor_finishes[key].xp_rating > .8)
						high_finish_count++;
				}

				var wall_finishes = Meteor.user().profile.gallery_finishes.owned.wall_finishes;
				var wall_finish_keys = Object.keys(wall_finishes);
				for (var i=0; i<wall_finish_keys; i++) {
					var key = wall_finish_keys[i];
					if (wall_finishes[key].xp_rating > .8)
						high_finish_count++;
				}

				var finish_bonus = high_finish_count * .02;
				offer_multiplier += Math.min(finish_bonus, .4);
			}

			if (procUniqueAttribute(Meteor.userId(), "ART_COLLECTOR_AUCTION_BONUS", undefined)) {
				var highest_value = 0;
				var value_multiplier = .6;
				items.find({'owner': Meteor.userId(), 'status': "auctioned"}).forEach(function(db_object) {
					highest_value = Math.max(getItemValue(db_object._id, "auction_min", Meteor.userId()) * value_multiplier, highest_value);
				})

				auctions.find({'_id': {$in: Meteor.user().profile.auction_data.winning}}).forEach(function(auction_object) {
					highest_value = Math.max(getItemValue(auction_object.item_id, "auction_min", Meteor.userId()) * value_multiplier, highest_value);
				});

				highest_value = Math.min(highest_value, 200000);

				offer_bonus += highest_value;
			}

			if (procUniqueAttribute(Meteor.userId(), "ART_COLLECTOR_XP_REWARD", "Art Enthusiast")) {
				xp_chunk_percentage = Math.min(.75 * offer_multiplier, 1);
				var xp_bonus = Math.min(offer_bonus, getXPChunk(Meteor.user().profile.level) * .4);
				offer_amount = Math.floor(xp_chunk_percentage * (getXPChunk(Meteor.user().profile.level) + xp_bonus));
				xp_offer = true;
			}

			if (procUniqueAttribute(Meteor.userId(), "COLLECTOR_DISPLAY_OFFER", undefined)) {
				if (xp_offer) {
					addXP(Meteor.userId(), offer_amount);
					logXPChunkPercentage("ART_COLLECTOR_XP_REWARD", Number(xp_chunk_percentage.toFixed(3)));
					message = "You have met an Art Collector, who was admiring " + collector_target.artwork_data.title + " by " + collector_target.artwork_data.artist + ", currently on display in your gallery. You have earned " + getCommaSeparatedValue(offer_amount) + "xp for their appreciation of the piece, and insist that you keep and maintain it for the world to enjoy.";
				}

				else {
					var donation_amount = Math.min(Math.floor((getItemValue(collector_target._id, "display", Meteor.userId()) * .2) * offer_multiplier) + offer_bonus, 800000);
					addFunds("COLLECTOR_DISPLAY_OFFER", Meteor.userId(), donation_amount);
					message = "You have met an Art Collector, who was admiring " + collector_target.artwork_data.title + " by " + collector_target.artwork_data.artist + ", currently on display in your gallery. They offer you $" + getCommaSeparatedValue(donation_amount) + " for their appreciation of the piece, and insist that you keep and maintain it for the world to enjoy.";
				}
			}

			if (procUniqueAttribute(Meteor.userId(), "COLLECTOR_FOR_SALE_OFFER", undefined)) {
				var multi_item_generator = {
			        'source': "COLLECTOR_FOR_SALE_OFFER",
			        'user_id': Meteor.userId(),
			        'quality': npc_object.quality,
			        'count': 2,
			        'status': "for_sale",
			        'foil_chance': getLootData().global_foil_chance,
			        'misprint_chance': getLootData().global_misprint_chance,
			        'xp_rating_min': 0,
			        'condition_min': 0
			    }

				generateItems(multi_item_generator);

				//if a message is already created by logic above, the collector offer is bypassed for money/xp, so return interaction
				if (message != undefined) {
					message += " They have also offered you some items from their collection, which can be found in the store."
				}		

				//else continue with message undefined, which will leave isOwnGallery block and proceed to actual offer
			}

			if (message != undefined)
				return {'message': message};
		}

		if (!xp_offer) {
			offer_amount = Math.floor(getItemValue(collector_target._id, "collector", Meteor.userId()) * offer_multiplier) + offer_bonus;
		}

		var offer_id = npc_data.insert({
			'owner': Meteor.userId(),
			'host': npc_object.owner_id,
			'timestamp': moment()._d.toISOString(),
			'type': "collector offer",
			'data': {
				'offer_amount': Math.floor(offer_amount),
				'item_id': collector_target._id,
				'xp_offer': xp_offer,
				'xp_chunk': xp_chunk_percentage
			}
		})

		if (isOwnGallery(npc_object) && procUniqueAttribute("COLLECTOR_FOR_SALE_OFFER", undefined)) {
			message = "They have also offered you a few items from their collection, which can be found in the store.";
		}

		return {'type': "collector_bonus", 'offer_id': offer_id, 'item': collector_target, 'message': message};
	}

	else {
		message = "You have met an Art Collector that would love to add to their collection, but you don't seem to have any paintings available.";
		return {'message': message}
	}
}

var artDealerInteraction = function(npc_object) {
	var drop_count = 4;
	var foil_chance = getLootData().global_foil_chance;
	var min_xp_rating = 0;

	if (isOwnGallery(npc_object)) {
		drop_count += 2;

		if (procUniqueAttribute(Meteor.userId(), "BONUS_DEALER_DONOR", undefined)) {
			drop_count += 1;
		}

		if (procUniqueAttribute(Meteor.userId(), "AUCTION_COUNT_DEALER_BONUS", "Market Expert")) {
			var auction_count = items.find({'owner': Meteor.userId(), 'status': "auctioned"}).count();
			auction_count += Meteor.user().profile.auction_data.watching.length;
			drop_count += Math.ceil(auction_count / 4);
		}

		if (procUniqueAttribute(Meteor.userId(), "DEALER_FOIL_BONUS", undefined)) {
			foil_chance *= 2;
		}

		if (procUniqueAttribute(Meteor.userId(), "DISPLAY_CONDITION_DEALER_BOOST", undefined)) {
			if (items.findOne({'owner': Meteor.userId(), 'status': "displayed", 'condition': {$lt: .7}}) == undefined) {
				drop_count += 1;
			}
		}

		if (procUniqueAttribute(Meteor.userId(), "DEALER_QUEST_ITEM_CHANCE", undefined)) {
			var quest_item_ids = [];
			quests.find({'owner_id': Meteor.userId()}).forEach(function(db_object) {
				var targets = db_object.target;
				for (var i=0; i<targets.length; i++) {
					if (quest_item_ids.indexOf(targets[i]) == -1)
						quest_item_ids.push(targets[i]);
				}
			});

			if (Math.random() < .2 && quest_item_ids.length) {
				var random_index = Math.floor(Math.random() * quest_item_ids.length);
				drop_count -= 1;

				var item_generator = {
                    'source': "dealer",
                    'user_id': Meteor.userId(),
                    'artwork_id': quest_item_ids[random_index],
                    'condition': undefined,
                    'xp_rating': undefined,
                    'foil_chance': foil_chance,
                    'seasonal': undefined,
                    'lottery': 0,
                    'original': false,
                    'misprint_chance': getLootData().global_misprint_chance,
                    'status': "for_sale",
                    'xp_rating_min': min_xp_rating,
                    'condition_min': 0
                }

				generateItemFromArtworkID(item_generator);
			}
		}
	}

	var multi_item_generator = {
        'source': "dealer",
        'user_id': Meteor.userId(),
        'quality': npc_object.quality,
        'count': drop_count,
        'status': "for_sale",
        'foil_chance': foil_chance,
        'misprint_chance': getLootData().global_misprint_chance,
        'xp_rating_min': min_xp_rating,
        'condition_min': 0
    }

	generateItems(multi_item_generator);

	var message = "You have met an Art Dealer who would like you to consider a few offers. Go to the store to view their inventory.";
	return {'message': message}
}

var galleryManagerInteraction = function(npc_object) {
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

var designerInteraction = function(npc_object) {
	var gallery_finish_count = gallery_finishes.find({'quality': npc_object.quality}).count();
	var random_index = Math.floor(Math.random() * gallery_finish_count);
	//random_index = 1; // for debugging
	var random_selection = gallery_finishes.findOne({'quality': npc_object.quality}, {skip: random_index});

	var user_object = Meteor.user();
	var category_string = (random_selection.type == "wall finish" ? "wall_finishes" : "floor_finishes");

	var designer_bonus = 0;

	if (isOwnGallery(npc_object)) {
		designer_bonus += .1;

		if (procUniqueAttribute(Meteor.userId(), "DESIGNER_ENTHUSIAST_BONUS", "Art Enthusiast")) {
			designer_bonus += .2
		}
	}
	
	if (user_object.profile.gallery_finishes.owned[category_string][random_selection._id] == undefined) {
		var user_finish_object = {
			'filename': random_selection.filename,
			'saturation': 1,
			'xp_rating': .1 + designer_bonus
		}

		var set_object = {};
		var array_selector_string = "profile.gallery_finishes.owned." + (random_selection.type == "wall finish" ? "wall_finishes." : "floor_finishes.") + random_selection._id;
		set_object[array_selector_string] = user_finish_object;
		Meteor.users.update(Meteor.userId(), {$set: set_object});
		var message = "You have met a designer, who has provided you with a new finish for your gallery!";
		return {'message': message, 'type': "designer_bonus", 'filename': random_selection.filename};
	}

	//user already owns that finish, increase rating
	else if (user_object.profile.gallery_finishes.owned[category_string][random_selection._id].xp_rating < 1){
		var existing_xp_rating = user_object.profile.gallery_finishes.owned[category_string][random_selection._id].xp_rating;

		var xp_rating_increase = .1 + designer_bonus;

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
			case 'bronze' : xp_chunk_percentage = .1; break;
			case 'silver' : xp_chunk_percentage = .12; break;
			case 'gold' : xp_chunk_percentage = .14; break;
			case 'platinum' : xp_chunk_percentage = .16; break;
		};

		xp_chunk_percentage += designer_bonus;

		var xp_chunk = getXPChunk(Meteor.user().profile.level);
		var xp_won = Math.floor(xp_chunk * xp_chunk_percentage);

		var message = "You have met a designer, who is impressed by one of the finishes in your collection. You have earned " + getCommaSeparatedValue(xp_won) + "xp!";

		addXP(Meteor.userId(), xp_won);
		logXPChunkPercentage("designer", xp_chunk_percentage);
		return {'message': message, 'type': "designer_bonus", 'filename': random_selection.filename};
	}
}

var generateTarget = function(default_target_count) {
	var target = [];

	for (var i=0; i<default_target_count; i++) {
		var rarity_rolled = JepLoot.catRoll(getSmartRarityMap(Meteor.user().profile.level, 0));

		if (rarity_rolled == "legendary" || rarity_rolled == "masterpiece")
			rarity_rolled = "rare";

		var rolled_id = getRandomArtworkIDFromRarity(rarity_rolled);

		while (target.indexOf(rolled_id) != -1) {
			rolled_id = getRandomArtworkIDFromRarity(rarity_rolled)
		}

		target.push(rolled_id);
	}

	return target;
}

var generateQuest = function(rarity, is_own_gallery) {
    var money = getAverageDropValue(Meteor.user().profile.level, 0) * 10;
    var player_level = Meteor.user().profile.level;

    var reward, reward_item, money_multiplier, xp_chunk_percentage;

	switch(rarity) {
		case 'common' :
			money_multiplier = 1;
			xp_chunk_percentage = 1.2;
			reward_item = undefined;
			break;

		case 'uncommon' : 
			money_multiplier = 1.2;
			xp_chunk_percentage = 1.4;
			reward_item = undefined;
			break;

		case 'rare' : 
			money_multiplier = 1.4;
			xp_chunk_percentage = 1.6;
			reward_item = undefined;
			break;

		case 'legendary' : 
			money_multiplier = 1.6;
			xp_chunk_percentage = 1.8;
			reward_item = {
				'rarity': "legendary",
				'foil': false
			} 
			break;

		case 'masterpiece' : 
			money_multiplier = 1.8;
			xp_chunk_percentage = 2;
			reward_item = {
				'rarity': "legendary",
				'foil': true
			} 
			break;

		default: return undefined;
	};

	reward = {
		'money': money * money_multiplier,
		'xp': Math.floor(getXPChunk(player_level) * xp_chunk_percentage),
		'xp_chunk_percentage': xp_chunk_percentage,
		'item': reward_item,
	}

	var target_count = 4;
	var min_requirement = 3;

	if (is_own_gallery) {
		if (procUniqueAttribute(Meteor.userId(), "QUEST_TARGET_REDUCTION", "Designer")) {
			min_requirement--;
		}

		if (procUniqueAttribute(Meteor.userId(), "QUEST_XP_BONUS", undefined)) {
			reward.xp = Math.floor(reward.xp * 1.5);
			reward.xp_chunk_percentage = Number((reward.xp_chunk_percentage * 1.5).toFixed(3));
		}

		if (procUniqueAttribute(Meteor.userId(), "MARKET_EXPERT_QUEST_BONUS", undefined)) {
			var auction_count = items.find({'owner': Meteor.userId(), 'status': "auctioned"}).count();
			auction_count += Meteor.user().profile.auction_data.winning.length;
			reward.money = Math.floor(reward.money * (1 + (auction_count * .08)));
		}
	}

	return {
		'owner_id': Meteor.userId(),
		'target': generateTarget(target_count),
		'reward': reward,
		'rarity': rarity,
		'min_requirement': min_requirement
	}

}

var historianInteraction = function(npc_object) {
	try {
		var max_quest_count = 8;
		var quest_cap_bypass = isOwnGallery(npc_object) && procUniqueAttribute(Meteor.userId(), "QUEST_CAP_BYPASS", undefined);
		if (quests.find({'owner_id': Meteor.userId()}).count() >= max_quest_count && !quest_cap_bypass) {
			var message = "You have men an art historian who is looking for a few specific items, but you currently have too many tasks on your schedule to help them.";
			return {'type': undefined, 'message': message};
		}
	
		var map_amplifier;
	
		switch(npc_object.quality) {
	        case 'bronze': map_amplifier = 0; break;
	        case 'silver': map_amplifier = .2; break;
	        case 'gold': map_amplifier = .4; break;
	        case 'platinum': map_amplifier = .8; break;
	        default: map_amplifier = 0; break;
		}
	
	    var rarity_roll = JepLoot.catRoll(getSmartRarityMap(Meteor.user().profile.level, map_amplifier));
	    var quest_object = generateQuest(rarity_roll, isOwnGallery(npc_object));
	    quests.insert(quest_object);
	
	    var message = "You have met an art historian who is looking for a few specific items and would like your help. Visit the quests area to see what they need and acquire the artwork listed to claim your reward.";
	
	    return {'type': "historian_bonus", 'quest': quest_object};
	}
	
	catch(error) {
		var message = "error: " + error.message;
		return {'message': message};
	}
}

var auctioneerInteraction = function(npc_object) {
	var user_object = Meteor.user();

	var market_expert_duration = 10; //minutes
	var market_expert_duration_extension = 5; // minutes
	var auction_count = 8;

	switch(npc_object.quality) {
		case 'bronze': 
			market_expert_duration += 2;
			market_expert_duration_extension += 2; 
			break;
        case 'silver': 
			market_expert_duration += 3;
			market_expert_duration_extension += 3; 
			break;
        case 'gold': 
			market_expert_duration += 4;
			market_expert_duration_extension += 4; 
			break;
        case 'platinum': 
			market_expert_duration += 5;
			market_expert_duration_extension += 5; 
			break;
        default: break;
	}

	if (isOwnGallery(npc_object)) {
		market_expert_duration = Math.floor(market_expert_duration * 2.5);
		market_expert_duration_extension = Math.floor(market_expert_duration_extension * 2.5);
		auction_count += 6;
	}

	var message;

	if (user_object.profile.market_expert.expiration < moment()._d.toISOString()) {
		var expiration_time = moment().add(market_expert_duration, 'minutes');
		Meteor.users.update(user_object._id, {$set: {
			'profile.market_expert.expiration': expiration_time._d.toISOString(),
		}});

		message = "You have met an auctioneer. They will help you identify in-demand items for the next " + market_expert_duration + " minutes (expires " + getTimeString(expiration_time) +  ").";
	}

	else {
		var new_expiration = moment(user_object.profile.market_expert.expiration).add(market_expert_duration_extension, 'minutes');
		Meteor.users.update(user_object._id, {$set: {
			'profile.market_expert.expiration': new_expiration._d.toISOString()
		}});

		message = "You have met another auctioneer. Your access to market analysis has been extended by " + market_expert_duration_extension + " minutes (expires " + getTimeString(new_expiration) + ").";
	}

	
	if (auctions.findOne({'viewer': Meteor.userId()}) == undefined && (npc_object.quality == "gold" || npc_object.quality == "platinum")) {
		var auction_price_adjustment = 4;
		if (procUniqueAttribute(Meteor.userId(), "PRIVATE_AUCTION_PRICE_REDUCTION", undefined)) {
				auction_price_adjustment = 2.5;
		}

		var multi_item_generator = {
	        'source': "private auction",
	        'user_id': "Artfunkel, Inc.",
	        'quality': npc_object.quality,
	        'count': auction_count,
	        'status': "claimed",
	        'foil_chance': getLootData().global_foil_chance,
	        'misprint_chance': getLootData().global_misprint_chance,
	        'xp_rating_min': 0,
	        'condition_min': 0
	    }

		var item_ids = generateItems(multi_item_generator);

		setTimeout("", 2);

		// private_auction_duration is instantiated in auction_methods.js
		items.find({'_id': {$in: item_ids}}).forEach(function(db_object) {
			createAuction(db_object._id, getItemObjectValue(db_object, "actual", undefined) * auction_price_adjustment, -1, private_auction_duration / 60000, Meteor.userId());
		})

		message += " They have also given you exclusive access to some items available in a private auction. Visit the auction house to make a bid."
	}

	return {'message': message};
}
